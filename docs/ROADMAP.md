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
- Implementação do `packages/ui` com biblioteca de design tokens e componentes adaptativos.
- Aprovação final de tipografia, breakpoints e tokens visuais (atualmente "Proposed Default").
- Shell do dashboard B2B mobile-first (navegação, layout base, modo escuro/claro).

---

### 🗄️ FASE 4 — Persistência, Autenticação e Multi-Tenancy
- Decisão do banco de dados relacional e ORM/Query Builder.
- Modelagem das entidades centrais: `organizations`, `users`, `agents`, `contacts`, `calls`, `campaigns`.
- Implementação do sistema de migrações versionadas.
- Criação de Repositories tipados com validação mandatória de `organizationId`.
- Implementação do provedor de autenticação (Pending Decision).

---

### 🏪 FASE 5 — Domínios Base: Clientes, Produtos, Serviços e Campanhas
- CRUD de organizações, usuários e controle de acesso (RBAC).
- Gestão de contatos e bases de discagem.
- Catálogo determinístico de produtos e serviços.
- Configuração e disparo de campanhas outbound.
- Agent Studio: Criação e configuração de agentes via interface (sem código).

---

### 🎤 FASE 6 — Motor de Voz
- Implementação das portas `TelephonyProvider` e `RealtimeAIProvider`.
- Criação de adaptadores de simulação/fake para desenvolvimento e testes sem custos.
- Orquestração de pipeline de áudio bidirecional (WebSockets/SIP stream).
- Implementação de VAD configurável e algoritmo de barge-in.
- Mecanismo determinístico de execução de ferramentas (*tool calling*).
- Human Handoff: transferência de chamada com preservação de contexto.

---

### 🤖 FASE 7 — Agente IA e Tools
- API Core e orquestração outbound (`apps/api`).
- Definição e implementação das tools disponíveis para agentes.
- Versionamento de agentes: ciclo DRAFT → TEST → PUBLISHED → ARCHIVED.
- Knowledge Base: integração de dados estruturados (determinístico) e não estruturados (RAG — Pending Decision).

---

### 📞 FASE 8 — Telefonia Real
- Integração com provedor de telefonia real (Pending Decision).
- Recepção de chamadas receptivas (inbound) com DIDs dedicados.
- Implementação de adaptadores para CRM e Calendário.

---

### 📊 FASE 9 — Observabilidade, Evals e Custos
- Workers assíncronos para transcrições, analytics e faturamento (`apps/worker`).
- Subsistema de Agent Evals: execução de cenários e comparação entre versões.
- Feedback supervisionado: ciclo de revisão humana e geração de nova versão.
- Dashboards de latência (p50, p95, p99), consumo e custos.

---

### 🛡️ FASE 10 — Hardening, Staging e Produção
- Bateria de testes de carga simulando dezenas de chamadas simultâneas.
- Auditoria de segurança e pentest em isolamento multi-tenant.
- Piloto controlado em ambiente de produção com clientes beta.
- Estratégia de retorno gradual (canary/blue-green) para deploys.


---

## Fases de Implementação

### 🚀 Etapa 1: Fundação Documental, Arquitetural e Operacional *(Fase Atual)*
- [x] Elaboração do [AGENTS.md](file:///D:/voice-agent-platform/AGENTS.md) com diretrizes operacionais para IAs.
- [x] Definição da [PROJECT_CONSTITUTION.md](file:///D:/voice-agent-platform/PROJECT_CONSTITUTION.md) com princípios inegociáveis.
- [x] Desenho da arquitetura geral e fluxo de processos no [ARCHITECTURE.md](file:///D:/voice-agent-platform/ARCHITECTURE.md).
- [x] Mapeamento dos pacotes e aplicações no [PROJECT_MAP.md](file:///D:/voice-agent-platform/PROJECT_MAP.md).
- [x] Registro inicial de decisões e pendências no [DECISIONS_LOG.md](file:///D:/voice-agent-platform/docs/DECISIONS_LOG.md).
- [x] Elaboração dos Architecture Decision Records fundamentais (ADR-001 a ADR-006).
- [ ] Aprovação humana para transição de fase.

---

### 📦 Etapa 2: Estrutura do Monorepo, Contratos e Tooling Base
- Setup da configuração de monorepo (workspace) e ferramentas de build.
- Criação dos pacotes compartilhados essenciais:
  - `packages/contracts`: Schemas canônicos e interfaces de domínio;
  - `packages/errors`: Catálogo padronizado de exceções;
  - `packages/logger`: Utilitário de logging estruturado;
  - `packages/config`: Validador de variáveis de ambiente;
  - `packages/test-utils`: Utilitários e fakes para testes.
- Configuração de linters e regras estritas de complexidade (máx 180 linhas).

---

### 🗄️ Etapa 3: Persistência, Multi-Tenancy e Migrações
- Decisão do banco de dados relacional e ORM/Query Builder.
- Modelagem das entidades centrais: `organizations`, `users`, `agents`, `contacts`, `calls`, `campaigns`.
- Implementação do sistema de migrações versionadas.
- Criação de Repositories tipados com validação mandatória de `organizationId`.

---

### 🎙️ Etapa 4: Motor de Voz em Tempo Real (`apps/voice`)
- Implementação das portas `TelephonyProvider` e `RealtimeAIProvider`.
- Criação de adaptadores de simulação/fake para desenvolvimento e testes sem custos.
- Orquestração de pipeline de áudio bidirecional (WebSockets/SIP stream).
- Implementação de VAD e algoritmo de corte imediato por interrupção (*barge-in*).
- Mecanismo determinístico de execução de ferramentas (*tool calling*).

---

### 🌐 Etapa 5: API Core e Orquestração Outbound (`apps/api`)
- Rotas HTTP para autenticação, gerenciamento de tenants, agentes e catálogo.
- Validação estrita de entrada via schemas de `packages/contracts`.
- Endpoint de disparo de chamadas ativas e recepção de webhooks telefônicos.
- Despacho de eventos internos do ciclo de vida da chamada (`call.created`, `call.started`, etc.).

---

### 📱 Etapa 6: Dashboard Administrativo Mobile-First (`apps/web`)
- Implementação de `packages/ui` com biblioteca de design tokens e componentes adaptativos.
- Telas de gerenciamento: Organizações, Agentes, Contatos, Campanhas e Relatórios.
- Player de áudio móvel e visualizador sincronizado de transcrição.
- Painéis de acompanhamento de latência e consumo financeiro.

---

### ⚙️ Etapa 7: Workers Assíncronos e Pós-Processamento (`apps/worker`)
- Configuração do sistema de filas e mensageria assíncrona.
- Upload de gravações de áudio para object storage via `StorageProvider`.
- Sumarização e geração de transcrições com diarização.
- Consolidação de custos e métricas analíticas da chamada.

---

### 📞 Etapa 8: Chamadas Receptivas (Inbound) e Integrações Corporativas
- Recepção de chamadas via DIDs dedicados com árvore inteligente de atendimento.
- Implementação de adaptadores reais para CRM (`HubSpot`, `Salesforce`) e Calendário (`Google Calendar`).
- Transbordo inteligente para operadores humanos (SIP transfer).

---

### 🛡️ Etapa 9: Homologação, Testes de Carga e Lançamento
- Bateria de testes de carga simulando dezenas de chamadas simultâneas.
- Auditoria de segurança e pentest em isolamento multi-tenant.
- Piloto controlado em ambiente de produção com clientes beta.

