import { describe, it, expect } from 'vitest';
import {
  agentConfigurationSnapshotV1Schema,
  type AgentConfigurationSnapshotV1,
} from './agent-configuration-v1.js';

describe('AgentConfigurationSnapshotV1 Schema (Zod Unit)', () => {
  const validSnapshot: AgentConfigurationSnapshotV1 = {
    persona: {
      role: 'Assistente de Atendimento e Qualificação',
      companyName: 'Empresa Exemplo Ltda',
      objective: 'Qualificar leads interessados e agendar demonstração',
      tone: 'FORMAL',
      greetingPhrase: 'Olá, sou a assistente virtual da Empresa Exemplo.',
      closingPhrase: 'Agradecemos o contato, até breve!',
      fallbackPhrase: 'Desculpe, não compreendi. Poderia repetir por gentileza?',
    },
    voice: {
      languageCode: 'pt-BR',
    },
    rules: {
      conversational: [
        'Nunca prometa prazos que não constem na política comercial',
        'Seja cordial e mantenha respostas objetivas',
      ],
      deterministic: {
        maxDiscountPercent: 15,
        operatingHours: '08:00-18:00',
      },
    },
    playbook: {
      stages: [
        { name: 'abertura', goal: 'Confirmar identidade do interlocutor' },
        { name: 'qualificacao', goal: 'Compreender a necessidade do cliente' },
      ],
    },
    examples: [
      {
        customerInput: 'Qual o valor da mensalidade?',
        idealAgentResponse: 'Os planos iniciam a partir de R$ 299,00 mensais.',
      },
    ],
  };

  it('accepts a valid snapshot adhering to v1 canonical structure', () => {
    const parsed = agentConfigurationSnapshotV1Schema.safeParse(validSnapshot);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.persona.role).toBe('Assistente de Atendimento e Qualificação');
      expect(parsed.data.voice.languageCode).toBe('pt-BR');
    }
  });

  it('rejects unknown top-level keys because schema is strict', () => {
    const invalid = {
      ...validSnapshot,
      unknownKey: 'unexpected',
    };
    const parsed = agentConfigurationSnapshotV1Schema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it('rejects unknown nested keys inside persona', () => {
    const invalid = {
      ...validSnapshot,
      persona: {
        ...validSnapshot.persona,
        unexpectedProperty: 'not_allowed',
      },
    };
    const parsed = agentConfigurationSnapshotV1Schema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it('rejects invalid tone', () => {
    const invalid = {
      ...validSnapshot,
      persona: {
        ...validSnapshot.persona,
        tone: 'ANGRY' as unknown as 'FORMAL',
      },
    };
    const parsed = agentConfigurationSnapshotV1Schema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it('rejects invalid languageCode/locale', () => {
    const invalid = {
      ...validSnapshot,
      voice: {
        languageCode: 'fr-FR' as unknown as 'pt-BR',
      },
    };
    const parsed = agentConfigurationSnapshotV1Schema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it('enforces required fields (missing objective rejected)', () => {
    const { objective: _objective, ...personaWithoutObjective } = validSnapshot.persona;
    const invalid = {
      ...validSnapshot,
      persona: personaWithoutObjective,
    };
    const parsed = agentConfigurationSnapshotV1Schema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it('rejects tools and knowledge fields not accepted in v1', () => {
    const withTools = {
      ...validSnapshot,
      tools: ['checkProductPrice', 'lookupCustomer'],
    };
    const withKnowledge = {
      ...validSnapshot,
      knowledgeDocumentIds: ['doc-123'],
    };
    const withVoiceProfile = {
      ...validSnapshot,
      voice: {
        ...validSnapshot.voice,
        voiceProfileKey: 'eleven_labs_alice',
        pitch: 1.0,
      },
    };

    expect(agentConfigurationSnapshotV1Schema.safeParse(withTools).success).toBe(false);
    expect(agentConfigurationSnapshotV1Schema.safeParse(withKnowledge).success).toBe(false);
    expect(agentConfigurationSnapshotV1Schema.safeParse(withVoiceProfile).success).toBe(false);
  });

  it('infers exact types without any', () => {
    const result: AgentConfigurationSnapshotV1 = validSnapshot;
    expect(result.persona.tone).toBe('FORMAL');
  });
});
