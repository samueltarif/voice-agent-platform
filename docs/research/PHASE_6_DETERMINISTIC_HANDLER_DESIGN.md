# Phase 6 — Primeiro Candidato a Handler Determinístico: Documento de Design (PHASE_6_DETERMINISTIC_HANDLER_DESIGN.md)

> **Status**: DESIGN / AUDIT ONLY (Aprovado para Especificação — Implementação: NOT STARTED)  
> **Data**: 2026-10-01  
> **Fase**: Phase 6 (Voice Model Routing & Jev Evaluation)  
> **Prompt de Origem**: `PROMPT-006V-DETERMINISTIC-HANDLER-CANDIDATE-DESIGN-001`  
> **Invariante Formal**: `NO_KNOWN_DETERMINISTIC_HANDLER -> NO_DETERMINISTIC_BYPASS`  

---

## 1. Contexto e Bloqueios Vigentes (Current Blockers)

No estado atual da plataforma, o roteamento probabilístico pelo classificador auxiliar TypeSafe Jev foi validado em ambiente sintético de staging (PR #46, PR #47 e PR #48), comprovando telemetria non-blocking e latência dentro da janela operacional nominal (`STAGING_SHADOW_TIMEOUT_MS = 1500ms`, mediana observada de 275ms, 0 timeouts).

Contudo, a ativação de qualquer bypass determinístico no runtime (`ACTIVE_GUARDED`) permanece estritamente bloqueada por design. Os seguintes bloqueios são factuais e permanecem vigentes:

- `KNOWN_DETERMINISTIC_HANDLERS`: `0`
- `ACTIVE_DETERMINISTIC_BYPASS_READINESS`: `BLOCKED` (fail-closed)
- `ACTIVE_GUARDED`: `BLOCKED` (inalcançável no runtime)
- `CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE`: `NOT CLEARED`
- `CUSTOMER_TRAFFIC`: `PROHIBITED`
- `PRODUCTION_RUNTIME_WIRING`: `NO`
- `PRODUCTION_JEV_TIMEOUT_MS`: `NOT SELECTED`
- `PRODUCTION_SHADOW_MAX_CONCURRENCY`: `NOT SELECTED`

O objetivo deste documento é realizar um inventário rigoroso das capacidades já implementadas no repositório, aplicar 14 regras mandatórias de elegibilidade e definir o **primeiro candidato seguro e mínimo** para quando a plataforma for autorizada a avançar para `KNOWN_DETERMINISTIC_HANDLERS > 0`.

---

## 2. Inventário de Capacidades Existentes no Repositório

Foi realizada uma auditoria estrita do código-fonte versionado em:
- `packages/contracts/**`
- `packages/database/**`
- `apps/api/**`
- `apps/voice/**`
- `packages/integrations/**`
- `apps/worker/**`

### 2.1. Capacidades Auditadas

| Capacidade | Fonte Autoritativa da Verdade | Implementação Existente (Service/Repo/Port) | Escopo de Tenant | Mutação vs Read-Only | Input Estruturado | Output Estruturado | Comportamento em Falha | Depende de OpenAI Hoje? | Lógica de Domínio Provider-Neutral Existe? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Horário de Funcionamento do Agente** (`agent.operating_hours`) | `AgentConfigurationSnapshotV1.rules.deterministic.operatingHours` (persistido em `agent_versions.configuration` no PostgreSQL via schema Drizzle) | `packages/contracts/src/agents/agent-configuration-v1.ts`; já entregue ao runtime de voz em `AgentConfigurationSnapshotV1` | Explícito por `organizationId` e FK de agente | Read-Only estrito (leitura de snapshot imutável em memória) | Turn context + `callerTranscript` + `snapshot.rules.deterministic.operatingHours` | String determinística com horário (ex: `"08:00-18:00"`) | Fail-closed (se ausente/inválido, fallback para LLM) | Sim (atualmente todo turno vai para OpenAI) | Sim (schema Zod tipado e snapshot em memória) |
| **Identidade / Empresa do Agente** (`agent.company_identity`) | `AgentConfigurationSnapshotV1.persona.companyName` e `persona.role` | `packages/contracts/src/agents/agent-configuration-v1.ts` | Explícito por `organizationId` | Read-Only estrito | Turn context + `snapshot.persona` | Identidade e empresa configuradas | Fail-closed | Sim | Sim |
| **Frase de Encerramento Estática** (`agent.closing_phrase`) | `AgentConfigurationSnapshotV1.persona.closingPhrase` | `packages/contracts/src/agents/agent-configuration-v1.ts` | Explícito por `organizationId` | Read-Only na fala, mas ambíguo com encerramento de chamada | Turn context + `snapshot.persona.closingPhrase` | Frase de encerramento configurada | Fail-closed | Sim | Sim |
| **Frase de Fallback Estática** (`agent.static_fallback`) | `AgentConfigurationSnapshotV1.persona.fallbackPhrase` | `packages/contracts/src/agents/agent-configuration-v1.ts` | Explícito por `organizationId` | Read-Only | Evento de erro ou não-reconhecimento | Frase de fallback configurada | N/A (mecanismo de recuperação, não bypass de intenção) | Sim | Sim |
| **Consulta de Desconto Máximo** (`agent.max_discount`) | `AgentConfigurationSnapshotV1.rules.deterministic.maxDiscountPercent` | `packages/contracts/src/agents/agent-configuration-v1.ts` | Explícito por `organizationId` | Read-Only | Turn context + `snapshot.rules.deterministic.maxDiscountPercent` | Percentual numérico (ex: `15`) | Fail-closed | Sim | Sim |
| **Consulta de Catálogo / Preço de Produto** (`catalog.product_price`) | Inexistente (apenas mencionado como exemplo em `docs/VOICE_ARCHITECTURE.md`) | Inexistente no código (`ProductPricingService` não existe) | N/A | N/A | N/A | N/A | N/A | N/A | Não |
| **Consulta de Agenda / Calendário** (`calendar.get_slots`) | Inexistente (definido apenas como interface conceitual em `docs/INTEGRATIONS.md`) | Inexistente no código (`CalendarProvider` pendente) | N/A | N/A | N/A | N/A | N/A | N/A | Não |
| **Consulta de CRM** (`crm.find_contact`) | Inexistente (interface conceitual em `docs/INTEGRATIONS.md`) | Inexistente no código (`CRMProvider` pendente) | N/A | N/A | N/A | N/A | N/A | N/A | Não |
| **Consulta de Quotas Comerciais** (`commercial.quota_check`) | `packages/database/src/repositories/commercial-repository.ts` | `CommercialEntitlementResolver` | Explícito por `organizationId` | Read-Only | `organizationId` | Entitlements comerciais do tenant | Fail-closed | Não (controle interno) | Sim (mas pertence ao Control Plane / API, não ao runtime de voz) |

---

## 3. Regras Mandatórias de Elegibilidade para Primeiro Handler

Um candidato a primeiro handler determinístico DEVE satisfazer rigorosamente **todas** as 14 condições abaixo:

1. **Fonte Estruturada/Autoritativa**: A resposta deriva de dados canônicos duráveis ou snapshot imutável validado;
2. **Operação Read-Only**: A execução não realiza mutação de banco de dados, arquivos ou estado durável;
3. **Sem Efeitos Colaterais**: Zero disparos de webhooks externos, filas assíncronas ou mutações em memória;
4. **Sem Alteração de Lifecycle da Chamada**: Não transiciona estado de chamada (`CONNECTING`, `ACTIVE`, `ENDED`, `FAILED`);
5. **Sem Alteração de Handoff**: Não transfere chamada para atendente humano nem altera flags de handoff;
6. **Sem Decisão de Autorização por IA**: Nenhuma permissão, autenticação ou acesso é concedido por decisão heurística;
7. **Sem Decisão Financeira**: Não concede descontos, não estorna valores, não emite cobranças e não autoriza pedidos;
8. **Tenant Scope Explícito e Verificável**: `organizationId` obrigatório e validado estritamente;
9. **Formato Determinístico**: A resposta é previsível, invariável para o mesmo input e reproduzível;
10. **Suporte a Fail-Closed**: Qualquer falha, ausência de dado ou ambiguidade aborta o bypass e retorna para o fluxo padrão generativo;
11. **Independência de LLM para Correção Factual**: A veracidade da resposta independe de geração aberta de texto;
12. **Isolamento de Privacidade**: Não exige transmissão de transcrições de clientes para provedores externos adicionais;
13. **Necessidade Real de Produto**: Atende a uma demanda factual do produto (FAQ operacional comum em telefonia);
14. **Reaproveitamento Mínimo de Código Existente**: Baseado em contratos, schemas e snapshots já existentes.

### Exclusões Rígidas de Alto Risco (High-Risk Exclusions)
São expressamente **proibidos** como primeiro handler:
- Cobrança e pagamento;
- Mutação de preços e concessão de descontos (`maxDiscountPercent`);
- Autorização e verificação de identidade;
- Comutação de tenant;
- Mutação de ciclo de vida de campanhas ou chamadas;
- Transferência para operador humano (*human handoff*);
- Agendamento de calendário (*calendar mutations*);
- Mutações de CRM ou estoque;
- Decisões de escalonamento de segurança;
- Qualquer operação dependente de alucinação de LLM.

---

## 4. Matriz de Avaliação dos Candidatos (Candidate Matrix)

| Candidato | Fonte da Verdade | Read-Only | Tenant-Safe | Sem Efeitos Colaterais | Output Estruturado | LLM Desnecessário p/ Correção | Fail-Closed Suportado | Reutilização Existente | Elegível p/ 1º Handler? | Justificativa / Rationale |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`agent.operating_hours`** | `snapshot.rules.deterministic.operatingHours` | SIM | SIM | SIM | SIM | SIM | SIM | SIM (`contracts` + `database` + `voice`) | **SIM** | Cumpre todos os 14 critérios. Dado puramente factual, pré-configurado no snapshot publicado do agente, sem mutações. |
| **`agent.company_identity`** | `snapshot.persona.companyName` | SIM | SIM | SIM | SIM | SIM | SIM | SIM (`contracts`) | **SIM** (Secundário) | Elegível, mas de menor valor operacional isolado do que horário de funcionamento. |
| **`agent.closing_phrase`** | `snapshot.persona.closingPhrase` | SIM | SIM | NÃO (Risco) | SIM | SIM | SIM | SIM | **NÃO** | Risco de conflito com ciclo de vida: o cliente espera desconexão ao final da frase de despedida, violando regra de lifecycle. |
| **`agent.static_fallback`** | `snapshot.persona.fallbackPhrase` | SIM | SIM | SIM | SIM | SIM | SIM | SIM | **NÃO** | Mecanismo de recuperação de erro, não resposta a intenção de negócio de turno. |
| **`agent.max_discount`** | `snapshot.rules.deterministic.maxDiscountPercent` | SIM | SIM | NÃO (Risco) | SIM | SIM | SIM | SIM | **NÃO** | Expressamente proibido pela Seção 6 (decisão financeira / política de desconto). |
| **`catalog.product_price`** | Inexistente | N/A | N/A | N/A | N/A | N/A | N/A | NÃO | **NÃO** | Código de domínio e repositório não implementados no repositório. Proibido pela Seção 6. |
| **`calendar.get_slots`** | Inexistente | N/A | N/A | N/A | N/A | N/A | N/A | NÃO | **NÃO** | Adapter e provider não implementados. Proibido pela Seção 6. |
| **`commercial.quota_check`**| `commercialRepository` | SIM | SIM | SIM | SIM | SIM | SIM | SIM | **NÃO** | Não é capacidade conversacional do interlocutor telefônico; pertence ao painel administrativo. |

---

## 5. Seleção do Primeiro Candidato (Selection Result)

```
FIRST_DETERMINISTIC_HANDLER_CANDIDATE = agent.operating_hours
```

### Análise YAGNI e Justificativa de Engenharia
- **CURRENT_REQUIREMENT**: Responder determinística e autoritativamente sobre o horário de atendimento da organização quando o cliente perguntar (ex.: `case-lat-004` da bateria sintética: `"Qual é o horário de atendimento?"`).
- **EXISTING_OPTION**: O campo `operatingHours` já existe no schema Zod `agentDeterministicRulesV1Schema` (`packages/contracts/src/agents/agent-configuration-v1.ts`), é persistido em banco (`packages/database/src/schema/agents.ts`), é editável na UI (`apps/web`) e já é fornecido no `AgentConfigurationSnapshotV1` consumido pelo `ConversationOrchestrator` de voz.
- **MINIMAL_OPTION**: Um handler puro de leitura que recupera `snapshot.rules.deterministic.operatingHours` e produz uma resposta textual determinística parametrizada para transmissão direta ao canal de voz.
- **Nenhum Novo Banco / Nova Tabela**: Nenhuma migration ou nova entidade é necessária.
- **Nenhum Provedor Externo**: Não depende de APIs pagas de terceiros.

---

## 6. Modelo de Autoridade do Handler (Handler Authority Model)

A separação de autoridade entre IA consultiva, política da aplicação e execução determinística segue estritamente o `ADR-019`:

```
                    ┌────────────────────────────┐
                    │    Fala do Interlocutor    │
                    │   (user.speech.final)      │
                    └─────────────┬──────────────┘
                                  │
                                  ▼
                    ┌────────────────────────────┐
                    │ Eligibility Filter         │
                    │ - Tem operatingHours?      │
                    │ - Estado é ACTIVE?         │
                    │ - Tenant válido?           │
                    └──────┬──────────────┬──────┘
                       NÃO │              │ SIM
                           │              ▼
                           │  ┌────────────────────────────┐
                           │  │ Classificador Jev (Cons.)  │
                           │  │ (Retorna scores em [0,1])  │
                           │  └───────────┬────────────────┘
                           │              │
                           │              ▼
                           │  ┌────────────────────────────┐
                           │  │ Frozen Policy Interpr.     │
                           │  │ - Regra 1: SECURITY?       │
                           │  │ - Regra 2: DETERMINISTIC?  │
                           │  │ - Regra 3: GENERATIVE?     │
                           │  └───────────┬────────────────┘
                           │              │
                           │    DETERMINISTIC_CANDIDATE
                           │              │
                           │              ▼
                           │  ┌────────────────────────────┐
                           │  │ Handler Registry Lookup    │
                           │  │ Capability: operating_hours│
                           │  └───────────┬────────────────┘
                           │              │
                           │              ▼
                           │  ┌────────────────────────────┐
                           │  │ OperatingHoursHandler      │
                           │  │ Executa leitura determin.  │
                           │  └───────────┬────────────────┘
                           │              │
                           │      SUCESSO │ FALHA
                           ▼              ▼
           ┌──────────────────────┐   ┌───────────────────────────────┐
           │ Fallback: OpenAI     │   │ Resposta Determinística Direta│
           │ (streamTurn regular) │   │ (VoiceTransport.speak direto) │
           └──────────────────────┘   └───────────────────────────────┘
```

### Regras Estritas de Autoridade:
1. **O Jev NUNCA executa o handler**: O Jev apenas devolve probabilidades numéricas consultivas (`deterministicScore`, etc.).
2. **O Jev NUNCA decide autoridade final de negócio**: A política congelada e o registry decidem a elegibilidade.
3. **Fail-Closed Total**: Se o handler não existir, se o valor de `operatingHours` for indefinido, se o tenant divergir ou se o Jev classificar como `GENERATIVE_REQUIRED` ou `SECURITY_ESCALATE`, o bypass é **terminantemente proibido**.
4. **Fallback Preservado**: Na recusa do bypass, a chamada segue sem qualquer interrupção pelo fluxo generativo padrão do modelo principal (`ConversationModelPort.streamTurn`), garantindo experiência contínua ao usuário.

---

## 7. Guardião de Handler Conhecido (Known-Handler Guard)

A regra arquitetural `NO_KNOWN_DETERMINISTIC_HANDLER -> NO_DETERMINISTIC_BYPASS` é preservada de forma invariável.

O guardião lógico para uma futura execução em `ACTIVE_GUARDED` deve avaliar a seguinte conjunção booleana:

```ts
const canExecuteDeterministicBypass =
  globalAllowedMode === 'ACTIVE_GUARDED' &&
  organizationMode === 'ACTIVE_GUARDED' &&
  policyDecision.routingClass === 'DETERMINISTIC_CANDIDATE' &&
  handlerRegistry.hasHandler(capabilityId) &&
  handlerRegistry.getHandler(capabilityId).isEligible({ session, snapshot, turnInput }) &&
  session.organizationId === snapshot.organizationId &&
  session.runtimeState === 'ACTIVE';
```

Se qualquer cláusula for falsa:
```
canExecuteDeterministicBypass === false
-> BYPASS PROHIBITED
-> FALLBACK TO MAIN MODEL (OPENAI)
```

---

## 8. Verbalização e Resposta Direta (Response Generation Analysis)

### Classificação Factual:
```
DIRECT_DETERMINISTIC_RESPONSE_SUPPORTED = YES
```

### Justificativa Técnica:
O `OperatingHoursHandler` pode produzir diretamente o texto final formatado a ser verbalizado pelo motor de síntese de voz (TTS) através de `VoiceTransportPort.speak(callId, { text, generationId, isFinal: true })`.

Exemplo de formato determinístico seguro em português (PT-BR):
- Template canônico: `"Nosso horário de atendimento é ${operatingHours}."`
- Se `operatingHours === "08:00-18:00"`: `"Nosso horário de atendimento é das 08:00 às 18:00."`

**Consequência de Valor**:
- **OpenAI Token Cost**: `0`
- **OpenAI Latency**: `0 ms` (latência generativa totalmente eliminada)
- **Risco de Alucinação**: `0%`
- A resposta final **NÃO** depende de verbalização adicional por LLM generativo.

---

## 9. Interação com Privacidade e Dados do Cliente

- **Necessidade de Dados Reais de Clientes**: `CUSTOMER_DATA_REQUIRED = NO`.
- O handler pode ser 100% testado e validado em staging sintético utilizando turnos simulados neutros (ex.: `"Qual é o horário de atendimento?"`, `"Até que horas vocês atendem?"`).
- **Portão de Dados de Clientes**:
  ```
  CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE = NOT CLEARED
  CUSTOMER_TRAFFIC = PROHIBITED
  ```
  O design deste handler **NÃO libera** e não autoriza tráfego telefônico com clientes reais.

---

## 10. Auditoria de Contratos e Registry

### 10.1. Auditoria de Contratos
- **CURRENT_REQUIREMENT**: Uma interface tipada provider-neutral que defina a assinatura de um handler determinístico de turno e seu resultado.
- **EXISTING_OPTION**: Contratos existentes em `@voice-agent/contracts` cobrem `AgentConfigurationSnapshotV1`, `AuxiliaryTurnDecisionPort`, `ConversationModelPort` e `VoiceTransportPort`, mas **não possuem** interface dedicada para handlers determinísticos de turno.
- **MINIMAL_OPTION**: Declarar em `packages/contracts/src/voice/` a interface mínima enxuta:
  ```ts
  export interface DeterministicTurnEvaluationInput {
    readonly organizationId: string;
    readonly callId: string;
    readonly turnId: string;
    readonly callerTranscript: string;
    readonly snapshot: AgentConfigurationSnapshotV1;
  }

  export interface DeterministicTurnEvaluationOutput {
    readonly handled: boolean;
    readonly responseText?: string | undefined;
    readonly capabilityId: string;
  }

  export interface DeterministicTurnHandler {
    readonly capabilityId: string;
    isEligible(input: DeterministicTurnEvaluationInput): boolean;
    handleTurn(input: DeterministicTurnEvaluationInput): Promise<DeterministicTurnEvaluationOutput>;
  }
  ```
- **Classificação**: `NEW_CONTRACT_REQUIRED = YES` (a ausência desta interface forçaria acoplamento direto ou tipagem `any`, violando a disciplina de ports and adapters).

### 10.2. Auditoria de Registry
- **EXISTING_HANDLER_REGISTRY**: `NO`.
- **YAGNI Anti-Overengineering**:
  - Proibido criar sistemas de plugins dinâmicos ou injeção reflexiva.
  - O registry mínimo será uma classe simples `DeterministicHandlerRegistry` contendo um `Map<string, DeterministicTurnHandler>`, com métodos `register(handler)` e `findEligible(input)`.

---

## 11. Estratégia de Testes para Futura Implementação

Quando a implementação deste handler for autorizada em slice futuro, a suíte de testes unitários e de integração deve comprovar:

1. **Execução com Sucesso**: Quando `snapshot` possui `operatingHours` e input é elegível, o handler executa e gera texto correto.
2. **Capacidade Inexistente**: Quando input não corresponde a horário de atendimento, o bypass é recusado (`handled: false`).
3. **Configuração Ausente**: Se `snapshot.rules.deterministic.operatingHours` for `undefined` ou vazio, fail-closed imediato (`handled: false`).
4. **Isolamento de Tenant**: Se `session.organizationId !== snapshot.organizationId`, fail-closed imediato.
5. **Preservação de Invariantes**: Zero chamadas a `endCall`, zero chamadas a ferramentas de handoff e zero mutações de estado na máquina de estados da chamada (`runtimeState` permanece `ACTIVE`).
6. **Zero Chamadas a Provedores Externos**: Testes 100% isolados sem chamadas à rede, OpenAI, Twilio ou TypeSafe.
7. **Supressão de Chamada OpenAI no Bypass**: Comprovar que `ConversationModelPort.streamTurn` **NÃO** é invocado quando o bypass determinístico tem sucesso.
8. **Preservação de Fallback**: Comprovar que `ConversationModelPort.streamTurn` **É** invocado quando o bypass é recusado.

---

## 12. Não-Objetivos Explícitos (Explicit Non-Goals)

Este design estabelece formalmente os seguintes limites:
- **NÃO** implementa código de handler neste prompt;
- **NÃO** altera o valor de `KNOWN_DETERMINISTIC_HANDLERS = 0`;
- **NÃO** ativa `ACTIVE_GUARDED`;
- **NÃO** altera a política de roteamento congelada (`FROZEN_POLICY`);
- **NÃO** fia o handler no runtime de produção (`apps/voice`);
- **NÃO** libera tráfego de clientes reais;
- **NÃO** implementa handlers de cobrança, cancelamento, desconto, CRM ou agendamento.
