/**
 * Passagens da busca v2 (DEC-067): divide o texto de um documento (trechos
 * gravados já costurados) em unidades de assunto, sem alterar o que está
 * gravado. Regras determinísticas:
 * - título (linha `#`, linha curta em caixa alta, numeração curta, linha
 *   curta terminada em `:`) não é passagem: vira o contexto das seguintes;
 * - parágrafo (bloco entre linhas em branco) é uma passagem; pergunta isolada
 *   terminada em `?` junta-se à resposta seguinte (FAQ);
 * - linha de tabela (tabulação ou `|`) é uma passagem; o título da tabela e a
 *   linha de cabeçalho viram o seu contexto;
 * - parágrafo longo é cortado em frases (até `MAX_PASSAGE_CHARS`).
 */
export interface KnowledgePassage {
  readonly text: string;
  /** Posição no texto costurado (para mapear de volta aos trechos gravados). */
  readonly start: number;
  readonly heading?: string | undefined;
}

export const MAX_PASSAGE_CHARS = 700;

interface Block {
  readonly text: string;
  readonly start: number;
}

function blocks(text: string): Block[] {
  const out: Block[] = [];
  const re = /[^\n](?:[^\n]|\n(?!\s*\n))*/g;
  for (let m = re.exec(text); m; m = re.exec(text)) out.push({ text: m[0], start: m.index });
  return out;
}

const letters = (line: string) => line.replace(/[^\p{L}]/gu, '');

const isUpperCaseLine = (t: string) => {
  const l = letters(t);
  return l.length >= 3 && l === l.toUpperCase();
};
const isNumberedTitle = (t: string) => /^\d+(\.\d+)*[.)]?\s+\S/.test(t) && t.length <= 40;
const isMarkedTitle = (t: string) => t.startsWith('#') || (t.endsWith(':') && t.length <= 60);

export function isHeadingLine(line: string): boolean {
  const t = line.trim();
  if (t.length === 0 || t.length > 80 || /[.!?]$/.test(t)) return false;
  return isMarkedTitle(t) || isUpperCaseLine(t) || isNumberedTitle(t);
}

/** Linha isolada curta, sem pontuação final e sem código de produto (ex.: legenda de tabela). */
function isSoftHeading(line: string): boolean {
  const t = line.trim();
  const hasCode = /\p{L}[-./\s]?\p{N}|\p{N}[-./]?\p{L}/u.test(t.replace(/\d+\/\d+(\/\d+)?/g, ''));
  return t.length > 0 && t.length <= 80 && !/[.!?;]$/.test(t) && !hasCode;
}

const isTableLine = (line: string) => /\t|\|/.test(line) && line.trim().split(/\t|\|/).length >= 2;

function splitLong(block: Block): Block[] {
  if (block.text.length <= MAX_PASSAGE_CHARS) return [block];
  const parts: Block[] = [];
  const sentence = /[^.!?\n]+(?:[.!?]+|$)\s*/g;
  let current = { text: '', start: block.start };
  for (let m = sentence.exec(block.text); m && m[0]; m = sentence.exec(block.text)) {
    if (current.text && current.text.length + m[0].length > MAX_PASSAGE_CHARS) {
      parts.push(current);
      current = { text: '', start: block.start + m.index };
    }
    current = { text: current.text + m[0], start: current.start };
  }
  if (current.text.trim()) parts.push(current);
  return parts;
}

interface State {
  heading?: string | undefined;
  pendingQuestion?: Block | undefined;
  readonly out: KnowledgePassage[];
}

function push(state: State, block: Block): void {
  const q = state.pendingQuestion;
  state.pendingQuestion = undefined;
  const merged = q ? { text: `${q.text}\n${block.text}`, start: q.start } : block;
  for (const part of splitLong(merged)) {
    const text = part.text.trim();
    if (text) state.out.push({ text, start: part.start, heading: state.heading });
  }
}

/** Remove as linhas de título do início do bloco (viram contexto) e devolve o deslocamento. */
function takeHeadings(state: State, lines: string[], start: number): number {
  let offset = start;
  while (lines.length > 0 && isHeadingLine(lines[0]!)) {
    state.heading = lines[0]!.trim().replace(/^#+\s*/, '');
    offset += lines.shift()!.length + 1;
  }
  return offset;
}

/**
 * Tabela: a 1ª linha é o cabeçalho (vira contexto, junto do título, e não é
 * passagem); cada linha seguinte é uma passagem.
 */
function pushTableRows(state: State, lines: readonly string[], start: number): void {
  const [header, ...rows] = lines;
  const caption = state.heading;
  state.heading = [caption, header!.trim().replace(/\s*(\t|\|)\s*/g, ' | ')]
    .filter(Boolean)
    .join(' — ');
  let offset = start + header!.length + 1;
  for (const line of rows) {
    push(state, { text: line, start: offset });
    offset += line.length + 1;
  }
  state.heading = caption;
}

/** Bloco de uma linha curta (não a última, não tabela) usado como título: legenda. */
const isLegend = (lines: readonly string[], last: boolean) =>
  lines.length === 1 && !last && isSoftHeading(lines[0]!) && !isTableLine(lines[0]!);

/** Linhas de título no início do bloco viram contexto; o resto segue as regras. */
function consumeBlock(state: State, block: Block, last: boolean): void {
  const lines = block.text.split('\n');
  if (isLegend(lines, last)) {
    state.heading = lines[0]!.trim();
    return;
  }
  const offset = takeHeadings(state, lines, block.start);
  if (lines.length === 0) return;
  if (lines.every(isTableLine)) return pushTableRows(state, lines, offset);
  const body = { text: lines.join('\n'), start: offset };
  if (lines.length === 1 && body.text.trim().endsWith('?')) state.pendingQuestion = body;
  else push(state, body);
}

export function segmentKnowledgeText(text: string): KnowledgePassage[] {
  const state: State = { out: [] };
  const list = blocks(text);
  list.forEach((block, i) => consumeBlock(state, block, i === list.length - 1));
  if (state.pendingQuestion) push(state, { text: '', start: state.pendingQuestion.start });
  return state.out;
}
