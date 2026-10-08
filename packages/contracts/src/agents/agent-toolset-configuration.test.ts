import { describe, expect, it } from 'vitest';
import {
  CANONICAL_TOOL_NAMES,
  agentConfigurationSnapshotV1Schema,
  agentToolsV1Schema,
  canonicalToolNameSchema,
  normalizeCanonicalToolNames,
  type AgentConfigurationSnapshotV1,
} from './agent-configuration-v1.js';

describe('AgentVersion Toolset Configuration Contracts', () => {
  const baseValidConfig: AgentConfigurationSnapshotV1 = {
    persona: {
      role: 'Atendente',
      companyName: 'Empresa',
      objective: 'Atender clientes',
      tone: 'FORMAL',
      greetingPhrase: 'Olá',
      closingPhrase: 'Tchau',
      fallbackPhrase: 'Não entendi',
    },
    voice: {
      languageCode: 'pt-BR',
    },
    rules: {
      conversational: ['Seja cortês'],
      deterministic: {
        operatingHours: '08:00 - 18:00',
      },
    },
  };

  it('1. accepts a valid canonical tool identity (agent.operating_hours)', () => {
    expect(CANONICAL_TOOL_NAMES).toContain('agent.operating_hours');
    expect(canonicalToolNameSchema.parse('agent.operating_hours')).toBe('agent.operating_hours');

    const parsed = agentConfigurationSnapshotV1Schema.parse({
      ...baseValidConfig,
      tools: ['agent.operating_hours'],
    });

    expect(parsed.tools).toEqual(['agent.operating_hours']);
  });

  it('2. rejects unknown tool identity deterministically', () => {
    expect(() => canonicalToolNameSchema.parse('unknown.tool')).toThrow();

    expect(() =>
      agentConfigurationSnapshotV1Schema.parse({
        ...baseValidConfig,
        tools: ['unknown.tool' as never],
      }),
    ).toThrow();
  });

  it('3. rejects duplicate tool identities deterministically', () => {
    expect(() =>
      agentToolsV1Schema.parse(['agent.operating_hours', 'agent.operating_hours']),
    ).toThrow('Duplicate tool identities are not allowed');

    expect(() =>
      agentConfigurationSnapshotV1Schema.parse({
        ...baseValidConfig,
        tools: ['agent.operating_hours', 'agent.operating_hours'],
      }),
    ).toThrow('Duplicate tool identities are not allowed');
  });

  it('4. normalizes duplicate tool identities without producing duplicate effective config', () => {
    const normalized = normalizeCanonicalToolNames([
      'agent.operating_hours',
      'agent.operating_hours',
      'invalid.tool',
    ]);
    expect(normalized).toEqual(['agent.operating_hours']);
  });

  it('5. allows empty tools array and omitted tools for backward compatibility', () => {
    const withEmpty = agentConfigurationSnapshotV1Schema.parse({
      ...baseValidConfig,
      tools: [],
    });
    expect(withEmpty.tools).toEqual([]);

    const withoutTools = agentConfigurationSnapshotV1Schema.parse({
      ...baseValidConfig,
    });
    expect(withoutTools.tools).toBeUndefined();
  });

  it('6. does not require provider-specific tool metadata', () => {
    const parsed = agentConfigurationSnapshotV1Schema.parse({
      ...baseValidConfig,
      tools: ['agent.operating_hours'],
    });
    expect(parsed.tools).toEqual(['agent.operating_hours']);
    // Verified: tools array contains only canonical string identities, no provider SDK objects
  });
});
