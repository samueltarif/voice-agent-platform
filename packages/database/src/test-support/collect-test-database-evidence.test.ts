import { describe, expect, it } from 'vitest';
import { collectDockerEvidence, parseDockerInspect } from './collect-test-database-evidence.js';
import { evaluateTestTargetEvidence } from './test-database-target-evidence.js';

/** Saída sintética no formato de `docker inspect` (Docker NÃO é executado aqui). */
const INSPECT = JSON.stringify([
  {
    Name: '/voice-agent-postgres',
    State: { Running: true },
    Config: { Image: 'postgres:16-alpine', Labels: { 'com.docker.compose.service': 'postgres' } },
    NetworkSettings: {
      Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '5432' }] },
      Networks: { 'voice-agent_default': { IPAddress: '172.18.0.2', GlobalIPv6Address: '' } },
    },
  },
]);

describe('Docker evidence parsing and collection (pure, simulated CLI output)', () => {
  it('parses inspect output into correlated evidence that the guard accepts', () => {
    const docker = parseDockerInspect(INSPECT, {
      authorizedName: 'voice-agent-postgres',
      systemIdentifier: '42',
    });
    expect(docker).toMatchObject({
      kind: 'INSPECTED',
      name: 'voice-agent-postgres',
      portBindings: [{ hostIp: '127.0.0.1', hostPort: 5432 }],
      containerAddresses: ['172.18.0.2'],
    });
    const decision = evaluateTestTargetEvidence({
      clientHost: 'localhost',
      clientPort: 5432,
      serverAddress: '172.18.0.2',
      serverVersionNum: 160004,
      systemIdentifier: '42',
      canCreateDatabase: true,
      docker,
    });
    expect(decision).toEqual({ accepted: true, mode: 'DOCKER_LOCAL_CONTAINER' });
  });

  it('the default compose publication on all interfaces (0.0.0.0) is rejected', () => {
    const open = INSPECT.replace('"HostIp":"127.0.0.1"', '"HostIp":"0.0.0.0"');
    const docker = parseDockerInspect(open, {
      authorizedName: 'voice-agent-postgres',
      systemIdentifier: '42',
    });
    const decision = evaluateTestTargetEvidence({
      clientHost: 'localhost',
      clientPort: 5432,
      serverAddress: '172.18.0.2',
      serverVersionNum: 160004,
      systemIdentifier: '42',
      canCreateDatabase: true,
      docker,
    });
    expect(decision).toMatchObject({ accepted: false, reason: 'PUBLISHED_PORT_MISMATCH' });
  });

  it('garbage, empty or failing Docker CLI yields UNAVAILABLE (never acceptance)', async () => {
    expect(parseDockerInspect('not json', { authorizedName: 'x', systemIdentifier: '1' })).toEqual({
      kind: 'UNAVAILABLE',
    });
    expect(parseDockerInspect('[]', { authorizedName: 'x', systemIdentifier: '1' })).toEqual({
      kind: 'UNAVAILABLE',
    });
    const failing = await collectDockerEvidence({
      runner: () => Promise.reject(new Error('docker: command not found')),
      authorizedName: 'voice-agent-postgres',
      user: 'postgres',
    });
    expect(failing).toEqual({ kind: 'UNAVAILABLE' });
  });

  it('reads the cluster identity INSIDE the authorized container via docker exec', async () => {
    const calls: string[][] = [];
    const evidence = await collectDockerEvidence({
      runner: async (args) => {
        calls.push([...args]);
        return args[0] === 'inspect' ? INSPECT : '42\n';
      },
      authorizedName: 'voice-agent-postgres',
      user: 'postgres',
    });
    expect(evidence).toMatchObject({ kind: 'INSPECTED', systemIdentifier: '42' });
    expect(calls.map((c) => c.slice(0, 2))).toEqual([
      ['inspect', 'voice-agent-postgres'],
      ['exec', 'voice-agent-postgres'],
    ]);
    expect(calls.flat().join(' ')).not.toMatch(/password|PGPASSWORD/i);
  });
});
