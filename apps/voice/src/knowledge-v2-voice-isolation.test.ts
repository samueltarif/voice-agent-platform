import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { callBootstrapSchema } from '@voice-agent/contracts';

/**
 * B2a (DEC-071): a voz NÃO ganhou o ramo `v2` nem `knowledge.search`. O
 * registro de ferramentas da voz é o mesmo de antes; o bootstrap só passa a
 * aceitar o campo opcional do snapshot (sem efeito na voz).
 */
const SRC = new URL('.', import.meta.url).pathname;

function productionSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return productionSources(full);
    return /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [full] : [];
  });
}

describe('voz × busca v2 (B2a)', () => {
  const sources = productionSources(SRC).map((file) => ({
    file,
    text: readFileSync(file, 'utf8'),
  }));

  it('nenhum código de produção da voz registra ferramentas', () => {
    expect(sources.filter((s) => /\.registerTool\(/.test(s.text)).map((s) => s.file)).toEqual([]);
  });

  it('nenhum código de produção da voz usa o ramo v2 ou o perfil de busca', () => {
    const v2 =
      /createKnowledgeSearchV2ToolDefinition|runKnowledgeTurnV2|KnowledgeV2ConcurrencyLimiter|KnowledgeAgentProjectionPort|resolveKnowledgeRetrievalProfile|retrievalProfile/;
    expect(sources.filter((s) => v2.test(s.text)).map((s) => s.file)).toEqual([]);
  });

  it('o bootstrap aceita snapshot com o campo opcional e recusa valor inválido', () => {
    const snapshot = {
      persona: {
        role: 'Atendente',
        companyName: 'Empresa',
        objective: 'Atender',
        tone: 'FORMAL',
        greetingPhrase: 'Olá',
        closingPhrase: 'Tchau',
        fallbackPhrase: 'Repita',
      },
      voice: { languageCode: 'pt-BR' },
      rules: { conversational: [], deterministic: {} },
    };
    const agentSnapshot = (knowledge?: unknown) => ({
      ...snapshot,
      ...(knowledge ? { knowledge } : {}),
    });
    const shape = callBootstrapSchema.shape.agentSnapshot;
    expect(shape.safeParse(agentSnapshot()).success).toBe(true);
    expect(shape.safeParse(agentSnapshot({ retrievalProfile: 'v2' })).success).toBe(true);
    expect(shape.safeParse(agentSnapshot({ retrievalProfile: 'v9' })).success).toBe(false);
  });
});
