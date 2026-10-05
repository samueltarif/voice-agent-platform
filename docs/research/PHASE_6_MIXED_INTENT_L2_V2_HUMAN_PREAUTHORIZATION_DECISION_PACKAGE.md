# Pacote de Decisão de Pré-Autorização Humana — Estudo Direcionado Mixed-Intent L2 v2 (Real-Provider Sintético)

> **THIS DOCUMENT DOES NOT AUTHORIZE LIVE EXECUTION.**
> Este documento é um pacote de decisão. Nenhuma execução live está autorizada por ele.
> Nenhuma chamada real foi executada para produzi-lo. Nenhuma opção abaixo está pré-selecionada.

## 1. Decision Package Identity

- **DECISION_PACKAGE_STATUS**: `HUMAN_DECISION_COMPLETED_AUTHORIZED_NOT_EXECUTED`
- **STUDY**: `L2 Mixed-Intent v2 Jev + OpenAI Synthetic Joint Chain` (Slice 006BF, `MERGED_COMPLETE` via PR #85 + reconciliação PR #86)
- **DECISION_PACKAGE_BASE_MAIN**: `c7d8e09aab5c46394a3bd8bf95ecb6d1f7aea3f3`
- **HUMAN_V2_LIVE_AUTHORIZATION**: `AUTHORIZED_ONE_TARGETED_V2_SYNTHETIC_STUDY` (decidido pelo operador em 2026-10-05; 1 execução; `AUTHORIZATION_CONSUMED = NO`)
- **LIVE_AUTHORIZATION_AVAILABLE**: `YES_FOR_SINGLE_AUTHORIZED_STUDY_ONLY`
- **CURRENT_L2_EXECUTION**: `AUTHORIZED_NOT_EXECUTED`
- **V2_OPERATOR_COST_CEILING_USD**: `0.50` (`AUTHORIZED_OPERATOR_COST_CEILING_USD = 0.50`; `GOVERNANCE_CEILING_NOT_HARD_PROVIDER_BILLING_BOUND`)
- **AUTHORIZATION_SCOPE_DECISION**: `AUTHORIZED_ONE_TARGETED_V2_SYNTHETIC_STUDY`
- **CURRENT_V2_TYPESAFE_PRICING_DECISION**: `ACCEPT_ACCOUNT_BILLING_EVIDENCE_FOR_SINGLE_V2_TARGETED_STUDY`
- **CURRENT_V2_TOKEN_BUDGET_DECISION**: `ACCEPT_CURRENT_RUNTIME_INPUT_LIMITATION_FOR_SINGLE_V2_STUDY`
- **AUTHORIZED_RUN_COUNT**: `1`
- **AUTHORIZED_V2_LIVE_EXECUTABLE_FREEZE_SHA256**: `500d922caf5409d85644e879443a14fbd5264f0bd9a1c26792da13afe1b64301` (3 módulos, método 1.0.0; slice 006BG)

## 2. Current Technical Readiness

- **V2_TARGETED_LIVE_STUDY_TECHNICAL_READINESS**: `READY_FOR_HUMAN_AUTHORIZATION_REVIEW`
- **MORE_OFFLINE_WORK_REQUIRED_BEFORE_V2_LIVE_AUTH_REVIEW**: `NO`
- **V2_IMPLEMENTATION_STATUS / V2_DATASET_STATUS / V2_RUNNER_STATUS**: `IMPLEMENTED_TESTED_OFFLINE`
- **V2_EXECUTABLE_FREEZE_STATUS**: `FROZEN_REPRODUCIBLY` (método 1.0.0, 9 módulos)
- **CRITERION_A_V2_OFFLINE_PATH_VALIDATION**: `PASS` (matriz A–G, 22/22 testes focados; gate canônico exit 0: 120 arquivos / 815 testes passed)
- **Restrição arquitetural conhecida (resolvida na slice 006BG)**: o runner v2 offline recusava incondicionalmente qualquer caminho não-offline (`FATAL_LIVE_NOT_AUTHORIZED`, default offline). O caminho live autorizado foi implementado como camada fina separada (`run-jev-openai-l2-mixed-intent-v2-live.mjs` + pré-condições autorizadas + freeze próprio de 3 módulos) reutilizando o núcleo semântico v2 congelado, sem alterá-lo. A autorização registrada acima continua `AUTHORIZED_NOT_EXECUTED`: nenhum comando live foi invocado.

## 3. What Has Been Proven

- Fronteira mixed-intent legítima (`capabilityRelevant=true` + `exactlyAnswerable=false`) sem redefinir `matcherMatched` (`EXACT_WHOLE_UTTERANCE_MATCHER`).
- Predicado Criterion A v2 discriminativo (OPTION_A: só `GENERATIVE_REQUIRED` direto conta).
- Exclusão de fallback determinístico e de `SECURITY_ESCALATE` como PASS.
- Caps 4/4/8/1/0 com enforcement antes do dispatch e fail-closed.
- Artefato sem transcripts, sem raw scores, sem credenciais.
- Freeze reprodutível; integridade histórica v1 intacta.

## 4. What Has NOT Been Proven

- **JEV_SCORE_BEHAVIOR**: `NOT_OBSERVED` — comportamento real do Jev (`jev-1.13.0`) nos 4 casos v2 é desconhecido.
- **REAL_PROVIDER_VALIDATION**: `NOT_EXECUTED` — nenhuma chamada real no estudo v2.
- Distribuição real de policy (`GENERATIVE_REQUIRED` vs determinístico-leaning) — desconhecida; é exatamente o que o estudo live observaria.
- Custo faturado real, latência real, telefonia real, produção: nada provado.

## 5. Frozen Study Identity

- **Dataset**: `scripts/benchmarks/voice/jev-openai-l2-joint-chain-mixed-intent-v2-cases.json`, v1.0.0, 4 casos, SHA `ade86008b360b90754e2ac95a560d381e7adc655ecb20d09f2a28077faf9c690`
- **Runner**: `scripts/benchmarks/voice/run-jev-openai-l2-mixed-intent-v2.mjs` (OPTION_B), agregado executável `6fdc0827dd4dff4dab49f2c8f5a4e82d3024614680ea23106531c8a954ef1f2e` (9 módulos)
- Qualquer divergência de hash aborta (fail-closed); o estudo autorizado deve usar exatamente esta identidade congelada.

## 6. Provider / Model Scope

- **TypeSafe**: `jev-1.13.0` (exact match via `expectedProviderModel`; mismatch aborta)
- **OpenAI**: modelo de conversação vigente por ADR-018/config (`gpt-6-astra`; `V2_DEFAULT_OPENAI_MODEL`)
- **Harness timeout**: 5000 ms por turno (research harness; timeout classifica como falha técnica, nunca como PASS)
- **Output cap OpenAI**: `maxCompletionTokens: 500` (runtime-enforced)
- **Caps**: TypeSafe 4, OpenAI 4, total 8, concorrência 1, retries 0

## 7. TypeSafe Pricing Decision

Fatos:

- **TYPESAFE_PRICE_STATUS**: `NOT_VERIFIED` (sem tarifa oficial pública/contratual)
- **TYPESAFE_PRICING_EVIDENCE**: `ACCOUNT_BILLING_EMPIRICALLY_VERIFIED` (~$41.92/Btok input observado; hipótese conservadora de planejamento $42.00/Btok)
- **OUTPUT_RATE**: `NOT_VERIFIED`
- **HARD_PROVIDER_BILLING_BOUND**: `NOT_PROVEN`

Alternativas (não escolher aqui):

- **DECISION TS-1A** (`ACCEPT_ACCOUNT_BILLING_EVIDENCE_FOR_SINGLE_V2_TARGETED_STUDY`): permite $42/B input como taxa conservadora observada em conta, somente para um estudo autorizado específico; NÃO afirma preço contratual/público; incerteza de output permanece reconhecida.
- **DECISION TS-1B** (`REQUIRE_EXPLICIT_VENDOR_CONFIRMATION_BEFORE_V2_STUDY`): sem autorização live v2 até existir evidência tarifária explícita do provedor.

**CURRENT_V2_TYPESAFE_PRICING_DECISION**: `ACCEPT_ACCOUNT_BILLING_EVIDENCE_FOR_SINGLE_V2_TARGETED_STUDY` (decidido pelo operador em 2026-10-05)

## 8. Token / Input Budget Decision

Fatos do runtime v2 (verificado no código):

- **CHARACTER_CAP**: `NONE` imposto no caminho v2 (módulo de orçamento por caracteres existe para v1: 1000 chars TypeSafe / 4000 chars OpenAI; não está ligado no dispatch v2)
- **TOKEN_CAP**: `NONE` (`RUNTIME_ENFORCED_INPUT_TOKEN_CAP = NONE`; sem tokenizer local)
- **OUTPUT_CAP**: `500` tokens (`maxCompletionTokens: 500`, runtime-enforced no adapter OpenAI)
- **REQUEST_CAP**: 4/4/8 (runtime-enforced antes do dispatch)
- Mitigação factual: dataset congelado com transcrições sintéticas curtas (todas bem abaixo de qualquer limite prático), de modo que o risco volumétrico é limitado mas formalmente sem bound rígido de tokens.

Alternativas (não escolher aqui):

- **ACCEPT_CURRENT_RUNTIME_INPUT_LIMITATION_FOR_SINGLE_V2_STUDY**
- **REQUIRE_STRICT_TOKEN_CAP_BEFORE_V2_STUDY** (ex.: ligar validação de orçamento por caracteres no caminho v2 na slice autorizada)

**CURRENT_V2_TOKEN_BUDGET_DECISION**: `ACCEPT_CURRENT_RUNTIME_INPUT_LIMITATION_FOR_SINGLE_V2_STUDY` (decidido pelo operador em 2026-10-05; somente este estudo)

## 9. Operator Cost Ceiling Decision

Cenário ilustrativo de planejamento v2 (reproduzido da metodologia histórica: 1000 tokens in Jev, 1500 in + 500 out OpenAI por request; `gpt-6-astra` $10/1M in, $50/1M out; Jev $42/1B in):

- TypeSafe: (4 × 1000 / 1e9) × $42 = **$0.000168 USD**
- OpenAI input: 4 × 1500 × ($10/1e6) = **$0.060000 USD**
- OpenAI output: 4 × 500 × ($50/1e6) = **$0.100000 USD**
- **Total ilustrativo: $0.160168 USD** (`ILLUSTRATIVE_PLANNING_ESTIMATE`; NÃO é hard bound, custo faturado ou teto autorizado; incerteza de output + preço TypeSafe não verificado aplicam-se)

Um teto válido do operador significa: parada de governança explícita, input explícito de comando, uma única execução sintética direcionada — NÃO um máximo contratual de faturamento do provedor.

O teto histórico de $0.96 USD foi consumido por execução histórica única e NÃO se transfere automaticamente.

**V2_OPERATOR_COST_CEILING_USD**: `0.50` (decidido pelo operador em 2026-10-05; governança, não hard bound)

## 10. Authorization Scope Decision

Escopo MÁXIMO de uma futura autorização (se o humano aprovar):

- UMA execução do estudo sintético direcionado v2, dataset congelado exato (4 casos)
- TypeSafe `jev-1.13.0`, OpenAI modelo vigente (ADR/config)
- Caps 4/4/8, concorrência 1, retries 0
- Dados de cliente 0, transcrições 0, holdout sem acesso, Twilio 0, DB produção/staging 0, tráfego de produção 0

**AUTHORIZATION_SCOPE_DECISION**: `AUTHORIZED_ONE_TARGETED_V2_SYNTHETIC_STUDY` (decidido pelo operador em 2026-10-05; `AUTHORIZATION_CONSUMED = NO`)

## 11. Mandatory Stop Conditions

Condições de parada obrigatórias da futura execução autorizada (não executar aqui):

- dataset hash mismatch; freeze mismatch; model identity mismatch onde observável;
- breach de cap TypeSafe/OpenAI/total; retry inesperado; concorrência > 1;
- erro técnico de provider conforme política do runner; ausência de credencial antes do dispatch;
- falha de pré-condição de teto de custo; presença inesperada de dados de cliente;
- tentativa de acesso a holdout; caminho inesperado de telefonia/Twilio;
- caminho inesperado de DB/staging/produção; comando live fora da identidade autorizada.

**V2_STOP_CONDITIONS_PACKAGE**: `READY_FOR_HUMAN_REVIEW`

## 12. Privacy / Legal Scope

- **TARGETED_V2_STUDY_DATA**: `SYNTHETIC_ONLY`; **CUSTOMER_DATA**: `0`; **CUSTOMER_TRANSCRIPTS**: `0`; **HOLDOUT**: `NO_ACCESS`
- **SYNTHETIC_V2_PROVIDER_STUDY_PRIVACY_BLOCKER**: `NO` (gate de DPA de transcrições não se aplica a este estudo sintético específico)
- Preservado: **CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE**: `NOT_CLEARED`; **PRODUCTION_CUSTOMER_TRANSCRIPT_PRIVACY_BLOCKER**: `YES`; **CUSTOMER_TRAFFIC**: `PROHIBITED`. Nenhuma liberação de produção é afirmada.

## 13. Production Exclusions

Mesmo com autorização futura do estudo direcionado:

- **PRODUCTION_RUNTIME_WIRING**: `NO`; **ACTIVE_GUARDED**: `BLOCKED`; **PRODUCTION_VOICE_ROUTING_READINESS**: `BLOCKED`
- **PRODUCTION_JEV_TIMEOUT_MS / PRODUCTION_SHADOW_MAX_CONCURRENCY**: `NOT_SELECTED`
- **REAL_TELEPHONY_VALIDATION**: `NOT_EXECUTED`. O estudo direcionado não autoriza produção.

## 14. Historical Authorization Separation

Decisões históricas consumidas (006BA/006AZ, preservadas como evidência, NÃO reescritas):

- `HUMAN_DECISION_TYPESAFE_EMPIRICAL_EVIDENCE_ACCEPTANCE = ACCEPTED_FOR_SINGLE_L2_RUN`
- `HUMAN_DECISION_TOKEN_CAP_POLICY = ACCEPT_EXISTING_CHARACTER_CAPS_FOR_SINGLE_L2_RUN`
- Teto histórico do operador $0.96 USD (escopo: execução histórica única; autorização `CONSUMED`)

Classificação explícita:

- **HISTORICAL_EMPIRICAL_PRICING_ACCEPTANCE_REUSABLE_FOR_V2**: `NO`
- **HISTORICAL_TOKEN_CAP_ACCEPTANCE_REUSABLE_FOR_V2**: `NO`
- **HISTORICAL_0_96_OPERATOR_CEILING_REUSABLE_FOR_V2**: `NO`

Uma nova decisão humana é obrigatória para o estudo v2. **EMPIRICAL_PRICING_DECISION_SCOPE_CLARITY**: `PASS` (histórico = consumido; corrente = pendente).

## 15. Human Decision Form

> O documento NÃO interpreta checkboxes vazios como autorização. Marcar é ato humano explícito.

A. TYPESAFE PRICING EVIDENCE

[ ] ACCEPT_ACCOUNT_BILLING_EVIDENCE_FOR_SINGLE_V2_TARGETED_STUDY
[ ] REQUIRE_EXPLICIT_VENDOR_CONFIRMATION_BEFORE_V2_STUDY

B. TOKEN / INPUT LIMITATION

[ ] ACCEPT_CURRENT_RUNTIME_INPUT_LIMITATION_FOR_SINGLE_V2_STUDY
[ ] REQUIRE_STRICT_TOKEN_CAP_BEFORE_V2_STUDY

C. OPERATOR COST CEILING

V2_OPERATOR_COST_CEILING_USD:
________________

D. STUDY AUTHORIZATION

[ ] AUTHORIZE_ONE_TARGETED_V2_SYNTHETIC_STUDY
[ ] DO_NOT_AUTHORIZE
[ ] DEFER_DECISION

E. ACKNOWLEDGEMENTS

[ ] I understand the operator ceiling is NOT a hard provider billing bound.
[ ] I understand TypeSafe pricing is not contractually verified.
[ ] I understand real-provider model behavior is not yet observed for v2.
[ ] I understand this does NOT authorize customer traffic or production.
[ ] I understand authorization, if selected, is consumed by one study run.

## 16. Consequences of Each Decision

- **TS-1A + teto + AUTHORIZE**: habilita definir a slice do estudo autorizado (caminho live + teto + adapters reais); risco residual: preço TypeSafe não contratual e output sem bound rígido.
- **TS-1B**: bloqueia qualquer estudo live v2 até evidência tarifária explícita; estudo permanece offline.
- **REQUIRE_STRICT_TOKEN_CAP**: exige ligar validação de orçamento de entrada no caminho v2 antes/depois da autorização (slice autorizada).
- **DO_NOT_AUTHORIZE / DEFER**: estudo v2 permanece offline; nada muda em produção.
- Qualquer autorização é consumida por UMA execução; segunda execução exige nova decisão.

## 17. Next Step After Human Decision

- Se autorizado: definir a slice de implementação/execução do estudo autorizado (numerada só então), implementar caminho live com pré-autorização + teto + stop conditions, executar uma vez, congelar artefato.
- Se não autorizado/adiado: manter estado offline; produção segue bloqueada em sua trilha própria.
- Em nenhum caso este documento autoriza execução.
