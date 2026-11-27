import { randomUUID } from 'node:crypto';
import type {
  AgentOutput,
  BookingProtocolDirective,
  SchedulingAgentPort,
  SchedulingAgentScope,
  SchedulingProtocolView,
  ToolExecutionContext,
  ToolExecutionResult,
  ToolPort,
} from '@voice-agent/contracts';
import { serverWorded, toolOutput, type SpeechInput } from './offline-simulation-outputs.js';
import { createSchedulingReplyFilter } from './scheduling-agent-tools.js';

/**
 * E2 PR 3 (DEC-075) — SIMULAÇÃO COMERCIAL OFFLINE integrada: o "modelo" é um
 * roteiro determinístico (sem IA, sem ligação, sem crédito); tudo o mais é
 * real — motor de ferramentas com a concessão, serviços canônicos e o
 * protocolo persistido.
 *
 * Auditoria consolidada (A1/A3/A6): TODA saída — inclusive texto livre do
 * modelo — passa por `authorizeOutput` no instante da emissão (estado
 * revalidado). Anúncios transacionais são só falas do servidor; o texto do
 * modelo autorizado ainda passa pelo filtro sempre ligado e é registrado como
 * fala do agente (anula confirmação pendente). Turnos do interlocutor têm id
 * do transporte: início e fim do MESMO turno.
 */

export type SimulationStep =
  | { readonly kind: 'lead'; readonly text: string }
  | { readonly kind: 'model'; readonly text: string }
  | { readonly kind: 'tool'; readonly toolName: string; readonly args?: unknown };

export interface TranscriptLine {
  readonly speaker: 'AGENT' | 'LEAD';
  /** `SERVER` = fala determinística do servidor; `MODEL` = texto livre autorizado e filtrado. */
  readonly source: 'SERVER' | 'MODEL' | 'LEAD';
  readonly text: string;
}

/** Saída recusada pelo servidor (nada foi falado). */
export interface WithheldOutput {
  readonly kind: AgentOutput['kind'];
  readonly reason: string;
}

export interface SimulationDeps {
  readonly port: SchedulingAgentPort;
  readonly scope: SchedulingAgentScope;
  readonly engine: ToolPort;
  readonly context: ToolExecutionContext;
}

export interface SimulationResult {
  readonly transcript: readonly TranscriptLine[];
  readonly toolResults: readonly ToolExecutionResult[];
  readonly withheld: readonly WithheldOutput[];
  readonly lastView: SchedulingProtocolView | null;
}

export class OfflineCommercialSimulation {
  private readonly transcript: TranscriptLine[] = [];
  private readonly toolResults: ToolExecutionResult[] = [];
  private readonly withheld: WithheldOutput[] = [];
  private lastView: SchedulingProtocolView | null = null;

  constructor(private readonly deps: SimulationDeps) {}

  async run(steps: readonly SimulationStep[]): Promise<SimulationResult> {
    for (const step of steps) await this.step(step);
    return {
      transcript: [...this.transcript],
      toolResults: [...this.toolResults],
      withheld: [...this.withheld],
      lastView: this.lastView,
    };
  }

  private async step(step: SimulationStep): Promise<void> {
    if (step.kind === 'lead') return this.leadSays(step.text);
    if (step.kind === 'model') return this.modelSays(step.text);
    await this.callTool(step.toolName, step.args ?? {});
  }

  /** Texto livre do modelo: autorizado AGORA, filtrado e registrado como fala do agente. */
  private async modelSays(text: string): Promise<void> {
    if ((await this.authorize({ kind: 'MODEL_TEXT' })) === false) return;
    const filter = createSchedulingReplyFilter();
    const pieces = text.split(/(?<=\s)/u).map((piece) => filter.push(piece));
    const spoken = (pieces.join('') + filter.flush()).trim();
    if (!spoken) return;
    await this.transport(null);
    this.transcript.push({ speaker: 'AGENT', source: 'MODEL', text: spoken });
  }

  private async callTool(toolName: string, rawArguments: unknown): Promise<void> {
    const invocation = { toolName, rawArguments, invocationId: randomUUID() };
    const result = await this.deps.engine.executeTool(invocation, this.deps.context);
    this.toolResults.push(result);
    if (result.status !== 'SUCCESS') return;
    const out = toolOutput(result.output);
    if (out) await this.emit(out.output, out.speech, out.transport);
  }

  private async leadSays(text: string): Promise<void> {
    this.transcript.push({ speaker: 'LEAD', source: 'LEAD', text });
    const turnId = `turn-${randomUUID()}`;
    await this.deps.port.recordLeadSpeechStarted(this.deps.scope, { turnId });
    const view = await this.deps.port.recordLeadUtterance(this.deps.scope, { turnId, text });
    this.lastView = view;
    for (const directive of view.directives) await this.onDirective(directive, view);
  }

  /** Reações às diretivas do protocolo (nunca decididas pelo modelo). */
  private async onDirective(directive: BookingProtocolDirective, view: SchedulingProtocolView) {
    switch (directive.kind) {
      case 'READ_BACK':
        return this.emit({ kind: 'READBACK', offerId: directive.offerId }, view.speech, {
          purpose: 'READBACK',
          listRevision: directive.listRevision,
          offerId: directive.offerId,
        });
      case 'ASK_CLARIFICATION':
        return view.optOutClarificationPending
          ? this.emit({ kind: 'OPT_OUT_QUESTION' }, view.speech, { purpose: 'OPT_OUT_QUESTION' })
          : this.emit({ kind: 'CLARIFICATION' }, view.speech);
      case 'REQUEST_NEW_LIST':
        return this.callTool('scheduling.find_slots', {});
      case 'BOOK':
        return this.callTool('scheduling.confirm_offer', {});
      case 'RECORD_OPT_OUT':
        return this.emit({ kind: 'OPT_OUT_CONFIRMATION' }, view.speech);
      default:
        return this.emit({ kind: 'NOTICE' }, view.speech);
    }
  }

  private async authorize(output: AgentOutput): Promise<string | null | false> {
    const decision = await this.deps.port.authorizeOutput(this.deps.scope, output);
    if (decision.allowed) return decision.speech;
    this.withheld.push({ kind: output.kind, reason: decision.reason });
    return false;
  }

  /** Fala do servidor: revalidada no instante da emissão; o texto do servidor prevalece. */
  private async emit(output: AgentOutput, text: string | null, speech?: SpeechInput) {
    if (!text && !serverWorded(output)) return;
    const decision = await this.authorize(output);
    if (decision === false) return;
    const spoken = decision ?? text;
    if (!spoken) return;
    if (speech) await this.transport(speech);
    this.transcript.push({ speaker: 'AGENT', source: 'SERVER', text: spoken });
  }

  /** Fala completa pelo transporte simulado: início e conclusão da MESMA geração. */
  private async transport(input: SpeechInput | null): Promise<void> {
    const generationId = `sim-${randomUUID()}`;
    const { port, scope } = this.deps;
    const started = input ?? { purpose: 'AGENT' as const };
    await port.recordSpeech(scope, { type: 'SPEECH_STARTED', generationId, ...started } as never);
    await port.recordSpeech(scope, { type: 'SPEECH_COMPLETED', generationId });
  }
}
