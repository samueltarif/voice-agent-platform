import { renderReadbackSpeech, renderSlotLabel } from './scheduling-speech.js';

/**
 * E2 simplificada (DEC-077; reauditoria #184 A1) — o aceite só é reconhecido
 * quando a fala do agente imediatamente anterior TERMINA com a pergunta
 * CANÔNICA de confirmação que a própria VAP gera para a oferta
 * (`renderReadbackSpeech` + `renderSlotLabel`: dia, data, hora e fuso), e
 * que a ferramenta `scheduling.find_slots` devolve em `confirmationQuestion`.
 *
 * Não há interpretação de linguagem natural: a comparação ignora só
 * maiúsculas, acentos, pontuação e espaços. Qualquer paráfrase, outra
 * finalidade ("posso ligar…"), outro período ("9 da noite"), alternativa
 * depois da pergunta ou texto não literal ⇒ não reconhecido ⇒ revisão humana.
 * (E2-V: `strict` não garante reprodução literal — a consequência é revisão,
 * nunca reserva.)
 */

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

export function canonicalReadback(startsAt: string, timeZone: string): string {
  return renderReadbackSpeech(renderSlotLabel(startsAt, timeZone));
}

export function endsWithCanonicalReadback(
  text: string,
  startsAt: string,
  timeZone: string,
): boolean {
  if (!text) return false;
  const spoken = normalize(text);
  const canonical = normalize(canonicalReadback(startsAt, timeZone));
  return spoken === canonical || spoken.endsWith(` ${canonical}`);
}
