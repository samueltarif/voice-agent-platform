import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import type {
  AgentMetadataResponse,
  AgentVersionMetadataResponse,
  AgentConfigurationSnapshotV1,
} from '@voice-agent/contracts';
import { DEFAULT_AGENT_CONFIGURATION_V1 } from './agent-default-configuration.js';
import { AgentDetailWorkspace } from './agent-detail-workspace.js';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const mockAgent: AgentMetadataResponse = {
  id: 'agent-1',
  name: 'Atendimento Geral',
  slug: 'atendimento-geral',
  status: 'ACTIVE',
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-02T10:00:00.000Z',
  currentPublishedVersionNumber: 1,
};

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

const mockConfig: AgentConfigurationSnapshotV1 = DEFAULT_AGENT_CONFIGURATION_V1;

describe('AgentDetailWorkspace - View Modes', () => {
  it('renders editable editor when draft is selected and user has canEdit', () => {
    const html = renderToString(
      React.createElement(AgentDetailWorkspace, {
        agent: mockAgent,
        versions: mockVersions,
        draftVersion: mockVersions[1]!,
        draftConfig: mockConfig,
        publishedConfig: mockConfig,
        canReadConfig: true,
        canEdit: true,
        canPublish: true,
        canArchive: true,
        orgSlug: 'test-org',
      }),
    );

    expect(html).toContain('agent-detail-workspace');
    expect(html).toContain('agent-draft-editor');
    expect(html).toContain('btn-save-draft');
    expect(html).toContain('btn-publish-draft');
    expect(html).toContain('btn-archive-agent');
  });

  it('renders read-only banner when published version is selected and has no draft', () => {
    const html = renderToString(
      React.createElement(AgentDetailWorkspace, {
        agent: mockAgent,
        versions: [mockVersions[0]!],
        draftVersion: null,
        draftConfig: null,
        publishedConfig: mockConfig,
        canReadConfig: true,
        canEdit: true,
        canPublish: true,
        canArchive: true,
        orgSlug: 'test-org',
      }),
    );

    expect(html).toContain('version-read-only-banner');
    expect(html).toContain('Versão v1 (Publicada) — Somente Leitura');
    expect(html).not.toContain('btn-save-draft');
  });

  it('renders restricted notice and never renders configuration for VIEWER', () => {
    const html = renderToString(
      React.createElement(AgentDetailWorkspace, {
        agent: mockAgent,
        versions: mockVersions,
        draftVersion: mockVersions[1]!,
        draftConfig: null,
        publishedConfig: null,
        canReadConfig: false,
        canEdit: false,
        canPublish: false,
        canArchive: false,
        orgSlug: 'test-org',
      }),
    );

    expect(html).toContain('Visualização Restrita');
    expect(html).not.toContain('agent-draft-editor');
    expect(html).not.toContain('btn-publish-draft');
    expect(html).not.toContain('btn-archive-agent');
  });
});
