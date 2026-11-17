import { and, asc, count, desc, eq, or, sql, type SQL } from 'drizzle-orm';
import {
  KNOWLEDGE_ACCENTED_CHARS,
  KNOWLEDGE_PLAIN_CHARS,
  type KnowledgeAccessScope,
  type KnowledgeRetrievalQuery,
} from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import {
  knowledgeChunks,
  knowledgeDocuments,
  type KnowledgeChunkEntity,
  type KnowledgeDocumentEntity,
} from '../schema/knowledge.js';
import { organizations } from '../schema/organizations.js';
import { buildQueryPredicates, buildScopePredicates } from './knowledge-retrieval-predicates.js';

/**
 * Consultas da busca v2 (DEC-067). O pré-filtro é um SUPERCONJUNTO do
 * casamento exato feito depois em memória, para nunca descartar no SQL um
 * trecho que a v2 aceitaria: palavras por `ILIKE` sem acento; códigos com o
 * texto reduzido a letras e números ("QT-310", "QT 310" e "qt310" ⇒ "qt310";
 * "QT-3100" também passa aqui e é recusado depois). Título do documento entra
 * no pré-filtro só como reforço. Escopo idêntico ao da v1. Acima do limite de
 * candidatos, trechos com o CÓDIGO pedido vêm primeiro: o corte nunca descarta
 * o produto perguntado por causa de palavras comuns.
 */
export const V2_MAX_CANDIDATES = 2000;

export type ChunkRow = { chunk: KnowledgeChunkEntity; doc: KnowledgeDocumentEntity };

const folded = (column: SQL | typeof knowledgeChunks.text) =>
  sql`translate(${column}, ${KNOWLEDGE_ACCENTED_CHARS}, ${KNOWLEDGE_PLAIN_CHARS})`;
const alnum = (column: SQL | typeof knowledgeChunks.text) =>
  sql`regexp_replace(lower(${folded(column)}), '[^a-z0-9]', '', 'g')`;

export function wordInText(word: string): SQL {
  return sql`${folded(knowledgeChunks.text)} ilike ${`%${word}%`}`;
}

export function codeInText(code: string): SQL {
  return sql`${alnum(knowledgeChunks.text)} like ${`%${code}%`}`;
}

function termPredicate(term: string, isCode: boolean): SQL {
  const title = sql`${knowledgeDocuments.title}`;
  const inTitle = isCode
    ? sql`${alnum(title)} like ${`%${term}%`}`
    : sql`${folded(title)} ilike ${`%${term}%`}`;
  return or(isCode ? codeInText(term) : wordInText(term), inTitle)!;
}

/** Trechos com algum código pedido primeiro (ordenação antes do limite). */
function codePriority(codes: readonly string[]): SQL[] {
  if (codes.length === 0) return [];
  return [desc(sql`case when ${or(...codes.map(codeInText))} then 1 else 0 end`)];
}

export interface V2QueryInput {
  readonly scope: KnowledgeAccessScope;
  readonly query: KnowledgeRetrievalQuery;
  readonly words: readonly string[];
  readonly codes: readonly string[];
}

const scopeOf = (input: V2QueryInput) => [
  ...buildScopePredicates(input.scope),
  ...buildQueryPredicates(input.query, []),
];

export async function loadCandidates(
  db: DatabaseInstance,
  input: V2QueryInput,
): Promise<ChunkRow[]> {
  const terms = [
    ...input.words.map((w) => termPredicate(w, false)),
    ...input.codes.map((c) => termPredicate(c, true)),
  ];
  return db
    .select({ chunk: knowledgeChunks, doc: knowledgeDocuments })
    .from(knowledgeChunks)
    .innerJoin(knowledgeDocuments, eq(knowledgeChunks.documentId, knowledgeDocuments.id))
    .where(and(...scopeOf(input), ...(terms.length > 0 ? [or(...terms)!] : [])))
    .orderBy(
      ...codePriority(input.codes),
      asc(knowledgeChunks.documentId),
      asc(knowledgeChunks.ordinal),
    )
    .limit(V2_MAX_CANDIDATES + 1);
}

/** Trechos vizinhos (ordinal ± 1) dos candidatos, no MESMO escopo, para costurar seções. */
export async function loadNeighbors(
  db: DatabaseInstance,
  input: V2QueryInput,
  wanted: ReadonlyArray<{ documentId: string; ordinal: number }>,
): Promise<ChunkRow[]> {
  if (wanted.length === 0) return [];
  const pairs = sql.join(
    wanted.map((w) => sql`(${w.documentId}::uuid, ${w.ordinal}::int)`),
    sql`, `,
  );
  return db
    .select({ chunk: knowledgeChunks, doc: knowledgeDocuments })
    .from(knowledgeChunks)
    .innerJoin(knowledgeDocuments, eq(knowledgeChunks.documentId, knowledgeDocuments.id))
    .where(
      and(
        ...scopeOf(input),
        sql`(${knowledgeChunks.documentId}, ${knowledgeChunks.ordinal}) in (${pairs})`,
      ),
    );
}

/** Total de trechos do escopo e, por termo, quantos o contêm (superconjunto, para IDF). */
export async function loadScopeStats(
  db: DatabaseInstance,
  input: V2QueryInput,
): Promise<{ total: number; words: number[]; codes: number[] }> {
  const filtered = (predicate: SQL) =>
    sql<number>`count(*) filter (where ${predicate})`.mapWith(Number);
  const columns: Record<string, ReturnType<typeof filtered> | ReturnType<typeof count>> = {
    total: count(),
  };
  input.words.forEach((w, i) => (columns[`w${i}`] = filtered(wordInText(w))));
  input.codes.forEach((c, i) => (columns[`c${i}`] = filtered(codeInText(c))));
  const [row] = (await db
    .select(columns)
    .from(knowledgeChunks)
    .innerJoin(knowledgeDocuments, eq(knowledgeChunks.documentId, knowledgeDocuments.id))
    .where(and(...scopeOf(input)))) as Array<Record<string, number>>;
  return {
    total: Number(row?.total ?? 0),
    words: input.words.map((_, i) => Number(row?.[`w${i}`] ?? 0)),
    codes: input.codes.map((_, i) => Number(row?.[`c${i}`] ?? 0)),
  };
}

export async function loadOrganizationName(
  db: DatabaseInstance,
  organizationId: string,
): Promise<string> {
  const [row] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  return row?.name ?? '';
}
