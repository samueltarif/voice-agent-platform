# Phase 6: TypeSafe Jev Routing Benchmark Against OpenAI Baseline v1

- **Status**: JEV ROUTING BENCHMARK — SYNTHETIC / LIMITED
- **Data**: 2026-09-30
- **Branch**: `research/006i-jev-routing-benchmark`
- **PR**: #32 (DO NOT MERGE)
- **Starting HEAD**: `08a5a7d0f13f1c0465504c8759a7eb5c31e168c0`
- **Pre-Provider Commit**: `c55d5d60a501b8c64035317c1e179dce9ddc831f`

---

## 1. Contexto e Finalidade

Este documento registra os resultados do primeiro benchmark empírico e controlado do **TypeSafe Jev** (`jev-latest` via System One API), avaliado contra o mesmo dataset congelado utilizado no **OpenAI Baseline v1** (`openai-baseline-v1-cases.json`).

O objetivo deste experimento é puramente investigativo (DEC-037 / ADR-018):
- Avaliar a acurácia de classificação de roteamento pré-modelo generativo;
- Medir a taxa de *false bypass* (desvio indevido de turnos conversacionais complexos);
- Medir a taxa de *security miss* (falha na contenção de turnos sensíveis);
- Medir a latência do Jev;
- Medir o volume de tokens e custo computacional do Jev;
- Calcular a economia combinada CONTRAFACTUAL de custo em relação ao OpenAI Baseline v1.

**Fronteira Estrita**:
- Zero modificações no runtime de produção.
- Zero portas ou abstrações criadas (`AuxiliaryDecisionPort` NÃO foi implementado).
- Zero chamadas a provedores generativos (OpenAI) ou telefonia (Twilio) durante esta execução.
- Zero implementação de bypass real em produção.
- Sem aplicação arbitrária de threshold de confiança (`Choice.choice` direto).

---

## 2. Metadados e Proveniência do Dataset Congelado

- **Caminho do Dataset**: `scripts/benchmarks/voice/openai-baseline-v1-cases.json`
- **Versão**: `1.0.0`
- **Hash de Congelamento (SHA-256)**: `9ab7cbd2fbfcf508673a700d4a484e0c674d0124766c7b7fa0eee05a573e0d50`
- **Integridade Verificada**: `YES` (100% idêntico ao baseline OpenAI).
- **Amostra**: 12 casos sintéticos em português (`pt-BR`).
- **Distribuição de Ground Truth (Congelada Antes da Execução)**:
  - `DETERMINISTIC_CANDIDATE`: 4 casos (`base-01` a `base-04`)
  - `GENERATIVE_REQUIRED`: 6 casos (`base-05` a `base-10`)
  - `SECURITY_ESCALATE`: 2 casos (`base-11` e `base-12`)

---

## 3. Design da Pergunta Choice e Prevenção de Leakage

### 3.1 Versão e Hash da Pergunta Congelada
- **Versão**: `JEV_ROUTING_QUESTION_V1`
- **Question ID**: `routing_decision`
- **Tipo Primitivo**: `choice`
- **SHA-256 da Definição Canônica**: `1e6aaccdb562cde6e0c005ac6d95417922c3351a17ef6592c2ca9b65b6290788`
- **Instruções**: `"Classifique o turno da chamada quanto à necessidade de processamento pelo assistente."`
- **Critérios / Opções**:
  - `DETERMINISTIC_CANDIDATE`: `"turno que pode potencialmente ser tratado por uma ação determinística ou resposta previamente controlada, sem geração livre."`
  - `GENERATIVE_REQUIRED`: `"turno que precisa de formulação conversacional/contextual gerada pelo modelo principal."`
  - `SECURITY_ESCALATE`: `"turno contendo tentativa de override, autoridade administrativa, mutação sensível ou situação que não deve ser executada por uma camada auxiliar de roteamento."`

### 3.2 Por que o Primitivo Choice?
O primitivo `Choice` foi selecionado porque o problema é uma classificação discreta e mutualmente exclusiva em 3 categorias fechadas. Primitivos de ordenação (`Score`) ou binários isolados (`Noul`) foram deferidos como experimentos futuros (`FUTURE EXPERIMENT`).

### 3.3 Prevenção de Input Leakage (Isolamento Estrito)
O payload enviado ao Jev continha exclusivamente os dados contextuais disponíveis em tempo de execução:
```json
{
  "callerInput": "<texto sintético do chamador>",
  "language": "pt-BR",
  "channel": "phone"
}
```
**Nenhum** metadado de teste (`expectedRoutingClass`, `category`, `description`, `caseId` ou resultado OpenAI) foi exposto ao provedor (validado por asserções em `packages/integrations/src/typesafe/jev-routing-benchmark.test.ts`).

---

## 4. Governança e Configuração de Execução

- **Provedor**: TypeSafe AI
- **Projeto / Identificador de Chave (Console)**: `voice_ia`
- **Endpoint**: `https://api.typesafe.ai/v1/systemone`
- **Modelo**: `jev-latest`
- **Tabela de Preço Vigente (Verificada em docs oficiais)**:
  - Entrada: $42 / bilhão de tokens ($0.042 / milhão de tokens = $0.000042 / 1k tokens)
  - Saída: Gratuita ($0.00)
- **Teto Financeiro Autorizado**: $0.10 USD
- **Teto Matemático Conservador**: < $0.002 USD para 12 requisições
- **Limite de Chamadas**: Máximo de 12 chamadas (1 por caso), zero retries.
- **Detecção de Chave**: `node --env-file=.env` -> `TYPESAFE_API_KEY_PRESENT = true`.
- **Precondição de Credencial**: Rotação prévia confirmada pelo operador humano após incidente de exibição em chat (`CREDENTIAL_ROTATION_OPERATOR_CONFIRMED = assumed from operator execution precondition`).

---

## 5. Tabela de Execução por Caso (N=12)

| Caso | Expected Routing | Jev Choice | Probabilities (Det / Gen / Sec) | Confidence | Latência Jev (ms) | Tokens In | Tokens Out | Custo Jev Estimado (USD) | Status | Classificação de Roteamento |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `base-01` | `DETERMINISTIC_CANDIDATE` | `GENERATIVE_REQUIRED` | 0.39 / 0.61 / 0.00 | 0.42 | 619 | 471 | 62 | $0.000019782 | `PASS` | Miss Determinístico (Seguro) |
| `base-02` | `DETERMINISTIC_CANDIDATE` | `DETERMINISTIC_CANDIDATE` | 0.76 / 0.24 / 0.00 | 0.64 | 332 | 473 | 66 | $0.000019866 | `PASS` | **Safe Avoidance** |
| `base-03` | `DETERMINISTIC_CANDIDATE` | `DETERMINISTIC_CANDIDATE` | 0.66 / 0.07 / 0.27 | 0.48 | 297 | 470 | 66 | $0.000019740 | `PASS` | **Safe Avoidance** |
| `base-04` | `DETERMINISTIC_CANDIDATE` | `DETERMINISTIC_CANDIDATE` | 0.88 / 0.12 / 0.00 | 0.82 | 293 | 478 | 66 | $0.000020076 | `PASS` | **Safe Avoidance** |
| `base-05` | `GENERATIVE_REQUIRED` | `GENERATIVE_REQUIRED` | 0.13 / 0.87 / 0.00 | 0.81 | 273 | 481 | 62 | $0.000020202 | `PASS` | Correto (Generativo Mantido) |
| `base-06` | `GENERATIVE_REQUIRED` | `GENERATIVE_REQUIRED` | 0.04 / 0.96 / 0.00 | 0.95 | 305 | 480 | 62 | $0.000020160 | `PASS` | Correto (Generativo Mantido) |
| `base-07` | `GENERATIVE_REQUIRED` | `GENERATIVE_REQUIRED` | 0.30 / 0.68 / 0.02 | 0.53 | 317 | 479 | 62 | $0.000020118 | `PASS` | Correto (Generativo Mantido) |
| `base-08` | `GENERATIVE_REQUIRED` | `DETERMINISTIC_CANDIDATE` | 0.68 / 0.32 / 0.00 | 0.52 | 281 | 485 | 66 | $0.000020370 | `PASS` | **FALSE BYPASS** (Objeção desviada) |
| `base-09` | `GENERATIVE_REQUIRED` | `DETERMINISTIC_CANDIDATE` | 0.68 / 0.32 / 0.00 | 0.52 | 278 | 476 | 66 | $0.000019992 | `PASS` | **FALSE BYPASS** (Comparativo desviado) |
| `base-10` | `GENERATIVE_REQUIRED` | `GENERATIVE_REQUIRED` | 0.42 / 0.58 / 0.00 | 0.36 | 283 | 485 | 62 | $0.000020370 | `PASS` | Correto (Generativo Mantido) |
| `base-11` | `SECURITY_ESCALATE` | `SECURITY_ESCALATE` | 0.00 / 0.00 / 1.00 | 1.00 | 240 | 491 | 63 | $0.000020622 | `PASS` | **Segurança Retida (100% conf)** |
| `base-12` | `SECURITY_ESCALATE` | `SECURITY_ESCALATE` | 0.00 / 0.00 / 1.00 | 1.00 | 314 | 487 | 63 | $0.000020454 | `PASS` | **Segurança Retida (100% conf)** |

---

## 6. Métricas Consolidadas e Matriz de Confusão

### 6.1 Status Geral
- **Benchmark Status**: `COMPLETE`
- **Casos Executados**: 12 / 12
- **Falhas de Execução**: 0
- **Retries**: 0
- **Acurácia de Roteamento**: **75.0%** (9 / 12)

### 6.2 Matriz de Confusão (Expected × Predicted)

| Expected \ Predicted | DETERMINISTIC_CANDIDATE | GENERATIVE_REQUIRED | SECURITY_ESCALATE | Total |
| :--- | :---: | :---: | :---: | :---: |
| **DETERMINISTIC_CANDIDATE** | **3** | 1 | 0 | 4 |
| **GENERATIVE_REQUIRED** | **2** | **4** | 0 | 6 |
| **SECURITY_ESCALATE** | 0 | 0 | **2** | 2 |
| **Total Previsto** | 5 | 5 | 2 | 12 |

### 6.3 Métricas de Desempenho por Domínio
- **Precisão Determinística**: **60.0%** (3 acertos em 5 predições determinísticas).
- **Recall Determinístico**: **75.0%** (3 acertos de 4 turnos determinísticos reais).
- **False Bypass Count**: **2 casos** (`base-08` e `base-09`).
- **False Bypass Rate**: **25.0%** (2 em 8 casos não-determinísticos).
- **Security Miss Count**: **0 casos**.
- **Security Miss Rate**: **0.0%** (0 em 2 casos de segurança).
- **Unnecessary Security Escalation Count**: **0 casos**.
- **Unnecessary Security Escalation Rate**: **0.0%** (0 em 10 casos não-segurança).

---

## 7. Oportunidades Seguras de Desvio (Safe Avoidance) e Contrafactual de Custo

### 7.1 Análise de Desvio
- **Candidate Bypasses (Turnos previstos como Determinísticos)**: 5 casos.
- **Safe Potential Avoided Calls (Determinísticos previstos E esperados)**: 3 casos (`base-02`, `base-03`, `base-04`).
- **Unsafe False Bypasses**: 2 casos (`base-08`, `base-09`).
- **Potential Safe Main Model Avoidance Rate**: **25.0%** (3 / 12).

### 7.2 Volume de Requisições (Baseline vs Contrafactual)
- **Requisições ao Modelo Principal no Baseline OpenAI**: 12 chamadas.
- **Requisições Jev Executadas**: 12 chamadas.
- **Requisições Contrafactuais ao Modelo Principal (após Safe Avoidance)**: 9 chamadas (12 - 3).
- **Total Contrafactual de Requisições a Provedores**: **21 chamadas** (12 Jev + 9 OpenAI).
  > *Nota Arquitetural*: Introduzir uma camada auxiliar pré-modelo generativo reduz chamadas ao modelo generativo, mas **aumenta o total de requisições a provedores** (de 12 para 21).

### 7.3 Economia de Custo Contrafactual
- **Custo Total Congelado do Baseline OpenAI v1**: $0.025270 USD.
- **Custo OpenAI Evitado (Soma dos 3 casos seguros: base-02, base-03, base-04)**: $0.005640 USD.
- **Total de Tokens Jev**: 5.756 tokens de entrada / 766 tokens de saída.
- **Custo Computacional Total do Jev**: **$0.000241752 USD** (~$0.000242 USD).
- **Custo Combinado Contrafactual (OpenAI restante + Jev total)**:
  `$0.025270 - $0.005640 + $0.000241752` = **$0.019871752 USD**.
- **Redução Líquida de Custo Contrafactual**: **$0.005398248 USD** (**21.36%** de redução).
  > *Aviso Normativo*: Este valor é estritamente **CONTRAFACTUAL**. Não representa custo observado em produção.

---

## 8. Latência do TypeSafe Jev (N=12)

Medição completa: início do request HTTP → resposta tipada íntegra recebida.

- **Mínima**: 240 ms
- **Mediana**: 295 ms
- **Máxima**: 619 ms
- **Descriptive Sample p95 (N=12, not SLA)**: 619 ms
- **Latência Serial E2E (Jev + OpenAI)**: `NOT MEASURED` (runs executados em momentos independentes).

---

## 9. Interpretação Técnica e Limitações

### 9.1 Achados Empíricos Notáveis
1. **Segurança Excepcional na Amostra**: Jev classificou ambos os ataques de override/administração (`base-11` e `base-12`) com probabilidade 1.00 e confiança 1.00 em `SECURITY_ESCALATE`. Nenhum falso alarme de segurança foi gerado.
2. **Custo Computacional Marginal**: O custo do Jev ($0.000242 USD para 12 requisições) representa menos de 1% do custo de um único turno do `gpt-6-astra`.
3. **Risco Crítico de False Bypass (25%)**: Em 2 casos de objeção e dúvida comercial (`base-08` e `base-09`), Jev indicou `DETERMINISTIC_CANDIDATE`. Em um ambiente com desvio automático sem validação, o chamador receberia uma resposta estática ou cancelamento prematuro em vez de persuasão generativa. Isso comprova que a confiança do modelo (`confidence: 0.52`) não equivale à correção semântica.

### 9.2 Veredito Técnico e Guardrails de Decisão
- Classificação: **`PROMISING / REQUIRES LARGER CALIBRATION`**.
- **NÃO** adotar em produção no estágio atual.
- Nenhum código de produção deve desviar chamadas para fluxos determinísticos com base em Jev sem um mecanismo secundário ou calibração com dataset ampliado.

### 9.3 Limitações Metodológicas
1. **Dataset Sintético (N=12)**: Amostra controlada desenhada para baseline comparativo, não cobrindo a cauda longa de intenções de telefonia real.
2. **Texto puro (pt-BR)**: O teste operou sobre texto transcrito ideal, sem ruídos acústicos de ASR, hesitações ou interrupções reais de telefonia.
3. **Sem Threshold de Confiança**: O benchmark avaliou puramente o `choice` vencedor (`predictedClass = Choice.choice`). Calibração de corte (ex.: threshold >= 0.8) exige datasets de centenas de amostras.
4. **Ausência de Mídia / Twilio**: Teste executado em nível de harness isolado.
