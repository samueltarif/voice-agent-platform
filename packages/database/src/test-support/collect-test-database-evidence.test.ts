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
      endpoint: 'npipe:////./pipe/dockerDesktopLinuxEngine',
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
      localFileProof: 'UNAVAILABLE',
      docker,
    });
    expect(decision).toEqual({ accepted: true, mode: 'DOCKER_LOCAL_CONTAINER' });
  });

  it('the default compose publication on all interfaces (0.0.0.0) is rejected', () => {
    const open = INSPECT.replace('"HostIp":"127.0.0.1"', '"HostIp":"0.0.0.0"');
    const docker = parseDockerInspect(open, {
      endpoint: 'npipe:////./pipe/dockerDesktopLinuxEngine',
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
      localFileProof: 'UNAVAILABLE',
      docker,
    });
    expect(decision).toMatchObject({ accepted: false, reason: 'PUBLISHED_PORT_MISMATCH' });
  });

  it('garbage, empty or failing Docker CLI yields UNAVAILABLE (never acceptance)', async () => {
    expect(
      parseDockerInspect('not json', {
        endpoint: 'unix:///var/run/docker.sock',
        authorizedName: 'x',
        systemIdentifier: '1',
      }),
    ).toEqual({
      kind: 'UNAVAILABLE',
    });
    expect(
      parseDockerInspect('[]', {
        endpoint: 'unix:///var/run/docker.sock',
        authorizedName: 'x',
        systemIdentifier: '1',
      }),
    ).toEqual({
      kind: 'UNAVAILABLE',
    });
    const failing = await collectDockerEvidence({
      runner: () => Promise.reject(new Error('docker: command not found')),
      authorizedName: 'voice-agent-postgres',
      user: 'postgres',
    });
    expect(failing).toEqual({ kind: 'UNAVAILABLE' });
  });

  it('pins the verified LOCAL endpoint (-H) and reads the cluster identity inside the container', async () => {
    const calls: string[][] = [];
    const evidence = await collectDockerEvidence({
      runner: async (args) => {
        calls.push([...args]);
        if (args[0] === 'context') return 'npipe:////./pipe/dockerDesktopLinuxEngine\n';
        return args.includes('inspect') ? INSPECT : '42\n';
      },
      authorizedName: 'voice-agent-postgres',
      user: 'postgres',
      env: {},
    });
    expect(evidence).toMatchObject({
      kind: 'INSPECTED',
      systemIdentifier: '42',
      endpoint: 'npipe:////./pipe/dockerDesktopLinuxEngine',
    });
    expect(calls.map((c) => c.slice(0, 4))).toEqual([
      ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'],
      ['-H', 'npipe:////./pipe/dockerDesktopLinuxEngine', 'inspect', 'voice-agent-postgres'],
      ['-H', 'npipe:////./pipe/dockerDesktopLinuxEngine', 'exec', 'voice-agent-postgres'],
    ]);
    expect(calls.flat().join(' ')).not.toMatch(/password|PGPASSWORD/i);
  });

  it.each([
    [{ DOCKER_HOST: 'ssh://dev@build-box' }, ''],
    [{ DOCKER_HOST: 'tcp://127.0.0.1:2375', DOCKER_TLS_VERIFY: '1' }, ''],
    [{}, 'tcp://10.0.0.7:2376'],
    [{ DOCKER_CONTEXT: 'remote-builder' }, 'ssh://ci@runner'],
  ])(
    'P0-B. remote daemon (env %j / context %j) never yields usable evidence',
    async (env, contextHost) => {
      const calls: string[][] = [];
      const evidence = await collectDockerEvidence({
        runner: async (args) => {
          calls.push([...args]);
          return args[0] === 'context' ? contextHost : INSPECT;
        },
        authorizedName: 'voice-agent-postgres',
        user: 'postgres',
        env,
      });
      expect(evidence).toEqual({ kind: 'UNAVAILABLE' });
      expect(calls.some((c) => c.includes('inspect') && c[0] !== 'context')).toBe(false);
    },
  );

  it('P0-B. DOCKER_HOST takes precedence over the context (as the CLI does)', async () => {
    const calls: string[][] = [];
    await collectDockerEvidence({
      runner: async (args) => {
        calls.push([...args]);
        return args.includes('inspect') ? INSPECT : '42';
      },
      authorizedName: 'voice-agent-postgres',
      user: 'postgres',
      env: { DOCKER_HOST: 'unix:///var/run/docker.sock' },
    });
    expect(calls[0]?.slice(0, 2)).toEqual(['-H', 'unix:///var/run/docker.sock']);
    expect(calls.some((c) => c[0] === 'context')).toBe(false);
  });

  it('P0-B. a local DOCKER_HOST wins over a diverging remote DOCKER_CONTEXT', async () => {
    const calls: string[][] = [];
    const evidence = await collectDockerEvidence({
      runner: async (args) => {
        calls.push([...args]);
        return args.includes('inspect') ? INSPECT : '42\n';
      },
      authorizedName: 'voice-agent-postgres',
      user: 'postgres',
      env: {
        DOCKER_HOST: 'npipe:////./pipe/dockerDesktopLinuxEngine',
        DOCKER_CONTEXT: 'remote-builder',
      },
    });
    expect(evidence).toMatchObject({
      kind: 'INSPECTED',
      endpoint: 'npipe:////./pipe/dockerDesktopLinuxEngine',
    });
    expect(calls.some((c) => c[0] === 'context')).toBe(false);
    expect(calls.every((c) => c[0] === '-H')).toBe(true);
  });

  it('P0-B. a remote DOCKER_HOST is never rescued by a local DOCKER_CONTEXT', async () => {
    const calls: string[][] = [];
    const evidence = await collectDockerEvidence({
      runner: async (args) => {
        calls.push([...args]);
        return 'npipe:////./pipe/dockerDesktopLinuxEngine\n';
      },
      authorizedName: 'voice-agent-postgres',
      user: 'postgres',
      env: { DOCKER_HOST: 'ssh://dev@build-box', DOCKER_CONTEXT: 'desktop-linux' },
    });
    expect(evidence).toEqual({ kind: 'UNAVAILABLE' });
    expect(calls).toEqual([]);
  });

  it('P0-B. inspects DOCKER_CONTEXT by explicit name and pins its endpoint', async () => {
    const calls: string[][] = [];
    const evidence = await collectDockerEvidence({
      runner: async (args) => {
        calls.push([...args]);
        if (args[0] === 'context') return 'npipe:////./pipe/dockerDesktopLinuxEngine\n';
        return args.includes('inspect') ? INSPECT : '42\n';
      },
      authorizedName: 'voice-agent-postgres',
      user: 'postgres',
      env: { DOCKER_CONTEXT: 'desktop-linux' },
    });
    expect(evidence).toMatchObject({
      kind: 'INSPECTED',
      endpoint: 'npipe:////./pipe/dockerDesktopLinuxEngine',
    });
    expect(calls[0]).toEqual([
      'context',
      'inspect',
      'desktop-linux',
      '--format',
      '{{.Endpoints.docker.Host}}',
    ]);
    expect(calls[1]?.slice(0, 2)).toEqual(['-H', 'npipe:////./pipe/dockerDesktopLinuxEngine']);
  });

  it('P0-B. DOCKER_TLS_VERIFY (TLS daemon) is fail-closed even with a local socket', async () => {
    const calls: string[][] = [];
    const evidence = await collectDockerEvidence({
      runner: async (args) => {
        calls.push([...args]);
        return INSPECT;
      },
      authorizedName: 'voice-agent-postgres',
      user: 'postgres',
      env: {
        DOCKER_HOST: 'npipe:////./pipe/dockerDesktopLinuxEngine',
        DOCKER_TLS_VERIFY: '1',
      },
    });
    expect(evidence).toEqual({ kind: 'UNAVAILABLE' });
    expect(calls).toEqual([]);
  });

  it('P0-B. an unreadable context (inconsistent metadata) is UNAVAILABLE', async () => {
    const evidence = await collectDockerEvidence({
      runner: async (args) => {
        if (args[0] === 'context') throw new Error('context not found');
        return INSPECT;
      },
      authorizedName: 'voice-agent-postgres',
      user: 'postgres',
      env: {},
    });
    expect(evidence).toEqual({ kind: 'UNAVAILABLE' });
  });
});
