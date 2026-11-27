import { describe, expect, it } from 'vitest';
import type {
  AgentConfigurationSnapshotV1,
  FindSlotsResult,
  RequestBookingResult,
  SchedulingAgentPort,
  SchedulingAgentScope,
} from '@voice-agent/contracts';
import { issueTestToolGrant } from './published-tool-grant-fixtures.js';
import {
  buildPublishedVersionToolExecutionContext,
  createPublishedVersionToolAuthorizer,
} from './published-version-toolset.js';
import {
  createSchedulingToolDefinitions,
  SCHEDULING_CONTEXT_MISMATCH_MESSAGE,
  schedulingScopeForGrant,
} from './scheduling-agent-tools.js';
import { SCHEDULING_GRANT_REQUIRED_MESSAGE } from './scheduling-session-authority.js';
import { ToolExecutionEngine } from './tool-execution-engine.js';
import { InMemoryToolRegistry } from './tool-registry.js';

const ORG = '22222222-2222-4222-8222-222222222222';
const CAL = '55555555-5555-4555-8555-555555555555';

function snapshotWith(tools: AgentConfigurationSnapshotV1['tools']): AgentConfigurationSnapshotV1 {
  return {
    persona: {
      role: 'Atendente',
      companyName: 'Empresa Exemplo',
      objective: 'Agendar',
      tone: 'FORMAL',
      greetingPhrase: 'Olá',
      closingPhrase: 'Até logo',
      fallbackPhrase: 'Pode repetir?',
    },
    voice: { languageCode: 'pt-BR' },
    rules: { conversational: [], deterministic: {} },
    tools,
    scheduling: { calendarId: CAL },
  };
}

const BOTH = ['scheduling.find_slots', 'scheduling.request_booking'] as const;
const VALID_REQUEST = { listRevision: 1, option: 2, leadConfirmation: 'Sim, pode marcar.' };

function recordingPort() {
  const calls: { method: string; scope: SchedulingAgentScope; args?: unknown }[] = [];
  const port: SchedulingAgentPort = {
    findSlots: async (scope, args) => {
      calls.push({ method: 'findSlots', scope, args });
      return { status: 'NO_AVAILABILITY', speech: 'x' } satisfies FindSlotsResult;
    },
    requestBooking: async (scope, args) => {
      calls.push({ method: 'requestBooking', scope, args });
      return {
        status: 'REFUSED',
        reason: 'OFFER_NOT_CURRENT',
        speech: 'x',
      } satisfies RequestBookingResult;
    },
  };
  return { port, calls };
}

async function engineFor(tools: AgentConfigurationSnapshotV1['tools']) {
  const grant = await issueTestToolGrant({ organizationId: ORG, snapshot: snapshotWith(tools) });
  const { port, calls } = recordingPort();
  const registry = new InMemoryToolRegistry();
  const [findSlots, requestBooking] = createSchedulingToolDefinitions(grant, port);
  registry.registerTool(findSlots);
  registry.registerTool(requestBooking);
  const engine = new ToolExecutionEngine({
    registry,
    isToolAllowed: createPublishedVersionToolAuthorizer(grant),
  });
  return { grant, engine, calls, context: buildPublishedVersionToolExecutionContext(grant) };
}

describe('E2 (DEC-077) — scheduling tools bound to a legitimate grant', () => {
  it('the scope comes only from the grant (session = callId, calendar captured as value)', async () => {
    const { grant, engine, calls, context } = await engineFor([...BOTH]);
    const result = await engine.executeTool(
      { toolName: 'scheduling.find_slots', rawArguments: { day: '2026-12-01' } },
      context,
    );
    expect(result.status).toBe('SUCCESS');
    expect(calls).toEqual([
      {
        method: 'findSlots',
        scope: {
          organizationId: ORG,
          sessionId: grant.callId,
          agentId: grant.agentId,
          agentVersionId: grant.agentVersionId,
          grantCalendarId: CAL,
        },
        args: { day: '2026-12-01' },
      },
    ]);
  });

  it('the model cannot pass ids or consent booleans; only list, option and the phrase', async () => {
    const { engine, calls, context } = await engineFor([...BOTH]);
    for (const rawArguments of [
      {},
      { ...VALID_REQUEST, confirmed: true },
      { ...VALID_REQUEST, offerId: 'o' },
      { ...VALID_REQUEST, leadId: 'l' },
      { ...VALID_REQUEST, sessionId: 's' },
      { ...VALID_REQUEST, option: 9 },
    ]) {
      const result = await engine.executeTool(
        { toolName: 'scheduling.request_booking', rawArguments },
        context,
      );
      expect([rawArguments, result.status]).toEqual([rawArguments, 'REJECTED']);
    }
    const findWithIds = await engine.executeTool(
      { toolName: 'scheduling.find_slots', rawArguments: { calendarId: CAL } },
      context,
    );
    expect(findWithIds.status).toBe('REJECTED');
    expect(calls).toHaveLength(0);
    const valid = await engine.executeTool(
      { toolName: 'scheduling.request_booking', rawArguments: VALID_REQUEST },
      context,
    );
    expect(valid.status).toBe('SUCCESS');
    expect(calls.map((call) => [call.method, call.args])).toEqual([
      ['requestBooking', VALID_REQUEST],
    ]);
  });

  it('a tool outside the published toolset is rejected before the port', async () => {
    const { engine, calls, context } = await engineFor(['catalog.search']);
    const result = await engine.executeTool(
      { toolName: 'scheduling.request_booking', rawArguments: VALID_REQUEST },
      context,
    );
    expect(result).toMatchObject({ status: 'REJECTED', reason: 'UNAUTHORIZED_TOOL' });
    expect(calls).toHaveLength(0);
  });

  it('forged grants and foreign execution contexts are refused', async () => {
    const grant = await issueTestToolGrant({
      organizationId: ORG,
      snapshot: snapshotWith([...BOTH]),
    });
    for (const forged of [{ ...grant }, JSON.parse(JSON.stringify(grant))]) {
      expect(() => schedulingScopeForGrant(forged)).toThrow(SCHEDULING_GRANT_REQUIRED_MESSAGE);
      expect(() => createSchedulingToolDefinitions(forged, recordingPort().port)).toThrow(
        SCHEDULING_GRANT_REQUIRED_MESSAGE,
      );
    }
    const other = await issueTestToolGrant({
      organizationId: ORG,
      snapshot: snapshotWith([...BOTH]),
    });
    const { port, calls } = recordingPort();
    const [findSlots] = createSchedulingToolDefinitions(grant, port);
    await expect(
      findSlots.execute({}, buildPublishedVersionToolExecutionContext(other)),
    ).rejects.toThrow(SCHEDULING_CONTEXT_MISMATCH_MESSAGE);
    expect(calls).toHaveLength(0);
  });
});
