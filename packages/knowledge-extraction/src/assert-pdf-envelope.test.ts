import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_UPLOAD_ERROR_CODES as CODES } from '@voice-agent/contracts';
import { classifyUpload } from './classify-upload.js';
import { buildPdf, latin1Bytes } from './test-support/build-pdf-fixture.js';
import { buildEncryptedPdf } from './test-support/build-encrypted-pdf.js';
import { buildDocx } from './test-support/build-docx-fixture.js';

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return 'NO_ERROR';
};
const classifyPdf = (bytes: Uint8Array) => () => classifyUpload({ fileName: 'a.pdf', bytes });
const valid = buildPdf({ pages: [['Transmissor QT-310']] });

describe('PDF envelope (API process, before the child)', () => {
  it('accepts a valid PDF, including leading bytes within the first KiB', () => {
    expect(classifyPdf(valid)()).toEqual({ fileName: 'a.pdf', baseName: 'a', format: 'PDF' });
    const junk = new Uint8Array([...latin1Bytes('x'.repeat(500)), ...valid]);
    expect(codeOf(classifyPdf(junk))).toBe('NO_ERROR');
  });

  it('refuses missing/late headers, other signatures and truncated files', () => {
    const late = new Uint8Array([...latin1Bytes('x'.repeat(1100)), ...valid]);
    expect(codeOf(classifyPdf(late))).toBe(CODES.FORMAT_MISMATCH);
    expect(codeOf(classifyPdf(latin1Bytes('%PDF-9.9\n%%EOF')))).toBe(CODES.FORMAT_MISMATCH);
    expect(codeOf(classifyPdf(buildDocx()))).toBe(CODES.FORMAT_MISMATCH);
    expect(codeOf(classifyPdf(valid.subarray(0, valid.length - 7)))).toBe(CODES.MALFORMED_FILE);
  });

  it('refuses any encryption dictionary (user or owner password) before extraction', () => {
    const user = buildEncryptedPdf({ lines: ['a'], userPassword: 'abc', ownerPassword: 'own' });
    const owner = buildEncryptedPdf({ lines: ['a'], userPassword: '', ownerPassword: 'own' });
    expect(codeOf(classifyPdf(user))).toBe(CODES.PDF_ENCRYPTED);
    expect(codeOf(classifyPdf(owner))).toBe(CODES.PDF_ENCRYPTED);
  });

  it('in doubt it refuses: a literal "/Encrypt" anywhere is treated as encrypted', () => {
    const literal = buildPdf({ pages: [['texto que cita /Encrypt literalmente']] });
    expect(codeOf(classifyPdf(literal))).toBe(CODES.PDF_ENCRYPTED);
  });

  it('a hex-escaped key name is NOT caught here (the child detects it; see extract-pdf-text)', () => {
    const escaped = buildEncryptedPdf({
      lines: ['a'],
      userPassword: '',
      ownerPassword: 'own',
      encryptKeyName: '/Encr#79pt',
    });
    expect(codeOf(classifyPdf(escaped))).toBe('NO_ERROR');
  });
});
