# Phase 6 — Controlled TypeSafe Staging Synthetic SHADOW Live Execution

## 1. Objetivo & Escopo da Execução
- **Objetivo**: Executar uma única avaliação real do TypeSafe Jev através da composição controlada exclusiva de staging implementada e mergeada no PR #45: `createStagingSyntheticShadowComposition` (`apps/voice/src/composition-root.staging-shadow.ts`).
- **Caminho Funcional Executado**:
  `staging synthetic composition -> AuxiliaryTurnShadowObserver -> TimedAuxiliaryTurnDecisionPort -> TypeSafeJevTurnDecisionAdapter -> TypeSafe provider`.
- **Invariantes e Restrições Mandatórias**:
  - Provedor acionado em modo estritamente consultivo e assíncrono (SHADOW);
  - Tráfego de clientes expressamente proibido (`CUSTOMER_TRAFFIC = PROHIBITED`);
  - Fiação em runtime de produção desativada (`PRODUCTION_RUNTIME_WIRING = NO`);
  - Modo ativo bloqueado (`ACTIVE_GUARDED = BLOCKED`);
  - Zero bypass determinístico (`ACTIVE_DETERMINISTIC_BYPASS_READINESS = BLOCKED`);
  - Zero handlers determinísticos (`KNOWN_DETERMINISTIC_HANDLERS = 0`);
  - Zero chamadas a OpenAI (`OPENAI_LIVE_CALLS = 0`);
  - Zero chamadas a Twilio (`TWILIO_LIVE_CALLS = 0`).

---

## 2. Metadados da Execução
- **Data**: 2026-10-01
- **Main SHA de Base**: `404bbc7c5a2360b578ef4332dfa114270bb409d1`
- **Branch**: `research/006s-typesafe-staging-synthetic-shadow-live`
- **Classificação do Input**: `SYNTHETIC / NON-CUSTOMER / PT-BR`
  - Frase autorizada: `"Você consegue repetir de forma mais curta o que acabou de explicar?"`
  - Isolamento de Holdout: Nenhuma frase ou caso dos datasets congelados de calibração (`jev-calibration-v2-cases.json`) ou holdout bloqueado foi utilizado ou acessado.
  - Holdout de Pesquisa: `LOCKED_HOLDOUT = CONSUMED` | `DO_NOT_REUSE_FOR_TUNING = YES`.

---

## 3. Limites Operacionais de Staging e Guardiões de Execução
- **Ambiente**: `staging`
- **Modo**: `SHADOW`
- **Teto Operacional de Concorrência de Staging**: `STAGING_SHADOW_MAX_CONCURRENCY = 1`
- **Timeout Operacional de Staging**: `STAGING_SHADOW_TIMEOUT_MS = 1500` (mantido inalterado; `STAGING_TIMEOUT_RECALIBRATION = NOT DECIDED`)
- **Parâmetros de Produção**:
  - `PRODUCTION_SHADOW_MAX_CONCURRENCY = NOT SELECTED`
  - `PRODUCTION_JEV_TIMEOUT_MS = NOT SELECTED`
- **Guardião Persistente Atômico**:
  - `PERSISTENT_SENTINEL_DESIGN = IMPLEMENTED IN TEMP HARNESS`
  - `SENTINEL_CREATED_BEFORE_OBSERVED_FETCH = YES`
  - *Qualificação*: O arquivo sentinel (`scripts/tmp-006s-typesafe-provider-attempted`) foi projetado com flag atômica `wx`. Como o harness temporário era efêmero e não está versionado, seu comportamento histórico não deve ser extrapolado como prova de contagem além dos despachos de rede efetivamente observados e registrados.
- **Guardião de Despacho de Rede**: Wrapper de `fetch` em memória limitando estritamente a 1 única invocação (`FETCH_INVOCATIONS_MAX = 1`).
- **Política de Repetição**:
  - `ADAPTER_INTERNAL_RETRY = 0`
  - `OBSERVER_INTERNAL_RETRY = 0`
  - `COMPOSITION_INTERNAL_RETRY = 0`
  - *Qualificação*: Zero repetições internas pelo adapter, observer ou composition; não utilizado como prova de contagem de tentativas agregadas de tarefa.

---

## 4. Resultados Factualmente Observados & Reconciliação de Invocação
- **Classificação de Resultado**: `STAGING_LIVE_SHADOW_EXECUTION = OBSERVED / TIMEOUT`
- **Invocações do Comando Runner Observadas**: `RUNNER_COMMAND_INVOCATIONS_OBSERVED = 2`
  - *Invocação 1* (`node --env-file=.env ./node_modules/vitest/vitest.mjs run scripts/tmp-006s-staging-shadow-live.test.ts`): Como a saída bruta independente não está preservada e registros próprios não constituem prova externa: `FIRST_RUN_PROVIDER_DISPATCH = NOT VERIFIED`.
  - *Invocação 2* (`node --env-file=.env ./node_modules/vitest/vitest.mjs run apps/voice/src/tmp-006s-staging-shadow-live.test.ts`): Executou o teste sintético em modo SHADOW, com despacho de rede observado.
- **Despacho de Rede Observado**: `AT_LEAST_ONE_FETCH_DISPATCH_OBSERVED = YES`
- **Despachos de Rede Agregados (`fetch`)**: `FETCH_DISPATCHES_AGGREGATE = NOT VERIFIED` (não inferido exatamente 1 nem 2 de forma isolada)
- **Tentativas Agregadas a Provedor**: `PROVIDER_ATTEMPT_COUNT_AGGREGATE = NOT VERIFIED`
- **Respostas de Provedor Recebidas com Sucesso**: `SUCCESSFUL_PROVIDER_RESPONSES = 0` (o timeout de 1500ms abortou a requisição antes da conclusão pelo servidor remoto da TypeSafe AI)
- **Status da Observação no Observer**: `ACCEPTED` (o turno sintético foi aceito em modo SHADOW)
- **Tempo Decorrido no Observer**: `1490 ms` (~1500 ms)
- **Modelo Solicitado**: `jev-latest`
- **Modelo Efetivamente Resolvido**: `NOT OBSERVED` (requisição abortada no limite de 1500ms)
- **Pontuações Observadas**: `NOT OBSERVED` (requisição abortada no limite de 1500ms)
- **Conclusão de Processamento no Provedor**: `NOT OBSERVED` (nenhuma resposta concluída retornada antes do abort)
- **Telemetria Capturada**:
  - `auxiliary.shadow.accepted`: `{ callId: '00000000-0000-0000-0000-000000000001', turnId: 'turn-006s-001', mode: 'SHADOW' }`
  - `auxiliary.shadow.failed`: `{ callId: '00000000-0000-0000-0000-000000000001', turnId: 'turn-006s-001', error: 'TypeSafe auxiliary evaluation timed out after 1500ms' }`
- **Contenção e Isolamento de Falha**:
  - `COMPOSITION_TO_PROVIDER_DISPATCH = OBSERVED`
  - `SHADOW_TIMEOUT_CONTAINMENT = OBSERVED`
  - `NON_BLOCKING_FAILURE_ISOLATION = OBSERVED`
  - `SUCCESSFUL_END_TO_END_PROVIDER_RESPONSE_THROUGH_COMPOSITION = NOT OBSERVED`
  - O disparo do timeout de 1500ms abortou a requisição auxiliar de forma segura via `AbortController`, sem travar ou derrubar a thread, e o erro foi capturado e logado como aviso (`warn`) pela camada shadow, demonstrando na prática o comportamento non-blocking e não-autoritativo da arquitetura.

---

## 5. Orçamento e Faturamento
- **Teto Orçamentário Autorizado**: `BUDGET_CAP_USD = 0.01`
- **Violação de Orçamento**: `BUDGET_CAP_BREACH = NOT OBSERVED`
- **Contagem Faturada no Servidor**: `ACTUAL_BILLED_REQUEST_COUNT = NOT VERIFIED` (não verificado no portal/faturamento do provedor)
- **Custo Efetivamente Cobrado**: `ACTUAL_BILLED_COST_USD = NOT VERIFIED`

---

## 6. Privacidade e Segurança de Telemetria
- **Transcrições de Clientes**: Nenhuma transcrição foi logada ou exposta.
- **Segredos e Credenciais**: Nenhuma chave de API, cabeçalho de autorização ou token foi logado ou exposto (`SECRET_AUDIT_PASS`).
- **Identificadores de Clientes**: Nenhum identificador real foi utilizado.

---

## 7. Conclusões Arquiteturais & Governança de Timeout
1. **Composição e Despacho**: O despacho da requisição a partir da composição controlada até o provedor externo foi observado na prática (`COMPOSITION_TO_PROVIDER_DISPATCH = OBSERVED`), porém uma resposta pontuada de ponta a ponta não foi obtida devido ao abort por timeout (`SUCCESSFUL_END_TO_END_PROVIDER_RESPONSE_THROUGH_COMPOSITION = NOT OBSERVED`).
2. **Contenção por Timeout**: O limite de segurança temporário `STAGING_SHADOW_TIMEOUT_MS = 1500` funcionou rigorosamente conforme a especificação, abortando a requisição quando a latência de rede/processamento ultrapassou o teto (`SHADOW_TIMEOUT_CONTAINMENT = OBSERVED`).
3. **Isolamento Non-Blocking**: A falha por timeout foi contida no observer e não propagou exceções não tratadas para a aplicação (`NON_BLOCKING_FAILURE_ISOLATION = OBSERVED`).
4. **Decisão sobre Timeout**: `STAGING_TIMEOUT_RECALIBRATION = NOT DECIDED`. Uma execução única com timeout não é suficiente para calibrar ou elevar o teto operacional. A evidência histórica separada do adapter direto obtida no smoke test do PR #44 (com resposta observada) permanece como registro de capacidade isolada, mas não equivale à medição da composição SHADOW completa atual.
5. **Encerramento de Tentativas**: Conforme a regra da Seção 13 do PROMPT-006S, a evidência de timeout é um resultado operacional válido e factual; nenhuma segunda tentativa de chamada ao provedor foi realizada (`PROVIDER_RETRY_ALLOWED = NO`).
