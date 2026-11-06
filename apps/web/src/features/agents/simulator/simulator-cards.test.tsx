import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AgentConfigurationSnapshotV1 } from '@voice-agent/contracts';
import { DEFAULT_AGENT_CONFIGURATION_V1 } from '../agent-default-configuration.js';
import { SimulatorContextCard } from './simulator-context-card.js';
import { SimulatorToolsCard } from './simulator-tools-card.js';

const base: AgentConfigurationSnapshotV1 = { ...DEFAULT_AGENT_CONFIGURATION_V1 };
const { playbook: _p, examples: _e, ...noGuidance } = base;
const stage = (i: number) => ({ name: `Etapa nome ${i}`, goal: `Objetivo ${i}` });

describe('SimulatorContextCard', () => {
  it('distinguishes missing playbook, empty playbook and missing examples', () => {
    const missing = renderToString(<SimulatorContextCard config={noGuidance} />);
    expect(missing).toContain('Nenhum roteiro definido nesta configuração.');
    expect(missing).toContain('Nenhum exemplo cadastrado nesta configuração.');
    const empty = renderToString(
      <SimulatorContextCard config={{ ...noGuidance, playbook: { stages: [] } }} />,
    );
    expect(empty).toContain('Roteiro definido, mas sem etapas.');
    expect(empty).not.toContain('simulator-stages-list');
  });

  it('shows the stages and examples computed by the rule, with limits and cuts', () => {
    const config = {
      ...noGuidance,
      playbook: { stages: Array.from({ length: 15 }, (_v, i) => stage(i)) },
      examples: [{ customerInput: 'x'.repeat(900), idealAgentResponse: 'Resposta curta' }],
    };
    const html = renderToString(<SimulatorContextCard config={config} />);
    expect(html).toContain('12 de 15 etapas entram no contexto (limite: 12).');
    expect(html).toContain('Etapa nome 11');
    expect(html).not.toContain('Etapa nome 12');
    expect(html).toContain('1 de 1 exemplos entram no contexto');
    expect(html).toContain('1 texto(s) cortado(s)');
    expect(html).toContain('…');
    expect(html).not.toContain('x'.repeat(600));
    expect(html).toContain('break-words');
    expect(html).toContain('não é resposta de IA');
  });
});

describe('SimulatorToolsCard', () => {
  const config = { ...base, tools: ['catalog.search' as const] };

  it('labels configuration state per version and never claims authorization', () => {
    const draft = renderToString(<SimulatorToolsCard config={config} kind="DRAFT" />);
    expect(draft).toContain('Configurada no rascunho');
    expect(draft).toContain('Não configurada');
    const published = renderToString(<SimulatorToolsCard config={config} kind="PUBLISHED" />);
    expect(published).toContain('Configurada na versão publicada');
    for (const html of [draft, published]) {
      expect(html).not.toMatch(/Permitida|Autorizada|autorizada para executar/);
      expect(html).toContain('concessão confiável emitida pelo servidor');
      expect(html).not.toContain('<button');
    }
  });
});
