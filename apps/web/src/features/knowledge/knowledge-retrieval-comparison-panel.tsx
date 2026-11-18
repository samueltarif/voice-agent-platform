import * as React from 'react';
import { GitCompare, Loader2 } from 'lucide-react';
import { Button } from '@voice-agent/ui';
import { KnowledgeOperationAlert } from './knowledge-dialog-shell';
import { KnowledgeRetrievalResults } from './knowledge-retrieval-results';
import {
  AgentProjectionView,
  SuspiciousPassagesNotice,
} from './knowledge-retrieval-v2-admin-details';
import {
  useKnowledgeRetrievalComparison,
  type KnowledgeRetrievalComparisonState,
} from './use-knowledge-retrieval-comparison';
import type { KnowledgeRetrievalPreviewState } from './use-knowledge-retrieval-preview';
import { canCompareKnowledgeRetrieval } from './knowledge-permissions';

/**
 * Comparação ADMINISTRATIVA v1 × v2 (DEC-067, PR B1), só para OWNER/ADMIN.
 * Usa a pergunta e o escopo do teste acima. Os agentes continuam usando a
 * busca atual (v1); a v2 aparece aqui apenas para avaliação.
 */
export function KnowledgeRetrievalComparisonView(props: {
  readonly state: KnowledgeRetrievalComparisonState;
  readonly queryText: string;
  readonly agentId: string;
}) {
  const { state } = props;
  return (
    <section
      aria-labelledby="kb-compare-title"
      className="space-y-3 rounded-lg border border-dashed border-border/70 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="kb-compare-title" className="text-sm font-semibold text-foreground">
            Comparar busca atual × nova busca (administração)
          </h2>
          <p className="text-xs text-muted-foreground">
            Mesma pergunta e mesmo escopo do teste acima. Os agentes continuam usando a busca atual;
            a nova busca aparece aqui só para avaliação.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-[40px] gap-2"
          disabled={state.pending || !props.queryText.trim()}
          onClick={() => void state.run({ queryText: props.queryText, agentId: props.agentId })}
        >
          {state.pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <GitCompare className="h-4 w-4" aria-hidden="true" />
          )}
          Comparar
        </Button>
      </div>
      {state.failure && <KnowledgeOperationAlert failure={state.failure} />}
      {state.result && (
        <div className="grid gap-4 md:grid-cols-2" data-testid="kb-compare-results">
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-foreground">Busca atual (v1, em uso)</h3>
            <KnowledgeRetrievalResults result={state.result.v1} />
          </div>
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-foreground">Nova busca (v2, só avaliação)</h3>
            <KnowledgeRetrievalResults result={state.result.v2} />
            <AgentProjectionView projection={state.result.v2.agentProjection} />
            <SuspiciousPassagesNotice passages={state.result.v2.suspiciousPassages} />
          </div>
        </div>
      )}
    </section>
  );
}

/** Só OWNER/ADMIN veem a comparação (a autorização real é do BFF/API). */
export function KnowledgeRetrievalComparisonPanel(props: {
  readonly orgSlug: string;
  readonly role: string | undefined;
  readonly preview: Pick<KnowledgeRetrievalPreviewState, 'queryText' | 'agentId'>;
}) {
  const state = useKnowledgeRetrievalComparison(props.orgSlug);
  if (!canCompareKnowledgeRetrieval(props.role)) return null;
  return (
    <KnowledgeRetrievalComparisonView
      state={state}
      queryText={props.preview.queryText}
      agentId={props.preview.agentId}
    />
  );
}
