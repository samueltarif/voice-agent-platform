# Arquitetura do Motor de Voz em Tempo Real (VOICE_ARCHITECTURE.md)

Este documento especifica o funcionamento técnico do serviço de voz (`apps/voice`), detalhando o pipeline de áudio bidirecional de baixa latência, o tratamento de interrupções (*barge-in*), a orquestração de diálogos e o acionamento determinístico de ferramentas (*tool calling*).

> **Revisado em**: 21 de Setembro de 2026 (PROMPT-001B)

---

## 1. Princípios Operacionais da Conversação de Voz

1. **Baixa Latência como Objetivo de Engenharia**: O objetivo de engenharia inicial é minimizar ao máximo a latência ponta a ponta (tempo entre o final da fala do usuário e o início da resposta do agente). A meta de referência inicial é `<800ms`, porém esse valor ainda **não é um SLA definitivo aprovado** — deve ser validado experimentalmente com dados reais de produção. Consulte `docs/OBSERVABILITY.md` para a estratégia de medição (p50, p95, p99, time-to-first-audio, etc.).
2. **Interrupção Humana Natural (*Barge-In*)**: Quando o interlocutor humano começar a falar enquanto a IA estiver reproduzindo áudio, o sistema deve interromper imediatamente a transmissão do áudio pendente, descartar a fila de saída e registrar o evento de cancelamento no contexto.
3. **Memória Conversacional e Estado**: O contexto da chamada deve ser mantido de forma leve durante a sessão em memória/cache rápido, permitindo referências a tópicos abordados anteriormente no diálogo.
4. **Execução Determinística de Ferramentas**: Durante a conversa, o modelo pode solicitar a execução de ferramentas. Regras de negócio, preços, checagens de disponibilidade e gravações são executadas por código determinístico, retornando o resultado ao modelo sem que ele invente dados.

---

## 2. Pipeline de Áudio Bidirecional em Tempo Real

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Canal Telefônico                              │
│                      (PSTN / SIP / WebSockets)                         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Stream de Áudio (ex: G.711 / PCM 8k/16k)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        apps/voice (Voice Engine)                       │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ 1. Ingestão & VAD (Voice Activity Detection)                   │   │
│   │    - Detecta início da fala do usuário                         │   │
│   │    - Dispara sinal de cancelamento imediato de TTS (Barge-in)  │   │
│   │    - Detecta final de turno (parâmetros configuráveis)         │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   ▼                                    │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ 2. Orquestração Conversacional (via RealtimeAIProvider)        │   │
│   │    - Modelo multimodal direto (Áudio -> Áudio) OU              │   │
│   │    - Pipeline em cascata (STT -> LLM Streaming -> TTS)         │   │
│   │    - Injeção de System Prompt, persona e restrições de tenant  │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   ▼                                    │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ 3. Execução Determinística de Ferramentas (Tool Calling)       │   │
│   │    - Validação estrita de parâmetros solicitados pela IA       │   │
│   │    - Execução via Domain Services (ex: consultar produtos)     │   │
│   │    - Retorno imediato do resultado ao contexto do diálogo      │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   ▼                                    │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ 4. Transmissão do Áudio de Resposta (Streaming TTS)            │   │
│   │    - Envio de chunks contínuos de áudio para a telefonia       │   │
│   │    - Interrupção instantânea se VAD sinalizar fala humana      │   │
│   └────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Gestão de Interrupção Humana (*Barge-In*)

O algoritmo de barge-in opera segundo as seguintes regras de estado:

1. **Estado: Falando (Agent Speaking)**: O agente está transmitindo áudio de síntese para a chamada.
2. **Gatilho de Interrupção**: O VAD identifica atividade vocal contínua do interlocutor acima do limiar configurado (descartando ruídos breves de fundo, tossidas ou estalos). O limiar de duração mínima de fala para acionamento de barge-in é **configurável por provider, idioma, cenário e ambiente acústico** — nenhum valor é fixado como regra arquitetural permanente.
3. **Ações Imediatas de Cancelamento**:
   - Enviar comando de *clear audio buffer* para o provedor de telefonia imediatamente;
   - Cancelar a geração dos tokens/áudios restantes no provedor de IA (`RealtimeAIProvider`);
   - Atualizar a transcrição em memória marcando o ponto exato da fala onde ocorreu a interrupção;
   - Transicionar estado para *Ouvindo (Agent Listening)*.

---

## 4. Orquestração de Ferramentas (Tool Calling Determinístico)

Durante o diálogo, o agente de voz pode ter acesso a um conjunto de ferramentas declaradas:

```
Conversa ──► IA emite intenção: `checkProductPrice(sku: "PRD-102")`
                 │
                 ▼
         apps/voice intercepta
                 │
                 ▼
         Valida `organizationId` e parâmetros
                 │
                 ▼
         Executa `ProductPricingService.getPrice("PRD-102")` (código determinístico)
                 │
                 ▼
         Retorna: `{ price: 149.90, currency: "BRL", stock: 12 }`
                 │
                 ▼
         IA recebe dado real e sintetiza resposta natural ao cliente:
         "O produto está disponível por R$ 149,90 e temos 12 unidades."
```

- A IA **nunca** inventa o preço ou confirma transações sem invocar e receber o retorno da ferramenta determinística.
- Todas as execuções de ferramentas publicam eventos internos: `call.tool_started` e `call.tool_completed`.

---

## 4B. VAD — Princípio de Configurabilidade

Os parâmetros de detecção de atividade de voz (VAD) e detecção de fim de turno devem ser:

- **Configuráveis**: Por provider de IA, idioma do agente, cenário de uso e ambiente acústico.
- **Observáveis**: Métricas de VAD exportadas para o sistema de observabilidade (ex.: `voice.vad.silence_detection_ms`).
- **Testáveis**: Valores facilmente alteráveis em testes automatizados sem recompilação.
- **Calibráveis**: Ajustáveis por operador humano com base em dados reais de produção.

Exemplos de parâmetros configuráveis (valores são exemplos ilustrativos, não regras fixas):
- Duração mínima de fala para confirmar atividade vocal.
- Duração de silêncio para detectar fim de turno.
- Sensibilidade a ruídos de fundo.
- Latência de cancelamento de barge-in.

> Nenhum valor numérico de VAD deve ser tratado como regra arquitetural imutável. Os valores são resultado de calibração experimental.

---

## 5. Status de Fornecedores de Voz

- **Abordagem Técnica**:
  - Modelo A: **Pipeline Integrado Realtime Multimodal** (ex.: OpenAI Realtime API).
  - Modelo B: **Pipeline Modular em Cascata** (Deepgram Nova-2 STT + LLM rápido streaming + ElevenLabs / Cartesia TTS).
- **Decisão Definitiva**: **Status: Pending Decision**.
  A arquitetura isola essa escolha no pacote `packages/integrations`, permitindo suportar qualquer uma das abordagens via `RealtimeAIProvider`.

---

## 6. Monitoramento em Tempo Real, Gravações e Transbordo Humano

O motor de voz integra-se nativamente aos subsistemas de acompanhamento de chamadas ativas e transferência de controle:
- **Live Call Telemetry**: Transmissão contínua de transcrições parciais, eventos e métricas de turno;
- **Call Recording**: Gravação da sessão para object storage com URLs pré-assinadas e isolamento por tenant;
- **Human Handoff Protocol**: Transbordo assistido para operadores humanos com máquina de estados determinística (`NONE` → `REQUESTED` → `SELLER_NOTIFIED` → `SELLER_READY` → `AI_PREPARING` → `READY_TO_JOIN` → `HUMAN_CONNECTED` → `AI_DETACHED`).

> Para a especificação completa de fluxos, estados, modo listen-only e eventos canônicos de gravação e handoff, consulte [docs/LIVE_CALLS_AND_HANDOFF.md](file:///d:/voice-agent-platform/docs/LIVE_CALLS_AND_HANDOFF.md).

