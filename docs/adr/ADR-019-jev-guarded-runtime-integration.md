# ADR-019: Jev Guarded Runtime Integration Architecture

- **Status**: Proposed
- **Data**: 2026-09-30
- **Branch**: `research/006n-jev-runtime-integration-design`

---

## Context (Contexto)

Após a conclusão dos experimentos sintéticos com o classificador probabilístico TypeSafe Jev (Fase A com N=80 calibração e N=40 locked holdout), a equipe alcançou evidências metodológicas consistentes no ambiente sintético:
- Política congelada (`T_SECURITY = 0.56`, `T_DETERMINISTIC = 0.35`, `T_GENERATIVE = 0.47`, SHA-256: `1ac0f2919ca73d22a39fb1d964b558ba2f7e395f336b2c3f687ced9ed4d53c93`);
- Locked holdout consumido sem re-tuning;
- Zero false bypasses e zero security misses na amostra de teste não vista (N=40);
- Taxa de bypass seguro de 20.00% em turnos de holdout;
- Latência sintética do Jev com mediana de 255ms (p95 de 387ms).

Contudo, antes de qualquer ativação ou integração do Jev ao runtime de voz em produção, é mandatório resolver as questões centrais de arquitetura, limites de autoridade, prontidão de handlers determinísticos e modelo de propagação de latência.

---

## Evidence & Constraints (Evidências e Restrições)

1. **Evidência Sintética Não É Evidência de Produção**:
   - Os benchmarks anteriores foram realizados via scripts isolados e não refletem a latência end-to-end (E2E) de uma sessão telefônica WebRTC/WebSocket na Twilio.
2. **Inexistência de Handlers Determinísticos no Runtime Vigente**:
   - Uma auditoria no código de `apps/voice` e `packages/contracts/src/voice/` revelou que **não existe atualmente nenhum catálogo de respostas determinísticas ou handler estático de turnos**.
   - Todo turno de fala do usuário é processado integralmente pelo modelo generativo via `ConversationModelPort.streamTurn`.
   - **Prontidão de Bypass Ativo**: `ACTIVE_DETERMINISTIC_BYPASS_READINESS = BLOCKED`.
   - **Invariante Formal**: `NO_KNOWN_DETERMINISTIC_HANDLER -> NO_DETERMINISTIC_BYPASS`.
3. **Restrição Crítica de Latência**:
   - No benchmark sintético, 80% dos turnos exigiram geração aberta (não foram bypassados).
   - Um modelo serial estrito (*Always-On Serial*) adicionaria ~255ms de penalidade sistemática antes de disparar o modelo principal para 8 de cada 10 turnos de fala.
4. **Restrição de Custos em Paralelo Especulativo**:
   - Disparar o modelo principal e o Jev em paralelo arrisca não economizar custos, pois o streaming do modelo principal já terá iniciado quando o Jev concluir sua classificação (~255ms).

---

## Options Considered (Opções Consideradas)

- **Opção A — Always-On Serial Gate**:
  - Toda fala passa pelo Jev antes de decidir entre handler determinístico ou OpenAI.
  - *Descarte*: Penaliza inaceitavelmente a latência de 80% dos turnos conversacionais normais.
- **Opção B — Parallel Speculative Execution**:
  - Disparo concorrente do Jev e do OpenAI, cancelando o OpenAI se o Jev aprovar bypass determinístico.
  - *Descarte*: Alta complexidade com abort controllers, risco de race condition, cortes abruptos de áudio no cliente e cobrança de tokens já gerados.
- **Opção C — Application-Eligibility Filtered Serial Gate**:
  - A aplicação/orquestrador identifica previamente se o estado atual da conversa possui um handler determinístico concreto. Se sim, consulta o Jev para validar a segurança da transição. Se não, segue direto para o modelo principal.
  - *Avaliação*: Topologia ideal para o momento em que existirem handlers determinísticos no runtime.
- **Opção D — Shadow-Only Execution**:
  - A chamada telefônica segue seu fluxo nominal direto para o modelo principal (OpenAI). Em paralelo e de forma estritamente assíncrona/não-bloqueante, o Jev é consultado para registro de telemetria e comparação de concordância.
  - *Avaliação*: Topologia recomendada para a fase de transição e coleta de evidências reais.

---

## Decision (Decisão)

1. **Adoção do Modelo de Rollout em Estágios (Stage Progression)**:
   - **Stage 1 (Vigente)**: `DISABLED`. Jev inativo no código de produção.
   - **Stage 2 (Próximo)**: `SHADOW`. Integração estritamente consultiva e desacoplada, coletando telemetria em chamadas reais sem interferir no fluxo de áudio ou texto.
   - **Stage 3**: Benchmark factual de latência e custos em ambiente de staging telefônico.
   - **Stage 4**: `ACTIVE_GUARDED`. Habilitação de bypass determinístico **exclusivamente sob a Topologia C (Application-Eligibility Filtered)** e somente para handlers determinísticos que venham a ser formalmente criados e testados.
   - **Stage 5**: Expansão sob aprovação de governança.

2. **Fronteira Rígida de Autoridade (Hard Authority Boundary)**:
   - O Jev é um classificador probabilístico auxiliar de Sistema 1: **não detém nenhuma autoridade de negócio**.
   - O Jev nunca pode: alterar `organizationId`, mutar banco de dados, aprovar transações financeiras, acionar ferramentas (`tools`), mudar permissões, desconectar a chamada ou decidir handoffs humanos.
   - A máquina de estados determinística (`CallSession`) e o banco de dados durável são a única autoridade.

3. **Semântica de Falhas Dual**:
   - **`FAIL-OPEN TO MAIN MODEL`**: Qualquer erro, timeout, violação de schema ou model drift no Jev direciona o turno imediatamente para o modelo conversacional principal (OpenAI). A chamada de voz nunca é interrompida por falhas do Jev.
   - **`FAIL-CLOSED WITH RESPECT TO DETERMINISTIC BYPASS`**: Se houver qualquer falha ou ambiguidade na resposta do Jev, o bypass determinístico é terminantemente proibido.

4. **Porta Mínima Provider-Neutral**:
   - Criação futura da interface mínima `AuxiliaryTurnDecisionPort` em contratos, contendo apenas `evaluateTurn(...)` com retorno de scores numéricos brutos (`deterministicScore`, `generativeScore`, `securityScore`) e telemetria de latência/modelo.
   - A política congelada reside na camada de aplicação (`apps/voice/src/domain/policy`), nunca oculta dentro do adapter de integração.

5. **Circuit Breaker e Timeout Indeterminado**:
   - Circuit breaker com estados `CLOSED`, `OPEN`, `HALF_OPEN` operando em modo fail-open.
   - Timeout formalmente mantido como **`JEV_TIMEOUT_MS = NOT SELECTED`**, a ser derivado futuramente de benchmarks de rede em Staging.

---

## Consequences (Consequências)

### Positivas
- **Risco Zero na Experiência do Usuário**: A fase inicial em `SHADOW` garante que nenhuma chamada telefônica sofra degradação de latência ou corte de áudio.
- **Isolamento de Negócio**: O core da aplicação permanece 100% agnóstico e imune a alucinações de roteamento.
- **Proteção Orçamentária**: Evita sobre-engenharia de execução paralela especulativa que poderia inflacionar custos de tokens.

### Limitações e Desafios
- **Zero Economia de Custos Imediata**: O modo Shadow e a ausência de handlers determinísticos impedem economia imediata de tokens OpenAI.
- **Necessidade de Implementação Futura de Handlers**: Para capturar o valor do Jev, a aplicação precisará desenvolver vertical slices de respostas estáticas/determinísticas e catálogos de estado.

---

## Latency Gate & Open Questions

- **Latency Gate**: Nenhum modo ativo (`ACTIVE_GUARDED`) poderá ser ativado sem que a latência P95 e o overhead de orquestração sejam comprovados formalmente inferiores à meta conversacional aceitável em testes com áudio real.
- **Questões em Aberto**:
  1. Quais intenções conversacionais da aplicação justificam handlers determinísticos dedicados?
  2. Qual o comportamento de TTFT da OpenAI sob concorrência simultânea em Staging?
  3. Qual o limiar de timeout ótimo para equilibrar assertividade de classificação e proteção de latência?
