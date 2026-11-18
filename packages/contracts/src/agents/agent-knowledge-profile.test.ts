import { describe, expect, it } from 'vitest';
import { agentConfigurationSnapshotV1Schema } from './agent-configuration-v1.js';
import {
  CLOSED_KNOWLEDGE_PROFILE_POLICY,
  evaluateKnowledgeProfileDraftWrite,
  evaluateKnowledgeProfilePublication,
  evaluateKnowledgeProfileRuntime,
  resolveKnowledgeRetrievalProfile,
  type KnowledgeProfilePolicy,
} from './agent-knowledge-profile.js';

const base = {
  persona: {
    role: 'Atendente',
    companyName: 'Empresa Exemplo',
    objective: 'Atender',
    tone: 'FORMAL',
    greetingPhrase: 'Olá',
    closingPhrase: 'Até logo',
    fallbackPhrase: 'Pode repetir?',
  },
  voice: { languageCode: 'pt-BR' },
  rules: { conversational: [], deterministic: {} },
  tools: ['knowledge.search'],
} as const;

const ORG = '11111111-1111-4111-8111-111111111111';
const policy = (org: boolean, runtime: boolean): KnowledgeProfilePolicy => ({
  isOrganizationAllowed: () => org,
  isRuntimeEnabled: () => runtime,
});
const v1 = { knowledge: { retrievalProfile: 'v1' as const } };
const v2 = { knowledge: { retrievalProfile: 'v2' as const } };

describe('knowledge.retrievalProfile no snapshot (B2a)', () => {
  it('aceita snapshot antigo sem o campo, v1 e v2', () => {
    expect(agentConfigurationSnapshotV1Schema.parse(base)).not.toHaveProperty('knowledge');
    expect(agentConfigurationSnapshotV1Schema.parse({ ...base, ...v1 }).knowledge).toEqual(
      v1.knowledge,
    );
    expect(agentConfigurationSnapshotV1Schema.parse({ ...base, ...v2 }).knowledge).toEqual(
      v2.knowledge,
    );
  });

  it.each([
    ['valor fora do enum', { retrievalProfile: 'v3' }],
    ['chave extra', { retrievalProfile: 'v2', allowAll: true }],
    ['objeto vazio', {}],
    ['texto solto', 'v2'],
  ])('recusa %s', (_, knowledge) => {
    expect(agentConfigurationSnapshotV1Schema.safeParse({ ...base, knowledge }).success).toBe(
      false,
    );
  });

  it('ausente resolve para v1; só v2 explícito é v2', () => {
    expect(resolveKnowledgeRetrievalProfile(undefined)).toBe('v1');
    expect(resolveKnowledgeRetrievalProfile({})).toBe('v1');
    expect(resolveKnowledgeRetrievalProfile(v1)).toBe('v1');
    expect(resolveKnowledgeRetrievalProfile(v2)).toBe('v2');
  });

  it('a política padrão é fechada', () => {
    expect(CLOSED_KNOWLEDGE_PROFILE_POLICY.isOrganizationAllowed(ORG)).toBe(false);
    expect(CLOSED_KNOWLEDGE_PROFILE_POLICY.isRuntimeEnabled()).toBe(false);
  });
});

describe('evaluateKnowledgeProfileDraftWrite', () => {
  const write = (
    actorRole: 'OWNER' | 'ADMIN' | 'MANAGER',
    previous: object | undefined,
    next: object,
    allowed = true,
  ) =>
    evaluateKnowledgeProfileDraftWrite({
      organizationId: ORG,
      actorRole,
      previous,
      next,
      policy: policy(allowed, false),
    });

  it('manter o campo como está é sempre permitido (MANAGER edita outros campos)', () => {
    expect(write('MANAGER', {}, {}, false)).toBeNull();
    expect(write('MANAGER', v2, v2, false)).toBeNull();
    expect(write('MANAGER', undefined, {}, false)).toBeNull();
  });

  it('MANAGER não altera, cria nem remove o perfil', () => {
    expect(write('MANAGER', {}, v2)).toBe('ROLE_NOT_ALLOWED');
    expect(write('MANAGER', v2, v1)).toBe('ROLE_NOT_ALLOWED');
    expect(write('MANAGER', v2, {})).toBe('ROLE_NOT_ALLOWED');
    expect(write('MANAGER', undefined, v1)).toBe('ROLE_NOT_ALLOWED');
  });

  it('OWNER/ADMIN só gravam o campo em organização liberada', () => {
    expect(write('OWNER', {}, v2, false)).toBe('ORG_NOT_ALLOWED');
    expect(write('ADMIN', {}, v1, false)).toBe('ORG_NOT_ALLOWED');
    expect(write('OWNER', {}, v2, true)).toBeNull();
    expect(write('ADMIN', v1, v2, true)).toBeNull();
  });

  it('OWNER/ADMIN podem remover o campo (volta ao padrão v1)', () => {
    expect(write('OWNER', v2, {}, false)).toBeNull();
  });
});

describe('evaluateKnowledgeProfilePublication e Runtime', () => {
  const publish = (snapshot: object, org: boolean, runtime: boolean) =>
    evaluateKnowledgeProfilePublication({
      organizationId: ORG,
      snapshot,
      policy: policy(org, runtime),
    });

  it('sem o campo não consulta as travas', () => {
    let reads = 0;
    const spy: KnowledgeProfilePolicy = {
      isOrganizationAllowed: () => (reads++, true),
      isRuntimeEnabled: () => (reads++, true),
    };
    expect(
      evaluateKnowledgeProfilePublication({ organizationId: ORG, snapshot: {}, policy: spy }),
    ).toBeNull();
    expect(reads).toBe(0);
  });

  it('v2 exige organização liberada E chave ligada', () => {
    expect(publish(v2, false, true)).toBe('ORG_NOT_ALLOWED');
    expect(publish(v2, true, false)).toBe('RUNTIME_OFF');
    expect(publish(v2, false, false)).toBe('ORG_NOT_ALLOWED');
    expect(publish(v2, true, true)).toBeNull();
  });

  it('v1 explícito exige só organização liberada', () => {
    expect(publish(v1, false, true)).toBe('ORG_NOT_ALLOWED');
    expect(publish(v1, true, false)).toBeNull();
  });

  it('execução v2 exige as duas travas', () => {
    expect(evaluateKnowledgeProfileRuntime(ORG, policy(true, false))).toBe('RUNTIME_OFF');
    expect(evaluateKnowledgeProfileRuntime(ORG, policy(false, true))).toBe('ORG_NOT_ALLOWED');
    expect(evaluateKnowledgeProfileRuntime(ORG, policy(true, true))).toBeNull();
  });
});
