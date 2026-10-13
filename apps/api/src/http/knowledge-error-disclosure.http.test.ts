import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT, type JWK } from 'jose';
import { ConflictError, BadRequestError } from '@voice-agent/errors';
import { createApp } from '../app.js';
import { ServiceAssertionVerifier } from '../auth/service-assertion-verifier.js';
import { BootstrapAssertionVerifier } from '../auth/bootstrap-assertion-verifier.js';
import { createNullLogger } from '@voice-agent/logger';
import type { ApiDependencies } from '../composition/agent-dependencies.js';
import type { OrganizationRepository, MembershipRepository } from '@voice-agent/database';

describe('007J N2 typed error mapping (no substring forgery)', () => {
  let app: ReturnType<typeof createApp>;
  let appWithTypedErrors: ReturnType<typeof createApp>;
  let privateJwk: JWK;
  const kid = 'kb-n2-final-1';
  const orgId = '11111111-1111-1111-1111-111111111111';
  const sub = 'user-n2-final';

  beforeAll(async () => {
    const keyPair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    privateJwk = await exportJWK(keyPair.privateKey);
    const publicJwk = await exportJWK(keyPair.publicKey);
    privateJwk.kid = kid;
    publicJwk.kid = kid;
    const verifier = new ServiceAssertionVerifier({ publicJwks: { keys: [publicJwk] } });
    const mockOrgRepo = {
      findOrganizationById: async () => ({ id: orgId, status: 'ACTIVE' }),
    } as unknown as OrganizationRepository;
    const mockMembershipRepo = {
      findMembership: async () => ({ organizationId: orgId, userId: sub, role: 'OWNER', status: 'ACTIVE' }),
    } as unknown as MembershipRepository;
    const poisonedRepo = {
      async ingestDocument(input: { title: string; source: { locator: string }; rawText: string }) {
        if (input.rawText.includes('TRIGGER_DB_BOOM')) {
          throw new Error(
            `duplicate key value violates unique constraint "x" Detail: Key (title)=(${input.title}) Conflicting duplicate document marker`,
          );
        }
        throw new Error('unexpected boom SELECT * FROM secret WHERE params=[1]');
      },
      async getDocumentById() {
        return null;
      },
      async listDocuments() {
        return [];
      },
      async archiveDocument() {
        throw new Error('unexpected');
      },
    } as unknown as ApiDependencies['knowledgeRepo'];
    const typedRepo = {
      async ingestDocument(input: { title: string; rawText: string }) {
        if (input.rawText.includes('GENUINE_CONFLICT')) {
          throw new ConflictError('Conflicting duplicate document source already exists');
        }
        if (input.rawText.includes('BAD_INPUT')) {
          throw new BadRequestError('Knowledge document rawText must not be empty');
        }
        return {
          document: {
            id: '22222222-2222-2222-2222-222222222222',
            organizationId: orgId,
            title: input.title,
            source: { sourceType: 'FAQ', locator: 'faq/x' },
            status: 'READY',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          chunks: [],
          isIdempotentDuplicate: false,
        };
      },
      async getDocumentById() {
        return null;
      },
      async listDocuments() {
        return [];
      },
      async archiveDocument() {
        throw new Error('unexpected');
      },
    } as unknown as ApiDependencies['knowledgeRepo'];
    const baseDeps = {
      logger: createNullLogger(),
      verifier,
      bootstrapVerifier: new BootstrapAssertionVerifier({ publicJwks: { keys: [publicJwk] } }),
      agentRepo: {},
      versionRepo: {},
      lifecycleService: {},
      draftService: {},
      discardService: {},
      publicationService: {},
      membershipRepo: mockMembershipRepo,
      organizationRepo: mockOrgRepo,
      userOrgContextRepo: {},
    } as unknown as ApiDependencies;
    app = createApp({ ...baseDeps, knowledgeRepo: poisonedRepo });
    appWithTypedErrors = createApp({ ...baseDeps, knowledgeRepo: typedRepo });
  });

  async function getAssertion(): Promise<string> {
    const { importJWK } = await import('jose');
    const key = await importJWK(privateJwk, 'EdDSA');
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ sub, orgId, iss: 'voice-agent:web', aud: 'voice-agent:api', jti: `n2f-${Math.random()}` })
      .setProtectedHeader({ alg: 'EdDSA', kid, typ: 'JWT' })
      .setIssuedAt(now)
      .setExpirationTime(now + 30)
      .sign(key);
  }

  it('marker substring in input cannot manufacture 409', async () => {
    const token = await getAssertion();
    const res = await app.request('/v1/knowledge/documents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Conflicting duplicate document marker probe',
        source: { sourceType: 'FAQ', locator: 'faq/n2-marker' },
        rawText: 'TRIGGER_DB_BOOM payload',
      }),
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(JSON.stringify(body)).not.toMatch(/duplicate key|Detail|SELECT|params/i);
  });

  it('genuine typed conflict stays 409', async () => {
    const token = await getAssertion();
    const res = await appWithTypedErrors.request('/v1/knowledge/documents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Real',
        source: { sourceType: 'FAQ', locator: 'faq/genuine' },
        rawText: 'GENUINE_CONFLICT payload',
      }),
    });
    expect(res.status).toBe(409);
  });

  it('typed bad request stays 400 without SQL leak', async () => {
    const token = await getAssertion();
    const res = await appWithTypedErrors.request('/v1/knowledge/documents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Real',
        source: { sourceType: 'FAQ', locator: 'faq/bad' },
        rawText: 'BAD_INPUT payload',
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { message: string } };
    expect(JSON.stringify(body)).not.toMatch(/SELECT|params|duplicate key/i);
  });

  it('unexpected DB error sanitizes to 500', async () => {
    const token = await getAssertion();
    const res = await app.request('/v1/knowledge/documents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Normal',
        source: { sourceType: 'FAQ', locator: 'faq/unexpected' },
        rawText: 'ordinary payload without trigger marker that still booms',
      }),
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(body.error.message).toBe('An unexpected internal error occurred');
  });
});
