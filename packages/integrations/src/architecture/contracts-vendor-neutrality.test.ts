import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  findVendorIdentifiers,
  VENDOR_NAME_PATTERN,
} from '../../../../scripts/find-vendor-identifiers.mjs';

/** D-S1-ARCH-CHECK (DEC-045): reforço da neutralidade de `packages/contracts`. */
function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe('contracts vendor neutrality check', () => {
  it('flags vendor names in identifiers, string and template literals', () => {
    const source = [
      'export const twilioCallSid = 1;',
      "const target = 'Millis-session';",
      'const url = `https://api.${host}/twilio`;',
      'class X { #millisRef = 0; }',
    ].join('\n');
    const findings = findVendorIdentifiers('sample.ts', source);
    expect(findings.map((f) => f.line)).toEqual([1, 2, 3, 4]);
    expect(findings[0]!.text).toBe('twilioCallSid');
  });

  it('ignores comments and neutral names', () => {
    const source = [
      '// Twilio-led (H1-OFF) is documented here only',
      '/** Millis is a candidate, not a dependency. */',
      'export const providerLegReference = "opaque";',
    ].join('\n');
    expect(findVendorIdentifiers('sample.ts', source)).toEqual([]);
    expect(VENDOR_NAME_PATTERN.test('providerLegReference')).toBe(false);
  });

  it('finds no vendor names in packages/contracts today', () => {
    const root = resolve('packages/contracts/src');
    const offenders = listSourceFiles(root).flatMap((file) =>
      findVendorIdentifiers(file, readFileSync(file, 'utf8')).map((f) => `${file}:${f.line}`),
    );
    expect(offenders).toEqual([]);
  });
});
