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

- `MATCHER_TYPE = NORMALIZED_ALLOWLIST` (`apps/voice/src/operating-hours-capability-matcher.ts`): normaliza (trim, minúsculas, sem diacríticos, pontuação→espaço, colapsa espaços) e exige igualdade exata contra 23 frases (`ALLOWLIST_SIZE = 23`).
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
- **OPTION_B** (manter exato + detector separado p/ mixed): superfície = 1 função pura nova + 2 call-sites; clareza alta; falso-positivo PARCIALMENTE contido — CORREÇÃO de revisão: um `relevant=true` falso-positivo ENTRA no Jev e ALCANÇA `SECURITY_ESCALATE` (recusa estática visível ao usuário em vez de resposta generativa) se o Jev pontuar `security ≥ 0.56`, ou dispara dispatch determinístico que declina com segurança (`handled=false → GENERATIVE`, sem entrega parcial); `FALSE_POSITIVE_MAX_IMPACT` = recusa estática SECURITY no lugar de resposta generativa + 1 chamada Jev desperdiçada (sem billing/mutação; chamada segue ativa); sem perda de intent (fallback testado); compat total p/ inputs atuais; migração baixa; testabilidade alta; YAGNI bom.
- **OPTION_C** (record estruturado `{capabilityRelevant, fullyDeterministic, residualSemanticWork}` em ports/runner/artefato): clareza máxima, mas migração ALTA (tipos, coordinator, runner, artefato, testes); justificado só com 2ª capability. YAGNI ruim agora.
- **Veredito**: B vence; C adiado.

## 9. YAGNI Decision

`CURRENT_REQUIREMENT` = uma fronteira mixed-intent legítima p/ operating-hours p/ tornar A alcançável. `EXISTING_OPTION` = matcher exato + handler + fail-open testado. `MINIMAL_OPTION` = HYBRID_MINIMAL (B + shape de C confinado a um módulo puro): `resolveOperatingHoursInvolvement(transcript) → { relevant, exactlyAnswerable }`, onde `exactlyAnswerable` = matcher exato atual e `relevant` = exato OU frase canônica como span normalizado delimitado (regra §9b). Teto de tamanho de entrada: `PROPOSED_RELEVANCE_INPUT_BOUND_STATUS = BOUND_TO_BE_SELECTED_DURING_IMPLEMENTATION_FROM_EXISTING_RUNTIME_LIMITS` (limites existentes: 1000 chars TypeSafe / 4000 chars OpenAI por request; o exemplo de 200 chars era `ARBITRARY_DESIGN_EXAMPLE`, não requisito). Sem framework NLU, sem registry, sem generalizar além de operating-hours.

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

- CREATE `apps/voice/src/operating-hours-involvement.ts`: `resolveOperatingHoursInvolvement` puro (regras §9/§17: span delimitado, sem substring intra-token, bound da implementação) + unit tests. Risco baixo.
- MODIFY `apps/voice/src/guarded-turn-routing-coordinator.ts`: gate `routeTurn` usa `relevant` (Jev avaliado); `dispatchDeterministic` mantém elegibilidade exata (declina→fallback testado). Risco médio-baixo.
- MODIFY futuro `scripts/benchmarks/voice/l2-runner-case-execution.mjs` + dataset v2 separado: elegibilidade p/ Jev = `relevant` (conceito versionado `capabilityRelevant`/`exactlyAnswerable`); é PROIBIDO redefinir o campo histórico `matcherMatched` (semântica histórica = exact whole-utterance matcher) — se retido, mantém significado exato; `HISTORICAL_MATCHER_MATCHED_SEMANTICS = EXACT_WHOLE_UTTERANCE_MATCHER`; `FUTURE_MATCHER_MATCHED_REDEFINITION_ALLOWED = NO`; contadores/caps 4/4/8; testes matrix. Risco médio.
- Testes futuros obrigatórios: puro exato segue bit-a-bit determinístico; mixed vira relevance-positivo; mixed NÃO é exactlyAnswerable; determinístico-candidate em mixed não emite parcial; `handled=false` preserva fala completa e cai GENERATIVE; unrelated segue relevance-negativo; lookalikes intra-token não qualificam; mixed sensível exercita `SECURITY_ESCALATE` deliberadamente; sem duplicar ownership do Jev; zero providers em testes automatizados.
- Riscos de migração: falso-positivo do detector (span delimitado + bound da implementação + regressão SECURITY deliberada); comportamento atual preservado bit-a-bit p/ inputs antigos (suite 55+18 testes como rede).

## 15. Boundaries

Sintético apenas; sem holdout/clientes; sem Twilio/DB; sem live; thresholds/policy/handler/matcher atuais intactos nesta task (`IMPLEMENTATION_STATUS = DESIGN_ONLY`).

## 16. Exit Criteria

Desenho revisado pelo humano; `RECOMMENDED_MIXED_INTENT_ARCHITECTURE = HYBRID_MINIMAL` aceito ou ajustado; próximo slice implementa §14 com testes antes de qualquer live. `MIXED_INTENT_REDESIGN_STATUS = DESIGN_COMPLETE`; `IMPLEMENTATION_STATUS = DESIGN_ONLY`; `TARGETED_LIVE_STUDY_READINESS = BLOCKED` (aguarda implementação + revalidação); `PROPOSED_LIVE_COST_CEILING = NOT_SELECTED`; `SECOND_LIVE_RUN_AUTHORIZED = NO`.

## 17. False-Positive & Match-Granularity Review (006BC Final)

- `FALSE_POSITIVE_CAN_ENTER_JEV = YES` (gate futuro de relevância precede `evaluateAuxiliary`).
- `FALSE_POSITIVE_CAN_REACH_SECURITY_ESCALATE = YES` (`SECURITY_ESCALATE` depende só dos scores do Jev sobre a fala completa; recusa estática entregue em vez de resposta generativa).
- `FALSE_POSITIVE_CAN_CHANGE_USER_VISIBLE_BEHAVIOR = YES` (recusa SECURITY vs resposta generativa; sem efeitos de billing/mutação; chamada segue ativa).
- `FALSE_POSITIVE_MAX_IMPACT = recusa estática SECURITY no lugar de resposta generativa + 1 chamada Jev` (dispatch determinístico declina sem entrega — sem resposta parcial).
- `MIXED_INTENT_SECURITY_ROUTE_EFFECT = AMBIGUOUS_REQUIRES_FUTURE_IMPLEMENTATION_REVIEW` (escalada sobre residual genuinamente sensível é plausivelmente segura; sobre relevância falso-positiva é mudança não intencional; decidir com regressão deliberada na implementação).
- `RELEVANCE_MATCH_GRANULARITY = NORMALIZED_PHRASE_SPAN_WITH_SEPARATOR_BOUNDARIES`: frase canônica completa e exata → `exactlyAnswerable`; frase canônica como span standalone delimitado (início/fim ou separadores) dentro de fala maior → `relevant`, não exatamente respondível; `ACCIDENTAL_TOKEN_SUBSTRING_ALLOWED = NO` (substring intra-token nunca qualifica); pontuação respeitada pela normalização existente; duplicatas/prefixos/sufixos com residual seguem a regra de span; vocabulário similar sem frase canônica → não relevante; menção negada/meta (`"não perguntei o horário..."`) CASA como relevante por span (limitação documentada) e cai no caminho generativo seguro com fala completa — nunca em resposta determinística parcial.
- `MIXED_INTENT_DETERMINISTIC_PARTIAL_RESPONSE_ALLOWED = NO`; `FULL_ORIGINAL_TRANSCRIPT_PRESERVED_FOR_GENERATIVE_FALLBACK = YES` (`dispatchDeterministic` declina sem entregar; orquestrador/runner usam a fala original completa no fallback).
- `HYBRID_MINIMAL_DESIGN_STATUS = ACCEPTABLE_WITH_CLARIFICATIONS` (recomendação mantida; plano §14 estendido abaixo).

## 18. Adversarial Design Cases (Conceituais Offline; Sem Dataset; Jev NOT_OBSERVED)

| # | fala | RELEVANT | EXACTLY_ANSW | JEV_ELIG | DET_DELIVERY | fallback | nota SECURITY |
|---|---|---|---|---|---|---|---|
| 1 | "Qual é o horário de atendimento?" | YES | YES | YES | YES | DETERMINISTIC | n/a |
| 2 | "...horário... e melhor horário p/ ligar sem esperar?" | YES | NO | YES | NO | GENERATIVE (joint possível) | se residual sensível, escalada é segura |
| 3 | "Quero cancelar minha conta." | NO | NO | NO | NO | GENERATIVE sem Jev | n/a |
| 4 | "Vocês têm estacionamento?" (vocabulário similar, sem frase) | NO | NO | NO | NO | GENERATIVE sem Jev | prova que similaridade ≠ span |
| 5 | "Não perguntei o horário de funcionamento, quero o gerente." | YES (limitação) | NO | YES | NO | GENERATIVE fala completa | cai no seguro por construção |
| 6 | fala de 900 chars com frase de horário no meio | YES | NO | YES | NO | GENERATIVE | bound final na implementação (limites 1000/4000) |
| 7 | "...horário... [conteúdo sensível/inseguro]" | YES | NO | YES | NO | GENERATIVE ou SECURITY | escalada aqui deve ser testada deliberadamente |
| 8 | "Horário?? De funcionamento!!" | YES | YES | YES | YES | DETERMINISTIC (normalização) | pontuação não quebra span |
| 9 | "horarios" / "desorario" (lookalike intra-token) | NO | NO | NO | NO | GENERATIVE sem Jev | `ACCIDENTAL_TOKEN_SUBSTRING_ALLOWED = NO` |
