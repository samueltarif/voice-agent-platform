import * as React from 'react';
import { KNOWLEDGE_SOURCE_TYPES, type KnowledgeSourceType } from '@voice-agent/contracts';
import { SOURCE_TYPE_LABELS } from './knowledge-labels';
import type { KnowledgeUploadState } from './use-knowledge-upload';

const FORMAT_LABELS = { TXT: 'Texto (.txt)', MARKDOWN: 'Markdown', DOCX: 'Word (.docx)' } as const;

/**
 * Pré-visualização como TEXTO PURO: o React escapa o conteúdo e nada é
 * interpretado como HTML ou Markdown. O usuário revisa antes de confirmar.
 */
export function KnowledgeUploadPreview({ upload }: { readonly upload: KnowledgeUploadState }) {
  const preview = upload.preview;
  if (!preview) return null;
  const busy = upload.phase === 'confirming';
  return (
    <div className="space-y-3" data-testid="kb-upload-preview">
      <p className="text-xs text-muted-foreground">
        {FORMAT_LABELS[preview.format]} · {preview.stats.chars.toLocaleString('pt-BR')} caracteres ·{' '}
        {preview.stats.lines.toLocaleString('pt-BR')} linhas. Nada foi salvo ainda.
      </p>
      {preview.warnings.includes('DOCX_MAIN_BODY_ONLY') && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
          Só o corpo principal do documento foi lido: cabeçalhos, rodapés, comentários, notas e
          imagens não entram.
        </p>
      )}
      <label className="block space-y-1 text-xs font-medium" htmlFor="kb-upload-title">
        <span>Título</span>
        <input
          id="kb-upload-title"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[44px]"
          value={upload.title}
          maxLength={200}
          disabled={busy}
          onChange={(e) => upload.setTitle(e.target.value)}
        />
      </label>
      <label className="block space-y-1 text-xs font-medium" htmlFor="kb-upload-source">
        <span>Tipo de origem</span>
        <select
          id="kb-upload-source"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[44px]"
          value={upload.sourceType}
          disabled={busy}
          onChange={(e) => upload.setSourceType(e.target.value as KnowledgeSourceType)}
        >
          {KNOWLEDGE_SOURCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {SOURCE_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      <pre
        data-testid="kb-upload-text"
        aria-label="Texto extraído do arquivo"
        className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3 text-xs"
      >
        {preview.text}
      </pre>
    </div>
  );
}
