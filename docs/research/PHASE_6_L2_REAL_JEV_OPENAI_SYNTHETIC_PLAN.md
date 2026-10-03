# Phase 6: L2 Real Jev + Real OpenAI + Synthetic Transcript Integration Plan

> **Documento**: `docs/research/PHASE_6_L2_REAL_JEV_OPENAI_SYNTHETIC_PLAN.md`<br />
> **Status**: `PLAN DESIGNED / NOT EXECUTED`<br />
> **Data**: 2026-10-03<br />
> **Prompt de Origem**: `PROMPT-006AN-L2-REAL-JEV-OPENAI-SYNTHETIC-PLANNING-001`<br />
> **Fase**: Phase 6 (Voice Model Routing & Jev Evaluation)<br />
> **Classificação**: `INTEGRATION_STUDY_PLAN`<br />
> **Invariante Formal de Planejamento**: ZERO chamadas a provedores neste slice (TypeSafe = 0, OpenAI = 0, Twilio = 0). ZERO dados de clientes. ZERO acesso a holdout. Frozen Policy V1 inalterada. `ACTIVE_GUARDED = BLOCKED`.

---

## 1. Purpose & Objectives (Propósito e Objetivos)

Este documento estabelece o plano arquitetural, salvaguardas de governança, desenho do dataset sintético e limites operacionais para a validação integrada **L2 (Real Jev + Real OpenAI + Synthetic Transcript)** do subsistema de voz na Fase 6.

O propósito do L2 é validar o comportamento integrado de ponta a ponta entre:
```
synthetic caller transcript
  → application capability matcher (Matcher-First)
  → real TypeSafe Jev (modelo auxiliar)
  → Frozen Policy V1 (classificação determinística)
  → route ownership (single-owner)
  → real OpenAI (modelo conversacional principal, acionado EXCLUSIVAMENTE quando generative route detém o turno)
  → in-memory session state / fake transport
```

### 1.1 Objetivo Principal
Validar em condições reais de rede externa que os dois provedores operam harmoniosamente sob as invariantes de roteamento do coordenador supervisionado (`GuardedTurnRoutingCoordinator`) e do orquestrador conversacional (`ConversationOrchestrator`), preservando o isolamento e o ownership determinístico sem necessidade de telefonia real.

---

## 2. Explicit Non-Goals (O que o L2 NÃO é)

Para evitar qualquer desvio arquitetural ou violação de governança, os seguintes limites são absolutos:
1. **NÃO é Accuracy Benchmark**: O L2 não mede acurácia do Jev nem taxa de acerto do modelo principal.
2. **NÃO recalibra a Frozen Policy**: Nenhum limiar (`T_SECURITY = 0.56`, `T_DETERMINISTIC = 0.70`, `T_GENERATIVE = 0.35`) será alterado com base no L2.
3. **NÃO é Tail Latency Study**: O tamanho amostral é voltado para integração funcional, não para SLAs estatísticos de cauda (`p99/p99.9`).
4. **NÃO utiliza nem abre o Locked Holdout**: O holdout canônico de 40 casos permanece estritamente isolado (`LOCKED_HOLDOUT = CONSUMED`).
5. **NÃO conecta banco de dados real**: A execução opera com `InMemoryCallSessionStore` e `InMemoryConversationHistoryStore`.
6. **NÃO utiliza telefonia real nem Twilio**: Nenhuma chamada telefônica, stream de áudio ou conta Twilio será utilizada (`TWILIO_CALLS = 0`).
7. **NÃO processa dados de clientes**: Proibida qualquer transcrição real de cliente (`CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE = NOT CLEARED`).
8. **NÃO ativa `ACTIVE_GUARDED` no runtime**: O modo nominal de produção permanece fail-closed (`ACTIVE_GUARDED = BLOCKED`).
9. **NÃO seleciona timeout ou concorrência de produção**: Decisões de produção exigem revisão arquitetural e canary subsequente.

---

## 3. Current Evidence Baseline (Evidências Atuais Observadas)

O L2 constrói sobre os resultados formais dos gates anteriores:
- **L0 (Offline Fakes)**: `COMPLETE` (PR #61, 16 testes em `guarded-turn-routing.test.ts` e fakes de orquestração).
- **L1A (Model Identity Smoke)**: `EXECUTED / PASS` (PR #64, N=20/20 exact matches para `jev-1.13.0`, SHA-256 `698c5e2a3b91...`).
- **L1B (Synthetic Latency Study)**: `EXECUTED / PASS_COMPLETE` (PR #66, N=100/100 sucessos, 100/100 matches `jev-1.13.0`, 0 falhas, 0 timeouts, mediana 257ms, p95 325ms, SHA-256 `f087a6e3ad83...`).
- **Model Drift Runtime Guard**: `IMPLEMENTED / TESTED LOCALLY` no adapter TypeSafe (`expectedProviderModel`, `OPTION_B`).
- **OpenAI Adapter Baseline**: `IMPLEMENTED / TESTED LOCALLY` (`OpenAiConversationModelAdapter`, streaming SSE, mapeamento seguro de erros).

---

## 4. Architecture & Harness Design (Arquitetura e Harness Mínimo)

### 4.1 YAGNI Decision
- **CURRENT_REQUIREMENT**: Validar a interação funcional sequencial real entre TypeSafe Jev e OpenAI sob a lógica do coordenador de roteamento.
- **EXISTING_OPTION**: Reutilizar as classes de domínio canônicas existentes (`GuardedTurnRoutingCoordinator`, `ConversationOrchestrator`, `DeterministicResponseDeliveryCoordinator`) injetando os adapters reais (`TypeSafeJevTurnDecisionAdapter`, `OpenAiConversationModelAdapter`) e fakes em memória para componentes de infraestrutura (`InMemoryCallSessionStore`, `InMemoryConversationHistoryStore`, `FakeVoiceTransport`).
- **MINIMAL_OPTION**: Um runner dedicado e autocontido em `scripts/benchmarks/voice/run-jev-openai-l2-synthetic-integration.mjs` que itera sequencialmente sobre o dataset sintético, registra chamadas por provedor e gera artefato de resultados sanitizado.
- **PROIBIÇÕES**: Não criar frameworks genéricos de benchmark, filas assíncronas, pools de workers, novas abstrações de roteamento ou novos proxies de provedor.

### 4.2 Fluxo de Execução do Harness por Caso
1. Inicializar sessão sintética em memória com `runtimeState = 'ACTIVE'`.
2. Interceptar evento `user.speech.final` com o transcript sintético do caso.
3. Avaliar `matchesOperatingHoursCapability(callerTranscript)`:
   - Se `false`: Jev é suprimido (0 chamadas). Orquestrador direciona para `streamTurn()` via OpenAI (1 chamada).
   - Se `true`: Jev é consultado via adapter real (1 chamada).
4. Em caso de avaliação do Jev:
   - Se `SECURITY_ESCALATE`: entrega resposta canônica estática via fake transport; OpenAI = 0.
   - Se `DETERMINISTIC_CANDIDATE` e horários configurados: entrega resposta determinística fixa via fake transport; OpenAI = 0.
   - Se `GENERATIVE_REQUIRED`: fallback transparente para `streamTurn()` da OpenAI via fake transport (1 chamada).
5. Registrar contadores reais de requisições, latências observadas e modelos retornados.

---

## 5. Synthetic Dataset Specification (Dataset Sintético L2)

- **Caminho**: `scripts/benchmarks/voice/jev-openai-l2-synthetic-integration-v1-cases.json`
- **Versão**: `1.0.0`
- **Amostra Total**: `N = 12` casos sintéticos.
- **SHA-256 Congelado**: `8428006c10912be7d22cb915ecaa7ba7cb17aafd98d161af27b1c69237b4934f`
- **Justificativa Amostral**: L2 é um gate de integração funcional qualitativa entre dois provedores externos e o runtime determinístico, não um estudo estatístico de latência (papel desempenhado pelo L1B com N=100). Uma bateria concisa de 12 casos permite cobertura de todos os ramos da árvore de roteamento sem queima desnecessária de chamadas ou orçamento.

### 5.1 Distribuição de Categorias (Candidate Case Groups)

| Grupo | Classe de Estímulo Pretendida | N | Matcher Esperado | Jev Esperado | Rota Pretendida |
|---|---|---|---|---|---|
| **Group A** | `KNOWN_CAPABILITY_DETERMINISTIC` | 3 | `true` | 1 chamada | `DETERMINISTIC_RESPONSE` (OpenAI = 0) |
| **Group B** | `KNOWN_CAPABILITY_GENERATIVE_LIKE` | 4 | `true` | 1 chamada | `GENERATIVE` via Jev (OpenAI = 1) |
| **Group C** | `SECURITY_SENSITIVE` | 2 | `false` (allowlist estrita) | 0 chamada | `GENERATIVE` fail-open ou bloqueio |
| **Group D** | `UNMATCHED_CAPABILITY_CONTROL` | 3 | `false` | 0 chamada (Matcher-First) | `GENERATIVE` direto (OpenAI = 1) |

> [!NOTE]
> **Separação entre Intenção e Runtime**:
> `intendedStimulusClass` registra a hipótese do estímulo; `observedRuntimeRoute` registrará o caminho factual percorrido no runtime. Divergências semânticas são normais em modelos probabilísticos e não constituem defeito de integração.

---

## 6. Critical Routing Invariants & Verification (Invariantes Críticas)

As seguintes invariantes têm precedência sobre a conclusão das chamadas:
1. **Matcher-First Invariant**:
   - Se `matchesOperatingHoursCapability(callerTranscript) === false` → Jev request count = `0`.
2. **Deterministic Route Invariant**:
   - Se rota determinística for assumida (`DETERMINISTIC_RESPONSE`) → OpenAI request count = `0`.
3. **Security Route Invariant**:
   - Se rota de segurança for assumida (`SECURITY_BLOCKED`) → OpenAI request count = `0`, tools = `0`, handoff = `0`, chamada permanece ativa em memória.
4. **Generative Required Route Invariant**:
   - Se Jev classificar `is_generative_required` ou `is_deterministic_candidate < 0.70` → OpenAI request count = exatamente `1`.
5. **Single-Owner Invariant**:
   - Cada turno tem exatamente UM owner de resposta: determinístico, segurança ou generativo. Nunca múltiplas respostas concorrentes.

---

## 7. Core L2 Success Condition (Condição Essencial de Sucesso)

Para comprovar seu propósito de integração conjunta, a futura execução live do L2 deve observar **obrigatoriamente pelo menos UM caso** onde:
```
matcherResult === true
  AND real Jev called === YES
  AND Frozen Policy observed === GENERATIVE_REQUIRED
  AND real OpenAI called === YES
  AND OpenAI response completed === YES
  AND fake transport completed === YES
```
Se essa cadeia conjunta não ocorrer naturalmente em nenhum caso:
- `L2_CORE_CHAIN = NOT OBSERVED`
- O resultado NÃO poderá ser classificado como `PASS_COMPLETE`.
- É proibido forçar chamada, reajustar limiares ou reutilizar holdout. Uma análise arquitetural humana será obrigatória.

---

## 8. Provider Models & Authority (Autoridade de Modelos)

### 8.1 TypeSafe Jev
- **Modelo Solicitado**: `jev-1.13.0`
- **Modelo Esperado**: `jev-1.13.0`
- **Verificação de Identidade**: Forçada via `expectedProviderModel` no adapter (`OPTION_B`). Mismatch lança `TypeSafeModelIdentityMismatchError` e interrompe a execução sem retry.
- **Imutabilidade de Pesos**: `NOT VERIFIED` (limite contratual do provedor).

### 8.2 OpenAI
- **Modelo Configurado**: Configurado via `OpenAiModelConfigInput.modelId` ou variável de ambiente `OPENAI_CONVERSATION_MODEL` (baseline histórico de documentação: `gpt-6-astra`).
- **API Surface**: Streaming via endpoint `/chat/completions` (`stream: true`, Server-Sent Events).
- **Visibilidade de Identidade de Modelo**: `OPENAI_RESPONSE_MODEL_IDENTITY = NOT OBSERVABLE VIA CURRENT SURFACE`.
  - *Justificativa Factual*: O adapter atual (`OpenAiConversationModelAdapter` e `streamFromChunks`) consome deltas de texto e uso de tokens, mas a interface `ModelStreamEvent` do pacote contracts não expõe o campo `model` dos chunks SSE. Em conformidade com as regras de YAGNI e não-invenção de guards, esse status é registrado fatualmente como não observável pela superfície atual.
- **Revalidação Pré-Live**: O modelo e preços devem ser checados contra fontes oficiais imediatamente antes da futura autorização live.

---

## 9. Call Budget & Cost Model (Orçamento de Chamadas e Custos)

### 9.1 Limites de Requisição (Hard Caps)
- **Dataset Cases**: `12`
- **Expected TypeSafe Requests**: `7` a `9` (turnos com matcher = true).
- **MAX_TYPESAFE_REQUESTS**: `12` (teto rígido conservador).
- **Expected OpenAI Requests**: `7` (4 casos do Grupo B se generativo + 3 casos do Grupo D).
- **MAX_OPENAI_REQUESTS**: `12` (teto rígido conservador).
- **TOTAL_MAX_PROVIDER_REQUESTS**: `24` (12 TypeSafe + 12 OpenAI).
- **CONCURRENCY**: `1` (estritamente serial).
- **RETRIES**: `0` (zero retries em ambos os provedores).

### 9.2 Projeção de Custos Conservadora
1. **TypeSafe Jev**:
   - Input tokens projetados por request: `1.000 tokens`
   - Max input tokens (12 requests): `12.000 tokens`
   - Preço público verificado: `$42 / Btok` ($0.000000042 / token)
   - `MAX_PROJECTED_TYPESAFE_COST`: 12.000 × $0.000000042 = `$0.000504 USD` (< $0.001 USD).
2. **OpenAI**:
   - Input tokens conservadores por request: `1.500 tokens` (prompt de sistema + histórico + mensagem)
   - Output tokens conservadores por request: `500 tokens`
   - Max input tokens (12 requests): `18.000 tokens`
   - Max output tokens (12 requests): `6.000 tokens`
   - Projeção baseada em modelo de produção padr?o (ex.: patamar GPT-4o a $2.50/Mtok in, $10.00/Mtok out):
     - Input: 18.000 × $0.0000025 = $0.045 USD
     - Output: 6.000 × $0.0000100 = $0.060 USD
   - `MAX_PROJECTED_OPENAI_COST`: `$0.105 USD`.
3. **Custo Total Máximo Projetado**:
   - `MAX_PROJECTED_TOTAL_COST`: ~$0.11 USD.
   - **Teto Orçamentário Proposto ao Operador**: `$0.25 USD` (margem de segurança de > 100%).

---

## 10. Future Preauthorization Gate (Pacote de Pré-Autorização)

Antes de qualquer execução live futura, o operador humano deverá aprovar formalmente o seguinte envelope fechado:
- **Dataset Count**: 12 casos
- **Dataset SHA-256**: `8428006c10912be7d22cb915ecaa7ba7cb17aafd98d161af27b1c69237b4934f`
- **TypeSafe Model**: `jev-1.13.0`
- **OpenAI Model**: Modelo revalidado documentalmente
- **Max TypeSafe Requests**: 12
- **Max OpenAI Requests**: 12
- **Total Max Provider Requests**: 24
- **Concurrency**: 1 | **Retries**: 0
- **Proposed Operator Cost Ceiling**: $0.25 USD
- **Customer Data**: 0 | **Twilio**: 0 | **DB**: 0 | **Holdout Access**: NO

---

## 11. Result Artifact Schema & Sanitization (Artefato de Resultados)

- **Caminho Planejado**: `docs/research/results/phase-6-l2-real-jev-openai-synthetic-run1.json`
- **Campos Sanitizados Permitidos por Caso**:
  - `caseId`: string (ex.: `l2-01`)
  - `intendedStimulusClass`: enum (`KNOWN_CAPABILITY_DETERMINISTIC`, etc.)
  - `matcherMatched`: boolean
  - `jevCalled`: boolean
  - `jevProviderModel`: string | null
  - `observedRoute`: enum (`DETERMINISTIC_RESPONSE`, `GENERATIVE`, `SECURITY_BLOCKED`, `STALE`)
  - `openAiCalled`: boolean
  - `openAiModel`: string | null (apenas se observável)
  - `technicalStatus`: enum (`SUCCESS`, `PROVIDER_ERROR`, `TIMEOUT`)
  - `jevLatencyMs`: number | null
  - `openAiLatencyMs`: number | null
  - `errorCategory`: string | null (sanitizada de segredos e dados brutos)
- **CAMPOS TERMINANTEMENTE PROIBIDOS NO ARTEFATO**:
  - Nenhuma transcrição do interlocutor (`callerTranscript` ou `syntheticCallerUtterance`).
  - Nenhum texto bruto de resposta da OpenAI (`raw OpenAI completion text`).
  - Nenhum payload bruto de request ou response (`rawRequest`, `rawResponse`).
  - Nenhuma chave de API, cabeçalho de autenticação (`Authorization`, `Bearer`) ou dump de `process.env`.
  - Nenhum score bruto do Jev que não tenha sido expressamente autorizado em review.

---

## 12. Stop Conditions (Condições de Parada)

Durante a futura execução live:
1. **Erro HTTP 401 / 403 em Qualquer Provedor**: STOP imediato. Não repetir.
2. **Model Identity Mismatch no Jev**: Se `providerModel !== 'jev-1.13.0'` → STOP imediato.
3. **Violação do Teto de Custo**: Se custo projetado atingir $0.25 USD → STOP imediato.
4. **Corrupção de Integridade do Dataset**: Se hash SHA-256 divergir do congelado → STOP antes de iniciar.
5. **Nuance de .env**: Não copiar .env de outro diretório. Se chaves necessárias não existirem na pasta de trabalho, STOP e solicitar ação humana.
6. **3 Erros Técnicos Consecutivos (Research Safety Heuristic)**: Runner interrompe execução para evitar queima inútil de quota sob indisponibilidade sistêmica de rede.

---

## 13. Acceptance Classification (Classificação do Resultado)

O L2 futuro será classificado formalmente como:
- `PASS_COMPLETE`: Se 100% dos 12 casos forem concluídos com sucesso técnico, todas as invariantes forem preservadas, exact match de modelo for confirmado e a cadeia conjunta essencial (`L2_CORE_CHAIN`) for observada em pelo menos um caso.
- `PARTIAL_CHAIN_OBSERVED`: Se os casos forem concluídos mas a cadeia conjunta `matcher=true → Jev → GENERATIVE_REQUIRED → OpenAI` não tiver ocorrido naturalmente.
- `PROVIDER_FAILURE`: Se ocorrerem falhas técnicas 5xx ou timeouts acima da heurística permitida.
- `BLOCKED / NOT VERIFIED`: Se stop condition for acionada ou inconsistência observada.

---

## 14. Governance, Privacy & Isolation (Governança e Privacidade)

- **Isolamento de Dados de Clientes**: `CUSTOMER_DATA = 0`. O dataset é 100% sintético.
- **Isolamento do Locked Holdout**: `LOCKED_HOLDOUT = CONSUMED` preservado e intocado.
- **Fronteira Twilio**: `TWILIO_CALLS = 0`. Telefonia não é necessária nem será acionada no L2. A conta Twilio será requerida apenas no L3.
- **Sem Fiação em Produção**: `PRODUCTION_RUNTIME_WIRING = NO`.
- **Modo Guarded**: `ACTIVE_GUARDED = BLOCKED`.

---

## 15. Next Step (Próximo Passo)

1. Submeter este plano para revisão humana via PR no GitHub.
2. Após review e aprovação humana: preparar o runner L2 em modo preauth/offline.
3. NÃO executar L2 live neste slice.
