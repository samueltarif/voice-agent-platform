import { describe, expect, it } from 'vitest';
import { analyzeKnowledgeQueryV2, stemVerbV2 } from './knowledge-query-analysis-v2.js';
import { compileTerms, countTerm, termPositions } from './knowledge-term-matcher-v2.js';
import { foldKnowledgeText } from './knowledge-query-terms.js';

const count = (text: string, words: string[], codes: string[] = []) =>
  compileTerms(words, codes).map((t) => countTerm(foldKnowledgeText(text), t));

describe('analyzeKnowledgeQueryV2 — códigos de produto (DEC-067)', () => {
  it.each(['QT-310', 'QT 310', 'qt310', 'Qt.310', 'QT/310'])('"%s" vira o código qt310', (code) => {
    expect(analyzeKnowledgeQueryV2(`Qual o prazo do ${code}?`).codes).toEqual(['qt310']);
  });

  it('QT-3100 é outro código', () => {
    expect(analyzeKnowledgeQueryV2('Preço do QT-3100').codes).toEqual(['qt3100']);
  });

  it('artigo/preposição seguido de número não vira código', () => {
    const r = analyzeKnowledgeQueryV2('faixa de 400 bar em 2 dias');
    expect(r.codes).toEqual([]);
  });

  it('com código, palavras vazias não viram termos', () => {
    const r = analyzeKnowledgeQueryV2('o que é o QT-310?');
    expect(r).toMatchObject({ codes: ['qt310'], words: [] });
  });

  it('detecta aspectos comerciais pedidos', () => {
    const r = analyzeKnowledgeQueryV2('Qual o preço e o prazo de entrega da VE-200?');
    expect(r.aspects).toEqual(['PRICE', 'LEAD_TIME']);
  });

  it('pergunta sem aspecto comercial', () => {
    expect(analyzeKnowledgeQueryV2('Como instalar o sensor?').aspects).toEqual([]);
  });
});

describe('stemVerbV2', () => {
  it('reduz infinitivos longos ao radical', () => {
    expect(stemVerbV2('calibrar')).toBe('calibr');
    expect(stemVerbV2('instalar')).toBe('instal');
  });

  it('não mexe em palavras curtas nem em não-infinitivos', () => {
    expect(stemVerbV2('valor')).toBe('valor');
    expect(stemVerbV2('transmissor')).toBe('transmissor');
  });
});

describe('casamento de termos v2', () => {
  it('código casa com qualquer separador e nunca com o código mais longo', () => {
    const text = 'QT-310 / QT 310 / qt310 / QT.310 / QT-3100 / XQT310';
    expect(count(text, [], ['qt310'])).toEqual([4]);
  });

  it('número casa inteiro (310 não casa 3100)', () => {
    expect(count('modelos 310 e 3100', ['310'])).toEqual([1]);
  });

  it('palavra casa no início de palavra (plural sim, palavra interna não)', () => {
    expect(count('Transmissores e retransmissor', ['transmissor'])).toEqual([1]);
  });

  it('acentos são ignorados', () => {
    expect(count('Calibração em pressão', ['calibr', 'pressao'])).toEqual([1, 1]);
  });

  it('posições permitem medir proximidade', () => {
    const [term] = compileTerms(['bar'], []);
    expect(termPositions('0 a 25 bar e 40 bar', term!)).toEqual([7, 16]);
  });

  it('o padrão é reutilizável (sem estado entre chamadas)', () => {
    const [term] = compileTerms([], ['qt310']);
    expect(countTerm('qt-310 qt 310', term!)).toBe(2);
    expect(countTerm('qt-310 qt 310', term!)).toBe(2);
  });
});
