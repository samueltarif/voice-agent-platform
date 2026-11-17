import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_UPLOAD_ERROR_CODES as CODES } from '@voice-agent/contracts';
import { extractDocxText } from './extract-docx-text.js';
import {
  buildDocx,
  contentTypesXml,
  documentXml,
  paragraph,
} from './test-support/build-docx-fixture.js';

const codeOf = (bytes: Uint8Array) => {
  try {
    extractDocxText(bytes);
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return 'NO_ERROR';
};

describe('extractDocxText — main body', () => {
  it('extracts paragraphs, tabs, breaks, tables and entities from w:t only', () => {
    const body =
      paragraph('Transmissor QT-310 &amp; QT-520') +
      '<w:p><w:r><w:t>A</w:t><w:tab/><w:t>B</w:t><w:br/><w:t>C</w:t></w:r></w:p>' +
      '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Modelo</w:t></w:r></w:p></w:tc>' +
      '<w:tc><w:p><w:r><w:t>Faixa</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
      '<w:p><w:r><w:delText>apagado</w:delText><w:instrText>HYPERLINK</w:instrText></w:r></w:p>' +
      paragraph('&lt;b&gt;não é HTML&lt;/b&gt; &#233;');
    const text = extractDocxText(buildDocx({ document: documentXml(body) }));
    expect(text).toContain('Transmissor QT-310 & QT-520\n');
    expect(text).toContain('A\tB\nC\n');
    expect(text).toContain('Modelo\n\tFaixa\n\t\n');
    expect(text).toContain('<b>não é HTML</b> é');
    expect(text).not.toContain('apagado');
    expect(text).not.toContain('HYPERLINK');
  });

  it('ignores headers, footers, comments and external relationships', () => {
    const bytes = buildDocx({
      extra: {
        'word/header1.xml': documentXml(paragraph('CABECALHO')),
        'word/_rels/document.xml.rels':
          '<Relationships><Relationship TargetMode="External" Target="http://evil"/></Relationships>',
      },
    });
    const text = extractDocxText(bytes);
    expect(text).toBe('Olá\n');
  });
});

describe('extractDocxText — refusals before or during decompression', () => {
  it('refuses macro-enabled documents', () => {
    const macroType = 'application/vnd.ms-word.document.macroEnabled.main+xml';
    expect(codeOf(buildDocx({ contentTypes: contentTypesXml(macroType) }))).toBe(
      CODES.MACRO_ENABLED,
    );
    expect(codeOf(buildDocx({ extra: { 'word/vbaProject.bin': new Uint8Array(8) } }))).toBe(
      CODES.MACRO_ENABLED,
    );
  });

  it('refuses DOCTYPE / ENTITY declarations (XXE) in any part read', () => {
    const xxe =
      '<?xml version="1.0"?><!DOCTYPE d [<!ENTITY x SYSTEM "file:///etc/passwd">]>' +
      documentXml(paragraph('&x;')).replace(/^<\?xml[^>]*>/, '');
    expect(codeOf(buildDocx({ document: xxe }))).toBe(CODES.UNSAFE_XML);
    const ct = '<!DOCTYPE t>' + contentTypesXml();
    expect(codeOf(buildDocx({ contentTypes: ct }))).toBe(CODES.UNSAFE_XML);
  });

  it('refuses non-Word packages and corrupted archives', () => {
    expect(codeOf(buildDocx({ contentTypes: contentTypesXml('application/xml') }))).toBe(
      CODES.FORMAT_MISMATCH,
    );
    const valid = buildDocx();
    expect(codeOf(valid.slice(0, valid.length - 30))).toBe(CODES.MALFORMED_FILE);
    const noDocument = zipSync({ '[Content_Types].xml': strToU8(contentTypesXml()) });
    expect(codeOf(noDocument)).toBe(CODES.MALFORMED_FILE);
    expect(codeOf(buildDocx({ document: '<w:document><w:body>' }))).toBe(CODES.MALFORMED_FILE);
  });

  it('refuses zip bombs by compression ratio and too many entries', () => {
    const bomb = documentXml(paragraph('a'.repeat(5_000_000)));
    expect(codeOf(buildDocx({ document: bomb }))).toBe(CODES.ARCHIVE_LIMIT_EXCEEDED);
    const extra: Record<string, string> = {};
    for (let i = 0; i < 1001; i += 1) extra[`x/${i}.xml`] = '';
    expect(codeOf(buildDocx({ extra }))).toBe(CODES.ARCHIVE_LIMIT_EXCEEDED);
  });

  it('a lying declared size cannot inflate output: the truncated XML is refused', () => {
    const bytes = buildDocx({ document: documentXml(paragraph('conteúdo real '.repeat(50))) });
    const forged = forgeDeclaredSize(bytes, 'word/document.xml', 64);
    expect(codeOf(forged)).toBe(CODES.MALFORMED_FILE);
  });
});

/** Reescreve o tamanho descompactado declarado (cabeçalho local e diretório central). */
function forgeDeclaredSize(zip: Uint8Array, name: string, size: number): Uint8Array {
  const out = zip.slice();
  const view = new DataView(out.buffer);
  const encoded = new TextEncoder().encode(name);
  for (let i = 0; i < out.length - 4; i += 1) {
    const sig = view.getUint32(i, true);
    const local = sig === 0x04034b50;
    if (!local && sig !== 0x02014b50) continue;
    const nameAt = i + (local ? 30 : 46);
    const nameLen = view.getUint16(i + (local ? 26 : 28), true);
    const same = nameLen === encoded.length && encoded.every((b, k) => out[nameAt + k] === b);
    if (same) view.setUint32(i + (local ? 22 : 24), size, true);
  }
  return out;
}
