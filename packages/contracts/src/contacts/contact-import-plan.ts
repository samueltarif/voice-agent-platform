import { z } from 'zod';
import { CONTACT_CSV_LIMITS, parseContactCsv, toSafeCsvCell } from './contact-csv-parser.js';
import {
  normalizeContactPhone,
  type ContactPhoneRejectionReason,
} from './contact-phone-normalization.js';

const columnNameSchema = z.string().trim().min(1).max(64);

/** Mapeamento flexível de colunas (por nome do cabeçalho). */
export const contactCsvMappingSchema = z
  .object({
    phoneColumn: columnNameSchema,
    nameColumn: columnNameSchema.optional(),
    variableColumns: z.array(columnNameSchema).max(20).default([]),
  })
  .strict();
export type ContactCsvMapping = z.input<typeof contactCsvMappingSchema>;

/** Corpo HTTP da importação (API e BFF validam o MESMO schema). */
export const contactImportRequestSchema = z
  .object({
    csv: z.string().min(1).max(CONTACT_CSV_LIMITS.maxBytes),
    mapping: contactCsvMappingSchema,
  })
  .strict();
export type ContactImportRequest = z.infer<typeof contactImportRequestSchema>;

export type ContactImportRowRejection =
  ContactPhoneRejectionReason | 'DUPLICATE_IN_FILE' | 'CELL_TOO_LONG' | 'COLUMN_COUNT_MISMATCH';

export interface PlannedContact {
  readonly rowNumber: number;
  readonly phoneE164: string;
  readonly displayName: string | null;
  readonly variables: Readonly<Record<string, string>>;
}

export interface RejectedContactRow {
  readonly rowNumber: number;
  readonly reason: ContactImportRowRejection;
  readonly rawPhone: string;
}

export type ContactImportPlan =
  | {
      readonly ok: true;
      readonly accepted: readonly PlannedContact[];
      readonly rejected: readonly RejectedContactRow[];
    }
  | { readonly ok: false; readonly reason: string };

function columnIndex(header: string[], name: string | undefined): number | null {
  if (name === undefined) return null;
  const index = header.findIndex((h) => h.toLowerCase() === name.trim().toLowerCase());
  return index >= 0 ? index : -1;
}

interface Columns {
  readonly phone: number;
  readonly name: number | null;
  readonly variables: ReadonlyArray<readonly [string, number]>;
  readonly width: number;
}

function resolveColumns(
  header: string[],
  mapping: z.infer<typeof contactCsvMappingSchema>,
): Columns | null {
  const phone = columnIndex(header, mapping.phoneColumn) ?? -1;
  const name = columnIndex(header, mapping.nameColumn);
  const variables = mapping.variableColumns.map((v) => [v, columnIndex(header, v) ?? -1] as const);
  if (phone === -1 || name === -1 || variables.some(([, i]) => i === -1)) return null;
  return { phone, name, variables, width: header.length };
}

function rowShapeRejection(row: string[], cols: Columns): ContactImportRowRejection | null {
  if (row.length !== cols.width) return 'COLUMN_COUNT_MISMATCH';
  if (row.some((cell) => cell.length > CONTACT_CSV_LIMITS.maxCellLength)) return 'CELL_TOO_LONG';
  return null;
}

interface RowInput {
  readonly row: string[];
  readonly rowNumber: number;
  readonly cols: Columns;
  readonly seen: Set<string>;
}

function planRow({ row, rowNumber, cols, seen }: RowInput): PlannedContact | RejectedContactRow {
  const rawPhone = row[cols.phone] ?? '';
  const shape = rowShapeRejection(row, cols);
  if (shape) return { rowNumber, reason: shape, rawPhone };
  const phone = normalizeContactPhone(rawPhone);
  if (!phone.ok) return { rowNumber, reason: phone.reason, rawPhone };
  if (seen.has(phone.e164)) return { rowNumber, reason: 'DUPLICATE_IN_FILE', rawPhone };
  seen.add(phone.e164);
  const name = cols.name === null ? '' : (row[cols.name] ?? '').trim();
  const variables = Object.fromEntries(cols.variables.map(([k, i]) => [k, (row[i] ?? '').trim()]));
  return { rowNumber, phoneE164: phone.e164, displayName: name || null, variables };
}

/**
 * CSV + mapeamento → plano determinístico: primeira ocorrência de cada E.164
 * vence; demais linhas viram `DUPLICATE_IN_FILE`. `rowNumber` é a linha de
 * dados 1-based (cabeçalho excluído). Nenhum efeito colateral.
 */
export function planContactImport(csv: string, rawMapping: ContactCsvMapping): ContactImportPlan {
  const mapping = contactCsvMappingSchema.safeParse(rawMapping);
  if (!mapping.success) return { ok: false, reason: 'INVALID_MAPPING' };
  const parsed = parseContactCsv(csv);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  const cols = resolveColumns(parsed.header, mapping.data);
  if (!cols) return { ok: false, reason: 'MAPPED_COLUMN_NOT_FOUND' };
  const seen = new Set<string>();
  const accepted: PlannedContact[] = [];
  const rejected: RejectedContactRow[] = [];
  parsed.rows.forEach((row, index) => {
    const outcome = planRow({ row, rowNumber: index + 1, cols, seen });
    if ('reason' in outcome) rejected.push(outcome);
    else accepted.push(outcome);
  });
  return { ok: true, accepted, rejected };
}

/** Relatório CSV das linhas rejeitadas, seguro contra formula injection. */
export function renderRejectedRowsCsv(rows: readonly RejectedContactRow[]): string {
  const lines = rows.map((r) =>
    [String(r.rowNumber), r.reason, r.rawPhone].map(toSafeCsvCell).join(','),
  );
  return [['row', 'reason', 'phone'].map(toSafeCsvCell).join(','), ...lines].join('\r\n');
}
