# Mapa do Projeto (PROJECT_MAP.md)

Este documento apresenta a estrutura de alto nível para o monorepo `voice-agent-platform`. Cada área possui uma única responsabilidade canônica explicitada abaixo.

```
voice-agent-platform/
├── apps/
│   ├── web/              # Dashboard B2B mobile-first para gestão de agentes, campanhas, chamadas e configurações.
│   ├── api/              # API HTTP e Gateway para autenticação, regras multi-tenant, webhooks e orquestração de recursos.
│   ├── voice/            # Motor de baixa latência em tempo real para streaming de áudio, transcrição, diálogo e síntese de voz.
│   └── worker/           # Processamento em background para tarefas assíncronas, transcrições em lote, analytics e campanhas.
│
├── packages/
│   ├── ui/               # Biblioteca compartilhada de componentes visuais responsivos baseados em design tokens unificados.
│   ├── database/         # Placeholder arquitetural para schemas, migrations e repositories multi-tenant (zero ORM/conexão na Fase 0).
│   ├── contracts/        # Contratos canônicos neutros, tipos compartilhados, DTOs, eventos e portas de domínio (TelephonyPort, etc.).
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
- **`apps/api`**: Ponto de entrada HTTP seguro que valida regras de negócio e expõe endpoints determinísticos.
- **`apps/voice`**: Orquestrador bidirecional de streaming de voz projetado para mínima latência e interrupção humana natural.
- **`apps/worker`**: Consumidor de filas para processamento pesado assíncrono e tarefas em lote desacopladas do fluxo síncrono.
- **`packages/ui`**: Sistema de design reutilizável e agnóstico de tela com foco mobile-first.
- **`packages/database`**: Camada única e tipada de acesso e migração de dados relacionais protegida por multi-tenancy.
- **`packages/contracts`**: Contratos canônicos de interfaces, payloads, eventos e portas consumidos por múltiplos módulos.
- **`packages/config`**: Carregamento seguro e validação estrita de configurações de ambiente em tempo de inicialização.
- **`packages/logger`**: Coletor de telemetria e logs em formato JSON estruturado com injeção de correlation IDs.
- **`packages/errors`**: Catálogo centralizado de classes e códigos de erro previsíveis para toda a aplicação.
- **`packages/integrations`**: Adaptadores concretos para serviços externos implementando as portas abstratas do domínio.
- **`packages/test-utils`**: Infraestrutura para testes reprodutíveis, rápidos e sem dependência de APIs externas pagas.
