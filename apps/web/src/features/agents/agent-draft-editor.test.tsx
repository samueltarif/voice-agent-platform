import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { AgentDraftEditor } from './agent-draft-editor.js';
import { DEFAULT_AGENT_CONFIGURATION_V1 } from './agent-default-configuration.js';

describe('AgentDraftEditor (Component)', () => {
  it('renders editor sections and actions in editable mode', () => {
    const html = renderToString(
      React.createElement(AgentDraftEditor, {
        agentId: 'agent-1',
        versionId: 'ver-1',
        initialConfiguration: DEFAULT_AGENT_CONFIGURATION_V1,
        readOnly: false,
      }),
    );

    expect(html).toContain('Editor de Rascunho');
    expect(html).toContain('Sincronizado');
    expect(html).toContain('Salvar rascunho');
    expect(html).toContain('Descartar rascunho');
    expect(html).toContain('Persona e Identidade Vocal');
    expect(html).toContain('Regras de Comportamento');
    expect(html).toContain('Idioma e Síntese de Voz');
    expect(html).toContain('Ferramentas do Agente');
    expect(html).toContain('agent.operating_hours');
  });

  it('renders without action buttons in readOnly mode', () => {
    const html = renderToString(
      React.createElement(AgentDraftEditor, {
        agentId: 'agent-1',
        versionId: 'ver-1',
        initialConfiguration: DEFAULT_AGENT_CONFIGURATION_V1,
        readOnly: true,
      }),
    );

    expect(html).toContain('Editor de Rascunho');
    expect(html).not.toContain('Salvar rascunho');
    expect(html).not.toContain('Descartar rascunho');
  });
});
