import { describe, expect, it } from 'vitest';
import { DEFAULT_AGENT_CONFIGURATION_V1 } from '../agent-default-configuration.js';
import { selectSimulatorConfiguration } from './select-simulator-configuration.js';

const draft = { ...DEFAULT_AGENT_CONFIGURATION_V1, tools: ['catalog.search' as const] };
const published = { ...DEFAULT_AGENT_CONFIGURATION_V1, tools: [] };

describe('selectSimulatorConfiguration', () => {
  it('prefers the saved draft and lists both saved configurations', () => {
    const result = selectSimulatorConfiguration({ draftConfig: draft, publishedConfig: published });
    expect(result.selected).toEqual({ kind: 'DRAFT', config: draft });
    expect(result.available).toEqual(['DRAFT', 'PUBLISHED']);
  });

  it('shows the published version only when requested and available', () => {
    expect(
      selectSimulatorConfiguration({
        draftConfig: draft,
        publishedConfig: published,
        requested: 'publicada',
      }).selected?.kind,
    ).toBe('PUBLISHED');
    expect(
      selectSimulatorConfiguration({
        draftConfig: draft,
        publishedConfig: null,
        requested: 'publicada',
      }).selected?.kind,
    ).toBe('DRAFT');
    expect(
      selectSimulatorConfiguration({
        draftConfig: draft,
        publishedConfig: published,
        requested: ['publicada'],
      }).selected?.kind,
    ).toBe('DRAFT');
  });

  it('falls back to the published version without draft and to nothing without both', () => {
    expect(
      selectSimulatorConfiguration({ draftConfig: null, publishedConfig: published }).selected
        ?.kind,
    ).toBe('PUBLISHED');
    expect(selectSimulatorConfiguration({ draftConfig: null, publishedConfig: null })).toEqual({
      selected: null,
      available: [],
    });
  });
});
