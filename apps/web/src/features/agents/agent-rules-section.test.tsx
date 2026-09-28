import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { AgentRulesSection } from './agent-rules-section.js';
import { DEFAULT_AGENT_CONFIGURATION_V1 } from './agent-default-configuration.js';

describe('AgentRulesSection', () => {
  it('renders conversational rules and deterministic rule inputs', () => {
    const rules = DEFAULT_AGENT_CONFIGURATION_V1.rules;
    const onChange = vi.fn();

    const html = renderToString(
      React.createElement(AgentRulesSection, {
        rules,
        onChange,
      }),
    );

    expect(html).toContain('Regras de Comportamento');
    expect(html).toContain('Regras Conversacionais');
    expect(html).toContain('Limites Determinísticos');
    expect(html).toContain('Desconto Máximo (%)');
    expect(html).toContain('Horário de Atendimento');
    expect(html).toContain('+ Adicionar regra');
    expect(html).toContain(rules.conversational[0]);
  });

  it('renders empty message when conversational rules list is empty', () => {
    const onChange = vi.fn();

    const html = renderToString(
      React.createElement(AgentRulesSection, {
        rules: { conversational: [], deterministic: {} },
        onChange,
      }),
    );

    expect(html).toContain('Nenhuma regra conversacional definida.');
  });
});
