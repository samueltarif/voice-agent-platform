export interface MockTranscriptTurn {
  readonly speaker: 'AI' | 'CONTACT';
  readonly text: string;
  readonly timestamp: string;
}

export interface MockDetailedCall {
  readonly id: string;
  readonly contactName: string;
  readonly companyName: string;
  readonly phoneMasked: string;
  readonly agentName: string;
  readonly duration: string;
  readonly qualificationScore: number;
  readonly qualificationLabel: string;
  readonly intentTags: readonly string[];
  readonly lastAiSummary: string;
  readonly nextRecommendedAction: string;
  readonly costCents: number;
  readonly transcript: readonly MockTranscriptTurn[];
  readonly handoffStatus: 'NONE' | 'PENDING' | 'READY_TO_JOIN';
}

export const MOCK_CALL_DISCLAIMER =
  'UI MOCK • SEM TELEFONIA REAL • SEM ÁUDIO REAL • SEM HANDOFF REAL' as const;

export const MOCK_DETAILED_CALL: MockDetailedCall = {
  id: 'call-det-01',
  contactName: 'Roberto Dias',
  companyName: 'Atlas Equipamentos',
  phoneMasked: '+55 11 98765-XXXX',
  agentName: 'Comercial IA v1',
  duration: '03:12',
  qualificationScore: 82,
  qualificationLabel: 'Lead quente • Alta probabilidade de avanço',
  intentTags: ['Interesse: Alto', 'Objeção: Integração', 'Próximo passo: Retorno'],
  lastAiSummary:
    'Roberto demonstrou interesse em demonstração. Principal requisito é integração com CRM e transbordo para vendedor quando houver intenção. Pediu retorno amanhã às 10h.',
  nextRecommendedAction:
    'Ligar amanhã às 10h com contexto da conversa anterior. Se confirmar interesse, encaminhar para vendedor humano.',
  costCents: 92,
  handoffStatus: 'READY_TO_JOIN',
  transcript: [
    {
      speaker: 'AI',
      timestamp: '10:34:02',
      text: 'Bom dia, Roberto. Estou ligando para entender se faz sentido conversarmos sobre automação de atendimento e voz com IA.',
    },
    {
      speaker: 'CONTACT',
      timestamp: '10:34:11',
      text: 'Pode falar. O que exatamente esse sistema faz?',
    },
    {
      speaker: 'AI',
      timestamp: '10:34:18',
      text: 'Ele conecta seus leads através de agentes de voz treinados, qualifica intenções, registra transcrições e aciona seus vendedores no momento certo.',
    },
    {
      speaker: 'CONTACT',
      timestamp: '10:34:31',
      text: 'O ponto mais importante pra gente seria integrar com o CRM e transferir para um especialista quando o cliente estiver interessado.',
    },
    {
      speaker: 'AI',
      timestamp: '10:34:44',
      text: 'Perfeito, esse fluxo é nativo. Posso registrar seu interesse e agendar com um especialista amanhã às 10h?',
    },
    {
      speaker: 'CONTACT',
      timestamp: '10:34:52',
      text: 'Pode sim. Me liga nesse horário.',
    },
  ],
};
