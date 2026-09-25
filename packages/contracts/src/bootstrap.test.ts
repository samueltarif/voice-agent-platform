import { describe, expect, it } from 'vitest';
import {
  userBootstrapAssertionClaimsSchema,
  organizationContextResponseSchema,
  BOOTSTRAP_ASSERTION_SCOPE,
} from './bootstrap.js';

describe('Bootstrap Contracts', () => {
  const validClaims = {
    sub: 'usr_valid_123',
    scope: BOOTSTRAP_ASSERTION_SCOPE,
    iss: 'voice-agent:web',
    aud: 'voice-agent:api:bootstrap',
    iat: 1774300000,
    exp: 1774300030,
    jti: '12345678-1234-4234-8234-123456789abc',
  };

  it('validates a compliant user bootstrap assertion claims payload', () => {
    const parsed = userBootstrapAssertionClaimsSchema.parse(validClaims);
    expect(parsed.sub).toBe('usr_valid_123');
    expect(parsed.scope).toBe('user:bootstrap');
  });

  it('rejects claims containing orgId', () => {
    const claimsWithOrgId = {
      ...validClaims,
      orgId: '11111111-1111-1111-1111-111111111111',
    };
    expect(() => userBootstrapAssertionClaimsSchema.parse(claimsWithOrgId)).toThrow();
  });

  it('rejects claims containing role or permissions', () => {
    expect(() =>
      userBootstrapAssertionClaimsSchema.parse({
        ...validClaims,
        role: 'ADMIN',
      }),
    ).toThrow();

    expect(() =>
      userBootstrapAssertionClaimsSchema.parse({
        ...validClaims,
        permissions: ['agent.read'],
      }),
    ).toThrow();
  });

  it('rejects invalid scope or non-UUID jti', () => {
    expect(() =>
      userBootstrapAssertionClaimsSchema.parse({
        ...validClaims,
        scope: 'invalid-scope',
      }),
    ).toThrow();

    expect(() =>
      userBootstrapAssertionClaimsSchema.parse({
        ...validClaims,
        jti: 'not-a-uuid',
      }),
    ).toThrow();
  });

  it('validates compliant organization context response DTO', () => {
    const dto = {
      id: '22222222-2222-4222-8222-222222222222',
      slug: 'acme-corp',
      name: 'Acme Corp',
      role: 'ADMIN',
    };
    const parsed = organizationContextResponseSchema.parse(dto);
    expect(parsed.slug).toBe('acme-corp');
    expect(parsed.role).toBe('ADMIN');
  });

  it('rejects invalid slug format or extraneous commercial fields', () => {
    expect(() =>
      organizationContextResponseSchema.parse({
        id: '22222222-2222-4222-8222-222222222222',
        slug: 'INVALID_SLUG!',
        name: 'Acme Corp',
        role: 'ADMIN',
      }),
    ).toThrow();

    expect(() =>
      organizationContextResponseSchema.parse({
        id: '22222222-2222-4222-8222-222222222222',
        slug: 'acme-corp',
        name: 'Acme Corp',
        role: 'ADMIN',
        plan: 'ENTERPRISE',
      }),
    ).toThrow();
  });
});
