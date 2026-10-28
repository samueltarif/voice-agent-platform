/**
 * Parser CSV RFC 4180 mínimo e determinístico (aspas, aspas escapadas, vírgula
 * ou ponto e vírgula, CRLF/LF). Sem dependências e sem avaliar conteúdo: as
 * células são texto puro. Limites explícitos protegem contra entradas abusivas.
 */
export const CONTACT_CSV_LIMITS = {
  maxBytes: 2 * 1024 * 1024,
  maxDataRows: 10_000,
  maxColumns: 50,
  maxCellLength: 500,
} as const;

export type CsvParseResult =
  | { readonly ok: true; readonly header: string[]; readonly rows: string[][] }
  | {
      readonly ok: false;
      readonly reason: 'TOO_LARGE' | 'TOO_MANY_ROWS' | 'TOO_MANY_COLUMNS' | 'MALFORMED' | 'EMPTY';
    };

function detectDelimiter(firstLine: string): ',' | ';' {
  const commas = firstLine.split(',').length;
  const semicolons = firstLine.split(';').length;
  return semicolons > commas ? ';' : ',';
}

interface Cursor {
  readonly delimiter: string;
  rows: string[][];
  row: string[];
  cell: string;
  quoted: boolean;
}

function pushCell(c: Cursor): void {
  c.row.push(c.cell);
  c.cell = '';
}

function pushRow(c: Cursor): void {
  pushCell(c);
  if (!(c.row.length === 1 && c.row[0] === '')) c.rows.push(c.row);
  c.row = [];
}

function consumeQuoted(c: Cursor, text: string, i: number): number {
  if (text[i] !== '"') {
    c.cell += text[i];
    return i;
  }
  if (text[i + 1] === '"') {
    c.cell += '"';
    return i + 1;
  }
  c.quoted = false;
  return i;
}

/** Processa um caractere fora de aspas; devolve o novo índice ou -1 (malformado). */
function consumePlain(c: Cursor, text: string, i: number): number {
  const ch = text[i]!;
  if (ch === '"') {
    if (c.cell.length > 0) return -1;
    c.quoted = true;
  } else if (ch === c.delimiter) {
    pushCell(c);
  } else if (ch === '\n' || ch === '\r') {
    pushRow(c);
    return ch === '\r' && text[i + 1] === '\n' ? i + 1 : i;
  } else {
    c.cell += ch;
  }
  return i;
}

function tokenize(text: string, delimiter: string): string[][] | null {
  const c: Cursor = { delimiter, rows: [], row: [], cell: '', quoted: false };
  for (let i = 0; i < text.length; i += 1) {
    i = c.quoted ? consumeQuoted(c, text, i) : consumePlain(c, text, i);
    if (i < 0) return null;
  }
  if (c.quoted) return null;
  if (c.cell.length > 0 || c.row.length > 0) pushRow(c);
  return c.rows;
}

const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

export function parseContactCsv(text: string): CsvParseResult {
  if (new TextEncoder().encode(text).length > CONTACT_CSV_LIMITS.maxBytes) {
    return { ok: false, reason: 'TOO_LARGE' };
  }
  const withoutBom = text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text;
  const firstLine = withoutBom.split(/\r?\n/, 1)[0] ?? '';
  const rows = tokenize(withoutBom, detectDelimiter(firstLine));
  if (!rows) return { ok: false, reason: 'MALFORMED' };
  const [header, ...data] = rows;
  if (!header) return { ok: false, reason: 'EMPTY' };
  if (header.length > CONTACT_CSV_LIMITS.maxColumns)
    return { ok: false, reason: 'TOO_MANY_COLUMNS' };
  if (data.length > CONTACT_CSV_LIMITS.maxDataRows) return { ok: false, reason: 'TOO_MANY_ROWS' };
  return { ok: true, header: header.map((h) => h.trim()), rows: data };
}

/**
 * Neutraliza CSV/formula injection (OWASP) em QUALQUER célula exportada que
 * contenha dado fornecido pelo usuário: prefixa `'` quando a célula começa com
 * `=`, `+`, `-`, `@`, TAB ou CR, e aplica aspas RFC 4180.
 */
export function toSafeCsvCell(value: string): string {
  const neutralized = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${neutralized.replace(/"/g, '""')}"`;
}
