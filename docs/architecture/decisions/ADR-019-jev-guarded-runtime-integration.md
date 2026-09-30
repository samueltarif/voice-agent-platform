# ADR-019: Jev Guarded Runtime Integration Architecture

- **Status**: Accepted
- **Data**: 2026-09-30
- **Branch**: `research/006n-jev-runtime-integration-design`

---

## Context (Contexto)

Após a conclusão dos experimentos sintéticos com o classificador probabilístico TypeSafe Jev (Fase A com N=80 calibração e N=40 locked holdout), a equipe alcançou evidências metodológicas consistentes no ambiente sintético:
- Política congelada (`T_SECURITY = 0.56`, `T_DETERMINISTIC = 0.35`, `T_GENERATIVE = 0.47`, SHA-256: `1ac0f2919ca73d22a39fb1d964b558ba2f7e395f336b2c3f687ced9ed4d53c93`);
- Locked holdout consumido sem re-tuning;
- Zero false bypasses e zero security misses no LOCKED HOLDOUT — NOT USED FOR POLICY FITTING / THRESHOLD SELECTION (N=40);
- Taxa de bypass seguro de 20.00% em turnos de holdout;
- Latência sintética do Jev com mediana de 255ms (p95 de 387ms) — classificada estritamente como `SYNTHETIC DESIGN INPUT`.

Em 2026-09-30, o operador aprovou formalmente a direção arquitetural deste design para estabelecer as fronteiras de autoridade, topologias, requisitos de privacidade e semântica de falhas antes de qualquer integração ao runtime de voz.

> **Escopo da Aceitação**: O status `Accepted` aceita exclusivamente o **DESIGN ARQUITETURAL**. Não autoriza implementação de código de produção, não declara o Jev como `PRODUCTION_READY` e mantém `JEV_PRODUCTION_INTEGRATION = NO`.

---

## Evidence & Constraints (Evidências e Restrições)

1. **Evidência Sintética Não É Evidência de Produção**:
   - Os benchmarks anteriores foram realizados via scripts isolados e não refletem a latência end-to-end (E2E) de uma sessão telefônica WebRTC/WebSocket na Twilio nem constituem SLA conversacional.
2. **Inexistência de Handlers Determinísticos no Runtime Vigente**:
   - Uma auditoria no código versionado (`apps/voice` e `packages/contracts/src/voice/`) confirmou que **não existe atualmente nenhum catálogo de respostas determinísticas ou handler estático de turnos** (total: 0).
   - Todo turno de fala do usuário é processado integralmente pelo modelo generativo via `ConversationModelPort.streamTurn`.
   - **Prontidão de Bypass Ativo**: `ACTIVE_DETERMINISTIC_BYPASS_READINESS = BLOCKED`.
   - **Invariante Formal**: `NO_KNOWN_DETERMINISTIC_HANDLER -> NO_DETERMINISTIC_BYPASS`.
3. **Restrição Crítica de Latência (Synthetic Design Input)**:
   - No benchmark sintético, 80% dos turnos exigiram geração aberta (não foram bypassados).
   - Um modelo serial estrito (*Always-On Serial*) adicionaria ~255ms (mediana sintética observada) antes de disparar o modelo principal para 8 de cada 10 turnos.
4. **Restrição de Custos em Paralelo Especulativo**:
   - Disparar o modelo principal e o Jev em paralelo arrisca não economizar custos, pois o streaming do modelo principal já terá iniciado quando o Jev concluir sua classificação (~255ms), consumindo tokens faturáveis antes de um eventual abort.
5. **Requisito de Contexto de Provedor**:
   - A integração **NÃO DEVE** depender de estado conversacional persistente no provedor externo (*The integration MUST NOT rely on provider-side persistent conversation state*). Toda avaliação recebe exclusivamente o estado fornecido explicitamente pela aplicação.
6. **Portão de Dados do Cliente e Privacidade**:
   - `CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE = NOT CLEARED`.
   - O tráfego real de clientes não pode ser transmitido ao Jev antes de formalizada a revisão de minimização de dados, termos de processamento de dados do provedor, retenção, consentimento legal e políticas de log.

---

## Options Considered (Opções Consideradas)

- **Opção A — Always-On Serial Gate**:
  - Toda fala passa pelo Jev antes de decidir entre handler determinístico ou OpenAI.
  - *Classificação*: `NOT SELECTED under current latency evidence`.
- **Opção B — Parallel Speculative Execution**:
  - Disparo concorrente do Jev e do OpenAI, cancelando o OpenAI se o Jev aprovar bypass determinístico.
  - *Classificação*: `NOT SELECTED due cancellation/cost/streaming complexity`.
- **Opção C — Application-Eligibility Filtered Serial Gate**:
  - A aplicação/orquestrador identifica previamente se o estado atual da conversa possui um handler determinístico concreto. Se sim, consulta o Jev para validar a segurança da transição. Se não, segue direto para o modelo principal.
  - *Classificação*: `SELECTED FUTURE ACTIVE TOPOLOGY, conditional on known deterministic handlers and new evidence`.
- **Opção D — Shadow-Only Execution**:
  - A chamada telefônica segue seu fluxo nominal direto para o modelo principal (OpenAI). Em paralelo e de forma desacoplada da decisão principal, o Jev é consultado para registro de telemetria e comparação.
  - *Classificação*: `SELECTED FIRST INTEGRATION TOPOLOGY, initially in controlled staging shadow`.

---

## Decision (Decisão)

1. **Adoção do Modelo de Rollout em Estágios (Stage Progression — Staging-First)**:
   - **Stage 1 (Vigente)**: `DISABLED`. Jev inativo no código de produção (`JEV_PRODUCTION_INTEGRATION = NO`).
   - **Stage 2 (Próximo Slice)**: `CONTROLLED STAGING SHADOW`. Integração estritamente consultiva em chamadas sintéticas/controladas de Staging, sem tráfego de clientes.
   - **Stage 3**: Benchmark factual de latência e custos em ambiente de Staging telefônico.
   - **Stage 4**: `ACTIVE_GUARDED`. Habilitação de bypass determinístico **exclusivamente sob a Topologia C (Application-Eligibility Filtered)** e somente após a implementação e homologação de handlers determinísticos concretos.
   - **Stage 5**: Expansão sob aprovação explícita de governança.

2. **Fronteira Rígida de Autoridade (Hard Authority Boundary)**:
   - O Jev é um classificador probabilístico auxiliar de Sistema 1: **não detém nenhuma autoridade de negócio**.
   - O Jev nunca pode: alterar `organizationId`, mutar banco de dados, aprovar transações financeiras, acionar ferramentas (`tools`), mudar permissões, desconectar a chamada ou decidir handoffs humanos.
   - A máquina de estados determinística (`CallSession`) e o banco de dados durável são a única autoridade.

3. **Semântica de Shadow Bounded (Não é Fire-and-Forget Ilimitado)**:
   - A execução em SHADOW não bloqueia intencionalmente o caminho conversacional autoritativo por design (*does not intentionally block or alter the authoritative conversation path by design*).
   - O SHADOW consome recursos locais de CPU, memória, capacidade de rede, quota de provedor e orçamento financeiro. Pode introduzir contenção indireta se não for delimitado.
   - **Requisitos de Design**:
     - Concorrência limitada (`SHADOW_MAX_CONCURRENCY = NOT SELECTED`);
     - Fila/backlog limitado (`SHADOW_MAX_BACKLOG = NOT SELECTED`);
     - Cancelável quando apropriado;
     - Observável com telemetria estruturada;
     - Seguro para descarte sob pressão de recursos;
     - Incapaz de gerar promises pendentes ilimitadas ou exaurir pools de conexão HTTP.

4. **Semântica de Falhas**:
   - **Em SHADOW**: Falhas ou timeouts do Jev não provocam fallback de roteamento, pois o Jev não possui autoridade. O caminho principal da OpenAI prossegue de forma independente; falhas no Jev afetam apenas a completude da telemetria de shadow.
   - **Em ACTIVE_GUARDED (Futuro)**:
     - `FAIL-OPEN TO MAIN MODEL`: Qualquer falha, timeout, violação de schema ou model drift direciona o turno imediatamente para o modelo conversacional principal (OpenAI). A chamada de voz nunca é interrompida por falhas do Jev.
     - `FAIL-CLOSED WITH RESPECT TO DETERMINISTIC BYPASS`: Qualquer falha ou ambiguidade proíbe expressamente o bypass determinístico.

5. **Teto Global de Funcionalidade (Global Feature Ceiling)**:
   - `GLOBAL_ALLOWED_MODE` atua como um teto rígido (*hard ceiling*) e kill switch global.
   - A configuração por organização (`organizationId`) só pode selecionar modos contidos dentro do limite globalmente autorizado:
     - Global `DISABLED` -> organização não pode habilitar `SHADOW` nem `ACTIVE_GUARDED`.
     - Global `SHADOW` -> organização pode selecionar `DISABLED` ou `SHADOW`, nunca `ACTIVE_GUARDED`.
     - `ACTIVE_GUARDED` exige autorização global explícita.

6. **Porta Mínima Provider-Neutral**:
   - Porta proposta: `AuxiliaryTurnDecisionPort` (`ACCEPTED DESIGN / NOT IMPLEMENTED`).
   - Define a interface mínima para o futuro slice de integração em Shadow: `evaluateTurn(...)` retornando scores brutos (`deterministicScore`, `generativeScore`, `securityScore`) e telemetria de latência/modelo.
   - Separação estrita:
     - Adapter (`packages/integrations`): scores brutos tipados;
     - Application Policy (`apps/voice/src/domain/policy`): política congelada e ordenação de regras;
     - Orchestrator (`apps/voice/src/orchestrator`): autoridade final de roteamento.

7. **Circuit Breaker e Orçamentos Postergrados**:
   - Estados mínimos: `CLOSED`, `OPEN`, `HALF_OPEN`.
   - Com circuito `OPEN`: suprime novas avaliações do Jev; o modelo principal permanece autoritativo.
   - Parâmetros formalmente postergados para medição empírica em Staging:
     - `CIRCUIT_BREAKER_TRIGGER_THRESHOLDS = NOT SELECTED`;
     - `JEV_TIMEOUT_MS = NOT SELECTED`;
     - `JEV_ACCEPTABLE_TIMEOUT_RATE = NOT SELECTED`;
     - `CONVERSATIONAL_LATENCY_BUDGET_MS = NOT SELECTED`.

8. **Comportamento diante de Model Drift**:
   - **Em SHADOW**: Modelo inesperado na telemetria (`providerModel`) é registrado e a avaliação é marcada como incompatível para fins comparativos, sem afetar o comportamento da chamada.
   - **Em ACTIVE_GUARDED**: Modelo inesperado proíbe bypass determinístico e força rota do modelo principal (`FAIL-OPEN`).

---

## Consequences (Consequências)

### Positivas
- **Isolamento de Risco Conversacional**: A fase inicial em `CONTROLLED STAGING SHADOW` impede que chamadas de produção ou clientes sofram degradação ou corte de áudio.
- **Isolamento de Negócio**: O core da aplicação permanece 100% agnóstico e imune a alucinações de classificação.
- **Governança de Privacidade**: Proíbe transmissão de dados de clientes antes da liberação formal do portão de dados.

### Desafios e Custos
- **Consumo Adicional de Recursos**: O modo Shadow consome chamadas adicionais de API (custo incremental de uso do Jev) sem economizar chamadas OpenAI.
- **Contenção Operacional**: Requer implementação cuidadosa de concorrência limitada e pools de conexão no próximo slice.
- **Necessidade de Handlers Concretos**: O valor do bypass determinístico depende do desenvolvimento futuro de handlers determinísticos na aplicação.
