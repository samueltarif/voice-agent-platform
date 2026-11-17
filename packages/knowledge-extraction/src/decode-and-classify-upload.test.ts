import { describe, expect, it } from 'vitest';
import {
  KNOWLEDGE_UPLOAD_ERROR_CODES as CODES,
  KNOWLEDGE_UPLOAD_LIMITS,
} from '@voice-agent/contracts';
import { decodeUploadBase64 } from './decode-upload-base64.js';
import { classifyUpload } from './classify-upload.js';
import { buildDocx } from './test-support/build-docx-fixture.js';

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return 'NO_ERROR';
};
const utf8 = (text: string) => new TextEncoder().encode(text);

describe('decodeUploadBase64 (strict)', () => {
  it('decodes canonical base64 into the real bytes', () => {
    expect(Array.from(decodeUploadBase64('T2zDoQ=='))).toEqual(Array.from(utf8('Olá')));
  });

  it.each([
    ['whitespace', 'T2zD oQ=='],
    ['line break', 'T2zD\noQ=='],
    ['url-safe alphabet', 'T2zD-_=='],
    ['missing padding', 'T2zDoQ'],
    ['non-canonical padding bits', 'T2zDoR=='],
    ['data URL prefix', 'data:text/plain;base64,T2zDoQ=='],
  ])('rejects %s', (_label, input) => {
    expect(codeOf(() => decodeUploadBase64(input))).toBe(CODES.INVALID_ENCODING);
  });

  it('rejects empty and oversized input before decoding', () => {
    expect(codeOf(() => decodeUploadBase64(''))).toBe(CODES.TOO_LARGE);
    const huge = 'A'.repeat(KNOWLEDGE_UPLOAD_LIMITS.maxEncodedChars + 4);
    expect(codeOf(() => decodeUploadBase64(huge))).toBe(CODES.TOO_LARGE);
  });
});

describe('classifyUpload', () => {
  it('accepts txt, md, markdown and docx with matching signatures', () => {
    expect(classifyUpload({ fileName: 'catalogo.TXT', bytes: utf8('a') }).format).toBe('TXT');
    expect(classifyUpload({ fileName: 'a.md', bytes: utf8('# a') }).format).toBe('MARKDOWN');
    expect(classifyUpload({ fileName: 'a.markdown', bytes: utf8('a') }).format).toBe('MARKDOWN');
    const docx = classifyUpload({ fileName: 'C:\\x\\Catálogo.docx', bytes: buildDocx() });
    expect(docx).toEqual({ fileName: 'Catálogo.docx', baseName: 'Catálogo', format: 'DOCX' });
  });

  it('refuses PDF (A2), legacy DOC and unknown extensions', () => {
    const bytes = utf8('x');
    expect(codeOf(() => classifyUpload({ fileName: 'a.pdf', bytes }))).toBe(
      CODES.PDF_NOT_YET_SUPPORTED,
    );
    expect(codeOf(() => classifyUpload({ fileName: 'a.doc', bytes }))).toBe(CODES.LEGACY_DOC);
    expect(codeOf(() => classifyUpload({ fileName: 'a.exe', bytes }))).toBe(
      CODES.UNSUPPORTED_FORMAT,
    );
    expect(codeOf(() => classifyUpload({ fileName: 'semextensao', bytes }))).toBe(
      CODES.UNSUPPORTED_FORMAT,
    );
  });

  it('refuses extensions that disagree with the file signature', () => {
    const zip = buildDocx();
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]);
    expect(codeOf(() => classifyUpload({ fileName: 'a.txt', bytes: zip }))).toBe(
      CODES.FORMAT_MISMATCH,
    );
    expect(codeOf(() => classifyUpload({ fileName: 'a.md', bytes: utf8('%PDF-1.7') }))).toBe(
      CODES.FORMAT_MISMATCH,
    );
    expect(codeOf(() => classifyUpload({ fileName: 'a.docx', bytes: utf8('texto') }))).toBe(
      CODES.FORMAT_MISMATCH,
    );
    expect(codeOf(() => classifyUpload({ fileName: 'a.docx', bytes: ole }))).toBe(CODES.LEGACY_DOC);
  });

  it('enforces the real byte size per format', () => {
    const big = new Uint8Array(KNOWLEDGE_UPLOAD_LIMITS.maxFileBytes.TXT + 1).fill(0x61);
    expect(codeOf(() => classifyUpload({ fileName: 'a.txt', bytes: big }))).toBe(CODES.TOO_LARGE);
  });

  it('refuses empty, control-character and path-only file names', () => {
    const bytes = utf8('a');
    for (const fileName of ['', '   ', 'a\u0000.txt', 'pasta/', '.txt', 'x'.repeat(256) + '.txt']) {
      expect(codeOf(() => classifyUpload({ fileName, bytes }))).toBe(CODES.INVALID_FILE_NAME);
    }
  });
});
