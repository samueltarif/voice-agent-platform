import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { AgentPersonaSection } from './agent-persona-section.js';
import { DEFAULT_AGENT_CONFIGURATION_V1 } from './agent-default-configuration.js';

describe('AgentPersonaSection', () => {
  it('renders all persona fields with existing values', () => {
    const persona = DEFAULT_AGENT_CONFIGURATION_V1.persona;
    const onChange = vi.fn();

    const html = renderToString(
      React.createElement(AgentPersonaSection, {
        persona,
        onChange,
      }),
    );

    expect(html).toContain('Persona e Identidade Vocal');
    expect(html).toContain(persona.role);
    expect(html).toContain(persona.companyName);
    expect(html).toContain(persona.objective);
    expect(html).toContain(persona.greetingPhrase);
    expect(html).toContain(persona.closingPhrase);
    expect(html).toContain(persona.fallbackPhrase);
  });
});
