import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import type { AgentVersionMetadataResponse } from '@voice-agent/contracts';
import { DEFAULT_AGENT_CONFIGURATION_V1 } from './agent-default-configuration.js';
import { useAgentWorkspaceState } from './use-agent-workspace-state.js';

const mockVersions: AgentVersionMetadataResponse[] = [
  {
    id: 'v1-id',
    versionNumber: 1,
    status: 'PUBLISHED',
    configurationSchemaVersion: 1,
    publishedAt: '2026-09-01T10:05:00.000Z',
    publishedBy: 'user-1',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  },
  {
    id: 'v2-id',
    versionNumber: 2,
    status: 'DRAFT',
    configurationSchemaVersion: 1,
    publishedAt: null,
    publishedBy: null,
    createdAt: '2026-09-02T10:00:00.000Z',
    updatedAt: '2026-09-02T10:00:00.000Z',
  },
];

function TestStateComponent(props: Parameters<typeof useAgentWorkspaceState>[0]) {
  const state = useAgentWorkspaceState(props);
  return (
    <div>
      <span id="selected-id">{state.selectedVersionId}</span>
      <span id="version-num">{state.selectedVersion?.versionNumber}</span>
      <span id="has-config">{state.currentConfig ? 'yes' : 'no'}</span>
    </div>
  );
}

describe('useAgentWorkspaceState', () => {
  it('initializes with draft version and config if draft exists', () => {
    const html = renderToString(
      React.createElement(TestStateComponent, {
        agentId: 'agent-1',
        versions: mockVersions,
        draftVersion: mockVersions[1]!,
        draftConfig: DEFAULT_AGENT_CONFIGURATION_V1,
        publishedConfig: null,
        canReadConfig: true,
      }),
    );

    expect(html).toContain('v2-id');
    expect(html).toContain('2');
    expect(html).toContain('yes');
  });

  it('initializes with published version when draft is absent', () => {
    const html = renderToString(
      React.createElement(TestStateComponent, {
        agentId: 'agent-1',
        versions: [mockVersions[0]!],
        draftVersion: null,
        draftConfig: null,
        publishedConfig: DEFAULT_AGENT_CONFIGURATION_V1,
        canReadConfig: true,
      }),
    );

    expect(html).toContain('v1-id');
    expect(html).toContain('1');
    expect(html).toContain('yes');
  });
});
