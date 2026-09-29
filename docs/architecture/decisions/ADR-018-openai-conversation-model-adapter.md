# ADR-018: OpenAI Conversation Model Adapter and Primary Provider Decision

- **Status**: Proposed
- **Data**: 2026-09-29

---

## Context (Contexto)

Com a arquitetura de runtime de voz provider-neutral formalizada (ADR-014 e ADR-017), o sistema necessita da decisão formal do operador e da implementação do primeiro adapter real para `ConversationModelPort`.

Em 2026-09-29, o operador tomou formalmente a decisão humana:
- **Primary Conversation Model Provider**: OpenAI.

Essa decisão substitui o status anterior `PENDING HUMAN DECISION` exclusivamente para a seleção da OpenAI como fornecedora principal de modelo conversacional.

Auditorias na documentação oficial da OpenAI em 2026-09-29 indicaram:
1. **Superfície de API (Responses API vs Chat Completions API)**:
   - A *Responses API* (`POST /v1/responses`) foi analisada: constatou-se que ela suporta operação stateless quando `store: false` é utilizado e `previous_response_id` é omitido. Contudo, na especificação oficial OpenAPI atual, a Responses API é classificada sob `?beta=true` com cabeçalho de ativação beta e possui ampla superfície voltada a ferramentas embutidas, agentes e multi-modalidade.
   - A *Chat Completions API* (`POST /v1/chat/completions`) permanece como a interface estável, request-scoped e linear para streaming textual via Server-Sent Events (SSE) com telemetria padronizada de tokens (`stream_options: { include_usage: true }`). Ela adere 100% à arquitetura onde `CallSession` e o orquestrador do nosso runtime detêm com exclusividade a autoridade do estado da conversa, apresentando a menor superfície de implementação e risco de protocolo.
2. **Catálogo Oficial e Seleção de Modelo ("Most Advanced" vs "Most Suitable")**:
   - O catálogo oficial de modelos da OpenAI em 2026-09-29 apresenta a família carro-chefe **GPT-6** (`gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`), além das famílias de raciocínio profundo (`o1`, `o3`, `o4-mini`) e modelos suportados anteriores (`gpt-5.x`, `gpt-4o`).
   - O modelo mais avançado e geral em capacidade pura é o `gpt-6-astra`. Contudo, modelos de máxima capacidade analítica ou de raciocínio profundo podem introduzir maior latência de primeiro token (*Time-to-First-Token* / TTFT), enquanto modelos como `gpt-6-sol` e `gpt-6-luna` são posicionados pelo provedor para equilíbrio e baixa latência em alto volume.
   - Modelos legados como `gpt-4o` permanecem disponíveis no provedor, mas não representam o ápice do catálogo atual.
   - Como existe trade-off material entre capacidade geral e latência no caminho de voz, a decisão humana confirmou estritamente o **provedor (OpenAI)**. O identificador do modelo concreto permanece **estritamente configurável** e opera em **modo fail-closed** (`MISSING_MODEL_CONFIG_BEHAVIOR = FAIL_CLOSED`), exigindo configuração explícita via `OPENAI_CONVERSATION_MODEL` ou injeção no composition root.
   - Métricas de desempenho real (`LATENCY_REAL = NOT MEASURED`) e qualidade de áudio/vendas em português brasileiro (`PT-BR_SUPPORT = DOCUMENTED`, `PT-BR_QUALITY = NOT VERIFIED`) dependem de homologação com provedor real em benchmark futuro. Metas de latência são tratadas como objetivos iniciais de engenharia, não como SLAs garantidos.
3. **TypeSafe Jev**: Permanece categorizado como `BENCHMARK_CANDIDATE` e `AUXILIARY DECISION MODEL`, não sendo adotado como provedor principal nem implementado neste slice.

---

## Decision (Decisão)

1. **Confirmação do Provedor Primário**:
   - Aprovada a **OpenAI** como fornecedora do modelo primário de conversação para o `ConversationModelPort`.
2. **Isolamento de SDK e Adoção de Native Fetch**:
   - O adapter reside exclusivamente em `packages/integrations/src/openai/`.
   - Implementado utilizando `fetch` nativo do Node.js (Node 22/24) e parser determinístico de Server-Sent Events (SSE). Essa abordagem evita introduzir uma nova dependência npm para este adapter, reduzindo a superfície incremental de dependências externas. Reconhece-se o trade-off de que a manutenção do parsing de SSE e tratamento de baixo nível do protocolo HTTP/SSE reside no código da aplicação.
   - O core de voz (`apps/voice`) e contratos (`packages/contracts`) permanecem 100% desacoplados de tipos ou bibliotecas proprietárias da OpenAI.
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
   - Status HTTP e exceções de rede são sanitizados em categorias neutras (`authentication`, `rate_limit`, `timeout_network`, `provider_unavailable`, `invalid_request`, `unknown`). O corpo da resposta bruta (raw response body) nunca é incluído em mensagens de erro ou logs, impedindo vazamento de API keys, payloads ou transcrições.
7. **Política de Model ID Fail-Closed**:
   - A configuração de modelo não possui fallback silencioso para identificadores históricos. A ausência de `modelId` na injeção ou na variável `OPENAI_CONVERSATION_MODEL` resulta em falha explícita (`MISSING_MODEL_CONFIG_BEHAVIOR = FAIL_CLOSED`).
8. **Classificação de Homologação**:
   - `IMPLEMENTED` / `TESTED LOCALLY` / `PROVIDER-UNVERIFIED` (sem chamadas a redes pagas em testes locais).

---

## Consequences (Consequências)

### Positivas
- Integração concreta com o ecossistema OpenAI preservando 100% o desacoplamento do core de voz.
- Zero dependências npm adicionadas ao projeto (`native fetch` e SSE parser puro).
- Segurança rigorosa com sanitização de erros, proteção contra vazamento de corpo bruto e isolamento de credenciais.
- Suporte nativo a cancelamento de turno (*barge-in*) e acúmulo determinístico de texto.
- Flexibilidade operacional total com fail-closed explícito para alteração do model ID.

### Limitações e Mitigações
- Validação com tráfego telefônico real e medição de latência física permanecem pendentes (`PROVIDER-UNVERIFIED`).
- Chamadas a APIs pagas reais estão bloqueadas até autorização humana explícita posterior.
