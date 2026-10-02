# Phase 6: TypeSafe L1A Model Identity Smoke Plan

> **Documento**: `docs/research/PHASE_6_TYPESAFE_L1A_MODEL_IDENTITY_SMOKE_PLAN.md`<br />
> **Status**: `DESIGNED / NOT EXECUTED`<br />
> **Data**: 2026-10-02<br />
> **Prompt de Origem**: `PROMPT-006AI-MODEL-IDENTITY-GUARD-AND-L1A-SYNTHETIC-SMOKE-PLAN-001`<br />
> **Fase**: Phase 6 (Voice Model Routing & Jev Evaluation)<br />
> **Classificação**: `SYNTHETIC_SMOKE_PLAN`<br />
> **Invariante Formal**: ZERO chamadas reais a provedores neste slice (TypeSafe = 0, OpenAI = 0, Twilio = 0). ZERO dados de clientes. ZERO execução de tráfego real. `ACTIVE_GUARDED = BLOCKED`.

---

## 1. Executive Summary & Purpose

Este documento define formalmente o plano metodológico para a futura execução do teste de fumaça funcional controlado **L1A (TypeSafe Model Identity Smoke)**.

O objetivo do L1A é estritamente **funcional e de integração de identidade de modelo**:
1. Comprovar que o adapter `TypeSafeJevTurnDecisionAdapter` envia o modelo solicitado com ID versionado (`model: "jev-1.13.0"`) no payload HTTP;
2. Observar factualmente o campo `providerModel` retornado pela API real da TypeSafe em resposta ao request versionado;
3. Validar a execução em runtime do `TypeSafeModelIdentityMismatchError` quando configurado `expectedProviderModel`;
4. Comprovar o parsing e validação da resposta atômica do provedor em condições de rede real sob prompts sintéticos controlados;
5. Validar a semântica de fail-open imediato para o modelo generativo principal quando uma falha ou mismatch ocorre sob geração ativa;
6. Garantir **zero exposição de dados de clientes** (`CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE = NOT CLEARED`).

---

## 2. Non-Goals Explícitos (O que o L1A NÃO é)

1. **NÃO seleciona timeout de produção**: A latência observada no L1A (amostra $N=20$) é telemetria puramente descritiva secundária, sem significância estatística para cauda de produção ($p99/p99.9$).
2. **NÃO seleciona teto de concorrência de produção**: As requisições serão executadas em série controlada ($concurrency = 1$).
3. **NÃO seleciona limiares de circuit breaker**: Sem dados de tráfego volumétrico, nenhum limiar numérico será congelado.
4. **NÃO afere acurácia de pontuação ou calibração**: O teste avalia conformidade de contrato e identidade de modelo, não calibração estatística.
5. **NÃO altera a Frozen Policy**: Os limiares congelados da Frozen Policy V1 (`T_SECURITY = 0.56`, `T_DETERMINISTIC = 0.35`, `T_GENERATIVE = 0.47`) permanecem intactos.
6. **NÃO autoriza nem executa ativação de `ACTIVE_GUARDED` em produção**: `PRODUCTION_RUNTIME_WIRING = NO`.
7. **NÃO utiliza telefonia real nem Twilio**: `TWILIO_ACCOUNT_REQUIRED = NO`.

---

## 3. Dataset Sintético Congelado (L1A Dataset)

Para evitar qualquer contaminação com dados de calibração ou holdouts de pesquisa anteriores, foi gerado um dataset sintético fechado exclusivo para o L1A:

- **Arquivo**: `scripts/benchmarks/voice/jev-l1a-model-identity-smoke-v1-cases.json`
- **Tamanho**: $N = 20$ casos sintéticos
- **Dataset SHA-256**: `12828e990c1c2523c159630511aeb945b26a941c24ecaa38776b4a2769a3b0d0`
- **Classificação**: `SYNTHETIC / FUNCTIONAL ONLY`
- **Aviso Legal**: `NOT A HOLDOUT. NOT FOR TUNING. NOT FOR PRODUCTION ACCURACY CLAIMS.`

### Distribuição dos Casos por Cobertura Funcional:

| Categoria | Quantidade | Finalidade de Teste |
|---|---|---|
| `OPERATING_HOURS_DIRECT` | 5 | Perguntas canônicas diretas sobre horários e dias de atendimento |
| `OPERATING_HOURS_PARAPHRASE` | 5 | Variações coloquiais, limites de horário e intervalos de expediente |
| `GENERATIVE_REQUIRED` | 4 | Consultas abertas de produtos e negociações comerciais |
| `SECURITY_SENSITIVE` | 3 | Testes de injeção de prompt e tentativa de extração de credenciais |
| `CONTROL_NON_MATCHING` | 3 | Saudações e ruídos conversacionais para controle do capability matcher |

---

## 4. Orçamento Operacional e Limites Rígidos (Call Budget)

A futura execução controlada do L1A deve operar sob as seguintes travas operacionais obrigatórias:

- `MAX_PROVIDER_REQUESTS`: 20 requisições (limitado estritamente ao tamanho do dataset sintético)
- `RETRIES`: 0 (nenhum retry automático permitido)
- `CONCURRENCY`: 1 (execução estritamente sequencial)
- `CUSTOMER_DATA_EXPOSURE`: 0 (absolutamente zero transcrições de clientes)
- `OPENAI_CALLS`: 0 (L1A avalia apenas o adapter TypeSafe; OpenAI não é invocado)
- `TWILIO_CALLS`: 0 (nenhuma chamada telefônica)
- `MONETARY_COST_CEILING`: `PROPOSED_PENDING_OPERATOR_APPROVAL` (teto proposto de $0.10 USD; projeção conservadora: 20.000 input tokens = $0.00084 USD)
- `PROJECTED_COST_CEILING_GUARD`: `IMPLEMENTED / TESTED OFFLINE` (interrompe execução se projectedCostNext ultrapassar o teto fornecido)
- `MAX_PROVIDER_REQUEST_CAP`: `HARD_ENFORCED` (máximo de 20 requisições strictly enforced)
- `ACTUAL_BILLED_COST_HARD_CAP`: `NOT VERIFIED / NOT PROVIDER-ENFORCED` (a API remota não possui quota hard enforceada no runner)
- `INTEGRATIONS_DIST_REFRESH_REQUIRED_BEFORE_L1A`: `YES` (`pnpm --filter @voice-agent/integrations build` obrigatório antes de carregar o runtime com `.env`)
- `L1A_RESULT_NOT_FOR_TUNING`: `YES` (scores de roteamento omitidos do artefato de resultado; apenas telemetria de identidade e latência descriptiva são persistidas)
- `SECRET_LEAK_GUARD`: Zero exibição de `TYPESAFE_API_KEY` em logs, stdout ou arquivos de resultado

---

## 5. Critérios de Aceitação Obrigatórios (Acceptance Criteria)

A futura execução do L1A só poderá ser considerada `PASS` se satisfizer cumulativamente todos os 8 critérios formais:

1. **A. Conclusão Técnica Total**: 100% das 20 requisições chegam a um desfecho observável (sucesso com resposta válida ou erro técnico registrado estruturadamente).
2. **B. Observabilidade de `providerModel`**: O campo `providerModel` deve ser capturado e registrado para cada resposta remota bem-sucedida.
3. **C. Exact Match no Guard**: O modelo retornado deve ser idêntico ao modelo versionado esperado (`providerModel === 'jev-1.13.0'`) para todas as decisões aceitas pelo guard.
4. **D. Isolamento Estrito de Dados**: Zero dados reais de clientes transmitidos no payload HTTP ou gravados em artefatos.
5. **E. Zero Retries**: Nenhuma chamada repetida em caso de lentidão ou falha de rede.
6. **F. Blindagem de Segredos**: Nenhuma chave de API ou token refletido nos logs ou artefatos gerados (`SECRET_AUDIT_PASS`).
7. **G. Semântica Fail-Safe de Mismatch**: A semântica de fail-open diante de mismatch é pré-requisito comprovado offline (`OFFLINE_MISMATCH_FAIL_SAFE_PREREQUISITE = PASS / TESTED LOCALLY`). No L1A live, nenhuma chamada extra ou alteração de modelo esperado será fabricada para forçar mismatch (`INTENTIONAL_LIVE_MISMATCH_REQUEST = NO`). Caso um mismatch ocorra naturalmente da resposta do provedor (`LIVE_NATURAL_MISMATCH_BEHAVIOR`), o guard deve rejeitá-la e registrar o mismatch sem desvios.
8. **H. Invariante da Frozen Policy**: Nenhum threshold da Frozen Policy V1 é alterado.

---

## 6. Distinção Metodológica entre L1A e L1B

| Dimensão | L1A (Model Identity Functional Smoke) | L1B (Synthetic Latency Study) |
|---|---|---|
| **Foco Primário** | Identidade de modelo, pinning, resposta HTTP e fail-open | Distribuição empírica de latência sob carga sintética |
| **Amostra** | $N = 20$ (cobertura funcional mínima fechada) | $N \ge 100$ (`PLANNED_SAMPLE_SIZE`) |
| **Poder Estatístico** | Zero pretensão estatística para cauda de latência | Amostra preliminar para subsidiar candidato de timeout |
| **Concorrência** | Sequencial ($concurrency = 1$) | Controlada em lote ($concurrency \le 2$) |
| **Status Atual** | `DESIGNED / NOT EXECUTED` | `PLANNED / NOT EXECUTED` |
| **Confiança de Cauda** | `NOT ESTABLISHED` | `TAIL_LATENCY_CONFIDENCE = NOT ESTABLISHED` |

---

## 7. Pré-requisitos para Execução Futura do L1A

Antes que o operador autorize a execução do L1A em um próximo slice:
- [x] Model Identity Guard implementado e testado offline (`TypeSafeJevTurnDecisionAdapter`).
- [x] Testes offline de regressão comprovando fail-open em caso de mismatch.
- [x] Dataset sintético congelado com hash registrado (`12828e990c1c...`).
- [x] Script runner dedicado com controle rígido de teto de custo criado e auditado (`run-jev-l1a-model-identity-smoke.mjs`).
- [x] Autorização humana explícita para invocação remota do script runner (`AUTORIZO_L1A_TYPESAFE_N20 = YES`).
- [x] Definição do teto monetário autorizado pelo operador (`COST_CEILING_USD = 0.10`).

---

## 8. Resultados da Execução L1A (Run 1 — 2026-10-02)

- **Artefato de Resultado**: `docs/research/results/phase-6-typesafe-l1a-model-identity-smoke-run1.json`
- **SHA-256 do Resultado**: `698c5e2a3b9177e3ec2692caec2f83cb9d1e67fbea9576197a0fab28770c47c3`
- **Total de Casos Executados**: 20/20
- **Sucessos com Match de Modelo**: 20/20 (`providerModel === 'jev-1.13.0'`)
- **Mismatches Observados**: 0
- **Erros Técnicos / Timeout**: 0
- **Retries Realizados**: 0
- **Concorrência**: 1 (sequencial)
- **Latência Observada (Descritiva)**:
  - Mediana: `275ms`
  - p90: `316ms`
  - p95: `317ms`
  - Max: `685ms`
  - Classificação: `DESCRIPTIVE_ONLY` (não constitui estudo estatístico de cauda / L1B)
- **Custo Máximo Projetado (Upper Bound)**: `0.00084 USD` (20.000 input tokens projetados)
- **Teto Autorizado pelo Operador**: `0.10 USD` (enforced via runner guard)
- **Avaliação Formal de Critérios de Aceitação**:
  - Critério A (Conclusão Técnica Total): **PASS** (20/20)
  - Critério B (Observabilidade de `providerModel`): **PASS** (20/20)
  - Critério C (Exact Match no Guard): **PASS** (20/20 com `jev-1.13.0`)
  - Critério D (Isolamento de Dados do Cliente): **PASS** (zero customer data, 100% sintético)
  - Critério E (Zero Retries): **PASS** (0 retries)
  - Critério F (Blindagem de Segredos): **PASS** (`SECRET_AUDIT_PASS`)
  - Critério G (Semântica Fail-Safe de Mismatch): **PASS** (comprovado offline; 0 mismatches naturais no run)
  - Critério H (Invariante da Frozen Policy): **PASS** (zero alterações na policy)
- **Desfecho Final do L1A**: **PASS TOTAL**
