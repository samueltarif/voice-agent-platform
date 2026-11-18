import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, desc, eq } from 'drizzle-orm';
import type { AgentConfigurationSnapshotV1, KnowledgeProfilePolicy } from '@voice-agent/contracts';
import {
  createDisposableTestDatabase,
  createKnowledgeSimulationFixture,
  knowledgeSimulationConfig,
  openKnowledgeProfilePolicyFor,
  type KnowledgeSimulationFixture,
} from './test-support/index.js';
import {
  AgentDraftService,
  AgentPublicationService,
  AgentVersionRepository,
  CommercialEntitlementResolver,
  DefaultCommercialPublicationPolicy,
  loadPublishedAgentForSimulation,
} from './repositories/index.js';
import { agentVersions } from './schema/agents.js';
import { auditLogs } from './schema/audit.js';

const tdb = await createDisposableTestDatabase('agent-knowledge-profile');
const NOT_AUTHORIZED = { statusCode: 403, code: 'KNOWLEDGE_PROFILE_NOT_AUTHORIZED' };
const config = (knowledge?: AgentConfigurationSnapshotV1['knowledge']) => ({
  ...knowledgeSimulationConfig(['knowledge.search']),
  ...(knowledge ? { knowledge } : {}),
});
const v1 = { retrievalProfile: 'v1' } as const;
const v2 = { retrievalProfile: 'v2' } as const;

/**
 * B2a (DEC-071): perfil de busca na versão. Lista e chave da plataforma
 * FECHADAS por padrão; o papel vem do contexto autenticado (aqui, informado
 * pelo teste como faria a rota a partir do banco); comparação com o rascunho
 * PERSISTIDO. Política aberta só neste banco descartável.
 */
describe('knowledge.retrievalProfile — rascunho e publicação (B2a)', () => {
  let fx: KnowledgeSimulationFixture;
  const resolver = new CommercialEntitlementResolver(tdb.db);
  const commercial = new DefaultCommercialPublicationPolicy(tdb.db, resolver);
  const versions = new AgentVersionRepository(tdb.db);
  const draftsWith = (policy?: KnowledgeProfilePolicy) => new AgentDraftService(tdb.db, policy);
  const publisherWith = (policy?: KnowledgeProfilePolicy) =>
    new AgentPublicationService(tdb.db, commercial, policy);

  const draftOf = async (agentId: string) =>
    (
      await tdb.db
        .select()
        .from(agentVersions)
        .where(and(eq(agentVersions.agentId, agentId), eq(agentVersions.status, 'DRAFT')))
    )[0]!;
  const update = (
    service: AgentDraftService,
    input: {
      agentId: string;
      versionId: string;
      role: 'OWNER' | 'ADMIN' | 'MANAGER';
      knowledge?: typeof v1 | typeof v2 | undefined;
    },
  ) =>
    service.updateDraftConfiguration({
      organizationId: fx.orgA,
      agentId: input.agentId,
      versionId: input.versionId,
      configuration: config(input.knowledge),
      actorRole: input.role,
    });

  beforeAll(async () => {
    fx = await createKnowledgeSimulationFixture(tdb.db, 'kbprofile');
  }, 120_000);

  afterAll(async () => {
    await tdb.drop();
  }, 60_000);

  it('versões antigas sem o campo continuam válidas e resolvem para v1', async () => {
    const published = await loadPublishedAgentForSimulation(tdb.db, {
      organizationId: fx.orgA,
      agentId: fx.sales,
    });
    expect(published.snapshot).not.toHaveProperty('knowledge');
  });

  it('com as travas FECHADAS (padrão), ninguém grava o perfil no rascunho', async () => {
    const draft = await draftOf(fx.draftOnly);
    for (const role of ['OWNER', 'ADMIN', 'MANAGER'] as const) {
      for (const knowledge of [v1, v2]) {
        await expect(
          update(draftsWith(), { agentId: fx.draftOnly, versionId: draft.id, role, knowledge }),
        ).rejects.toMatchObject(NOT_AUTHORIZED);
      }
    }
    expect((await draftOf(fx.draftOnly)).configuration).toEqual(draft.configuration);
    // Sem o campo, a edição continua igual para todos os papéis.
    await update(draftsWith(), { agentId: fx.draftOnly, versionId: draft.id, role: 'MANAGER' });
  });

  it('organização liberada: só OWNER/ADMIN mudam; MANAGER edita o resto sem mudar o perfil', async () => {
    const open = draftsWith(openKnowledgeProfilePolicyFor([fx.orgA], false));
    const { id } = await draftOf(fx.draftOnly);
    const run = (role: 'OWNER' | 'ADMIN' | 'MANAGER', knowledge?: typeof v1 | typeof v2) =>
      update(open, { agentId: fx.draftOnly, versionId: id, role, knowledge });
    await expect(run('MANAGER', v2)).rejects.toMatchObject(NOT_AUTHORIZED);
    await run('OWNER', v2);
    await run('MANAGER', v2);
    await expect(run('MANAGER', v1)).rejects.toMatchObject(NOT_AUTHORIZED);
    await expect(run('MANAGER')).rejects.toMatchObject(NOT_AUTHORIZED);
    await run('ADMIN', v1);
    await run('ADMIN');
    expect((await draftOf(fx.draftOnly)).configuration).not.toHaveProperty('knowledge');
  });

  it('isolamento: liberar a organização A não libera a B', async () => {
    const open = draftsWith(openKnowledgeProfilePolicyFor([fx.orgA]));
    await expect(
      open.createDraft({
        organizationId: fx.orgB,
        agentId: fx.salesB,
        configuration: config(v2),
        createdBy: fx.userId,
        actorRole: 'OWNER',
      }),
    ).rejects.toMatchObject(NOT_AUTHORIZED);
  });

  it('publicação v2 recusada sem lista ou sem chave; a versão publicada não muda', async () => {
    const before = await versions.getCurrentPublishedVersion({
      organizationId: fx.orgA,
      agentId: fx.sales,
    });
    const draft = await draftsWith(openKnowledgeProfilePolicyFor([fx.orgA])).createDraft({
      organizationId: fx.orgA,
      agentId: fx.sales,
      configuration: config(v2),
      createdBy: fx.userId,
      actorRole: 'OWNER',
    });
    const input = {
      organizationId: fx.orgA,
      agentId: fx.sales,
      draftVersionId: draft.id,
      publishedBy: fx.userId,
    };
    for (const policy of [
      undefined,
      openKnowledgeProfilePolicyFor([fx.orgA], false),
      openKnowledgeProfilePolicyFor([fx.orgB], true),
    ]) {
      await expect(publisherWith(policy).publishDraft(input)).rejects.toMatchObject(NOT_AUTHORIZED);
    }
    const after = await versions.getCurrentPublishedVersion({
      organizationId: fx.orgA,
      agentId: fx.sales,
    });
    expect(after?.id).toBe(before?.id);
    expect((await draftOf(fx.sales)).status).toBe('DRAFT');

    await publisherWith(openKnowledgeProfilePolicyFor([fx.orgA], true)).publishDraft(input);
    const [audit] = await tdb.db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.targetId, fx.sales), eq(auditLogs.action, 'agent.version_published')))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);
    expect(JSON.parse(String(audit!.metadata))).toMatchObject({ knowledgeRetrievalProfile: 'v2' });
  });

  it('publicação sem o campo não consulta as travas e registra v1', async () => {
    let reads = 0;
    const spy: KnowledgeProfilePolicy = {
      isOrganizationAllowed: () => (reads++, true),
      isRuntimeEnabled: () => (reads++, true),
    };
    const draft = await draftsWith(spy).createDraft({
      organizationId: fx.orgA,
      agentId: fx.support,
      configuration: config(),
      createdBy: fx.userId,
      actorRole: 'MANAGER',
    });
    await publisherWith(spy).publishDraft({
      organizationId: fx.orgA,
      agentId: fx.support,
      draftVersionId: draft.id,
      publishedBy: fx.userId,
    });
    expect(reads).toBe(0);
  });
});
