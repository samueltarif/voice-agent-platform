import { KNOWLEDGE_UPLOAD_ERROR_CODES as CODES } from '@voice-agent/contracts';
import { KnowledgeExtractionError } from './extraction-error.js';
import { readDocxArchive } from './read-docx-archive.js';

const MAIN_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';

/** `DOCTYPE`/`ENTITY` habilitariam entidades externas (XXE): nunca aceitos. */
function assertSafeXml(xml: string): void {
  if (/<!DOCTYPE/i.test(xml) || /<!ENTITY/i.test(xml)) {
    throw new KnowledgeExtractionError(CODES.UNSAFE_XML);
  }
}

function assertWordDocument(contentTypes: string): void {
  assertSafeXml(contentTypes);
  if (/macroEnabled/i.test(contentTypes)) throw new KnowledgeExtractionError(CODES.MACRO_ENABLED);
  if (!contentTypes.includes(MAIN_CONTENT_TYPE)) {
    throw new KnowledgeExtractionError(CODES.FORMAT_MISMATCH);
  }
}

const NAMED: Readonly<Record<string, string>> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
};

/** Só as 5 entidades do XML e referências numéricas; nada é resolvido fora do texto. */
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, ref: string) => {
    if (ref[0] !== '#') return NAMED[ref] ?? match;
    const code =
      ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
}

const TOKEN = /<(\/?)(w:p|w:t|w:tab|w:br|w:cr|w:tc|w:tr)(?=[\s/>])[^>]*?(\/?)>|<[^>]*>|([^<]+)/g;

/** Marcas vazias que viram separador onde aparecem. */
const BREAKS: Readonly<Record<string, string>> = {
  'w:tab': '\t',
  'w:br': '\n',
  'w:cr': '\n',
};

/** Fim de parágrafo ou de linha de tabela ⇒ quebra; fim de célula ⇒ tabulação. */
const ENDINGS: Readonly<Record<string, string>> = {
  'w:p': '\n',
  'w:tr': '\n',
  'w:tc': '\t',
};

function separatorFor(tag: string, closing: boolean, selfClosing: boolean): string {
  if (!closing && BREAKS[tag]) return BREAKS[tag];
  return closing || selfClosing ? (ENDINGS[tag] ?? '') : '';
}

/**
 * Texto do corpo principal (`word/document.xml`): só o conteúdo de `<w:t>`,
 * tabulações, quebras, parágrafos e tabelas. Cabeçalhos, rodapés, notas,
 * comentários e texto excluído (`w:delText`) não entram. Relações externas
 * (hiperlinks, modelos) nunca são seguidas.
 */
export function extractDocxText(bytes: Uint8Array): string {
  const { contentTypes, document } = readDocxArchive(bytes);
  assertWordDocument(contentTypes);
  assertSafeXml(document);
  if (!/<\/w:document>\s*$/.test(document))
    throw new KnowledgeExtractionError(CODES.MALFORMED_FILE);
  const out: string[] = [];
  let inText = false;
  for (const m of document.matchAll(TOKEN)) {
    const [, closing, tag, selfClosing, text] = m;
    if (text !== undefined) {
      if (inText) out.push(decodeEntities(text));
    } else if (tag === 'w:t') {
      inText = !closing && !selfClosing;
    } else if (tag) {
      out.push(separatorFor(tag, Boolean(closing), Boolean(selfClosing)));
    }
  }
  return out.join('');
}
