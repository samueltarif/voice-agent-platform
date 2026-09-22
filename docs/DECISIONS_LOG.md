# Registro de Decisões de Arquitetura e Engenharia (DECISIONS_LOG.md)

Este documento registra formalmente as decisões aprovadas e em vigor no projeto, bem como os tópicos em aberto marcados estritamente como pendentes.

Data de Registro Inicial: 21 de Setembro de 2026.

---

## 1. Decisões Confirmadas

| ID | Data | Categoria | Decisão Confirmada | Justificativa / Impacto |
| :--- | :--- | :--- | :--- | :--- |
| **DEC-001** | 2026-09-21 | Estrutura | **Adoção de Monorepo Modular** | Centralização de contratos compartilhados, tipagem fim-a-fim e simplicidade de governança para agentes de IA sem a complexidade de múltiplos repositórios. |
| **DEC-002** | 2026-09-21 | Arquitetura | **Rejeição a Microserviços Prematuros** | Todo o sistema opera como processos coesos dentro do monorepo, evitando overhead de rede, orquestração distribuída prematura e consistência eventual desnecessária. |
| **DEC-003** | 2026-09-21 | Arquitetura | **Vertical Slices nos Módulos de Domínio** | Agrupar código por funcionalidade/domínio em vez de camadas técnicas transversais, reduzindo acoplamento e facilitando a navegação de agentes de IA. |
| **DEC-004** | 2026-09-21 | Integrações | **Padrão Provider/Adapter Obrigatório** | Código de negócio é proibido de importar SDKs externos. Todas as integrações com telefonia, IA, storage, CRM e calendário ocorrem via interfaces de domínio neutras. |
| **DEC-005** | 2026-09-21 | Persistência | **Acesso ao Banco Exclusivo via Repositories** | Lógica de aplicação não contém queries SQL puras soltas; persistência encapsulada em camada tipada com isolamento garantido. |
| **DEC-006** | 2026-09-21 | Multi-Tenancy | **Isolamento Lógico Obrigatório por `organizationId`** | Toda entidade com escopo de cliente deve conter identificador da organização; queries e operações devem filtrar rigidamente o tenant ativo. |
| **DEC-007** | 2026-09-21 | Persistência | **Alterações de Banco Exclusivamente por Migrations** | Proibição de DDL manual em produção. Todas as alterações estruturais são versionadas, rastreáveis e idempotentes. |
| **DEC-008** | 2026-09-21 | IA & Negócio | **LLM Não É Fonte da Verdade para Regras Críticas** | Preços, estoques, permissões e regras financeiras/fiscais são computados por código determinístico testável; LLMs orientam conversa e intenção. |
| **DEC-009** | 2026-09-21 | Interface | **Abordagem Mobile-First Unificada** | O dashboard B2B é construído primeiro para mobile e se adapta a telas maiores. Proibida a criação de bases de código duplicadas para mobile e desktop. |
| **DEC-010** | 2026-09-21 | Governança | **Proteção de Produção contra Ações Autônomas de IA** | Operações destrutivas, DDLs e deploys em produção exigem barreira de aprovação humana explícita. |
| **DEC-011** | 2026-09-21 | Ambientes | **Segregação de Ambientes (Dev, Staging, Production)** | Ambientes conceitualmente e operacionalmente isolados, com credenciais e bancos distintos. |
| **DEC-012** | 2026-09-21 | Código | **Limites Estritos de Complexidade e Arquivos** | Arquivos de lógica com alvo de 80-150 linhas (máx 180); funções até 30 linhas (máx 50); complexidade ciclomática <= 8; nesting <= 3. |
| **DEC-013** | 2026-09-21 | Código | **Banimento Total de Arquivos Genéricos** | Proibida a criação de `utils.ts`, `helpers.ts`, `common.ts`, `misc.ts`, `manager.ts`. Todo utilitário deve ter responsabilidade clara no nome. |
| **DEC-014** | 2026-09-21 | Governança | **Investigação Prévia Obrigatória antes de Criar Código** | Agentes devem pesquisar implementações existentes para evitar duplicações desnecessárias. |
| **DEC-015** | 2026-09-21 | Eventos | **Envelope Padrão de Eventos Versionados** | Todo evento interno deve conter `id`, `name`, `version`, `timestamp`, `organizationId` e `correlationId`. |
| **DEC-016** | 2026-09-21 | Observabilidade| **Logs Estruturados e Rastreamento Ponta a Ponta** | Proibido `console.log` em produção. Operações utilizam `requestId`, `callId`, `jobId`, `campaignId`. |
| **DEC-017** | 2026-09-21 | Testes | **TDD Obrigatório para Correção de Bugs e Regras** | Todo bug deve iniciar pela reprodução em teste automatizado; testes de unidade nunca realizam chamadas a APIs pagas reais. |
| **DEC-018** | 2026-09-21 | Tooling | **Stack de Tooling, Monorepo e Guardrails Automáticos** | Adoção de Node.js v24.20.0 (suporte a Node v22 LTS em produção), pnpm v12 workspaces, Turborepo 2.x, TypeScript strict, ESLint 9 Flat Config com regras de complexidade, Prettier, Vitest 3.2.7, e guardrails automáticos via scripts com AST do TypeScript. |
| **DEC-019** | 2026-09-22 | Arquitetura | **Separação entre Tenant App e Platform Control Plane** | Formalizada a segregação estrutural entre a área de clientes e o plano de controle global do SaaS. `Platform Admin` (Master Admin) é autorização global independente de tenant; auto-elevação é impossível. Consulte `docs/PLATFORM_CONTROL_PLANE.md`. |
| **DEC-020** | 2026-09-22 | Comercial | **Desacoplamento entre Pagamento e Direito de Acesso** | Direitos de uso resolvidos por Plano + Entitlements + Estado Comercial (não por boolean ingênuo). Modos `SELF_SERVICE`, `MANUAL`, `COMPLIMENTARY` e concessões manuais auditáveis (`CommercialGrant`). |
| **DEC-021** | 2026-09-22 | Comercial | **Resolução de Capacidades Estritamente por Entitlements** | Proibição de condicionais hardcoded (`if (plan === 'x')`). Capacidades e cotas operacionais são resolvidas dinamicamente via Entitlements por organização. |
| **DEC-022** | 2026-09-22 | Financeiro | **Separação Estrutural entre Usage, Cost e Billing** | Consumo volumétrico factual (`Usage`), custo real de provedores (`Cost`) e faturamento comercial (`Billing`) operam desacoplados; `Usage` é agnóstico ao gateway de pagamento. |
| **DEC-023** | 2026-09-22 | Voz & Handoff | **Protocolo Determinístico de Human Handoff e Prevenção de Abandono** | Transbordo humano operado por protocolo orquestrado e state machine determinística (`NONE` a `AI_DETACHED`). Proibição de silêncio indefinido com fallbacks automatizados. Consulte `docs/LIVE_CALLS_AND_HANDOFF.md`. |
| **DEC-024** | 2026-09-22 | Segurança | **Governança de Gravações de Chamadas e Compliance Jurídico** | Gravações privadas por padrão em object storage, acessadas via mecanismo autenticado/autorizado, temporário e auditável quando aplicável (como presigned URLs, signed delivery ou endpoint autenticado), com TTL configurável. Requisitos de aviso, ciência, consentimento e/ou base legal aplicável marcados como `COMPLIANCE VERIFICATION REQUIRED BEFORE PRODUCTION`. |

---

## 2. Decisões Técnicas Pendentes (Pending Human Decisions)

Nenhuma das tecnologias e fornecedores abaixo foi selecionada de forma definitiva. Agentes de IA **não devem** assumir dependências concretas até aprovação explícita.

| Tópico | Candidatos em Avaliação | Status |
| :--- | :--- | :--- |
| **Motor de Banco de Dados Relacional** | PostgreSQL / MySQL / CockroachDB | **Status: Pending Decision** |
| **Camada de Acesso a Dados / ORM** | Prisma / Drizzle / Kysely / TypeORM | **Status: Pending Decision** |
| **Linguagem do Voice Engine (`apps/voice`)** | TypeScript (Node) / Python / Go / Rust | **Status: Pending Decision** |
| **Motor de Sessão em Tempo Real & Cache** | Redis / Valkey / Dragonfly | **Status: Pending Decision** |
| **Sistema de Filas e Mensageria Assíncrona** | BullMQ (Redis) / RabbitMQ / AWS SQS / Temporal | **Status: Pending Decision** |
| **Fornecedor Primário de Telefonia** | Twilio / Telnyx / Plivo / Zadarma | **Status: Pending Decision** |
| **Fornecedor de Motor de Voz / LLM Realtime**| OpenAI Realtime API / ElevenLabs Conversational / Deepgram + LiveKit | **Status: Pending Decision** |
| **Provedor de Object Storage** | Cloudflare R2 / AWS S3 / Google Cloud Storage | **Status: Pending Decision** |
| **Provedor de Autenticação de Usuários** | Custom JWT + Passwordless / Clerk / Auth0 / Supabase Auth | **Status: Pending Decision** |
| **Framework do Frontend Web (`apps/web`)** | Next.js (App Router) / Vite + React SPA | **Status: Pending Decision** |
| **Infraestrutura de Hospedagem / Cloud** | AWS / Google Cloud Platform / Fly.io / Kubernetes | **Status: Pending Decision** |
| **Gateway de Pagamento / Faturamento SaaS** | Stripe / Asaas / Pagar.me | **Status: Pending Decision** |
| **Live Audio Stream (Áudio ao Vivo no Navegador)** | WebRTC / WebSockets Audio Broadcast | **Status: Planned / Provider-Dependent / Not Yet Validated** |
| **Modo Listen-Only do Operador no Handoff** | Muting seletivo de carrier / Audio Bridging | **Status: Planned / Provider-Dependent / Not Yet Validated** |

