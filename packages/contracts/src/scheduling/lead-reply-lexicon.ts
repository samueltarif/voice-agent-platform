/**
 * E2 PR 1 (DEC-075, 4ª auditoria) — vocabulário FECHADO do opt-out, só dados.
 * Formas escritas com a ortografia correta; a omissão de acento é a única
 * variante aceita (`lexical` em `lead-reply-text.ts`). Ampliar exige teste novo.
 */

export const MODALS = [
  'pode',
  'podem',
  'poderia',
  'poderiam',
  'dá pra',
  'tem como',
  'consegue',
  'conseguem',
];

/** Cortesia, saudação e interpelação: podem formar sozinhas uma cláusula independente. */
export const COURTESY = [
  'por favor',
  'pfv',
  'favor',
  'obrigado',
  'obrigada',
  'obrigado pela ligação',
  'obrigada pela ligação',
  'olha',
  'escuta',
  'oi',
  'olá',
  'ah',
  'bom dia',
  'boa tarde',
  'boa noite',
  'não obrigado',
  'não obrigada',
  'moço',
  'moça',
  'senhor',
  'senhora',
  'o senhor',
  'a senhora',
  'tchau',
  'valeu',
  'até logo',
  'até mais',
];

export const LEAD_INS = [
  ...MODALS,
  ...COURTESY,
  'então',
  'e',
  'agora',
  'depois',
  'já',
  'sim',
  'você',
  'vocês',
  'quero que',
  'eu quero que',
  'preciso que',
  'gostaria que',
  'eu gostaria que',
  'quero',
  'eu quero',
  'gostaria de',
  'eu gostaria de',
  'preciso',
];

export const TAILS = [
  'da lista',
  'de lista',
  'dessa lista',
  'desta lista',
  'da sua lista',
  'na lista',
  'do cadastro',
  'do seu cadastro',
  'dos contatos',
  'por favor',
  'obrigado',
  'obrigada',
  'agora',
  'já',
  'de vez',
  'mais',
  'nunca mais',
  'para mim',
  'pra mim',
  'de vocês',
  'daqui pra frente',
  'também',
];

/**
 * Trechos independentes completos, sem ação condicionada ao pedido. Uma
 * condição só é admitida quando traz AÇÃO PRÓPRIA do falante, por forma
 * inteira ("se eu precisar, ligo para vocês").
 */
export const INDEPENDENT_FORMS = [
  'não se preocupe',
  'não precisa confirmar a reunião',
  'hoje não posso',
  'não tenho interesse',
  'não tenho mais interesse',
  'já falei',
  'já pedi antes',
  'se eu precisar(?: eu)? ligo para vocês',
  'se precisar eu ligo',
];
