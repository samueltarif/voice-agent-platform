# Phase 6: TypeSafe Jev Phase A Calibration Data Collection Report

- **Status**: PHASE A SIGNAL COLLECTION — COMPLETE / SYNTHETIC / LIMITED
- **Data**: 2026-09-30
- **Branch**: `research/006k-jev-calibration-execution`
- **PR**: #34 (MERGED)
- **Dataset de Calibração**: `scripts/benchmarks/voice/jev-calibration-v2-cases.json` (Version 2.0.0)
- **Resultados Salvos em**: `docs/research/results/phase-6-jev-calibration-v2-phase-a-run1.json`

### Rastreabilidade de Execução

| Item | SHA / Valor |
| :--- | :--- |
| **Initial pre-provider commit** | `b0d2e7fc80fa9b1b8e003ad86beca6c80b2ed1c3` (research: add Jev calibration phase A runner) |
| **Guarded runner commit** | `b2a434820082e883b652f5dee316f552c664654f` (fix: guard runner execution against vitest runner environment) |
| **ACTUAL Provider execution code HEAD** | `1de5e4f48c5fc7df2ceb59f514cf8ce6a184f100` (refactor: decoupling calibration runner from unit test imports — commit efetivo em vigência quando as 160 requests foram executadas) |
| **Post-run lint fix commit** | `662ebcdf88a32156f97e2de7951f9abd6db2217d` (remove stale unused import) |
| **Final tested code HEAD** | `662ebcdf88a32156f97e2de7951f9abd6db2217d` |
| **PR #34 Merge commit** | `78e3d053f5adfa48551c47b95f2a3d8cf13838fe` |

> **Correção de Rastreabilidade pós-PR #34**: A alegação inicial de que `b2a4348` foi o HEAD de execução foi formalmente retratada. A sequência de comandos observada e fornecida pelo operador demonstra que o commit `1de5e4f` foi criado antes da invocação bem-sucedida do runner live (`node --env-file=.env ... run-jev-calibration-phase-a.ts`). O histórico e a ancestralidade do Git confirmam independentemente a ordenação dos commits. Juntas, essas fontes de evidência sustentam que `ACTUAL_PROVIDER_EXECUTION_CODE_HEAD = 1de5e4f48c5fc7df2ceb59f514cf8ce6a184f100`.
>
> **Nota de Staleness**: O `pnpm check` anterior (524 passed, 45 skips) foi observado **antes** dos commits `1de5e4f` e `662ebcd`. O quality gate definitivo foi reexecutado no HEAD final `662ebcd` e confirmado: **PASS** (524 passed, 45 skips, 0 failures, 0 new skips).

---

## 1. Proveniência e Verificação de Hashes

| Artefato | SHA-256 Esperado e Observado | Status |
| :--- | :--- | :---: |
| V1 Dataset (`openai-baseline-v1-cases.json`) | `9ab7cbd2fbfcf508673a700d4a484e0c674d0124766c7b7fa0eee05a573e0d50` | **VERIFICADO** |
| V2 Dataset (`jev-calibration-v2-cases.json`) | `3e7e0a20ecd3341c99b84d40162b10eff17ba0600d191dd143bc99f00aec3047` | **VERIFICADO** |
| Choice V1 (`JEV_ROUTING_QUESTION_V1`) | `1e6aaccdb562cde6e0c005ac6d95417922c3351a17ef6592c2ca9b65b6290788` | **VERIFICADO** |
| Atomic V1 (`JEV_ROUTING_ATOMIC_V1`) | `3fecf9ce82ad600a74549d3459fe2b2b516fc3bd7b5fff33bf5b850cd48e8725` | **VERIFICADO** |

> **Nota de Recomputação Canônica**: Os hashes Choice V1 e Atomic V1 foram recomputados deterministicamente via serialização canônica das estruturas de dados e SHA-256 (`CHOICE_CANONICAL_HASH_MATCH=true`, `ATOMIC_CANONICAL_HASH_MATCH=true`), retificando a evidência anterior que se apoiava apenas em constantes exportadas.

---

## 2. Parâmetros de Execução do Provedor

- **Provedor**: TypeSafe Inc. (System One API)
- **Endpoint**: `POST https://api.typesafe.ai/v1/systemone`
- **Modelo Solicitado**: `jev-latest`
- **Modelo Resolvido**: `jev-1.13.0` (observado em todas as 160 requisições)
- **Model Version Drift**: `NO` (zero drift detectado)
- **Casos de Calibração**: 80 (exatamente os 80 casos com `split === 'CALIBRATION'`)
- **Holdout Requests**: **0** (split de 40 casos bloqueado e intocado)
- **Retries**: **0** (zero retries)
- **Falhas de Execução**: **0**

### Contagem de Requisições

| Pergunta | Planejadas | Executadas | Status |
| :--- | :---: | :---: | :---: |
| Direct Choice V1 | 80 | 80 | **100% SUCESSO** |
| Atomic Noul V1 | 80 | 80 | **100% SUCESSO** |
| **Total de Requisições** | **160** | **160** | **COMPLETE** |

---

## 3. Métricas Descritivas do Choice V1 (N=80)

O Direct Choice V1 foi executado para medir o comportamento basal do classificador discreto nos 80 casos de calibração:

| Métrica | Valor Observado | Detalhes |
| :--- | :---: | :--- |
| **Routing Accuracy Geral** | **76.25%** | 61 acertos em 80 casos |
| **Deterministic Precision** | **61.54%** | 24 corretos em 39 propostos como determinísticos |
| **Deterministic Recall** | **85.71%** | 24 capturados dos 28 determinísticos reais |
| **False Bypass Count** | **15** | 15 turnos não-determinísticos classificados como determinísticos |
| **False Bypass Rate s/ Não-Determinísticos** | **28.85%** | 15 falsos bypasses em 52 casos não-determinísticos |
| **False Bypass Rate entre Propostos** | **38.46%** | 15 erros entre os 39 desvios propostos |
| **Security Miss Count** | **0 observados** | 0 misses observados nos 12 casos de segurança da amostra de calibração |
| **Security Miss Rate** | **0.00%** | Observado nesta amostra de N=12; não caracteriza garantia de contenção em produção |
| **Unnecessary Security Escalation** | **0** | Nenhum caso não-segurança foi classificado como segurança |

> **Nota Crítica sobre o Direct Choice**: A taxa de falsos bypasses permaneceu alta no Choice direto (38.46% de erro entre os turnos desviados), confirmando a evidência preliminar de que o Choice V1 não pode ser utilizado diretamente para desvio em produção sem calibração ou regras auxiliares adicionais.

> **Nota sobre Security Misses**: `SECURITY_MISSES_OBSERVED = 0/12` nesta amostra de calibração. Esta é uma observação empírica descritiva, **não** uma garantia de segurança ou contenção perfeita em produção.

---

## 4. Distribuições Descritivas de Sinais Atomic Noul V1 (N=80)

As 3 perguntas atômicas Noul (`is_deterministic_candidate`, `is_generative_required`, `is_security_escalation`) foram avaliadas concorrentemente na mesma requisição HTTP para cada caso. Os valores contínuos (0.0 a 1.0) foram registrados sem conversão booleana e sem aplicação de threshold.

### 4.1 Para Casos `DETERMINISTIC_CANDIDATE` (Ground Truth N=28)

| Sinal Noul | Min | p25 | Mediana | p75 | Max |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `deterministicNoul` | 0.36 | 0.7725 | **0.845** | 0.885 | 0.96 |
| `generativeNoul` | 0.07 | 0.1275 | **0.165** | 0.2925 | 0.78 |
| `securityNoul` | 0.01 | 0.0175 | **0.020** | 0.0325 | 0.27 |

### 4.2 Para Casos `GENERATIVE_REQUIRED` (Ground Truth N=40)

| Sinal Noul | Min | p25 | Mediana | p75 | Max |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `deterministicNoul` | 0.05 | 0.1075 | **0.190** | 0.295 | 0.70 |
| `generativeNoul` | 0.55 | 0.8900 | **0.925** | 0.950 | 0.97 |
| `securityNoul` | 0.02 | 0.0275 | **0.030** | 0.060 | 0.31 |

### 4.3 Para Casos `SECURITY_ESCALATE` (Ground Truth N=12)

| Sinal Noul | Min | p25 | Mediana | p75 | Max |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `deterministicNoul` | 0.33 | 0.3800 | **0.430** | 0.495 | 0.74 |
| `generativeNoul` | 0.26 | 0.6000 | **0.665** | 0.725 | 0.82 |
| `securityNoul` | 0.81 | 0.9150 | **0.965** | 0.980 | 0.99 |

---

## 5. Latência Medida (HTTP Request Start → Resposta Tipada Completa)

| Pergunta | Min (ms) | p25 (ms) | Mediana (ms) | p75 (ms) | Max (ms) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Choice V1** | 236 | 252 | **262** | 279.5 | 385 |
| **Atomic Noul V1** | 232 | 252 | **261** | 274.0 | 447 |

> A latência observada permaneceu estável em torno de 260 ms tanto para requisições de escolha única quanto para requisições multi-pergunta atômicas.

---

## 6. Consumo de Tokens e Custo Estimado por Uso

- **Tabela Oficial TypeSafe**: $0.042 / 1.000.000 tokens de entrada; tokens de saída gratuitos ($0.00).
- **Teto Autorizado no Prompt**: US$ 0.05

| Componente | Tokens Entrada | Tokens Saída | Custo Estimado por Uso (USD) | Status |
| :--- | :---: | :---: | :---: | :---: |
| **Choice V1 (80 reqs)** | 38.718 | 5.128 | $0.001626 | **USAGE OBSERVED / ARITHMETIC VERIFIED** |
| **Atomic V1 (80 reqs)** | 50.558 | 5.120 | $0.002123 | **USAGE OBSERVED / ARITHMETIC VERIFIED** |
| **Total Combinado (160 reqs)** | **89.276** | **10.248** | **$0.003750** | **USAGE OBSERVED / ARITHMETIC VERIFIED** |

O custo estimado por uso ($0.003750 USD) representou aproximadamente 7.5% do teto financeiro autorizado ($0.05 USD).

> **Semântica de Custo**: Os valores acima são `USAGE_BASED_ESTIMATED_COST`: o campo `usage` foi observado na resposta da API, e a aritmética ($tokens × $0.042 / 1M) foi verificada deterministicamente. O valor de cobrança real (`ACTUAL_BILLING_COST`) permanece `NOT INDEPENDENTLY RECONCILED` — nenhuma consulta ao painel de faturamento do provedor foi realizada.

---

## 7. Declarações Formais de Governança

- **THRESHOLD_SELECTED**: **`NO`** (nenhum threshold de corte foi selecionado ou ajustado neste relatório).
- **CANDIDATE_POLICY_SELECTED**: **`NO`** (nenhuma política de roteamento candidata foi fixada).
- **HOLDOUT_REQUESTS**: **`0`** (nenhum dos 40 casos do split `HOLDOUT` foi enviado à rede).
- **OPENAI_CALLS**: **`0`** (zero chamadas para a OpenAI).
- **TWILIO_CALLS**: **`0`** (zero chamadas para a Twilio).
- **PRODUCTION_INTEGRATION**: **`NO`** (nenhuma alteração no runtime de produção ou contratos de domínio).

---

## 8. Próximos Passos (Phase B)

1. **Ajuste Offline de Políticas Candidatas**:
   - Conduzir a exploração paramétrica e fitting de políticas exclusivamente sobre os 80 sinais de calibração coletados.
   - Avaliar trade-offs entre `deterministicNoul`, `generativeNoul` e `securityNoul` visando minimizar o false bypass rate.
2. **Congelamento Formal da Política Candidata**:
   - Fixar formalmente a política candidata escolhida (ou declarar inviabilidade) antes de qualquer acesso ao split de Holdout.
3. **Avaliação Final no Locked Holdout**:
   - Somente após o congelamento da política, submeter os 40 casos de Holdout para validação final estritamente controlada.
