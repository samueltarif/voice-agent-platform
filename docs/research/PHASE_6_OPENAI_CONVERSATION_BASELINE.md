# Phase 6: OpenAI Conversation Baseline Benchmark

- **Status**: BASELINE PARTIAL — NOT COMPARABLE YET
- **Data**: 2026-09-30
- **Branch**: `research/006h-openai-conversation-baseline`
- **PR**: #31

---

## 1. Contexto e Finalidade

Este benchmark estabelece o dataset e o harness reprodutível para mensuração de custo, latência e comportamento conversacional do modelo primário integrado (**OpenAI `gpt-6-astra`** via Chat Completions API), servindo como linha de base (*baseline*) formal e imutável para a futura comparação com o **TypeSafe Jev** (DEC-037 / ADR-018).

O objetivo deste baseline é fornecer métricas empíricas para responder se a introdução futura do Jev:
1. Reduz chamadas desnecessárias ao modelo generativo principal;
2. Reduz o volume de tokens transmitidos ao modelo primário;
3. Reduz o custo operacional combinado da plataforma;
4. Introduz penalidades ou ganhos no Time-To-First-Token (TTFT);
5. Preserva a autoridade determinística e previne *false bypass* ou escalonamentos indevidos.

---

## 2. Metadados e Proveniência do Dataset Congelado

- **Caminho do Dataset**: `scripts/benchmarks/voice/openai-baseline-v1-cases.json`
- **Versão**: `1.0.0`
- **Hash de Congelamento (SHA-256)**: `9ab7cbd2fbfcf508673a700d4a484e0c674d0124766c7b7fa0eee05a573e0d50`
- **Commit do Dataset Congelado**: `b9ed9486c4eeae160a2b5e3940176b643a579bc4`
- **Quantidade de Casos**: Exatamente 12 casos sintéticos.
- **Distribuição Categórica**:
  - `DETERMINISTIC_CANDIDATE`: 4 casos (`base-01` a `base-04`) — Hipótese de bypass futuro.
  - `GENERATIVE_REQUIRED`: 6 casos (`base-05` a `base-10`) — Objeções, descoberta e negociação.
  - `SECURITY_CONTROL_SENSITIVE`: 2 casos (`base-11` e `base-12`) — Injeção de prompt e tentativa de sequestro de autoridade.

---

## 3. Configuração de Provedor e Execução

- **Provedor**: OpenAI (Primary Conversation Model Provider confirmado no PR #30)
- **Modelo**: `gpt-6-astra` (configurado como baseline atual)
- **Superfície de API**: Chat Completions API
- **Reasoning Effort**: `low` (explícito)
- **Max Completion Tokens**: `512` (hard cap validado localmente fail-closed)
- **Temperature**: Omitida (`undefined`)
- **Teto Financeiro Autorizado**: Máximo de US$ 0.40 para os 12 casos (teto matemático de pior caso: ~US$ 0.3168)
- **Limite de Chamadas**: Máximo de 12 chamadas (1 por caso), zero retries.

---

## 4. Execução Controlada do Benchmark e Evidências Observadas

Conforme autorização explícita do operador para carregamento de `.env` em tempo de execução (`node --env-file=.env`):
- `ENV_GIT_IGNORED = YES` (verificado via `git check-ignore .env`).
- `ENV_CONTENT_INSPECTED = NO` (conteúdo de `.env` não foi lido, aberto, impresso ou parseado).
- `OPENAI_API_KEY_PRESENT = true` (detectado via processo de runtime).
- **Harness de Execução**: `node --env-file=.env ./node_modules/vitest/vitest.mjs run packages/integrations/src/openai/openai-baseline-runner.test.ts`.

### Tabela de Execução por Caso

| Caso | Categoria | Expected Routing | Status | Deltas | Chars | TTFT (ms) | Duração (ms) | Tokens In | Tokens Out | Custo (USD) | Evento Terminal | Falha Segura / Categoria |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `base-01` | `DETERMINISTIC_CANDIDATE` | `DETERMINISTIC_CANDIDATE` | `FAIL` | 0 | 0 | `null` | 484 | `NOT_OBSERVED` | `NOT_OBSERVED` | `NOT_VERIFIED` | `failure` | `OpenAI authentication failed or invalid credentials` (401) |
| `base-02` | `DETERMINISTIC_CANDIDATE` | `DETERMINISTIC_CANDIDATE` | `NOT_EXECUTED` | - | - | - | - | - | - | - | - | Interrompido (fail-fast) |
| `base-03` | `DETERMINISTIC_CANDIDATE` | `DETERMINISTIC_CANDIDATE` | `NOT_EXECUTED` | - | - | - | - | - | - | - | - | Interrompido (fail-fast) |
| `base-04` | `DETERMINISTIC_CANDIDATE` | `DETERMINISTIC_CANDIDATE` | `NOT_EXECUTED` | - | - | - | - | - | - | - | - | Interrompido (fail-fast) |
| `base-05` | `GENERATIVE_REQUIRED` | `GENERATIVE_REQUIRED` | `NOT_EXECUTED` | - | - | - | - | - | - | - | - | Interrompido (fail-fast) |
| `base-06` | `GENERATIVE_REQUIRED` | `GENERATIVE_REQUIRED` | `NOT_EXECUTED` | - | - | - | - | - | - | - | - | Interrompido (fail-fast) |
| `base-07` | `GENERATIVE_REQUIRED` | `GENERATIVE_REQUIRED` | `NOT_EXECUTED` | - | - | - | - | - | - | - | - | Interrompido (fail-fast) |
| `base-08` | `GENERATIVE_REQUIRED` | `GENERATIVE_REQUIRED` | `NOT_EXECUTED` | - | - | - | - | - | - | - | - | Interrompido (fail-fast) |
| `base-09` | `GENERATIVE_REQUIRED` | `GENERATIVE_REQUIRED` | `NOT_EXECUTED` | - | - | - | - | - | - | - | - | Interrompido (fail-fast) |
| `base-10` | `GENERATIVE_REQUIRED` | `GENERATIVE_REQUIRED` | `NOT_EXECUTED` | - | - | - | - | - | - | - | - | Interrompido (fail-fast) |
| `base-11` | `SECURITY_CONTROL_SENSITIVE` | `SECURITY_ESCALATE` | `NOT_EXECUTED` | - | - | - | - | - | - | - | - | Interrompido (fail-fast) |
| `base-12` | `SECURITY_CONTROL_SENSITIVE` | `SECURITY_ESCALATE` | `NOT_EXECUTED` | - | - | - | - | - | - | - | - | Interrompido (fail-fast) |

### Resumo Métrico do Benchmark
- **Benchmark Status**: `PARTIAL`
- **Casos Executados / Total**: 0 / 12 (1 tentativa com falha imediata)
- **Falhas Observadas**: 1 (`base-01`)
- **Casos Restantes Não Executados**: 11
- **Retries Executados**: 0 (estritamente zero retries)
- **Uso de Tokens Observado**: `NOT_OBSERVED`
- **Custo Total Estimado**: `NOT_VERIFIED` (Known partial: $0.000000 USD)
- **Main Model Call Avoidance Rate**: `NOT MEASURED` (benchmark não completado)
- **TTFT (ms)**: min=`null`, median=`null`, max=`null`, descriptive p95=`null`
- **Duração Total (ms)**: min=`null`, median=`null`, max=`null`, descriptive p95=`null`
- **Conteúdo de Resposta Gravado em Log**: `NO` (apenas métricas e contagens)
- **Chamadas de Telefonia (Twilio)**: 0
- **Chamadas de TypeSafe Jev**: 0

---

## 5. Limitações Metodológicas e Próximos Passos

1. **Dados Sintéticos**: Casos formulados com empresas e cenários fictícios, sem dados de clientes reais, transcrições telefônicas ou PII.
2. **Autoridade de Segurança no Adapter**:
   - `ADAPTER_BOUNDARY`: A saída do modelo não possui capacidade de mutação no runtime por construção.
   - `RUNTIME E2E AUTHORITY`: Validada separadamente pelos testes de runtime existentes, não por este benchmark de adapter.
3. **Próximo Passo Operacional**: O operador deve atualizar o arquivo `.env` com a credencial real ativa da OpenAI para que os 12 casos possam ser reexecutados sequencialmente em novo ciclo.

