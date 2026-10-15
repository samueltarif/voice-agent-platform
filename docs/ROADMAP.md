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

### 🤖 FASE 7 — Agente IA e Tools *(Pendente de Validação Pós-Merge da Fatia 007L)*
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
  - [ ] **Slice 007L — Governance Closure & Phase 8 Readiness** *(Em andamento — Reconciliação documental e governança; formalmente pendente de validação canônica pós-merge na main)*.

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

### 📞 FASE 8 — Telefonia Real
- Integração com provedor de telefonia real (Pending Human Decision).
- Recepção de chamadas receptivas (inbound) com DIDs dedicados.
- **Call Recording & Storage**: Ingestão e upload de gravações para object storage com acesso autenticado/temporário e isolamento por tenant.
- **Conexão Real de Transbordo**: Bridging de linha telefônica e transferência SIP/WebSockets para operadores humanos.
- Implementação de adaptadores para CRM e Calendário.

#### Decisões Humanas Pendentes para a Fase 8 (Não decididas pelo agente):
1. **Escolha do Provedor de Telefonia**: Seleção do carrier/fornecedor (ex.: Twilio, Telnyx, Plivo ou terminação SIP direta). O agente não decide em nome do operador.
2. **Tetos Orçamentários e Limites de Gasto**: Definição expressa de limites financeiros rígidos no provedor antes de qualquer discagem externa.
3. **Provedor de Armazenamento de Gravações**: Seleção de serviço de object storage em nuvem (ex.: AWS S3, Cloudflare R2, Google Cloud Storage).
4. **Conformidade Jurídica de Gravações**: Definição das políticas de aviso de gravação, consentimento explícito do interlocutor e prazos de retenção (DEC-024 / LGPD / GDPR).
5. **Topologia de Transbordo Humano**: Definição da arquitetura de conexão humana (SIP Trunk, transferência PSTN ou softphone WebRTC no navegador).
6. **Infraestrutura de Webhooks para Staging**: Definição do domínio público, terminação TLS e validação de assinaturas de webhook recebidas do provedor telefônico.

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

