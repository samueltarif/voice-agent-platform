import type { KnowledgeHostileSignal } from '@voice-agent/contracts';
import { foldKnowledgeText } from './knowledge-query-terms.js';

/**
 * Detector AUXILIAR de instruções hostis em documentos (B2b, DEC-069).
 * Determinístico, por padrões fixos e versionados. NÃO identifica todos os
 * ataques: paráfrases, encenação, outras línguas e homóglifos passam. Por isso
 * as outras camadas (exclusão da saída do agente, fatos com gramática fechada,
 * nenhum valor comercial vindo de documento) não dependem dele.
 * Padrões exigem verbo + alvo (instruções, assistente, regras), para não marcar
 * texto técnico legítimo ("ignore o primeiro alarme", "sistema de vedação").
 */
export const KNOWLEDGE_HOSTILE_DETECTOR_VERSION = 'b2b-1' as const;

export type HostileSignal = KnowledgeHostileSignal;

const W = String.raw`(?:\W+\w+){0,5}?\W+`;

const PATTERNS: ReadonlyArray<readonly [HostileSignal, RegExp]> = [
  [
    'ASSISTANT_COMMAND',
    new RegExp(
      `\\b(ignor\\w*|desconsider\\w*|esquec\\w*)${W}(instruc\\w*|regras?|orientac\\w*|comandos?|prompt)\\b`,
    ),
  ],
  [
    'ASSISTANT_COMMAND',
    new RegExp(`\\b(ignore|disregard|forget)${W}(instructions?|rules|prompt)\\b`),
  ],
  ['ASSISTANT_COMMAND', /\ba partir de agora\b.{0,60}\b(voce|vc)\b/],
  [
    'ASSISTANT_COMMAND',
    /\b(voce|vc) (agora )?(e|sera|deve ser) (o|a|um|uma) (assistente|gerente|vendedor|atendente|agente|robo|ia)\b/,
  ],
  [
    'ASSISTANT_COMMAND',
    /\b(informe|diga|responda|afirme|fale|comunique) (sempre )?(ao|aos|para o|para os|a) (cliente|clientes|usuario|usuarios|comprador)\b/,
  ],
  [
    'ASSISTANT_COMMAND',
    /\b(assistente|agente virtual|atendente virtual|chatbot|modelo de linguagem|inteligencia artificial)\b.{0,30}\b(deve|devera|precisa|tem que)\b/,
  ],
  // Só no início de linha ou frase: "energizar o sistema: ele indica…" é texto técnico.
  ['ROLE_MARKER', /(^|[.!?] )(sistema|system|assistente|assistant|developer|desenvolvedor) ?:/],
  [
    'ROLE_MARKER',
    /<\|[^|]{0,20}\|>|\[\/?inst\]|\bsystem prompt\b|\bprompt\b|\binstrucoes do sistema\b/,
  ],
  [
    'AUTHORITY_CLAIM',
    /\b(substitui|anula|revoga|cancela|invalida)\b.{0,40}\b(tabela|politica|regra|instruc\w*|preco)/,
  ],
  ['AUTHORITY_CLAIM', /\b(vale|valido|valida) para todos (os )?(produtos|clientes|itens)\b/],
  [
    'AUTHORITY_CLAIM',
    /\bindependentemente de (qualquer|outras?)\b.{0,20}\b(regra|instruc\w*|politica)/,
  ],
];

const INVISIBLE = /[\u00AD\u200B-\u200F\u2060\uFEFF]/g;

/**
 * Texto comparável: sem caracteres invisíveis, sem acento, minúsculo, quebras
 * de linha como fim de frase e espaços simples.
 */
export function normalizeForHostileDetection(text: string): string {
  const flat = text.replace(INVISIBLE, '').replace(/\s*\n\s*/g, '. ');
  return foldKnowledgeText(flat).replace(/\s+/g, ' ').trim();
}

/** Sinais encontrados (vazio = nada reconhecido; NÃO prova que o texto é seguro). */
export function detectHostileContent(text: string): HostileSignal[] {
  const normalized = normalizeForHostileDetection(text);
  const found = new Set<HostileSignal>();
  for (const [signal, pattern] of PATTERNS) if (pattern.test(normalized)) found.add(signal);
  return [...found];
}
