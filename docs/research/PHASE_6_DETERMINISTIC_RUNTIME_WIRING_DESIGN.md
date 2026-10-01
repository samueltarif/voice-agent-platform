# Phase 6 - Deterministic Runtime Wiring: Documento de Design (PHASE_6_DETERMINISTIC_RUNTIME_WIRING_DESIGN.md)

> **Status**: DESIGN IN PROGRESS
> **Data**: 2026-10-01
> **Fase**: Phase 6 (Voice Model Routing & Jev Evaluation)
> **Prompt de Origem**: `PROMPT-006X-DETERMINISTIC-RUNTIME-WIRING-DESIGN-001`
> **Branch**: `research/006x-deterministic-runtime-wiring-design`
> **Base main SHA**: `b0124ac3d0b060a03aace4a83b954054d70d85a5`
> **Invariante Formal**: `NO_KNOWN_DETERMINISTIC_HANDLER -> NO_DETERMINISTIC_BYPASS`
> **Fronteira Estrita**: Este documento e DESIGN ONLY. Zero linhas de codigo funcional foram alteradas.

---

## 1. Fluxo de Turno Atual (Current Turn Flow - Factual)

Baseado na auditoria do codigo versionado em `apps/voice/src/`:

`
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
  |   [guard] isGenerationActive(callId, genId)   <- STALENESS CHECK (barge-in)
  |   transport.speak(callId, { text, generationId, isFinal })
  |
  v
AssistantStreamCoordinator.recordTurnCompletion()
  | historyStore.appendTurn({ role: assistant, content: fullResponse })
  | logger.info(call.turn.completed, { generationId, durationMs })
`

**Fatos derivados do codigo:**

- `activeGenerations` (Map<callId, generationId>) e o marcador de ownership da geracao ativa.
- O staleness check (`isGenerationActive`) e verificado a cada chunk do stream.
- Interrupcao (`user.interruption`) substitui `generationId` por `stale_turnId`, invalidando o stream corrente.
- `historyStore.appendTurn({ role: assistant })` e a unica porta de persistencia de resposta no contexto conversacional.
- O transport (`VoiceTransportPort.speak`) e o unico ponto de saida de audio.
- `ConversationModelPort.streamTurn()` (OpenAI adapter) e a unica fonte de geracao de texto atualmente.

---

## 2. Ponto de Interceptacao Deterministica (Interception Seam)

### 2.1. Localizacao do Seam

`
DETERMINISTIC_INTERCEPTION_SEAM = ConversationOrchestrator.handleUserSpeechFinal()
  - apos sessionStore.save({ generationId })
  - antes de AssistantStreamCoordinator.streamTurn()
`

**Justificativa factual:**

1. O `generationId` ja esta atribuido: a decisao deterministica pode reutilizar o mesmo `generationId` sem criar artefato paralelo.
2. O `appendUserUtterance` ja ocorreu: o turno do usuario ja esta no historico.
3. O `sessionStore.save` ja ocorreu: o session state e `ACTIVE` e `currentTurnId` esta correto.
4. `streamTurn()` nao foi chamado: o modelo OpenAI ainda nao foi acionado. Interceptar aqui preserva o fallback natural.
5. O `shadowObserver.observeTurn()` ja disparou: o Jev shadow nao precisa esperar a decisao deterministica.

### 2.2. Propriedades Preservadas pelo Seam

| Propriedade | Status |
|---|---|
| Generation ownership (generationId) | PRESERVADO - mesmo ID reutilizado |
| Cancellation / staleness check | PRESERVADO - activeGenerations continua autoritativo |
| Interruption semantics | PRESERVADO - handleUserInterruption substitui generationId normalmente |
| OpenAI fallback | PRESERVADO - simplesmente chamar streamTurn() se handler nao aceitar |
| History persistence | PRESERVADO - mesmo seam (historyStore.appendTurn) |
| Barge-in suppression | PRESERVADO - isGenerationActive guarda entrega de resposta |
| Duplicate response prevention | GARANTIVEL - exactly-one branch (ver Secao 8) |

---

## 3. Comparacao de Topologias de Roteamento (Routing-Order Evaluation)

### OPTION_A: Matcher Local -> Jev -> Frozen Policy -> Handler

`
transcript
  -> matchesOperatingHoursCapability()  [local, puro, zero-network]
  -> se SIM: AuxiliaryTurnDecisionPort.evaluateTurn()
  -> Frozen Policy interpreta scores
  -> se DETERMINISTIC_CANDIDATE: handleOperatingHoursTurn()
  -> se NAO: streamTurn() [OpenAI]
  -> se NAO (no matcher): streamTurn() [OpenAI] sem chamar Jev
`

| Criterio | Avaliacao |
|---|---|
| Provider exposure | MINIMA - Jev so e chamado se capability conhecida |
| Privacy | MELHOR - transcricoes de capabilities desconhecidas nunca chegam ao TypeSafe |
| Latency | MENOR - 80% dos turnos pagam 0ms de Jev overhead |
| Cost | MENOR - requests TypeSafe apenas para capabilities conhecidas |
| False bypass surface | BAIXA - dois filtros (matcher + policy) antes do handler |
| Frozen Policy compatibility | TOTAL - thresholds inalterados |
| ADR-019 compatibility | TOTAL - e exatamente a Opcao C do ADR-019 (Application-Eligibility Filtered) |
| Known-handler guard | FORTE - matcher e a porta de entrada obrigatoria |
| Failure semantics | FAIL-CLOSED - qualquer falha no Jev -> OpenAI fallback |
| YAGNI | OTIMO - sem overhead para maioria dos turnos |

### OPTION_B: Jev -> Frozen Policy -> Matcher Local -> Handler

| Criterio | Avaliacao |
|---|---|
| Provider exposure | MAXIMA - 100% das transcricoes chegam ao TypeSafe |
| Privacy | PIOR - viola minimizacao mesmo antes do gate de dados de clientes |
| Latency | PIOR - sempre serial: +255ms (mediana) em 100% dos turnos generativos |
| ADR-019 compatibility | PARCIAL - Opcao A (Always-On Serial Gate) foi classificada NOT SELECTED no ADR-019 |
| YAGNI | PESSIMO - overhead em 80% dos turnos que irao para OpenAI de qualquer forma |

**OPTION_B classificada**: `NOT SELECTED - incompativel com ADR-019 e com restricao de privacidade`.

### OPTION_C: Matcher Local -> Handler (sem Jev)

| Criterio | Avaliacao |
|---|---|
| Provider exposure | ZERO - sem TypeSafe |
| Security validation | AUSENTE - SECURITY_ESCALATE nunca verificado |
| ADR-019 compatibility | PARCIAL - ADR-019 Stage 4 exige Jev para ACTIVE_GUARDED |
| YAGNI | BOM (curto prazo) / PROBLEMATICO (longo prazo) |

**OPTION_C classificada**: `ELEGIVEL SOMENTE PARA MODE=DISABLED internal testing / staging unit tests. NOT SELECTED para topologia de producao futura com ACTIVE_GUARDED.`

**Nota sobre testes offline**: Option C e valida para o primeiro slice de testes de integracao de wiring com fakes (sem Jev real), conforme Secao 11.

### Topologia Selecionada

**SELECTED_TOPOLOGY = OPTION_A** - Application-Eligibility Filtered Serial Gate, confirmando a Opcao C do ADR-019.

`
user.speech.final
  -> [seam] apos save(generationId), antes de streamTurn()
  -> matchesOperatingHoursCapability(transcript)    [local, puro]
    -> NAO: streamTurn() [OpenAI - caminho atual inalterado]
    -> SIM:
      -> AuxiliaryTurnDecisionPort.evaluateTurn()   [Jev advisory]
        -> TIMEOUT/ERRO: streamTurn() [OpenAI fallback]
        -> RESULTADO:
          -> applyFrozenPolicy(scores)              [local deterministico]
            -> SECURITY_ESCALATE: [fail-closed - ver Secao 5]
            -> GENERATIVE_REQUIRED: streamTurn() [OpenAI]
            -> DETERMINISTIC_CANDIDATE:
              -> handleOperatingHoursTurn(input)
                -> handled=false: streamTurn() [OpenAI]
                -> handled=true:
                  -> deliverDeterministicResponse(responseText, generationId)
                  -> recordDeterministicTurnHistory(responseText)
`

---

## 4. Impacto de Privacidade (Privacy Impact)

- **MATCHER_FIRST_PRIVACY_BENEFIT**: `YES`
  - Transcricoes de capabilities desconhecidas nunca chegam ao TypeSafe.
  - Reduz significativamente a exposicao de dados mesmo com gate nao liberado.
- **CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE**: `NOT CLEARED`
  - O gate permanece nao liberado. O design minimiza exposicao mas nao libera trafego de clientes.
  - Staging sintetico apenas enquanto o gate nao for formalmente liberado.

---

## 5. Interpretador de Politica Congelada em Runtime (Runtime Frozen Policy Interpreter)

### Auditoria Factual

Resultado da busca em `apps/voice/src/` e `packages/`:

- `SECURITY_ESCALATE`, `DETERMINISTIC_CANDIDATE`, `GENERATIVE_REQUIRED` - **nenhuma ocorrencia** em codigo de runtime funcional.
- `applyFrozenPolicy`, `interpretPolicy`, `frozenPolicy` - **nenhuma ocorrencia**.

`
RUNTIME_FROZEN_POLICY_INTERPRETER = NOT IMPLEMENTED
`

A logica que transforma `AuxiliaryTurnDecisionOutput` (scores brutos) nas classificacoes de roteamento usando os thresholds:

- `T_SECURITY = 0.56`
- `T_DETERMINISTIC = 0.35`
- `T_GENERATIVE = 0.47`

nao existe ainda em codigo de runtime. Os thresholds aparecem apenas em documentacao e dados de pesquisa.

Este e um **pre-requisito obrigatorio** para qualquer wiring com ACTIVE_GUARDED no futuro. A implementacao deve ser funcao pura deterministica em modulo coeso separado (`frozen-policy-interpreter.ts`).

**NAO IMPLEMENTAR neste prompt.**

---

## 6. Rota de Seguranca (Security Route - SECURITY_ESCALATE)

### Auditoria Factual

Nenhum codigo de runtime em `apps/voice/src/` implementa acao para `SECURITY_ESCALATE`:

`
SECURITY_RUNTIME_ACTION = NOT IMPLEMENTED
`

### Comportamento Fail-Closed Necessario

Quando a politica congelada classificar um turno como `SECURITY_ESCALATE`:

1. O bypass deterministico e **expressamente proibido** - `handleOperatingHoursTurn` nao pode ser chamado.
2. Tratamento conservador minimo: `streamTurn()` OpenAI (fail-open para o modelo principal).
3. `SECURITY_ESCALATE` **NUNCA transforma** o resultado em bypass deterministico.

**NOTA**: Status e `NOT IMPLEMENTED`. A implementacao futura deve ser decidida e testada separadamente.

---

## 7. Semantica de Fallback OpenAI (OpenAI Fallback Semantics)

O caminho de fallback reutiliza **exatamente** `AssistantStreamCoordinator.streamTurn()` - zero criacao de segundo fluxo generativo.

| Caso | Condicao | Acao |
|---|---|---|
| A | `matchesOperatingHoursCapability = false` | `streamTurn()` direto (Jev nao chamado) |
| B | `Jev timeout / error` | `streamTurn()` (fail-open para modelo principal) |
| C | `GENERATIVE_REQUIRED` (policy) | `streamTurn()` |
| D | `SECURITY_ESCALATE` | `streamTurn()` (fail-open conservador) |
| E | `handled = false` (handler guards) | `streamTurn()` |
| F | `sessionOrg != configOrg` | `handled = false` -> `streamTurn()` |
| G | `operatingHours` ausente/vazio | `handled = false` -> `streamTurn()` |
| H | `runtimeState != ACTIVE` | `handled = false` -> `streamTurn()` |
| I | Handler lanca excecao inesperada | Catch -> `streamTurn()` (nunca propagar sem fallback) |

O `streamTurn()` atual e o caminho de fallback canonico. Zero logica nova de geracao necessaria.

---

## 8. Ownership de Resposta - Prevencao de Resposta Duplicada (Single-Response Invariant)

### Invariante Formal

`
EXACTLY ONE response path owns each turn's generation.
`

Se o handler deterministico aceita o turno (`handled = true`):
- **`streamTurn()` NAO deve ser chamado.**
- A funcao deve retornar apos a entrega deterministica.

Se o handler recusa (`handled = false`) ou falha antes de assumir ownership:
- **`streamTurn()` PODE ser chamado.**

**Pseudo-codigo (NAO implementado - somente design):**

`	s
const result = tryDeterministicRoute(session, event, snapshot, generationId);
if (result.handled) {
  await deliverDeterministicResponse(result.responseText, generationId, session, turnId);
  return;   // EARLY RETURN - streamTurn() nunca alcancado
}
await this.streamCoordinator.streamTurn(...);   // fallback OpenAI
`

### Comprovacao em Testes Futuros

- `FakeVoiceTransport` deve acumular todas as chamadas `speak()`.
- Verificar que `transport.spokenChunks` contem `generationId` de **exatamente uma** fonte por turno.
- Verificar que `historyStore` contem exatamente **um** `appendTurn` com `role: assistant` por turno.

---

## 9. Ownership de Geracao - Modelo de Lifecycle (Generation Lifecycle)

### Auditoria Factual

O `ConversationOrchestrator` mantem `activeGenerations: Map<callId, generationId>`. Este mapa e o **marcador autoritativo** de qual geracao esta ativa.

- `handleUserInterruption()` substitui o generationId por `stale_`, invalidando o stream ativo.
- `processModelStream()` verifica `isGenerationActive(callId, genId)` a cada chunk.

### Pergunta: O handler pode chamar `VoiceTransportPort.speak` diretamente?

`
DIRECT_VOICETRANSPORT_SPEAK_SAFE = NOT VERIFIED (condicionalmente YES)
`

**Raciocinio**: Se o handler chama `speak()` com o mesmo `generationId` do turno atual, o comportamento de interrupcao continuara funcionando. Porem o handler **nao deve** chamar `speak()` diretamente sem passar pelo staleness check.

**Preferencia arquitetural**: Reutilizar o ownership model do `AssistantStreamCoordinator`. Uma funcao `deliverDeterministicResponse()` deve:

1. Verificar `isGenerationActive` antes de falar.
2. Chamar `transport.speak(callId, { text: responseText, generationId, isFinal: true })`.
3. Retornar sem entrar no loop de stream.

---

## 10. Semantica de Barge-In / Interrupcao (Barge-In Model)

`
DETERMINISTIC_BARGE_IN_MODEL =
  Check isGenerationActive immediately before transport.speak().
  If stale: discard, log, return.
  If active: speak with isFinal=true.
  No partial/resume semantics - text is complete or not delivered at all.
`

**Invariante**: Uma resposta deterministica que comeca a ser entregue mas e interrompida deve ser silenciada da mesma forma que um chunk de stream stale. O `isGenerationActive` check garante isso se aplicado **antes** de cada `speak()`.

---

## 11. Persistencia no Historico Conversacional (Conversation History)

`
DETERMINISTIC_RESPONSE_HISTORY_REQUIRED = YES
`

**Justificativa**: O contexto conversacional e construido em `prepareTurnContext()` a partir de `historyStore.listForCall()`. Se a resposta do assistant nao for adicionada ao historico, o contexto dos turnos subsequentes ficara incorreto.

`
DETERMINISTIC_HISTORY_SEAM = AssistantStreamCoordinator.recordTurnCompletion()
  (ou funcao analoga com a mesma semantica de historyStore.appendTurn + log)
`

**Regra**: A resposta deterministica deve aparecer **exatamente uma vez** no historico. Nenhum storage paralelo criado.

---

## 12. Semantica Completo vs. Streaming (Complete Response Semantics)

**Representacao no transport**: um unico chunk com `isFinal: true`.

`	s
transport.speak(callId, {
  text: responseText,
  generationId,
  isFinal: true
});
`

Nao ha fake streaming. `VoiceTransportPort.speak` ja aceita chunks com `isFinal: true` - o Twilio WebSocket nao exige fragmentacao artificial.

---

## 13. Tenant Binding (Fontes Autoritativas)

`
TENANT_BINDING_SOURCES =
  sessionOrganizationId: session.organizationId  (CallSession)
  configurationOrganizationId: session.organizationId  (invariante via CallBootstrap)
`

**Invariante documentada**: `CallBootstrap.organizationId === CallSession.organizationId` - garantida pelo `CallLifecycleGateway.consumeBootstrapAndInitializeSession()`. O guard `sessionOrg === configOrg` sempre passa para snapshots corretamente associados e permanece como defesa em profundidade.

---

## 14. Feature Gating (Mode Gating)

### Modos Atuais (Factual)

`
DISABLED        -> handler path unreachable
SHADOW          -> Jev consultado para telemetria apenas; zero bypass de handler
ACTIVE_GUARDED  -> BLOCKED (throw em resolveEffectiveMode + assertValidFeatureMode)
`

`
MODE_GATING_MODEL =
  DISABLED       -> seam never entered; streamTurn() called directly
  SHADOW         -> seam never entered for deterministic bypass; shadowObserver continues as-is
  ACTIVE_GUARDED -> BLOCKED / throw (unreachable in current runtime)
`

---

## 15. Topologia de Validacao Staging-Only (Future Staging Validation)

O primeiro slice de integracao de wiring futuro deve usar:

`
- Fake AuxiliaryTurnDecisionPort (provider-neutral test double)
- FakeConversationModel (existente em apps/voice/src/fake-conversation-model.ts)
- FakeVoiceTransport (existente em apps/voice/src/fake-voice-transport.ts)
- InMemoryConversationHistoryStore (existente)
- InMemoryCallSessionStore (existente)
- No Twilio, No OpenAI real, No TypeSafe real
- No PSTN, No customer data
`

Live staging validation com TypeSafe real = prompt separado posterior, sob autorizacao explicita.

---

## 16. Matriz de Testes de Integracao Futura (Integration Test Matrix)

| Caso | Condicao | Resultado Esperado |
|---|---|---|
| A | `mode=DISABLED` | matcher/handler nao acionados; OpenAI normal; TypeSafe=0 |
| B | Frase suportada + policy `DETERMINISTIC_CANDIDATE` + tenant/config/state validos | handler owns response; OpenAI stream **nao chamado** |
| C | Frase suportada + policy `GENERATIVE_REQUIRED` | handler nao executado; OpenAI fallback normal |
| D | Frase suportada + `SECURITY_ESCALATE` | bypass proibido; comportamento fail-closed |
| E | Frase nao suportada/ambigua | sem bypass deterministico; OpenAI |
| F | Tenant mismatch (`sessionOrg != configOrg`) | `handled=false`; OpenAI fallback |
| G | `operatingHours` ausente | `handled=false`; OpenAI fallback |
| H | Jev timeout/erro | fallback para OpenAI; log de warning; zero crash |
| I | Interrupcao apos inicio da resposta deterministica | resposta invalidada/suprimida; `isGenerationActive=false` |
| J | Verificacao de resposta dupla | exatamente 1 fonte por turno em `transport.speak` |
| K | Resposta deterministica no historico | exatamente 1 `appendTurn(role=assistant)` por turno |
| L | Provider/network calls em testes | TypeSafe=0, OpenAI=0, Twilio=0 |

---

## 17. Analise YAGNI - Coordinator Question

`
CURRENT_REQUIREMENT: Interceptar o fluxo de um unico turno antes de streamTurn(),
  executar handler deterministico, e reutilizar entrega + historico existentes.

EXISTING_OPTION: ConversationOrchestrator.handleUserSpeechFinal() ja e o ponto
  exato de coordenacao. Aceita injecao de dependencia via constructor.

MINIMAL_OPTION: Uma funcao auxiliar privada tryDeterministicRoute() dentro do
  orchestrator (ou uma classe coesa injetada com interface minima).

NEW_COORDINATOR_REQUIRED = NO
`

Se o arquivo `conversation-orchestrator.ts` (177 linhas atualmente) ultrapassar 180 linhas com o wiring, a funcao pode ser extraida para `deterministic-turn-router.ts` (modulo coeso, nao framework generico).

**Proibicoes anti-overengineering mantidas**: Sem DeterministicTurnCoordinator generico, GuardedRoutingService, RoutingEngine com plugins, DI container novo.

---

## 18. Impacto de Tamanho de Arquivo (File Size / Complexity Forecast)

| Arquivo | Linhas Atuais | Delta Esperado | Linhas Previstas | Acao |
|---|---|---|---|---|
| `conversation-orchestrator.ts` | 177 | +15 a +30 | ~190 a ~207 | Extracao parcial se >180 |
| `assistant-stream-coordinator.ts` | 151 | +10 a +20 | ~160 a ~170 | Dentro do limite |
| `frozen-policy-interpreter.ts` | 0 (novo) | +40 a +60 | ~40 a ~60 | Modulo novo obrigatorio |
| `deterministic-turn-router.ts` | 0 (condicional) | +40 a +60 | ~40 a ~60 | Somente se orchestrator >180 |

`
EXPECTED_ORCHESTRATOR_DELTA_LINES = 15 a 30 (sem extracao) / 5 a 10 (com extracao)
EXPECTED_NEW_PRODUCTION_FILES = 1 obrigatorio (frozen-policy-interpreter.ts) + 1 condicional
EXPECTED_NEW_TEST_FILES = 2 (frozen-policy-interpreter.test.ts + integration test)
`

---

## 19. Pre-Requisitos para ACTIVE_GUARDED (Implementation Prerequisites)

| Pre-Requisito | Status | Observacao |
|---|---|---|
| `KNOWN_DETERMINISTIC_HANDLERS >= 1` | **MET** - handler `agent.operating_hours` IMPLEMENTED/TESTED LOCALLY | PR #50 |
| `CAPABILITY_RESOLUTION` | **MET** - matcher local estreito IMPLEMENTED/TESTED LOCALLY | PR #50 |
| `RUNTIME_FROZEN_POLICY_INTERPRETER` | **NOT IMPLEMENTED** | Pre-requisito bloqueante |
| `SECURITY_RUNTIME_ACTION` | **NOT IMPLEMENTED** | Pre-requisito bloqueante |
| `DETERMINISTIC_RESPONSE_DELIVERY` (wiring) | **NOT WIRED** | Proximo implementation slice |
| `DETERMINISTIC_HISTORY_PERSISTENCE` (wiring) | **NOT WIRED** | Junto com delivery |
| `INTEGRATION_TESTS_PASS` (casos A-L) | **NOT IMPLEMENTED** | Necessario antes de ACTIVE_GUARDED |
| `PRODUCTION_RUNTIME_WIRING` | `NO` | Proibido ate testes de integracao passarem |
| `CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE` | `NOT CLEARED` | Gate externo |

---

## 20. Nao-Objetivos Explícitos (Explicit Non-Goals)

1. Nenhuma alteracao funcional a `ConversationOrchestrator`, `AssistantStreamCoordinator` ou qualquer modulo de runtime neste prompt.
2. Nenhum segundo handler deterministico criado ou projetado.
3. Nenhuma ativacao de `ACTIVE_GUARDED` em qualquer ambiente.
4. Nenhuma chamada a TypeSafe, OpenAI ou Twilio neste prompt (TypeSafe=0, OpenAI=0, Twilio=0).
5. Nenhum carregamento de `.env` ou conexao a banco de dados.
6. Nenhuma alteracao nos thresholds ou arquivos da Frozen Policy.
7. Nenhuma reutilizacao do locked holdout de pesquisa.
8. Nenhum trafego de clientes - CUSTOMER_TRAFFIC = PROHIBITED.
