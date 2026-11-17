import type { DatabaseInstance } from '../client/connection.js';
import { ingestKnowledgeDocument } from '../repositories/knowledge-ingestion-service.js';
import { OrganizationRepository } from '../repositories/organization-repository.js';
import { EVALUATION_DOCUMENTS } from './fixtures/knowledge-evaluation-documents.js';

/** IDs do corpus de avaliação (PR B1 / DEC-067). */
export interface KnowledgeEvaluationFixture {
  readonly orgA: string;
  readonly orgB: string;
  /** documentId → chave do documento no corpus (ex.: "catalog"). */
  readonly documentKeys: ReadonlyMap<string, string>;
}

/**
 * SOMENTE bancos DESCARTÁVEIS de teste. Organizações e documentos criados
 * pelos serviços oficiais, com a política de chunking PADRÃO (sem forçar
 * trechos pequenos), como acontece com os documentos reais.
 */
export async function createKnowledgeEvaluationFixture(
  db: DatabaseInstance,
  run: string,
): Promise<KnowledgeEvaluationFixture> {
  const orgs = new OrganizationRepository(db);
  const orgA = (await orgs.createOrganization({ slug: `kbeval-a-${run}`, name: 'A' }))!.id;
  const orgB = (await orgs.createOrganization({ slug: `kbeval-b-${run}`, name: 'B' }))!.id;
  const documentKeys = new Map<string, string>();
  for (const doc of EVALUATION_DOCUMENTS) {
    const result = await ingestKnowledgeDocument(db, {
      organizationId: doc.org === 'A' ? orgA : orgB,
      title: doc.title,
      source: { sourceType: 'PRODUCT_MANUAL', locator: `eval/${run}/${doc.key}` },
      rawText: doc.text,
    });
    documentKeys.set(result.document.id, doc.key);
  }
  return { orgA, orgB, documentKeys };
}
