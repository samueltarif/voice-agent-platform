import type { DatabaseInstance } from '../client/connection.js';
import { ingestKnowledgeDocument } from '../repositories/knowledge-ingestion-service.js';
import { OrganizationRepository } from '../repositories/organization-repository.js';
import { EVALUATION_DOCUMENTS } from './fixtures/knowledge-evaluation-documents.js';
import { EVALUATION_EXTENSION_DOCUMENTS } from './fixtures/knowledge-evaluation-extension.js';
import { HOSTILE_EVALUATION_DOCUMENTS } from './fixtures/knowledge-hostile-evaluation-corpus.js';

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
  // Nomes como os de clientes reais: o nome da empresa aparece nos documentos.
  const a = { slug: `kbeval-a-${run}`, name: 'Qualitec Instrumentação' };
  const orgA = (await orgs.createOrganization(a))!.id;
  const orgB = (await orgs.createOrganization({ slug: `kbeval-b-${run}`, name: 'Aerotec' }))!.id;
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

/** Casos novos de desenvolvimento (organização C, outro ramo); mesma ingestão padrão. */
export async function createKnowledgeEvaluationExtensionFixture(
  db: DatabaseInstance,
  run: string,
): Promise<{ readonly orgC: string; readonly documentKeys: ReadonlyMap<string, string> }> {
  const org = { slug: `kbeval-c-${run}`, name: 'Eletrovale Distribuidora' };
  const orgC = (await new OrganizationRepository(db).createOrganization(org))!.id;
  const documentKeys = new Map<string, string>();
  for (const doc of EVALUATION_EXTENSION_DOCUMENTS) {
    const result = await ingestKnowledgeDocument(db, {
      organizationId: orgC,
      title: doc.title,
      source: { sourceType: 'PRODUCT_MANUAL', locator: `eval/${run}/${doc.key}` },
      rawText: doc.text,
    });
    documentKeys.set(result.document.id, doc.key);
  }
  return { orgC, documentKeys };
}

/** Corpus da B2b (organização D): cada documento com o tipo de fonte declarado. */
export async function createKnowledgeHostileEvaluationFixture(
  db: DatabaseInstance,
  run: string,
): Promise<{ readonly orgD: string; readonly documentKeys: ReadonlyMap<string, string> }> {
  const org = { slug: `kbeval-d-${run}`, name: 'Fluxtec Automação' };
  const orgD = (await new OrganizationRepository(db).createOrganization(org))!.id;
  const documentKeys = new Map<string, string>();
  for (const doc of HOSTILE_EVALUATION_DOCUMENTS) {
    const result = await ingestKnowledgeDocument(db, {
      organizationId: orgD,
      title: doc.title,
      source: { sourceType: doc.sourceType, locator: `eval/${run}/${doc.key}` },
      rawText: doc.text,
    });
    documentKeys.set(result.document.id, doc.key);
  }
  return { orgD, documentKeys };
}
