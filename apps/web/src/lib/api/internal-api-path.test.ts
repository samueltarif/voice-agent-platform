import { describe, expect, it } from 'vitest';
import { conversationSessionPreparationRequestSchema } from '@voice-agent/contracts';
import {
  encodeInternalPathSegment,
  internalApiPath,
  isContractUuid,
  UnsafeInternalApiPathError,
  uuidRouteSegment,
} from './internal-api-path.js';

const UUID = '11111111-1111-4111-8111-111111111111';

/** Valores como chegam do Next.js: o segmento da URL já vem decodificado uma vez. */
const HOSTILE = [
  '',
  '.',
  '..',
  '../../v1/organizations',
  '..\\..\\v1',
  'a/b',
  'a\\b',
  '%2e%2e',
  '%2E%2e',
  '%252e%252e',
  '%2F',
  '%5C',
  'x?admin=1',
  'x#frag',
  '//evil.example',
  'http://evil.example',
  ' 1',
  'a\u0000b',
  'a\nb',
];

describe('internal API path segments (F1)', () => {
  it('encodes safe values as one segment and refuses every hostile value', () => {
    expect(encodeInternalPathSegment(UUID)).toBe(UUID);
    expect(encodeInternalPathSegment('qualitec')).toBe('qualitec');
    expect(encodeInternalPathSegment('ação')).toBe('a%C3%A7%C3%A3o');
    for (const value of [...HOSTILE, null, undefined, 42, {}]) {
      expect(() => encodeInternalPathSegment(value)).toThrow(UnsafeInternalApiPathError);
    }
  });

  it('builds paths whose structure the values cannot change', () => {
    expect(internalApiPath`/v1/agents/${UUID}/versions`).toBe(`/v1/agents/${UUID}/versions`);
    for (const value of HOSTILE) {
      expect(() => internalApiPath`/v1/agents/${value}/versions`).toThrow(
        UnsafeInternalApiPathError,
      );
    }
  });

  it('accepts only contract UUIDs for agent and version ids', () => {
    expect(uuidRouteSegment(UUID)).toBe(UUID);
    expect(uuidRouteSegment(UUID.toUpperCase())).toBe(UUID.toUpperCase());
    for (const value of ['agent-1', 'ver-1', `${UUID}/x`, `${UUID} `, `${UUID}%00`, ...HOSTILE]) {
      expect(() => uuidRouteSegment(value)).toThrow(UnsafeInternalApiPathError);
    }
  });

  it('matches the API contract validator (z.string().uuid()) exactly', () => {
    const contractField = conversationSessionPreparationRequestSchema.shape.organizationId;
    const samples = [
      UUID,
      '00000000-0000-0000-0000-000000000000',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF',
      '11111111-1111-1111-1111-111111111111',
      '11111111111141118111111111111111',
      '1111111-1111-4111-8111-111111111111',
      'g1111111-1111-4111-8111-111111111111',
      'agent-1',
    ];
    for (const sample of samples) {
      expect(isContractUuid(sample)).toBe(contractField.safeParse(sample).success);
    }
  });

  it('refuses with the shape of an API 404 and no internal detail', () => {
    const error = new UnsafeInternalApiPathError();
    expect(error.status).toBe(404);
    expect(error.data.error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('Resource not found');
  });
});
