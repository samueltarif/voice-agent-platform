# Roteiro de Desenvolvimento do Produto (ROADMAP.md)

Este documento estabelece as fases sequenciais de implementação da plataforma. Esta ordem é a referência atual e pode conter subtarefas paralelas futuramente.

> **Revisado em**: 21 de Setembro de 2026 (PROMPT-001B)

---

## Fases de Implementação

### 📄 FASE 0 — Constituição e Documentação *(Concluída)*
- [x] Elaboração do [AGENTS.md](file:///D:/voice-agent-platform/AGENTS.md) com diretrizes operacionais para IAs.
- [x] Definição da [PROJECT_CONSTITUTION.md](file:///D:/voice-agent-platform/PROJECT_CONSTITUTION.md) com princípios inegociáveis.
- [x] Desenho da arquitetura geral e fluxo de processos no [ARCHITECTURE.md](file:///D:/voice-agent-platform/ARCHITECTURE.md).
- [x] Mapeamento dos pacotes e aplicações no [PROJECT_MAP.md](file:///D:/voice-agent-platform/PROJECT_MAP.md).
- [x] Elaboração dos Architecture Decision Records fundamentais (ADR-001 a ADR-006).
- [x] Criação do [FOUNDATION_MASTER.md](file:///D:/voice-agent-platform/FOUNDATION_MASTER.md) consolidado.
- [x] Criação do [AI_WORKLOG.md](file:///D:/voice-agent-platform/docs/AI_WORKLOG.md) como registro central obrigatório.
- [x] Revisão da fundação (PROMPT-001B): correção de decisões prematuras, incorporação de Agent Studio, versionamento de agentes, Knowledge Base, Agent Evals e Human Handoff.
- [ ] **Aprovação humana para transição de fase** *(pendente)*.

---

### 🏗️ FASE 1 — Arquitetura e Contratos *(Aguardando Aprovação)*
- Definição final das tecnologias pendentes (banco, ORM, cache, filas, cloud).
- Definição de interfaces de domínio abstratas (`TelephonyProvider`, `RealtimeAIProvider`, `StorageProvider`, etc.).
- Definição de schemas canônicos de eventos e DTOs compartilhados.

---

### 📦 FASE 2 — Monorepo e Tooling
- Setup da configuração de monorepo (workspace) e ferramentas de build.
- Criação dos pacotes compartilhados essenciais:
  - `packages/contracts`: Schemas canônicos e interfaces de domínio;
  - `packages/errors`: Catálogo padronizado de exceções;
  - `packages/logger`: Utilitário de logging estruturado;
  - `packages/config`: Validador de variáveis de ambiente;
  - `packages/test-utils`: Utilitários e fakes para testes.
- Configuração de linters e regras estritas de complexidade.

---

### 🎨 FASE 3 — Design System e Shell da Aplicação
- Implementação do `packages/ui` com biblioteca de design tokens e componentes adaptativos mobile-first.
- Aprovação final de tipografia, breakpoints e tokens visuais (atualmente "Proposed Default").
- Shell do dashboard B2B mobile-first estruturado para contemplar os dois contextos:
  - **Tenant Application**: Agentes, campanhas, histórico/ao vivo de chamadas, contatos, equipe e analytics;
  - **Platform Control Plane**: Organizações, planos, entitlements, concessões comerciais e auditoria da plataforma.
- *(Nota: Monitoramento ao vivo, gravações e handoff serão representados com dados mockados no shell visual; o funcionamento operacional real permanece atrelado às Fases 6 e 8).*

---

### 🗄️ FASE 4 — Persistência, Autenticação e Multi-Tenancy
- Decisão do banco de dados relacional e ORM/Query Builder.
- Modelagem das entidades centrais de tenant: `organizations`, `users`, `agents`, `contacts`, `calls`, `campaigns`.
- Implementação do sistema de migrações versionadas.
- Criação de Repositories tipados com validação mandatória de `organizationId`.
- Implementação do provedor de autenticação com segregação formal de `Platform Admin` global.
- **Subfase 4.1 — Modelo Comercial e Governança da Plataforma**:
  - Modelagem e persistência de `Plans`, `Entitlements`, `Subscriptions`, `CommercialGrants` e credenciais de `Platform Admin`;
  - Resolução dinâmica de capacidades por entitlements (sem condicionais hardcoded de plano);
  - *(Faturamento automatizado via gateway integrado poderá ser conectado posteriormente).*

---

### 🏪 FASE 5 — Domínios Base e Agent Studio
- Arquitetura aprovada formalmente (DEC-028, DEC-029, ADR-009, ADR-010).
- **Fatiamento Sequencial Aprovado**:
  - **005B**: Domain Core & Database Persistence (`Agent` e `AgentVersion`, schema Drizzle, PostgreSQL 16, migration, Repositories, validação Zod neutra em `packages/contracts`, concorrência `agents.max` com lock transacional).
  - **005C**: API Framework, Internal Auth & /v1 Endpoints (Hono para Node.js, `@hono/node-server`, `@hono/zod-openapi`, Short-Lived Asymmetric Signed Service Assertion, endpoints REST /v1).
  - **005D**: Frontend Agent Studio UI (Dashboard B2B em `apps/web`, editor de draft, publicação transacional).
- CRUD de organizações, usuários e controle de acesso (RBAC).
- Gestão de contatos e bases de discagem (subfases subsequentes).
- Catálogo determinístico de produtos e serviços (subfases subsequentes).
- Configuração e disparo de campanhas outbound (subfases subsequentes).

---

### 🎤 FASE 6 — Motor de Voz *(Concluída — Motor Offline 100% / PHASE6_STATUS = CLOSED)*
- [x] Implementação das portas `TelephonyProvider` e `RealtimeAIProvider`.
- [x] Criação de adaptadores de simulação/fake para desenvolvimento e testes sem custos.
- [x] Orquestração de pipeline de áudio bidirecional (WebSockets/SIP stream).
- [x] Implementação de VAD configurável e algoritmo de barge-in.
- [x] Mecanismo determinístico de execução de ferramentas (*tool calling*).
- [x] **Human Handoff Protocol**: Máquina de estados determinística (`NONE` → `REQUESTED` → `SELLER_NOTIFIED` → `SELLER_READY` → `AI_PREPARING` → `READY_TO_JOIN` → `HUMAN_CONNECTED` → `AI_DETACHED`) e fallbacks de indisponibilidade (Slice 006BQ).
- [x] **Live Call Telemetry**: Transmissão em tempo real de transcrição, eventos e telemetria de chamadas ativas.
- [x] **Parâmetros Operacionais de Produção**: Deferimento formal por decisão humana explícita de `PRODUCTION_JEV_TIMEOUT_MS`, `PRODUCTION_SHADOW_MAX_CONCURRENCY` e `PRODUCTION_ACTIVE_GUARDED_MAX_CONCURRENCY` para a Fase 10 (Slice 006BR / DEC-038).

---

### 🤖 FASE 7 — Agente IA e Tools *(Concluída e Validada na Main — Fechamento Formalizado por Aceitação Humana)*
- API Core e orquestração outbound (`apps/api`).
- Definição e implementação das tools disponíveis para agentes.
- Versionamento de agentes: ciclo canônico DRAFT → PUBLISHED → ARCHIVED (supersedendo o ciclo anterior com TEST como status persistente; TEST é atividade pontual de validação — DEC-028 / ADR-009).
- Knowledge Base: integração de dados estruturados (determinístico) e não estruturados (RAG — arquitetura definida via ADR-020; vetores e embeddings deferidos).
- **Fatiamento Sequencial da Fase 7**:
  - [x] **Slice 007A — Universal Tool Execution Engine & Runtime Context** (PR #94 / Merged): Motor universal `ToolExecutionEngine`, `InMemoryToolRegistry`, isolamento de contexto e validação via Zod.
  - [x] **Slice 007B — Catalog Business Data Domain & Deterministic Tools** (PR #95 / Merged): Schema `catalog_items` (migration `0002_silent_squadron_sinister.sql`), `CatalogRepository`, `CatalogSearchTool` e `CatalogItemDetailTool`.
  - [x] **Slice 007C — Agent Studio Toolset Configuration** (PR #96 / Merged): Edição de ferramentas autorizadas no Agent Studio (`apps/web`), snapshot JSONB tipado em `agent_versions.configuration`.
  - [x] **Slice 007D — Outbound Campaigns Domain, Worker Dispatcher & Scheduling** (PR #105 / Merged): Schema `outbound_campaigns` e `outbound_call_jobs` (migration `0003_tiresome_nemesis.sql`), rotas `/v1/campaigns`, dispatcher atômico com `SKIP LOCKED` e bootstrap de chamadas de voz.
  - [x] **Slice 007E — Call Handoff State Machine & Offline Contracts** (PR #106 / Merged): Máquina de estados determinística de handoff humano e contratos offline de transferência.
  - [x] **Slice 007F — Knowledge Base Domain & Neutral Contracts** (PR #108 / Merged): Contratos de documentos, chunks, escopos de acesso e portas de retrieval neutras em `packages/contracts`.
  - [x] **Slice 007G / 007H — Knowledge Base Persistence, Ingestion & Retrieval Runtime** (PR #110 / Merged): Schemas `knowledge_documents` e `knowledge_chunks` (migrations `0004_ordinary_charles_xavier.sql` e `0006_peaceful_thunderbolt.sql`), `KnowledgeDocumentRepository`, ingestão atômica de texto confiável local com normalização NFC e hashing SHA-256, e retrieval léxico offline delimitado por tenant.
  - [x] **Slice 007I — Agent Version Draft Discard & Published Version Lock** (PR #107 / Merged / DEC-040) e **Offline Voice Knowledge Handoff** (PR #111 / Merged): Rota `POST /v1/agents/:agentId/versions/draft/discard` preservando imutabilidade de versões publicadas, e coordenador offline `VoiceKnowledgeRetrievalCoordinator`.
  - [x] **Slice 007J — Knowledge Base API Management** (PR #112 / Merged / DEC-039): Rotas REST autenticadas `/v1/knowledge/documents` (POST ingest, GET list, GET detail, POST archive) com autorização RBAC dedicada (`knowledge.read`, `knowledge.ingest`, `knowledge.archive`), paginação delimitada e proteção anti-enumeração.
  - [x] **Slice 007K — Knowledge Base Studio UI & BFF** (PR #113 / Merged): Interface web completa no Agent Studio (`apps/web`), rotas BFF `/api/knowledge-documents` com asserções criptográficas Ed25519 de curta duração, controle de concorrência otimista (`If-Match`/`ETag` e update atômico condicional), proteção CSRF fail-closed para `X-Forwarded-Host`, consistência multi-aba via `x-knowledge-org-slug` e interface acessível e responsiva.
  - [x] **Slice 007L — Governance Closure & Phase 8 Readiness** (PR #114 / Merged na Main em 461f37e / Post-Merge Gate PASS): Reconciliação documental completa de governança, histórico factual de 007K e 005D atualizado, Phase 7 formalmente concluída por aceitação humana formal (DEC-041).

- **Escopo Entregue na Fase 7**:
  - Motor universal de ferramentas e resolução de toolset por versão publicada;
  - Domínio de catálogo determinístico, ferramentas de busca e detalhe de itens;
  - Campanhas outbound com agendamento em lote e despacho atômico assíncrono;
  - Máquina de estados determinística de handoff para operador humano e contratos offline;
  - Descarte seguro de rascunhos de versão mantendo integridade e imutabilidade de versões publicadas (DEC-040);
  - Persistência e repositórios de base de conhecimento com migrações versionadas (0004 e 0006);
  - Ingestão atômica de texto estrito NFC e busca léxica offline delimitada por tenant;
  - API HTTP autenticada com RBAC estrito (`knowledge.*`) e segregação de autoridade (gestão humana vs. retrieval do agente);
  - Interface do Agent Studio com gerenciamento de documentos e rotas BFF com asserções assimétricas Ed25519 e blindagem CSRF.

- **Capacidades Explicitamente Deferidas (Fora do Escopo da Fase 7)**:
  - Busca vetorial semântica e embeddings reais (`pgvector`, modelos de embedding pagos ou dedicados);
  - Ativação de RAG em runtime de produção e injeção em prompts de chamadas reais;
  - Ingestão de binários (PDFs, DOCX), arquivos de áudio e raspadores web (crawlers);
  - Conexão telefônica real e discagem por carriers (escopo estrito da Fase 8);
  - Integração com sistemas de CRM e calendários externos (escopo estrito da Fase 8);
  - Testes visuais E2E reais de navegador (deferidos; suíte executada com fakes/mocks);
  - Deploys de staging/produção para a nova API de Knowledge Base e novos serviços.

---

### 📞 FASE 8 — Telefonia Real *(Arquitetura e Planejamento Formalizados — DEC-042)*
- **Provedor de Telefonia**: Twilio selecionada formalmente (DEC-042) exclusivamente com números gerenciados para originação outbound. Suporte a BYON (Bring Your Own Number) formalmente cancelado.
- **Plataforma Conversacional de Voz**: Millis AI selecionada (DEC-042) para conversação em tempo real (STT, LLM, TTS, configuração de agentes e funções externas).
- **Código Offline Preservado**: Integração com Twilio ConversationRelay preservada intacta em `packages/integrations` (inativa; sem fiação em produção).
- **Divisão Arquitetural de Responsabilidades (DEC-042)**:
  - **Voice Agent Platform**: Multi-tenancy, Agent Studio, Knowledge Base, CRM e tools, campanhas outbound, agendamento de jobs, quotas, billing e controle financeiro.
  - **Twilio**: Telefonia, originação de chamadas, números gerenciados, transporte telefônico.
  - **Millis AI**: Conversação em tempo real, STT, LLM, TTS, configuração de agentes, webhooks e funções externas conforme contratos oficiais validados.
- **Outras Escolhas de Planejamento Reconciliadas**: Hostinger VPS (hospedagem futura planejada), Supabase (PostgreSQL gerenciado futuro planejado), Cloudflare R2 (armazenamento de arquivos e gravações privadas planejado).
- **Itens Classificados Obrigatoriamente como `NOT_VERIFIED`**:
  - Disponibilidade de números brasileiros Twilio.
  - Possibilidade real de integração outbound Twilio + Millis no Brasil.
  - Contratos de webhooks e mecanismo de autenticação da Millis.
  - Cobranças por tentativas sem atendimento.
  - Tarifas efetivas para fixo, celular e prefixo 0303.
  - Regras regulatórias brasileiras de telecomunicações.
  - Transferência de chamadas para humanos.

#### 1. Fatiamento Histórico Original da Fase 8 (Baseline de Referência 008A–008G)
- [ ] **Slice 008A — Phase 8 Architecture Foundation, Port Definitions & Webhook Security Ingress (Planning & Foundation)**:
  - Formalização documental e arquitetural das Portas de integração: `TelephonyProviderPort`, `RecordingStoragePort`, `HumanHandoffBridgingPort`.
  - Design e especificações de segurança do Webhook Ingress para staging (Twilio `X-Twilio-Signature`; Millis classificada como `NOT_VERIFIED`).
  - Isolamento orçamentário mandatório e definição de Hard Budget Caps.
- [ ] **Slice 008B — Real Telephony Provider Adapter & Inbound Gateway Execution**:
  - Implementação concreta do adapter do carrier selecionado (Twilio) em `packages/integrations` (mantendo o core estritamente provider-neutral).
  - Gateway de entrada de chamadas (`InboundCallGateway`) mapeando DIDs para `organizationId` e versão publicada ativa do agente.
- [ ] **Slice 008C — Call Recording Ingestion & Tenant-Isolated Object Storage**:
  - Implementação do adapter de Object Storage (Cloudflare R2 planejado) em `packages/integrations`.
  - Ingestão de áudio pós-chamada com isolamento estrito por tenant e signed URLs.
- [ ] **Slice 008D — Live Human Handoff Bridging**:
  - Conexão da máquina de estados determinística (Slice 007E / 006BQ) com o bridging telefônico real.
- [ ] **Slice 008E — Outbound Live Carrier Dialer Integration**:
  - Conexão do dispatcher assíncrono de campanhas (Slice 007D) com a porta de discagem do carrier real.
  - Concorrência, rate-limiting e detecção de secretária eletrônica (AMD).
- [ ] **Slice 008F — External Business Adapters (CRM & Calendar)**:
  - Adapters provider-neutral para sincronização de contatos, eventos e resumos pós-chamada.
- [ ] **Slice 008G — Staging Telephony Validation, Security Audit & Phase 8 Closure**:
  - Testes controlados em ambiente de staging com números de teste e créditos orçamentários delimitados.

---

#### 2. Proposta Refinada de Fatiamento Técnico OUTBOUND_FIRST (PROPOSED / PENDING_HUMAN_APPROVAL)

> **Status da Proposta**: `PROPOSED / PENDING_HUMAN_APPROVAL` (Elaborada em 2026-10-19 sob diretriz `OUTBOUND_FIRST` da DEC-042; aguardando deliberação humana formal para substituição oficial da ordem de execução).

##### A. Justificativa Técnica do Refatiamento
A ordem histórica 008A–008G postergava o dialer outbound para o Slice 008E, condicionando-o à construção prévia de recepção inbound (008B), storage de gravações (008C) e transbordo humano (008D). Como o objetivo central prioritário da plataforma no lançamento é a realização de **chamadas ativas outbound** (DEC-042), esta proposta antecipa os componentes essenciais de discagem e adia funcionalidades não-bloqueantes para após a validação do fluxo principal.

##### B. Princípios Arquiteturais e Ajustes Mandatórios da Proposta

1. **Autoridade Única de Originação (Provider-Neutral)**:
   - A interface de comando (`TelephonyOriginationPort`) permanece estritamente neutra em relação a provedores.
   - Foram avaliadas as duas opções de acionamento:
     - **Opção A (Millis-Led)**: Plataforma aciona Millis AI, que utiliza a infraestrutura/número Twilio configurado.
     - **Opção B (Twilio-Led)**: Plataforma inicia a chamada na Twilio e conecta o áudio à Millis AI por integração de mídia suportada.
   - Ambas as opções permanecem classificadas como **`PROVIDER-UNVERIFIED`** para operação real no Brasil (+55).
   - O projeto **não** assume `TwilioOutboundOriginationAdapter` como implementação definitiva obrigatória antes de o operador selecionar formalmente a opção.
   - **Invariante Mandatória**: **Uma única autoridade de originação por tentativa de discagem**. É terminantemente proibido disparar comandos concorrentes para Twilio e Millis para o mesmo destinatário.

2. **Separação Explícita de Entidades de Estado Durável**:
   - Os schemas existentes (`outbound_campaigns` e `outbound_call_jobs`) não devem acumular responsabilidades de execução em tempo real. A persistência operacional separa explicitamente:
     - *Job de Campanha* (`outbound_call_jobs`): intenção de agendamento e destinatário.
     - *Tentativa de Discagem* (`call_attempts`): registro monotônico de cada disparo (1, 2, 3), timestamp e resultado isolado da tentativa.
     - *Sessão de Chamada* (`call_sessions`): estado em tempo real da chamada em andamento.
     - *Referências Externas* (`provider_call_id`, `provider_leg_id`): identificadores duráveis atribuídos pelos provedores externos.
     - *Eventos Recebidos* (`call_events`): log auditável e idempotente de webhooks e transições.
     - *Custos e Liquidações* (`outbound_budget_ledgers`): controle de reservas pré-chamada e liquidação pós-chamada.

3. **Recuperação de Crash e Proteção contra Rediscagem Cega**:
   - Cenário de falha considerado: Worker persistiu a intenção de discagem -> enviou comando externo ao provedor -> provedor iniciou a chamada -> worker sofreu crash/reinício antes de registrar a resposta.
   - **Protocolo de Recuperação**: Na recuperação, tentativas sem desfecho conhecido entram em estado transitório `OUTCOME_UNKNOWN` / `PENDING_RECONCILIATION`.
   - É **proibida a rediscagem cega imediata** (evitando múltiplas chamadas simultâneas ao mesmo cliente).
   - O worker executa reconciliação idempotente consultando o provedor ou aguarda webhooks de encerramento com timeout delimitado antes de liberar nova tentativa.
   - A chave de idempotência interna (`idempotencyKey`) não é tratada como garantia suficiente de deduplicação sem validação contratual do provedor.

4. **Orçamento, Quotas e Governança Financeira Fail-Closed**:
   - A premissa de *até 50 tentativas outbound por tenant/dia* é estritamente uma **referência de dimensionamento inicial de planejamento**, não um limite implementado nem uma autorização de chamadas reais.
   - O valor de US$ 20 para staging é meramente ilustrativo, pendente de teto formal aprovado.
   - O plano exige:
     - Hard budget caps por tenant e global;
     - Limite de duração máxima por chamada com corte automático de segurança;
     - Reserva conservadora atômica de saldo estimado antes de emitir a ordem de discagem;
     - Separação contábil estrita entre custos de carrier (Twilio) e custos conversacionais (Millis AI);
     - Reconciliação tardia e estorno de saldos reservados não consumidos na finalização da chamada;
     - Limites rígidos de concorrência por organização (`max_concurrent_calls`) e retries por contato;
     - **Princípio Fail-Closed**: Se o saldo ou os limites não puderem ser confirmados atomicamente, a discagem é terminantemente bloqueada.

5. **Segurança de Webhooks e Contratos da Millis AI**:
   - Proibida a presunção de suporte a HMAC, payloads específicos, URLs ou timeout de 2 segundos para a Millis AI sem contratos oficiais validados.
   - Toda integração futura exigirá autenticação formal comprovada, resolução de `organizationId` exclusivamente server-side, proteção contra replay e eventos duplicados, e rejeição fail-closed (HTTP 401/403).
   - Webhooks públicos permanecem bloqueados até a homologação em staging.

6. **Elegibilidade de Contatos e Legislação Brasileira**:
   - Janelas de discagem são tratadas como **política configurável do tenant dependente de validação regulatória**, e não como regra universal aprovada (o intervalo 09h–20h BRT não constitui autorização legal universal).
   - Permanecem catalogados como **`NOT_VERIFIED`**: aplicabilidade das normas da Anatel sobre telemarketing ativo, prefixo 0303, regras de chamadas curtas (abaixo de 3 segundos), identificação de número de origem e consentimento de gravação (LGPD).

---

##### C. Tabela de Correspondência entre Slices Históricas e Proposta Nova

| ID Original | Escopo Original | Novo ID Proposto | Novo Escopo Priorizado (Outbound-First) | Status na Nova Ordem |
| :---: | :--- | :---: | :--- | :--- |
| **008A** | Fundação Geral & Ingress Webhooks | **008-OF1** | **Contratos e Ciclo de Vida Outbound Provider-Neutral** | Slice 1 (Imediata / Offline) |
| **008E** (parte) | Persistência de Discador | **008-OF2** | **Persistência Operacional e Números Twilio** | Slice 2 (Offline / Migrations) |
| **008A / 008E** | Quotas e Limites de Discagem | **008-OF3** | **Quotas, Concorrência e Orçamento (Hard Budget)** | Slice 3 (Offline / Guardrails) |
| **008A** (refinado) | Webhook Ingress | **008-OF4** | **Webhooks e Integração de Ferramentas Offline** | Slice 4 (Offline / Fakes) |
| **008E** (conclusão) | Integração Real de Carrier | **008-OF5** | **Integração Twilio + Millis com Simuladores E2E** | Slice 5 (Offline / Adapters) |
| **008G** | Staging Validation | **008-OF6** | **Homologação Controlada em Staging (1 Chamada Real)** | Slice 6 (Live sob autorização) |
| **008B** | Adapter Telefônico & Inbound Gateway | **008-POST1** | *Recepção Telefônica Inbound* | Postergada (Pós-Outbound MVP) |
| **008C** | Call Recording Ingestion & R2 | **008-POST2** | *Ingestão de Gravações Privadas em R2* | Postergada (Pós-Outbound MVP) |
| **008D** | Human Handoff Bridging ao Vivo | **008-POST3** | *Transbordo Telefônico para Operador Humano* | Postergada (Pós-Outbound MVP) |
| **008F** | CRM & Calendar Integrations | **008-POST4** | *Integrações com CRM e Calendário* | Postergada (Pós-Outbound MVP) |

*Nota de Preservação*: Nenhuma capacidade funcional existente foi removida ou descartada. As slices `008-POST1` a `008-POST4` mantêm seus requisitos preservados e serão executadas sequencialmente após a estabilização do MVP outbound.

---

##### D. Detalhamento Sequencial das Slices Outbound-First

- [ ] **Slice 008-OF1 — Contratos e Ciclo de Vida Outbound Provider-Neutral (Fundação)**:
  - **Objetivo**: Definir portas de originação, estados de tentativa e ciclo de vida de chamadas outbound sem acoplamento a fornecedores e sem migrations prematuras.
  - **Escopo**:
    - Porta `TelephonyOriginationPort` e tipos em `packages/contracts/src/telephony/`.
    - Máquina de estados de tentativas com suporte a estados transitórios (`OUTCOME_UNKNOWN`) e desfechos determinísticos.
    - Fakes e simuladores offline em memória para testes do ciclo de vida.
    - Zero migrations nesta slice (nenhuma dependência de banco novo).
  - **Dependências**: Nenhuma (executável imediatamente sobre a base atual da `main`).
  - **Arquivos Prováveis**: `packages/contracts/src/telephony/`, `apps/worker/src/`, `apps/voice/src/`.
  - **Testes Offline**: Testes unitários de transição de estado, validação de inputs e simulações de fluxo de chamada.
  - **Critérios de Aceitação**: Portas implementadas, suite de testes passando, `pnpm check` = exit 0, zero dependências externas.
  - **Riscos**: Acoplamento prematuro a conceitos específicos da Twilio ou Millis (mitigado por revisão provider-neutral).

- [ ] **Slice 008-OF2 — Persistência Operacional e Números Twilio**:
  - **Objetivo**: Modelar e persistir o vínculo de números gerenciados Twilio a organizações, separando jobs de tentativas individuais.
  - **Escopo**:
    - Migration aditiva versionada: tabela `organization_phone_numbers` (`organizationId`, `e164Number`, `twilioPhoneNumberSid`, `status: ACTIVE | RELEASED`).
    - Migration aditiva versionada: tabela `call_attempts` (`jobId`, `organizationId`, `attemptNumber`, `providerCallId`, `status`, `startedAt`, `endedAt`, `error`).
    - Repositórios com isolamento estrito multi-tenant.
  - **Dependências**: Conclusão da Slice 008-OF1.
  - **Arquivos Prováveis**: `packages/database/src/schema/`, `packages/database/src/repositories/`.
  - **Testes Offline**: Testes de persistência em PostgreSQL local (Docker) validando integridade referencial, índices e isolamento por tenant.
  - **Critérios de Aceitação**: Migrations aplicadas e testadas localmente, zero queries raw em controllers, rollback documentado.
  - **Riscos**: Colisão de números entre tenants (mitigado por unique index em `e164Number`).

- [ ] **Slice 008-OF3 — Quotas, Concorrência e Orçamento (Hard Budget Caps)**:
  - **Objetivo**: Implementar travas financeiras atômicas e de concorrência antes da autorização de qualquer discagem.
  - **Escopo**:
    - Tabela e repositório de ledger: `outbound_budget_ledgers` (saldo, reserva pendente, consumo consolidado).
    - Reserva atômica idempotente pré-chamada com estorno pós-chamada.
    - Limite de chamadas simultâneas por organização (`max_concurrent_calls`).
    - Verificação de quota diária (premissa de planejamento delimitada) e bloqueio fail-closed.
  - **Dependências**: Conclusão das Slices 008-OF1 e 008-OF2.
  - **Arquivos Prováveis**: `packages/database/src/`, `apps/worker/src/outbound-call-dispatcher.ts`.
  - **Testes Offline**: Testes de alta concorrência simulando esgotamento de saldo, saturação de concorrência e tentativa de discagem duplicada.
  - **Critérios de Aceitação**: Impossibilidade comprovada de saldo negativo em testes de estresse, fail-closed verificado.
  - **Riscos**: Deadlock em concorrência de saldo (mitigado por transações ordenadas e curtas).

- [ ] **Slice 008-OF4 — Webhooks e Integração de Ferramentas Offline**:
  - **Objetivo**: Construir a recepção segura de eventos e despacho de ferramentas determinísticas para a plataforma conversacional.
  - **Escopo**:
    - Endpoints de webhook em `apps/api` para status de chamada e acionamento de ferramentas.
    - Mecanismo de autenticação fail-closed simulado (sem presumir HMAC; token/header verificado).
    - Resolução server-side autoritativa de organização baseada no identificador interno.
    - Proteção contra replay, eventos fora de ordem e entrega duplicada.
    - Despacho determinístico para o `ToolExecutionEngine` existente em `apps/voice`.
  - **Dependências**: Conclusão das Slices 008-OF1 a 008-OF3.
  - **Arquivos Prováveis**: `apps/api/src/routes/`, `apps/voice/src/tool-execution-engine.ts`.
  - **Testes Offline**: Testes HTTP simulando payloads forjados, eventos fora de ordem, requisições repetidas e timeouts controlados.
  - **Critérios de Aceitação**: Rejeição 401/403 comprovada para dados não autenticados, resolução de tenant inviolável.
  - **Riscos**: Timeouts de rede em execução de ferramentas (mitigado por limite rígido de execução de 2s).

- [ ] **Slice 008-OF5 — Integração Twilio + Millis com Simuladores E2E**:
  - **Objetivo**: Desenvolver os adaptadores concretos de integração desacoplados em `packages/integrations` com simuladores de ponta a ponta.
  - **Escopo**:
    - Adaptador concreto de originação conforme a opção de autoridade aprovada pelo operador.
    - Adaptador de conversação Millis AI conectando ferramentas determinísticas e controle de sessão.
    - Simuladores offline robustos (`FakeTwilioOriginationSimulator`, `FakeMillisConversationSimulator`).
    - Preservação integral e intocada do código existente de Twilio ConversationRelay.
  - **Dependências**: Conclusão das Slices 008-OF1 a 008-OF4.
  - **Arquivos Prováveis**: `packages/integrations/src/`, `apps/worker/src/`.
  - **Testes Offline**: Suíte de testes E2E executada 100% offline simulando desde a criação da campanha até a finalização e reconciliação da chamada.
  - **Critérios de Aceitação**: Fluxo ponta a ponta aprovado localmente, classificação formal de adaptadores como `PROVIDER-UNVERIFIED`.
  - **Riscos**: Incompatibilidade entre simulador e comportamento real dos provedores (mitigado por isolamento rígido em adapters).

- [ ] **Slice 008-OF6 — Homologação Controlada em Staging (1 Chamada Real)**:
  - **Objetivo**: Comprovar a integração real com uma única chamada supervisionada de teste em staging, mediante autorização humana expressa.
  - **Escopo**:
    - Validação de pré-requisitos: número Twilio provisionado, créditos delimitados, número de destino autorizado.
    - Execução de 1 chamada de teste para telefone autorizado do operador humano.
    - Verificação de latência, áudio, execução de ferramenta real, encerramento e liquidação no ledger.
  - **Bloqueios Obrigatórios**:
    - Autorização humana formal separada.
    - `HARD_BUDGET_CAP` aprovado pelo operador.
    - `CUSTOMER_TRAFFIC = PROHIBITED`.
  - **Dependências**: Conclusão e validação estrita das Slices 008-OF1 a 008-OF5.
  - **Critérios de Aceitação**: Relatório factual de execução com logs sanitizados e confirmação de sucesso de ponta a ponta.

---

#### 3. Proposta de Decisão Formal DEC-043 (PROPOSED / PENDING_HUMAN_APPROVAL)
*Para deliberação e eventual aprovação formal do operador humano:*
- **Título**: DEC-043 — Adoção da Estrutura Outbound-First, Separação de Entidades Duráveis e Governança de Originação Única.
- **Resumo**: Formalizar a substituição da sequência 008A–008G pela ordem 008-OF1 a 008-OF6, postergando Inbound, R2, Handoff e CRM para após a validação do dialer outbound, estabelecendo as entidades duráveis de tentativas e ledger financeiro com autoridade de originação única e fail-closed.

---

#### 4. Decisões Humanas Pendentes da Fase 8 (Status de Deliberação):
1. **Aprovação do Fatiamento Outbound-First**: **PENDENTE** — Deliberação sobre a substituição da sequência original pela ordem 008-OF1 a 008-OF6 e eventual formalização da DEC-043.
2. **Seleção da Autoridade de Discagem (Opção A vs Opção B)**: **PENDENTE** — Escolha entre Millis-Led ou Twilio-Led para guiar o adaptador da Slice 008-OF5.
3. **Tetos Orçamentários e Limites Financeiros**: **PENDENTE** — Fixação formal de limites rígidos em USD antes de qualquer discagem externa em staging.
4. **Verificação de Números BR (+55) na Twilio**: **PENDENTE** — Confirmação de disponibilidade e exigências regulatórias no console Twilio.
5. **Homologação dos Contratos da Millis AI**: **PENDENTE** — Validação oficial dos modelos de webhook e autenticação fornecidos pela Millis AI.
6. **Diretrizes Regulatórias (Anatel / 0303 / Horários)**: **PENDENTE** — Definição da política de discagem, horários permitidos e conformidade regulatória brasileira.
7. **Política Jurídica de Gravações**: **PENDENTE** — Definição das políticas de aviso de gravação e retenção para o Slice 008-POST2.
8. **Topologia de Transbordo Humano**: **PENDENTE** — Definição da arquitetura de conexão humana para o Slice 008-POST3.
9. **Infraestrutura de Ingress para Staging**: **PENDENTE** — FQDN e TLS para recepção de webhooks no servidor de staging.

---

---

### 📊 FASE 9 — Observabilidade, Evals e Custos
- Workers assíncronos para transcrições, analytics e faturamento (`apps/worker`).
- Subsistema de Agent Evals: execução de cenários e comparação entre versões.
- Feedback supervisionado: ciclo de revisão humana e geração de nova versão.
- Dashboards de latência (p50, p95, p99), consumo (Usage) e custos reais de carriers (Cost).

---

### 🛡️ FASE 10 — Hardening, Staging e Produção
- Seleção final, tuning e validação dos parâmetros operacionais de produção (`PRODUCTION_JEV_TIMEOUT_MS`, `PRODUCTION_SHADOW_MAX_CONCURRENCY`, `PRODUCTION_ACTIVE_GUARDED_MAX_CONCURRENCY`) antes da ativação de `ACTIVE_GUARDED` e liberação de tráfego real (DEC-038).
- Bateria de testes de carga simulando dezenas de chamadas simultâneas.
- Auditoria de segurança e pentest em isolamento multi-tenant e credenciais de Platform Admin.
- Verificação formal de conformidade jurídica de gravação de chamadas antes de produção.
- Piloto controlado em ambiente de produção com clientes beta.
- Estratégia de retorno gradual (canary/blue-green) para deploys.

