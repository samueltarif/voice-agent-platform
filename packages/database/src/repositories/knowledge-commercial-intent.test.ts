import { describe, expect, it } from 'vitest';
import { detectCommercialIntent } from './knowledge-commercial-intent.js';

/**
 * Variações reais de pedidos comerciais em pt-BR (formas verbais, coloquiais e
 * locuções). Não contém as perguntas do holdout do corpus adversarial.
 */
const COMMERCIAL: ReadonlyArray<readonly [string, string]> = [
  ['Vocês parcelam o PT-16?', 'PAYMENT'],
  ['Parcela em quantas vezes?', 'PAYMENT'],
  ['Como eu pago o TT-200?', 'PAYMENT'],
  ['Posso pagar no boleto?', 'PAYMENT'],
  ['Aceitam pix?', 'PAYMENT'],
  ['Consigo dividir em 10x?', 'PAYMENT'],
  ['Tem desconto pra pagamento antecipado?', 'PAYMENT'],
  ['Rola um descontinho?', 'PAYMENT'],
  ['Quanto vocês cobram pelo PS-8?', 'PRICE'],
  ['Quanto sai o MV-50?', 'PRICE'],
  ['Quanto custa o PT-160?', 'PRICE'],
  ['Me passa um orçamento do TT-200', 'PRICE'],
  ['Qual o frete pra Curitiba?', 'PRICE'],
  ['Em quantos dias chega o MV-50?', 'LEAD_TIME'],
  ['Quando vocês entregam?', 'LEAD_TIME'],
  ['Qual o prazo do PS-8?', 'LEAD_TIME'],
  ['Vocês despacham hoje?', 'LEAD_TIME'],
  ['Tem o PT-160 pra pronta entrega?', 'STOCK'],
  ['Ainda tem o TT-200?', 'STOCK'],
  ['O PS-8 está disponível?', 'STOCK'],
  ['O MV-50 esgotou? Está esgotado?', 'STOCK'],
  ['Quantas unidades vocês têm em estoque?', 'STOCK'],
  ['Qual a garantia do PT-16?', 'WARRANTY'],
];

/** Perguntas técnicas com palavras ambíguas: nenhuma vira aspecto comercial. */
const TECHNICAL: readonly string[] = [
  'O PT-16 entrega sinal de 4-20 mA?',
  'A pressão chega a 16 bar?',
  'Qual a faixa de pressão do PT-16?',
  'Qual a vista frontal do painel?',
  'O display é dividido em quantas zonas?',
  'Quanto tempo dura a calibração do TT-200?',
  'Qual a precisão do MV-50?',
  'O PS-8 tem contato SPDT?',
  'Quantos fios tem o cabo do PT-16?',
  'Qual a alimentação do TT-200?',
];

describe('detectCommercialIntent (B2b, pt-BR)', () => {
  it.each(COMMERCIAL)('reconhece pedido comercial: %s', (text, aspect) => {
    expect(detectCommercialIntent(text)).toContain(aspect);
  });

  it.each(TECHNICAL)('não marca pergunta técnica: %s', (text) => {
    expect(detectCommercialIntent(text)).toEqual([]);
  });

  it('lista vários aspectos na ordem fixa, sem repetir', () => {
    expect(detectCommercialIntent('Qual o preço e a garantia? Tem desconto à vista?')).toEqual([
      'PRICE',
      'PAYMENT',
      'WARRANTY',
    ]);
  });
});
