# Phase 6: Provider-Neutral Jev Shadow Runtime Foundation

- **Status**: `PROVIDER-NEUTRAL SHADOW FOUNDATION IMPLEMENTED`
- **Data**: 2026-09-30
- **Branch**: `feat/006o-jev-shadow-runtime-foundation`
- **Contexto**: Implementação da fundação provider-neutral para permitir futura observação consultiva em ambiente controlado de Staging (Stage 2 do ADR-019), sem acoplamento a SDKs externos e sem concessão de autoridade de negócio.
- **Controlled Staging Readiness**: `CONTROLLED_STAGING_JEV_EXECUTION_READY = NO` (faltam: adapter concreto TypeSafe HTTP, configuração de provedor, aprovação formal do portão de processamento de transcrições e autorização explícita de execução em Staging).

---

## 1. Escopo e Fronteiras Arquiteturais

1. **Provider-Neutral Only**:
   - As interfaces e componentes implementados neste slice residem em `packages/contracts/src/voice/` (`AuxiliaryTurnDecisionPort`) e `apps/voice/src/` (`AuxiliaryTurnShadowObserver`).
   - O adapter concreto TypeSafe HTTP permanece categoricamente: **`NOT IMPLEMENTED`** (nenhum cliente HTTP, chaves de API ou URLs de endpoint foram criados neste slice).
2. **Padrão de Runtime (Default Behavior)**:
   - O comportamento padrão de execução é: **`DEFAULT_MODE = DISABLED`**.
   - `DEFAULT_AUXILIARY_PROVIDER_CALLS = 0`.
   - With auxiliary mode `DISABLED`, the intended authoritative conversation behavior remains functionally unchanged.
3. **Proibição de Tráfego de Clientes e Portão de Privacidade**:
   - **`CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE = NOT CLEARED`**.
   - Tráfego real de clientes em produção ou chamadas de clientes em staging são terminantemente proibidos de transmitir transcrições para fornecedores externos nesta fase (`CUSTOMER_TRAFFIC = PROHIBITED`).
   - **`NO_TRANSCRIPT_EXTERNAL_TRANSMISSION = YES`**.
   - A telemetria estruturada nunca registra a transcrição bruta do usuário (`callerTranscript`).
4. **Prontidão de Bypass Determinístico**:
   - **`KNOWN_DETERMINISTIC_HANDLERS = 0`**.
   - **`ACTIVE_DETERMINISTIC_BYPASS_READINESS = BLOCKED`**.
   - **Invariante Formal**: `NO_KNOWN_DETERMINISTIC_HANDLER -> NO_DETERMINISTIC_BYPASS`.
   - Nenhum bypass determinístico está implementado ou ativo.
5. **Modo `ACTIVE_GUARDED` Inalcançável**:
   - O modo `ACTIVE_GUARDED` falha validação de inicialização de forma fail-closed (`unreachable in current runtime foundation`).
6. **Concorrência Delimitada e Backpressure (Bounded Shadow)**:
   - A concorrência máxima de avaliações em paralelo é suportada via injeção/configuração explícita (`maxConcurrency`).
   - **`SHADOW_MAX_CONCURRENCY_OPERATIONAL = NOT SELECTED`** (nenhum valor operacional numérico de staging ou produção foi hardcoded ou selecionado; testes utilizam fixtures para validação estrutural).
   - Sob saturação de capacidade, tarefas excedentes de shadow são descartadas de forma observável (`DROPPED_CAPACITY`) sem qualquer impacto ou bloqueio ao modelo conversacional autoritativo.
   - **`SHADOW_BACKLOG_IMPLEMENTED = NO`** (não há filas de espera ou retentativas automáticas).
   - **`SHADOW_BACKPRESSURE_POLICY = DROP_WHEN_AT_CONCURRENCY_LIMIT`**.
7. **Semântica Não-Bloqueante e Contenção de Falhas**:
   - The main `ConversationModelPort` stream starts without awaiting auxiliary evaluation by design and is covered by orchestration tests.
   - Provider rejection, synchronous observer failure, abort and capacity drop are contained by the shadow path and do not alter or terminate the authoritative conversation flow.
   - **`SHADOW_OPERATIONAL_TIMEOUT_IMPLEMENTED = NO`** e **`JEV_TIMEOUT_MS = NOT SELECTED`** (nenhum timeout operacional de rede foi introduzido neste slice).
8. **Provedores Externos e Custos**:
   - Chamadas a provedores neste slice: `OPENAI_CALLS = 0`, `JEV_CALLS = 0`, `TWILIO_CALLS = 0`.
   - Nenhum arquivo `.env` foi carregado em tempo de execução.

---

## 2. Componentes Criados e Modificados

| Componente | Arquivo | Responsabilidade |
| :--- | :--- | :--- |
| `AuxiliaryTurnDecisionPort` | `packages/contracts/src/voice/auxiliary-turn-decision-contracts.ts` | Interface provider-neutral para consulta assíncrona de scores probabilísticos atômicos (`deterministicScore`, `generativeScore`, `securityScore`) e telemetria de latência/modelo. |
| `AuxiliaryTurnShadowObserver` | `apps/voice/src/auxiliary-turn-shadow-observer.ts` | Observador de runtime responsável por receber o turno finalizado do interlocutor, despachar avaliação assíncrona com controle de concorrência e absorver falhas sem contaminar o caminho autoritativo. |
| `ConversationOrchestrator` | `apps/voice/src/conversation-orchestrator.ts` | Ponto de despacho síncrono da observação de shadow no recebimento de `user.speech.final`, garantindo início imediato do streaming principal da OpenAI e propagação de cancelamento em disconnect. |

---

## 3. Semântica Oficial TypeSafe Preservada no Design

Em conformidade com a documentação oficial da TypeSafe:
- O modelo não gera texto; retorna apenas scores de decisão/probabilidade;
- Probabilidades calibradas são interpretadas sobre grupos de predições, e não como garantias determinísticas sobre turnos individuais;
- O caminho auxiliar **NÃO PODE** bloquear, retardar ou terminar o fluxo conversacional autoritativo (*the auxiliary path MUST NOT block or terminate the authoritative conversation path*).
