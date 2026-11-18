import { describe, expect, it } from 'vitest';
import { segmentKnowledgeText } from './knowledge-passage-segmenter.js';
import { chunkSpan, overlapLength, stitchChunks } from './knowledge-chunk-stitcher.js';

const brief = (text: string) =>
  segmentKnowledgeText(text).map((p) => ({ text: p.text, heading: p.heading }));

describe('segmentKnowledgeText (DEC-067)', () => {
  it('título separado do produto vira contexto de cada produto', () => {
    const text = 'VÁLVULAS\n\nVálvula VE-200\nAço inox.\n\nVálvula VG-150\nFerro fundido.';
    expect(brief(text)).toEqual([
      { text: 'Válvula VE-200\nAço inox.', heading: 'VÁLVULAS' },
      { text: 'Válvula VG-150\nFerro fundido.', heading: 'VÁLVULAS' },
    ]);
  });

  it('documento com vários produtos e várias seções troca o contexto', () => {
    const text = '# Válvulas\nVálvula VE-200 em inox.\n\n# Sensores\nSensor ST-10 de temperatura.';
    expect(brief(text).map((p) => p.heading)).toEqual(['Válvulas', 'Sensores']);
  });

  it('FAQ: pergunta isolada junta-se à resposta', () => {
    const text = 'Qual a garantia?\n\nA garantia é de 12 meses.\n\nTem frete?\n\nSim, para SP.';
    expect(brief(text).map((p) => p.text)).toEqual([
      'Qual a garantia?\nA garantia é de 12 meses.',
      'Tem frete?\nSim, para SP.',
    ]);
  });

  it('tabela: cada linha é passagem; legenda e cabeçalho viram contexto', () => {
    const text = 'Tabela de preços\n\nModelo\tPreço\nQT-310\tR$ 980,00\nQT-520\tR$ 1.250,00';
    expect(brief(text)).toEqual([
      { text: 'QT-310\tR$ 980,00', heading: 'Tabela de preços — Modelo | Preço' },
      { text: 'QT-520\tR$ 1.250,00', heading: 'Tabela de preços — Modelo | Preço' },
    ]);
  });

  it('linha curta com código de produto não é legenda', () => {
    const text = 'Válvula VE-200\n\nCorpo em aço inox.';
    expect(brief(text).map((p) => p.heading)).toEqual([undefined, undefined]);
  });

  it('parágrafo longo é cortado em frases de até 700 caracteres', () => {
    const sentence = `${'palavra '.repeat(30).trim()}.`;
    const parts = segmentKnowledgeText(Array(10).fill(sentence).join(' '));
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.text.length <= 700)).toBe(true);
  });

  it('posições apontam para o texto original', () => {
    const text = 'TÍTULO\n\nPrimeiro parágrafo.\n\nSegundo parágrafo.';
    for (const p of segmentKnowledgeText(text)) {
      expect(text.slice(p.start, p.start + p.text.length)).toBe(p.text);
    }
  });
});

describe('costura de trechos consecutivos', () => {
  const full =
    'Seção SD-50. O sensor SD-50 deve ser instalado a 1,5 m do piso, longe de fontes de calor. ' +
    'A fiação usa cabo blindado de 3 vias e aterramento único no painel.';
  const a = { ordinal: 0, text: full.slice(0, 110) };
  const b = { ordinal: 1, text: full.slice(70) };

  it('mede a sobreposição entre trechos', () => {
    expect(overlapLength(a.text, b.text)).toBe(40);
    expect(overlapLength('abc', 'xyz')).toBe(0);
  });

  it('reconstrói a passagem que atravessa o limite do trecho', () => {
    const [run] = stitchChunks([b, a]);
    expect(run!.text).toBe(full);
    const span = chunkSpan(run!, 20, full.length);
    expect([span.first.ordinal, span.last.ordinal]).toEqual([0, 1]);
  });

  it('trechos não consecutivos ficam em sequências separadas', () => {
    const runs = stitchChunks([a, { ordinal: 5, text: 'Outro assunto.' }]);
    expect(runs.map((r) => r.segments.length)).toEqual([1, 1]);
  });
});
