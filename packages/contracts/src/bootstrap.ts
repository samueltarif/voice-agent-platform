import { z } from 'zod';
import { TENANT_ROLES } from './tenant.js';

export const BOOTSTRAP_ASSERTION_SCOPE = 'user:bootstrap' as const;
export const DEFAULT_BOOTSTRAP_ISSUER = 'voice-agent:web' as const;
export const DEFAULT_BOOTSTRAP_AUDIENCE = 'voice-agent:api:bootstrap' as const;
export const BOOTSTRAP_ASSERTION_TTL_SECONDS = 30 as const;

export const userBootstrapAssertionClaimsSchema = z
  .object({
    sub: z.string().min(1),
    scope: z.literal(BOOTSTRAP_ASSERTION_SCOPE),
    iss: z.string().min(1),
    aud: z.string().min(1),
    iat: z.number().int().positive(),
    exp: z.number().int().positive(),
    jti: z.string().uuid(),
  })
  .strict();

export type UserBootstrapAssertionClaims = z.infer<typeof userBootstrapAssertionClaimsSchema>;

export const organizationContextResponseSchema = z
  .object({
    id: z.string().uuid(),
    slug: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens'),
    name: z.string().min(1).max(100),
    role: z.enum(TENANT_ROLES),
  })
  .strict();

export type OrganizationContextResponse = z.infer<typeof organizationContextResponseSchema>;
