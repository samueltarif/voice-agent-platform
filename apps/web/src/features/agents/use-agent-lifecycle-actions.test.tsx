import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { useAgentLifecycleActions } from './use-agent-lifecycle-actions.js';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

function TestLifecycleComponent(props: Parameters<typeof useAgentLifecycleActions>[0]) {
  const actions = useAgentLifecycleActions(props);
  return (
    <div>
      <span id="pub-open">{actions.publishOpen ? 'true' : 'false'}</span>
      <span id="arch-open">{actions.archiveOpen ? 'true' : 'false'}</span>
      <span id="arch-mode">{actions.archiveMode}</span>
    </div>
  );
}

describe('useAgentLifecycleActions', () => {
  it('initializes with closed dialogs and archive mode', () => {
    const html = renderToString(
      React.createElement(TestLifecycleComponent, {
        agentId: 'agent-1',
        draftVersionId: 'v1',
      }),
    );

    expect(html).toContain('false');
    expect(html).toContain('archive');
  });
});
