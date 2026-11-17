import * as React from 'react';
import type { KnowledgeCommercialAspect, KnowledgeRetrievalPreview } from '@voice-agent/contracts';
import { SOURCE_TYPE_LABELS } from './knowledge-labels';

/** Termos da pergunta sem nenhuma menção nos documentos: não há evidência sobre eles. */
function UnmatchedNotice({ terms }: { readonly terms: readonly string[] | undefined }) {
  if (!terms || terms.length === 0) return null;
  return (
    <p
      role="status"
      data-testid="kb-preview-unmatched"
      className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300"
    >
      {`Sem menção nos documentos: ${terms.join(', ')}. O agente não deve afirmar que a empresa oferece isso.`}
    </p>
  );
}

const ASPECT_LABELS: Readonly<Record<KnowledgeCommercialAspect, string>> = {
  PRICE: 'preço',
  LEAD_TIME: 'prazo',
  STOCK: 'estoque',
  PAYMENT: 'condição de pagamento',
  WARRANTY: 'garantia',
};

/** Só v2: aspectos comerciais pedidos sem valor explícito nas evidências diretas. */
function AspectsNotice(props: {
  readonly aspects: readonly KnowledgeCommercialAspect[] | undefined;
}) {
  if (!props.aspects || props.aspects.length === 0) return null;
  const names = props.aspects.map((a) => ASPECT_LABELS[a]).join(', ');
  return (
    <p
      role="status"
      data-testid="kb-preview-aspects"
      className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300"
    >
      {`Não informado nos documentos: ${names}. O agente não deve inventar esses dados.`}
    </p>
  );
}

function hitMeta(hit: KnowledgeRetrievalPreview['hits'][number]): string {
  const base = `${SOURCE_TYPE_LABELS[hit.sourceType]} · trecho ${hit.chunkOrdinal + 1} · relevância ${hit.score.toFixed(2)}`;
  return hit.relevance === 'CONTEXT' ? `${base} · contexto geral (não menciona o item)` : base;
}

export function KnowledgeRetrievalResults({
  result,
}: {
  readonly result: KnowledgeRetrievalPreview;
}) {
  if (result.hits.length === 0) {
    return (
      <>
        <UnmatchedNotice terms={result.unmatchedTerms} />
        <AspectsNotice aspects={result.aspectsNotFound} />
        <p role="status" className="text-xs text-muted-foreground">
          Nenhum trecho encontrado. O agente não teria informação dos documentos para responder a
          esta pergunta.
        </p>
      </>
    );
  }
  return (
    <div className="space-y-2" data-testid="kb-preview-results">
      <UnmatchedNotice terms={result.unmatchedTerms} />
      <AspectsNotice aspects={result.aspectsNotFound} />
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
              <span className="text-muted-foreground">{hitMeta(hit)}</span>
            </div>
            {hit.passageHeading && (
              <p className="mt-1 text-[11px] text-muted-foreground">{`Seção: ${hit.passageHeading}`}</p>
            )}
            <blockquote className="mt-2 whitespace-pre-wrap break-words border-l-2 border-border pl-3 text-xs text-foreground">
              {hit.excerpt}
            </blockquote>
          </li>
        ))}
      </ol>
    </div>
  );
}
