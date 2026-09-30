# Phase 6: OpenAI Conversation Baseline Benchmark

- **Status**: DATASET FROZEN & VALIDATED — AWAITING EXTERNALLY INJECTED RUNTIME KEY
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

## 4. Auditoria de Segurança e Política de Credenciais (ETAPA B)

Conforme a política mandatória de governança aprovada no PR #30:
- A verificação de presença da credencial é estritamente booleana: `Boolean(process.env.OPENAI_API_KEY)`.
- Fato factual observado no ambiente do processo: `OPENAI_API_KEY_PRESENT = false`.
- **Ação Executada**: **`STOP` imediato**.
- Em estrita conformidade com a regra de processo, **nenhuma tentativa de carregar arquivos `.env` via `--env-file`, dotenv ou leitura de disco foi realizada**.
- A execução das 12 chamadas pagas permanece congelada até que a credencial seja pré-injetada externamente no ambiente do processo pelo operador.
- **Chamadas Reais Realizadas Neste Slice**: 0 (`REAL_OPENAI_CALLS = 0`).
- **Crédito Consumido**: US$ 0.00 (`CREDIT_CONSUMED = 0.00`).

---

## 5. Limitações Metodológicas do Benchmark

1. **Dados Sintéticos**: Casos formulados com empresas e cenários fictícios, sem dados de clientes reais, transcrições telefônicas ou PII.
2. **Amostra Reduzida (N=12)**: Projetada para validação preliminar de viabilidade técnica e custo, sem equivalência a benchmark estatístico de produção.
3. **Isolamento de Áudio**: Medição focada em turnos textuais do modelo, sem áudio PSTN/WebRTC, codecs de telefonia ou síntese de voz (TTS/STT).
4. **Ausência de Jev**: O TypeSafe Jev permanece classificado como `BENCHMARK_CANDIDATE / NOT IMPLEMENTED`. A taxa atual de evasão de modelo principal é categoricamente `0%` (baseline de referência).
