import { and, asc, count, eq, or, sql, type SQL } from 'drizzle-orm';
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
 * trecho que a v2 aceitaria: palavras por `ILIKE` sem acento; códigos por
 * TODOS os seus grupos de letras e números ("QT-310", "QT 310" e "qt310"
 * contêm "qt" e "310"; "QT-3100" também passa aqui e é recusado depois). Escopo idêntico ao da v1.
 * Acima do limite de candidatos, trechos com o CÓDIGO pedido vêm primeiro.
 */
export const V2_MAX_CANDIDATES = 2000;

export type ChunkRow = { chunk: KnowledgeChunkEntity; doc: KnowledgeDocumentEntity };

const folded = (column: SQL | typeof knowledgeChunks.text) =>
  sql`translate(${column}, ${KNOWLEDGE_ACCENTED_CHARS}, ${KNOWLEDGE_PLAIN_CHARS})`;
/** "qt310" ⇒ ["qt", "310"]: cada grupo de letras ou números do código. */
const codeGroups = (code: string) => code.match(/\p{L}+|\p{N}+/gu) ?? [code];

function wordInText(word: string): SQL {
  return sql`${folded(knowledgeChunks.text)} ilike ${`%${word}%`}`;
}

/**
 * Código: o texto contém TODOS os grupos do código ("qt" e "310"), em
 * qualquer grafia (QT-310, QT 310, qt310). Superconjunto barato (sem
 * expressão regular no SQL); QT-3100 também passa e é recusado em memória.
 */
function codeIn(column: SQL | typeof knowledgeChunks.text, code: string): SQL {
  return and(...codeGroups(code).map((g) => sql`${folded(column)} ilike ${`%${g}%`}`))!;
}

export function codeInText(code: string): SQL {
  return codeIn(knowledgeChunks.text, code);
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

/** Trecho candidato LEVE: só o necessário para o casamento exato em memória. */
export interface CandidateChunk {
  readonly id: string;
  readonly documentId: string;
  readonly ordinal: number;
  readonly text: string;
}

function selectCandidates(db: DatabaseInstance, input: V2QueryInput, predicate: SQL) {
  return db
    .select({
      id: knowledgeChunks.id,
      documentId: knowledgeChunks.documentId,
      ordinal: knowledgeChunks.ordinal,
      text: knowledgeChunks.text,
    })
    .from(knowledgeChunks)
    .innerJoin(knowledgeDocuments, eq(knowledgeChunks.documentId, knowledgeDocuments.id))
    .where(and(...scopeOf(input), predicate))
    .orderBy(asc(knowledgeChunks.documentId), asc(knowledgeChunks.ordinal))
    .limit(V2_MAX_CANDIDATES + 1);
}

/**
 * Candidatos leves (texto do trecho, sem linhas completas). Com código na
 * pergunta, uma consulta só dos trechos com o código roda em paralelo e vem
 * primeiro: acima do limite, o corte nunca descarta o produto perguntado.
 */
export async function loadCandidates(
  db: DatabaseInstance,
  input: V2QueryInput,
): Promise<{ rows: CandidateChunk[]; capped: boolean }> {
  const codes = input.codes.map(codeInText);
  const terms = [...input.words.map(wordInText), ...codes];
  if (terms.length === 0) return { rows: [], capped: false };
  const [general, coded] = await Promise.all([
    selectCandidates(db, input, or(...terms)!),
    codes.length > 0 ? selectCandidates(db, input, or(...codes)!) : Promise.resolve([]),
  ]);
  const seen = new Set<string>();
  const merged = [...coded, ...general].filter((r) => !seen.has(r.id) && !!seen.add(r.id));
  return {
    rows: merged.slice(0, V2_MAX_CANDIDATES),
    capped: merged.length > V2_MAX_CANDIDATES,
  };
}

/** Linhas completas (trecho + documento) dos pares pedidos, no MESMO escopo. */
export async function loadChunkRows(
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

/** Total de trechos prontos do escopo (IDF). Sem varrer o texto. */
export async function loadScopeTotal(db: DatabaseInstance, input: V2QueryInput): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(knowledgeChunks)
    .innerJoin(knowledgeDocuments, eq(knowledgeChunks.documentId, knowledgeDocuments.id))
    .where(and(...scopeOf(input)));
  return Number(row?.total ?? 0);
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
