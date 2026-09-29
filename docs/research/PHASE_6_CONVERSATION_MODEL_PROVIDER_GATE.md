# Phase 6 — Conversation Model Provider Decision Gate

- **Data**: 2026-09-29
- **Status**: Research Completed / Pending Human Decision
- **Escopo**: Avaliação técnica, contratual e de segurança para implementação de adapter concreto para `ConversationModelPort` (Slice 006E).

---

## 1. Contexto e Pipeline da Plataforma

A plataforma adota um pipeline de voz provider-neutral em cascata:
```
Twilio ConversationRelay
  → Transcrição textual (STT gerenciado pelo provedor de telecom)
  → ConversationOrchestrator / AssistantStreamCoordinator (apps/voice)
  → ConversationModelPort (packages/contracts)
  → Streaming incremental de texto (ModelStreamEvent)
  → Twilio ConversationRelay TTS (sintetizador de voz gerenciado)
```

**Premissa Fundamental**: O modelo de linguagem nesta fase **NÃO** processa nem gera áudio (STT e TTS residem no transporte de telefonia). O modelo atua exclusivamente como motor conversacional textual de streaming de baixa latência em português (pt-BR).

---

## 2. Contratos Internos Vigentes (Source of Truth)

O runtime de voz (`apps/voice`) depende estritamente das seguintes interfaces definidas em `@voice-agent/contracts`:

### 2.1 `ConversationModelPort`
```typescript
export interface ConversationModelPort {
  readonly providerName: string;
  streamTurn(
    input: ConversationModelInput,
  ): Promise<AsyncIterable<ConversationTextChunk | ModelStreamEvent>>;
}
```

### 2.2 Eventos de Streaming (`ModelStreamEvent`)
- `text.delta`: Chunk textual incremental (`turnId`, `generationId`, `textDelta`, `isFinal?`).
- `completed`: Evento terminal de finalização com fala completa acumulada (`fullText`).
- `usage`: Telemetria opcional de consumo (`inputTokens?`, `outputTokens?`).
- `failure`: Evento terminal de falha tipada (`error`, `isRetryable?`).

### 2.3 Semântica Terminal em `processModelStream`
1. `completed`: Encerra imediatamente o loop (`break`).
2. `failure`: Lança `ConversationModelError` imediatamente.
3. `usage`: Evento de telemetria; não altera o transporte de áudio e não ressuscita streams encerrados (`continue`).
4. **Implicação Arquitetural**: Para que o evento `usage` seja processado e registrado em telemetria, o adapter deve emiti-lo **antes** ou concomitantemente ao evento terminal `completed`.

---

## 3. Pesquisa Factual de Provedores Candidatos

### 3.1 OpenAI

- **API Recomendada**: Chat Completions API (`/v1/chat/completions`) com `stream: true`.
  - *Nota*: A Assistants API / Threads API foi rejeitada por impor gerenciamento de estado e threads nos servidores da OpenAI (risco de lock-in e violação de multi-tenancy). A Realtime API (WebRTC) é desnecessária pois o áudio é gerenciado pelo Twilio ConversationRelay.
- **SDK Node/TypeScript Oficial**: `openai` (v4.x+). Suporta Node.js 18+.
- **Streaming & Eventos**: Server-Sent Events (SSE). Emite chunks com `choices[0].delta.content`.
- **Telemetria de Consumo**: Habilitada via `stream_options: { include_usage: true }`. O último chunk do stream (antes de `[DONE]`) contém `usage: { prompt_tokens, completion_tokens, total_tokens }` com `choices: []`.
- **Cancelamento**: Suporte nativo a `AbortSignal` via `{ signal }` nas opções de requisição. Ao disparar `controller.abort()`, o streaming é abortado imediatamente no Node.js.
- **Estruturação de Contexto**:
  - `instructions` -> Mensagem inicial com `role: 'system'`.
  - `history` -> Alternância de `role: 'user'` e `role: 'assistant'`.
  - `currentInput` -> Última mensagem com `role: 'user'`.
- **Modelos Candidatos**: `gpt-4o-mini` (alta velocidade, baixo custo), `gpt-4o` (maior capacidade).
- **Preços Oficiais (por 1M tokens - Setembro 2026)**:
  - `gpt-4o-mini`: **$0.15** entrada / **$0.60** saída (Prompt Caching: **$0.075** entrada).
  - `gpt-4o`: **$2.50** entrada / **$10.00** saída (Prompt Caching: **$1.25** entrada).
- **Privacidade & Retenção de Dados**:
  - Dados enviados via API comercial **não** são utilizados para treinamento de modelos.
  - Retenção padrão de 30 dias para auditoria de abusos/segurança, com deleção posterior. Suporte a Zero Data Retention (ZDR) sob termos empresariais.
- **Fontes Oficiais Consultadas**:
  - [OpenAI API Pricing](https://openai.com/api/pricing/)
  - [OpenAI Streaming & Usage Documentation](https://platform.openai.com/docs/api-reference/chat)
  - [OpenAI Enterprise Privacy](https://openai.com/enterprise-privacy/)
  - [OpenAI Node SDK Repository](https://github.com/openai/openai-node)

---

### 3.2 Anthropic

- **API Recomendada**: Messages API (`/v1/messages`) com `stream: true`.
- **SDK Node/TypeScript Oficial**: `@anthropic-ai/sdk` (v0.36.x+). Suporta Node.js 18+.
- **Streaming & Eventos**: SSE estruturado com ciclo formal de eventos:
  - `message_start`: Metadados da mensagem e `usage.input_tokens`.
  - `content_block_start`: Início do bloco de texto.
  - `content_block_delta`: Chunks textuais incrementais (`delta.text` onde `delta.type === 'text_delta'`).
  - `content_block_stop`: Fim do bloco.
  - `message_delta`: Atualização com `stop_reason` e `usage.output_tokens`.
  - `message_stop`: Finalização do stream.
- **Telemetria de Consumo**: Bifurcada: `input_tokens` chega em `message_start`; `output_tokens` chega em `message_delta`. O adapter acumula ambas as métricas e emite o evento `usage` antes de `message_stop`.
- **Cancelamento**: Suporte nativo a `AbortSignal` via opções `{ signal }` no SDK ou chamada a `.abort()` no stream.
- **Estruturação de Contexto**:
  - `instructions` -> Parâmetro dedicado de nível superior `system: string` (segregação nativa entre instruções de sistema e mensagens de diálogo).
  - `history` e `currentInput` -> Array `messages: [{ role: 'user' | 'assistant', content: string }]`.
- **Modelos Candidatos**: `claude-3-5-haiku` (foco em velocidade e baixo custo), `claude-3-5-sonnet` (alta capacidade analítica).
- **Preços Oficiais (por 1M tokens - Setembro 2026)**:
  - `claude-3-5-haiku`: **$0.80** entrada / **$4.00** saída (Prompt Caching: **$1.00** escrita / **$0.08** leitura).
  - `claude-3-5-sonnet`: **$3.00** entrada / **$15.00** saída.
- **Privacidade & Retenção de Dados**:
  - Conteúdo submetido à API comercial **não** é utilizado para treinamento de modelos da Anthropic.
  - Retenção padrão de 30 dias para detecção de abuso e segurança.
- **Fontes Oficiais Consultadas**:
  - [Anthropic Pricing](https://claude.ai/pricing)
  - [Anthropic Messages API Streaming Reference](https://docs.anthropic.com/en/api/messages-streaming)
  - [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript)
  - [Anthropic Data Privacy Policy](https://support.anthropic.com/en/articles/7996848-how-do-you-use-personal-data-in-model-training)

---

### 3.3 Google (Gemini)

- **API Recomendada**: Gemini API via Google Gen AI SDK.
- **SDK Node/TypeScript Oficial**: `@google/genai` (novo SDK unificado que substitui o legatário `@google/generative-ai`).
- **Streaming & Eventos**: Método `generateContentStream`. Itera sobre chunks de resposta com `chunk.text()` e metadados no objeto `candidates[0]`.
- **Telemetria de Consumo**: Metadados em `chunk.usageMetadata` (`promptTokenCount`, `candidatesTokenCount`, `totalTokenCount`), tipicamente consolidados no chunk final.
- **Cancelamento**: Suporte a cancelamento via `AbortSignal` ou interrupção de consumo assíncrono.
- **Estruturação de Contexto**:
  - `instructions` -> Objeto `systemInstruction: { parts: [{ text: ... }] }`.
  - `history` e `currentInput` -> Array `contents: [{ role: 'user' | 'model', parts: [{ text: ... }] }]` (requer mapeamento de role `'assistant'` para `'model'`).
- **Modelos Candidatos**: `gemini-1.5-flash` / `gemini-2.0-flash` / `gemini-3.8-flash`.
- **Preços Oficiais (por 1M tokens - Setembro 2026)**:
  - `gemini-1.5-flash` (Paid Tier, prompts <= 128k): **$0.075** entrada / **$0.30** saída (Context Caching: **$0.01875**).
  - `gemini-3.8-flash` (Paid Tier): **$0.75** entrada / **$3.75** saída.
  - *Atenção Crítica de Privacidade*: No Free Tier do Google AI Studio, os dados de prompt e geração são registrados e utilizados para treinamento de modelos. Apenas o **Paid Tier** (faturamento ativado no Google Cloud) garante a não-utilização de dados para treinamento.
- **Fontes Oficiais Consultadas**:
  - [Google Gemini API Pricing](https://ai.google.dev/)
  - [Google Gen AI SDK for Node.js (`@google/genai`)](https://ai.google.dev/gemini-api/docs/quickstart?lang=node)
  - [Google Gemini API Terms & Data Governance](https://ai.google.dev/gemini-api/terms)

---

## 4. Matriz Comparativa Factual

| Critério | OpenAI (GPT-4o mini) | Anthropic (Claude 3.5 Haiku) | Google (Gemini 1.5/2.0 Flash) |
| :--- | :--- | :--- | :--- |
| **API Canônica** | Chat Completions (`/v1/chat/completions`) | Messages API (`/v1/messages`) | Gemini API (`models.generateContentStream`) |
| **SDK Atual Recomendado** | `openai` | `@anthropic-ai/sdk` | `@google/genai` |
| **Risco de Depreciação de SDK** | Baixo (v4 madura) | Baixo (v0.36 madura) | Médio (migração recente de `@google/generative-ai` para `@google/genai`) |
| **Complexidade de Mapeamento** | **LOW** | **MEDIUM** (usage bifurcado) | **LOW / MEDIUM** (role `model` em vez de `assistant`) |
| **Suporte Nativo a AbortSignal** | Sim (opção `{ signal }` de primeira classe) | Sim (opção `{ signal }` de primeira classe) | Sim (suporte via options / fetch subjacente) |
| **Emissão de Usage no Stream** | Sim (`stream_options: { include_usage: true }`) | Sim (`message_start` + `message_delta`) | Sim (`chunk.usageMetadata`) |
| **Segregação de System Prompt** | Via mensagem com `role: 'system'` | Via parâmetro nativo `system: string` | Via `systemInstruction` |
| **Preço Entrada / Saída (por 1M tokens)** | $0.15 / $0.60 | $0.80 / $4.00 | $0.075 / $0.30 (1.5 Flash Paid) |
| **Não-Uso de Dados para Treinamento** | Garantido na API comercial | Garantido na API comercial | Garantido **apenas no Paid Tier** |
| **Suporte Textual a pt-BR** | Sim (suportado por treino prévio) | Sim (suportado por treino prévio) | Sim (suportado por treino prévio) |
| **Superioridade Comparativa pt-BR** | `NOT VERIFIED` | `NOT VERIFIED` | `NOT VERIFIED` |
| **Latência Real Medida** | `NOT MEASURED` | `NOT MEASURED` | `NOT MEASURED` |

---

## 5. Modelo de Custo Conversacional (Exemplo Ilustrativo)

> [!IMPORTANT]
> Os cálculos abaixo são **ESTRITAMENTE ILUSTRATIVOS** e baseiam-se em premissas sintéticas de tamanho de diálogo para avaliar a ordem de grandeza. O consumo real depende do design de prompts e do comportamento dos interlocutores.

- **Premissas do Cenário Ilustrativo**:
  - Chamada com 10 turnos conversacionais.
  - Média de 500 tokens de entrada por turno (instruções autoritativas da persona + histórico curto).
  - Média de 50 tokens de saída por turno (respostas orais concisas adequadas a síntese TTS).
  - Total por chamada: 5.000 tokens de entrada e 500 tokens de saída.

- **Custo Aproximado de Tokens por Chamada**:
  - **OpenAI (GPT-4o mini)**:
    - Entrada: `5.000 * ($0.15 / 1.000.000) = $0.00075`
    - Saída: `500 * ($0.60 / 1.000.000) = $0.00030`
    - **Total LLM por chamada**: **$0.00105 (~$0.001)**
  - **Anthropic (Claude 3.5 Haiku)**:
    - Entrada: `5.000 * ($0.80 / 1.000.000) = $0.00400`
    - Saída: `500 * ($4.00 / 1.000.000) = $0.00200`
    - **Total LLM por chamada**: **$0.00600 (~$0.006)**
  - **Google (Gemini 1.5 Flash Paid)**:
    - Entrada: `5.000 * ($0.075 / 1.000.000) = $0.000375`
    - Saída: `500 * ($0.30 / 1.000.000) = $0.000150`
    - **Total LLM por chamada**: **$0.000525 (~$0.0005)**

- **Inferência Operacional**:
  Em todas as alternativas de modelos leves, o custo de inferência do modelo de linguagem é inferior a **$0.01 por chamada típica**, demonstrando que a telefonia (minutos PSTN Twilio) e o sintetizador de voz (TTS) serão os componentes de custo dominantes no runtime.

---

## 6. Mapeamento de Erros para Interfaces Neutras

O adapter concreto em `packages/integrations` deverá traduzir erros proprietários em instâncias de `ConversationModelError` sem vazar payloads brutos de fornecedores:

| Categoria do Erro | OpenAI | Anthropic | Google | Mapeamento Neutro (`ModelFailureEvent`) |
| :--- | :--- | :--- | :--- | :--- |
| **Autenticação / Chave Inválida** | `AuthenticationError` (401) | `AuthenticationError` (401) | `GoogleGenAIError` / 401 | `error: 'Provider authentication failed'`, `isRetryable: false` |
| **Rate Limit / Quota Excedida** | `RateLimitError` (429) | `RateLimitError` (429) | 429 Resource Exhausted | `error: 'Provider rate limit exceeded'`, `isRetryable: true` |
| **Timeout de Rede** | `APIConnectionTimeoutError` | `APIConnectionTimeoutError` | DeadlineExceeded | `error: 'Provider request timed out'`, `isRetryable: true` |
| **Indisponibilidade do Modelo** | `InternalServerError` (500/503) | `InternalServerError` (500/503) | Unavailable (503) | `error: 'Provider unavailable'`, `isRetryable: true` |
| **Violação de Filtro de Conteúdo** | `BadRequestError` (content_filter) | `InvalidRequestError` | BlockedBySafety | `error: 'Content filter triggered'`, `isRetryable: false` |
| **Cancelamento por Barge-In** | `AbortError` | `AbortError` | Cancelled / AbortError | Ignorado / Descarte de stream pelo coordenador |

---

## 7. Trade-off Arquitetural: SDK Oficial vs Direct HTTP/Fetch

1. **SDK Oficial (`openai`, `@anthropic-ai/sdk`, `@google/genai`)**:
   - **Vantagens**: Tipagem robusta fornecida pelo mantenedor, suporte integrado a AbortSignal, parsing automático de SSE com controle de backpressure, reconexão transparente em falhas transitórias.
   - **Desvantagens**: Adição de dependência externa em `packages/integrations`, necessidade de homologação de scripts de build se houver dependências nativas (embora SDKs modernos usem TypeScript puro e `fetch` nativo).
2. **Direct HTTP (`fetch` nativo do Node.js + parser de SSE)**:
   - **Vantagens**: Zero dependências npm adicionais no monorepo, total controle de parsing e timeouts HTTP.
   - **Desvantagens**: Requer implementar manualmente máquina de parsing de Server-Sent Events (`event:`, `data:`) e serialização de streams de chunks, aumentando a superfície de testes internos.
3. **Conclusão Arquitetural**:
   Como a porta `ConversationModelPort` isola 100% o core (`apps/voice`), a escolha entre SDK e fetch afeta exclusivamente o pacote `packages/integrations`. Ambas as abordagens são plenamente viáveis e compatíveis com a arquitetura.

---

## 8. Segurança e Governança de Dados

1. **Segregação de Credenciais**:
   - Chaves de API (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.) residirão estritamente em variáveis de ambiente server-side no processo de voz.
   - Jamais serão expostas ao client, enviadas via WebSocket ou impressas em logs estruturados.
2. **Quarentena de Metadados de Tenant**:
   - O payload enviado ao modelo de linguagem deve conter **exclusivamente**: instruções autoritativas da persona, regras de conduta, histórico limitado da chamada e fala do interlocutor.
   - É expressamente proibido enviar ao provedor externo: `organizationId`, nomes reais da organização, números de telefone, emails, identificadores de sessão interna (`callId`, `bootstrapId`), cookies ou dados de faturamento.
3. **Mitigação de Injeção de Prompt**:
   - A fala do usuário é sempre delimitada e classificada como dado de conversa não-confiável (`trustLevel: 'UNTRUSTED_CALLER_INPUT'`).
   - A saída do modelo não tem permissão para disparar transições na máquina de estados de chamada nem executar mutações de autorização.

---

## 9. Recomendação Técnica para Primeiro Spike

### Classificação Normativa:
- **Status do Provedor Primário Definitivo**: **PENDING HUMAN DECISION** em `docs/DECISIONS_LOG.md`.
- **Candidato Recomendado para Primeiro Spike de Validação**: **OpenAI (GPT-4o mini)**.

### Justificativa Técnica para a Escolha do Spike:
1. **Menor Complexidade de Mapeamento**: O formato de SSE com `stream_options: { include_usage: true }` gera uma sequência linear de deltas de texto seguida pelo objeto final de contagem de tokens, adaptando-se com complexidade mínima ao nosso discriminador `ModelStreamEvent`.
2. **Eficiência de Custos em Desenvolvimento**: Preço extremamente competitivo ($0.15 / $0.60 por 1M tokens), ideal para execuções de testes funcionais ponta a ponta sem onerar orçamentos.
3. **Maturidade e Suporte a AbortSignal**: O SDK oficial `openai` e o endpoint REST possuem integração madura com `AbortController` nativo do Node.js, viabilizando o cancelamento imediato de streaming quando o interlocutor interromper o assistente (barge-in).
4. **Candidato Alternativo Imediato**: **Anthropic (Claude 3.5 Haiku)** permanece como alternativa robusta de arquitetura equivalente, com excelente separação nativa do parâmetro `system`, requerendo apenas acúmulo de usage em dois eventos distintos (`message_start` e `message_delta`).

---

## 10. Unknowns e Próximos Passos

1. **Latência de Rede Real (`LATENCY_REAL = NOT MEASURED`)**: O tempo até o primeiro token (TTFT) contra servidores no Brasil vs Estados Unidos só poderá ser mensurado em ambiente com tráfego real.
2. **Comportamento em Ligações Telefônicas em Tempo Real**: Permanece classificado como `PROVIDER-UNVERIFIED` até a execução do spike prático com homologação de carrier telefônico.
3. **Decisão Humana Pendente**: A seleção final e contratação de chave comercial depende de decisão explícita do operador.
