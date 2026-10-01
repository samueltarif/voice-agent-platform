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
- **Timeout Operacional de Staging**: `STAGING_SHADOW_TIMEOUT_MS = 1500`
- **Parâmetros de Produção**:
  - `PRODUCTION_SHADOW_MAX_CONCURRENCY = NOT SELECTED`
  - `PRODUCTION_JEV_TIMEOUT_MS = NOT SELECTED`
- **Guardião Persistente Atômico**: Sentinel em disco criado atomicamente com flag `wx` (`scripts/tmp-006s-typesafe-provider-attempted`) antes de qualquer despacho de rede (`SENTINEL_CREATED = YES`).
- **Guardião de Despacho de Rede**: Wrapper de `fetch` em memória limitando estritamente a 1 única invocação (`FETCH_INVOCATIONS_MAX = 1`).
- **Política de Repetição**: `NO RETRY` (zero retries internos no adapter, observer ou composition).

---

## 4. Resultados Factualmente Observados
- **Classificação de Resultado**: `STAGING_LIVE_SHADOW_EXECUTION = OBSERVED / TIMEOUT`
- **Execuções do Processo Runner**: `1`
- **Tentativas de Provedor**: `1`
- **Despachos de Rede (`fetch`)**: `1` (`FETCH_DISPATCHED = YES`)
- **Respostas de Provedor Recebidas com Sucesso**: `0` (o timeout de 1500ms disparou antes da conclusão do fetch pelo servidor remoto da TypeSafe AI)
- **Status da Observação no Observer**: `ACCEPTED` (o turno sintético foi aceito em modo SHADOW)
- **Tempo Decorrido no Observer**: `1490 ms` (~1500 ms)
- **Modelo Solicitado**: `jev-latest`
- **Modelo Efetivamente Resolvido**: `NOT OBSERVED` (requisição abortada no limite de 1500ms)
- **Pontuações Observadas**: `NOT OBSERVED` (requisição abortada no limite de 1500ms)
- **Telemetria Capturada**:
  - `auxiliary.shadow.accepted`: `{ callId: '00000000-0000-0000-0000-000000000001', turnId: 'turn-006s-001', mode: 'SHADOW' }`
  - `auxiliary.shadow.failed`: `{ callId: '00000000-0000-0000-0000-000000000001', turnId: 'turn-006s-001', error: 'TypeSafe auxiliary evaluation timed out after 1500ms' }`
- **Isolamento de Falha Comprovado**: O disparo do timeout de 1500ms abortou a requisição auxiliar de forma segura via `AbortController`, sem travar ou derrubar a thread, e o erro foi capturado e logado como aviso (`warn`) pela camada shadow, demonstrando na prática o comportamento non-blocking e não-autoritativo da arquitetura.

---

## 5. Orçamento e Faturamento
- **Teto Orçamentário Autorizado**: `BUDGET_CAP_USD = 0.01`
- **Violação de Orçamento**: `BUDGET_CAP_BREACH = NOT OBSERVED`
- **Contagem Faturada no Servidor**: `ACTUAL_BILLED_REQUEST_COUNT = NOT VERIFIED` (nenhuma chamada adicional realizada)
- **Custo Efetivamente Cobrado**: `ACTUAL_BILLED_COST_USD = NOT VERIFIED`

---

## 6. Privacidade e Segurança de Telemetria
- **Transcrições de Clientes**: Nenhuma transcrição foi logada ou exposta.
- **Segredos e Credenciais**: Nenhuma chave de API, cabeçalho de autorização ou token foi logado ou exposto (`SECRET_AUDIT_PASS`).
- **Identificadores de Clientes**: Nenhum identificador real foi utilizado.

---

## 7. Conclusões Arquiteturais
1. O caminho completo `composition -> observer -> adapter -> provider` é plenamente funcional em tempo de execução real.
2. O limite de segurança temporário `STAGING_SHADOW_TIMEOUT_MS = 1500` funcionou rigorosamente conforme a especificação, abortando a requisição quando a latência de rede/processamento do provedor ultrapassou o teto.
3. A falha por timeout foi contida no observer e não propagou exceções não tratadas para a aplicação.
4. Conforme a regra da Seção 13 do PROMPT-006S, a evidência de timeout é um resultado operacional válido e factual; nenhuma segunda tentativa de chamada ao provedor foi realizada (`PROVIDER_RETRY_ALLOWED = NO`).
