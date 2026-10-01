import type { AgentConfigurationSnapshotV1 } from '@voice-agent/contracts';
import { describe, expect, it } from 'vitest';
import {
  handleOperatingHoursTurn,
  OPERATING_HOURS_CAPABILITY_ID,
} from './operating-hours-turn-handler.js';

describe('operating-hours-turn-handler', () => {
  const orgA = '11111111-1111-4111-8111-111111111111';
  const orgB = '22222222-2222-4222-8222-222222222222';

  const mockSnapshot: AgentConfigurationSnapshotV1 = {
    persona: {
      role: 'Atendente Virtual',
      companyName: 'ACME Corp',
      objective: 'Atendimento geral',
      tone: 'FORMAL',
      greetingPhrase: 'Olá, como posso ajudar?',
      closingPhrase: 'Tenha um bom dia!',
      fallbackPhrase: 'Não compreendi.',
    },
    voice: {
      languageCode: 'pt-BR',
    },
    rules: {
      conversational: ['Seja breve'],
      deterministic: {
        operatingHours: 'Segunda a Sexta, das 08h às 18h',
      },
    },
  };

  describe('successful deterministic handling', () => {
    it('handles operating hours turn with direct operatingHours string', () => {
      const result = handleOperatingHoursTurn({
        sessionOrganizationId: orgA,
        configurationOrganizationId: orgA,
        runtimeState: 'ACTIVE',
        callerTranscript: 'Qual é o horário de atendimento?',
        operatingHours: 'Segunda a Sexta, das 08:00 às 18:00',
      });

      expect(result).toEqual({
        handled: true,
        capabilityId: OPERATING_HOURS_CAPABILITY_ID,
        responseText: 'Nosso horário de atendimento é: Segunda a Sexta, das 08:00 às 18:00.',
      });
    });

    it('handles operating hours turn using AgentConfigurationSnapshotV1', () => {
      const result = handleOperatingHoursTurn({
        sessionOrganizationId: orgA,
        configurationOrganizationId: orgA,
        runtimeState: 'ACTIVE',
        callerTranscript: 'Até que horas vocês atendem?',
        snapshot: mockSnapshot,
      });

      expect(result).toEqual({
        handled: true,
        capabilityId: OPERATING_HOURS_CAPABILITY_ID,
        responseText: 'Nosso horário de atendimento é: Segunda a Sexta, das 08h às 18h.',
      });
    });

    it('succeeds when runtimeState is omitted (defaults to permissive if caller omits state)', () => {
      const result = handleOperatingHoursTurn({
        sessionOrganizationId: orgA,
        configurationOrganizationId: orgA,
        callerTranscript: 'Que horas vocês abrem?',
        operatingHours: '08:00 às 18:00',
      });

      expect(result.handled).toBe(true);
    });
  });

  describe('tenant match guard (fail-closed)', () => {
    it('fails closed when sessionOrganizationId does not match configurationOrganizationId', () => {
      const result = handleOperatingHoursTurn({
        sessionOrganizationId: orgA,
        configurationOrganizationId: orgB,
        runtimeState: 'ACTIVE',
        callerTranscript: 'Qual é o horário de atendimento?',
        operatingHours: '08:00-18:00',
      });

      expect(result).toEqual({
        handled: false,
        capabilityId: OPERATING_HOURS_CAPABILITY_ID,
      });
    });

    it('fails closed when sessionOrganizationId is empty', () => {
      const result = handleOperatingHoursTurn({
        sessionOrganizationId: '',
        configurationOrganizationId: orgA,
        runtimeState: 'ACTIVE',
        callerTranscript: 'Qual é o horário de atendimento?',
        operatingHours: '08:00-18:00',
      });

      expect(result).toEqual({
        handled: false,
        capabilityId: OPERATING_HOURS_CAPABILITY_ID,
      });
    });

    it('fails closed when configurationOrganizationId is empty', () => {
      const result = handleOperatingHoursTurn({
        sessionOrganizationId: orgA,
        configurationOrganizationId: '',
        runtimeState: 'ACTIVE',
        callerTranscript: 'Qual é o horário de atendimento?',
        operatingHours: '08:00-18:00',
      });

      expect(result).toEqual({
        handled: false,
        capabilityId: OPERATING_HOURS_CAPABILITY_ID,
      });
    });
  });

  describe('runtime state guard (fail-closed)', () => {
    const nonActiveStates = ['CREATED', 'CONNECTING', 'ENDING', 'ENDED', 'FAILED'] as const;

    for (const state of nonActiveStates) {
      it(`fails closed when runtimeState is '${state}'`, () => {
        const result = handleOperatingHoursTurn({
          sessionOrganizationId: orgA,
          configurationOrganizationId: orgA,
          runtimeState: state,
          callerTranscript: 'Qual é o horário de atendimento?',
          operatingHours: '08:00-18:00',
        });

        expect(result).toEqual({
          handled: false,
          capabilityId: OPERATING_HOURS_CAPABILITY_ID,
        });
      });
    }
  });

  describe('configuration guard (fail-closed)', () => {
    it('fails closed when operatingHours is undefined and snapshot has no operatingHours', () => {
      const emptySnapshot: AgentConfigurationSnapshotV1 = {
        ...mockSnapshot,
        rules: {
          ...mockSnapshot.rules,
          deterministic: {},
        },
      };

      const result = handleOperatingHoursTurn({
        sessionOrganizationId: orgA,
        configurationOrganizationId: orgA,
        runtimeState: 'ACTIVE',
        callerTranscript: 'Qual é o horário de atendimento?',
        snapshot: emptySnapshot,
      });

      expect(result).toEqual({
        handled: false,
        capabilityId: OPERATING_HOURS_CAPABILITY_ID,
      });
    });

    it('fails closed when operatingHours is an empty string', () => {
      const result = handleOperatingHoursTurn({
        sessionOrganizationId: orgA,
        configurationOrganizationId: orgA,
        runtimeState: 'ACTIVE',
        callerTranscript: 'Qual é o horário de atendimento?',
        operatingHours: '',
      });

      expect(result).toEqual({
        handled: false,
        capabilityId: OPERATING_HOURS_CAPABILITY_ID,
      });
    });

    it('fails closed when operatingHours is whitespace only', () => {
      const result = handleOperatingHoursTurn({
        sessionOrganizationId: orgA,
        configurationOrganizationId: orgA,
        runtimeState: 'ACTIVE',
        callerTranscript: 'Qual é o horário de atendimento?',
        operatingHours: '    ',
      });

      expect(result).toEqual({
        handled: false,
        capabilityId: OPERATING_HOURS_CAPABILITY_ID,
      });
    });
  });

  describe('capability matcher guard (fail-closed)', () => {
    it('fails closed when transcript is not an operating hours question', () => {
      const result = handleOperatingHoursTurn({
        sessionOrganizationId: orgA,
        configurationOrganizationId: orgA,
        runtimeState: 'ACTIVE',
        callerTranscript: 'Qual o valor do produto?',
        operatingHours: '08:00-18:00',
      });

      expect(result).toEqual({
        handled: false,
        capabilityId: OPERATING_HOURS_CAPABILITY_ID,
      });
    });

    it('fails closed when transcript is an ambiguous question', () => {
      const result = handleOperatingHoursTurn({
        sessionOrganizationId: orgA,
        configurationOrganizationId: orgA,
        runtimeState: 'ACTIVE',
        callerTranscript: 'Qual é o horário?',
        operatingHours: '08:00-18:00',
      });

      expect(result).toEqual({
        handled: false,
        capabilityId: OPERATING_HOURS_CAPABILITY_ID,
      });
    });

    it('fails closed when transcript is an appointment question', () => {
      const result = handleOperatingHoursTurn({
        sessionOrganizationId: orgA,
        configurationOrganizationId: orgA,
        runtimeState: 'ACTIVE',
        callerTranscript: 'Qual é o horário da minha consulta?',
        operatingHours: '08:00-18:00',
      });

      expect(result).toEqual({
        handled: false,
        capabilityId: OPERATING_HOURS_CAPABILITY_ID,
      });
    });
  });

  describe('purity and absence of side-effects', () => {
    it('does not mutate input objects', () => {
      const input = {
        sessionOrganizationId: orgA,
        configurationOrganizationId: orgA,
        runtimeState: 'ACTIVE' as const,
        callerTranscript: 'Qual é o horário de atendimento?',
        operatingHours: '08:00-18:00',
      };
      const inputCopy = { ...input };

      handleOperatingHoursTurn(input);

      expect(input).toEqual(inputCopy);
    });
  });
});
