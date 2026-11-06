import { describe, expect, it } from 'vitest';
import * as contracts from '@voice-agent/contracts';
import {
  isToolConfiguredInSnapshot,
  resolvePublishedVersionToolset,
} from './published-version-toolset.js';

describe('published version toolset — single shared implementation (S1)', () => {
  it('apps/voice re-exports the exact functions from packages/contracts', () => {
    expect(resolvePublishedVersionToolset).toBe(contracts.resolvePublishedVersionToolset);
    expect(isToolConfiguredInSnapshot).toBe(contracts.isToolConfiguredInSnapshot);
  });
});
