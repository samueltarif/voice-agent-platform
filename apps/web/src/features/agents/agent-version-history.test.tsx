import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import type { AgentVersionMetadataResponse } from '@voice-agent/contracts';
import { AgentVersionHistory } from './agent-version-history.js';

const mockVersions: AgentVersionMetadataResponse[] = [
  {
    id: 'v1-id',
    versionNumber: 1,
    status: 'PUBLISHED',
    configurationSchemaVersion: 1,
    publishedBy: 'user-1',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    publishedAt: '2026-09-01T10:05:00.000Z',
  },
  {
    id: 'v2-id',
    versionNumber: 2,
    status: 'DRAFT',
    configurationSchemaVersion: 1,
    publishedBy: null,
    createdAt: '2026-09-02T10:00:00.000Z',
    updatedAt: '2026-09-02T10:00:00.000Z',
    publishedAt: null,
  },
];

describe('AgentVersionHistory - Rendering', () => {
  it('renders versions sorted by version number descending', () => {
    const html = renderToString(
      React.createElement(AgentVersionHistory, {
        versions: mockVersions,
        selectedVersionId: 'v2-id',
        onSelectVersion: () => {},
      }),
    );

    expect(html).toContain('agent-version-history');
    expect(html).toContain('v2');
    expect(html).toContain('v1');
    expect(html).toContain('Publicado em');
  });

  it('indicates the selected version with aria-selected true', () => {
    const html = renderToString(
      React.createElement(AgentVersionHistory, {
        versions: mockVersions,
        selectedVersionId: 'v2-id',
        onSelectVersion: () => {},
      }),
    );

    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('version-item-2');
  });

  it('renders empty notice when versions list is empty', () => {
    const html = renderToString(
      React.createElement(AgentVersionHistory, {
        versions: [],
        selectedVersionId: null,
        onSelectVersion: () => {},
      }),
    );

    expect(html).toContain('Nenhuma versão registrada.');
  });
});
