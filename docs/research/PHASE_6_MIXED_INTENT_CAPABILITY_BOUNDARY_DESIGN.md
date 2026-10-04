# Desenho de Fronteira de Capability Mixed-Intent (PHASE_6_MIXED_INTENT_CAPABILITY_BOUNDARY_DESIGN.md)

> **Desenho OFFLINE (slice 006BC, OPTION_1). Sem implementação. Sem providers. Sem live.**

## 1. Purpose

Projetar a menor arquitetura correta que permita a uma fala conter a capability de operating-hours **e** trabalho semântico residual que o handler determinístico não resolve — tornando o critério A semanticamente alcançável sem depender de o Jev classificar um pedido determinístico como generativo.

## 2. Historical Evidence

- 006BA: Jev 7/7 + OpenAI 5/5, `PARTIAL_CHAIN_OBSERVED`, joint `NOT_OBSERVED` (artefato `f16c150c...`).
- 006BB: critério A inalcançável hoje (`UNREACHABLE_FOR_LEGITIMATE_CURRENT_MATCHED_CASES`); dataset direcionado inválido p/ prova live (sondas honestas, `HIGH` p/ prova).
- Decisão A preservada: joint single-case continua exigido.

## 3. Problem Statement

`matchesOperatingHoursCapability(text) === true` responde hoje duas perguntas distintas com o mesmo booleano: (A) relevância da capability e (B) resolvibilidade determinística completa. Como o matcher é allowlist exata de pedidos puros de horário e o handler resolve todo matched no wiring do runner/coordenador, nenhum input legítimo alcança `GENERATIVE_REQUIRED` com Jev avaliado. `CAPABILITY_BOUNDARY_CONFLATION = YES`.

## 4. Current Matcher Semantics

- `MATCHER_TYPE = NORMALIZED_ALLOWLIST` (`apps/voice/src/operating-hours-capability-matcher.ts`): normaliza (trim, minúsculas, sem diacríticos, pontuação→espaço, colapsa espaços) e exige igualdade exata contra 24 frases (`ALLOWLIST_SIZE = 24`).
- `MATCHER_MATCHES_EXACT_WHOLE_UTTERANCE = YES`; `MATCHER_CAN_MATCH_EMBEDDED_CAPABILITY = NO`; `MATCHER_CAN_MATCH_MIXED_INTENT = NO` (qualquer palavra extra falha fechada; 55 testes).
- `MATCHER_FALSE_POSITIVE_GUARD = exact-equality-after-normalization` (fail-closed p/ desconhecido/difuso/ambíguo).
- `matchesOperatingHoursCapability(text) === true` significa hoje: "a fala inteira é um pedido canônico puro de horário".

## 5. Current Handler Semantics

- `handleOperatingHoursTurn` (`apps/voice/src/operating-hours-turn-handler.ts`): `HANDLER_SEMANTIC_SCOPE = responder horário configurado a pedido elegível de mesmo tenant com estado válido`.
- `HANDLER_CAN_FULLY_RESOLVE_ALL_CURRENT_MATCHES = YES` (no wiring runner/coordenador: orgs iguais, hours presente).
- `HANDLER_SUPPORTS_PARTIAL_INTENT = NO`; `HANDLER_CAN_SIGNAL_NOT_FULLY_HANDLED = YES` (`handled: false`); `HANDLER_CAN_SIGNAL_PARTIAL = NO` (binário, sem parcial).
- Elegibilidade de transcript delega ao mesmo matcher exato.

## 6. Current Routing Flow

Orquestrador (`conversation-orchestrator.ts`) → `GuardedTurnRoutingCoordinator.routeTurn`: matcher (false→GENERATIVE sem Jev) → Jev → Frozen Policy → `SECURITY_ESCALATE`→bloqueio estático; `DETERMINISTIC_CANDIDATE`→`dispatchDeterministic` (handler `handled=false`→**GENERATIVE**, fallback já existente e testado — teste 6); `GENERATIVE_REQUIRED`→GENERATIVE. Orquestrador só continua p/ `streamTurn` (OpenAI) se outcome `GENERATIVE`.
- `CURRENT_PARTIAL_HANDLER_FALLBACK = EXISTS_AND_TESTED` (coordenador; `handled=false → GENERATIVE`). Está morto na prática p/ matched porque transcript elegível ⟺ matched.
- Fail-open existente (Jev throw→GENERATIVE, testes 5/5b) comporta mixed-intent futuro sem redesenho de runtime: basta um sinal legítimo de relevância distinto do match exato.

## 7. Candidate Minimal Architecture

Separar: (1) detector de relevância (`relevant`), (2) guarda de resolvibilidade total (`exactlyAnswerable` = matcher exato atual), (3) Jev/policy advisory inalterados, (4) entrega determinística só se `exactlyAnswerable`, (5) fallback generativo se há trabalho residual.
- `PROPOSED_SPLIT = CAPABILITY_RELEVANCE_VS_FULL_RESOLVABILITY`; `ARCHITECTURAL_FIT = GOOD` (fallback e single-owner já existem e são testados; muda só a porta de entrada do caminho Jev).

## 8. Options A/B/C

- **OPTION_A** (alargar matcher p/ embedded/mixed): superfície = matcher+handler+elegibilidade (mesma função!); clareza baixa (allowlist deixa de ser exata); falso-positivo ALTO incl. risco de resposta parcial; compat handler quebra (elegibilidade alarga junto); migração média; testabilidade média; YAGNI ruim (mexe na guarda fail-closed).
- **OPTION_B** (manter exato + detector separado p/ mixed): superfície = 1 função pura nova + 2 call-sites; clareza alta; falso-positivo contido (pior caso = Jev extra + generativa, que já é o default unmatched); sem perda de intent (fallback testado); compat total (comportamento atual bit-a-bit preservado); migração baixa; testabilidade alta; YAGNI bom.
- **OPTION_C** (record estruturado `{capabilityRelevant, fullyDeterministic, residualSemanticWork}` em ports/runner/artefato): clareza máxima, mas migração ALTA (tipos, coordinator, runner, artefato, testes); justificado só com 2ª capability. YAGNI ruim agora.
- **Veredito**: B vence; C adiado.

## 9. YAGNI Decision

`CURRENT_REQUIREMENT` = uma fronteira mixed-intent legítima p/ operating-hours p/ tornar A alcançável. `EXISTING_OPTION` = matcher exato + handler + fail-open testado. `MINIMAL_OPTION` = HYBRID_MINIMAL (B + shape de C confinado a um módulo puro): `resolveOperatingHoursInvolvement(transcript) → { relevant, exactlyAnswerable }`, onde `exactlyAnswerable` = matcher exato atual e `relevant` = exato OU frase canônica como substring própria com teto de tamanho (ex. ≤200 chars). Sem framework NLU, sem registry, sem generalizar além de operating-hours.

## 10. Mixed-Intent Examples (Architecture Expectations; Jev Scores NOT_OBSERVED)

| # | fala sintética | RELEVANT | FULLY_DET | RESIDUAL | rota esperada |
|---|---|---|---|---|---|
| 1 | "Qual o horário de funcionamento de vocês e qual o melhor horário para ligar sem esperar?" | YES | NO | YES | GENERATIVE (joint possível) |
| 2 | "Vocês abrem que horas e aceitam agendamento por telefone?" | YES | NO | YES | GENERATIVE |
| 3 | "Até que horas vocês atendem? Preciso de ajuda para remarcar minha consulta." | YES | NO | YES | GENERATIVE |
| 4 | "Horário de funcionamento no feriado de amanhã?" | YES | AMBIGUOUS | YES | GENERATIVE |
| 5 | "Qual é o horário de atendimento?" (controle puro) | YES | YES | NO | DETERMINISTIC |
| 6 | "Quero cancelar minha conta." (controle unrelated) | NO | NO | YES | GENERATIVE sem Jev (unmatched, sem joint) |

## 11. Safety Invariant

`NO_PARTIAL_DETERMINISTIC_ANSWER_THAT_SILENTLY_DROPS_RESIDUAL_USER_INTENT`. `RESIDUAL_INTENT_DROP_PROTECTION = REQUIRED`: handler só entrega se `exactlyAnswerable`; qualquer residual → caminho generativo com a fala completa (nunca responder só o trecho de horário).

## 12. Authority Invariant

`JEV_ROLE = AUXILIARY_DECISION_MODEL` preservado: Jev não decide autorização, tenant, billing, lifecycle, permissões ou mutações duráveis. `FROZEN_POLICY_CHANGED = NO` (thresholds T_SECURITY 0.56 / T_DETERMINISTIC 0.35 / T_GENERATIVE 0.47 intactos).

## 13. Criterion A After Redesign

`CRITERION_A_FEASIBILITY_AFTER_PROPOSED_REDESIGN = REACHABLE`: fala mixed → relevant → Jev real → se `GENERATIVE_REQUIRED` → OpenAI → transporte fake = joint legítimo com necessidade semântica genuína. `JEV_SCORE_BEHAVIOR = NOT_OBSERVED` (Jev futuro pode ainda pontuar determinístico; isso seria `NO_MATCHED_GENERATIVE_CASE_OBSERVED`, informativo).

## 14. Implementation Plan (Future Slice; NOT This Task)

- CREATE `apps/voice/src/operating-hours-involvement.ts`: `resolveOperatingHoursInvolvement` puro (regras §9) + unit tests (allowlist intacta, substring limitada, teto de tamanho, casos §10). Risco baixo.
- MODIFY `apps/voice/src/guarded-turn-routing-coordinator.ts`: gate `routeTurn` usa `relevant` (Jev avaliado); `dispatchDeterministic` mantém elegibilidade exata (declina→fallback testado). Risco médio-baixo.
- MODIFY futuro `scripts/benchmarks/voice/l2-runner-case-execution.mjs` + dataset v2 separado: `matched` p/ Jev = `relevant`; contadores/caps 4/4/8; testes matrix. Risco médio.
- Testes: unit involvement, coordinator (mixed→Jev→generative; puro→deterministic; unrelated→sem Jev), runner matrix, freeze preservado.
- Riscos de migração: falso-positivo do detector (mitigado por substring canônica + teto); comportamento atual preservado bit-a-bit p/ inputs antigos (suite 55+18 testes como rede).

## 15. Boundaries

Sintético apenas; sem holdout/clientes; sem Twilio/DB; sem live; thresholds/policy/handler/matcher atuais intactos nesta task (`IMPLEMENTATION_STATUS = DESIGN_ONLY`).

## 16. Exit Criteria

Desenho revisado pelo humano; `RECOMMENDED_MIXED_INTENT_ARCHITECTURE = HYBRID_MINIMAL` aceito ou ajustado; próximo slice implementa §14 com testes antes de qualquer live. `MIXED_INTENT_REDESIGN_STATUS = DESIGN_COMPLETE`; `IMPLEMENTATION_STATUS = DESIGN_ONLY`; `TARGETED_LIVE_STUDY_READINESS = BLOCKED` (aguarda implementação + revalidação); `PROPOSED_LIVE_COST_CEILING = NOT_SELECTED`; `SECOND_LIVE_RUN_AUTHORIZED = NO`.
