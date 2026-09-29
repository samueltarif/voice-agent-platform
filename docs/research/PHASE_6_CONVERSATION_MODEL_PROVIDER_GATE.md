# Phase 6 — Conversation Model Provider Decision Gate

- **Data de Referência**: 2026-09-29
- **Status**: Research Hardened / Pending Human Decision
- **Escopo**: Avaliação técnica, contratual e de segurança para implementação de adapter concreto para `ConversationModelPort` (Slice 006E).
- **Branch**: `docs/006e-model-provider-decision-gate`
- **Pull Request**: #28 (OPEN / NOT MERGED)

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
4. **Invariante de Contrato**: O adapter deve garantir que o evento `usage` seja emitido **antes** ou concomitantemente ao evento terminal `completed`.

---

## 3. Auditoria de Fontes Oficiais e Evidências (Freshness Audit)

| Fornecedor | Documento / Tópico | URL Canônica Oficial | Data Acesso | Claim Suportado |
| :--- | :--- | :--- | :--- | :--- |
| **OpenAI** | Pricing Oficial | `https://openai.com/api/pricing/` | 2026-09-29 | `YES` |
| **OpenAI** | Chat API Reference | `https://platform.openai.com/docs/api-reference/chat` | 2026-09-29 | `YES` |
| **OpenAI** | Responses API Migration | `https://platform.openai.com/docs/guides/migrate-to-responses` | 2026-09-29 | `YES` |
| **OpenAI** | Enterprise Privacy | `https://openai.com/enterprise-privacy/` | 2026-09-29 | `YES` |
| **OpenAI** | Models Overview | `https://platform.openai.com/docs/models` | 2026-09-29 | `YES` |
| **Anthropic** | Commercial API Pricing | `https://docs.anthropic.com/en/docs/about-claude/models` | 2026-09-29 | `YES` |
| **Anthropic** | Models Overview & Lifecycle | `https://docs.anthropic.com/en/docs/about-claude/models` | 2026-09-29 | `YES` |
| **Anthropic** | Messages Streaming API | `https://docs.anthropic.com/en/api/messages-streaming` | 2026-09-29 | `YES` |
| **Anthropic** | Data Privacy & Trust | `https://support.anthropic.com/en/articles/7996848-how-do-you-use-personal-data-in-model-training` | 2026-09-29 | `YES` |
| **Google** | Gemini API Pricing | `https://ai.google.dev/pricing` | 2026-09-29 | `YES` |
| **Google** | Gemini API Models & Lifecycle | `https://ai.google.dev/gemini-api/docs/models/gemini` | 2026-09-29 | `YES` |
| **Google** | Google Gen AI Node SDK | `https://ai.google.dev/gemini-api/docs/quickstart?lang=node` | 2026-09-29 | `YES` |
| **Google** | Gemini API Terms of Service | `https://ai.google.dev/gemini-api/terms` | 2026-09-29 | `YES` |

---

## 4. Avaliação Técnica Detalhada por Fornecedor

### 4.1 OpenAI

- **APIs de Geração Textual**:
  - `OPENAI_RECOMMENDED_API_FOR_NEW_TEXT_APPS`: **Responses API** (`/v1/responses`) é a interface recomendada pela OpenAI para novas aplicações e agentes.
  - `OPENAI_LEGACY_OR_SUPPORTED_APIS`: **Chat Completions API** (`/v1/chat/completions`) permanece totalmente suportada como superfície padrão para geração textual sem estado.
  - `OPENAI_DEPRECATED_APIS`: **Assistants API** foi descontinuada/retirada em agosto de 2026. Realtime API (WebRTC) permanece fora do escopo do pipeline textual.
- **Decisão Técnica para o Spike Inicial (Responses vs Chat Completions)**:
  - `SPIKE_SURFACE`: Chat Completions API (`/v1/chat/completions`).
  - `WHY_CHAT_COMPLETIONS_FOR_SPIKE?`: O Chat Completions API possui a menor superfície de complexidade técnica para validar a porta neutra `ConversationModelPort`. O formato de Server-Sent Events (SSE) com chunks lineares de texto e contagem de tokens em `stream_options` permite validar o runtime local com esforço mínimo de mapeamento.
  - `PRIMARY_LONG_TERM_API`: `NOT DECIDED`.
  - `MIGRATION_RISK`: Baixo. Como o core de voz (`apps/voice`) é 100% isolado por `ConversationModelPort`, caso a Responses API seja selecionada para o longo prazo, a adaptação ficará estritamente circunscrita ao adapter dentro de `packages/integrations`, sem impacto nas regras de sessão, máquina de estados ou histórico de chamadas.
- **SDK Node/TypeScript Oficial**: Pacote `openai` (Node.js 18+). Fixação de versão numérica formal diferida para o slice de implementação.
- **Modelos Candidatos**:
  - `gpt-4o-mini`: Modelo maduro/suportado, custo reduzido (`PROVIDER POSITIONING`: posicionado pelo provedor para alta velocidade e eficiência; latência real `NOT MEASURED`).
  - Modelos de nova geração: Famílias GPT-5 e o3/o4-mini (modelos de raciocínio).
- **Preços Oficiais Verificados em 2026-09-29 (por 1M tokens)**:
  - `gpt-4o-mini`: **$0.15** entrada / **$0.60** saída (Prompt Caching: **$0.075** entrada).
  - `gpt-4o` (referência): **$2.50** entrada / **$10.00** saída (Prompt Caching: **$1.25** entrada).
- **Streaming & Telemetria**: Server-Sent Events (SSE). O parâmetro `stream_options: { include_usage: true }` fornece a contagem de tokens no último chunk antes de `[DONE]`. O adapter deve registrar a telemetria antes de disparar o encerramento terminal.
- **Cancelamento**: O SDK e o endpoint expõem cancelamento compatível com `AbortSignal` via `{ signal }`. O tempo de cancelamento no lado do servidor permanece categorizado como `PROVIDER-UNVERIFIED`.
- **Privacidade e Retenção de Dados (Termos Oficiais acessados em 2026-09-29)**:
  - De acordo com a política de privacidade da OpenAI, dados enviados via API comercial **não** são utilizados para treinamento de modelos por padrão.
  - Retenção padrão de 30 dias para monitoramento de segurança/abuso.
  - Zero Data Retention (ZDR) disponível sob contrato empresarial para endpoints elegíveis.
  - Residência de dados padrão nos EUA, com opções de residência na UE para contas corporativas.

---

### 4.2 Anthropic

- **API Canônica**: Messages API (`/v1/messages`) com `stream: true`.
- **SDK Node/TypeScript Oficial**: Pacote `@anthropic-ai/sdk` (Node.js 18+). Fixação de versão numérica diferida para o slice de implementação.
- **Modelos Candidatos**:
  - `claude-haiku-4-5-20251001` (`claude-haiku-4-5`): Modelo ativo recomendado (`PROVIDER POSITIONING`: posicionado pelo provedor para velocidade e custo reduzido; latência real `NOT MEASURED`; janela de 200k tokens).
  - `claude-sonnet-5-5` (`claude-sonnet-5-5`): Modelo ativo equilibrado para tarefas analíticas (janela de 1M tokens).
  - *Modelos Descontinuados / Aposentados*: `claude-3-5-sonnet-20241022` e `claude-3-5-haiku-20241022` foram aposentados/substituídos na documentação oficial.
- **Preços Oficiais da API Verificados em 2026-09-29 (por 1M tokens)**:
  - `claude-haiku-4-5`: **$1.00** entrada / **$5.00** saída.
  - `claude-sonnet-5-5` (referência): **$3.00** entrada / **$15.00** saída.
  - *Fonte Canônica*: Documentação da plataforma Claude API (`docs.anthropic.com`), não a página de assinatura de consumidor (`claude.ai/pricing`).
- **Streaming & Telemetria**: Ciclo SSE estruturado (`message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop`). A telemetria de consumo é dividida: `input_tokens` em `message_start` e `output_tokens` em `message_delta`. O adapter deve agregar ambos antes de emitir `usage` e `completed`.
- **Cancelamento**: O SDK expõe cancelamento compatível com `AbortSignal` via opções `{ signal }` ou método `.abort()`. O tempo de cancelamento no servidor permanece `PROVIDER-UNVERIFIED`.
- **Privacidade e Retenção de Dados (Termos Oficiais acessados em 2026-09-29)**:
  - De acordo com as políticas da Anthropic, dados enviados via API comercial **não** são utilizados para treinamento de modelos por padrão.
  - Retenção padrão de 30 dias para auditoria de segurança e detecção de abusos. Interações com violação detectada podem ser retidas por até 2 anos; classificadores de abuso por até 7 anos.
  - Zero Data Retention (ZDR) disponível sob contrato empresarial customizado.

---

### 4.3 Google (Gemini)

- **API Canônica**: Gemini API via Google Gen AI SDK.
  - *Diferenciação de Plataforma*: A **Gemini Developer API** (Google AI Studio) e a **Vertex AI** possuem perfis contratuais e de compliance distintos. A Vertex AI opera sob os termos de nuvem corporativa do Google Cloud Platform (GCP).
- **SDK Node/TypeScript Oficial**: Pacote `@google/genai` (SDK unificado atual). O pacote legatário `@google/generative-ai` foi descontinuado para novos projetos. Fixação de versão numérica diferida para o slice de implementação.
- **Modelos Candidatos**:
  - `gemini-3.8-flash`: Modelo de produção atual recomendado na documentação oficial (`PROVIDER POSITIONING`: modelo de trabalho do provedor; latência real `NOT MEASURED`).
  - `gemini-3.5-flash-lite`: Modelo compacto de menor custo.
  - *Status de Modelos Anteriores*: `gemini-2.0-flash` foi descontinuado/desligado em 1º de junho de 2026. A série `gemini-1.5` foi superada para novos desenvolvimentos.
- **Preços Oficiais da API Verificados em 2026-09-29 (por 1M tokens)**:
  - `gemini-3.8-flash` (Paid Tier): **$0.75** entrada / **$3.75** saída (Context Caching: **$0.075**).
  - *Fonte Canônica*: `https://ai.google.dev/pricing`.
- **Streaming & Telemetria**: Método `models.generateContentStream`. Chunks entregam texto via `.text()`. Metadados em `chunk.usageMetadata` (`promptTokenCount`, `candidatesTokenCount`) consolidados ao final da iteração.
- **Cancelamento**: O SDK/API expõe cancelamento compatível com `AbortSignal`. O tempo de encerramento no servidor permanece `PROVIDER-UNVERIFIED`.
- **Privacidade e Governança de Dados (Termos Oficiais acessados em 2026-09-29)**:
  - **Unpaid Services (Cota Gratuita / AI Studio sem faturamento ativo)**: O Google utiliza os dados de entrada e saída para desenvolver e aprimorar produtos e tecnologias de aprendizado de máquina. **Revisores humanos podem ler e anotar os dados**. Não é permitido enviar dados confidenciais ou PII.
  - **Paid Services (Projeto Google Cloud com faturamento ativo)**: O Google **NÃO** utiliza prompts ou respostas para treinar seus modelos de inteligência artificial.
  - *Exceção Geográfica*: No EEE, Suíça e Reino Unido, as proteções de não-treinamento aplicam-se também à cota gratuita.

---

## 5. Matriz Comparativa Factual

| Dimensão Técnica | OpenAI (Chat / Responses) | Anthropic (Messages API) | Google (Gemini API) |
| :--- | :--- | :--- | :--- |
| **API Canônica Atual** | Responses API (novo) / Chat Completions (suportada) | Messages API | Gemini API (`generateContentStream`) |
| **Modelo Compacto Vigente** | `gpt-4o-mini` (maduro/transição) | `claude-haiku-4-5-20251001` | `gemini-3.8-flash` / `gemini-3.5-flash-lite` |
| **SDK Node Oficial** | `openai` | `@anthropic-ai/sdk` | `@google/genai` |
| **Complexidade de Mapeamento** | **LOW** (stream linear) | **MEDIUM** (usage bifurcado) | **LOW / MEDIUM** (role `model`) |
| **Exposição de AbortSignal** | Sim (`{ signal }`) | Sim (`{ signal }` ou `.abort()`) | Sim (`{ signal }`) |
| **Emissão de Usage no Stream** | Final do stream (`stream_options`) | Dividido (`message_start` + `message_delta`) | Metadados no chunk final (`usageMetadata`) |
| **Preço de Entrada (1M tokens)** | $0.15 (`gpt-4o-mini`) | $1.00 (`claude-haiku-4-5`) | $0.75 (`gemini-3.8-flash` Paid) |
| **Preço de Saída (1M tokens)** | $0.60 (`gpt-4o-mini`) | $5.00 (`claude-haiku-4-5`) | $3.75 (`gemini-3.8-flash` Paid) |
| **Garantia de Não-Treinamento** | De acordo com termos comerciais da API | De acordo com termos comerciais da API | De acordo com termos de **Paid Services** |
| **Geração Textual em pt-BR** | `SUPPORTED BY PROVIDER CLAIM` | `SUPPORTED BY PROVIDER CLAIM` | `SUPPORTED BY PROVIDER CLAIM` |
| **Qualidade Comparativa pt-BR** | `NOT VERIFIED` | `NOT VERIFIED` | `NOT VERIFIED` |
| **Qualidade em Vendas por Voz pt-BR** | `NOT VERIFIED` | `NOT VERIFIED` | `NOT VERIFIED` |
| **Latência Real Medida (TTFT)** | `NOT MEASURED` | `NOT MEASURED` | `NOT MEASURED` |

---

## 6. Calibração de Afirmações Arquiteturais e de Governança

### 6.1 Geração de Texto em Português Brasileiro (pt-BR)
- `PT-BR TEXT GENERATION`: `SUPPORTED BY PROVIDER CLAIM` nos três fornecedores com base em capacidades multilíngues gerais.
- `COMPARATIVE PT-BR QUALITY`: `NOT VERIFIED`. Nenhum provedor publica benchmark oficial comparativo para fluência conversacional em língua portuguesa.
- `TELEPHONE-SALES PT-BR QUALITY`: `NOT VERIFIED`. O desempenho em diálogos de vendas por voz depende de validação prática futura com tráfego telefônico real.

### 6.2 Cancelamento de Requisição e Barge-In
- A biblioteca ou endpoint de cada provedor expõe interface de cancelamento compatível com `AbortSignal`.
- O tempo de interrupção no lado do servidor permanece categorizado como `PROVIDER-UNVERIFIED`.
- A contenção determinística contra emissão de fala obsoleta (*stale output*) é garantida exclusivamente no runtime pelo método `isGenerationActive(callId, generationId)` em `apps/voice/src/process-model-stream.ts`, descartando chunks tardios independentemente do tempo de resposta da rede do provedor.

### 6.3 Resiliência de Transporte e Reconexão
- A reconexão automática não é garantida por padrão para requisições de streaming de texto. Em aplicações de voz em tempo real, retries cegos podem introduzir latência adicional ou saídas duplicadas; portanto, políticas de retry permanecem como `DEFERRED`.

### 6.4 Gestão de Estado e Autoridade do Runtime
- O projeto prefere adapters **request-scoped e sem estado** (*stateless*) para preservar a autoridade do runtime interno e mitigar lock-in com fornecedores.
- O gerenciamento de estado remoto por parte do provedor (como no caso da Assistants API ou threads gerenciadas externamente) exigiria modelos adicionais de autorização, vinculação de tenant, retenção e ciclo de vida, sendo desnecessário no slice atual (princípio YAGNI).

---

## 7. Análise de Custos Operacionais (Cenário Ilustrativo)

> [!IMPORTANT]
> O cálculo abaixo é **ESTRITAMENTE ILUSTRATIVO**. O consumo real varia conforme o desenho dos prompts de sistema e o comportamento do interlocutor. A dominância de custos de telefonia sobre custos de IA é uma **INFERÊNCIA TÉCNICA**, não um fato universal, dependendo da rota telefônica, duração da chamada e provedor de TTS selecionado.

- **Premissas do Exemplo Ilustrativo**:
  - 1 chamada com 10 turnos conversacionais.
  - Média de 500 tokens de entrada por turno (persona autoritativa + histórico recente).
  - Média de 50 tokens de saída por turno (respostas orais concisas para TTS).
  - Total por chamada: 5.000 tokens de entrada e 500 tokens de saída.

- **Custo Aproximado de Inferência por Chamada**:
  - **OpenAI (GPT-4o mini)**:
    - Entrada: `5.000 * ($0.15 / 1.000.000) = $0.00075`
    - Saída: `500 * ($0.60 / 1.000.000) = $0.00030`
    - **Total LLM**: **$0.00105 (~$0.001 / chamada)**
  - **Anthropic (Claude Haiku 4.5)**:
    - Entrada: `5.000 * ($1.00 / 1.000.000) = $0.00500`
    - Saída: `500 * ($5.00 / 1.000.000) = $0.00250`
    - **Total LLM**: **$0.00750 (~$0.0075 / chamada)**
  - **Google (Gemini 3.8 Flash Paid)**:
    - Entrada: `5.000 * ($0.75 / 1.000.000) = $0.00375`
    - Saída: `500 * ($3.75 / 1.000.000) = $0.001875`
    - **Total LLM**: **$0.005625 (~$0.0056 / chamada)**

---

## 8. Mapeamento de Falhas e Segurança de Retry

A tabela abaixo separa estritamente a **Categoria de Transporte/Provedor** da **Decisão de Retry em Runtime**:

| Categoria HTTP / Protocolo | Significado Operacional | Classificação Neutra (`ModelFailureEvent`) | Potencial de Retry do Provedor |
| :--- | :--- | :--- | :--- |
| **401 / 403** | Falha de autenticação ou chave de API inválida | `error: 'Provider authentication failed'` | `NON_RETRYABLE` |
| **400 / Policy / Safety** | Requisição inválida ou bloqueio por filtro de conteúdo | `error: 'Provider policy or validation failure'` | `NON_RETRYABLE` |
| **429** | Excesso de taxa de requisições ou cota esgotada | `error: 'Provider rate limit exceeded'` | `POTENTIALLY_RETRYABLE` |
| **Timeout / Network Error** | Queda de conexão ou estouro do prazo limite | `error: 'Provider request timed out'` | `POTENTIALLY_RETRYABLE` |
| **500 / 502 / 503 / 504** | Erro interno ou indisponibilidade temporária | `error: 'Provider unavailable'` | `POTENTIALLY_RETRYABLE` |
| **AbortError** | Cancelamento local disparado por barge-in | Descarte interno de stream / sem erro | `NON_RETRYABLE` (Cancelamento) |

### Regras Arquiteturais Obrigatórias para Retry em Voz Realtime:
1. **Regra de Saída Parcial**:
   - Se **zero** `text.delta` foi aceito/falado pelo sintetizador: uma nova tentativa (*retry*) pode ser tecnicamente avaliada no futuro se a categoria do erro for `POTENTIALLY_RETRYABLE`.
   - Se **algum** `text.delta` já foi aceito ou reproduzido na chamada telefônica: um retry automático é **estritamente proibido** no runtime, pois duplicaria a fala audível para o usuário, gerando alucinações e confusão conversacional.
2. **Cancelamento Intencional**:
   - Erros derivados de `AbortSignal` disparados por barge-in representam cancelamento intencional, não constituindo falha de provedor elegível para retry.
3. **Cálculo de `isRetryable`**:
   - O campo `isRetryable?: boolean` no contrato `ModelFailureEvent` deve ser computado considerando conjuntamente: a categoria do erro do provedor + se a saída já foi parcialmente aceita + o motivo do encerramento.
4. **Política Operacional Vigente**:
   - `RETRY POLICY: DEFERRED`. Nenhuma categoria de erro autoriza retry automático no slice atual.

---

## 9. Recomendação Técnica para Primeiro Spike

### Status Normativo:
- **Provedor Primário Corporativo**: **PENDING HUMAN DECISION** em `docs/DECISIONS_LOG.md`.
- **Candidato Selecionado para Primeiro Spike de Validação Técnica**: **OpenAI (GPT-4o mini via Chat Completions API)**.

### Critérios Factualmente Observados:
1. **Menor Complexidade de Mapeamento**: O fluxo de SSE linear com `stream_options: { include_usage: true }` adapta-se diretamente à união discriminada `ModelStreamEvent`, com telemetria de uso consolidada sem necessidade de agregação em múltiplos eventos temporais.
2. **Custo Mínimo entre os Candidatos Comparados**: O valor de **$0.15 / $0.60 por 1M tokens** representa o menor custo listado entre os candidatos comparados neste gate, reduzindo custos em baterias de testes funcionais.
3. **Exposição de AbortSignal**: O SDK oficial `openai` expõe interface de cancelamento via `AbortController` nativo do Node.js. O tempo de encerramento server-side permanece categorizado como `PROVIDER-UNVERIFIED`.
4. **Candidato Alternativo Imediato**: **Anthropic (Claude Haiku 4.5 via Messages API)**, com excelente isolamento nativo de instruções de sistema (`system`), requerendo agregação de métricas de tokens entre `message_start` e `message_delta`.

---

## 10. Observações de Governança sobre DECISIONS_LOG.md

- **Conflito Textual Identificado**: A linha 73 de `docs/DECISIONS_LOG.md` registra o tópico como *"Fornecedor de Motor de Voz / LLM Realtime"*.
- **TERMINOLOGY_CORRECTION_RECOMMENDED**: `YES`.
  - Proposta futura de separação conceitual: *"Conversation Model Provider"* (modelo de texto) e *"Telephony / Voice Transport Provider"* (transporte e áudio Twilio ConversationRelay).
  - Conforme as regras de governança, nenhuma alteração no `docs/DECISIONS_LOG.md` foi efetuada silenciosamente sem aprovação explícita do operador humano.
