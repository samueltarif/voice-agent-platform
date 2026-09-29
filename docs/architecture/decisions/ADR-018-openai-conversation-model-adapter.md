# ADR-018: OpenAI Conversation Model Adapter and Primary Provider Decision

- **Status**: Accepted
- **Data**: 2026-09-29

---

## Context (Contexto)

Com a arquitetura de runtime de voz provider-neutral formalizada (ADR-014 e ADR-017), o sistema necessita da decisão formal do operador e da implementação do primeiro adapter real para `ConversationModelPort`.

Em 2026-09-29, o operador tomou formalmente a decisão humana:
- **Primary Conversation Model Provider**: OpenAI.

Essa decisão substitui o status anterior `PENDING HUMAN DECISION` exclusivamente para o provedor de modelo conversacional principal.

Além disso, auditorias na documentação oficial da OpenAI em 2026-09-29 indicaram:
1. **Superfície de API**: Entre a *Responses API* (`/v1/responses`, focada em fluxos agênticos complexos e estado no servidor) e a *Chat Completions API* (`/v1/chat/completions`, sem estado no servidor, streaming padrão SSE com contagem de tokens em `stream_options`), a *Chat Completions API* apresenta a menor superfície de complexidade técnica e adere 100% à arquitetura onde `CallSession` e `InMemoryConversationHistoryStore` detêm a autoridade do estado no nosso runtime.
2. **Seleção de Modelo ("Most Advanced" vs "Most Suitable")**:
   - Modelos de raciocínio da família `o1` e `o3` possuem latência inicial muito elevada devido ao processamento interno de cadeia de pensamento (*chain-of-thought*), sendo inadequados para streaming conversacional em chamadas telefônicas com restrição de tempo de resposta (*Time-to-First-Token* / TTFT).
   - O modelo `gpt-4o` (com alias oficial apontando para o snapshot de produção mais recente) representa a opção mais avançada e adequada para diálogo em áudio/voz por texto em pt-BR, oferecendo alta fluência, aderência a instruções e baixa latência de geração (~100+ tokens/s).
   - A decisão humana recai sobre o **provedor (OpenAI)**. O identificador do modelo concreto permanece **estritamente configurável** em runtime (via `OPENAI_CONVERSATION_MODEL`).
3. **TypeSafe Jev**: Permanece categorizado como `BENCHMARK_CANDIDATE` e `AUXILIARY DECISION MODEL`, não sendo adotado como provedor principal nem implementado neste slice.

---

## Decision (Decisão)

1. **Confirmação do Provedor Primário**:
   - Aprovada a **OpenAI** como fornecedora do modelo primário de conversação para o `ConversationModelPort`.
2. **Isolamento de SDK e Adoção de Native Fetch**:
   - O adapter reside exclusivamente em `packages/integrations/src/openai/`.
   - Implementado utilizando `fetch` nativo do Node.js 22/24 e parser determinístico de Server-Sent Events (SSE), dispensando dependências de SDK de terceiros em `packages/integrations` e eliminando riscos de supply-chain e scripts de build externos.
   - O core de voz (`apps/voice`) e contratos (`packages/contracts`) permanecem 100% desacoplados de bibliotecas proprietárias da OpenAI.
3. **Mapeamento de Contexto e Fronteira de Autoridade**:
   - O adapter mapeia o snapshot da versão do agente (`AgentConfigurationSnapshotV1`) para instruções confiáveis em mensagem `system`.
   - O histórico de turnos é preservado cronologicamente (`user` e `assistant`).
   - A entrada do interlocutor é mapeada como dado não-confiável (`trustLevel: 'UNTRUSTED_CALLER_INPUT'`).
4. **Streaming Incremental e Acumulação Determinística**:
   - Chunks do provider emitem eventos `text.delta`.
   - Evento `usage` reporta `inputTokens` e `outputTokens` quando fornecidos pelo provedor via `stream_options`.
   - O evento `completed` é terminal, emitido uma única vez, contendo `fullText` estritamente idêntico à soma determinística dos deltas aceitos.
5. **Integração com AbortSignal e Resiliência a Barge-in**:
   - O cancelamento propaga para a fronteira HTTP via `AbortSignal`.
   - Chunks tardios após o cancelamento são descartados e respostas parciais interrompidas não entram no histórico definitivo.
6. **Mapeamento Seguro de Erros**:
   - Status HTTP e exceções de rede são sanitizados em categorias neutras (`authentication`, `rate_limit`, `timeout_network`, `provider_unavailable`, `invalid_request`, `unknown`), impedindo vazamento de API keys, payloads ou prompts em logs.
7. **Política de Model ID**:
   - O model ID padrão é `gpt-4o` (verificado em 2026-09-29), configurável por variável de ambiente `OPENAI_CONVERSATION_MODEL`.
8. **Classificação de Homologação**:
   - `IMPLEMENTED` / `TESTED LOCALLY` / `PROVIDER-UNVERIFIED` (sem chamadas a redes pagas em testes locais).

---

## Consequences (Consequências)

### Positivas
- Integração concreta com o ecossistema OpenAI preservando 100% o desacoplamento do core de voz.
- Zero dependências npm adicionadas ao projeto (`native fetch` e SSE parser puro).
- Segurança rigorosa com sanitização de erros e isolamento de credenciais.
- Suporte nativo a cancelamento de turno (*barge-in*) e acúmulo determinístico de texto.
- Flexibilidade operacional total para alterar o model ID sem alterar o código de domínio.

### Limitações e Mitigações
- Validação com tráfego telefônico real e medição de latência física (São Paulo / Brasil) permanecem pendentes (`PROVIDER-UNVERIFIED`).
- Chamadas a APIs pagas reais estão bloqueadas até autorização humana explícita posterior.
