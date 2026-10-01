# Phase 6 — TypeSafe Staging-Synthetic SHADOW Latency Evidence Plan

## 1. Objetivo & Pergunta de Pesquisa (Research Question)
- **Pergunta Central de Pesquisa**:
  > *"Qual é a distribuição observada de latência e a taxa de conclusão (completion rate) das requisições ao TypeSafe Jev quando executadas através da composição real de staging-synthetic em modo SHADOW?"*
- **Escopo Deliberadamente Restrito (Non-Goals)**:
  - NÃO tem como objetivo avaliar ou calibrar acurácia semântica de classificação;
  - NÃO tem como objetivo afinar ou alterar thresholds da política congelada (`FROZEN_POLICY`);
  - NÃO tem como objetivo estabelecer SLA de produção nem garantia de cauda para clientes;
  - NÃO autoriza chamadas a provedores neste prompt (`DESIGN-ONLY: Provider calls = 0`).

---

## 2. Inventário de Evidências Existentes de Latência & Invariante de Comparabilidade

| Fonte de Evidência | Caminho de Execução | Tamanho Amostral Factual | Contagem Factual de Requisições | Métrica de Latência Efetivamente Presente | Modelo | Comparabilidade com Staging SHADOW Composition |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **A1. Calibration Phase A** (`phase-6-jev-calibration-v2-phase-a-run1.json`) | Script direto isolado -> TypeSafe HTTP API | 80 casos planejados/executados | 160 requisições (80 choice + 80 atômicas) | **NOT RECORDED / NOT VERIFIED** (o artefato canônico não registrou campos de latência) | `jev-latest` -> `jev-1.13.0` | **NÃO COMPARÁVEL**: Executado em script de calibração isolado; sem observer, sem portas tipadas, sem runtime. |
| **A2. Locked Holdout Evaluation** (`phase-6-jev-locked-holdout-v2-run1.json` / AI_WORKLOG 006M / ADR-019) | Script direto isolado -> TypeSafe HTTP API | 40 casos holdout | 40 requisições atômicas | `atomicLatencyMs` registrada no log de execução: min = 225 ms, **mediana = 255 ms**, max = 446 ms, **p95 = 387 ms** (`SYNTHETIC DESIGN INPUT` restrito a N=40) | `jev-latest` -> `jev-1.13.0` | **NÃO COMPARÁVEL**: Script isolado de holdout; sem observer, sem portas tipadas, sem runtime. Não utilizar para retuning. |
| **B. Direct Adapter Live Smoke** (PR #44 / 006Q / `PHASE_6_TYPESAFE_LIVE_SYNTHETIC_SMOKE.md`) | `TypeSafeJevTurnDecisionAdapter` direto -> TypeSafe HTTP API | N=1 resposta válida observada (2 execuções do harness temporário) | `AGGREGATE_REQUEST_COUNT = NOT VERIFIED` (`AT_LEAST_ONE_SUCCESSFUL_PROVIDER_RESPONSE = OBSERVED`) | `DIRECT_ADAPTER_SUCCESSFUL_RESPONSE_LATENCY` = **415 ms** | `jev-latest` -> `jev-1.13.0` | **NÃO COMPARÁVEL**: Adapter invocado diretamente de forma isolada; não passa por `createStagingSyntheticShadowComposition`, `AuxiliaryTurnShadowObserver` ou `TimedAuxiliaryTurnDecisionPort`. |
| **C. Staging Composition SHADOW Live** (PR #46 / 006S / `PHASE_6_TYPESAFE_STAGING_SHADOW_LIVE_SYNTHETIC.md`) | `createStagingSyntheticShadowComposition` -> `AuxiliaryTurnShadowObserver` -> `TimedAuxiliaryTurnDecisionPort` -> `TypeSafeJevTurnDecisionAdapter` -> TypeSafe HTTP API | N=1 execução observada (2 invocações do comando runner) | `FETCH_DISPATCHES_AGGREGATE = NOT VERIFIED` (`AT_LEAST_ONE_FETCH_DISPATCH_OBSERVED = YES`) | Observer Elapsed: **1490 ms** (abortado pelo teto temporário de 1500 ms; resposta remota completa `NOT OBSERVED`) | `jev-latest` (resolvido: NOT OBSERVED) | **EXATA**: Execução através da composição controlada completa de staging. |

> [!IMPORTANT]
> **Regra de Invariante de Comparabilidade**:
> `DIRECT_ADAPTER_LATENCY != STAGING_SHADOW_COMPOSITION_LATENCY`.
> A medição de 415ms do smoke isolado não reflete a latência da composição SHADOW, que introduz camadas de observer assíncrono, portas tipadas de timeout, despacho de telemetria e desacoplamento do fluxo nominal.

---

## 3. Estado Factual Atual do Sistema
- `TypeSafe concrete adapter live response`: `OBSERVED` (PR #44)
- `staging synthetic composition`: `IMPLEMENTED / TESTED LOCALLY` (PR #45)
- `composition -> provider dispatch`: `OBSERVED` (PR #46)
- `successful E2E provider response through composition`: `NOT OBSERVED` (PR #46 abortou no teto de 1500ms)
- `staging live shadow`: `OBSERVED / TIMEOUT` (PR #46)
- `current staging timeout`: `STAGING_SHADOW_TIMEOUT_MS = 1500` (inalterado)
- `observer elapsed on observed timeout`: `1490 ms`
- `timeout recalibration`: `NOT DECIDED`
- `production wiring`: `NO` (`PRODUCTION_RUNTIME_WIRING = NO`)
- `customer traffic`: `PROHIBITED` (`CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE = NOT CLEARED`)
- `ACTIVE_GUARDED`: `BLOCKED` (fail-closed)
- `known deterministic handlers`: `0`

---

## 4. Desenho do Dataset Sintético de Latência
Para isolar a medição de latência de qualquer contaminação estatística ou de privacidade, desenha-se um dataset **NOVO e EXCLUSIVO**, sem reutilização de datasets anteriores.

### 4.1 Invariantes de Isolamento do Dataset
1. **Holdout Intocado**: Proibido reutilizar qualquer frase do dataset de holdout bloqueado (`phase-6-jev-locked-holdout-v2-run1.json`). `LOCKED_HOLDOUT = CONSUMED` permanece inegociável.
2. **Datasets de Calibração Intocados**: Proibido reutilizar casos de calibração (`jev-calibration-v2-cases.json`) ou baselines OpenAI (`openai-baseline-v1-cases.json`).
3. **Privacidade Absoluta**: Textos 100% sintéticos, neutros, em PT-BR, sem nomes de pessoas, empresas reais, identificadores de cliente, dados financeiros ou segredos.

### 4.2 Estrutura e Classes de Tamanho
Propõe-se uma bateria pequena e equilibrada de **PLANNED_CASES_MAX = 12 requisições sintéticas**, divididas em 3 classes de comprimento para observar se há sensibilidade da latência do provedor ao tamanho do prompt:

| Classe de Tamanho | Quantidade Planejada | Faixa de Palavras / Caracteres | Exemplo Sintético Neutro Autorizado |
| :--- | :--- | :--- | :--- |
| **SHORT** | 4 | 5 a 9 palavras (~30 a 55 caracteres) | `"Sim, pode prosseguir com isso."`<br>`"Não entendi, pode falar novamente?"`<br>`"Quero falar com um atendente humano."`<br>`"Qual é o horário de atendimento?"` |
| **MEDIUM** | 4 | 14 a 22 palavras (~80 a 140 caracteres) | `"Você poderia me confirmar quais são as etapas necessárias para realizar o agendamento de uma consulta inicial?"`<br>`"Eu já preenchi o formulário anterior, mas não recebi a mensagem de confirmação no meu telefone."`<br>`"Preciso verificar se o meu cadastro continua ativo no sistema antes de solicitar uma nova via do documento."`<br>`"Gostaria de entender melhor como funciona o cancelamento sem custo antes do prazo final estabelecido."` |
| **LONGER** | 4 | 30 a 45 palavras (~180 a 270 caracteres) | `"Eu liguei ontem para tentar resolver a pendência na minha conta, mas a ligação caiu antes de concluirmos o procedimento. Vocês conseguem verificar se o atendente anterior deixou alguma anotação no protocolo ou se preciso repetir tudo novamente desde o início?"`<br>`"Estou em dúvida entre duas alternativas de plano e gostaria de saber se existe alguma restrição para mudar de categoria no próximo mês sem pagar taxa de transferência ou se o contrato exige fidelidade mínima de um ano."`<br>`"Recebi uma notificação dizendo que meu acesso expirou ontem, porém realizei a atualização cadastral dentro do prazo solicitado. Como posso validar se os documentos anexados foram aprovados pela equipe técnica responsável?"`<br>`"Caso eu precise remarcar a data do atendimento presencial com antecedência de quarenta e oito horas, haverá cobrança de taxa administrativa adicional ou o reagendamento é totalmente gratuito pelo canal de autoatendimento?"` |

### 4.3 Justificativa do Teto Planejado (PLANNED_CASES_MAX = 12)
- **Tamanho Suficiente**: 12 casos (4 por classe) permitem calcular mediana empírica, dispersão por classe de tamanho e taxa de conclusão sem inflar requisições.
- **Segurança Orçamentária**: 12 chamadas consomem ~6.000 tokens de entrada, equivalendo a aproximadamente `$0.00025 USD`, muito abaixo do teto autorizado de `$0.01 USD`.
- **Blast Radius Mínimo**: Evita sobrecarga no provedor e minimiza tempo total de execução.

---

## 5. Qualificação Metodológica da Amostra (Sample Size Qualification)
- **Evidência Operacional Exploratória**: Uma amostra com máximo de 12 casos constitui estritamente `EXPLORATORY OPERATIONAL EVIDENCE`.
- **Proibição de Linguagem de SLA**:
  - NÃO constitui garantia de latência de população;
  - NÃO constitui SLA conversacional de produção;
  - NÃO oferece robustez estatística para quantis de cauda extrema (p99/p99.9).
- **Tratamento de Percentis**:
  - `Median` (p50): Indicador operacional central útil;
  - `p90 / p95`: Métricas meramente exploratórias (*exploratory tail indicator*), devidamente rotuladas como tal nos artefatos.

---

## 6. Análise do Problema de Censura & Auditoria de Suporte a Override no Código
Na execução do PR #46, o timeout de 1500ms abortou a requisição em 1490ms antes do recebimento da resposta remota do TypeSafe AI.
Se todos os futuros testes mantiverem o timeout rígido de 1500ms, qualquer requisição com latência real de p.ex. 1600ms a 2200ms sofrerá censura à direita (*right-censoring*), impedindo a observação da verdadeira distribuição de latência do provedor.

### 6.1 Auditoria Factual do Código-Fonte (`apps/voice/src/composition-root.staging-shadow.ts`)
Inspecionando diretamente a implementação versionada atual:
1. `StagingShadowCompositionOptions` declara explicitamente o campo opcional:
   `readonly timeoutMs?: number | undefined;` (linha 23).
2. A factory `createStagingSyntheticShadowComposition` utiliza o override de forma tipada:
   `const timeoutMs = options.timeoutMs ?? STAGING_SHADOW_TIMEOUT_MS;` (linha 130).
3. O valor é repassado diretamente a `TimedAuxiliaryTurnDecisionPort(rawAdapter, timeoutMs)` (linha 135) e retornado em `StagingShadowCompositionResult.timeoutMs` (linha 150).
4. Quando `options.timeoutMs` é omitido, o valor nominal padrão `STAGING_SHADOW_TIMEOUT_MS = 1500` permanece intacto.

- **Classificação Factual**:
  - `MEASUREMENT_DEADLINE_OVERRIDE_SUPPORTED = YES`
  - `MEASUREMENT_ONLY_DEADLINE_IMPLEMENTATION_PREREQUISITE = NO` (a capacidade já está implementada e tipada na interface da factory de staging, sem necessidade de alteração em código de produção).

### 6.2 Estratégia de Deadline Exclusivo de Medição
Recomenda-se que o futuro harness de teste temporário passe explicitamente:
`timeoutMs: 4000` (`MEASUREMENT_ONLY_DEADLINE = 4000 ms`).
- **Classificação**: `MEASUREMENT_ONLY_DEADLINE` (NÃO é novo timeout operacional de staging, NÃO é timeout de produção, NÃO é SLA).
- **Preservação de Staging Nominal**: `STAGING_SHADOW_TIMEOUT_MS = 1500` permanece o valor operacional nominal não recalibrado (`STAGING_TIMEOUT_RECALIBRATION = NOT DECIDED`).

---

## 7. Não-Seleção de Parâmetros de Produção
Este plano estabelece formalmente:
- `PRODUCTION_JEV_TIMEOUT_MS = NOT SELECTED`
- `PRODUCTION_SHADOW_MAX_CONCURRENCY = NOT SELECTED`
- `PRODUCTION_RUNTIME_WIRING = NO`
Nenhum timeout de produção será derivado ou assumido a partir deste experimento preliminar de staging.

---

## 8. Teto Rígido de Requisições & Mecanismo Anti-Ambiguidade de Contagem
Para eliminar qualquer incerteza de contagem ou despacho descontrolado:
- **Teto Rígido Futuro**: `FUTURE_TYPESAFE_REQUESTS_MAX = 12` (teto máximo autorizado, NÃO é quantidade obrigatória; se disparar stop condition, encerra imediatamente).
- **Por Caso**: Exatamente 1 despacho de rede por caso, com 0 retries internos (`RETRY = 0`).
- **Controle de Execução do Runner**:
  - `RUNNER_COMMAND_INVOCATIONS_MAX = 1` (exatamente UMA invocação do comando runner no futuro slice de teste; se falhar antes ou depois de dispatch de rede, NÃO reinvocar automaticamente; STOP e reconciliar evidência).
- **Guardião em Camadas no Harness de Execução**:
  1. **Ledger Temporário em Disco**: Arquivo efêmero, local da tarefa, não rastreado no git e nunca commitado (`scripts/tmp-006t-typesafe-counter.json`) registrando atomicamente antes e após cada despacho: `caseId`, `timestamp`, `dispatchAttempted`, `completed`. O ledger temporário impede dispatches excedentes entre reinicializações inesperadas de processo.
  2. **Guardião de Despacho em Memória**: Wrapper estrito no `fetch` garantindo no máximo 1 invocação por caso sintético.
  3. **Registro Individual por Caso**: Cada execução salva seu log estruturado individual em JSON com hash do input e status.
  4. **Observação de Output Bruto**: O resultado final dependerá da observação do output bruto do comando do terminal, e não apenas de arquivos autoescritos.
  5. **Registro Durável Versionado**: O resultado final agregado será consolidado no arquivo durável `docs/research/results/phase-6-staging-shadow-latency-evidence.json`.

---

## 9. Métricas de Latência Planejadas
Para cada execução iniciada, o harness registrará os seguintes campos em artefato estruturado JSON:
- `caseId`: Identificador único do caso sintético (p.ex. `case-lat-001` a `case-lat-012`);
- `lengthClass`: `SHORT`, `MEDIUM` ou `LONGER`;
- `inputCharCount`: Comprimento em caracteres do texto sintético;
- `requestDispatchObserved`: `YES` / `NO`;
- `providerResponseObserved`: `YES` / `NO`;
- `providerModelRequested`: `jev-latest`;
- `providerModelResolved`: Modelo retornado pelo provedor (p.ex. `jev-1.13.0`) ou `NOT OBSERVED`;
- `observerElapsedMs`: Tempo total decorrido no observer em milissegundos;
- `adapterLatencyMs`: Latência registrada internamente pelo adapter (se resposta obtida);
- `timeoutObserved`: `YES` / `NO` (sob o deadline de medição de 4000ms);
- `wouldHaveTimedOutUnder1500Ms`: `YES` / `NO` (se latência > 1500ms);
- `abortObserved`: `YES` / `NO`;
- `schemaOrHttpError`: `YES` / `NO` (detalhe de código HTTP ou erro de parsing);
- **Privacidade de Logs**: Proibido registrar o texto completo do input no log estruturado (`RAW_TRANSCRIPT_LOGGING = PROHIBITED`); apenas metadados técnicos e `caseId` são retidos.

### Métricas Agregadas do Relatório Final:
- `plannedCasesMax`: 12
- `actualCasesStarted`: Observado em runtime (pode ser <= 12)
- `actualCasesCompleted`: Observado em runtime (pode ser <= 12)
- `actualFetchDispatches`: Observado em runtime (pode ser <= 12)
- `successfulProviderResponses`: Observado em runtime
- `timeoutsUnderMeasurementDeadline`: Quantidade de timeouts sob 4000ms
- `wouldHaveTimedOutUnder1500Ms`: Quantidade que teria sofrido timeout sob 1500ms
- `completionRateUnderMeasurementDeadline`: Percentual com resposta completa sob 4000ms
- `completionRateUnder1500Ms`: Percentual com resposta completa <= 1500ms
- `timeoutRate`: Percentual de requisições abortadas
- `minLatencyMs`: Latência mínima observada
- `medianLatencyMs`: Latência mediana observada
- `p90ExploratoryMs`: Percentil 90 exploratório
- `p95ExploratoryMs`: Percentil 95 exploratório (somente se classificado explicitamente como exploratório e útil)
- `maxLatencyMs`: Latência máxima observada
- `errorCount`: Falhas de rede, HTTP ou parsing

---

## 10. Orçamento e Faturamento do Experimento Futuro
- **Teto Orçamentário Autorizado**: `AUTHORIZED_EXPERIMENT_BUDGET_CAP_USD = 0.01`
- **Preço de Catálogo Referenciado**: `$0.042 por 1 milhão de tokens de entrada` (documentação oficial do provedor em `https://docs.typesafe.ai/models.md`).
- **Estimativa de Consumo**:
  - Até 12 requisições * ~500 tokens médios de entrada = ~6.000 tokens.
  - Custo estimado teórico: `$0.000252 USD` (~2.5% do teto de $0.01).
- **Classificação Factual**:
  - `COST_ESTIMATE = NOT VERIFIED` (a consulta ao saldo ou endpoint de faturamento da TypeSafe AI permanece desautorizada para evitar chamadas adicionais de rede).
  - `ACTUAL_BILLED_COST_USD = NOT VERIFIED`.
- **Contenção Orçamentária e Operacional**:
  - O software NÃO consegue garantir financeiramente cobrança <= $0.01 sem integração com a API de faturamento do provedor.
  - A proteção operacional real é garantida estritamente por: `request cap <= 12`, `no retry` e `stop conditions`.
  - O teto de `$0.01 USD` é uma autorização de governança orçamentária, não prova contábil de faturamento.

---

## 11. Heurísticas Propostas de Decisão (Proposed Exploratory Decision Heuristics)
As regras a seguir são classificadas estritamente como `PROPOSED_EXPLORATORY_DECISION_HEURISTICS` para interpretação futura dos dados pelo operador humano, e NÃO constituem política de produção aprovada, SLA ou gate automático de deploy:

1. **Heurística `KEEP_1500MS`**:
   - Se `completionRateUnder1500Ms >= 90%` e `medianLatencyMs < 1100 ms`, os dados indicam viabilidade operacional do teto atual de 1500ms para staging. Propõe-se manter `STAGING_SHADOW_TIMEOUT_MS = 1500`.
2. **Heurística `CONSIDER_HIGHER_STAGING_TIMEOUT`**:
   - Se `completionRateUnder1500Ms < 50%`, mas `completionRateUnderMeasurementDeadline >= 90%` com `medianLatencyMs` estável entre 1600ms e 2500ms: propõe-se submeter à revisão humana a recalibração do timeout de staging (p.ex. para 2500ms ou 3000ms) para acomodar a latência intrínseca de rede do provedor em staging sintético.
3. **Heurística `PROVIDER_LATENCY_RISK`**:
   - Se `medianLatencyMs > 3000 ms`, ou se houver timeouts frequentes mesmo sob o deadline de 4000ms (`completionRateUnderMeasurementDeadline < 70%`), classificar a integração como de alto risco de latência e bloquear avanço para produção.
4. **Heurística `MEASURE_MORE`**:
   - Se houver comportamento bimodal (p.ex. cold starts frequentes de >3500ms intercalados com requisições rápidas de 400ms) sem padrão claro: propor análise de cold start antes de qualquer decisão.

> [!NOTE]
> Os limiares acima (90%, 50%, 1100ms, 1600-2500ms, 3000ms, 70%) são heurísticas propostas de apoio e exigem validação e decisão humana antes de qualquer formalização como política operacional. A política de roteamento congelada (`FROZEN_POLICY`) permanece intocada.

---

## 12. Disciplina YAGNI e Condições de Parada (Stop Conditions)
- **CURRENT_REQUIREMENT**: Medir latência de até 12 turnos sintéticos através da composição de staging shadow.
- **EXISTING_OPTION**: Factory `createStagingSyntheticShadowComposition` + harness Vitest efêmero no workspace de voice.
- **MINIMAL_OPTION**: Um único script efêmero de teste executado via `vitest run`, gravando o resultado consolidado em `docs/research/results/phase-6-staging-shadow-latency-evidence.json`.
- **Proibições de Complexidade (YAGNI)**:
  - PROIBIDO criar frameworks de load testing ou benchmarking dedicados;
  - PROIBIDO criar tabelas de banco de dados ou schemas para armazenar métricas;
  - PROIBIDO criar queues, workers assíncronos ou cron jobs para o teste;
  - PROIBIDO adicionar dependências no `package.json`.
- **Condições de Parada Imediata (Stop Conditions)**:
  - Se o guardião de contador atingir 12: STOP imediato.
  - Se ocorrer 1 erro de rede grave (DNS, TLS, recusa de conexão) ou erro HTTP 401/403: STOP imediato.
  - Se 3 requisições consecutivas falharem por timeout: STOP imediato para evitar desperdício de chamadas.
