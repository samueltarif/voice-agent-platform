import * as React from 'react';
import { Badge } from '@voice-agent/ui';
import type {
  SimulatedKnowledgeEvidence,
  SimulatedKnowledgeTurn,
  SimulatedKnowledgeTurnOutcome,
} from '@voice-agent/contracts';

const NOTICE: Readonly<
  Record<Exclude<SimulatedKnowledgeTurnOutcome, 'ANSWERED_WITH_EVIDENCE'>, string>
> = {
  NO_EVIDENCE:
    'Sem evidência nos documentos: o agente não deve afirmar que a empresa oferece o que foi perguntado.',
  TOOL_NOT_ENABLED:
    'A ferramenta "Base de Conhecimento" (knowledge.search) não está na versão publicada. Habilite-a no rascunho e publique uma nova versão.',
  TOOL_FAILED: 'A consulta aos documentos falhou. Tente de novo em instantes.',
};

const NOTICE_STYLE: Readonly<Record<keyof typeof NOTICE, string>> = {
  NO_EVIDENCE:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300',
  TOOL_NOT_ENABLED: 'border-border bg-muted/40 text-muted-foreground',
  TOOL_FAILED:
    'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300',
};

function EvidenceItem({
  item,
  n,
}: {
  readonly item: SimulatedKnowledgeEvidence;
  readonly n: number;
}) {
  const direct = item.relevance === 'DIRECT';
  return (
    <li
      data-testid={`simulator-evidence-${item.relevance}`}
      className="rounded-md border border-border/70 bg-card p-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="font-semibold text-foreground">{`[${n}] ${item.documentTitle}`}</span>
        <Badge variant={direct ? 'success' : 'warning'} className="w-fit">
          {direct ? 'Evidência direta' : 'Contexto geral — não confirma o item'}
        </Badge>
      </div>
      <blockquote className="mt-1 whitespace-pre-wrap break-words border-l-2 border-border pl-2 text-xs text-foreground">
        {item.excerpt}
      </blockquote>
    </li>
  );
}

/** Um turno: pergunta do usuário e a resposta determinística do servidor, com as fontes. */
export function SimulatorConversationTurn(props: {
  readonly question: string;
  readonly turn: SimulatedKnowledgeTurn;
}) {
  const { turn } = props;
  return (
    <li className="space-y-2" data-testid={`simulator-turn-${turn.outcome}`}>
      <p className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap break-words rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground">
        {props.question}
      </p>
      <div className="max-w-[95%] space-y-2 rounded-lg border border-border/70 bg-muted/30 p-3">
        <p className="text-[11px] font-medium text-muted-foreground">
          Resposta simulada (determinística, sem IA)
        </p>
        {turn.outcome !== 'ANSWERED_WITH_EVIDENCE' && (
          <p
            role="status"
            data-testid="simulator-turn-notice"
            className={`rounded-md border px-2 py-1 text-xs ${NOTICE_STYLE[turn.outcome]}`}
          >
            {NOTICE[turn.outcome]}
          </p>
        )}
        <p
          data-testid="simulator-reply"
          className="whitespace-pre-wrap break-words text-xs text-foreground"
        >
          {turn.replyText}
        </p>
        {turn.evidence.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-foreground">Fontes utilizadas</p>
            <ol className="space-y-1">
              {turn.evidence.map((item, i) => (
                <EvidenceItem key={item.citationId} item={item} n={i + 1} />
              ))}
            </ol>
          </div>
        )}
        {turn.unmatchedTerms.length > 0 && (
          <p data-testid="simulator-unmatched" className="text-[11px] text-muted-foreground">
            {`Sem menção nos documentos: ${turn.unmatchedTerms.join(', ')}`}
          </p>
        )}
      </div>
    </li>
  );
}
