# ADR-018: OpenAI Conversation Model Adapter and Primary Provider Decision

- **Status**: Accepted
- **Data**: 2026-09-29 (Atualizado: 2026-09-30)

---

## Context (Contexto)

Com a arquitetura de runtime de voz provider-neutral formalizada (ADR-014 e ADR-017), o sistema necessita da decisão formal do operador e da implementação do primeiro adapter real para `ConversationModelPort`.

Em 2026-09-29, o operador tomou formalmente a decisão humana:
- **Primary Conversation Model Provider**: OpenAI (DEC-037).

Essa decisão substitui o status anterior `PENDING HUMAN DECISION` exclusivamente para a seleção da OpenAI como fornecedora principal de modelo conversacional.

Auditorias na documentação oficial da OpenAI em 2026-09-29 e smoke tests reais indicaram:
1. **Superfície de API (Chat Completions API vs Responses API)**:
   - A *Chat Completions API* (`POST /v1/chat/completions`) é adotada como a superfície de API baseline aceita (*Accepted baseline API surface*), request-scoped e linear para streaming textual via Server-Sent Events (SSE) com telemetria padronizada de tokens (`stream_options: { include_usage: true }`). Ela adere 100% à arquitetura onde `CallSession` e o orquestrador do nosso runtime detêm com exclusividade a autoridade do estado da conversa.
   - A *Responses API* (`POST /v1/responses`) permanece categorizada como **DEFERRED / FUTURE EVALUATION**, não sendo permanentemente rejeitada, mas diferida por estar em beta e introduzir complexidade desnecessária neste slice.
2. **Modelo Baseline e Preferência de Operador**:
   - O modelo `gpt-6-astra` é adotado como *current baseline model candidate / current configured smoke model*, alinhado à preferência do operador pelo modelo de maior capacidade do catálogo atual.
   - O identificador de modelo **não é uma fixação arquitetural permanente**: permanece estritamente configurável via `OPENAI_CONVERSATION_MODEL` ou injeção com comportamento fail-closed (`MISSING_MODEL_CONFIG_BEHAVIOR = FAIL_CLOSED`).
3. **Controle de Gastos e Raciocínio (Spend Guard & Reasoning Control)**:
   - Limite rígido `maxCompletionTokens` (wire: `max_completion_tokens`) obrigatório em configuração.
   - Parâmetro `reasoningEffort` (wire: `reasoning_effort`) configurável para modelos com raciocínio ativo (configurado como `low` para o baseline Astra). O parâmetro `temperature` é incompatível com raciocínio ativo no Astra e é omitido da requisição (com validação local fail-closed que rejeita configs incompatíveis).
4. **TypeSafe Jev**: Permanece categorizado como `BENCHMARK_CANDIDATE` e `AUXILIARY DECISION MODEL`, não sendo adotado como provedor principal nem implementado neste slice.

---

## Decision (Decisão)

1. **Confirmação do Provedor Primário**:
   - Aprovada a **OpenAI** como fornecedora do modelo primário de conversação para o `ConversationModelPort` (DEC-037).
2. **Isolamento de SDK e Adoção de Native Fetch**:
   - O adapter reside exclusivamente em `packages/integrations/src/openai/`.
   - Implementado utilizando `fetch` nativo do Node.js (Node 22/24) e parser determinístico de Server-Sent Events (SSE), com zero dependências npm proprietárias.
   - O core de voz (`apps/voice`) e contratos (`packages/contracts`) permanecem 100% agnósticos e provider-neutral.
3. **Mapeamento de Contexto e Fronteira de Autoridade**:
   - O adapter mapeia o snapshot da versão do agente (`AgentConfigurationSnapshotV1`) para instruções confiáveis em mensagem `system`.
   - O histórico de turnos é preservado cronologicamente (`user` e `assistant`).
   - A entrada do interlocutor é mapeada como dado não-confiável (`trustLevel: 'UNTRUSTED_CALLER_INPUT'`).
4. **Streaming Incremental e Acumulação Determinística**:
   - Chunks do provider emitem eventos `text.delta`.
   - Evento `usage` reporta `inputTokens` e `outputTokens` apenas quando fornecidos pelo provedor via `stream_options`.
   - O evento `completed` é terminal, emitido uma única vez, contendo `fullText` estritamente idêntico à soma determinística dos deltas aceitos.
5. **Integração com AbortSignal e Resiliência a Barge-in**:
   - O cancelamento propaga para a fronteira HTTP via `AbortSignal`.
   - Chunks tardios após o cancelamento são descartados e respostas parciais interrompidas não entram no histórico definitivo da conversa.
6. **Mapeamento Seguro de Erros e Sanitização de Resposta**:
   - Status HTTP e exceções de rede são sanitizados em categorias neutras (`authentication`, `rate_limit`, `timeout_network`, `provider_unavailable`, `invalid_request`, `unknown`). O corpo da resposta bruta nunca é incluído em mensagens de erro ou logs.
7. **Política de Model ID Fail-Closed & Spend Guard**:
   - Ausência de `modelId` ou de `maxCompletionTokens` resulta em falha explícita imediata.
8. **Classificação Normativa de Evidências**:
   - OpenAI Adapter: **`IMPLEMENTED`** / **`TESTED LOCALLY`** / **`VALIDATED — LIMITED REAL PROVIDER SMOKE`** (comprovado com `gpt-6-astra` em streaming e abort real sob teto autorizado < US$ 0.10).
   - Production Readiness: **`NOT VALIDATED`** (requer tráfego real prolongado e observabilidade operacional).
   - Twilio E2E, Voice Quality, PT-BR Sales Quality, Latency SLA: **`NOT VALIDATED`**.

---

## Consequences (Consequências)

### Positivas
- Integração concreta com o ecossistema OpenAI preservando 100% o desacoplamento do core de voz.
- Zero dependências npm adicionadas ao projeto (`native fetch` e SSE parser puro).
- Segurança rigorosa com sanitização de erros, spend guard determinístico (`max_completion_tokens`) e controle de raciocínio (`reasoning_effort`).
- Suporte comprovado em execução real para cancelamento de turno (*barge-in*) e streaming incremental.
- Flexibilidade operacional total com fail-closed explícito para alteração do model ID.

### Limitações e Mitigações
- Validação com tráfego telefônico real e medição de latência física permanecem pendentes (`NOT VALIDATED`).
- Latência observada em amostra única de raciocínio (TTFT ~3s com Astra reasoning low) reforça a necessidade de dataset de calibração antes de qualquer SLA de produção.
- Chamadas a APIs pagas reais requerem autorização humana prévia e injeção externa de credenciais no ambiente do processo.
