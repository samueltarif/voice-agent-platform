import * as React from 'react';
import { KNOWLEDGE_DOCUMENT_STATUSES } from '@voice-agent/contracts';
import { STATUS_LABELS, KNOWLEDGE_LIMITS } from './knowledge-labels';
import type { KnowledgeFilters } from './knowledge-document-list-types';

export const FILTER_FIELD =
  'h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function KnowledgeFilterBar({
  filters,
  onChange,
}: {
  readonly filters: KnowledgeFilters;
  readonly onChange: (f: KnowledgeFilters) => void;
}) {
  // Coleção: commit no blur/Enter para não disparar uma requisição por tecla.
  const [draft, setDraft] = React.useState(filters.collection);
  React.useEffect(() => setDraft(filters.collection), [filters.collection]);
  const commit = () => {
    if (draft.trim() !== filters.collection) onChange({ ...filters, collection: draft.trim() });
  };
  return (
    <form
      role="search"
      aria-label="Filtrar documentos"
      className="grid gap-3 sm:grid-cols-2 lg:max-w-xl"
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <div className="space-y-1.5">
        <label htmlFor="kb-filter-status" className="text-xs font-semibold text-foreground">
          Status
        </label>
        <select
          id="kb-filter-status"
          className={`${FILTER_FIELD} w-full`}
          value={filters.status}
          onChange={(e) =>
            onChange({ ...filters, status: e.target.value as KnowledgeFilters['status'] })
          }
        >
          <option value="">Todos</option>
          {KNOWLEDGE_DOCUMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="kb-filter-collection" className="text-xs font-semibold text-foreground">
          Coleção
        </label>
        <input
          id="kb-filter-collection"
          className={`${FILTER_FIELD} w-full`}
          value={draft}
          maxLength={KNOWLEDGE_LIMITS.collection}
          placeholder="Ex.: suporte"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
        />
      </div>
    </form>
  );
}
