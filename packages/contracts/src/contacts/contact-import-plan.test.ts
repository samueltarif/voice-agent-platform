import { describe, expect, it } from 'vitest';
import { CONTACT_CSV_LIMITS, parseContactCsv, toSafeCsvCell } from './contact-csv-parser.js';
import { planContactImport, renderRejectedRowsCsv } from './contact-import-plan.js';

const mapping = { phoneColumn: 'Telefone', nameColumn: 'Nome', variableColumns: ['Cidade'] };

describe('008-MVP1 CSV parsing (RFC 4180)', () => {
  it('handles quotes, escaped quotes, embedded delimiters/newlines, CRLF, BOM and semicolons', () => {
    const csv =
      '﻿Nome;Telefone;Cidade\r\n"Silva; Ana";11987654321;"São ""SP"""\r\n"Multi\nlinha";21 3456-7890;Rio\r\n';
    const parsed = parseContactCsv(csv);
    expect(parsed).toEqual({
      ok: true,
      header: ['Nome', 'Telefone', 'Cidade'],
      rows: [
        ['Silva; Ana', '11987654321', 'São "SP"'],
        ['Multi\nlinha', '21 3456-7890', 'Rio'],
      ],
    });
  });

  it('rejects unterminated quotes and enforces size limits', () => {
    expect(parseContactCsv('a,b\n"x,1')).toEqual({ ok: false, reason: 'MALFORMED' });
    const rows = 'p\n' + '1\n'.repeat(CONTACT_CSV_LIMITS.maxDataRows + 1);
    expect(parseContactCsv(rows)).toEqual({ ok: false, reason: 'TOO_MANY_ROWS' });
    expect(parseContactCsv('x'.repeat(CONTACT_CSV_LIMITS.maxBytes + 1))).toEqual({
      ok: false,
      reason: 'TOO_LARGE',
    });
  });
});

describe('008-MVP1 import planning', () => {
  it('accepts valid rows, deduplicates by E.164 (first wins) and reports every rejection', () => {
    const csv = [
      'Nome,Telefone,Cidade',
      'Ana,(11) 98765-4321,SP',
      'Ana dup,+55 11 98765-4321,SP',
      'Bia,(20) 98765-4321,XX',
      'Caio,21 3456-7890',
      'Duda,21 3456-7891,RJ',
    ].join('\n');
    const plan = planContactImport(csv, mapping);
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.accepted).toEqual([
      {
        rowNumber: 1,
        phoneE164: '+5511987654321',
        displayName: 'Ana',
        variables: { Cidade: 'SP' },
      },
      {
        rowNumber: 5,
        phoneE164: '+552134567891',
        displayName: 'Duda',
        variables: { Cidade: 'RJ' },
      },
    ]);
    expect(plan.rejected.map((r) => [r.rowNumber, r.reason])).toEqual([
      [2, 'DUPLICATE_IN_FILE'],
      [3, 'INVALID_AREA_CODE'],
      [4, 'COLUMN_COUNT_MISMATCH'],
    ]);
  });

  it('fails the whole import when a mapped column is missing or the mapping is invalid', () => {
    expect(planContactImport('A,B\n1,2', mapping)).toEqual({
      ok: false,
      reason: 'MAPPED_COLUMN_NOT_FOUND',
    });
    expect(planContactImport('A\n1', { phoneColumn: '' })).toEqual({
      ok: false,
      reason: 'INVALID_MAPPING',
    });
  });

  it('neutralizes formula injection in every exported cell', () => {
    for (const payload of ['=1+1', '+SUM(A1)', '-2', '@cmd', '\tx', '\rx']) {
      expect(toSafeCsvCell(payload).startsWith(`"'`)).toBe(true);
    }
    expect(toSafeCsvCell('Ana "A"')).toBe('"Ana ""A"""');
    const report = renderRejectedRowsCsv([
      { rowNumber: 3, reason: 'INVALID_CHARACTERS', rawPhone: '=HYPERLINK("http://x")' },
    ]);
    expect(report).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(report.split('\r\n')[0]).toBe('"row","reason","phone"');
  });
});
