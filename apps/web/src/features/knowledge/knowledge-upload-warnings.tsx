import * as React from 'react';
import type { KnowledgeExtractionResponse } from '@voice-agent/contracts';

const WARNING_CLASS =
  'rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300';

/** Avisos da extração: nunca afirmar que todo o conteúdo do arquivo foi lido. */
export function KnowledgeUploadWarnings({
  preview,
}: {
  readonly preview: KnowledgeExtractionResponse;
}) {
  const { warnings, stats } = preview;
  return (
    <>
      {warnings.includes('DOCX_MAIN_BODY_ONLY') && (
        <p className={WARNING_CLASS}>
          Só o corpo principal do documento foi lido: cabeçalhos, rodapés, comentários, notas e
          imagens não entram.
        </p>
      )}
      {warnings.includes('PDF_PAGES_WITHOUT_TEXT') && (
        <p className={WARNING_CLASS} data-testid="kb-upload-pages-without-text">
          {stats.pagesWithoutText} de {stats.pages} páginas não tinham texto pesquisável (imagem ou
          digitalização) e NÃO foram extraídas. OCR não é suportado: o conteúdo dessas páginas não
          está na prévia.
        </p>
      )}
      {warnings.includes('PDF_TEXT_ORDER_APPROXIMATE') && (
        <p className={WARNING_CLASS}>
          Em PDF, a ordem do texto é aproximada: colunas e tabelas podem aparecer fora de ordem.
          Revise antes de confirmar.
        </p>
      )}
    </>
  );
}
