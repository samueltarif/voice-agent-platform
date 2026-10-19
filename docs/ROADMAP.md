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

#### Fatiamento Sequencial Proposto para a Fase 8:
- [ ] **Slice 008A — Phase 8 Architecture Foundation, Port Definitions & Webhook Security Ingress (Planning & Foundation)**:
  - Formalização documental e arquitetural das Portas de integração: `TelephonyProviderPort`, `RecordingStoragePort`, `HumanHandoffBridgingPort`.
  - Design e especificações do Webhook Ingress seguro para staging (validação de assinaturas criptográficas/HMAC, prevenção contra replay, resolução de tenant por DID).
  - Isolamento orçamentário mandatório e definição de Hard Budget Caps.
- [ ] **Slice 008B — Real Telephony Provider Adapter & Inbound Gateway Execution**:
  - Implementação concreta do adapter do carrier selecionado (ex.: Twilio / Telnyx) em `packages/integrations` (mantendo o core estritamente provider-neutral).
  - Gateway de entrada de chamadas (`InboundCallGateway`) mapeando DIDs para `organizationId` e versão publicada ativa do agente (`agentVersionStatus === 'PUBLISHED'`).
  - Suíte de testes offline e integração com simuladores antes de qualquer chamada real.
- [ ] **Slice 008C — Call Recording Ingestion & Tenant-Isolated Object Storage**:
  - Implementação do adapter de Object Storage (S3 / Cloudflare R2 / GCS) em `packages/integrations`.
  - Ingestão de áudio pós-chamada com isolamento estrito por tenant (`/recordings/:orgId/:callId.wav`).
  - Emissão de URLs assinadas de curta duração (`signed URLs`) para reprodução autorizada no Agent Studio (`apps/web`).
  - Implementação do aviso mandatório de gravação e conformidade jurídica (DEC-024 / LGPD).
- [ ] **Slice 008D — Live Human Handoff Bridging**:
  - Conexão da máquina de estados determinística (Slice 007E / 006BQ) com o bridging telefônico real (SIP Refer, PSTN transfer ou WebRTC bridge).
  - Notificação de operador humano, transferência supervisionada e fallback fail-closed em caso de indisponibilidade de atendente.
- [ ] **Slice 008E — Outbound Live Carrier Dialer Integration**:
  - Conexão do dispatcher assíncrono de campanhas (Slice 007D) com a porta de discagem do carrier real.
  - Controle rígido de concorrência e rate-limiting por tenant.
  - Detecção de secretária eletrônica (AMD) e handoff para o runtime de voz.
- [ ] **Slice 008F — External Business Adapters (CRM & Calendar)**:
  - Implementação de adapters provider-neutral para sincronização de contatos, agendamento de eventos e envio de resumos de chamada pós-atendimento.
- [ ] **Slice 008G — Staging Telephony Validation, Security Audit & Phase 8 Closure**:
  - Testes controlados em ambiente de staging com números de teste e créditos orçamentários delimitados.
  - Auditoria completa de custos de carrier, latência de ponta a ponta e segurança de webhooks.
  - Fechamento formal da Fase 8.

#### Decisões Humanas da Fase 8 (Status de Deliberação):
1. **Escolha do Provedor de Telefonia**: **DECIDIDO (DEC-042)** — Twilio selecionada exclusivamente com números gerenciados pela plataforma. BYON formalmente cancelado. Compras de números exigem autorização humana separada (`PURCHASE_OF_PHONE_NUMBERS = 0`).
2. **Plataforma Conversacional de Voz**: **DECIDIDO (DEC-042)** — Millis AI selecionada para conversação em tempo real (STT, LLM, TTS). Contratos de webhook e autenticação classificados como `NOT_VERIFIED`.
3. **Tetos Orçamentários e Limites de Gasto**: **PENDENTE** — Definição expressa de limites financeiros rígidos no provedor antes de qualquer discagem externa (ex.: limite máximo de $20 USD em staging).
4. **Provedor de Armazenamento de Gravações**: **CANDIDATO SELECIONADO PARA PLANEJAMENTO (DEC-042)** — Cloudflare R2 planejado para armazenamento privado pós-chamada; setup, políticas jurídicas e retenção permanecem pendentes.
5. **Conformidade Jurídica de Gravações**: **PENDENTE** — Definição das políticas de aviso de gravação, consentimento explícito do interlocutor e prazos de retenção (DEC-024 / LGPD / GDPR).
6. **Topologia de Transbordo Humano**: **PENDENTE** — Definição da arquitetura de conexão humana (SIP Trunk, transferência PSTN ou softphone WebRTC no navegador).
7. **Infraestrutura de Webhooks para Staging**: **PENDENTE** — Definição do domínio público, terminação TLS e validação de assinaturas de webhook recebidas do provedor telefônico e da Millis AI.

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

