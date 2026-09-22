export interface MockKpiSummary {
  readonly callsToday: number;
  readonly callsVariationPercent: number;
  readonly connectionRatePercent: number;
  readonly qualifiedLeads: number;
  readonly qualifiedNote: string;
  readonly humanHandoffs: number;
  readonly handoffsWaiting: number;
}

export interface MockLiveCall {
  readonly id: string;
  readonly contactName: string;
  readonly companyName: string;
  readonly duration: string;
  readonly agentName: string;
  readonly status: 'IN_CALL' | 'WAITING_AGENT' | 'CONNECTING';
  readonly intent: string;
  readonly handoffStatus: 'NONE' | 'PENDING' | 'READY_TO_JOIN';
}

export interface MockCampaignProgress {
  readonly id: string;
  readonly name: string;
  readonly totalLeads: number;
  readonly processedLeads: number;
  readonly connectedLeads: number;
  readonly qualifiedLeads: number;
  readonly costCents: number;
}

export interface MockHandoffItem {
  readonly id: string;
  readonly contactName: string;
  readonly sellerName: string;
  readonly status: 'READY_TO_JOIN' | 'NOTIFIED' | 'WAITING';
  readonly note: string;
}

export interface MockRecentCall {
  readonly id: string;
  readonly contactName: string;
  readonly campaignName: string;
  readonly duration: string;
  readonly outcome: 'QUALIFIED' | 'UNQUALIFIED' | 'CALLBACK' | 'SCHEDULED';
  readonly aiSummary: string;
  readonly costCents: number;
}

export interface MockDashboardData {
  readonly kpis: MockKpiSummary;
  readonly liveCalls: readonly MockLiveCall[];
  readonly activeCampaign: MockCampaignProgress;
  readonly handoffQueue: readonly MockHandoffItem[];
  readonly recentCalls: readonly MockRecentCall[];
}

export const MOCK_DASHBOARD_DATA: MockDashboardData = {
  kpis: {
    callsToday: 38,
    callsVariationPercent: 12,
    connectionRatePercent: 71,
    qualifiedLeads: 9,
    qualifiedNote: '3 pediram retorno',
    humanHandoffs: 4,
    handoffsWaiting: 2,
  },
  liveCalls: [
    {
      id: 'call-live-01',
      contactName: 'Ana Martins',
      companyName: 'Construtora Atlas',
      duration: '01:42',
      agentName: 'Comercial IA v1',
      status: 'IN_CALL',
      intent: 'Qualificando',
      handoffStatus: 'NONE',
    },
    {
      id: 'call-live-02',
      contactName: 'Carlos Souza',
      companyName: 'Metal Prime',
      duration: '00:58',
      agentName: 'Comercial IA v1',
      status: 'IN_CALL',
      intent: 'Objeção: Preço',
      handoffStatus: 'NONE',
    },
    {
      id: 'call-live-03',
      contactName: 'Mariana Lima',
      companyName: 'Clínica Vita',
      duration: '02:16',
      agentName: 'Comercial IA v1',
      status: 'WAITING_AGENT',
      intent: 'Pediu Vendedor',
      handoffStatus: 'READY_TO_JOIN',
    },
  ],
  activeCampaign: {
    id: 'camp-01',
    name: 'Prospecção • Indústrias SP',
    totalLeads: 80,
    processedLeads: 42,
    connectedLeads: 17,
    qualifiedLeads: 6,
    costCents: 1842,
  },
  handoffQueue: [
    {
      id: 'handoff-01',
      contactName: 'Mariana Lima',
      sellerName: 'Vendedor Fábio',
      status: 'READY_TO_JOIN',
      note: 'Sinal verde da IA • Vendedor pronto para entrada',
    },
  ],
  recentCalls: [
    {
      id: 'rec-01',
      contactName: 'Roberto Dias',
      campaignName: 'Prospecção • Indústrias SP',
      duration: '03:12',
      outcome: 'QUALIFIED',
      aiSummary: 'Interessado em demonstração; pediu contato amanhã 10h.',
      costCents: 92,
    },
    {
      id: 'rec-02',
      contactName: 'Fernanda Alves',
      campaignName: 'Reativação • Base antiga',
      duration: '01:05',
      outcome: 'UNQUALIFIED',
      aiSummary: 'Já possui fornecedor e não deseja nova avaliação no momento.',
      costCents: 31,
    },
    {
      id: 'rec-03',
      contactName: 'Paulo Mendes',
      campaignName: 'Prospecção • Indústrias SP',
      duration: '02:41',
      outcome: 'CALLBACK',
      aiSummary: 'Solicitou envio de material antes de nova ligação.',
      costCents: 78,
    },
    {
      id: 'rec-04',
      contactName: 'Juliana Costa',
      campaignName: 'Clínicas • Setembro',
      duration: '04:01',
      outcome: 'SCHEDULED',
      aiSummary: 'Reunião marcada; objeção principal foi integração com agenda.',
      costCents: 114,
    },
  ],
};
