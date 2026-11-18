import type { KnowledgeCommercialAspect } from '@voice-agent/contracts';
import { foldKnowledgeText } from './knowledge-query-terms.js';

/**
 * Intenção comercial da pergunta em português brasileiro (B2b, revisão).
 * Reconhece FAMÍLIAS de formas (verbos conjugados, coloquialismos e
 * locuções), não só os substantivos de `KNOWLEDGE_ASPECT_TERMS`: "parcelam",
 * "como eu pago", "quanto cobram", "em quantos dias chega", "pronta entrega".
 *
 * Usada SOMENTE para listar, na projeção do agente, os aspectos que exigem
 * fonte comercial autorizada. Não altera ranking, evidência nem a v1. Errar
 * para mais só acrescenta um aviso; nenhum valor comercial sai de documento.
 */
export const KNOWLEDGE_COMMERCIAL_INTENT_VERSION = 'b2b-intent-1' as const;

const B = String.raw`(?<![\p{L}\p{N}])`;
const E = String.raw`(?![\p{L}\p{N}])`;
const family = (body: string) => new RegExp(`${B}(?:${body})${E}`, 'u');

// Formas que também têm sentido técnico exigem contexto comercial:
// "entrega sinal de 4-20 mA", "chega a 16 bar", "dividido em zonas", "vista frontal".
const NOT_TECHNICAL = String.raw`(?! (?:sinal|saida|corrente|tensao|potencia|torque|vazao|pressao|a \d))`;

const INTENT: ReadonlyArray<readonly [KnowledgeCommercialAspect, RegExp]> = [
  [
    'PRICE',
    family(
      [
        'precos?|precinhos?|valor(?:es)?|custos?|custa[mr]?|custaria[m]?|orcamentos?|cotac(?:ao|oes)|cotar',
        'cobra[mr]?|cobram|cobraria[m]?|cobrado|quanto (?:sai|fica|vale|esta)|sai (?:a|por) quanto',
        'mais barat[oa]s?|frete',
      ].join('|'),
    ),
  ],
  [
    'LEAD_TIME',
    family(
      [
        `prazos?|(?:entrega[mr]?|entregam|entregue|entregaria[m]?|chega[mr]?|chegaria)${NOT_TECHNICAL}`,
        'quantos dias|despacha[mr]?|despachado|envio',
      ].join('|'),
    ),
  ],
  [
    'STOCK',
    family(
      [
        'estoques?|disponibilidade|disponive(?:l|is)|pronta entrega|esgotad[oa]s?',
        'em maos|ainda tem|tem unidades?|quantas unidades',
      ].join('|'),
    ),
  ],
  [
    'PAYMENT',
    family(
      [
        'pagamentos?|paga[mr]?|pago|pagaria|parcel\\w*|a vista(?! (?:frontal|lateral|superior|explodida))',
        'divid\\w*(?= .{0,30}(?:pagamento|vezes|cartao|parcela|\\d+ ?x))|boleto|pix|cartao',
        'descontos?|descontinho|abatimento|precinho melhor',
      ].join('|'),
    ),
  ],
  ['WARRANTY', family('garantias?')],
];

/** Aspectos comerciais pedidos (ordem fixa, sem repetição). */
export function detectCommercialIntent(queryText: string): KnowledgeCommercialAspect[] {
  const folded = foldKnowledgeText(queryText).replace(/\s+/g, ' ');
  return INTENT.filter(([, pattern]) => pattern.test(folded))
    .map(([aspect]) => aspect)
    .filter((aspect, i, all) => all.indexOf(aspect) === i);
}
