/** Item de texto do pdf.js (`getTextContent`); marcações sem `str` são ignoradas. */
interface PdfTextItem {
  readonly str: string;
  readonly hasEOL?: boolean;
  readonly transform?: readonly number[];
}

const isTextItem = (item: unknown): item is PdfTextItem =>
  typeof (item as { str?: unknown }).str === 'string';

/** Mudou de linha (coordenada Y) sem `hasEOL` ⇒ também quebra. */
function changedLine(previousY: number | undefined, y: number | undefined): boolean {
  return previousY !== undefined && y !== undefined && Math.abs(y - previousY) > 1;
}

/** Texto de um item, precedido de quebra se ele começa uma nova linha. */
function itemText(item: PdfTextItem, out: string, previousY: number | undefined): string {
  const y = item.transform?.[5];
  const lineBreak = out !== '' && !out.endsWith('\n') && changedLine(previousY, y);
  return `${lineBreak ? '\n' : ''}${item.str}${item.hasEOL ? '\n' : ''}`;
}

/**
 * Texto de UMA página na ordem do conteúdo: `hasEOL` e mudança de linha viram
 * quebra. A ordem de leitura de PDF (colunas, tabelas) é aproximada.
 */
export function assemblePdfPageText(items: readonly unknown[]): string {
  let out = '';
  let previousY: number | undefined;
  for (const item of items.filter(isTextItem)) {
    out += itemText(item, out, previousY);
    previousY = item.transform?.[5] ?? previousY;
  }
  return out;
}

/** Caracteres visíveis (sem espaços): mede se a página tem texto de verdade. */
export const visibleChars = (text: string) => text.replace(/\s+/g, '').length;
