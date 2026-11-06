import { describe, expect, it } from 'vitest';
import type { AgentConfigurationSnapshotV1 } from './agent-configuration-v1.js';
import {
  isToolConfiguredInSnapshot,
  resolvePublishedVersionToolset,
} from './agent-version-toolset.js';

const base: AgentConfigurationSnapshotV1 = {
  persona: {
    role: 'Atendente',
    companyName: 'Empresa Exemplo',
    objective: 'Atender',
    tone: 'FORMAL',
    greetingPhrase: 'Olá',
    closingPhrase: 'Tchau',
    fallbackPhrase: 'Pode repetir?',
  },
  voice: { languageCode: 'pt-BR' },
  rules: { conversational: ['Seja cordial'], deterministic: {} },
};

describe('agent version toolset (pure configuration rule, S1)', () => {
  it('returns the declared tools, or an empty list when absent or malformed', () => {
    expect(resolvePublishedVersionToolset(undefined)).toEqual([]);
    expect(resolvePublishedVersionToolset(base)).toEqual([]);
    expect(resolvePublishedVersionToolset({ ...base, tools: 'catalog.search' } as never)).toEqual(
      [],
    );
    const withTools: AgentConfigurationSnapshotV1 = {
      ...base,
      tools: ['agent.operating_hours', 'catalog.search'],
    };
    expect(resolvePublishedVersionToolset(withTools)).toEqual([
      'agent.operating_hours',
      'catalog.search',
    ]);
  });

  it('answers membership without mutating the snapshot', () => {
    const tools: AgentConfigurationSnapshotV1['tools'] = ['catalog.search'];
    const snapshot: AgentConfigurationSnapshotV1 = Object.freeze({
      ...base,
      tools: Object.freeze(tools) as typeof tools,
    });
    expect(isToolConfiguredInSnapshot('catalog.search', snapshot)).toBe(true);
    expect(isToolConfiguredInSnapshot('agent.operating_hours', snapshot)).toBe(false);
    expect(isToolConfiguredInSnapshot('unknown.tool', snapshot)).toBe(false);
    expect(isToolConfiguredInSnapshot('catalog.search', undefined)).toBe(false);
  });
});
