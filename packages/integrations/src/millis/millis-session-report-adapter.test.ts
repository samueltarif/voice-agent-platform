import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  evaluatePostCallReport,
  normalizedProviderEventSchema,
  type ProviderWebhookRequest,
} from '@voice-agent/contracts';
import {
  adaptMillisSessionReport,
  createMillisSessionReportNormalizer,
} from './millis-session-report-adapter.js';

/** Amostra REAL anonimizada (exp. 5) — fonte única, não copiada para o teste. */
const SAMPLE_URL = new URL(
  '../../../../docs/research/e2v/E2V_SESSION_REPORT_SAMPLE.anonymized.json',
  import.meta.url,
);
const SAMPLE_TEXT = readFileSync(SAMPLE_URL, 'utf8');
type Body = Record<string, unknown> & {
  chat: Array<Record<string, unknown>>;
  function_calls?: Array<Record<string, unknown>>;
};
type Call = { id: string; function: { arguments: string } };
const callOf = (b: Body, i: number) => (b.chat[i]!.tool_calls as Call[])[0]!;
const fc = (b: Body) => b.function_calls!;
const sample = (): Body => JSON.parse(SAMPLE_TEXT) as Body;
const RECEIVED = new Date('2026-11-27T15:00:00.000Z');
const request = (body: unknown): ProviderWebhookRequest => ({
  provider: 'millis',
  headers: {},
  rawBody: typeof body === 'string' ? body : JSON.stringify(body),
  receivedAt: RECEIVED,
});
const adapt = (body: unknown, toolNames?: ReadonlyMap<string, string>) =>
  adaptMillisSessionReport(request(body), toolNames ? { toolNames } : {});

describe('Millis session report adapter — real anonymized sample (exp. 5)', () => {
  const result = adapt(SAMPLE_TEXT)!;

  it('produces a valid normalized SESSION_REPORT keyed by the provider session id', () => {
    expect(normalizedProviderEventSchema.safeParse(result.event).success).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.event).toMatchObject({
      kind: 'SESSION_REPORT',
      providerEventId: null,
      providerCallReference: 'provider-session-07',
      occurredAt: new Date(1795788875.2679985 * 1000).toISOString(),
    });
    expect(result.event.report).toMatchObject({
      ordering: 'TIMELINE',
      integrity: 'COMPLETE',
      endReason: 'TIMEOUT_UNSPECIFIED',
      durationSeconds: 96.09253096580505,
    });
  });

  it('keeps chat order, speakers and tool calls; tool results never become speech', () => {
    const kinds = result.event.report.entries.map((e) => e.kind[0]).join('');
    expect(kinds).toBe('ALALATAALATALALATAAA');
    const texts = result.event.report.entries.flatMap((e) => ('text' in e ? [e.text] : []));
    expect(texts.join(' ')).not.toMatch(/NO_AVAILABILITY|TECHNICAL_ERROR|Failed to execute/);
    const calls = result.event.report.entries.filter((e) => e.kind === 'TOOL_CALL');
    expect(calls).toEqual([
      {
        kind: 'TOOL_CALL',
        toolName: 'e2v_consultar_agenda',
        arguments: { preferencia: 'qualquer dia e período disponível' },
      },
      {
        kind: 'TOOL_CALL',
        toolName: 'e2v_consultar_agenda',
        arguments: { preferencia: 'sexta-feira' },
      },
      {
        kind: 'TOOL_CALL',
        toolName: 'e2v_consultar_agenda',
        arguments: { preferencia: 'segunda-feira' },
      },
    ]);
  });

  it('preserves the interrupted partial message verbatim, with no invented marker', () => {
    expect(result.event.report.entries).toContainEqual({ kind: 'AGENT', text: 'Você ainda' });
    expect(JSON.stringify(result.event.report)).not.toMatch(/interrupt|played|heard/i);
  });

  it('a generic timeout is never inactivity, even when the last line is the idle message', () => {
    expect(result.event.report.endReason).toBe('TIMEOUT_UNSPECIFIED');
    const evaluation = evaluatePostCallReport(result.event.report, null);
    expect(evaluation).toMatchObject({ interlocution: true, optOut: 'NONE' });
    expect(evaluation.booking.decision).toBe('NONE');
  });

  it('ignores metadata, call_id and agent_id for identification', () => {
    const body = sample();
    body.metadata = { session_id: 'other-session' };
    body.call_id = 'CA-other';
    body.agent_id = 'agent-other';
    expect(adapt(body)!.event.providerCallReference).toBe('provider-session-07');
  });

  it('the normalizer returns the same event', () => {
    const event = createMillisSessionReportNormalizer().normalize(request(SAMPLE_TEXT));
    expect(event).toEqual(result.event);
  });
});

describe('Millis session report adapter — ordering is never assumed', () => {
  const unknownWith = (mutate: (body: Body) => void, issue: string) => {
    const body = sample();
    mutate(body);
    const out = adapt(body)!;
    expect(out.issues).toContain(issue);
    expect(out.event.report.ordering).toBe('UNKNOWN');
  };

  it('function_calls missing, extra, reordered or with different arguments', () => {
    unknownWith((b) => delete b.function_calls, 'FUNCTION_CALLS_ABSENT');
    unknownWith((b) => fc(b).pop(), 'FUNCTION_CALLS_MISMATCH');
    unknownWith((b) => fc(b).reverse(), 'FUNCTION_CALLS_MISMATCH');
    unknownWith(
      (b) => ((fc(b)[0]!.params as Record<string, unknown>).preferencia = 'x'),
      'FUNCTION_CALLS_MISMATCH',
    );
    unknownWith((b) => (b.function_calls = 'x' as never), 'FUNCTION_CALLS_INVALID');
  });

  it('a function call injected with another session id', () => {
    unknownWith(
      (b) => ((fc(b)[1]!.params as Record<string, unknown>).session_id = 'other'),
      'FUNCTION_CALL_SESSION_MISMATCH',
    );
  });

  it('a tool result without its call, unknown roles or non-text content', () => {
    unknownWith((b) => (b.chat[5]!.tool_call_id = 'nope'), 'TOOL_RESULT_UNPAIRED');
    unknownWith(
      (b) => b.chat.splice(1, 0, { role: 'system', content: 'x' }),
      'UNRECOGNIZED_MESSAGE',
    );
    unknownWith((b) => (b.chat[1]!.content = [{ type: 'text' }]), 'UNRECOGNIZED_MESSAGE');
    unknownWith((b) => (b.chat[1]!.tool_calls = [{ id: 'u' }]), 'UNRECOGNIZED_MESSAGE');
  });

  it('invalid tool arguments, duplicate call ids, oversized text', () => {
    unknownWith((b) => (callOf(b, 4).function.arguments = '{'), 'TOOL_ARGUMENTS_INVALID');
    unknownWith((b) => (callOf(b, 9).id = 'chatcmpl-tool-example-01'), 'DUPLICATE_TOOL_CALL_ID');
    unknownWith((b) => (b.chat[1]!.content = 'a'.repeat(5000)), 'TEXT_TRUNCATED');
  });

  it('caps the number of entries and flags the history as incomplete (audit #184 A3)', () => {
    const body = sample();
    body.chat = Array.from({ length: 500 }, () => ({ role: 'user', content: 'sim' }));
    body.chat.push({ role: 'user', content: 'Não me ligue mais.' });
    body.function_calls = [];
    const out = adapt(body)!;
    expect(out.event.report.entries).toHaveLength(500);
    expect(out.event.report).toMatchObject({ ordering: 'UNKNOWN', integrity: 'INCOMPLETE' });
    expect(evaluatePostCallReport(out.event.report, null)).toMatchObject({ complete: false });
  });

  it('speech possibly lost ⇒ INCOMPLETE; only a cross-check mismatch ⇒ order unknown but complete', () => {
    const integrityOf = (mutate: (b: Body) => void) => {
      const body = sample();
      mutate(body);
      return adapt(body)!.event.report.integrity;
    };
    expect(integrityOf((b) => b.chat.splice(1, 0, { role: 'system', content: 'x' }))).toBe(
      'INCOMPLETE',
    );
    expect(integrityOf((b) => (b.chat[1]!.content = [{ type: 'text', text: 'pare' }]))).toBe(
      'INCOMPLETE',
    );
    expect(integrityOf((b) => (b.chat[1]!.content = 'a'.repeat(5000)))).toBe('INCOMPLETE');
    expect(integrityOf((b) => (callOf(b, 4).function.arguments = '{'))).toBe('INCOMPLETE');
    expect(integrityOf((b) => fc(b).pop())).toBe('COMPLETE');
  });
});

describe('Millis session report adapter — no invented consent', () => {
  /** Aceite verdadeiro só quando a fala do lead está no chat; frase do modelo não conta. */
  const bookingBody = (leadReply: string | null) => {
    const body = sample();
    const args = { listRevision: 1, option: 2, leadConfirmation: 'o lead confirmou sexta 9h' };
    const chat: Array<Record<string, unknown>> = [
      { role: 'assistant', content: 'Posso confirmar sexta-feira às 9h?' },
      ...(leadReply === null ? [] : [{ role: 'user', content: leadReply }]),
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'c1',
            type: 'function',
            function: { name: 'scheduling_request_booking', arguments: JSON.stringify(args) },
          },
        ],
      },
      {
        role: 'tool',
        name: 'scheduling_request_booking',
        tool_call_id: 'c1',
        content: '{"status":"ACEITO PELO LEAD"}',
      },
    ];
    body.chat = chat;
    body.function_calls = [
      {
        name: 'scheduling_request_booking',
        params: { ...args, session_id: 'provider-session-07' },
        result: '',
        run_after_call: false,
      },
    ];
    return body;
  };
  const toolNames = new Map([['scheduling_request_booking', 'scheduling.request_booking']]);
  const intent = {
    listRevision: 1,
    option: 2,
    startsAt: '2026-12-04T12:00:00.000Z',
    timeZone: 'America/Sao_Paulo',
  };

  it('accepts only with the lead affirmation present in the chat', () => {
    const report = adapt(bookingBody('Sim, pode marcar.'), toolNames)!.event.report;
    expect(evaluatePostCallReport(report, intent).booking.decision).toBe('ACCEPTED');
  });

  it('the model phrase and the tool result never stand in for the lead', () => {
    const out = adapt(bookingBody(null), toolNames)!;
    expect(out.event.report.entries.some((e) => e.kind === 'LEAD')).toBe(false);
    expect(evaluatePostCallReport(out.event.report, intent).booking.decision).toBe('REVIEW');
  });

  it('without the name mapping the call is not recognized (review, not booking)', () => {
    const report = adapt(bookingBody('Sim, pode marcar.'))!.event.report;
    expect(evaluatePostCallReport(report, intent).booking).toEqual({
      decision: 'REVIEW',
      reason: 'TOOL_CALL_NOT_IN_REPORT',
    });
  });
});

describe('Millis session report adapter — quarantine and end reasons', () => {
  it('unintelligible bodies or a missing session id have no event', () => {
    for (const bad of [
      '{',
      '[]',
      JSON.stringify({ chat: {} }),
      JSON.stringify({ chat: [] }),
      JSON.stringify({ chat: [], session_id: ' ' }),
    ]) {
      expect(adapt(bad)).toBeNull();
    }
  });

  it('maps only observed statuses; never infers inactivity or disinterest', () => {
    const endOf = (patch: Record<string, unknown>) =>
      adapt({ ...sample(), ...patch })!.event.report.endReason;
    expect(endOf({ call_status: 'completed' })).toBe('UNKNOWN');
    expect(endOf({ call_status: 'user-ended' })).toBe('UNKNOWN');
    expect(endOf({ call_status: undefined })).toBe('UNKNOWN');
    expect(endOf({ error_message: 'boom' })).toBe('ERROR');
  });

  it('implausible duration or end time fall back safely', () => {
    const out = adapt({ ...sample(), duration: -1, 'call_metrics/call_end_ts': 1, ts: 'x' })!;
    expect(out.event.report.durationSeconds).toBeNull();
    expect(out.event.occurredAt).toBe(RECEIVED.toISOString());
  });
});
