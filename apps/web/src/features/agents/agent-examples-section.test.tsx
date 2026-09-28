import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { AgentExamplesSection } from './agent-examples-section.js';

describe('AgentExamplesSection', () => {
  it('renders examples when list is provided', () => {
    const onChange = vi.fn();

    const html = renderToString(
      React.createElement(AgentExamplesSection, {
        examples: [{ customerInput: 'Tem desconto?', idealAgentResponse: 'Temos 5% no PIX.' }],
        onChange,
      }),
    );

    expect(html).toContain('Exemplos Few-Shot de Conversação');
    expect(html).toContain('Exemplo 1');
    expect(html).toContain('Tem desconto?');
    expect(html).toContain('Temos 5% no PIX.');
  });

  it('renders empty state when list is empty', () => {
    const onChange = vi.fn();

    const html = renderToString(
      React.createElement(AgentExamplesSection, {
        examples: [],
        onChange,
      }),
    );

    expect(html).toContain('Nenhum exemplo conversacional cadastrado.');
  });
});
