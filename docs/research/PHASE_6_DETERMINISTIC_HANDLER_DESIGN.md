# Phase 6 — Primeiro Candidato a Handler Determinístico: Documento de Design (PHASE_6_DETERMINISTIC_HANDLER_DESIGN.md)

> **Status**: DESIGN / AUDIT ONLY (Aprovado para Especificação — Implementação: NOT STARTED)  
> **Data**: 2026-10-01  
> **Fase**: Phase 6 (Voice Model Routing & Jev Evaluation)  
> **Prompt de Origem**: `PROMPT-006V-DETERMINISTIC-HANDLER-CANDIDATE-DESIGN-001`  
> **Revisão e Endurecimento**: `PROMPT-006V-PR49-CAPABILITY-RESOLUTION-HARDENING-AND-MERGE-001`
> **Invariante Formal**: `NO_KNOWN_DETERMINISTIC_HANDLER -> NO_DETERMINISTIC_BYPASS`  

---

## 1. Contexto e Bloqueios Vigentes (Current Blockers)

No estado atual da plataforma, o roteamento probabilístico pelo classificador auxiliar TypeSafe Jev foi validado em ambiente sintético de staging (PR #46, PR #47 e PR #48), comprovando telemetria non-blocking e latência dentro da janela operacional nominal (`STAGING_SHADOW_TIMEOUT_MS = 1500ms`, mediana observada de 275ms, 0 timeouts).

Contudo, a ativação de qualquer bypass determinístico no runtime (`ACTIVE_GUARDED`) permanece estritamente bloqueada por design. Os seguintes bloqueios são factuais e permanecem vigentes:

- `FIRST_DETERMINISTIC_HANDLER_CANDIDATE`: `agent.operating_hours`
- `HANDLER_IMPLEMENTATION`: `NOT IMPLEMENTED`
- `CAPABILITY_RESOLUTION`: `DESIGNED / NOT IMPLEMENTED`
- `KNOWN_DETERMINISTIC_HANDLERS`: `0`
- `ACTIVE_DETERMINISTIC_BYPASS_READINESS`: `BLOCKED` (fail-closed)
- `ACTIVE_GUARDED`: `BLOCKED` (inalcançável no runtime)
- `CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE`: `NOT CLEARED`
- `CUSTOMER_TRAFFIC`: `PROHIBITED`
- `PRODUCTION_RUNTIME_WIRING`: `NO`
- `PRODUCTION_JEV_TIMEOUT_MS`: `NOT SELECTED`
- `PRODUCTION_SHADOW_MAX_CONCURRENCY`: `NOT SELECTED`

---

## 2. Inventário de Capacidades Existentes no Repositório

Auditado o código-fonte versionado em:
- `packages/contracts/**`
- `packages/database/**`
- `apps/api/**`
- `apps/voice/**`
- `packages/integrations/**`
- `apps/worker/**`

| Capacidade | Fonte Autoritativa da Verdade | Implementação Existente (Service/Repo/Port) | Escopo de Tenant | Mutação vs Read-Only | Input Estruturado | Output Estruturado | Comportamento em Falha | Depende de OpenAI Hoje? | Lógica de Domínio Provider-Neutral Existe? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Horário de Funcionamento do Agente** (`agent.operating_hours`) | `AgentConfigurationSnapshotV1.rules.deterministic.operatingHours` (persistido em `agent_versions.configuration` no PostgreSQL via schema Drizzle) | `packages/contracts/src/agents/agent-configuration-v1.ts`; entregue ao runtime de voz em `AgentConfigurationSnapshotV1` | Explícito por `organizationId` e FK de agente | Read-Only estrito (leitura de snapshot imutável em memória) | Turn context + `callerTranscript` + `snapshot.rules.deterministic.operatingHours` | String determinística com horário (ex: `"08:00-18:00"`) | Fail-closed (se ausente/inválido, fallback para LLM) | Sim (atualmente todo turno vai para OpenAI) | Sim (schema Zod tipado e snapshot em memória) |
| **Identidade / Empresa do Agente** (`agent.company_identity`) | `AgentConfigurationSnapshotV1.persona.companyName` e `persona.role` | `packages/contracts/src/agents/agent-configuration-v1.ts` | Explícito por `organizationId` | Read-Only estrito | Turn context + `snapshot.persona` | Identidade e empresa configuradas | Fail-closed | Sim | Sim |
| **Frase de Encerramento Estática** (`agent.closing_phrase`) | `AgentConfigurationSnapshotV1.persona.closingPhrase` | `packages/contracts/src/agents/agent-configuration-v1.ts` | Explícito por `organizationId` | Read-Only na fala, mas ambíguo com encerramento de chamada | Turn context + `snapshot.persona.closingPhrase` | Frase de encerramento configurada | Fail-closed | Sim | Sim |
| **Frase de Fallback Estática** (`agent.static_fallback`) | `AgentConfigurationSnapshotV1.persona.fallbackPhrase` | `packages/contracts/src/agents/agent-configuration-v1.ts` | Explícito por `organizationId` | Read-Only | Evento de erro ou não-reconhecimento | Frase de fallback configurada | N/A (mecanismo de recuperação, não bypass de intenção) | Sim | Sim |
| **Consulta de Desconto Máximo** (`agent.max_discount`) | `AgentConfigurationSnapshotV1.rules.deterministic.maxDiscountPercent` | `packages/contracts/src/agents/agent-configuration-v1.ts` | Explícito por `organizationId` | Read-Only | Turn context + `snapshot.rules.deterministic.maxDiscountPercent` | Percentual numérico (ex: `15`) | Fail-closed | Sim | Sim |
| **Consulta de Catálogo / Preço de Produto** (`catalog.product_price`) | Inexistente no código (`ProductPricingService` não existe) | Inexistente | N/A | N/A | N/A | N/A | N/A | N/A | Não |
| **Consulta de Agenda / Calendário** (`calendar.get_slots`) | Inexistente no código (`CalendarProvider` pendente) | Inexistente | N/A | N/A | N/A | N/A | N/A | N/A | Não |
| **Consulta de CRM** (`crm.find_contact`) | Inexistente no código (`CRMProvider` pendente) | Inexistente | N/A | N/A | N/A | N/A | N/A | N/A | Não |
| **Consulta de Quotas Comerciais** (`commercial.quota_check`) | `packages/database/src/repositories/commercial-repository.ts` | `CommercialEntitlementResolver` | Explícito por `organizationId` | Read-Only | `organizationId` | Entitlements comerciais do tenant | Fail-closed | Não (controle interno) | Sim (mas pertence ao Control Plane / API, não ao runtime de voz) |

---

## 3. Auditoria do Contrato do Jev & Lacuna de Resolução de Capacidade (Capability Resolution Gap)

### 3.1. Auditoria Factual do Contrato do Jev
Inspecionando `AuxiliaryTurnDecisionOutput` em `packages/contracts/src/voice/auxiliary-turn-decision-contracts.ts`:
```ts
export interface AuxiliaryTurnDecisionOutput {
  readonly deterministicScore: number;
  readonly generativeScore: number;
  readonly securityScore: number;
  readonly providerModel: string;
  readonly latencyMs: number;
}
```
- `JEV_CAPABILITY_ID_OUTPUT`: `NO`
- `JEV_INTENT_ID_OUTPUT`: `NO`
- `CURRENT_JEV_OUTPUT_CAN_SELECT_SPECIFIC_HANDLER`: `NO`

### 3.2. A Lacuna Arquitetural (The Resolution Gap)
O classificador probabilístico Jev avalia exclusivamente as três perguntas atômicas de Sistema 1 (`deterministicNoul`, `generativeNoul`, `securityNoul`).
A política congelada (`FROZEN_POLICY`) interpreta esses scores e deriva uma classe de roteamento de alto nível:
- `SECURITY_ESCALATE` (Regra 1: `securityNoul >= 0.56`)
- `DETERMINISTIC_CANDIDATE` (Regra 2: `deterministicNoul >= 0.35 && generativeNoul <= 0.47`)
- `GENERATIVE_REQUIRED` (Regra 3: `DEFAULT`)

**O Problema**: A classe de roteamento `DETERMINISTIC_CANDIDATE` informa apenas que o turno é elegível para tratamento determinístico, mas **não informa qual capacidade específica está sendo solicitada** (se é horário de atendimento, nome da empresa, status de pedido, etc.).

Consequentemente:
- `CAPABILITY_RESOLUTION`: `NOT IMPLEMENTED`
- `CAPABILITY_RESOLUTION_REQUIRED_BEFORE_ACTIVE_BYPASS`: `YES`

Essa lacuna não pode ser mascarada ou presumida por registries genéricos.

---

## 4. Avaliação de Opções Mínimas de Resolução & Proteção da Frozen Policy

| Opção | Abordagem | Impacto na Frozen Policy | Risco de Falso Bypass | Testabilidade | Avaliação YAGNI | Elegível p/ 1º Handler? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Opção A** | **Matcher determinístico local estreito** por capacidade antes da execução do handler | ZERO (FROZEN_POLICY mantida 100% intocada) | Baixo (se restrito a allowlist de frases canônicas) | Alta (função pura em memória testada com fixtures) | Ótima (zero frameworks, zero dependências externas) | **SIM (Opção Selecionada)** |
| **Opção B** | **Capability resolver NLU separado** via outro modelo/provedor de IA | Nulo na política Jev, mas adiciona provider | Médio/Alto (alucinações de novo modelo NLU) | Média (dependência de novo mock/adapter) | Péssima (adiciona latência, custos e novo provider externo) | **NÃO** |
| **Opção C** | **Estender Jev** com novas perguntas para retornar `capabilityId` | ALTO (Invalida o Atomic V1 question set, thresholds e holdout) | Alto (requer calibração de novas perguntas) | Baixa (exige nova bateria de pesquisa) | Péssima (quebra a política congelada) | **NÃO (Bloqueado pela Seção 5)** |

### Proteção Estrita da Política Congelada (Frozen Policy Protection)
A Opção C é formalmente classificada como `NOT ELIGIBLE FOR MINIMAL FIRST-HANDLER SLICE`. O conjunto atômico de perguntas V1, os thresholds congelados e o locked holdout consumido permanecem rigorosamente intocados (`FROZEN_POLICY_HASH = 1ac0f2919ca73d22a39fb1d964b558ba2f7e395f336b2c3f687ced9ed4d53c93`).

---

## 5. Resolução Segura Mínima para o Primeiro Handler (Narrow Deterministic Capability Matcher)

Para o primeiro handler (`agent.operating_hours`), a resolução de capacidade ocorre localmente de forma estritamente determinística, pura e restrita:

### 5.1. Regras Mandatórias do Matcher Local:
1. `READ_ONLY`: Sem mutações de estado;
2. `PURE`: Função determinística em memória dependendo exclusivamente do texto da fala e configuração;
3. `ZERO_NETWORK`: Nenhuma chamada de rede;
4. `ZERO_LLM`: Nenhuma dependência de modelos generativos;
5. `FAIL_CLOSED`: Qualquer dúvida, ambiguidade ou variação fora do escopo rejeita o bypass (`handled = false`);
6. `NO_BROAD_SUBSTRINGS`: **TOTALMENTE PROIBIDO** usar substrings soltas como `transcript.includes("horário")` ou regex permissiva;
7. `TESTABILITY`: 100% coberto por fixtures sintéticas positivas e negativas.

### 5.2. Escopo de Dados de Horário de Atendimento (`operatingHours`)
Inspecionando a definição em `packages/contracts/src/agents/agent-configuration-v1.ts` (linha 26):
```ts
operatingHours: z.string().min(1).optional()
```
- `OPERATING_HOURS_DATA_SHAPE`: `string (min 1, optional)`
- `TIMEZONE_SUPPORTED`: `NO` (inexiste campo de fuso horário no schema atual)
- `DAY_SPECIFIC_HOURS_SUPPORTED`: `NO` (inexiste tabela ou mapa por dia da semana)
- `HOLIDAY_EXCEPTIONS_SUPPORTED`: `NO` (inexistem regras de feriados no schema atual)

### 5.3. Restrição de Escopo de Perguntas Suportadas:
- **Perguntas SUPORTADAS (Generic Business Operating Hours)**:
  - `"Qual é o horário de atendimento?"`
  - `"Qual o horário de funcionamento?"`
  - `"Até que horas vocês atendem?"`
  - `"Que horas vocês abrem?"`
  - `"Que horas vocês fecham?"`
- **Perguntas NÃO SUPORTADAS (Devem resultar em FAIL-CLOSED imediato)**:
  - Perguntas com data/dia específico: `"Vocês abrem amanhã?"`, `"Qual o horário no sábado?"`
  - Perguntas sobre feriados: `"Abrem no feriado?"`
  - Perguntas sobre fuso horário: `"Qual o horário em Brasília?"`
  - Perguntas de agendamento pessoal: `"Qual o horário da minha consulta?"`
  - Perguntas de entrega/logística: `"Que horas chega meu pedido?"`
  - Perguntas de retorno: `"Qual horário o vendedor vai me ligar?"`

---

## 6. Qualificação Factual das Propriedades Técnicas

Para evitar sobreafirmações e ambiguidades de evidência:

1. **Alucinação Generativa**:
   - `OPENAI_GENERATIVE_STEP_REQUIRED_ON_SUCCESSFUL_HANDLER`: `NO`
   - `GENERATIVE_HALLUCINATION_SURFACE_ON_HANDLER_RESPONSE`: `REMOVED` (o LLM principal não participa da geração da resposta)
   - `FACTUAL_CORRECTNESS_DEPENDS_ON_PUBLISHED_CONFIGURATION`: `YES` (a veracidade da resposta depende estritamente do valor configurado no snapshot publicado pela empresa).
2. **Segurança de Tenant**:
   - `TENANT_SCOPED_SOURCE_AVAILABLE`: `YES` (`organizationId` explícito no snapshot e na sessão)
   - `TENANT_MATCH_GUARD_REQUIRED`: `YES` (o guardião deve validar `session.organizationId === snapshot.organizationId`)
   - `TENANT_GUARD_IMPLEMENTED_IN_HANDLER`: `NO` (código de handler ainda não implementado)
   - `HANDLER_TENANT_SAFETY`: `NOT YET TESTED`.
3. **Suporte a Resposta Direta de Áudio/Texto**:
   - `VOICE_TRANSPORT_DIRECT_SPEAK_CAPABILITY_EXISTS`: `YES` (`VoiceTransportPort.speak(callId, command)` já está implementado na interface de transporte)
   - `DIRECT_DETERMINISTIC_HANDLER_RESPONSE_IMPLEMENTED`: `NO`
   - `DIRECT_DETERMINISTIC_HANDLER_RESPONSE_TESTED`: `NO`.
4. **Interação com Privacidade e Dados do Cliente**:
   - `CUSTOMER_DATA_REQUIRED`: `NO` (100% testável com fixtures sintéticas)
   - `CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE`: `NOT CLEARED`
   - `CUSTOMER_TRAFFIC`: `PROHIBITED`.

---

## 7. Reavaliação de Minimalidade de Contratos & Registry (YAGNI)

### 7.1. Necessidade de Registry no Primeiro Slice
- **CURRENT_REQUIREMENT**: Executar com segurança exatamente UM handler determinístico (`agent.operating_hours`).
- **EXISTING_OPTION**: Inexistente.
- **MINIMAL_OPTION**: Uma função orquestradora enxuta ou módulo coeso que combina o matcher local com a leitura do snapshot.
- **REGISTRY_REQUIRED_FOR_FIRST_HANDLER**: `NO`.
  - A criação de uma classe `DeterministicHandlerRegistry` com mapas genéricos e métodos de lookup é **desnecessária** para um único handler. O registry completo fica formalmente postergado para quando houver múltiplos handlers reais no produto.

### 7.2. Contrato Necessário
- **NEW_CONTRACT_REQUIRED**: `YES`.
  - É necessária uma interface mínima tipada provider-neutral em `packages/contracts/src/voice/` definindo o contrato de avaliação determinística do turno, garantindo tipagem forte entre `apps/voice` e o domínio, sem recorrer a `any` ou acoplamento direto.

### 7.3. Proibições Anti-Overengineering (No Generic Framework)
É expressamente **PROIBIDO** implementar no próximo slice:
- Framework genérico de plugins;
- Registro dinâmico reflexivo;
- Auto-discovery de handlers;
- Containers de injeção de dependência novos;
- Motores complexos de regras multi-handler.

---

## 8. Matriz de Testes para Futura Implementação

Quando a implementação for autorizada, os seguintes testes automatizados unitários deverão ser implementados:

### 8.1. Fixtures Positivas (Bypass Determinístico Autorizado):
- `"Qual é o horário de atendimento?"` -> `bypass: true`, fala horário configurado;
- `"Qual o horário de atendimento?"` -> `bypass: true`;
- `"Qual é o horário de funcionamento?"` -> `bypass: true`;
- `"Até que horas vocês atendem?"` -> `bypass: true`;
- `"Que horas vocês abrem?"` -> `bypass: true`;
- `"Que horas vocês fecham?"` -> `bypass: true`.

### 8.2. Fixtures Negativas Obrigatórias (Fail-Closed to Main Model):
- `"Qual é o horário da minha consulta?"` -> `bypass: false` (consulta médica/agendamento);
- `"Que horas meu pedido chega?"` -> `bypass: false` (entrega/logística);
- `"Qual horário o vendedor vai me ligar?"` -> `bypass: false` (retorno comercial);
- `"Qual o horário amanhã?"` -> `bypass: false` (específico de dia não suportado);
- `"Vocês abrem no feriado?"` -> `bypass: false` (exceção de feriado não suportada);
- `"Qual horário em Brasília?"` -> `bypass: false` (fuso horário não suportado);
- `"Pode me ligar em outro horário?"` -> `bypass: false`.

### 8.3. Casos de Invariante e Borda (Fail-Closed):
- `operatingHours` indefinido ou string vazia no snapshot -> `bypass: false`;
- `session.organizationId !== snapshot.organizationId` -> `bypass: false`;
- `session.runtimeState !== 'ACTIVE'` -> `bypass: false`;
- Jev retorna `GENERATIVE_REQUIRED` -> `bypass: false`;
- Jev retorna `SECURITY_ESCALATE` -> `bypass: false`;
- Handler lança erro interno inesperado -> `bypass: false`, chamada prossegue sem interrupção de áudio.

---

## 9. Conclusão da Fase de Design

O design do primeiro handler determinístico (`agent.operating_hours`) foi formalmente endurecido no PR #49, com o gap de capability resolution resolvido através de um matcher determinístico local estreito (Opção A), preservando 100% a Frozen Policy e eliminando sobreafirmações causais e frameworks genéricos prematuros.

---

## 10. Evidência de Implementação & Testes Locais (Implementation Evidence)

> **Prompt de Execução**: `PROMPT-006W-OPERATING-HOURS-DETERMINISTIC-HANDLER-IMPLEMENTATION-001`
> **Branch**: `feat/006w-operating-hours-deterministic-handler`
> **TESTED_CODE_SHA**: `2bb0b00bdf861808500544e698d087ea134500e0`

### 10.1. Revalidação YAGNI
- **Contrato Compartilhado**: `SHARED_HANDLER_CONTRACT_REQUIRED = NO`.
  - Inexiste fronteira entre pacotes exigindo exportação de interface genérica por `@voice-agent/contracts`. O consumo e a execução do handler ocorrem estritamente dentro de `apps/voice`, com tipagem TypeScript local rigorosa (`OperatingHoursTurnHandlerInput`, `OperatingHoursHandlerResult`).
- **Registry**: `REGISTRY_REQUIRED_FOR_FIRST_HANDLER = NO`.
  - Zero frameworks de plugins, zero reflection, zero auto-discovery e zero DI containers.

### 10.2. Módulos Implementados
1. **Matcher Determinístico de Capacidade**:
   - Arquivo: [`apps/voice/src/operating-hours-capability-matcher.ts`](file:///d:/voice-agent-platform/apps/voice/src/operating-hours-capability-matcher.ts) (66 linhas).
   - Testes: [`apps/voice/src/operating-hours-capability-matcher.test.ts`](file:///d:/voice-agent-platform/apps/voice/src/operating-hours-capability-matcher.test.ts) (55 testes unitários passando).
   - Normalização: remoção de diacríticos, pontuação e espaços múltiplos.
   - Correspondência: allowlist exata de 23 formulações canônicas de horário de atendimento do negócio.
   - Fail-closed: rejeição comprovada de perguntas sobre consultas, pedidos, entregas, callbacks de vendedores, dias específicos, feriados, fusos e perguntas ambíguas (`"qual é o horário?"`).
2. **Handler Determinístico de Turno**:
   - Arquivo: [`apps/voice/src/operating-hours-turn-handler.ts`](file:///d:/voice-agent-platform/apps/voice/src/operating-hours-turn-handler.ts) (104 linhas, complexidade ciclomatica <= 5 por função).
   - Testes: [`apps/voice/src/operating-hours-turn-handler.test.ts`](file:///d:/voice-agent-platform/apps/voice/src/operating-hours-turn-handler.test.ts) (18 testes unitários passando).
   - Guards: Tenant Match Guard (`sessionOrganizationId === configurationOrganizationId`), Runtime State Guard (`runtimeState === 'ACTIVE'`), Configuration Guard (`operatingHours` não-vazio) e Capability Matcher Guard.
   - Resposta: wrapper literal puro `"Nosso horário de atendimento é: ${operatingHours}."` sem chamadas generativas.

### 10.3. Status Factual das Capacidades
- `HANDLER_IMPLEMENTATION`: `IMPLEMENTED / TESTED LOCALLY`
- `CAPABILITY_RESOLUTION`: `IMPLEMENTED / TESTED LOCALLY`
- `FIRST_DETERMINISTIC_HANDLER`: `agent.operating_hours`
- `KNOWN_DETERMINISTIC_HANDLERS`: `1` (após gates completos válidos)
- `ACTIVE_DETERMINISTIC_BYPASS_READINESS`: `BLOCKED` (sem fiação de runtime para bypass)
- `ACTIVE_GUARDED`: `BLOCKED` (inalcançável no runtime de produção)
- `DIRECT_VOICE_SPEAK_CAPABILITY_EXISTS`: `YES`
- `DIRECT_HANDLER_TO_TRANSPORT_WIRING`: `NO`
- `PRODUCTION_RUNTIME_WIRING`: `NO`
- `CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE`: `NOT CLEARED`
- `CUSTOMER_TRAFFIC`: `PROHIBITED`
- `QUALITY_GATE`: `PASS` (pnpm check: 105 test files passed, 659 tests passed, 45 historical skips, 0 new skips, 0 failures)
