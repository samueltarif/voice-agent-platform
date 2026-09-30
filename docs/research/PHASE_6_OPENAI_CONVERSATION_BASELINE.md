# Phase 6: OpenAI Conversation Baseline Benchmark

- **Status**: BASELINE MEASURED — SYNTHETIC / LIMITED
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

### Tabela de Execução por Caso (N=12)

| Caso | Categoria | Expected Routing | Status | Deltas | Chars | TTFT (ms) | Duração (ms) | Tokens In | Tokens Out | Custo Estimado (USD) | Evento Terminal | Falha Segura / Categoria |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `base-01` | `DETERMINISTIC_CANDIDATE` | `DETERMINISTIC_CANDIDATE` | `PASS` | 12 | 47 | 2911 | 3136 | 78 | 15 | $0.001530 | `completed` | - |
| `base-02` | `DETERMINISTIC_CANDIDATE` | `DETERMINISTIC_CANDIDATE` | `PASS` | 14 | 70 | 1684 | 2279 | 81 | 17 | $0.001660 | `completed` | - |
| `base-03` | `DETERMINISTIC_CANDIDATE` | `DETERMINISTIC_CANDIDATE` | `PASS` | 27 | 105 | 2766 | 3659 | 78 | 30 | $0.002280 | `completed` | - |
| `base-04` | `DETERMINISTIC_CANDIDATE` | `DETERMINISTIC_CANDIDATE` | `PASS` | 14 | 47 | 1699 | 2052 | 85 | 17 | $0.001700 | `completed` | - |
| `base-05` | `GENERATIVE_REQUIRED` | `GENERATIVE_REQUIRED` | `PASS` | 44 | 224 | 1430 | 2472 | 86 | 47 | $0.003210 | `completed` | - |
| `base-06` | `GENERATIVE_REQUIRED` | `GENERATIVE_REQUIRED` | `PASS` | 24 | 138 | 1843 | 2772 | 87 | 27 | $0.002220 | `completed` | - |
| `base-07` | `GENERATIVE_REQUIRED` | `GENERATIVE_REQUIRED` | `PASS` | 20 | 97 | 1020 | 1513 | 87 | 23 | $0.002020 | `completed` | - |
| `base-08` | `GENERATIVE_REQUIRED` | `GENERATIVE_REQUIRED` | `PASS` | 26 | 129 | 2285 | 3010 | 89 | 29 | $0.002340 | `completed` | - |
| `base-09` | `GENERATIVE_REQUIRED` | `GENERATIVE_REQUIRED` | `PASS` | 16 | 80 | 1192 | 1562 | 84 | 19 | $0.001790 | `completed` | - |
| `base-10` | `GENERATIVE_REQUIRED` | `GENERATIVE_REQUIRED` | `PASS` | 25 | 134 | 1989 | 2477 | 90 | 28 | $0.002300 | `completed` | - |
| `base-11` | `SECURITY_CONTROL_SENSITIVE` | `SECURITY_ESCALATE` | `PASS` | 14 | 61 | 2333 | 2847 | 95 | 17 | $0.001800 | `completed` | - |
| `base-12` | `SECURITY_CONTROL_SENSITIVE` | `SECURITY_ESCALATE` | `PASS` | 27 | 142 | 1130 | 2021 | 92 | 30 | $0.002420 | `completed` | - |

### Resumo Métrico Consolidado do Baseline
- **Benchmark Status**: `COMPLETE`
- **Casos Executados / Total**: 12 / 12
- **Falhas Observadas**: 0
- **Retries Executados**: 0 (estritamente zero retries)
- **Total de Tokens de Entrada**: 1032 tokens
- **Total de Tokens de Saída**: 299 tokens
- **Custo Total Estimado**: $0.025270 USD (abaixo do teto autorizado de $0.40)
- **Custo Médio por Turno**: $0.002106 USD
- **Main Model Requests Observadas**: 12
- **Main Model Call Avoidance Rate**: 0% (Baseline de referência)
- **Latência TTFT (Time-To-First-Token)**:
  - **Min**: 1020 ms
  - **Mediana**: 1771 ms
  - **Max**: 2911 ms
  - **Descriptive Sample p95 (N=12, not SLA)**: 2911 ms
- **Duração Total do Turno**:
  - **Min**: 1513 ms
  - **Mediana**: 2475 ms
  - **Max**: 3659 ms
  - **Descriptive Sample p95 (N=12, not SLA)**: 3659 ms
- **Conteúdo de Resposta Gravado em Log**: `NO` (apenas métricas e contagens numéricas)
- **Chamadas de Telefonia (Twilio)**: 0
- **Chamadas de TypeSafe Jev**: 0

---

## 5. Limitações Metodológicas e Comparabilidade

1. **Dados Sintéticos**: Casos formulados com empresas e cenários fictícios, sem dados de clientes reais, transcrições telefônicas ou PII.
2. **Amostra Congelada (N=12)**: Projetada para comparação 1:1 contra TypeSafe Jev sob o mesmo dataset imutável.
3. **Autoridade de Segurança no Adapter**:
   - `ADAPTER_BOUNDARY`: A saída do modelo não possui capacidade de mutação no runtime por construção.
   - `RUNTIME E2E AUTHORITY`: Validada separadamente pelos testes de runtime existentes, não por este benchmark de adapter.
4. **Próxima Etapa**: Congelar estes resultados como linha de base oficial e iniciar a avaliação do TypeSafe Jev contra o mesmo dataset congelado.
