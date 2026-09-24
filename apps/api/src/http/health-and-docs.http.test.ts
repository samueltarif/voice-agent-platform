import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, exportJWK } from 'jose';
import { createApp } from '../app.js';
import { ServiceAssertionVerifier } from '../auth/service-assertion-verifier.js';
import { createNullLogger } from '@voice-agent/logger';
import type { ApiDependencies } from '../composition/agent-dependencies.js';

describe('HTTP /healthz and /openapi.json Endpoints', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    const keyPair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    const publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = 'kid-mock-1';
    const verifier = new ServiceAssertionVerifier({ publicJwks: { keys: [publicJwk] } });

    const dummyDeps = {
      logger: createNullLogger(),
      verifier,
      agentRepo: {} as ApiDependencies['agentRepo'],
      versionRepo: {} as ApiDependencies['versionRepo'],
      lifecycleService: {} as ApiDependencies['lifecycleService'],
      draftService: {} as ApiDependencies['draftService'],
      discardService: {} as ApiDependencies['discardService'],
      publicationService: {} as ApiDependencies['publicationService'],
      membershipRepo: {} as ApiDependencies['membershipRepo'],
      organizationRepo: {} as ApiDependencies['organizationRepo'],
    };

    app = createApp(dummyDeps);
  });

  it('GET /healthz returns 200 ok without authentication', async () => {
    const res = await app.request('/healthz');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });

  it('GET /openapi.json returns valid OpenAPI 3.1.0 spec with all 11 endpoints and security schemes', async () => {
    const res = await app.request('/openapi.json');
    expect(res.status).toBe(200);

    const spec = (await res.json()) as {
      openapi: string;
      info: { title: string; version: string };
      components?: { securitySchemes?: Record<string, unknown> };
      paths: Record<string, Record<string, unknown>>;
    };

    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.title).toBe('Voice Agent Platform API');

    // Security scheme validation
    const securitySchemes = spec.components?.securitySchemes;
    expect(securitySchemes).toBeDefined();
    expect(securitySchemes?.internalServiceAssertion).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Internal Asymmetric Service Assertion (EdDSA / Ed25519)',
    });

    // Check all 11 /v1 endpoints exist in paths
    const paths = spec.paths;
    expect(paths['/healthz']).toBeDefined();
    expect(paths['/v1/agents']).toBeDefined();
    expect(paths['/v1/agents/{agentId}']).toBeDefined();
    expect(paths['/v1/agents/{agentId}/archive']).toBeDefined();
    expect(paths['/v1/agents/{agentId}/reactivate']).toBeDefined();
    expect(paths['/v1/agents/{agentId}/versions']).toBeDefined();
    expect(paths['/v1/agents/{agentId}/versions/{versionId}/configuration']).toBeDefined();
    expect(paths['/v1/agents/{agentId}/drafts']).toBeDefined();
    expect(paths['/v1/agents/{agentId}/drafts/{versionId}']).toBeDefined();
    expect(paths['/v1/agents/{agentId}/drafts/{versionId}/publish']).toBeDefined();

    // Verify zero secrets or private keys in the spec
    const specString = JSON.stringify(spec);
    expect(specString).not.toContain('"d":');
    expect(specString).not.toContain('Bearer eyJ');
    expect(specString).not.toContain('privateKey');
  });
});
