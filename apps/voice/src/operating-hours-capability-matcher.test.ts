import { describe, expect, it } from 'vitest';
import {
  matchesOperatingHoursCapability,
  normalizeOperatingHoursTranscript,
} from './operating-hours-capability-matcher.js';

describe('operating-hours-capability-matcher', () => {
  describe('normalization', () => {
    it('normalizes diacritics, case, and whitespace', () => {
      expect(normalizeOperatingHoursTranscript('  QUAL É O HORÁRIO   DE ATENDIMENTO?  ')).toBe(
        'qual e o horario de atendimento',
      );
    });

    it('strips terminal and intermediate punctuation', () => {
      expect(normalizeOperatingHoursTranscript('Até que horas... vocês atendem?!')).toBe(
        'ate que horas voces atendem',
      );
    });

    it('handles non-string or empty input safely', () => {
      expect(normalizeOperatingHoursTranscript('')).toBe('');
      expect(normalizeOperatingHoursTranscript('   ')).toBe('');
      // @ts-expect-error test non-string runtime guard
      expect(normalizeOperatingHoursTranscript(null)).toBe('');
      // @ts-expect-error test non-string runtime guard
      expect(normalizeOperatingHoursTranscript(undefined)).toBe('');
    });
  });

  describe('positive matches (canonical business operating hours)', () => {
    const positiveCases = [
      'qual é o horário de atendimento?',
      'qual o horário de atendimento',
      'QUAL É O HORÁRIO DE FUNCIONAMENTO?',
      'Qual o horario de funcionamento',
      'qual é o seu horário de atendimento?',
      'qual o seu horário de atendimento',
      'qual é o seu horário de funcionamento?',
      'qual o seu horário de funcionamento',
      'qual é o horário de atendimento de vocês?',
      'qual o horário de atendimento de vocês',
      'qual é o horário de funcionamento de vocês?',
      'qual o horário de funcionamento de vocês',
      'até que horas vocês atendem?',
      'ate que horas voce atende?',
      'até que horas fica aberto?',
      'que horas vocês abrem?',
      'que horas você abre?',
      'que horas abre?',
      'que horas vocês fecham?',
      'que horas você fecha?',
      'que horas fecha?',
      'horário de atendimento',
      'horário de funcionamento',
      '  até   que   horas  vocês   atendem???  ',
    ];

    for (const phrase of positiveCases) {
      it(`matches positive phrase: "${phrase}"`, () => {
        expect(matchesOperatingHoursCapability(phrase)).toBe(true);
      });
    }
  });

  describe('negative matches (fail-closed, false-bypass prevention)', () => {
    const negativeCases = [
      // Specific appointment time
      'qual é o horário da minha consulta?',
      'que horas é minha consulta?',
      // Logistics / delivery time
      'que horas meu pedido chega?',
      'qual horário vocês entregam?',
      // Sales callback time
      'qual horário o vendedor vai me ligar?',
      // Day-specific schedule (unsupported in schema)
      'qual o horário amanhã?',
      'vocês abrem amanhã?',
      'vocês abrem no sábado?',
      'qual o horário no domingo?',
      // Holiday exceptions (unsupported in schema)
      'vocês abrem no feriado?',
      'qual o horário no feriado?',
      // Timezone questions (unsupported in schema)
      'qual horário em outro fuso?',
      'qual o horário em Brasília?',
      // Current time question
      'que horas são agora?',
      // Ambiguous question (fail-closed)
      'qual é o horário?',
      'qual o horário?',
      // Unrelated or generative requests
      'olá, bom dia',
      'gostaria de falar com um atendente',
      'quanto custa o plano premium?',
      'quero cancelar meu contrato',
      'onde fica a empresa?',
      'qual o endereço de vocês?',
      'atendimento nota 10',
      'horário',
      'atendimento',
      // Empty and edge cases
      '',
      '    ',
      '???',
    ];

    for (const phrase of negativeCases) {
      it(`rejects negative/ambiguous phrase: "${phrase}"`, () => {
        expect(matchesOperatingHoursCapability(phrase)).toBe(false);
      });
    }
  });
});
