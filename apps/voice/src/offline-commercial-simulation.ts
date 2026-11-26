import { randomUUID } from 'node:crypto';
import type {
  BookingProtocolDirective,
  SchedulingAgentPort,
  SchedulingAgentScope,
  SchedulingProtocolView,
  ToolExecutionContext,
  ToolExecutionResult,
  ToolPort,
} from '@voice-agent/contracts';
import type { SchedulingReplyGuard } from './scheduling-agent-tools.js';

/**
 * E2 PR 3 (DEC-075) — SIMULAÇÃO COMERCIAL OFFLINE integrada: o "modelo" é um
 * roteiro determinístico (sem IA, sem ligação, sem crédito); tudo o mais é
 * real — motor de ferramentas com a concessão, serviços canônicos e o
 * protocolo persistido. O roteiro só pode: falar texto livre (que passa pela
 * guarda de saída), chamar ferramentas (que passam pelo motor) e o
 * interlocutor falar (eventos do harness). As reações às diretivas do
 * protocolo (apresentar, reler, marcar, perguntar) são do harness.
 */

export type SimulationStep =
  | { readonly kind: 'lead'; readonly text: string }
  | { readonly kind: 'model'; readonly text: string }
  | { readonly kind: 'tool'; readonly toolName: string; readonly args?: unknown };

export interface TranscriptLine {
  readonly speaker: 'AGENT' | 'LEAD';
  /** `SERVER` = fala determinística do servidor; `MODEL` = texto livre já filtrado. */
  readonly source: 'SERVER' | 'MODEL' | 'LEAD';
  readonly text: string;
}

export interface SimulationDeps {
  readonly port: SchedulingAgentPort;
  readonly scope: SchedulingAgentScope;
  readonly engine: ToolPort;
  readonly context: ToolExecutionContext;
  readonly guard: SchedulingReplyGuard;
}

export interface SimulationResult {
  readonly transcript: readonly TranscriptLine[];
  readonly toolResults: readonly ToolExecutionResult[];
  readonly lastView: SchedulingProtocolView | null;
}

type SpeechInput =
  | {
      readonly purpose: 'PRESENTATION' | 'READBACK';
      readonly listRevision: number;
      readonly offerId?: string;
    }
  | { readonly purpose: 'OPT_OUT_QUESTION' };

const speechOf = (output: unknown): string | null => {
  const speech = (output as { speech?: unknown } | null)?.speech;
  return typeof speech === 'string' ? speech : null;
};

export class OfflineCommercialSimulation {
  private readonly transcript: TranscriptLine[] = [];
  private readonly toolResults: ToolExecutionResult[] = [];
  private lastView: SchedulingProtocolView | null = null;

  constructor(private readonly deps: SimulationDeps) {}

  async run(steps: readonly SimulationStep[]): Promise<SimulationResult> {
    for (const step of steps) await this.step(step);
    return {
      transcript: [...this.transcript],
      toolResults: [...this.toolResults],
      lastView: this.lastView,
    };
  }

  private async step(step: SimulationStep): Promise<void> {
    if (step.kind === 'lead') return this.leadSays(step.text);
    if (step.kind === 'model') return this.modelSays(step.text);
    await this.callTool(step.toolName, step.args ?? {});
  }

  /** Texto livre do modelo, em pedaços, pela guarda de streaming (A5). */
  private async modelSays(text: string): Promise<void> {
    const filter = this.deps.guard.createReplyFilter();
    const spoken =
      text
        .split(/(?<=\s)/u)
        .map((piece) => filter.push(piece))
        .join('') + filter.flush();
    if (spoken.trim())
      this.transcript.push({ speaker: 'AGENT', source: 'MODEL', text: spoken.trim() });
  }

  private async callTool(toolName: string, rawArguments: unknown): Promise<unknown> {
    const invocation = { toolName, rawArguments, invocationId: randomUUID() };
    const result = await this.deps.engine.executeTool(invocation, this.deps.context);
    this.toolResults.push(result);
    if (result.status !== 'SUCCESS') return null;
    const output = result.output as { status?: string; listRevision?: number };
    if (output.status === 'OFFERED' && typeof output.listRevision === 'number') {
      await this.speak(speechOf(output), {
        purpose: 'PRESENTATION',
        listRevision: output.listRevision,
      });
    } else {
      this.say(speechOf(output));
    }
    return output;
  }

  private async leadSays(text: string): Promise<void> {
    this.transcript.push({ speaker: 'LEAD', source: 'LEAD', text });
    await this.deps.port.recordLeadSpeechStarted(this.deps.scope);
    const view = await this.deps.port.recordLeadUtterance(this.deps.scope, text);
    this.lastView = view;
    await this.react(view);
  }

  /** Reações do harness às diretivas do protocolo (nunca decididas pelo modelo). */
  private async react(view: SchedulingProtocolView): Promise<void> {
    for (const directive of view.directives) await this.onDirective(directive, view);
  }

  private async onDirective(directive: BookingProtocolDirective, view: SchedulingProtocolView) {
    switch (directive.kind) {
      case 'READ_BACK':
        return this.speak(view.speech, {
          purpose: 'READBACK',
          listRevision: directive.listRevision,
          offerId: directive.offerId,
        });
      case 'ASK_CLARIFICATION':
        return view.optOutClarificationPending
          ? this.speak(view.speech, { purpose: 'OPT_OUT_QUESTION' })
          : this.say(view.speech);
      case 'REQUEST_NEW_LIST':
        return view.optOutClarificationPending
          ? undefined
          : void (await this.callTool('scheduling.find_slots', {}));
      case 'BOOK':
        return void (await this.callTool('scheduling.confirm_offer', {}));
      default:
        return this.say(view.speech);
    }
  }

  private say(text: string | null): void {
    if (text) this.transcript.push({ speaker: 'AGENT', source: 'SERVER', text });
  }

  /** Fala completa pelo transporte simulado: início e conclusão da MESMA geração. */
  private async speak(text: string | null, input: SpeechInput): Promise<void> {
    if (!text) return;
    const generationId = `sim-${randomUUID()}`;
    const { port, scope } = this.deps;
    await port.recordSpeech(scope, { type: 'SPEECH_STARTED', generationId, ...input } as never);
    await port.recordSpeech(scope, { type: 'SPEECH_COMPLETED', generationId });
    this.say(text);
  }
}
