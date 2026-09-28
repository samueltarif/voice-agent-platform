import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { AgentVoiceSection } from './agent-voice-section.js';

describe('AgentVoiceSection', () => {
  it('renders language selection options', () => {
    const onChange = vi.fn();

    const html = renderToString(
      React.createElement(AgentVoiceSection, {
        voice: { languageCode: 'pt-BR' },
        onChange,
      }),
    );

    expect(html).toContain('Idioma e Síntese de Voz');
    expect(html).toContain('Português (Brasil)');
    expect(html).toContain('Inglês (Estados Unidos)');
    expect(html).toContain('Espanhol (Espanha)');
  });
});
