import { knowledgeOrgHeaders } from './knowledge-org-header';
import {
  normalizeKnowledgeBffError,
  type KnowledgeBffDocument,
} from './knowledge-documents-client';

/** Cliente das operações de gestão (DEC-054). Sempre envia a organização da tela. */
const BFF_BASE = '/api/knowledge/documents';

export interface KnowledgeDocumentEdit {
  readonly title?: string | undefined;
  readonly collection?: string | null | undefined;
  readonly sourceVersion?: string | null | undefined;
  readonly rawText?: string | undefined;
}

export interface OrganizationAgentOption {
  readonly id: string;
  readonly name: string;
  readonly status: string;
}

async function send(
  orgSlug: string,
  path: string,
  init: { method: string; body?: unknown },
): Promise<unknown> {
  const res = await fetch(`${BFF_BASE}${path}`, {
    method: init.method,
    headers: {
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...knowledgeOrgHeaders(orgSlug),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) throw normalizeKnowledgeBffError(res.status, payload);
  return (payload as { document?: unknown } | null)?.document ?? payload;
}

export async function updateKnowledgeDocument(
  orgSlug: string,
  doc: Pick<KnowledgeBffDocument, 'id' | 'updatedAt'>,
  edit: KnowledgeDocumentEdit,
): Promise<KnowledgeBffDocument> {
  const body = { expectedUpdatedAt: doc.updatedAt, ...edit };
  return (await send(orgSlug, `/${doc.id}`, { method: 'PATCH', body })) as KnowledgeBffDocument;
}

export async function setKnowledgeDocumentAgent(
  orgSlug: string,
  doc: Pick<KnowledgeBffDocument, 'id' | 'updatedAt'>,
  agentId: string | null,
): Promise<KnowledgeBffDocument> {
  const body = { expectedUpdatedAt: doc.updatedAt, agentId };
  return (await send(orgSlug, `/${doc.id}/agent`, { method: 'PUT', body })) as KnowledgeBffDocument;
}

export async function restoreKnowledgeDocument(
  orgSlug: string,
  doc: Pick<KnowledgeBffDocument, 'id' | 'updatedAt'>,
): Promise<KnowledgeBffDocument> {
  const body = { expectedUpdatedAt: doc.updatedAt };
  return (await send(orgSlug, `/${doc.id}/restore`, {
    method: 'POST',
    body,
  })) as KnowledgeBffDocument;
}

export async function deleteKnowledgeDocument(
  orgSlug: string,
  doc: Pick<KnowledgeBffDocument, 'id' | 'updatedAt'>,
): Promise<void> {
  const query = `?expectedUpdatedAt=${encodeURIComponent(doc.updatedAt)}`;
  await send(orgSlug, `/${doc.id}${query}`, { method: 'DELETE' });
}

function toAgentOption(value: unknown): OrganizationAgentOption | null {
  const a = value as { id?: unknown; name?: unknown; status?: unknown } | null;
  if (typeof a?.id !== 'string' || typeof a.name !== 'string') return null;
  return { id: a.id, name: a.name, status: typeof a.status === 'string' ? a.status : 'UNKNOWN' };
}

/** Agentes da organização ativa (rota existente `/api/agents`), para nomes e associação. */
export async function fetchOrganizationAgents(): Promise<OrganizationAgentOption[]> {
  const res = await fetch('/api/agents', { method: 'GET' });
  if (!res.ok) throw normalizeKnowledgeBffError(res.status, null);
  const payload = (await res.json()) as { agents?: unknown } | null;
  const list = Array.isArray(payload?.agents) ? payload.agents : [];
  return list.map(toAgentOption).filter((a): a is OrganizationAgentOption => a !== null);
}
