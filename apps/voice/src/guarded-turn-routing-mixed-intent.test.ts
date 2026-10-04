import { describe, expect, it } from 'vitest';
import type {
  AgentConfigurationSnapshotV1,
  AuxiliaryTurnDecisionInput,
  AuxiliaryTurnDecisionOutput,
  AuxiliaryTurnDecisionPort,
} from '@voice-agent/contracts';
import { ConversationOrchestrator } from './conversation-orchestrator.js';
import { createCallSession } from './create-call-session.js';
import { FakeConversationModel } from './fake-conversation-model.js';
import { FakeVoiceTransport } from './fake-voice-transport.js';
import { InMemoryCallSessionStore } from './in-memory-call-session-store.js';
import { InMemoryConversationHistoryStore } from './in-memory-conversation-history-store.js';
import { CANONICAL_SECURITY_BLOCKED_RESPONSE } from './security-blocked-response.js';

class FakeConfigurableAuxiliaryPort implements AuxiliaryTurnDecisionPort {
  readonly providerName = 'fake-configurable-auxiliary';
  public callCount = 0;
  public evaluatedInputs: AuxiliaryTurnDecisionInput[] = [];
  public output: AuxiliaryTurnDecisionOutput = {
    deterministicScore: 0.1,
    generativeScore: 0.8,
    securityScore: 0.01,
    providerModel: 'fake-jev-v1',
    latencyMs: 10,
  };

  async evaluateTurn(input: AuxiliaryTurnDecisionInput): Promise<AuxiliaryTurnDecisionOutput> {
    this.callCount++;
    this.evaluatedInputs.push(input);
    return this.output;
  }
}

const organizationId = '11111111-1111-1111-1111-111111111111';
const callId = '22222222-2222-2222-2222-222222222222';

const mixedTranscript =
  'Qual o horário de funcionamento de vocês e qual o melhor horário para ligar sem esperar?';

function baseSnapshot(): AgentConfigurationSnapshotV1 {
  return {
    persona: {
      role: 'Atendente',
      companyName: 'Empresa Teste',
      objective: 'Atender clientes',
      tone: 'OBJECTIVE',
      greetingPhrase: 'Olá!',
      closingPhrase: 'Até logo!',
      fallbackPhrase: 'Não compreendi',
    },
    voice: { languageCode: 'pt-BR' },
    rules: {
      conversational: [],
      deterministic: { operatingHours: 'Segunda a Sexta das 08h às 18h' },
    },
    playbook: { stages: [] },
    examples: [],
  };
}

describe('Guarded Routing Mixed Intent (Slice 006BD)', () => {
  async function setup(port: FakeConfigurableAuxiliaryPort) {
    const sessionStore = new InMemoryCallSessionStore();
    const transport = new FakeVoiceTransport();
    const model = new FakeConversationModel();
    const historyStore = new InMemoryConversationHistoryStore();
    const orchestrator = new ConversationOrchestrator({
      sessionStore,
      transport,
      model,
      historyStore,
      guardedRoutingPort: port,
    });
    const session = {
      ...createCallSession({
        callId,
        organizationId,
        agentId: '33333333-3333-3333-3333-333333333333',
        agentVersionId: '44444444-4444-4444-4444-444444444444',
      }),
      runtimeState: 'ACTIVE' as const,
    };
    await sessionStore.save(session);
    return { transport, model, orchestrator };
  }

  async function speak(orchestrator: ConversationOrchestrator, transcript: string) {
    await orchestrator.handleEvent(
      {
        type: 'user.speech.final',
        callId,
        organizationId,
        turnId: 'turn-001',
        transcript,
        timestamp: new Date(),
      },
      baseSnapshot(),
    );
  }

  it('M1. mixed intent + GENERATIVE_REQUIRED evaluates Jev and streams full transcript generatively', async () => {
    const port = new FakeConfigurableAuxiliaryPort();
    const { transport, model, orchestrator } = await setup(port);
    await speak(orchestrator, mixedTranscript);
    expect(port.callCount).toBe(1);
    expect(port.evaluatedInputs[0]?.callerTranscript).toBe(mixedTranscript);
    expect(model.recordedInputs.length).toBe(1);
    const userContents = model.recordedInputs[0]?.messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content);
    expect(userContents).toContain(mixedTranscript);
    const texts = transport.speakCalls.map((c) => c.command.text);
    expect(texts.some((t) => t.includes('Segunda a Sexta'))).toBe(false);
  });

  it('M2. mixed intent + DETERMINISTIC_CANDIDATE declines handler and falls back generatively', async () => {
    const port = new FakeConfigurableAuxiliaryPort();
    port.output = {
      deterministicScore: 0.9,
      generativeScore: 0.1,
      securityScore: 0.01,
      providerModel: 'fake-jev-v1',
      latencyMs: 10,
    };
    const { transport, model, orchestrator } = await setup(port);
    await speak(orchestrator, mixedTranscript);
    expect(port.callCount).toBe(1);
    expect(model.recordedInputs.length).toBe(1);
    const texts = transport.speakCalls.map((c) => c.command.text);
    expect(texts.some((t) => t.includes('Segunda a Sexta'))).toBe(false);
  });

  it('M3. mixed intent + security scores preserves SECURITY_ESCALATE', async () => {
    const port = new FakeConfigurableAuxiliaryPort();
    port.output = {
      deterministicScore: 0.1,
      generativeScore: 0.1,
      securityScore: 0.9,
      providerModel: 'fake-jev-v1',
      latencyMs: 10,
    };
    const { transport, model, orchestrator } = await setup(port);
    await speak(orchestrator, mixedTranscript);
    expect(port.callCount).toBe(1);
    expect(model.recordedInputs.length).toBe(0);
    const texts = transport.speakCalls.map((c) => c.command.text);
    expect(texts).toContain(CANONICAL_SECURITY_BLOCKED_RESPONSE);
  });

  it('M4. pure exact request still resolves deterministically without generative call', async () => {
    const port = new FakeConfigurableAuxiliaryPort();
    port.output = {
      deterministicScore: 0.9,
      generativeScore: 0.1,
      securityScore: 0.01,
      providerModel: 'fake-jev-v1',
      latencyMs: 10,
    };
    const { transport, model, orchestrator } = await setup(port);
    await speak(orchestrator, 'Qual é o horário de atendimento?');
    expect(port.callCount).toBe(1);
    expect(model.recordedInputs.length).toBe(0);
    const texts = transport.speakCalls.map((c) => c.command.text);
    expect(texts.some((t) => t.includes('Segunda a Sexta'))).toBe(true);
  });

  it('M5. unrelated request keeps existing unmatched behavior without Jev', async () => {
    const port = new FakeConfigurableAuxiliaryPort();
    const { model, orchestrator } = await setup(port);
    await speak(orchestrator, 'Quero cancelar minha conta.');
    expect(port.callCount).toBe(0);
    expect(model.recordedInputs.length).toBe(1);
  });
});
