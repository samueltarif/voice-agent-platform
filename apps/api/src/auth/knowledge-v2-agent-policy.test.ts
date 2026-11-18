import { describe, expect, it } from 'vitest';
import type { Logger } from '@voice-agent/logger';
import {
  createKnowledgeV2AgentPolicy,
  createProductionKnowledgeV2AgentPolicy,
  KNOWLEDGE_V2_AGENT_ORGANIZATIONS,
  readKnowledgeV2AgentRuntime,
} from './knowledge-v2-agent-policy.js';

const ORG = '11111111-1111-4111-8111-111111111111';

function capture(): { logger: Logger; lines: Array<[string, string, unknown]> } {
  const lines: Array<[string, string, unknown]> = [];
  const at = (level: string) => (msg: string, ctx?: unknown) => lines.push([level, msg, ctx]);
  return {
    logger: { info: at('info'), warn: at('warn'), error: at('error'), debug: at('debug') },
    lines,
  };
}

describe('travas da plataforma para a v2 em agentes (B2a)', () => {
  /**
   * GUARDA: a lista de produção é VAZIA. Liberar uma organização exige PR
   * revisada, decisão (DEC) e autorização expressa do operador — e mudar
   * também este teste, à vista na revisão.
   */
  it('a lista versionada de organizações liberadas está vazia', () => {
    expect(KNOWLEDGE_V2_AGENT_ORGANIZATIONS).toEqual([]);
    expect(Object.isFrozen(KNOWLEDGE_V2_AGENT_ORGANIZATIONS)).toBe(true);
  });

  it.each([
    [undefined, false],
    ['', false],
    ['true', false],
    ['1', false],
    ['ENABLED', false],
    [' enabled', false],
    ['enabled ', false],
    ['on', false],
    ['enabled', true],
  ])('KNOWLEDGE_V2_AGENT_RUNTIME=%j ⇒ %s', (value, expected) => {
    expect(readKnowledgeV2AgentRuntime({ KNOWLEDGE_V2_AGENT_RUNTIME: value })).toBe(expected);
  });

  it('produção: mesmo com a chave ligada, nenhuma organização é liberada', () => {
    const { logger, lines } = capture();
    const policy = createProductionKnowledgeV2AgentPolicy(
      { KNOWLEDGE_V2_AGENT_RUNTIME: 'enabled' },
      logger,
    );
    expect(policy.isRuntimeEnabled()).toBe(true);
    expect(policy.isOrganizationAllowed(ORG)).toBe(false);
    expect(lines).toEqual([
      [
        'info',
        'knowledge.v2_agent_runtime',
        { knowledgeV2AgentRuntime: 'on', knowledgeV2AgentOrganizations: 0 },
      ],
    ]);
  });

  it('padrão: chave desligada e registro de partida "off"', () => {
    const { logger, lines } = capture();
    const policy = createProductionKnowledgeV2AgentPolicy({}, logger);
    expect(policy.isRuntimeEnabled()).toBe(false);
    expect(lines[0]?.[2]).toMatchObject({ knowledgeV2AgentRuntime: 'off' });
  });

  it('o relatório registra só ids, ação e motivo', () => {
    const { logger, lines } = capture();
    const policy = createKnowledgeV2AgentPolicy({
      runtimeEnabled: false,
      organizations: [],
      logger,
    });
    policy.report?.({
      event: 'knowledge.profile_rejected',
      action: 'PUBLISH',
      organizationId: ORG,
      agentId: ORG,
      reason: 'ORG_NOT_ALLOWED',
    });
    expect(lines).toEqual([
      [
        'warn',
        'knowledge.profile_rejected',
        expect.objectContaining({ action: 'PUBLISH', reason: 'ORG_NOT_ALLOWED' }),
      ],
    ]);
  });
});
