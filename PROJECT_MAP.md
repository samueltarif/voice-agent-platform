# Mapa do Projeto (PROJECT_MAP.md)

Este documento apresenta a estrutura de alto nível para o monorepo `voice-agent-platform`. Cada área possui uma única responsabilidade canônica explicitada abaixo.

```
voice-agent-platform/
├── apps/
│   ├── web/              # Aplicação Next.js 15 App Router: Shell responsivo, Dashboard operacional, Live Calls preview, Platform Control Plane e Better Auth endpoints.
│   │   ├── src/app/          # Rotas Next.js (/, /dashboard, /calls, /platform, /ui-preview, /api/auth/[...all]) e globals.css.
│   │   ├── src/shell/        # TenantShell, DesktopSidebar colapsável, MobileBottomNav, MobileMenuDrawer e AppTopbar.
│   │   ├── src/features/     # Vertical slices: dashboard metrics, live-calls, command-palette e platform admin.
│   │   ├── src/lib/auth/     # Configuração Better Auth (Identity + Session) e client React de autenticação.
│   │   ├── src/mocks/        # Mocks determinísticos tipados com valores monetários estritamente em integer cents.
│   │   └── src/preferences/  # Módulo puro ui-preferences-storage e context de persistência de tema/densidade sem hydration mismatch.
│   ├── api/              # API HTTP e Gateway para regras de negócio, persistência multi-tenant, webhooks e orquestração (Framework Hono via DEC-029/ADR-010; IMPLEMENTED LOCAL / TESTED no Slice 005C com OpenAPI 3.1.0 e Internal Service Auth assimétrica DEC-031/ADR-012).
│   ├── voice/            # Motor de baixa latência em tempo real para streaming de áudio, transcrição, diálogo e síntese de voz.
│   └── worker/           # Processamento em background para tarefas assíncronas, transcrições em lote, analytics e campanhas.
│
├── packages/
│   ├── ui/               # Biblioteca compartilhada de componentes (Radix/Tailwind v4) com peerDependencies de React.
│   │   ├── src/tokens/       # Contratos puros de tokens e tipos de preferências (CSS variables em globals.css como SSOT).
│   │   ├── src/components/   # Primitives (Button, Card, Badge, Avatar, Input, Separator, Tooltip, DropdownMenu, Sheet, Dialog, Progress, Table, Command).
│   │   └── src/class-names.ts# Utilitário puro de merge de classes CSS (clsx + tailwind-merge).
│   ├── database/         # Camada de persistência real (PostgreSQL 16, Drizzle ORM, schemas físicos de auth e domínio, repositories tipados).
│   │   ├── src/client/       # Pool lazy agnóstico (node-postgres pg) e migrator versionado seguro.
│   │   ├── src/schema/       # Schemas por domínio: auth, organizations, platform-admin, commercial e audit.
│   │   ├── src/repositories/ # Repositórios tipados isolados exigindo organizationId obrigatório em operações tenant.
│   │   └── src/migrations/   # Migrations SQL versionadas geradas pelo Drizzle Kit.
│   ├── contracts/        # Contratos canônicos neutros, tipos compartilhados, DTOs, eventos, schemas de validação do Agent Studio (Zod selecionado via DEC-028/ADR-009; instalação no Slice 005B) e portas de domínio.
│   ├── config/           # Centralização de validação e carregamento tipado de variáveis de ambiente para todos os módulos.
│   ├── logger/           # Utilitário de logging estruturado com suporte a correlationId e organizationId.
│   ├── errors/           # Hierarquia padronizada de erros operacionais e de domínio (AppError, NotFoundError, UnauthorizedError).
│   ├── integrations/     # Implementações concretas de adapters (telefonia, IA, storage) desacopladas do core.
│   └── test-utils/       # Utilitários, factories, mocks e fakes reutilizáveis para testes automatizados determinísticos.
│
├── scripts/
│   ├── check-architecture.mjs     # Guardrail arquitetural com AST do TypeScript (fronteiras de apps e banimento de arquivos genéricos).
│   ├── check-file-size.mjs        # Guardrail de tamanho de arquivos (alvo 80-150, teto 180 linhas) em arquivos de lógica de produção.
│   └── file-size-allowlist.json   # Allowlist centralizada e versionada para exceções autorizadas com justificativa explícita.
│
├── docs/                 # Documentação técnica, arquitetural, operacional e histórica do projeto.
│   ├── architecture/
│   │   └── decisions/    # Architecture Decision Records (ADRs) documentando decisões fundamentais.
│   ├── AI_WORKLOG.md     # Registro central obrigatório de todas as ações executadas por IA.
│   └── DECISIONS_LOG.md  # Registro formal de decisões confirmadas e pendências técnicas.
│
├── .editorconfig         # Configuração de indentação (2 espaços), encoding (utf-8) e quebras de linha (lf).
├── .gitattributes        # Normalização de quebras de linha no Git (* text=auto eol=lf).
├── .node-version         # Runtime Node.js oficial (24.20.0).
├── .prettierignore       # Exclusão de arquivos de documentação (*.md) e builds da formatação.
├── prettier.config.mjs   # Configuração ESM do Prettier.
├── pnpm-workspace.yaml   # Declaração dos workspaces e controle de lifecycle scripts (onlyBuiltDependencies).
├── package.json          # Manifest raiz com scripts unificados de qualidade (dev, build, lint, typecheck, test, check).
├── turbo.json            # Orquestração de pipeline com cache inteligente via Turborepo 2.x.
├── tsconfig.base.json    # Configuração estrita de TypeScript compartilhada com path mappings para source.
├── tsconfig.json         # Configuração TypeScript raiz para scripts e tooling.
├── eslint.config.mjs     # ESLint 9 Flat Config com regras de complexidade ciclomática, nesting e limites de função.
├── vitest.config.ts      # Configuração centralizada do Vitest com test.projects em monorepo.
├── AGENTS.md             # Instruções operacionais e regras de desenvolvimento estritas para agentes de IA.
├── PROJECT_CONSTITUTION.md # Leis imutáveis e princípios de governança que nunca devem ser violados.
├── ARCHITECTURE.md       # Arquitetura geral, fluxo de dependências e fronteiras dos módulos do sistema.
└── README.md             # Visão geral do repositório, objetivos do produto e guia de navegação inicial.
```

---

## Responsabilidades Resumidas

- **`apps/web`**: Dashboard administrativo e operacional responsivo para clientes B2B interagirem com o ecossistema.
- **`apps/api`**: Ponto de entrada HTTP seguro para regras de negócio e persistência (Hono implementado e testado localmente no Slice 005C via DEC-029/ADR-010 e DEC-031/ADR-012).
- **`apps/voice`**: Orquestrador bidirecional de streaming de voz projetado para mínima latência e interrupção humana natural.
- **`apps/worker`**: Consumidor de filas para processamento pesado assíncrono e tarefas em lote desacopladas do fluxo síncrono.
- **`packages/ui`**: Sistema de design reutilizável e agnóstico de tela com foco mobile-first.
- **`packages/database`**: Camada única e tipada de acesso e migração de dados relacionais protegida por multi-tenancy.
- **`packages/contracts`**: Contratos canônicos de interfaces, schemas canônicos de validação de configuração do Agent Studio (Zod selecionado via DEC-028/ADR-009; instalação no Slice 005B), eventos e portas consumidos por múltiplos módulos.
- **`packages/config`**: Carregamento seguro e validação estrita de configurações de ambiente em tempo de inicialização.
- **`packages/logger`**: Coletor de telemetria e logs em formato JSON estruturado com injeção de correlation IDs.
- **`packages/errors`**: Catálogo centralizado de classes e códigos de erro previsíveis para toda a aplicação.
- **`packages/integrations`**: Adaptadores concretos para serviços externos implementando as portas abstratas do domínio.
- **`packages/test-utils`**: Infraestrutura para testes reprodutíveis, rápidos e sem dependência de APIs externas pagas.
