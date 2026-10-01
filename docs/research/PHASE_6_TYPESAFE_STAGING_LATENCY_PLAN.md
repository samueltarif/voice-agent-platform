# Phase 6 — TypeSafe Staging-Synthetic SHADOW Latency Evidence Plan

## 1. Objetivo & Pergunta de Pesquisa (Research Question)
- **Pergunta Central de Pesquisa**:
  > *"Qual é a distribuição observada de latência e a taxa de conclusão (completion rate) das requisições ao TypeSafe Jev quando executadas através da composição real de staging-synthetic em modo SHADOW?"*
- **Escopo Deliberadamente Restrito (Non-Goals)**:
  - NÃO tem como objetivo avaliar ou calibrar acurácia semântica de classificação;
  - NÃO tem como objetivo afinar ou alterar thresholds da política congelada (`FROZEN_POLICY`);
  - NÃO tem como objetivo estabelecer SLA de produção nem garantia de cauda para clientes;
  - NÃO tem como objetivo prever o desempenho do modelo principal (OpenAI);
  - NÃO autoriza chamadas a provedores neste prompt (`DESIGN-ONLY: Provider calls = 0`).

---

## 2. Inventário de Evidências Existentes de Latência
A tabela a seguir consolida e separa factualmente as fontes de medição existentes no repositório, garantindo que medições não equivalentes não sejam mescladas em uma única distribuição:

| Fonte de Evidência | Caminho de Execução | Tamanho Amostral | Classificação do Input | Deadline / Timeout | Respostas Válidas | Métrica de Latência Disponível | Modelo | Comparabilidade com Staging SHADOW Composition |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **A. Calibration & Holdout Research** (ADR-019 / Benchmark) | Script direto isolado -> TypeSafe HTTP API | N=120 (80 calibração, 40 holdout) | Sintético (PT-BR) | 5000 ms (script abort) | 120 / 120 | Mediana: 255 ms, p95: 387 ms (`SYNTHETIC DESIGN INPUT`) | `jev-1.13.0` | **NÃO COMPARÁVEL**: Executado em script de calibração isolado; sem runtime de aplicação, sem observer, sem portas tipadas. |
| **B. Direct Adapter Live Smoke** (PR #44 / 006Q) | `TypeSafeJevTurnDecisionAdapter` direto -> TypeSafe HTTP API | N=1 resposta observada (2 execuções) | Sintético (PT-BR) | 15000 ms (`SMOKE_HARNESS_ABORT_MS`) | 1 observada | E2E Adapter Latency: **415 ms** | `jev-latest` -> `jev-1.13.0` | **NÃO COMPARÁVEL**: Adapter invocado diretamente de forma isolada; não passa por `createStagingSyntheticShadowComposition`, `AuxiliaryTurnShadowObserver` ou `TimedAuxiliaryTurnDecisionPort`. |
| **C. Staging Composition SHADOW Live** (PR #46 / 006S) | `createStagingSyntheticShadowComposition` -> `AuxiliaryTurnShadowObserver` -> `TimedAuxiliaryTurnDecisionPort` -> `TypeSafeJevTurnDecisionAdapter` -> TypeSafe HTTP API | N=1 execução observada (2 invocações do runner) | Sintético (PT-BR) | 1500 ms (`STAGING_SHADOW_TIMEOUT_MS`) | 0 (abortado por timeout) | Observer Elapsed: **1490 ms** (censurado no teto de 1500 ms) | `jev-latest` (resolvido: NOT OBSERVED) | **EXATA**: Execução através da composição controlada completa de staging. |

> [!IMPORTANT]
> **Regra de Invariante de Comparabilidade**:
> `DIRECT_ADAPTER_LATENCY != STAGING_SHADOW_COMPOSITION_LATENCY`.
> A medição de 415ms do smoke isolado não pode ser assumida como baseline de latência da composição SHADOW, pois a composição integra camadas adicionais de orquestração assíncrona, temporização e telemetria.

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
Propõe-se uma bateria pequena e equilibrada de **N = 12 requisições sintéticas**, divididas em 3 classes de comprimento para observar se há sensibilidade da latência do provedor ao tamanho do prompt:

| Classe de Tamanho | Quantidade | Faixa de Palavras / Caracteres | Exemplo Sintético Neutro Autorizado |
| :--- | :--- | :--- | :--- |
| **SHORT** | 4 | 5 a 9 palavras (~30 a 55 caracteres) | `"Sim, pode prosseguir com isso."`<br>`"Não entendi, pode falar novamente?"`<br>`"Quero falar com um atendente humano."`<br>`"Qual é o horário de atendimento?"` |
| **MEDIUM** | 4 | 14 a 22 palavras (~80 a 140 caracteres) | `"Você poderia me confirmar quais são as etapas necessárias para realizar o agendamento de uma consulta inicial?"`<br>`"Eu já preenchi o formulário anterior, mas não recebi a mensagem de confirmação no meu telefone."`<br>`"Preciso verificar se o meu cadastro continua ativo no sistema antes de solicitar uma nova via do documento."`<br>`"Gostaria de entender melhor como funciona o cancelamento sem custo antes do prazo final estabelecido."` |
| **LONGER** | 4 | 30 a 45 palavras (~180 a 270 caracteres) | `"Eu liguei ontem para tentar resolver a pendência na minha conta, mas a ligação caiu antes de concluirmos o procedimento. Vocês conseguem verificar se o atendente anterior deixou alguma anotação no protocolo ou se preciso repetir tudo novamente desde o início?"`<br>`"Estou em dúvida entre duas alternativas de plano e gostaria de saber se existe alguma restrição para mudar de categoria no próximo mês sem pagar taxa de transferência ou se o contrato exige fidelidade mínima de um ano."`<br>`"Recebi uma notificação dizendo que meu acesso expirou ontem, porém realizei a atualização cadastral dentro do prazo solicitado. Como posso validar se os documentos anexados foram aprovados pela equipe técnica responsável?"`<br>`"Caso eu precise remarcar a data do atendimento presencial com antecedência de quarenta e oito horas, haverá cobrança de taxa administrativa adicional ou o reagendamento é totalmente gratuito pelo canal de autoatendimento?"` |

### 4.3 Justificativa do Tamanho Amostral (N = 12)
- **Tamanho Suficiente**: N=12 (4 por classe) permite calcular mediana empírica, dispersão por classe de tamanho e taxa de conclusão sem inflar requisições.
- **Segurança Orçamentária**: 12 chamadas consomem ~6.000 tokens de entrada, equivalendo a aproximadamente `$0.00025 USD`, muito abaixo do teto de `$0.01 USD`.
- **Blast Radius Mínimo**: Evita sobrecarga no provedor e minimiza tempo total de execução.

---

## 5. Qualificação Metodológica da Amostra (Sample Size Qualification)
- **Evidência Operacional Exploratória**: Uma amostra de N=12 constitui estritamente `EXPLORATORY OPERATIONAL EVIDENCE`.
- **Proibição de Linguagem de SLA**:
  - NÃO constitui garantia de latência de população;
  - NÃO constitui SLA conversacional de produção;
  - NÃO oferece robustez estatística para quantis de cauda extrema (p99/p99.9).
- **Tratamento de Percentis**:
  - `Median` (p50): Indicador operacional central útil;
  - `p90 / p95`: Métricas meramente exploratórias (*exploratory tail indicator*), devidamente rotuladas como tal nos artefatos.

---

## 6. Análise do Problema de Censura (Censoring Problem)
Na execução do PR #46, o timeout de 1500ms abortou a requisição em 1490ms antes do recebimento da resposta remota do TypeSafe AI.
Se todos os futuros testes mantiverem o timeout rígido de 1500ms, qualquer requisição com latência real de p.ex. 1600ms a 2200ms sofrerá censura à direita (*right-censoring*), impedindo a observação da verdadeira distribuição de latência do provedor.

### Avaliação de Opções Mínimas:

| Critério | Opção A: Manter 1500ms e medir apenas Completion Rate | Opção B: Deadline Exclusivo de Medição (`MEASUREMENT_ONLY_DEADLINE = 4000ms`) no Harness Sintético | Opção C: Sonda Única com Deadline Estendido seguida de Bateria |
| :--- | :--- | :--- | :--- |
| **Benefício** | Zero alteração de parâmetros operacionais; testa diretamente a conformidade com o teto atual. | Elimina a censura à direita até 4000ms; revela a real mediana e o formato da distribuição. | Permite abortar cedo caso a primeira sonda demonstre latência proibitiva (>4000ms). |
| **Risco** | Alto risco de 100% dos casos abortarem por timeout se a latência real do provedor for ligeiramente superior a 1500ms, sem obter nova evidência útil. | Casos anômalos podem reter a thread de teste até 4000ms antes de abortar. | Complexidade adicional de orquestração condicional em duas etapas. |
| **Alteração de Código de Produção?** | **NÃO** | **NÃO** (parâmetro injetado via factory de staging ou harness de teste) | **NÃO** |
| **Impacto no Runtime de Produção?** | **NENHUM** | **NENHUM** (restrito ao harness de pesquisa de staging) | **NENHUM** |
| **Impacto em Custos?** | Idêntico (12 requisições enviadas) | Idêntico (12 requisições enviadas) | Potencialmente menor se abortar na 1ª requisição |
| **Evidência Obtida** | Apenas limite inferior (latência > 1500ms) e taxa de falha. | **Distribuição empírica real des-censurada** (mediana, desvio, completion rate). | Distribuição parcial se abortar precocemente. |

### Recomendação Técnica: Opção B
Adotar no harness de teste temporário um deadline exclusivo de medição:
`MEASUREMENT_ONLY_DEADLINE = 4000 ms`.
- **Classificação**: `MEASUREMENT_ONLY_DEADLINE` (NÃO é novo timeout de staging, NÃO é timeout de produção, NÃO é SLA).
- **Preservação de Staging Nominal**: `STAGING_SHADOW_TIMEOUT_MS = 1500` permanece o valor nominal não recalibrado até que a análise dos dados autorize eventual decisão.

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
- **Teto Rígido Futuro**: `FUTURE_TYPESAFE_REQUESTS_MAX = 12`
- **Por Caso**: Exatamente 1 despacho de rede por caso, com 0 retries internos (`RETRY = 0`).
- **Guardião em Camadas no Harness de Execução**:
  1. **Guardião Persistente em Disco (Task-Level Sentinel/Counter)**: Arquivo versionável/inspecionável em scratch (`scripts/tmp-006t-typesafe-counter.json`) registrando atomicamente antes e após cada despacho: `caseId`, `timestamp`, `dispatchAttempted`, `completed`. Se a contagem atingir 12, qualquer tentativa subsequente falha imediatamente em runtime.
  2. **Guardião de Despacho em Memória**: Wrapper estrito no `fetch` garantindo no máximo 1 invocação por caso sintético.
  3. **Registro Individual por Caso**: Cada execução salva seu log estruturado individual em JSON com hash do input e status.

---

## 9. Métricas de Latência Planejadas
Para cada uma das 12 execuções, o harness registrará os seguintes campos em artefato estruturado JSON:
- `caseId`: Identificador único do caso sintético (p.ex. `case-lat-001` a `case-lat-012`);
- `lengthClass`: `SHORT`, `MEDIUM` ou `LONGER`;
- `inputCharCount`: Comprimento em caracteres do texto sintético;
- `requestDispatchObserved`: `YES` / `NO`;
- `providerResponseObserved`: `YES` / `NO`;
- `providerModelRequested`: `jev-latest`;
- `providerModelResolved`: Modelo retornado pelo provedor (p.ex. `jev-1.13.0`) ou `NOT OBSERVED`;
- `observerElapsedMs`: Tempo total decorrido no observer em milissegundos;
- `adapterLatencyMs`: Latência registrada internamente pelo adapter (se resposta obtida);
- `timeoutObserved`: `YES` / `NO` (sob o deadline de 4000ms);
- `wouldHaveTimedOutUnder1500Ms`: `YES` / `NO` (se latência > 1500ms);
- `abortObserved`: `YES` / `NO`;
- `schemaOrHttpError`: `YES` / `NO` (detalhe de código HTTP ou erro de parsing);
- **Privacidade de Logs**: Proibido registrar o texto completo do input no log estruturado (`RAW_TRANSCRIPT_LOGGING = PROHIBITED`); apenas metadados técnicos e `caseId` são retidos.

### Métricas Agregadas do Relatório Final:
- `totalCasesExecuted`: 12
- `completionRateUnderMeasurementDeadline`: Percentual com resposta completa sob 4000ms
- `completionRateUnder1500Ms`: Percentual com resposta completa <= 1500ms
- `timeoutRate`: Percentual de requisições abortadas
- `minLatencyMs`: Latência mínima observada
- `medianLatencyMs`: Latência mediana observada
- `p90ExploratoryMs`: Percentil 90 exploratório
- `maxLatencyMs`: Latência máxima observada
- `errorCount`: Falhas de rede, HTTP ou parsing

---

## 10. Orçamento e Faturamento do Experimento Futuro
- **Teto Orçamentário Autorizado**: `BUDGET_CAP_USD = 0.01`
- **Preço de Catálogo Referenciado**: `$0.042 por 1 milhão de tokens de entrada` (documentação oficial do provedor em `https://docs.typesafe.ai/models.md`).
- **Estimativa de Consumo**:
  - 12 requisições * ~500 tokens médios de entrada = ~6.000 tokens.
  - Custo estimado teórico: `$0.000252 USD` (~2.5% do teto de $0.01).
- **Classificação Factual**: `COST_ESTIMATE = NOT VERIFIED` (a consulta ao saldo ou endpoint de faturamento da TypeSafe AI permanece desautorizada para evitar chamadas adicionais de rede).
- **Contenção Orçamentária**: `HARD_BUDGET_CAP = $0.01 USD`. Nenhuma requisição excedente a 12 será realizada sob qualquer circunstância.

---

## 11. Regras de Decisão Futura (Decision Rules)
Após a coleta dos dados empíricos na futura execução autorizada, a decisão sobre calibração do timeout de staging seguirá os seguintes critérios objetivos:

1. **Critério `KEEP_1500MS`**:
   - Se `completionRateUnder1500Ms >= 90%` e `medianLatencyMs < 1100 ms`, o teto atual de 1500ms demonstrou-se operacionalmente viável para staging. Mantém-se `STAGING_SHADOW_TIMEOUT_MS = 1500`.
2. **Critério `CONSIDER_HIGHER_STAGING_TIMEOUT`**:
   - Se `completionRateUnder1500Ms < 50%`, mas `completionRateUnderMeasurementDeadline >= 90%` com `medianLatencyMs` entre 1600ms e 2500ms e variância estável: propor recalibração formal do timeout operacional de staging (p.ex. para 2500ms ou 3000ms) para acomodar a latência intrínseca de rede/inferência do provedor em staging sintético.
3. **Critério `PROVIDER_LATENCY_RISK`**:
   - Se `medianLatencyMs > 3000 ms`, ou se houver timeouts frequentes mesmo sob o deadline de 4000ms (`completionRateUnderMeasurementDeadline < 70%`), classificar a integração como de alto risco de latência. Bloquear qualquer avanço para ativação e reportar inviabilidade para fluxos de voz em tempo real.
4. **Critério `MEASURE_MORE`**:
   - Se houver comportamento bimodal (p.ex. cold starts frequentes de >3500ms intercalados com requisições de 400ms) sem padrão claro por tamanho de texto: propor análise detalhada de cold start antes de qualquer decisão.

---

## 12. Disciplina YAGNI e Condições de Parada (Stop Conditions)
- **CURRENT_REQUIREMENT**: Medir latência de 12 turnos sintéticos através da composição de staging shadow.
- **EXISTING_OPTION**: Harness temporário Vitest executado no workspace de voice (`apps/voice/src/tmp-006t-staging-latency-runner.ts`) invocando a factory já implementada `createStagingSyntheticShadowComposition`.
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
