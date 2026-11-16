import * as React from 'react';
import { Loader2, Search } from 'lucide-react';
import { Button, Input } from '@voice-agent/ui';
import type { KnowledgeRetrievalPreview } from '@voice-agent/contracts';
import type { OrganizationAgentOption } from '../../lib/knowledge/knowledge-document-management-client';
import { KnowledgeOperationAlert } from './knowledge-dialog-shell';
import { SOURCE_TYPE_LABELS } from './knowledge-labels';
import {
  ORGANIZATION_SCOPE,
  type KnowledgeRetrievalPreviewState,
} from './use-knowledge-retrieval-preview';

const SELECT =
  'h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function PreviewResults({ result }: { readonly result: KnowledgeRetrievalPreview }) {
  if (result.hits.length === 0) {
    return (
      <p role="status" className="text-xs text-muted-foreground">
        Nenhum trecho encontrado. O agente não teria informação dos documentos para responder a esta
        pergunta.
      </p>
    );
  }
  return (
    <div className="space-y-2" data-testid="kb-preview-results">
      <p className="text-[11px] text-muted-foreground">
        Termos usados: <span className="font-mono">{result.terms.join(', ')}</span>
        {result.truncated ? ' · há mais trechos além destes' : ''}
      </p>
      <ol className="space-y-2">
        {result.hits.map((hit, i) => (
          <li key={hit.citationId} className="rounded-md border border-border/70 bg-card p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
              <span className="font-semibold text-foreground">
                {`${i + 1}. ${hit.documentTitle}`}
              </span>
              <span className="text-muted-foreground">
                {`${SOURCE_TYPE_LABELS[hit.sourceType]} · trecho ${hit.chunkOrdinal + 1} · relevância ${hit.score.toFixed(2)}`}
              </span>
            </div>
            <blockquote className="mt-2 whitespace-pre-wrap break-words border-l-2 border-border pl-3 text-xs text-foreground">
              {hit.excerpt}
            </blockquote>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Teste OFFLINE da recuperação (DEC-055): mostra os trechos que o agente receberia.
 * Não há IA, conversa nem chamada. O texto é exibido como dado (escapado pelo React).
 */
export function KnowledgeRetrievalPreviewPanel(props: {
  readonly state: KnowledgeRetrievalPreviewState;
  readonly agents: readonly OrganizationAgentOption[];
}) {
  const { state } = props;
  const active = props.agents.filter((a) => a.status === 'ACTIVE');
  return (
    <section
      aria-labelledby="kb-preview-title"
      className="space-y-3 rounded-lg border border-border/70 p-4"
    >
      <div>
        <h2 id="kb-preview-title" className="text-sm font-semibold text-foreground">
          Testar recuperação (sem IA)
        </h2>
        <p className="text-xs text-muted-foreground">
          Mostra os trechos dos documentos que o agente receberia para a pergunta. Nenhuma IA,
          conversa ou chamada é usada; o agente ainda não consulta estes trechos em chamadas reais.
        </p>
      </div>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void state.run();
        }}
      >
        <label htmlFor="kb-preview-query" className="sr-only">
          Pergunta
        </label>
        <Input
          id="kb-preview-query"
          className="h-10 flex-1 text-sm"
          placeholder="Ex.: Quais transmissores de pressão a empresa oferece?"
          value={state.queryText}
          maxLength={500}
          onChange={(e) => state.setQueryText(e.target.value)}
        />
        <label htmlFor="kb-preview-agent" className="sr-only">
          Escopo
        </label>
        <select
          id="kb-preview-agent"
          className={SELECT}
          value={state.agentId}
          onChange={(e) => state.setAgentId(e.target.value)}
        >
          <option value={ORGANIZATION_SCOPE}>Todos os documentos (visão administrativa)</option>
          {active.map((a) => (
            <option key={a.id} value={a.id}>
              {`Como o agente ${a.name}`}
            </option>
          ))}
        </select>
        <Button
          type="submit"
          size="sm"
          className="min-h-[40px] gap-2"
          disabled={state.pending || !state.queryText.trim()}
        >
          {state.pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="h-4 w-4" aria-hidden="true" />
          )}
          Buscar
        </Button>
      </form>
      {state.failure && <KnowledgeOperationAlert failure={state.failure} />}
      {state.result && <PreviewResults result={state.result} />}
    </section>
  );
}
