# Estratégia de Observabilidade e Telemetria (OBSERVABILITY.md)

Este documento define os padrões de logs estruturados, rastreamento distribuído, métricas e auditoria da plataforma.

---

## 1. Princípios de Observabilidade

1. **Zero `console.log` em Produção**:
   - É expressamente vedado utilizar `console.log` ou impressões de texto livre como mecanismo de monitoramento em produção.
   - Todos os logs devem ser emitidos pelo módulo padronizado `packages/logger` em formato JSON estruturado.
2. **Contexto e Rastreabilidade Obrigatórios**:
   - Nenhuma linha de log relevante pode existir de forma órfã. Todo registro deve carregar identificadores contextuais que permitam reconstruir a árvore de execução completa.
3. **Métricas de Tempo Real**:
   - Em operações de voz, a latência é a métrica mais crítica de experiência do usuário. Todos os estágios do pipeline de áudio devem ser cronometrados e exportados como métricas quantitativas.

---

## 2. Identificadores Canônicos de Rastreamento

Toda requisição, chamada telefônica ou processamento em background deve propagar os seguintes identificadores no contexto de execução:

| Identificador | Escopo | Descrição |
| :--- | :--- | :--- |
| **`correlationId`** | Global / Distribuído | Identificador único que acompanha um fluxo desde a requisição web original até webhooks e jobs assíncronos decorrentes. |
| **`requestId`** | HTTP / API | Identificador de uma requisição HTTP específica atendida por `apps/api`. |
| **`callId`** | Sessão de Voz | Identificador da chamada telefônica gerenciada por `apps/voice`. |
| **`jobId`** | Background Worker | Identificador da tarefa assíncrona executada por `apps/worker`. |
| **`campaignId`** | Campanha Outbound | Identificador da campanha de discagem ativa à qual a chamada pertence. |
| **`organizationId`** | Multi-Tenancy | Identificador da organização proprietária do recurso. |
| **`agentId`** | Agente de IA | Identificador da entidade de agente de voz configurado. |

---

## 3. Estrutura Canônica de Log Estruturado

Os logs emitidos pelo `packages/logger` seguem este padrão JSON:

```json
{
  "timestamp": "2026-09-21T13:00:00.125Z",
  "level": "info",
  "message": "Voice session started successfully",
  "context": {
    "service": "voice-engine",
    "environment": "production",
    "correlationId": "req_01J8XYZ888BBB444555666777",
    "callId": "call_01J8CALL555666777888999000",
    "organizationId": "org_01J8ABC999AAA111222333444",
    "agentId": "agt_01J8AGENT11122233344455566"
  },
  "metrics": {
    "connectionLatencyMs": 142
  }
}
```

Níveis de Log permitidos: `trace`, `debug`, `info`, `warn`, `error`, `fatal`.

---

## 4. Métricas Críticas de Latência de Voz

O objetivo de engenharia inicial é minimizar a latência ponta a ponta. A meta de referência inicial é `<800ms`, porém esse valor **não é um SLA definitivo aprovado** — deve ser calibrado experimentalmente com dados reais.

O sistema de métricas deve permitir medir pelo menos:

```
Interlocutor fala ──► [VAD detecta silêncio] ──► [STT / Transcrição] ──► [LLM First Token] ──► [TTS First Chunk] ──► Interlocutor ouve
                       └───────────── Latência Total de Turno (Turn Latency) ───────────────────────────┘
```

### 4.1. Métricas do Pipeline de Voz
1. **`voice.vad.silence_detection_ms`**: Tempo para o detector de atividade de voz identificar que o humano parou de falar.
2. **`voice.stt.latency_ms`**: Tempo para converter áudio em texto (se aplicável ao provedor).
3. **`voice.llm.time_to_first_token_ms`**: Tempo até o modelo de linguagem emitir a primeira palavra da resposta.
4. **`voice.tts.time_to_first_audio_ms`**: Tempo para a síntese de voz gerar o primeiro bloco de áudio reproduzível.
5. **`voice.barge_in.cancellation_latency_ms`**: Tempo entre o início da fala do usuário e o corte do áudio da IA (*barge-in interruption latency*).
6. **`voice.turn.roundtrip_total_ms`**: Tempo total entre o término da fala do usuário e o início da reprodução da voz da IA no telefone.
7. **`voice.tool.execution_latency_ms`**: Tempo de execução de tools determinísticas invocadas durante a chamada.

### 4.2. Distribuição Estatística das Métricas
Todas as métricas de latência devem ser expostas no mínimo com os seguintes percentis:
- **p50**: Mediana — experiência do usuário típico.
- **p95**: Latência para 95% dos eventos — detecção de degradação significativa.
- **p99**: Latência para 99% dos eventos — detecção de casos extremos (*tail latency*).

SLAs finais serão definidos após análise experimental em produção real.

---

## 5. Auditoria de Ações Críticas

Eventos de auditoria imutáveis devem ser gravados para:
- Modificação de instruções/prompts e parâmetros de agentes;
- Execução de ferramentas financeiras ou de alteração de dados sensíveis;
- Exportação de bases de contatos ou gravações em lote;
- Alterações em configurações de autenticação e papéis de usuários.
