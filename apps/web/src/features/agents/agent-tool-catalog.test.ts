import { describe, it, expect } from 'vitest';
import { CANONICAL_TOOL_NAMES } from '@voice-agent/contracts';
import { AVAILABLE_CANONICAL_TOOLS } from './agent-tool-catalog';

describe('Agent Studio tool catalog', () => {
  it('lists every canonical tool exactly once, including knowledge.search', () => {
    expect(AVAILABLE_CANONICAL_TOOLS.map((t) => t.name).sort()).toEqual(
      [...CANONICAL_TOOL_NAMES].sort(),
    );
  });

  it('labels knowledge.search honestly as not used in real calls yet', () => {
    const tool = AVAILABLE_CANONICAL_TOOLS.find((t) => t.name === 'knowledge.search');
    expect(tool?.label).toBe('Busca na Base de Conhecimento');
    expect(tool?.description).toContain('não instruções');
    expect(tool?.description).toContain('Ainda não é usada em chamadas reais');
  });
});
