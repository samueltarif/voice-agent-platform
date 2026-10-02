# Phase 6 - Deterministic Runtime Wiring: Documento de Design (PHASE_6_DETERMINISTIC_RUNTIME_WIRING_DESIGN.md)

> **Status**: DESIGNED_WITH_BLOCKERS
> **Data**: 2026-10-01
> **Fase**: Phase 6 (Voice Model Routing & Jev Evaluation)
> **Prompt de Origem**: `PROMPT-006X-DETERMINISTIC-RUNTIME-WIRING-DESIGN-001`
> **Prompt de Hardening**: `PROMPT-006X-PR51-WIRING-DESIGN-HARDENING-AND-MERGE-001`
> **Branch**: `research/006x-deterministic-runtime-wiring-design`
> **Base main SHA**: `b0124ac3d0b060a03aace4a83b954054d70d85a5`
> **Invariante Formal**: `NO_KNOWN_DETERMINISTIC_HANDLER -> NO_DETERMINISTIC_BYPASS`
> **Fronteira Estrita**: Este documento e AUDIT / DESIGN ONLY. Zero linhas de codigo funcional foram alteradas.

---

## Resumo Executivo de Status: DESIGNED_WITH_BLOCKERS

O design arquitetural da fiação do runtime determinístico foi conceituado, porém **NÃO está pronto para fiação no orquestrador** devido aos seguintes bloqueadores formais identificados na auditoria:

1. `SECURITY_OFFLINE_ACTION`: `IMPLEMENTED / TESTED LOCALLY` (`apps/voice/src/security-blocked-action.ts`; `SECURITY_RUNTIME_SEMANTICS = DESIGNED`).
2. `SECURITY_RUNTIME_ROUTING_INTEGRATION`: `NOT IMPLEMENTED` (`SECURITY_RESPONSE_DELIVERY_DESIGN = DESIGNED`; fiação e execução no orquestrador permanecem `NOT IMPLEMENTED`).
3. `POST_DISPATCH_BARGE_IN_DESIGN`: `DESIGNED` (`docs/research/PHASE_6_RESPONSE_DELIVERY_LIFECYCLE_DESIGN.md`; `POST_DISPATCH_BARGE_IN_RUNTIME = NOT IMPLEMENTED`; `LIVE_PROVIDER_BARGE_IN_VERIFICATION = PROVIDER-UNVERIFIED`).
4. `CURRENT_ADAPTER_POST_DISPATCH_CANCEL_SUPPORTED`: `NO` (fontes oficiais consultadas do protocolo ConversationRelay não documentam comando outbound de cancel; auto-interrupção ocorre na borda do provider).
5. `CURRENT_ADAPTER_PLAYBACK_COMPLETION_SIGNAL`: `NO` (fontes oficiais consultadas do protocolo ConversationRelay não documentam ack de playback acústico).
6. `DETERMINISTIC_AUDIO_FULLY_DELIVERED`: `NOT VERIFIED` após speak dispatch (inobservável acusticamente no provider).
7. `DETERMINISTIC_HISTORY_COMPLETION_AFTER_SPEAK`: `DESIGNED` (Option H4 com `isInterrupted: true`; `RUNTIME_IMPLEMENTATION = NOT IMPLEMENTED`).
8. `ACTIVE_GUARDED_PROVIDER_CALL_OWNERSHIP`: `BLOCKED / NOT IMPLEMENTED` (risco de dupla consulta Jev se shadowObserver coexistir).
9. `RUNTIME_FROZEN_POLICY_INTERPRETER`: `IMPLEMENTED / TESTED LOCALLY` (`apps/voice/src/frozen-policy-interpreter.ts`; 20 testes unitários; `FROZEN_POLICY_CHANGED = NO`).

---

## 1. Fluxo de Turno Atual (Current Turn Flow - Factual)

Baseado na auditoria do código versionado em `apps/voice/src/`:

```
[Twilio ConversationRelay WebSocket]
  |
  | VoiceInputEvent (type: user.speech.final)
  v
ConversationOrchestrator.handleEvent()
  |
  | session = sessionStore.getById(organizationId, callId)
  | [guard] session.runtimeState === ACTIVE
  |
  | generationId = gen_turnId_counter
  | activeGenerations.set(callId, generationId)   <- OWNERSHIP MARKER
  |
  | shadowObserver?.observeTurn(...)               <- fire-and-forget nao-bloqueante
  |
  v
AssistantStreamCoordinator.appendUserUtterance()
  | historyStore.appendTurn({ role: user, content: transcript })
  |
  v
sessionStore.save({ currentTurnId, generationId })
  |
  v
AssistantStreamCoordinator.streamTurn()
  |
  | prepareTurnContext()
  |   historyStore.listForCall(...)
  |   contextComposer.composeContext(...)
  |
  | ConversationModelPort.streamTurn(...)  <- UNICO CAMINHO GENERATIVO ATUAL
  |
  v
processModelStream()
  | for await chunk of stream:
  |   [guard] isGenerationActive(callId, genId)   <- PRE-DISPATCH CHUNK CHECK
  |   transport.speak(callId, { text, generationId, isFinal })
  |
  v
AssistantStreamCoordinator.recordTurnCompletion()  <- PRIVATE METHOD
  | historyStore.appendTurn({ role: assistant, content: fullResponse })
  | logger.info(call.turn.completed, { generationId, durationMs })
```

**Fatos derivados do código:**

- `activeGenerations` (`Map<callId, generationId>`) é o marcador de ownership da geração ativa no processo.
- O staleness check (`isGenerationActive`) é verificado a cada chunk recebido do modelo antes do despacho.
- Interrupção (`user.interruption`) substitui `generationId` por `stale_turnId`, invalidando chunks subsequentes.
- `AssistantStreamCoordinator.recordTurnCompletion()` é método **privado** de coordenação interna.
- O transport (`VoiceTransportPort.speak`) submete texto para sintetização via WebSocket; não aguarda reprodução acústica.
- `ConversationModelPort.streamTurn()` (OpenAI adapter) é a única fonte de geração de resposta de voz atualmente.

---

## 2. Ponto de Interceptação Determinística e Separação de Fluxos

### 2.1. Localização do Seam de Response Ownership

```
DETERMINISTIC_INTERCEPTION_SEAM = ConversationOrchestrator.handleUserSpeechFinal()
  - apos sessionStore.save({ generationId })
  - antes de AssistantStreamCoordinator.streamTurn()
```

### 2.2. Separação Estrita: CURRENT SHADOW FLOW vs. FUTURE ACTIVE_GUARDED FLOW

É mandatório separar a mecânica de shadow atual da futura mecânica ativa:

- **CURRENT SHADOW FLOW (Vigente)**:
  - O `shadowObserver.observeTurn()` dispara de forma assíncrona, desacoplada e estritamente consultiva logo após a criação de `generationId`.
  - O fluxo principal de voz não aguarda nem consome o resultado do shadow observer.
  - Zero bypass determinístico é possível (`DEFAULT_AUXILIARY_FEATURE_MODE = DISABLED`).
- **FUTURE ACTIVE_GUARDED FLOW (Desenho Futuro)**:
  - Uma avaliação serial do Jev precisaria ocorrer **antes** de decidir a rota determinística.
  - **Atenção**: O fato de que "shadowObserver já disparou" **NÃO serve como justificativa** para o seam de decisão em `ACTIVE_GUARDED`.
  - O seam após `save(generationId)` e antes de `streamTurn()` é adequado para **response ownership commit**, mas a consulta serial do Jev em `ACTIVE_GUARDED` exige ownership único de chamadas ao provedor auxiliar (ver Seção 5).

### 2.3. Propriedades Preservadas pelo Seam

| Propriedade | Status |
|---|---|
| Generation ownership (`generationId`) | PRESERVADO - mesmo ID reutilizado |
| Cancellation / staleness check | PRESERVADO - `activeGenerations` continua autoritativo para pre-dispatch |
| Interruption semantics | PRESERVADO - `handleUserInterruption` substitui generationId normalmente |
| OpenAI fallback | PRESERVADO - simplesmente chamar `streamTurn()` se pré-condições não forem aceitas |
| History persistence | PRESERVADO - persistência via `historyStore.appendTurn(role=assistant)` |
| Barge-in suppression | PARCIAL - apenas pre-dispatch staleness suppression garantido (ver Seção 11) |
| Duplicate response prevention | GARANTIVEL - via `RESPONSE_OWNERSHIP_COMMIT` (ver Seção 8) |

---

## 3. Comparação de Topologias de Roteamento (Routing-Order Evaluation)

### Classificação Factual de Métricas de Tráfego e Latência

- `REAL_TRAFFIC_CAPABILITY_MATCH_RATE = NOT VERIFIED` (não há medição factual de distribuição de tráfego de produção).
- `REAL_TRAFFIC_GENERATIVE_ROUTE_RATE = NOT VERIFIED` (proibido afirmar percentuais como "80% de tráfego" sem evidência real).
- `PRODUCTION_SERIAL_JEV_OVERHEAD = NOT VERIFIED` (a mediana histórica de 255ms em benchmark sintético/holdout é dado de pesquisa, não previsão garantida de overhead de rede em produção).
- `TYPE_SAFE_AVOIDED_FOR_UNMATCHED_CAPABILITY = DESIGN PROPERTY / NOT RUNTIME-OBSERVED`.

### OPTION_A: Matcher Local -> Jev -> Frozen Policy -> Handler

```
transcript
  -> matchesOperatingHoursCapability()  [local, puro, zero-network]
  -> se SIM: AuxiliaryTurnDecisionPort.evaluateTurn()
  -> Frozen Policy interpreta scores
  -> se DETERMINISTIC_CANDIDATE: handleOperatingHoursTurn()
  -> se GENERATIVE_REQUIRED: streamTurn() [OpenAI]
  -> se SECURITY_ESCALATE: handler proibido; ação offline SECURITY_BLOCKED IMPLEMENTADA / TESTADA LOCALMENTE; integração de roteamento e entrega user-facing NÃO IMPLEMENTADAS
  -> se NAO (no matcher): streamTurn() [OpenAI] sem chamar Jev
```

| Critério | Avaliação Qualitativa |
|---|---|
| Provider exposure | MÍNIMA - Jev só é avaliado quando há capability local correspondente |
| Privacy | MELHOR - transcrições sem correspondência local nunca alcançam o TypeSafe |
| Latency | OTIMIZADA - matcher-first evita chamadas TypeSafe para turnos sem capability conhecida |
| Cost | MÍNIMO - chamadas TypeSafe restritas a candidatos a capabilities conhecidas |
| False bypass surface | BAIXA - dois filtros sequenciais (matcher estático + policy frozen) |
| Frozen Policy compatibility | TOTAL - thresholds frozen inalterados |
| ADR-019 compatibility | TOTAL - confirma a Opção C do ADR-019 (Application-Eligibility Filtered) |
| Known-handler guard | FORTE - matcher é o gate de entrada obrigatório |
| Failure semantics | FAIL-CLOSED para bypass determinístico; fallback generativo para falhas do Jev |

### OPTION_B: Jev -> Frozen Policy -> Matcher Local -> Handler

| Critério | Avaliação Qualitativa |
|---|---|
| Provider exposure | MÁXIMA - 100% das transcrições alcançariam o TypeSafe |
| Privacy | PIOR - viola princípio de minimização de dados |
| Latency | PIOR - Option B adiciona uma avaliação serial do Jev a todo turno que alcançar a topologia |
| ADR-019 compatibility | INCOMPATÍVEL - Opção A (Always-On Serial Gate) foi classificada `NOT SELECTED` no ADR-019 |
| YAGNI | DESFAVORÁVEL - avalia provedor auxiliar mesmo para turnos puramente generativos |

**OPTION_B classificada**: `NOT SELECTED - incompatível com ADR-019 e com restrição de privacidade`.

### OPTION_C: Matcher Local -> Handler (sem Jev)

| Critério | Avaliação Qualitativa |
|---|---|
| Provider exposure | ZERO - sem TypeSafe |
| Security validation | AUSENTE - score de segurança da Frozen Policy não é avaliado |
| ADR-019 compatibility | INCOMPATÍVEL com Stage 4 do ADR-019 (`ACTIVE_GUARDED` exige guard do Jev) |
| Semântica de Teste vs. Runtime | `OFFLINE_COMPONENT_TESTING_WITHOUT_JEV = ALLOWED` em testes unitários isolados com fakes; `DISABLED_RUNTIME_BYPASS = PROHIBITED` em qualquer execução de runtime. |

**Correção Semântica Fundamental**:
- Em runtime, `DISABLED` significa categoricamente que a rota determinística **DEVE permanecer inalcançável** (`DISABLED_RUNTIME_BYPASS = PROHIBITED`).
- Testes unitários/integração offline podem testar componentes determinísticos isoladamente com fakes (`OFFLINE_COMPONENT_TESTING_WITHOUT_JEV = ALLOWED`), mas isso **NÃO constitui** um modo de execução em runtime.

### Topologia Selecionada

```
SELECTED_ROUTING_TOPOLOGY = Application-Eligibility Filtered Serial Gate
STATUS = DESIGNED / NOT WIRED
```

---

## 4. Impacto de Privacidade (Privacy Impact)

- **MATCHER_FIRST_PRIVACY_BENEFIT**: `YES` (qualitativo).
  - Transcrições que não correspondem a capabilities locais conhecidas nunca são enviadas ao TypeSafe.
  - Reduz a exposição de transcrições ao mínimo necessário para o guard.
- **CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE**: `NOT CLEARED`.
  - O gate permanece não liberado. O design minimiza a exposição, mas não autoriza tráfego de clientes.
  - Testes com tráfego real de clientes permanecem estritamente proibidos (`CUSTOMER_TRAFFIC = PROHIBITED`).

---

## 5. Ownership de Chamadas a Provedores Auxiliares (Auxiliary Provider Call Ownership)

### Invariante de Chamada Única

```
AUXILIARY_DECISION_CALL_OWNERSHIP = SINGLE_OWNER_REQUIRED
Invariante: AT MOST ONE auxiliary provider evaluation per turn for the same routing purpose.
```

### Semântica por Modo

1. **`DISABLED`**:
   - 0 chamadas a provedores auxiliares.
   - Rota determinística inalcançável.
2. **`SHADOW`**:
   - `AuxiliaryTurnShadowObserver` pode deter o ownership da avaliação consultiva (telemetria/log).
   - Zero bypass determinístico.
3. **Future `ACTIVE_GUARDED`**:
   - A avaliação serial de roteamento detém com exclusividade o ownership da consulta ao Jev para aquele turno.
   - **Regra de Coexistência**: O `AuxiliaryTurnShadowObserver` **NÃO PODE** disparar independentemente uma segunda requisição ao Jev para o mesmo turno quando o roteamento serial `ACTIVE_GUARDED` detiver o ownership da avaliação.

### Status de Prontidão da Arquitetura

Como a base de código atual não possui mecanismo para coordenar ou suprimir o shadow observer durante uma avaliação serial:

```
ACTIVE_GUARDED_PROVIDER_CALL_OWNERSHIP = BLOCKED / NOT IMPLEMENTED
```

---

## 6. Escopo do Interpretador de Política Congelada (Runtime Frozen Policy Interpreter Scope)

### Auditoria Factual

- `ROUTING_CLASSIFICATIONS_IMPLEMENTED_IN_INTERPRETER` = `YES` (`apps/voice/src/frozen-policy-interpreter.ts`).
- `ROUTING_CLASSIFICATIONS_WIRED_IN_ORCHESTRATOR` = `NO`.

```
RUNTIME_FROZEN_POLICY_INTERPRETER = IMPLEMENTED / TESTED LOCALLY
FROZEN_POLICY_CHANGED = NO
SECURITY_OFFLINE_ACTION = IMPLEMENTED / TESTED LOCALLY
SECURITY_RUNTIME_ROUTING_INTEGRATION = NOT IMPLEMENTED
SECURITY_RUNTIME_DELIVERY = NOT IMPLEMENTED
SECURITY_RUNTIME_ACTION = NOT IMPLEMENTED (means runtime-integrated action, not the offline SECURITY_BLOCKED constructor)
SECURITY_RUNTIME_SEMANTICS = DESIGNED (ver docs/research/PHASE_6_SECURITY_ESCALATE_RUNTIME_SEMANTICS.md)
```

### Fronteira Estrita e Isolamento de Responsabilidade

**CURRENT IMPLEMENTATION**:
`apps/voice/src/frozen-policy-interpreter.ts`
Status: `IMPLEMENTED / TESTED LOCALLY`

O interpretador é uma **função pura e determinística** (`interpretFrozenTurnPolicy`) com escopo estritamente delimitado:

- **Entrada**: Scores numéricos de `AuxiliaryTurnDecisionOutput` / `FrozenTurnPolicyInput` (`securityScore`, `deterministicScore`, `generativeScore`).
- **Distinção de Nomenclatura (Runtime Contract vs. Research Artifact)**:
  - **RESEARCH / FROZEN ARTIFACT TERMINOLOGY**: `securityNoul`, `deterministicNoul`, `generativeNoul` (definidos nos artefatos congelados de calibração).
  - **RUNTIME CONTRACT TERMINOLOGY**: `securityScore`, `deterministicScore`, `generativeScore` (definidos no contrato canônico `packages/contracts/src/voice/auxiliary-turn-decision-contracts.ts` e consumidos por `FrozenTurnPolicyInput`).
  - **Mapping Semântico**:
    - `securityScore` corresponde ao `securityNoul` congelado.
    - `deterministicScore` corresponde ao `deterministicNoul` congelado.
    - `generativeScore` corresponde ao `generativeNoul` congelado.
- **Lógica**: Aplicação estrita dos thresholds da Frozen Policy:
  - `T_SECURITY = 0.56` (Regra 1: se `securityScore >= 0.56` -> `SECURITY_ESCALATE`)
  - `T_DETERMINISTIC = 0.35` e `generativeScore <= 0.47` (Regra 2: -> `DETERMINISTIC_CANDIDATE`)
  - Caso contrário (Regra 3: -> `GENERATIVE_REQUIRED`)
- **Saída**: Uma enum/union tipada com a classificação formal (`FrozenPolicyClassification`).

**O interpretador NÃO DEVE**:
- Decidir ação de segurança em runtime;
- Executar handlers;
- Fazer chamadas de rede ou a provedores;
- Chamar OpenAI ou transport;
- Alterar estados de sessão.

```
FROZEN_POLICY_INTERPRETER_CAN_BE_IMPLEMENTED_OFFLINE_INDEPENDENTLY = YES
```

---

## 7. Rota de Segurança (SECURITY_ESCALATE Semantics & Hardening)

### Auditoria e Correção de Inconsistência

O design preliminar continha uma contradição documental: declarava `SECURITY_RUNTIME_ACTION = NOT IMPLEMENTED`, mas sugeria fallback automático para `streamTurn()` (OpenAI).

**Isso NÃO é um comportamento autorizado.**

```
SECURITY_OFFLINE_ACTION = IMPLEMENTED / TESTED LOCALLY
SECURITY_RUNTIME_ROUTING_INTEGRATION = NOT IMPLEMENTED
SECURITY_RUNTIME_DELIVERY = NOT IMPLEMENTED
SECURITY_RUNTIME_ACTION = NOT IMPLEMENTED (means runtime-integrated action, not the offline SECURITY_BLOCKED constructor)
SECURITY_RUNTIME_SEMANTICS = DESIGNED (ver docs/research/PHASE_6_SECURITY_ESCALATE_RUNTIME_SEMANTICS.md)
SECURITY_ESCALATE_DETERMINISTIC_BYPASS = PROHIBITED
SECURITY_ESCALATE_OPENAI_FALLBACK = NOT AUTHORIZED
```

### Regras Mandatórias de Segurança

1. **Bypass Proibido**: Quando a Frozen Policy retornar `SECURITY_ESCALATE`, o handler determinístico **NÃO PODE** ser executado sob nenhuma circunstância.
2. **Ação Offline Implementada, Fiação Pendente**: A ação interna (`SECURITY_BLOCKED`) foi implementada offline (`apps/voice/src/security-blocked-action.ts`). A integração de runtime no orquestrador e a entrega user-facing permanecem pendentes.
3. **Bloqueadores Ativos**:
   ```
   SECURITY_RUNTIME_SEMANTICS = DESIGNED
   SECURITY_OFFLINE_ACTION = IMPLEMENTED / TESTED LOCALLY
   SECURITY_RUNTIME_ROUTING_INTEGRATION = NOT IMPLEMENTED
   SECURITY_USER_RESPONSE_DELIVERY = NOT IMPLEMENTED
   SECURITY_RESPONSE_DELIVERY_READY = NO
   DETERMINISTIC_POST_DISPATCH_BARGE_IN = NOT VERIFIED
   ACTIVE_GUARDED = BLOCKED
   ```
4. É terminantemente proibido mascarar esse bloqueador usando fallback silencioso para `streamTurn()`.

---

## 8. Semântica de Fallback OpenAI e Response Ownership Commit

### Distinção Conceitual: GENERATION_ACTIVE vs. RESPONSE_PATH_OWNED

- `GENERATION_ACTIVE`: Indica que o ID da geração (`generationId`) está vigente na sessão e no mapa de orquestração.
- `RESPONSE_PATH_OWNED`: Indica qual caminho de execução assumiu formalmente o compromisso de responder ao usuário.

### Definição Formal de RESPONSE_OWNERSHIP_COMMIT

```
RESPONSE_OWNERSHIP_COMMIT = the point after which OpenAI fallback must never start for that turn.
```

### Matriz de Decisão Pré-Commit (Fallback Permitido)

Antes do commit da resposta determinística, falhas direcionam para o fallback padrão da OpenAI (com exceção explícita de `SECURITY_ESCALATE`):

| Caso | Condição Pré-Commit | Ação de Roteamento |
|---|---|---|
| A | `matchesOperatingHoursCapability = false` | `streamTurn()` OpenAI (fluxo nominal inalterado) |
| B | Jev timeout / network error / parse failure | `streamTurn()` OpenAI (fail-open para modelo principal) |
| C | `GENERATIVE_REQUIRED` (Frozen Policy) | `streamTurn()` OpenAI |
| D | `SECURITY_ESCALATE` (Frozen Policy) | **FALLBACK PROIBIDO / SECURITY_BLOCKED offline action = IMPLEMENTED / TESTED LOCALLY; routing integration = NOT WIRED; OpenAI fallback = NOT AUTHORIZED** (ver Seção 7) |
| E | Handler guard failure (`sessionOrg != configOrg`) | `streamTurn()` OpenAI |
| F | Handler guard failure (`operatingHours` vazio) | `streamTurn()` OpenAI |
| G | Handler execution `handled = false` | `streamTurn()` OpenAI |
| H | Handler lança exceção pré-dispatch | `streamTurn()` OpenAI |

### Regra de Falha Pós-Despacho (Post-Dispatch Failure Rule)

Se a resposta determinística já foi enviada ao transport (`VoiceTransportPort.speak`):

```
OPENAI_FALLBACK_AFTER_DETERMINISTIC_SPEAK_DISPATCH = PROHIBITED
```

**Motivo mandatório**: Evitar resposta dupla (*double speech*) para o usuário. Erros subsequentes em persistência de histórico, logs estruturados ou finalização de métricas **NUNCA** podem disparar `streamTurn()`.

---

## 9. Prevenção de Resposta Duplicada (Single-Response Invariant)

### Invariante Formal

```
EXACTLY ONE response path owns each turn's generation.
```

- Se o caminho determinístico atingir `RESPONSE_OWNERSHIP_COMMIT` e despachar a resposta: `streamTurn()` **NUNCA** pode ser executado.
- Se o orquestrador invocar `streamTurn()`: o caminho determinístico **NÃO PODE** ser despachado.

---

## 10. Auditoria de Capacidade de Interrupção do Transport (Transport Interruption Source Audit)

### Auditoria Factual de `packages/integrations/src/twilio/**`

A auditoria no código versionado do adapter Twilio Conversation Relay (`TwilioVoiceTransportAdapter`, `twilio-command-translator.ts`, `twilio-conversation-relay-types.ts`, `twilio-event-translator.ts`) estabeleceu os seguintes fatos:

1. **Comando explícito de cancelamento outbound**:
   - `translateVoiceOutputCommand` implementa `case 'interrupt_speech': return null;`.
   - `TwilioOutboundMessage` suporta exclusivamente `{ type: 'text' }` e `{ type: 'end' }`.
   - Não existe mensagem de cancelamento/limpeza de buffer de fala enviada ao WebSocket da Twilio.
   - `TwilioVoiceTransportAdapter.interruptSpeech()` apenas atualiza conjuntos e mapas em memória local; zero mensagens enviadas ao socket.
   - Resultado: `CURRENT_ADAPTER_POST_DISPATCH_CANCEL_SUPPORTED = NO` (`EXTERNAL_PROVIDER_CAPABILITY_BEYOND_CURRENT_ADAPTER = NOT VERIFIED`).
2. **Sinal de conclusão de reprodução (Playback Completion Signal)**:
   - `TwilioInboundMessage` recebe `{ type: 'setup' }`, `{ type: 'prompt' }`, `{ type: 'interrupt' }`, `{ type: 'error' }`, `{ type: 'disconnect' }`.
   - Não existe nenhum sinal de "playback complete", "audio drained" ou confirmação acústica enviado pela Twilio ao término da fala do bot.
   - Resultado: `CURRENT_ADAPTER_PLAYBACK_COMPLETION_SIGNAL = NO` (`EXTERNAL_PROVIDER_CAPABILITY_BEYOND_CURRENT_ADAPTER = NOT VERIFIED`).
3. **Uso de `generationId` no Provedor**:
   - `generationId` é um token puramente interno da aplicação (`ConversationOrchestrator`).
   - O comando enviado à Twilio (`TwilioTextTokenMessage`) recebe apenas `token: command.text` e `last: command.isFinal`.
   - A Twilio **não tem conhecimento** de `generationId` e não o utiliza para cancelar áudio em reprodução.
4. **Comportamento em `user.interruption`**:
   - Quando o usuário interrompe falando, a Twilio detecta barge-in internamente e envia inbound `{ type: 'interrupt' }`.
   - O orquestrador recebe `user.interruption` e chama `transport.interruptSpeech()`, que apenas invalida futuras chamadas de `speak` locais com o ID antigo.

---

## 11. Semântica de Barge-In: Pre-Dispatch vs. Post-Dispatch

A verificação `isGenerationActive(...)` imediatamente antes de `transport.speak()` qualifica-se formalmente da seguinte forma:

```
DETERMINISTIC_PRE_DISPATCH_STALE_SUPPRESSION = DESIGNED
DETERMINISTIC_POST_DISPATCH_BARGE_IN = NOT VERIFIED
DIRECT_VOICETRANSPORT_SPEAK_SAFE = NOT VERIFIED
```

- **Pre-Dispatch**: Se o usuário interromper enquanto o handler determinístico estiver executando (antes do despacho para `speak`), a resposta é descartada com segurança.
- **Post-Dispatch**: Uma vez que `transport.speak(isFinal=true)` for chamado, o áudio já foi transferido para a infraestrutura da Twilio. Como `CURRENT_ADAPTER_POST_DISPATCH_CANCEL_SUPPORTED = NO`, o orquestrador não tem controle direto de cancelamento pós-despacho via código da aplicação.

---

## 12. Semântica e Seam de Persistência de Histórico (History Completion Semantics & Seam Audit)

### Regra Arquitetural de Histórico

> Uma resposta parcial ou cancelada do assistente **NUNCA DEVE** ser persistida como completa no histórico conversacional.

### Risco Pós-Despacho

- `transport.speak(..., isFinal: true)` significa apenas **"último chunk de texto submetido ao socket"**.
- Não prova que o áudio foi efetivamente escutado pelo usuário (`DETERMINISTIC_AUDIO_FULLY_DELIVERED = NOT VERIFIED after speak dispatch`).
- Portanto:
  ```
  DETERMINISTIC_HISTORY_COMPLETION_AFTER_SPEAK = NOT AUTOMATICALLY SAFE
  ```
- Gravar o turno como completo imediatamente após o retorno de `transport.speak` arrisca registrar fala completa mesmo se o usuário tiver interrompido no primeiro segundo da fala determinística.

### Auditoria Factual do Seam de Histórico

- `AssistantStreamCoordinator.recordTurnCompletion()`:
  - **Visibilidade**: `private async recordTurnCompletion(...)` em `apps/voice/src/assistant-stream-coordinator.ts`.
  - **Inputs**: `(session: CallSession, turnId: string, meta: { generationId, fullResponse, startTime })`.
  - **Responsabilidade**: Invoca `this.historyStore.appendTurn({ role: 'assistant', content: meta.fullResponse })` e emite log estruturado `call.turn.completed`.
  - **Reutilização externa direta**: **NÃO É POSSÍVEL** sem alterar sua visibilidade ou expor método público.
  - Resultado:
    ```
    DETERMINISTIC_HISTORY_SEAM = private AssistantStreamCoordinator.recordTurnCompletion() — NOT EXTERNALLY ACCESSIBLE
    ```
- **Diretriz de Design**: Não propor chamadas privadas reflexivas. O design deve reutilizar o mesmo comportamento semântico (`historyStore.appendTurn(role='assistant')` + log de completude), sem criar nenhum armazenamento paralelo de histórico.

---

## 13. Semântica Completo vs. Streaming (Complete Response Semantics)

Para a resposta determinística, a representação de saída é um bloco completo:

```typescript
await transport.speak(session.callId, {
  text: responseText,
  generationId,
  isFinal: true,
});
```

Não se aplica fragmentação artificial (fake streaming). O contrato de `VoiceTransportPort` aceita `isFinal: true` diretamente em chamadas atômicas.

---

## 14. Tenant Binding (Fontes Autoritativas)

```
TENANT_BINDING_SOURCES =
  sessionOrganizationId: session.organizationId (CallSession)
  configurationOrganizationId: bootstrap.organizationId (CallBootstrap)
```

- **Fato Arquitetural Auditado**: `AgentConfigurationSnapshotV1` **NÃO possui** o campo `organizationId`. O tenant binding factual deriva de `CallSession.organizationId` e `CallBootstrap.organizationId`, sendo entregue ao handler determinístico via `sessionOrganizationId` e `configurationOrganizationId` conforme a interface `OperatingHoursTurnHandlerInput`.
- Invariante formal preservada: `CallBootstrap.organizationId === CallSession.organizationId` (assegurada pelo `CallLifecycleGateway.consumeBootstrapAndInitializeSession()`).
- O guard `sessionOrg === configOrg` no handler determinístico atua como defesa em profundidade multi-tenant.

---

## 15. Feature Gating (Mode Gating)

```
MODE_GATING_MODEL =
  DISABLED       -> deterministic route unreachable; 0 auxiliary calls; streamTurn() called directly
  SHADOW         -> deterministic route unreachable; shadowObserver fires advisory-only; streamTurn() called directly
  ACTIVE_GUARDED -> BLOCKED / unreachable in current runtime
```

---

## 16. Topologia de Validação Staging-Only (Future Staging Validation)

Qualquer teste de integração futuro de wiring deve empregar exclusivamente:

- `FakeAuxiliaryTurnDecisionPort` (test double provider-neutral);
- `FakeConversationModel` (`apps/voice/src/fake-conversation-model.ts`);
- `FakeVoiceTransport` (`apps/voice/src/fake-voice-transport.ts`);
- `InMemoryConversationHistoryStore`;
- `InMemoryCallSessionStore`;
- Provedores reais: TypeSafe = 0, OpenAI = 0, Twilio = 0;
- Tráfego real de clientes: PROIBIDO.

---

## 17. Matriz de Testes de Integração Futura (Integration Test Matrix)

| Caso | Cenário | Comportamento Esperado |
|---|---|---|
| A | `mode = DISABLED` | Rota determinística inalcançável; TypeSafe = 0; OpenAI nominal |
| B | Suportado + `DETERMINISTIC_CANDIDATE` + guards válidos | Handler assume resposta; `streamTurn()` não chamado |
| C | Suportado + `GENERATIVE_REQUIRED` | Handler não acionado; fallback `streamTurn()` executado |
| D | Suportado + `SECURITY_ESCALATE` | Handler proibido; semântica interna SECURITY_BLOCKED desenhada; fallback OpenAI desautorizado |
| E | Frase sem correspondência de capability | Matcher retorna false; Jev não chamado; OpenAI nominal |
| F | Tenant mismatch (`sessionOrg != configOrg`) | Handler recusa (`handled = false`); fallback OpenAI |
| G | `operatingHours` ausente/inválido | Handler recusa (`handled = false`); fallback OpenAI |
| H | Jev timeout ou erro de rede | Fallback para OpenAI; zero falhas não tratadas |
| I | Interrupção pré-despacho (`isGenerationActive = false`) | Resposta determinística suprimida antes de `speak` |
| J | Interrupção pós-despacho | Documentado como `NOT VERIFIED` em transport atual |
| K | Resposta única comprovada | Exatamente uma fonte de resposta por turno |
| L | Persistência no histórico | Exatamente uma entrada `assistant` com semântica qualificada |
| M | Provider calls em testes automatizados | TypeSafe = 0, OpenAI = 0, Twilio = 0 |

---

## 18. Análise YAGNI & Orçamento de Complexidade

```
CURRENT_REQUIREMENT: Desenhar a integração controlada de roteamento do handler agent.operating_hours.
EXISTING_OPTION: ConversationOrchestrator já é a raiz de coordenação de turnos.
MINIMAL_OPTION: Manter o orquestrador enxuto, extraindo lógica de roteamento em módulo coeso se o arquivo exceder limites.
NEW_COORDINATOR_REQUIRED = NO
```

### Projeção de Complexidade e Arquivos

| Arquivo | Linhas Atuais | Delta Previsto | Linhas Finais Estimadas | Ação |
|---|---|---|---|---|
| `conversation-orchestrator.ts` | 177 | +15 a +30 | ~190 a ~207 | Extrair se ultrapassar 180 |
| `assistant-stream-coordinator.ts` | 151 | 0 a +10 | ~151 a ~161 | Dentro do limite de 180 |
| `frozen-policy-interpreter.ts` | 0 (novo) | +40 a +60 | ~40 a ~60 | Próximo slice isolado |

---

## 19. Pré-Requisitos para ACTIVE_GUARDED (Implementation Prerequisites)

| Pré-Requisito | Status Atual | Classificação |
|---|---|---|
| `KNOWN_DETERMINISTIC_HANDLERS >= 1` | **MET** | Handler `agent.operating_hours` implementado/testado (PR #50) |
| `CAPABILITY_RESOLUTION` | **MET** | Matcher local puro implementado/testado (PR #50) |
| `RUNTIME_FROZEN_POLICY_INTERPRETER` | **IMPLEMENTED / TESTED LOCALLY** | Função pura implementada offline em `frozen-policy-interpreter.ts` com 20 testes unitários (`FROZEN_POLICY_CHANGED = NO`) |
| `SECURITY_RUNTIME_SEMANTICS` | **DESIGNED** | Definido em `docs/research/PHASE_6_SECURITY_ESCALATE_RUNTIME_SEMANTICS.md` |
| `SECURITY_OFFLINE_ACTION` | **IMPLEMENTED / TESTED LOCALLY** | Implementado em `security-blocked-action.ts` (5 testes unitários) |
| `SECURITY_RUNTIME_ROUTING_INTEGRATION` | **NOT IMPLEMENTED** | Bloqueador de fiação |
| `SECURITY_USER_RESPONSE_DELIVERY` | **NOT IMPLEMENTED** | Entrega não implementada (`SECURITY_RESPONSE_DELIVERY_DESIGN = DESIGNED`) |
| `SECURITY_RESPONSE_DELIVERY_READY` | **NO** | Entrega não faturada/testada no runtime (`DESIGNED`, mas `RUNTIME = NOT IMPLEMENTED`) |
| `POST_DISPATCH_BARGE_IN_DESIGN` | **DESIGNED** | Definido em `docs/research/PHASE_6_RESPONSE_DELIVERY_LIFECYCLE_DESIGN.md` |
| `POST_DISPATCH_BARGE_IN_RUNTIME` | **NOT IMPLEMENTED** | Implementação de runtime de barge-in ainda não executada |
| `LIVE_PROVIDER_BARGE_IN_VERIFICATION` | **PROVIDER-UNVERIFIED** | Verificação ao vivo contra gateway real pendente de credenciais e tráfego |
| `CURRENT_ADAPTER_POST_DISPATCH_CANCEL_SUPPORTED` | **NO** | Fontes oficiais consultadas do protocolo Twilio CR não documentam cancel outbound; interrupção ocorre na borda |
| `CURRENT_ADAPTER_PLAYBACK_COMPLETION_SIGNAL` | **NO** | Fontes oficiais consultadas do protocolo Twilio CR não documentam ack de playback acústico |
| `DETERMINISTIC_AUDIO_FULLY_DELIVERED` | **NOT VERIFIED** | Inobservável no provider; tratado via semântica de interrupção |
| `DETERMINISTIC_HISTORY_COMPLETION_AFTER_SPEAK` | **DESIGNED** | Option H4 (`isInterrupted: true`); `RUNTIME = NOT IMPLEMENTED` |
| `ACTIVE_GUARDED_PROVIDER_CALL_OWNERSHIP` | **BLOCKED / NOT IMPLEMENTED** | Risco de chamadas concorrentes/duplicadas ao Jev |
| `DETERMINISTIC_RESPONSE_DELIVERY` (wiring) | **NOT WIRED** | Pendente de resolução de bloqueadores |
| `CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE` | **NOT CLEARED** | Gate de privacidade |
| `PRODUCTION_RUNTIME_WIRING` | **NO** | Desautorizado |

---

## 20. Redução do Próximo Passo de Implementação (Next Allowed Step Reduction)

Devido aos múltiplos bloqueadores não resolvidos de runtime (`SECURITY_RUNTIME_ROUTING_INTEGRATION`, `POST_DISPATCH_BARGE_IN_RUNTIME`, `AUXILIARY_CALL_OWNERSHIP`), **NÃO É AUTORIZADA** a fiação simultânea do orquestrador com o interpretador ou ativação em produção.

O roadmap decomposto em `docs/research/PHASE_6_RESPONSE_DELIVERY_LIFECYCLE_DESIGN.md` define a sequência estrita de implementação mínima: Slice A (concluído) -> Slice B (próximo) -> Slice C -> Slice D.

```
NEXT_ALLOWED_STEP:
Slice B: Deterministic Response Delivery & Ownership in Orchestrator Offline.
Implementar helper coeso de despacho determinístico com OPTION_B (ownership commit imediatamente antes de speak()), blindagem DISPATCH_ATTEMPTED -> NO_OPENAI_FALLBACK, e tratamento de interrupção com gravação de histórico qualificado (Option H4: isInterrupted: true). Coberto por testes unitários e de integração no orquestrador usando fakes, sem chamadas externas a provedores.
```

### Motivos da Redução de Escopo

1. `SECURITY_RUNTIME_ROUTING_INTEGRATION` e delivery permanecem `NOT IMPLEMENTED` (ação offline `SECURITY_BLOCKED` está `IMPLEMENTED / TESTED LOCALLY`).
2. `POST_DISPATCH_BARGE_IN` não possui suporte de cancelamento no transport versionado.
3. A semântica de completude de histórico após `speak` não é comprovadamente segura.
4. O ownership de chamadas auxiliares não impede dupla consulta se o shadow observer coexistir.

---

## 21. Não-Objetivos Explícitos (Explicit Non-Goals)

1. Nenhuma alteração funcional em `ConversationOrchestrator`, `AssistantStreamCoordinator` ou qualquer módulo de runtime neste prompt.
2. Nenhum interpretador de política congelada implementado neste prompt.
3. Nenhuma ativação de `ACTIVE_GUARDED` em qualquer ambiente.
4. Nenhuma chamada externa a provedores (TypeSafe = 0, OpenAI = 0, Twilio = 0).
5. Nenhum carregamento de variáveis de ambiente (`.env`) ou conexão a banco de dados.
6. Nenhuma alteração nos thresholds da Frozen Policy ou reutilização do holdout consumido.
7. Nenhum tráfego de clientes (`CUSTOMER_TRAFFIC = PROHIBITED`).
