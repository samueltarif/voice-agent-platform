import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_UPLOAD_ERROR_CODES as CODES } from '@voice-agent/contracts';
import { extractPlainText } from './extract-plain-text.js';

const codeOf = (bytes: Uint8Array) => {
  try {
    extractPlainText(bytes);
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return 'NO_ERROR';
};

describe('extractPlainText', () => {
  it('decodes UTF-8 with and without BOM, keeping Markdown and HTML as literal text', () => {
    const md = '# Título\n<script>alert(1)</script> [link](http://x)';
    expect(extractPlainText(new TextEncoder().encode(md))).toBe(md);
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('ação')]);
    expect(extractPlainText(bom)).toBe('ação');
  });

  it('decodes UTF-16 LE and BE when a BOM is present', () => {
    const le = new Uint8Array([0xff, 0xfe, 0x4f, 0x00, 0x69, 0x00]);
    const be = new Uint8Array([0xfe, 0xff, 0x00, 0x4f, 0x00, 0x69]);
    expect(extractPlainText(le)).toBe('Oi');
    expect(extractPlainText(be)).toBe('Oi');
  });

  it('refuses invalid UTF-8 (e.g. Latin-1) and binary content', () => {
    expect(codeOf(new Uint8Array([0x61, 0xe7, 0x61]))).toBe(CODES.INVALID_TEXT_ENCODING);
    expect(codeOf(new Uint8Array([0x61, 0x00, 0x62]))).toBe(CODES.BINARY_CONTENT);
  });
});
