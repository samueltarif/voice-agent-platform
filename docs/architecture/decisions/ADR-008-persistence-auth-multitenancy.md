# ADR-008: Fundação de Persistência, Autenticação e Multi-Tenancy (Fase 4)

## Status
Accepted

## Data
2026-09-22

## Motivo da Aceitação
Aprovação humana explícita recebida em 22 de Setembro de 2026, após pesquisa comparativa documentada em `docs/research/PHASE_4_DECISION_GATE.md` (PROMPTs 004A, 004A-FIX, 004A-CHECK, 004A-FINAL-FIX).

## Contexto
A Fase 3 do projeto entregou o frontend visual com dados mockados. A Fase 4 exige a transição para persistência real, modelo de identidade e governança de multi-tenancy, respeitando os princípios fundamentais do projeto:
1. Multi-tenancy nativo com isolamento lógico por `organizationId` (ADR-003);
2. Platform Admin como autorização global desacoplada de tenant roles;
3. Desacoplamento entre pagamento e direito de acesso (Entitlements determinísticos);
4. Separação estrutural entre Usage, Cost e Billing;
5. Acesso ao banco exclusivo via Repositories tipados (DEC-005);
6. Domínio (`packages/contracts`) neutro e agnóstico a ferramentas de banco/SDKs (ADR-004).

## Decisão

### Motor Relacional
- **PostgreSQL** como engine relacional principal. A versão major exata será alinhada ao provedor cloud no momento do provisionamento para garantir paridade `local == staging == production`.

### Managed Database Provider
- **Neon Serverless Postgres** como provedor principal: separação compute/storage, PgBouncer integrado, database branching copy-on-write para CI/CD, `aws-sa-east-1` disponível.
- **Supabase Postgres** como alternativa documentada: PostgreSQL dedicado com Supavisor, ecossistema maduro, `sa-east-1` disponível.
- LGPD compliance de ambos os provedores requer verificação legal antes de produção (não inferido da região).

### ORM / Camada de Persistência
- **Drizzle ORM + drizzle-kit**: schemas em TypeScript puro (`pgTable`), migrations em SQL legível e auditável, zero geração de código, isolamento em `packages/database`.

### Autenticação e Sessões
- **Better Auth** utilizado **exclusivamente para Identity e Session** (modelos conceituais: `User`, `Session`, `Account/AuthLink`, `Verification`).
- O plugin `organization` do Better Auth **NÃO será ativado** (DISABLED).
- Schema físico das tabelas de auth será verificado a partir da versão instalada na Fase 4B, não congelado antecipadamente.

### Autorização e Multi-Tenancy
- As entidades `Organization`, `OrganizationMembership`, `TenantRole`, `PlatformAdminAuthorization`, `Plan`, `Entitlements`, `CommercialGrant` e `Subscription` pertencem **100% ao domínio da aplicação**, implementadas via Drizzle ORM e Repositories tipados em `packages/database`.
- **Autenticação** (Better Auth): responde estritamente *"quem é o usuário"*.
- **Autorização de Domínio** (Aplicação): responde estritamente *"o que o usuário pode fazer"*.
- Platform Admin é autorização puramente global, sem escopo de tenant, impossível de ser obtida por auto-elevação.

### Arquitetura Web
- `apps/web` atua como UI/BFF (acesso a auth via route handlers; dados de negócio exclusivamente via `apps/api`).
- `apps/api` atua como boundary primário de negócio e persistência (Repositories).
- Acesso direto de `apps/web` a tabelas de domínio é expressamente proibido.

### Desenvolvimento Local
- Docker Compose PostgreSQL aprovado quando disponível no ambiente do desenvolvedor.

### Row Level Security (RLS)
- Candidato a defesa em profundidade incremental, não mecanismo primário de autorização na primeira implementação.

## Decisões Ainda Pendentes (Não Parte Deste ADR)
- **`INTERNAL SERVICE AUTH MECHANISM`**: Mecanismo concreto de autenticação interna entre `apps/web`, `apps/api`, `apps/worker` e `apps/voice` (PENDING).
- **`EPHEMERAL STATE / ASYNC EVENT INFRASTRUCTURE`**: Cache de sessões, filas de eventos e estado efêmero (PENDING).
- **`INTERNAL ID STRATEGY`**: UUIDv7, CUID2 ou Nanoid para identificadores internos (PENDING).
- **`USAGE PERSISTENCE SCHEMA`**: Particionamento e persistência de uso detalhado (DEFERRED).

## Elementos Não Congelados por Este ADR
- Versão major exata do PostgreSQL;
- Versão do Drizzle ORM;
- Versão do Better Auth;
- Nomes físicos das tabelas de auth (`users`, `sessions`, `accounts`, `verifications`);
- Layout de credential fields (`CREDENTIAL FIELD LAYOUT: TO BE VERIFIED IN 004B`);
- Pricing de provedores cloud.

## Alternativas Consideradas

### ORM
- **Prisma ORM (v7)**: DSL proprietária (`schema.prisma`), geração de código mandatória (`prisma generate`), maior overhead de runtime. Descartado por menor manutenibilidade em monorepo e por agentes de IA.
- **Kysely**: Query builder puro sem abstração de schema. Descartado por exigir mais boilerplate para migrations e schema management.

### Autenticação
- **Supabase Auth (GoTrue)**: Identidades no schema `auth.users` do Supabase, criando acoplamento ao provedor. Descartado por vendor lock-in de auth schema.
- **Clerk**: SaaS gerenciado com dados na nuvem da Clerk. Descartado por custo recorrente por MRU e perda de propriedade dos dados.
- **Auth.js (NextAuth v5)**: Complexo para uso fora do Next.js (`apps/api` como backend separado). Descartado por limitação de suporte B2B multi-tenancy.

### Managed DB
- **Railway PostgreSQL**: Descartado por ausência de datacenter na América do Sul e ausência de branching nativo.

## Consequências

### Positivas
- Propriedade total dos dados de identidade e autorização no banco da aplicação;
- Zero dual source of truth entre auth e domínio;
- Substituibilidade futura do provedor de auth sem impacto em regras de negócio;
- Migrations auditáveis em SQL puro, versionadas no Git;
- Branching de banco para testes de PR em CI/CD (via Neon);
- Data locality em `sa-east-1` para o banco principal.

### Trade-offs e Riscos
- Better Auth é relativamente novo; a comunidade e o ecossistema são menores que os de Clerk ou Auth.js;
- Neon possui cold start em compute suspenso (produção deve manter compute sempre ativo);
- Drizzle ORM é mais jovem que Prisma; evolução da API é possível entre versões;
- Responsabilidade operacional de email/SMS transacional recai sobre a aplicação (não incluso no framework de auth);
- Lock-in operacional médio do Neon (APIs de branching e autoscaling são provider-specific).

### Invariantes de Segurança Obrigatórias na Fase 4B
1. Isolamento cross-tenant por `organizationId` em todas as operações com escopo de tenant;
2. Membership ativa obrigatória para acesso operacional;
3. Platform Admin nunca derivado de tenant roles;
4. `organizationId` obrigatório em todos os métodos de Repository com escopo de tenant;
5. Unique constraints compostas com `organization_id` em entidades de tenant;
6. Workers e eventos validam e propagam `organizationId` e `correlationId`;
7. Entitlements computados deterministicamente no servidor, nunca por boolean do client-side.
