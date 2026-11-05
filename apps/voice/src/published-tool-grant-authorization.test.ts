import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { AgentConfigurationSnapshotV1, ToolExecutionContext } from '@voice-agent/contracts';
import { OPERATING_HOURS_TOOL_NAME } from './operating-hours-tool.js';
import { issueTestToolGrant } from './published-tool-grant-fixtures.js';
import type { PublishedToolGrant } from './published-tool-grant.js';
import {
  buildPublishedVersionToolExecutionContext,
  createPublishedVersionToolAuthorizer,
} from './published-version-toolset.js';
import { InMemoryToolRegistry } from './tool-registry.js';
import { ToolExecutionEngine } from './tool-execution-engine.js';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const TOOL = OPERATING_HOURS_TOOL_NAME;

const snapshot = (): AgentConfigurationSnapshotV1 => ({
  persona: {
    role: 'Atendente',
    companyName: 'Empresa Exemplo',
    objective: 'Atender',
    tone: 'FORMAL',
    greetingPhrase: 'Olá',
    closingPhrase: 'Tchau',
    fallbackPhrase: 'Pode repetir?',
  },
  voice: { languageCode: 'pt-BR' },
  rules: { conversational: ['Seja cordial'], deterministic: { operatingHours: '8h-18h' } },
  tools: ['agent.operating_hours'],
});

describe('published tool grant — forgery and context binding (E2, E3)', () => {
  it('rejects forged grants with an identical shape and refuses to build their context', async () => {
    const grant = await issueTestToolGrant({ organizationId: ORG_A, snapshot: snapshot() });
    const ctx = buildPublishedVersionToolExecutionContext(grant);
    const forgeries = [{ ...grant }, Object.create(grant), { ...grant, tools: [...grant.tools] }];
    for (const forged of forgeries as PublishedToolGrant[]) {
      expect(createPublishedVersionToolAuthorizer(forged)(TOOL, ctx)).toBe(false);
      expect(() => buildPublishedVersionToolExecutionContext(forged)).toThrow(TypeError);
    }
    expect(createPublishedVersionToolAuthorizer(grant)(TOOL, ctx)).toBe(true);
  });

  it('rejects divergent or missing organization, version, call or snapshot', async () => {
    const grant = await issueTestToolGrant({ organizationId: ORG_A, snapshot: snapshot() });
    const authorize = createPublishedVersionToolAuthorizer(grant);
    const ctx = buildPublishedVersionToolExecutionContext(grant);
    const variants: ToolExecutionContext[] = [
      { ...ctx, organizationId: ORG_B },
      { ...ctx, agentVersionId: '66666666-6666-4666-8666-666666666666' },
      { ...ctx, agentVersionId: undefined },
      { ...ctx, callId: '55555555-5555-4555-8555-555555555555' },
      { ...ctx, snapshot: undefined },
      { ...ctx, snapshot: structuredClone(grant.snapshot) },
    ];
    for (const variant of variants) expect(authorize(TOOL, variant)).toBe(false);
  });

  it('two companies sharing one snapshot object never authorize each other', async () => {
    const shared = snapshot();
    const grantA = await issueTestToolGrant({ organizationId: ORG_A, snapshot: shared });
    const grantB = await issueTestToolGrant({ organizationId: ORG_B, snapshot: shared });
    const ctxB = buildPublishedVersionToolExecutionContext(grantB);
    expect(createPublishedVersionToolAuthorizer(grantA)(TOOL, ctxB)).toBe(false);
    expect(createPublishedVersionToolAuthorizer(grantB)(TOOL, ctxB)).toBe(true);
  });

  it('accepts only turnId and correlationId when building the context', async () => {
    const grant = await issueTestToolGrant({ organizationId: ORG_A, snapshot: snapshot() });
    const injected = { organizationId: ORG_B } as unknown as { turnId: string };
    expect(() => buildPublishedVersionToolExecutionContext(grant, injected)).toThrow(TypeError);
    expect(buildPublishedVersionToolExecutionContext(grant, { correlationId: 'c1' })).toMatchObject(
      {
        organizationId: ORG_A,
        correlationId: 'c1',
      },
    );
  });
});

describe('published tool grant — immutability and execution', () => {
  it('keeps its own frozen toolset: mutating the snapshot or the grant never widens it', async () => {
    const source = snapshot();
    const grant = await issueTestToolGrant({ organizationId: ORG_A, snapshot: source });
    const authorize = createPublishedVersionToolAuthorizer(grant);
    const ctx = buildPublishedVersionToolExecutionContext(grant);
    source.tools!.push('catalog.search');
    expect(authorize('catalog.search', ctx)).toBe(false);
    expect(() => (grant.tools as string[]).push('catalog.item_detail')).toThrow(TypeError);
    expect(() => {
      (grant as { organizationId: string }).organizationId = ORG_B;
    }).toThrow(TypeError);
    expect(Object.isFrozen(grant) && Object.isFrozen(grant.tools)).toBe(true);
    source.tools!.splice(0, source.tools!.length);
    expect(authorize(TOOL, ctx)).toBe(true);
  });

  it('never executes an unauthorized tool and keeps operating hours working when authorized', async () => {
    const grant = await issueTestToolGrant({ organizationId: ORG_A, snapshot: snapshot() });
    const registry = new InMemoryToolRegistry();
    const execute = vi.fn().mockResolvedValue({ ok: true });
    registry.registerTool({
      name: 'catalog.search',
      validateInput: (a) => ({ success: true, data: a }),
      execute,
    });
    const { createOperatingHoursToolDefinition } = await import('./operating-hours-tool.js');
    registry.registerTool(createOperatingHoursToolDefinition());
    const engine = new ToolExecutionEngine({
      registry,
      isToolAllowed: createPublishedVersionToolAuthorizer(grant),
    });
    const ctx = buildPublishedVersionToolExecutionContext(grant);
    const denied = await engine.executeTool(
      { toolName: 'catalog.search', rawArguments: { query: 'x' } },
      ctx,
    );
    expect(denied).toMatchObject({ status: 'REJECTED', reason: 'UNAUTHORIZED_TOOL' });
    expect(execute).not.toHaveBeenCalled();
    const ok = await engine.executeTool(
      { toolName: TOOL, rawArguments: { query: 'Qual o horário?' } },
      ctx,
    );
    expect(ok.status).toBe('SUCCESS');
  });
});

describe('published tool grant — issuer import boundary', () => {
  it('only the CallLifecycleGateway imports the grant issuer outside tests', () => {
    const root = resolve(__dirname, '../../..');
    const importers: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', 'dist', '.turbo', '.next'].includes(entry.name)) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          const text = readFileSync(full, 'utf8');
          if (text.includes('issueToolGrantForConsumedBootstrap'))
            importers.push(full.slice(root.length + 1));
        }
      }
    };
    for (const top of ['apps', 'packages']) walk(join(root, top));
    expect(importers.sort()).toEqual([
      'apps/voice/src/call-lifecycle-gateway.ts',
      'apps/voice/src/published-tool-grant.ts',
    ]);
  });
});
