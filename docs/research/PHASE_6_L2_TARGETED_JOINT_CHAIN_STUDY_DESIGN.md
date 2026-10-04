# Desenho do Estudo Direcionado L2 Joint-Chain (PHASE_6_L2_TARGETED_JOINT_CHAIN_STUDY_DESIGN.md)

> **Documento de desenho OFFLINE. Nenhum provider foi chamado. Nenhuma live autorizada ou executada.**

## 1. Purpose

Desenhar um estudo sintético, pequeno e versionado separadamente, capaz de testar o critério oficial humano (decisão A): pelo menos um MESMO caso sintético deve demonstrar `matcherMatched = true → Jev real OK → Frozen Policy = GENERATIVE_REQUIRED → OpenAI real OK → completion em transporte fake/não-telefonia`.

## 2. Historical Context

- L2 v1 (`jev-openai-l2-synthetic-integration-v1-cases.json`, v1.0.1, SHA `bd812341a9...`): 12 casos, 7 matcher-positivos, 5 matcher-negativos.
- Run autorizada 006BA (artefato `docs/research/results/phase-6-l2-real-jev-openai-synthetic-run1.json`, SHA `f16c150cbd...`): Jev 7/7 `jev-1.13.0`, OpenAI 5/5, 12/12 `SUCCESS`, mas os 7 matched resolveram `DETERMINISTIC_RESPONSE` e os 5 OpenAI ocorreram no caminho unmatched.
- Resultado preservado: `L2_RESULT = FAILED`, `L2_EXECUTION = PARTIAL_CHAIN_OBSERVED`, `coreJointChainObserved = false`. Sem reclassificação.

## 3. Human Decision A

- `HUMAN_DECISION_L2_JOINT_CHAIN_INTENT = A_SINGLE_CASE_JEV_POLICY_OPENAI_CHAIN_REQUIRED_FOR_PASS_COMPLETE`.
- `INTERPRETATION_B_STATUS = SECONDARY_PROVIDER_PATH_EVIDENCE_ONLY` (Jev nos positivos E OpenAI nos negativos prova paths separados, não joint).
- Predicado do flag (só caminho matched seta em `l2-runner-case-execution.mjs`): `policy === GENERATIVE_REQUIRED && openAi SUCCESS`.

## 4. Evidence Gap

`EVIDENCE_GAP = SINGLE_CASE_JEV_POLICY_OPENAI_JOINT_CHAIN_NOT_OBSERVED`. Falta um caso matched cujo Jev retorne scores generativos (`det < 0.35` ou `gen > 0.47`, `sec < 0.56`) com OpenAI sucesso no mesmo caso.

## 5. Why Previous Run Produced 7 Deterministic / 5 Unmatched Generative

Os 7 matched são consultas curtas de horário (ex. "Qual é o horário de atendimento?", "Que horas abre?"). O Jev real pontuou todas como determinísticas → policy `DETERMINISTIC_CANDIDATE` → `resolveDeterministicRoute` (orgs iguais + hours configurado no runner) sempre resolve → `DETERMINISTIC_RESPONSE`, OpenAI nunca chamado no matched. Os 5 unmatched pulam o Jev por desenho single-owner e chamam OpenAI direto. Scores exatos do Jev não constam no artefato (sanitizado por desenho); a inferência de policy vem da rota observada.

| caseId | caller | matcher | Jev scores | policy (inferida) | rota | OpenAI |
|---|---|---|---|---|---|---|
| l2-01..03 | horário (deterministic intent) | true | NOT_OBSERVED (deterministic-leaning inferido) | DETERMINISTIC_CANDIDATE | DETERMINISTIC_RESPONSE | NO |
| l2-04..07 | horário (generative-like intent) | true | NOT_OBSERVED (deterministic-leaning inferido) | DETERMINISTIC_CANDIDATE | DETERMINISTIC_RESPONSE | NO |
| l2-08..12 | controles unmatched | false | n/a (Jev não chamado) | n/a | GENERATIVE | YES 5/5 |

Nenhum matched ficou perto de `GENERATIVE_REQUIRED` de forma observável: todos terminaram determinísticos. `WHY_NOT_GENERATIVE_REQUIRED` por caso: Jev real não retornou `gen > 0.47` nem `det < 0.35` (valores exatos não registrados no artefato).

## 6. Frozen Policy Boundary (Unchanged)

`FROZEN_POLICY_CHANGED = NO`. Regras (`apps/voice/src/frozen-policy-interpreter.ts`): `T_SECURITY = 0.56`, `T_DETERMINISTIC = 0.35`, `T_GENERATIVE = 0.47`. `GENERATIVE_REQUIRED` ⟺ `security < 0.56` E (`deterministic < 0.35` OU `generative > 0.47`). Sem mudança de thresholds.

## 7. Targeted Candidate Design (4 Cases)

Arquivo: `scripts/benchmarks/voice/jev-openai-l2-joint-chain-targeted-v1-cases.json` (v1.0.0, SHA `7fc27cf14963a2a7f9a216100d6419838536b5a4f92f1e6fd35dd1aa60ef5142`).

| id | texto sintético | matcher true porque | por que handler NÃO deveria bastar (hipótese) | failure mode sondado | risco de voltar a determinístico |
|---|---|---|---|---|---|
| tc-jc-01 | "Qual é o seu horário de funcionamento?" | membro allowlist (formal possessivo), fora da v1 | formulação complexa pode pontuar generativo no Jev | Jev determinístico de novo | ALTO (handler resolve se policy determinística) |
| tc-jc-02 | "Qual o horário de atendimento de vocês?" | membro allowlist (plural formal), fora da v1 | idem | idem | ALTO |
| tc-jc-03 | "Horário de atendimento" | membro allowlist (nominal curto, espelha l2-04), fora da v1 | elipse pode pontuar generativo | idem | ALTO |
| tc-jc-04 | "Até que horas você atende?" | membro allowlist (singular), fora da v1 | idem | idem | ALTO |

Hipótese de `GENERATIVE_REQUIRED` é **hipótese**: scores do Jev não são observáveis offline (`JEV_CANDIDATE_SCORE_BEHAVIOR = HYPOTHESIS_NOT_OBSERVED`). Se o Jev repetir determinístico, o estudo retorna `NO_MATCHED_GENERATIVE_CASE_OBSERVED` — resultado informativo, não falha de infra.

## 8. TARGETED_EVIDENCE_DESIGN vs TUNING_TO_FORCE_PASS

Casos são interações plausíveis de produto retiradas da allowlist rastreada, não texto sem sentido para forçar thresholds (`DATASET_CREATION_INTENT_GAMING = NO`). Para fins de prova live, porém, vale a revisão da Seção 17: `TARGETED_DATASET_GAMING_RISK_FOR_LIVE_PROOF = HIGH`, pois um PASS dependeria de o Jev classificar pedidos determinísticos como `GENERATIVE_REQUIRED`.

## 9. Matcher Validation

`CANDIDATE_MATCHER_OFFLINE_VALIDATION = PASS` (`l2-targeted-joint-chain-candidates.test.ts`: 4/4 `matchesOperatingHoursCapability = true`, disjuntos da v1, ≤1000 chars, 2/2 testes offline, sem providers/creds/`.env`).

## 10. Deterministic-Handler Analysis

No wiring do runner (`resolveDeterministicRoute`: orgs iguais, `operatingHours` presente, state ausente), o handler resolve **todo** matched se a policy for `DETERMINISTIC_CANDIDATE`. Logo, para os 4 candidatos: `DETERMINISTIC_HANDLER_CAN_FULLY_RESOLVE = YES` (condicional à policy). Não há candidato matched que evite o handler por construção — o joint só ocorre via `GENERATIVE_REQUIRED` do Jev, que é exatamente o critério A. Sem enfraquecer handler/roteamento.

## 11. Study Shape (Design Targets Only)

Por semântica rastreada de execução (`executeCase` → no máximo 1 chamada Jev por matched + no máximo 1 chamada OpenAI por caso com rota `GENERATIVE`; `retries = 0`; sem loops de retry em `l2-runner-provider-dispatch.mjs`), cada um dos 4 casos gera no máximo 1 TypeSafe e 1 OpenAI. Envelope mínimo aplicável (YAGNI):

- `PROPOSED_TARGETED_STUDY_TYPESAFE_CAP = 4`
- `PROPOSED_TARGETED_STUDY_OPENAI_CAP = 4`
- `PROPOSED_TARGETED_STUDY_TOTAL_CAP = 8`
- `PROPOSED_TARGETED_STUDY_CONCURRENCY = 1`
- `PROPOSED_TARGETED_STUDY_RETRIES = 0`
- Alvos de desenho, **não autorização**. (Correção PR #81 review: proposta anterior 6/6/12 removida por headroom injustificado.)

## 12. Success Criteria (Future Study)

PASS sse ≥1 candidato com: `matcherMatched = true`, Jev `SUCCESS` com `jev-1.13.0`, policy `GENERATIVE_REQUIRED`, OpenAI `SUCCESS`, completion observada em transporte fake, 0 erros de provider no caso-chain, 0 mismatch, caps respeitados. Não exigir joint em todos.

## 13. Failure Classifications

`PASS_COMPLETE` | `NO_MATCHED_GENERATIVE_CASE_OBSERVED` | `PROVIDER_FAILURE` | `MODEL_IDENTITY_MISMATCH` | `RUNTIME_FAILURE` | `REQUEST_CAP_VIOLATION` | `AUTH_FAILURE` | `COST_POLICY_BLOCKED` (vocabulário canônico do runner existente).

## 14. Cost Planning (Planning Only)

- `TYPESAFE_PRICE_STATUS = NOT_VERIFIED` (taxa empírica de planejamento $42/Btok, sem valor contratual).
- `OPENAI_PRICE_STATUS = VERIFIED` (projeto: `gpt-6-astra` $10/1M in, $5/1M cached in, $50/1M out).
- Hipótese de planejamento (4 casos, pior caso 4 Jev + 4 OpenAI com 1500in/500out): TypeSafe ≈ $0,000168; OpenAI ≈ $0,16 ($0,06 in + $0,10 out); `TOTAL_PLANNING_ESTIMATE_USD ≈ 0,160168`.
- `HARD_PROVIDER_BILLING_BOUND = NOT_PROVEN`. `PROPOSED_LIVE_COST_CEILING = NOT_SELECTED` (sem autorização; teto só após revisão do desenho).

## 15. Boundaries

Sintético apenas; sem holdout (`HOLDOUT = NO ACCESS`); sem dados/transcritos de cliente; sem Twilio/DB nuvem; dataset v1 e artefato histórico imutáveis; sem reuso de holdout; sem tuning de thresholds.

## 16. Live Authorization Status

`LIVE_AUTHORIZATION_CONSUMED = YES` (006BA). `SECOND_LIVE_RUN_AUTHORIZED = NO`. Este estudo é OFFLINE e **não** autoriza live. Pré-autorização futura exige: revisão deste desenho, dataset versionado, caps, teto explícito e nova autorização humana explícita. Stop conditions futuras: as do runner (`MODEL_IDENTITY_MISMATCH`, `HTTP_AUTH_ERROR`, 3 falhas consecutivas, budget, caps, timeout 5s).

## 17. Semantic Feasibility Review (PR #81 Review)

- **MATCHER_TYPE**: `NORMALIZED_ALLOWLIST` (normaliza diacríticos/caixa/pontuação e exige igualdade exata contra 24 frases puras de horário em `operating-hours-capability-matcher.ts`).
- **MATCHER_CAN_MATCH_MIXED_INTENT**: `NO` (qualquer palavra extra — pedido composto, data, entrega — cai fora do set e falha fechada; provado por código + 55 testes do matcher).
- **MATCHER_MATCHED_UTTERANCE_SEMANTIC_SCOPE**: exclusivamente pedidos de informação de horário de atendimento.
- **Handler reach**: no wiring do runner (`resolveDeterministicRoute`: orgs iguais, `operatingHours` presente, state ausente), `handleOperatingHoursTurn` resolve TODO matched quando a policy é `DETERMINISTIC_CANDIDATE`.
- **Conclusão**: um caso matched legítimo hoje é sempre um pedido puro de horário, que o handler responde por completo. O joint (critério A) só ocorreria se o Jev classificasse um pedido totalmente determinístico como `GENERATIVE_REQUIRED` — hipótese de classificador, não necessidade semântica do produto.
- **Por candidato** (`tc-jc-01..04`): `MATCHER_MATCHED = YES`; `FULLY_DETERMINISTIC_PRODUCT_INTENT = YES`; `LEGITIMATE_NEED_FOR_OPENAI = NO`; `CANDIDATE_JOINT_CHAIN_VALIDITY = INVALID_FOR_PRODUCT_SEMANTIC_PROOF`; scores futuros do Jev `NOT_OBSERVED`.
- **Correção de risco**: a classificação anterior `DATASET_GAMING_RISK = LOW` estava incorreta sob a lente semântica (sem intenção de gaming, mas um PASS live repousaria em variância do classificador sobre pedidos determinísticos). `TARGETED_DATASET_GAMING_RISK = HIGH` para fins de prova live; como sondas exploratórias de paráfrase matched, o dataset permanece honesto e versionado.
- **TARGETED_DATASET_PURPOSE**: `EXPLORATORY_MATCHER_POSITIVE_PARAPHRASE_PROBES`.
- **TARGETED_LIVE_STUDY_READINESS**: `BLOCKED_BY_SEMANTIC_FEASIBILITY`.
- **CRITERION_A_PRODUCT_SEMANTIC_FEASIBILITY**: `UNREACHABLE_FOR_LEGITIMATE_CURRENT_MATCHED_CASES` (caminho futuro: `OPTION_1` redesenho de matcher/capability para mixed-intent legítimo; `OPTION_2` revisão do critério com governança explícita; `OPTION_3` manter A como requisito não satisfeito e encerrar estudo live; nenhuma opção implementada aqui).
