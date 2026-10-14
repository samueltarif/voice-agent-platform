import { describe, it, expect } from 'vitest';
import { canArchiveKnowledge, canIngestKnowledge, canReadKnowledge } from './knowledge-permissions';

describe('knowledge-permissions (DEC-039 UX mirror)', () => {
  it.each(['OWNER', 'ADMIN'] as const)('%s has full management visibility', (role) => {
    expect(canReadKnowledge(role)).toBe(true);
    expect(canIngestKnowledge(role)).toBe(true);
    expect(canArchiveKnowledge(role)).toBe(true);
  });

  it('MANAGER reads and ingests but never archives', () => {
    expect(canReadKnowledge('MANAGER')).toBe(true);
    expect(canIngestKnowledge('MANAGER')).toBe(true);
    expect(canArchiveKnowledge('MANAGER')).toBe(false);
  });

  it.each(['OPERATOR', 'VIEWER'] as const)('%s has no management visibility', (role) => {
    expect(canReadKnowledge(role)).toBe(false);
    expect(canIngestKnowledge(role)).toBe(false);
    expect(canArchiveKnowledge(role)).toBe(false);
  });

  it('unknown, null and undefined roles fail closed', () => {
    for (const role of [undefined, null, '', 'ADMINN', 'owner']) {
      expect(canReadKnowledge(role)).toBe(false);
      expect(canIngestKnowledge(role)).toBe(false);
      expect(canArchiveKnowledge(role)).toBe(false);
    }
  });
});
