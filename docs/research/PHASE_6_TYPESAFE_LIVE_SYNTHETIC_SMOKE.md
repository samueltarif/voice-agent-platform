# Phase 6 — TypeSafe Jev Concrete Adapter — Live Synthetic Provider Smoke

## 1. Objetivo & Escopo do Teste
- **Objetivo**: Executar chamada HTTP real e controlada ao TypeSafe AI utilizando a implementação concreta do adapter `TypeSafeJevTurnDecisionAdapter` (`packages/integrations/src/typesafe/typesafe-jev-turn-decision-adapter.ts`).
- **Verificações Realizadas**:
  - Autenticação real com token de API;
  - Conectividade de rede com o endpoint de produção;
  - Conformidade do payload de request com o schema oficial do endpoint;
  - Conformidade do response body com os tipos esperados (modelo retornado, answers em Noul);
  - Resolução do alias de modelo (`jev-latest` -> modelo versionado concreto);
  - Extração válida das pontuações em `[0, 1]`;
  - Medição da latência de ponta a ponta observada pelo adapter.
- **Escopo Deliberadamente Restrito**:
  - NÃO constitui benchmark ou teste de acurácia;
  - NÃO autoriza tráfego de clientes (`CUSTOMER_TRAFFIC = PROHIBITED`);
  - NÃO autoriza modo SHADOW em runtime (`SHADOW_LIVE_ENABLED = NO`);
  - NÃO autoriza modo ativo (`ACTIVE_GUARDED = BLOCKED`);
  - NÃO realiza fiação em produção (`ADAPTER_RUNTIME_WIRED = NO`).

---

## 2. Metadados da Execução
- **Data**: 2026-10-01
- **Branch**: `research/006q-typesafe-live-synthetic-smoke`
- **Provedor**: TypeSafe AI
- **Endpoint**: `POST https://api.typesafe.ai/v1/systemone`
- **Documentação Oficial Consultada**:
  - `https://docs.typesafe.ai/llms.txt` (Índice geral de documentação)
  - `https://docs.typesafe.ai/api.md` (Referência da API HTTP e schemas)
  - `https://docs.typesafe.ai/models.md` (Catálogo de modelos, aliases e preços)
- **Classificação do Input**: `SYNTHETIC / NON-CUSTOMER`
  - Frase utilizada: `"Pode repetir a última frase para mim, por favor?"`
  - Verificação de Isolamento: A frase foi verificada e confirmada ausente dos datasets congelados de calibração (`jev-calibration-v2-cases.json`), holdout bloqueado e baselines da OpenAI.
- **Holdout de Pesquisa**: `LOCKED_HOLDOUT = CONSUMED` | `DO_NOT_REUSE_FOR_TUNING = YES` (nenhum dado de holdout foi reutilizado).

---

## 3. Configuração da Requisição & Hash Atômico
- **Modelo Solicitado**: `jev-latest`
- **Conjunto de Questões**: 3 questões atômicas Noul (`JEV_ROUTING_ATOMIC_V1`).
- **Atomic V1 Hash**:
  - SHA-256 Esperado: `3fecf9ce82ad600a74549d3459fe2b2b516fc3bd7b5fff33bf5b850cd48e8725`
  - SHA-256 Calculado Localmente: `3fecf9ce82ad600a74549d3459fe2b2b516fc3bd7b5fff33bf5b850cd48e8725`
  - `ATOMIC_HASH_MATCH = YES`
- **Guardião de Contagem de Requisições**: Enforce em memória estrito de no máximo 1 requisição HTTP por execução de processo antes do envio à rede (`REQUEST_COUNT <= 1`).
- **Política de Repetição**: `NO RETRY` no adapter (zero retries internos).
- **Deadline do Harness de Teste**: `SMOKE_HARNESS_ABORT_MS = 15000` (apenas segurança de processo de teste; `JEV_TIMEOUT_MS = NOT SELECTED`).

---

## 4. Resultados Observados
- **Resultado Funcional do Smoke**: `PASS`
- **Resposta Válida de Provedor Observada**: `YES`
- **Nome do Provedor no Adapter**: `typesafe-jev`
- **Modelo Solicitado**: `jev-latest`
- **Modelo Efetivamente Resolvido**: `jev-1.13.0`
- **Pontuações Extraídas**:
  - `deterministicScore`: `0.34` (finito em `[0, 1]`)
  - `generativeScore`: `0.32` (finito em `[0, 1]`)
  - `securityScore`: `0.02` (finito em `[0, 1]`)
- **Latência de Ponta a Ponta Observada pelo Adapter**: `415 ms`
- **Limpeza de Helpers**: O harness temporário `scripts/tmp-typesafe-live-smoke.mjs` foi excluído do repositório imediatamente após a execução.

---

## 5. Auditoria de Custos & Orçamento
- **Teto Orçamentário Autorizado**: `BUDGET_CAP_USD = 0.01`
- **Preço Oficial de Catálogo**: `$0.042 por 1 milhão de tokens de entrada` (tokens de saída gratuitos).
- **Custo Estimado Pré-Chamada**: `PRECALL_ESTIMATED_COST_USD = 0.00003` (~500 tokens de entrada, muito abaixo do teto de $0.01).
- **Custo Efetivamente Cobrado**: `ACTUAL_BILLED_COST_USD = NOT VERIFIED` (nenhuma API de faturamento foi consultada para evitar chamadas adicionais).
- **Conformidade Orçamentária**: `BUDGET_CAP_BREACH = NOT OBSERVED`.

---

## 6. Limitações Inegociáveis & Estado Pós-Smoke
- **Isolamento de Provedores Pagos**:
  - Chamadas OpenAI neste teste: `0`
  - Chamadas Twilio neste teste: `0`
- **Proteção de Dados & Privacidade**:
  - `CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE = NOT CLEARED`
  - `CUSTOMER_TRAFFIC = PROHIBITED`
- **Governança do Runtime**:
  - `ADAPTER_RUNTIME_WIRED = NO` (zero injeções no composition root)
  - `SHADOW_LIVE_ENABLED = NO` (modo shadow em tempo real permanece desativado)
  - `DEFAULT_AUXILIARY_FEATURE_MODE = DISABLED`
  - `ACTIVE_GUARDED = BLOCKED`
  - `KNOWN_DETERMINISTIC_HANDLERS = 0`
  - `ACTIVE_DETERMINISTIC_BYPASS_READINESS = BLOCKED`
  - `SHADOW_MAX_CONCURRENCY_OPERATIONAL = NOT SELECTED`
  - `JEV_TIMEOUT_MS = NOT SELECTED`

---

## 7. Qualificação de Integridade de Execução (Execution Integrity Qualification)
- **Execuções do Processo de Teste**: O processo do harness temporário foi executado duas vezes (`node --env-file=.env scripts/tmp-typesafe-live-smoke.mjs`), com recriação do script efêmero entre elas.
- **Resposta de Provedor Observada**: Uma resposta válida da TypeSafe AI foi obtida e comprovada com sucesso (`jev-1.13.0`, pontuações `0.34`, `0.32`, `0.02`, latência `415 ms`).
- **Escopo do Guardião de Requisições**: O guardião de contagem em memória (`requestCount <= 1`) opera exclusivamente no escopo do processo local (`PER_PROCESS`). Uma nova inicialização do processo reseta a variável em memória.
- **Contagem Agregada de Requisições**: A contagem agregada de requisições enviadas à rede em ambas as execuções é classificada rigorosamente como `TOTAL_TYPESAFE_REQUESTS_DURING_006Q = NOT VERIFIED`. Não há evidência durável versionada em repositório que comprove se a primeira execução terminou estritamente antes do despacho à rede ou se gerou tráfego.
- **Ausência de Retry**: O adapter concreto não realiza retries internos (`NO RETRY`), e nenhuma segunda execução de provedor é autorizada para fins de reconciliação documental.
- **Classificação Factual**:
  - `SMOKE_FUNCTIONAL_RESULT = PASS`
  - `SMOKE_PROCESS_DEVIATION = YES`
  - `SMOKE_EXECUTION_INTEGRITY = NOT FULLY VERIFIED`
  - `BUDGET_CAP_BREACH = NOT OBSERVED`
