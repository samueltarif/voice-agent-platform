# Plataforma SaaS B2B de Agentes de Voz com IA

Bem-vindo ao repositório central da plataforma SaaS B2B de agentes de voz com inteligência artificial. Este projeto foi concebido para ser desenvolvido, mantido e evoluído intensivamente por agentes de IA e engenheiros humanos em regime de alta confiabilidade.

---

## 📌 Status Atual do Repositório

> **Aviso de Fase Atual**: O projeto concluiu a **Fase 3 (PROMPT-003): Design System e Application Shell Mobile-First**.
> A primeira implementação real de frontend está operacional em `apps/web` (Next.js 15 App Router, React 19, Tailwind CSS v4) e `packages/ui` (Design System compartilhado com tokens semânticos via CSS variables como SSOT, tema Light corporativo por padrão, Dark mode secundário, densidade dinâmica e Command Palette acessível via `Ctrl+K`).
> Todo o shell responsivo foi validado em 7 viewports (`320px` a `1920px`) com dados mockados tipados determinísticos (valores monetários estritamente em integer cents), sem introdução de backend real, ORM, Supabase ou telefonia real nesta fase.

---

## 💻 Desenvolvimento Local e Qualidade

### Pré-requisitos
- **Node.js**: `v24.20.0` (ou compatível conforme `.node-version` e `package.json engines: >=22.12.0`)
- **pnpm**: `v12.5.1` (conforme `packageManager`)

### Instalação
```bash
pnpm install
```

### Scripts de Qualidade (Centralizados)
```bash
# Executa a cadeia completa de qualidade local (CI reproduzível)
pnpm check

# Comandos individuais
pnpm format:check       # Validação de estilo com Prettier
pnpm format             # Formatação automática com Prettier
pnpm lint               # Análise estática com ESLint (complexidade <= 8, nesting <= 3)
pnpm typecheck          # Verificação rigorosa de tipos TypeScript em todos os workspaces
pnpm test               # Execução de testes automatizados com Vitest
pnpm build              # Compilação incremental orquestrada via Turborepo
pnpm check:architecture # Guardrail de limites arquiteturais com AST do TypeScript
pnpm check:file-size    # Guardrail de tamanho de arquivos (máx 180 linhas em produção)
```

---

## 🎯 Visão do Produto

A plataforma capacita empresas B2B a criarem e gerenciarem agentes autônomos de voz capazes de:
- Realizar chamadas telefônicas ativas (outbound) e, futuramente, receber chamadas (inbound);
- Conversar com extrema naturalidade humana, latência ultrabaixa e resposta a interrupções (*barge-in*);
- Manter memória do diálogo e executar ferramentas determinísticas (*tool calling*) com acesso controlado a dados de produtos, clientes, serviços, CRM e calendários;
- Atender múltiplos clientes empresariais de forma estritamente isolada (*multi-tenant*);
- Oferecer um dashboard avançado e *mobile-first* para administração de organizações, agentes, campanhas, transcrições, analytics, custos e integrações.

---

## 🧭 Mapa de Navegação da Documentação

A documentação está estruturada para fornecer contexto imediato e sem ambiguidade:

### Governança e Regras Essenciais
- [AGENTS.md](file:///D:/voice-agent-platform/AGENTS.md) — **Leitura obrigatória antes de codificar**: regras de investigação, limites de código, processo de bugfix/feature e Definition of Done.
- [PROJECT_CONSTITUTION.md](file:///D:/voice-agent-platform/PROJECT_CONSTITUTION.md) — Princípios inegociáveis do sistema (multi-tenancy, baixo acoplamento, LLM não é fonte da verdade, proteção de produção).
- [ARCHITECTURE.md](file:///D:/voice-agent-platform/ARCHITECTURE.md) — Arquitetura de referência, separação de processos (`web`, `api`, `voice`, `worker`), limites de módulos e fluxos de dados.
- [PROJECT_MAP.md](file:///D:/voice-agent-platform/PROJECT_MAP.md) — Mapa topológico da estrutura do monorepo e responsabilidades de cada pacote.

### Documentos Detalhados de Domínio (`docs/`)
- [AI_WORKLOG.md](file:///D:/voice-agent-platform/docs/AI_WORKLOG.md) — Registro central obrigatório de todas as ações executadas por IA.
- [DECISIONS_LOG.md](file:///D:/voice-agent-platform/docs/DECISIONS_LOG.md) — Registro cronológico das decisões já confirmadas e pendentes.
- [PROJECT_VISION.md](file:///D:/voice-agent-platform/docs/PROJECT_VISION.md) — Visão do produto, personas, propostas de valor e modelos de negócio.
- [DATABASE.md](file:///D:/voice-agent-platform/docs/DATABASE.md) — Padrões de persistência, isolamento multi-tenant, ciclo de migrations e regras de consulta.
- [EVENTS.md](file:///D:/voice-agent-platform/docs/EVENTS.md) — Catálogo de eventos de domínio, envelope padrão e ciclo de vida de chamadas.
- [INTEGRATIONS.md](file:///D:/voice-agent-platform/docs/INTEGRATIONS.md) — Padrão Provider/Adapter para telefonia, IA, storage, CRM e agenda.
- [SECURITY.md](file:///D:/voice-agent-platform/docs/SECURITY.md) — Governança de credenciais, isolamento de tenants e restrição de permissões de IA.
- [OBSERVABILITY.md](file:///D:/voice-agent-platform/docs/OBSERVABILITY.md) — Logging estruturado, identificadores de rastreamento (`correlationId`, `callId`) e telemetria.
- [VOICE_ARCHITECTURE.md](file:///D:/voice-agent-platform/docs/VOICE_ARCHITECTURE.md) — Pipeline de áudio em tempo real, mitigação de latência, barge-in e tool calling determinístico.
- [DESIGN_SYSTEM.md](file:///D:/voice-agent-platform/docs/DESIGN_SYSTEM.md) — Tokens de design universais e diretrizes visuais.
- [MOBILE_GUIDELINES.md](file:///D:/voice-agent-platform/docs/MOBILE_GUIDELINES.md) — Diretrizes estritas para desenvolvimento responsivo mobile-first.
- [TESTING_STRATEGY.md](file:///D:/voice-agent-platform/docs/TESTING_STRATEGY.md) — Pirâmide de testes, reprodução de bugs e testes sem custos externos.
- [DEPLOYMENT.md](file:///D:/voice-agent-platform/docs/DEPLOYMENT.md) — Segregação de ambientes, esteira de integração contínua e proteção de produção.
- [COST_MODEL.md](file:///D:/voice-agent-platform/docs/COST_MODEL.md) — Rastreamento de custos por chamada, margens e governança financeira.
- [ROADMAP.md](file:///D:/voice-agent-platform/docs/ROADMAP.md) — Etapas de desenvolvimento planejadas da fundação ao lançamento.

### Architecture Decision Records (`docs/architecture/decisions/`)
- [ADR-001: Adoção de Monorepo Modular](file:///D:/voice-agent-platform/docs/architecture/decisions/ADR-001-monorepo.md)
- [ADR-002: Arquitetura Modular e Vertical Slices](file:///D:/voice-agent-platform/docs/architecture/decisions/ADR-002-modular-architecture.md)
- [ADR-003: Multi-Tenancy Nativo com Isolamento Lógico](file:///D:/voice-agent-platform/docs/architecture/decisions/ADR-003-multi-tenant.md)
- [ADR-004: Padrão Provider/Adapter para Serviços Externos](file:///D:/voice-agent-platform/docs/architecture/decisions/ADR-004-provider-adapter-pattern.md)
- [ADR-005: Fronteiras Orientadas a Eventos Internos Versionáveis](file:///D:/voice-agent-platform/docs/architecture/decisions/ADR-005-event-driven-boundaries.md)
- [ADR-006: Abordagem de Interface Mobile-First Unificada](file:///D:/voice-agent-platform/docs/architecture/decisions/ADR-006-mobile-first.md)
- [ADR-007: Stack Frontend Oficial (Next.js 15, React 19, Tailwind v4 e Radix UI)](file:///D:/voice-agent-platform/docs/architecture/decisions/ADR-007-frontend-stack.md)

---

## ⚡ Próximos Passos
Conclusão da revisão técnica e merge da branch `feature/design-system-shell` (Pull Request #3).
Após autorização humana, avanço para a **FASE 4 — Persistência, Autenticação e Multi-Tenancy** conforme planejado em `docs/ROADMAP.md` (decisão do banco de dados relacional e ORM, modelagem multi-tenant com `organizationId` mandatória, autenticação segregada e Subfase 4.1 para o modelo comercial e governança da plataforma).

