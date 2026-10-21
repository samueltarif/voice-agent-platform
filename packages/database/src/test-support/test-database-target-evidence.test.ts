import { describe, expect, it } from 'vitest';
import {
  evaluateTestTargetEvidence,
  isDisposableDatabaseName,
  resolveTestAdminUrl,
  type TestTargetEvidence,
} from './test-database-target-evidence.js';

const SYSID = '7428391029384756123';

function direct(overrides: Partial<TestTargetEvidence> = {}): TestTargetEvidence {
  return {
    clientHost: 'localhost',
    clientPort: 5432,
    serverAddress: '127.0.0.1',
    serverVersionNum: 160015,
    systemIdentifier: SYSID,
    canCreateDatabase: true,
    localFileProof: 'VERIFIED',
    docker: null,
    ...overrides,
  };
}

function dockerized(
  dockerOverrides: Record<string, unknown> = {},
  overrides: Partial<TestTargetEvidence> = {},
) {
  return direct({
    serverAddress: '172.18.0.2',
    docker: {
      kind: 'INSPECTED',
      endpoint: 'npipe:////./pipe/dockerDesktopLinuxEngine',
      authorizedName: 'voice-agent-postgres',
      name: 'voice-agent-postgres',
      running: true,
      image: 'postgres:16-alpine',
      composeService: 'postgres',
      portBindings: [{ hostIp: '127.0.0.1', hostPort: 5432 }],
      containerAddresses: ['172.18.0.2'],
      systemIdentifier: SYSID,
      ...dockerOverrides,
    },
    ...overrides,
  } as Partial<TestTargetEvidence>);
}

describe('test target guard (pure, no I/O)', () => {
  it('1. ACCEPT direct loopback PostgreSQL that can create databases', () => {
    expect(evaluateTestTargetEvidence(direct())).toEqual({
      accepted: true,
      mode: 'DIRECT_LOOPBACK',
    });
    expect(evaluateTestTargetEvidence(direct({ serverAddress: null })).accepted).toBe(true);
  });

  it('P0-A. REJECT localhost + loopback server WITHOUT local-filesystem proof (e.g. SSH tunnel to a remote server)', () => {
    const tunnel = direct({ localFileProof: 'UNAVAILABLE' });
    expect(evaluateTestTargetEvidence(tunnel)).toMatchObject({
      accepted: false,
      reason: 'SERVER_NOT_PROVEN_LOCAL',
    });
    expect(evaluateTestTargetEvidence(direct({ localFileProof: 'MISMATCH' }))).toMatchObject({
      accepted: false,
      reason: 'SERVER_NOT_PROVEN_LOCAL',
    });
    expect(
      evaluateTestTargetEvidence(direct({ serverAddress: null, localFileProof: 'UNAVAILABLE' }))
        .accepted,
    ).toBe(false);
  });

  it.each([
    'unix:///var/run/docker.sock',
    'unix:///Users/dev/.docker/run/docker.sock',
    'npipe:////./pipe/docker_engine',
    'npipe:////./pipe/dockerDesktopLinuxEngine',
  ])('P0-B. ACCEPT local Docker endpoint %s', (endpoint) => {
    expect(evaluateTestTargetEvidence(dockerized({ endpoint })).accepted).toBe(true);
  });

  it.each([
    'ssh://dev@build-box',
    'tcp://10.0.0.7:2376',
    'tcp://127.0.0.1:2375',
    'tcp://localhost:2376',
    'npipe:////build-server/pipe/docker_engine',
    '',
  ])('P0-B. REJECT remote or unverifiable Docker endpoint %j', (endpoint) => {
    expect(evaluateTestTargetEvidence(dockerized({ endpoint }))).toMatchObject({
      accepted: false,
      reason: 'DOCKER_ENDPOINT_NOT_LOCAL',
    });
  });

  it('2. ACCEPT an identified local PostgreSQL 16 container seen through a bridge IP', () => {
    expect(evaluateTestTargetEvidence(dockerized())).toEqual({
      accepted: true,
      mode: 'DOCKER_LOCAL_CONTAINER',
    });
  });

  it.each(['db.example.com', '203.0.113.10'])('3. REJECT public remote host %s', (clientHost) => {
    expect(evaluateTestTargetEvidence(dockerized({}, { clientHost }))).toMatchObject({
      accepted: false,
      reason: 'CLIENT_HOST_NOT_LOOPBACK',
    });
  });

  it.each(['10.0.0.5', '172.18.0.2', '192.168.1.20'])(
    '4. REJECT private RFC 1918 host %s',
    (clientHost) => {
      expect(
        evaluateTestTargetEvidence(direct({ clientHost, serverAddress: clientHost })),
      ).toMatchObject({ accepted: false, reason: 'CLIENT_HOST_NOT_LOOPBACK' });
    },
  );

  it('5. REJECT localhost forwarded to an unproven destination (no Docker evidence)', () => {
    expect(evaluateTestTargetEvidence(direct({ serverAddress: '172.18.0.2' }))).toMatchObject({
      accepted: false,
      reason: 'FORWARDED_TARGET_UNPROVEN',
    });
    expect(
      evaluateTestTargetEvidence(dockerized({ containerAddresses: ['172.18.0.9'] })),
    ).toMatchObject({ accepted: false, reason: 'CONTAINER_ADDRESS_MISMATCH' });
  });

  it('6. REJECT a container other than the authorized one, or another PostgreSQL cluster', () => {
    expect(evaluateTestTargetEvidence(dockerized({ name: 'someone-else-postgres' }))).toMatchObject(
      { accepted: false, reason: 'CONTAINER_NOT_AUTHORIZED' },
    );
    expect(evaluateTestTargetEvidence(dockerized({ composeService: 'api' }))).toMatchObject({
      accepted: false,
      reason: 'CONTAINER_NOT_AUTHORIZED',
    });
    expect(evaluateTestTargetEvidence(dockerized({ systemIdentifier: '1111' }))).toMatchObject({
      accepted: false,
      reason: 'CLUSTER_IDENTITY_MISMATCH',
    });
  });

  it('7. REJECT when the published port differs from the port the client uses, or is not loopback-only', () => {
    expect(
      evaluateTestTargetEvidence(
        dockerized({ portBindings: [{ hostIp: '127.0.0.1', hostPort: 15432 }] }),
      ),
    ).toMatchObject({ accepted: false, reason: 'PUBLISHED_PORT_MISMATCH' });
    expect(
      evaluateTestTargetEvidence(
        dockerized({ portBindings: [{ hostIp: '0.0.0.0', hostPort: 5432 }] }),
      ),
    ).toMatchObject({ accepted: false, reason: 'PUBLISHED_PORT_MISMATCH' });
  });

  it('8. REJECT inaccessible or inconsistent Docker metadata', () => {
    expect(
      evaluateTestTargetEvidence(
        direct({ serverAddress: '172.18.0.2', docker: { kind: 'UNAVAILABLE' } }),
      ),
    ).toMatchObject({ accepted: false, reason: 'FORWARDED_TARGET_UNPROVEN' });
    expect(evaluateTestTargetEvidence(dockerized({ running: false }))).toMatchObject({
      accepted: false,
      reason: 'CONTAINER_NOT_AUTHORIZED',
    });
    expect(evaluateTestTargetEvidence(dockerized({ image: 'postgres:15' }))).toMatchObject({
      accepted: false,
      reason: 'CONTAINER_NOT_AUTHORIZED',
    });
    expect(evaluateTestTargetEvidence(dockerized({ systemIdentifier: null }))).toMatchObject({
      accepted: false,
      reason: 'CLUSTER_IDENTITY_MISMATCH',
    });
    expect(evaluateTestTargetEvidence(dockerized({}, { serverVersionNum: 150004 }))).toMatchObject({
      accepted: false,
      reason: 'SERVER_NOT_POSTGRES_16',
    });
  });

  it('REJECT a server where the role cannot create disposable databases', () => {
    expect(evaluateTestTargetEvidence(direct({ canCreateDatabase: false }))).toMatchObject({
      accepted: false,
      reason: 'CANNOT_CREATE_DATABASE',
    });
  });

  it('9. only of2_test_<12 hex> names are disposable', () => {
    expect(isDisposableDatabaseName('of2_test_0123456789ab')).toBe(true);
    for (const name of [
      'voice_agent_dev',
      'postgres',
      'of2_test_',
      'of2_test_0123456789abX',
      'OF2_TEST_0123456789AB',
    ]) {
      expect(isDisposableDatabaseName(name)).toBe(false);
    }
  });

  it('12. never falls back to the generic DATABASE_URL', () => {
    const env = { DATABASE_URL: 'postgresql://u:p@prod.example.com:5432/app' };
    expect(new URL(resolveTestAdminUrl(env)).hostname).toBe('localhost');
    expect(
      resolveTestAdminUrl({
        ...env,
        TEST_DATABASE_URL: 'postgresql://u:p@127.0.0.1:5433/postgres',
      }),
    ).toContain('127.0.0.1:5433');
  });
});
