# Pesquisa Arquitetural e Portão de Decisão — Fase 4: Persistência, Autenticação e Multi-Tenancy (PHASE_4_DECISION_GATE.md)

> **Status do Documento**: PROPOSED / HUMAN APPROVAL REQUIRED  
> **Data da Consulta / Pesquisa**: 22 de Setembro de 2026  
> **Origem da Demanda**: PROMPT-004A & PROMPT-004A-FIX — Refinamento de Fronteiras de Auth, Multi-Tenancy e Escopo  
> **Escopo**: Pesquisa comparativa, avaliação técnica precisa, matriz de decisão e proposta de stack.  
> **Salvaguardas Críticas**: Zero dependências instaladas, zero provisionamento de infraestrutura/cloud, zero secrets criados ou manipulados, zero DDLs ou migrations executadas em código de produção.

---

## 1. Contexto e Requisitos Fundamentais da Plataforma

A **Voice Agent Platform** é um SaaS B2B corporativo de agentes de voz autônomos com inteligência artificial para atendimento, vendas e suporte com transbordo humano determinístico (*human handoff*).

Conforme estabelecido na [Constituição do Projeto](file:///d:/voice-agent-platform/PROJECT_CONSTITUTION.md) e na [Arquitetura do Sistema](file:///d:/voice-agent-platform/ARCHITECTURE.md), a Fase 4 do [Roadmap](file:///d:/voice-agent-platform/docs/ROADMAP.md) estabelece a transição dos mocks visuais (Fase 3) para uma arquitetura real de persistência, modelo de identidade e governança de multi-tenancy.

### 1.1. Restrições e Princípios Inegociáveis
1. **Multi-Tenancy Nativo com Isolamento Lógico**: Entidades pertencentes a clientes possuem escopo delimitado por `organizationId` ([ADR-003](file:///d:/voice-agent-platform/docs/architecture/decisions/ADR-003-multi-tenant.md)). Vazamento cross-tenant é falha crítica.
2. **Platform Admin como Autorização Global**: O Platform Admin (Master Admin do SaaS) é uma autorização estritamente global, externa e desacoplada da hierarquia de tenants ([docs/PLATFORM_CONTROL_PLANE.md](file:///d:/voice-agent-platform/docs/PLATFORM_CONTROL_PLANE.md) e [docs/SECURITY.md](file:///d:/voice-agent-platform/docs/SECURITY.md)). Usuários de tenant não podem se auto-elevar a administradores globais.
3. **Desacoplamento entre Pagamento e Direito de Acesso**: O acesso a recursos nunca depende de `pagou = liberado`. Direitos são resolvidos deterministicamente pela função:
   $$\text{Direito de Acesso} = f(\text{Plano}, \text{Entitlements}, \text{Estado Comercial})$$
4. **Separação Estrutural entre Usage, Cost e Billing**: `Usage` (consumo bruto de segundos/tokens/chamadas) é agnóstico ao gateway de pagamento; `Cost` apura despesas de fornecedores; `Billing` governa a cobrança ([docs/COST_MODEL.md](file:///d:/voice-agent-platform/docs/COST_MODEL.md)).
5. **Acesso ao Banco Exclusivo via Repositories**: Código de aplicação nunca executa queries SQL inline no meio de regras de negócio ([docs/DATABASE.md](file:///d:/voice-agent-platform/docs/DATABASE.md)). Repositories residem em `packages/database` e exigem `organizationId` obrigatório em operações com escopo de tenant.
6. **Desacoplamento de Domínio e ORM**: O domínio (`packages/contracts`) permanece 100% neutro e agnóstico a ferramentas de banco de dados ou SDKs de terceiros ([ADR-004](file:///d:/voice-agent-platform/docs/architecture/decisions/ADR-004-provider-adapter-pattern.md)).

---

## 2. Metodologia de Pesquisa e Fontes Consultadas

Todas as tecnologias foram investigadas através de documentação oficial recente via **Context7 MCP** (com identificadores de biblioteca verificados) e documentação pública complementar oficial consultada em **22 de Setembro de 2026**.

| Tecnologia / Tópico | Ferramenta / Fonte | Identificador / Referência Oficial | Data da Consulta | Status |
| :--- | :--- | :--- | :--- | :--- |
| **PostgreSQL Drivers** | Context7 MCP | Node-Postgres (`pg`), `postgres.js` | 2026-09-22 | VERIFIED |
| **Drizzle ORM** | Context7 MCP | `/drizzle-team/drizzle-orm-docs` | 2026-09-22 | VERIFIED |
| **Prisma ORM (v7)** | Context7 MCP | `/websites/prisma_io` | 2026-09-22 | VERIFIED |
| **Kysely Query Builder** | Context7 MCP | `/kysely-org/kysely` | 2026-09-22 | VERIFIED |
| **Neon Serverless Postgres**| Context7 & Docs Oficiais | `/neondatabase/website` & `neon.tech/docs` | 2026-09-22 | VERIFIED |
| **Supabase Postgres & Auth** | Context7 & Docs Oficiais | `/supabase/supabase` & `supabase.com/docs` | 2026-09-22 | VERIFIED |
| **Railway PostgreSQL** | Docs Oficiais | `docs.railway.com` (PgBouncer, Patroni HA) | 2026-09-22 | VERIFIED |
| **Better Auth** | Context7 MCP | `/better-auth/better-auth` | 2026-09-22 | VERIFIED |
| **Clerk** | Context7 MCP | `/clerk/clerk-docs` & `clerk.com/docs` | 2026-09-22 | VERIFIED |
| **Auth.js (NextAuth v5)** | Context7 MCP | `/websites/authjs_dev` | 2026-09-22 | VERIFIED |

---

## 3. Categoria 1 — Motor de Banco Relacional (Engine)

### 3.1. Avaliação do PostgreSQL
A proposta de adoção do **PostgreSQL** fundamenta-se nos requisitos técnicos e no modelo de domínio da plataforma:

1. **Requisitos Relacionais e Integridade por Constraints**:
   - `PROJECT REQUIREMENT`: O domínio exige integridade referencial estrita entre organizações, memberships, planos, concessões comerciais, assinaturas e entidades de negócio, com suporte a chaves estrangeiras com ações explícitas (`ON DELETE RESTRICT`, `ON DELETE CASCADE` estritamente justificado) e restrições compostas de unicidade por tenant.
2. **Transações ACID e Controle de Concorrência**:
   - `DOCUMENTED CAPABILITY`: Suporte completo a múltiplos níveis de isolamento transacional e locking determinístico (`SELECT FOR UPDATE`), essencial para operações de transbordo humano (*human handoff*), deduções de saldos/cotas e concessões comerciais.
3. **Multi-Tenancy por `organizationId` e Indexação B-Tree**:
   - `DOCUMENTED CAPABILITY`: Índices B-Tree compostos de alta performance (ex.: `(organization_id, created_at DESC)`) e suporte nativo a índices parciais.
4. **Precisão Numérica para Faturamento e Custos**:
   - `DOCUMENTED CAPABILITY`: Suporte aos tipos `NUMERIC`/`DECIMAL` e `BIGINT` para modelagem financeira segura em *integer cents*, prevenindo imprecisões de ponto flutuante.
5. **Dados Semiestruturados e Flexibilidade**:
   - `DOCUMENTED CAPABILITY`: Suporte a colunas `JSONB` indexáveis via GIN para armazenar payloads de eventos e metadados de execução de ferramentas (*tool calling*).
6. **Evolução Futura para Inteligência e Vetores**:
   - `DOCUMENTED CAPABILITY`: Compatibilidade com a extensão `pgvector` para futura busca semântica em Knowledge Bases de agentes de voz, sem necessidade de banco vetorial externo prematuro.

### 3.2. Conclusão sobre Motores Não-Relacionais (NoSQL)
- O PostgreSQL é proposto porque os requisitos essenciais do projeto são predominantemente relacionais, transacionais e fortemente orientados a constraints de integridade e auditoria.
- A decisão de não adotar NoSQL no core da plataforma baseia-se na perfeita adequação do modelo relacional ao domínio de SaaS B2B corporativo, sem necessidade de desqualificar genericamente engines NoSQL para outros casos de uso.
- **Status**: `PROPOSED ENGINE: PostgreSQL`. *(A versão major exata será fixada no momento da seleção do provedor cloud para garantir que `local == staging == production`).*

---

## 4. Categoria 2 — Managed Database Provider

Comparação técnica entre três fornecedores consolidados de PostgreSQL gerenciado:

### 4.1. Neon Serverless Postgres
- **Arquitetura**: Separação completa entre computação (stateless compute) e armazenamento distribuído (Neon storage).
- **Connection Pooling**: PgBouncer nativo integrado via endpoints dedicados (`-pooler`). Suporta modo transação para conexões concorrentes e disponibiliza endpoint direto (unpooled) para ferramentas que dependam de semântica de sessão.
- **Database Branching (Copy-on-Write)**: Criação instantânea de branches do banco de dados (schema + dados) em segundos via API (`createBranch`), permitindo ambientes isolados de CI/CD para testar migrations em Pull Requests.
- **Autoscaling e Scale-to-Zero**: Nós de computação podem escalar e entrar em suspensão após período de inatividade em desenvolvimento.
- **Região e Soberania de Dados**: Suporta a região **AWS South America (São Paulo) — `aws-sa-east-1`** (Fonte: `neon.tech/docs/introduction/regions`, consultado em 22/09/2026), garantindo baixa latência e compatibilidade com requisitos de soberania de dados para clientes no Brasil.
- **Preços Oficiais Verificados (22/09/2026 — `neon.tech/pricing`)**:
  - *Free*: US$ 0/mês (0.5 GB storage, 100 CU-horas/mês).
  - *Launch / Scale*: Baseado em consumo real sem taxa mensal fixa; computação a US$ 0.106/CU-hora (Launch) e US$ 0.222/CU-hora (Scale); storage a US$ 0.35/GB-mês.
- **Pontos de Atenção**: Potencial latência de cold start em ambientes onde compute nodes entrem em suspensão (em produção, o compute deve ser configurado como sempre ativo).

### 4.2. Supabase Postgres
- **Arquitetura**: PostgreSQL dedicado em contêiner gerenciado acompanhado do pooler **Supavisor**.
- **Connection Pooling**: Supavisor nativo operando na porta 6543 (modo transação para serverless/APIs) e na porta 5432 (modo sessão para migrations e ferramentas de DDL).
- **Extensões**: Suporte nativo completo a `pgvector`, `pgcrypto`, `uuid-ossp`, com interface gráfica administrativa madura.
- **Região e Soberania de Dados**: Suporta a região **`sa-east-1` (São Paulo, Brasil)** para banco de dados, autenticação e storage (Fonte: `supabase.com/docs/guides/platform/regions`, consultado em 22/09/2026).
- **Preços Oficiais Verificados (22/09/2026 — `supabase.com/pricing`)**:
  - *Free*: US$ 0/mês (500 MB database; projetos pausam após 1 semana de inatividade).
  - *Pro*: A partir de US$ 25/mês (8 GB database incluído, US$ 10 de crédito de computação mensal cobrindo instância Micro, backups diários de 7 dias).
  - *Team*: A partir de US$ 599/mês (SOC 2, SSO corporativo).
- **Pontos de Atenção**: O plano Free pausa projetos inativos após 7 dias. O uso deve permanecer restrito ao PostgreSQL padrão para evitar acoplamento a SDKs proprietários.

### 4.3. Railway PostgreSQL
- **Arquitetura**: PostgreSQL em contêiner com suporte a clusters Patroni HA e PgBouncer comutável via CLI ou dashboard.
- **Regiões Suportadas**: US West, US East, Europe West e Asia Southeast (Fonte: `docs.railway.com`, consultado em 22/09/2026). **NÃO possui região no Brasil/América do Sul**, o que acarreta latência transcontinental para aplicações rodando próximas aos usuários brasileiros.
- **Preços Oficiais Verificados (22/09/2026 — `railway.com/pricing`)**:
  - *Hobby*: US$ 5/mês; *Pro*: US$ 20/mês (com créditos correspondentes). Cobrança por recurso consumido por minuto: RAM a US$ 10/GB-mês; CPU a US$ 20/vCPU-mês; Storage a US$ 0.15/GB-mês.
- **Pontos de Atenção**: Ausência de datacenter na América do Sul e ausência de branching nativo copy-on-write para testes de PR.

---

## 5. Categoria 3 — ORM / Camada de Persistência (Query Layer)

| Critério de Avaliação | Drizzle ORM | Prisma ORM (v7) | Kysely |
| :--- | :--- | :--- | :--- |
| **Paradigma** | TypeScript-first ORM / SQL-like | ORM tradicional com DSL e Client | Type-Safe SQL Query Builder puro |
| **Definição de Schema** | 100% TypeScript puro (`pgTable`) | DSL proprietária (`schema.prisma`) | TypeScript interfaces puras |
| **Geração de Código** | Nenhuma (zero build step) | Mandatório (`prisma generate`) | Nenhuma (tipagem estática pura) |
| **Runtime Overhead** | Mínimo (~overhead de query SQL) | Camada de abstração do Prisma Client | Zero overhead |
| **Migrations** | `drizzle-kit generate` / SQL limpo | `prisma migrate` | `Kysely Migrator` (TypeScript/SQL) |
| **SQL Escape Hatch** | Tag `sql` totalmente tipada | Tag `$queryRaw` | Tag `sql` totalmente integrada |
| **Multi-Tenancy & Índices**| Índices compostos e parciais nativos | Atributos `@@index`, `@@unique` | Suporte total a DDL do PostgreSQL |
| **Compatibilidade Monorepo**| Excelente (isolação em `packages/database`)| Exige sincronização de artefatos gerados| Excelente |
| **Manutenibilidade por IA** | Altíssima (código TypeScript explícito)| Boa em CRUD; exige atenção em tipos gerados| Altíssima |

### Justificativa Técnica da Escolha do Drizzle ORM
1. **Definição de Schemas em TypeScript Puro**: As tabelas são declaradas diretamente em código TypeScript estrito (`pgTable`), sem necessidade de aprender uma DSL externa ou manter arquivos de schema desacoplados da tipagem do projeto.
2. **Migrações Transparentes em SQL Puro**: O `drizzle-kit generate` produz arquivos `.sql` legíveis e auditáveis que são versionados no Git e revisados linha por linha em Pull Requests por humanos e agentes de IA.
3. **Isolamento Arquitetural**: O domínio (`packages/contracts`) permanece completamente neutro. Apenas `packages/database` importa o Drizzle e expõe Repositories tipados para a aplicação.

---

## 6. Categoria 4 — Autenticação e Gestão de Sessões

### 6.1. Comparação Geral

| Recurso / Requisito | Better Auth | Supabase Auth (GoTrue) | Clerk | Auth.js (NextAuth v5) |
| :--- | :--- | :--- | :--- | :--- |
| **Tipo de Solução** | Framework TS Open-Source Self-Hosted | BaaS Open-Source Gerenciado/Self | SaaS Especializado Gerenciado | Framework TS Open-Source |
| **Propriedade dos Dados**| 100% no banco da aplicação | No schema `auth` do Supabase | Na nuvem da Clerk | No banco da aplicação |
| **Custo de Licenciamento** | **US$ 0** (Licença MIT) | Incluído no plano do Supabase | Free até 50k MRU; Pro a US$ 25/mês | **US$ 0** (Licença ISC) |
| **Custo Operacional** | Compute, DB, e-mail/SMS próprios | Compute/DB do Supabase | Overage por MRU adicional | Compute, DB, e-mail próprios |
| **Gestão de Sessões** | Cookie HTTP-only seguro + Bearer Token| Cookie / LocalStorage + JWT | Cookie gerenciado + JWT | Cookie HTTP-only assinado |
| **API Backend (`apps/api`)**| **Suporte Nativo** (plugin `bearer` e verificação)| Verificação de JWT via chave pública | Suporte com `@clerk/backend` | Complexo fora do Next.js |
| **B2B Multi-Tenancy Nativo**| Plugin `organization` opcional | Parcial (via claims ou tabelas próprias)| Nativo via Organizations B2B | Inexistente (requer customização) |

---

## 7. Better Auth vs. Domínio — Análise de Fonte da Verdade e Decisão de Fronteiras

Conforme exigido na auditoria arquitetural, investigou-se a fundo o funcionamento do Better Auth para resolver qualquer risco de *dual source of truth* entre o framework de autenticação e as entidades de negócio.

### 7.1. Respostas Técnicas às Questões Fundamentais
- **A. Tabelas criadas/esperadas pelo plugin `organization` do Better Auth**:
  - `organization` (`id`, `name`, `slug`, `logo`, `createdAt`, `metadata`);
  - `member` (`id`, `organizationId`, `userId`, `role`, `createdAt`);
  - `invitation` (`id`, `organizationId`, `email`, `role`, `status`, `expiresAt`, `inviterId`).
- **B. Customização de nomes e mapeamento**:
  - O Better Auth suporta customizar o nome das tabelas via `schema.<model>.modelName` (ex.: mapear `organization` para `"organizations"`, `member` para `"organization_memberships"`) e adicionar campos extras via `additionalFields`.
- **C. Funcionamento sem se tornar a fonte canônica das organizações**:
  - **SIM**. O Better Auth pode operar perfeitamente **SEM** o plugin `organization`. Nesse modo, o Better Auth gerencia exclusivamente **Identidade e Sessão** (`user`, `session`, `account`, `verification`).
- **D. Dependência de convites e roles nas tabelas do plugin**:
  - As APIs embutidas de convite e RBAC do Better Auth dependem estritamente das tabelas `member` e `invitation`. Se o plugin não for utilizado, a gestão de membros, papéis e convites fica 100% a cargo do domínio da aplicação.
- **E. Dados que seriam duplicados se mantivéssemos nossas tabelas e o plugin**:
  - Nome da organização, slug, papéis de usuário, status de membership e convites existiriam duplamente: uma vez no ecossistema do plugin e outra nas tabelas de domínio.
- **F. Como evitar dual source of truth**:
  - Adotando uma fronteira conceitual estrita: **Autenticação responde "quem é você"**, enquanto **Autorização de Domínio responde "o que você pode fazer"**.

### 7.2. Comparação das Opções Estratégicas
- **OPTION A (Recomendada)**:
  - **Better Auth utilizado EXCLUSIVAMENTE para Identidade e Sessão** (`user`, `session`, `account`, `verification`).
  - O plugin `organization` do Better Auth **NÃO É ATIVADO**.
  - As entidades `Organization`, `OrganizationMembership`, `TenantRole`, `PlatformAdminAuthorization`, `Plan`, `Entitlements`, `CommercialGrant` e `Subscription` pertencem **100% ao domínio da aplicação**, implementadas via Drizzle ORM e Repositories tipados em `packages/database`.
  - *Vantagens*: Zero risco de duas fontes de verdade; zero duplicação de dados; total liberdade para modelar regras comerciais complexas (entitlements, concessões manuais, planos corporativos); se o provedor de auth for substituído no futuro, nenhuma regra de negócio ou autorização é afetada.
- **OPTION B**:
  - Utilizar o plugin `organization` do Better Auth como backing técnico, customizando campos com `additionalFields`.
  - *Descarte*: Gera acoplamento desnecessário entre regras comerciais do nosso SaaS e convenções do plugin do Better Auth; dificulta a segregação estrutural de Platform Admin e a gestão de CommercialGrants.

---

## 8. Modelo de Identidade e Separação de Tabelas

A arquitetura estabelece uma divisão nítida entre tabelas de autenticação (gerenciadas pelo framework) e tabelas de domínio (gerenciadas pela aplicação):

```
┌────────────────────────────────────────────────────────┐
│            AUTH TABLES (Owned by Better Auth)          │
├──────────────────────────┬─────────────────────────────┤
│ user                     │ id, email, name, image, ... │
│ session                  │ id, token, userId, expiresAt│
│ account (AuthIdentity)   │ id, providerId, accountId,  │
│                          │ password (hash), userId     │
│ verification             │ id, identifier, value, ...  │
└──────────────────────────┴─────────────────────────────┘
                             │
                             │ userId (FK de Domínio)
                             ▼
┌────────────────────────────────────────────────────────┐
│           DOMAIN TABLES (Owned by Application)         │
├──────────────────────────┬─────────────────────────────┤
│ organizations            │ id, slug, name, status, ... │
│ organization_memberships │ id, userId, organizationId, │
│                          │ role (TENANT_ROLE), status  │
│ platform_admin_auths     │ id, userId, globalRole, ... │
│ plans & entitlements     │ limites e cotas do produto  │
│ subscriptions & grants   │ estado comercial e vigência │
└──────────────────────────┴─────────────────────────────┘
```

### 8.1. Esclarecimento sobre `AuthIdentity` e Credenciais
- Passwords e seus respectivos hashes são **material confidencial de credencial da camada de autenticação**, residindo exclusivamente na coluna `account.password` do Better Auth.
- O conceito de `AuthIdentity` é plenamente atendido pela tabela `account` do Better Auth, que vincula:
  - `providerId`: Provedor de identidade (ex.: `"credential"`, `"google"`, `"magic_link"`);
  - `accountId`: Identificador do sujeito no provedor externo (ex.: `sub` do OIDC ou ID da conta social);
  - `userId`: Chave estrangeira referenciando o `user.id` interno canônico.

### 8.2. Usuário Canônico (`User`)
- A tabela `users` do Better Auth atua como o registro de usuário base da plataforma (`id`, `name`, `email`, `emailVerified`, `image`).
- O `id` do usuário gerado pelo Better Auth é utilizado como referência para chaves estrangeiras (`user_id`) em tabelas de domínio (`organization_memberships`, `platform_admin_authorizations`, `audit_logs`).
- `providerUserId` continua **expressamente proibido** como chave universal de domínio.
- **Estratégia de Identificadores Internos**: `INTERNAL ID STRATEGY: PENDING DECISION`. (Candidatas: UUIDv7, CUID2, Nanoid; a ser homologada no início do PROMPT-004B avaliando geração na aplicação vs banco e indexação).

---

## 9. Papéis de Tenant (`OrganizationRole`) e Platform Admin

### 9.1. Papéis de Tenant
Como adotamos a **Option A**, os papéis organizacionais residem inteiramente na tabela de domínio `organization_memberships` através de um tipo enum estrito do PostgreSQL:
- **`OWNER`**: Proprietário da conta do tenant; controle total de equipe, agentes e contratos.
- **`ADMIN`**: Administrador da organização; gestão de configurações, campanhas e membros.
- **`MANAGER`**: Gestor de operações; gestão de agentes e acompanhamento de relatórios.
- **`OPERATOR`**: Operador de atendimento; monitoramento de chamadas e atuação no *human handoff*.
- **`VIEWER`**: Visualizador; acesso somente-leitura a relatórios e métricas.

### 9.2. Isolamento Estrutural do Platform Admin
- A entidade `PlatformAdminAuthorization` reside na tabela técnica `platform_admin_authorizations`, sem escopo de tenant (sem coluna `organization_id`).
- É uma autorização puramente global concedida a operadores internos do SaaS.
- Usuários de tenant estão categoricamente impossibilitados de se auto-elevar a Platform Admin.

---

## 10. Fluxo de Autenticação: Browser, Web e API

Para assegurar proteção contra vazamentos de tokens e ataques XSS, estabelecemos o seguinte fluxo:

```
[Browser] ──── (Cookie HttpOnly Seguro / SameSite=Lax) ────► [apps/web (BFF)]
                                                                   │
                         ┌─────────────────────────────────────────┴─────────────────────────────────────────┐
                         │ (Server-to-Server com Contexto Validado / Header Interno com OrgId + CorrelationId)│
                         ▼                                                                                   ▼
                    [apps/api] ◄────────────── (Internal Service Auth - PENDING) ────────────── [apps/worker / voice]
```

### 10.1. Análise Comparativa dos Fluxos
1. **Fluxo A — BFF Server-to-Server via `apps/web` (Recomendado para a UI Web)**:
   - O browser comunica-se com `apps/web` através de **Cookie HTTP-only seguro**, `SameSite=Lax`, `Secure`.
   - O JavaScript do navegador **NUNCA** tem acesso ao token de sessão (imunidade contra roubo de tokens via XSS).
   - Componentes de servidor / Server Actions do `apps/web` validam a sessão no Better Auth e comunicam-se com a `apps/api` de forma server-to-server.
   - *Segurança*: CSRF mitigado por SameSite e verificação de headers; CORS simplificado (mesma origem para o browser); isolamento da API.
2. **Fluxo B — Acesso Direto do Browser à `apps/api` via Cookie Compartilhado de Subdomínio**:
   - `apps/web` em `app.dominio.com` e `apps/api` em `api.dominio.com`, compartilhando cookie com escopo `Domain=.dominio.com`.
   - *Desafios*: Exige configuração rigorosa de CORS com `credentials: true` e proteção anti-CSRF explícita (custom header `X-Requested-With` ou tokens CSRF); complexidade de cookies em portas locais distintas (`localhost:3000` vs `localhost:3001`).
3. **Fluxo C — Bearer Tokens para Clientes Nativos, CLIs e Integrações M2M**:
   - O Better Auth suporta o plugin `bearer` para clientes que não suportam cookies (scripts de automação, integrações externas).
   - *Regra*: Não utilizar Bearer tokens armazenados em `localStorage` no browser para a aplicação web padrão.

### 10.2. Autenticação de Serviços Internos (`Internal Service Auth`)
- Para a comunicação entre `apps/worker`, `apps/voice` e `apps/api`:
- **`INTERNAL SERVICE AUTH MECHANISM: PENDING DECISION`**.
- *Requisitos Arquiteturais*: Autenticação máquina-a-máquina (M2M) segura, capacidade de rotação de credenciais, princípio do menor privilégio, auditabilidade e propagação obrigatória de `organizationId` e `correlationId` em todo envelope de mensagem.

---

## 11. Fronteiras de Acesso ao Banco de Dados

| Serviço / Processo | Papel Arquitetural | Acesso a Tabelas de Auth | Acesso a Tabelas de Domínio |
| :--- | :--- | :--- | :--- |
| **`apps/web`** | Interface Web / BFF | **SIM** (via route handlers do Better Auth) | **NÃO** (acesso a dados de negócio ocorre exclusivamente via `apps/api`) |
| **`apps/api`** | Gateway HTTP e Core Business | **SIM** (leitura de sessões para validação) | **SIM** (boundary primário de persistência via Repositories) |
| **`apps/worker`** | Processamento Assíncrono | **NÃO** (não manipula sessões) | **SIM** (via Repositories para jobs e consolidações) |
| **`apps/voice`** | Motor Realtime de Streaming | **NÃO** | **NÃO** no critical path (utiliza infraestrutura efêmera e publica eventos) |

---

## 12. Infraestrutura Efêmera e Filas

- A tecnologia para gerenciamento de estado em tempo real, cache de sessões ativas de chamadas telefônicas e filas assíncronas permanece como:
  **`EPHEMERAL STATE / ASYNC EVENT INFRASTRUCTURE: PENDING DECISION`**.
- Candidatas futuras: Redis, Valkey, Dragonfly, BullMQ, RabbitMQ. Nenhuma escolha foi fixada nesta fase.

---

## 13. Governança e Semântica de Migrações Versionadas

- As migrações devem seguir rigorosamente as recomendações técnicas do driver e do provedor de banco selecionado.
- Conexões de sessão direta (unpooled / direct) são fortemente preferidas por ferramentas de migração que dependem de semântica de sessão do PostgreSQL (como advisory locks e comandos DDL).
- As migrações são sequenciais, versionadas no Git em `packages/database/migrations/*.sql` e aplicadas via pipeline automatizado de CI/CD.
- Não devem ser chamadas automaticamente de "idempotentes" sem scripts de guarda específicos; a idempotência deve ser assegurada pelo controle transacional do runner de migrações.
- Alterações estruturais incompatíveis devem seguir o padrão *Expand and Contract*.

---

## 14. Análise Realista de Lock-in Tecnológico

| Dimensão de Lock-in | Neon Postgres | Supabase Postgres | Better Auth | Drizzle ORM |
| :--- | :--- | :--- | :--- | :--- |
| **Data Model Portability** | **Alta**: PostgreSQL padrão; exportável via `pg_dump`. | **Alta**: PostgreSQL padrão; exportável via `pg_dump`. | **Alta**: Tabelas SQL padrão no banco da aplicação. | **Alta**: Schemas traduzem diretamente para DDL SQL padrão. |
| **Operational Lock-in** | **Médio**: APIs de branching e autoscaling criam acoplamento de pipeline CI/CD. | **Médio**: Pooler Supavisor e infraestrutura integrada criam convenções de deploy. | **Baixo**: Executado em Node.js como biblioteca na aplicação. | **Baixo**: Executa via CLI Node padrão sem dependência de nuvem. |
| **SDK / API Lock-in** | **Zero**: Conexão via drivers padrão (`pg`, `postgres.js`). | **Baixo**: Se usado puramente como PostgreSQL via drivers padrão. | **Baixo**: APIs de auth desacopladas do core de domínio (Option A). | **Baixo**: Código de negócio isolado via Repositories em `packages/database`. |
| **Auth Schema Lock-in** | N/A | **Médio**: Identidades residem no schema interno `auth.users`. | **Baixo a Médio**: Tabelas `user` e `session` com colunas documentadas. | N/A |

---

## 15. Invariantes Mínimas de Segurança e Multi-Tenancy para PROMPT-004B

A implementação futura na Fase 4B deverá obrigatoriamente possuir testes automatizados cobrindo as seguintes invariantes:

- [ ] **Invariante 1**: Um usuário pertencente apenas à Organização A é categoricamente incapaz de ler, atualizar ou excluir recursos da Organização B.
- [ ] **Invariante 2**: Requisições para rotas com escopo de tenant exigem membership ativa; status `SUSPENDED` ou `INVITED` bloqueia acesso operacional.
- [ ] **Invariante 3**: A autorização de `Platform Admin` nunca é derivada de papéis de tenant (`OWNER`, `ADMIN`). Usuário comum não pode se auto-elevar a Platform Admin.
- [ ] **Invariante 4**: Todo método de repositório com escopo de tenant em `packages/database` exige obrigatoriamente `organizationId` no objeto de parâmetros.
- [ ] **Invariante 5**: Unique constraints em entidades de tenant são obrigatoriamente compostas com `organization_id` (ex.: slugs de recursos por organização).
- [ ] **Invariante 6**: Tarefas assíncronas (`apps/worker`) e eventos validam e propagam explicitamente `organizationId` e `correlationId`.
- [ ] **Invariante 7**: O direito de acesso a recursos e cotas de uso nunca é validado por valor booleano vindo do client-side; é computado deterministicamente no servidor via Entitlements.

---

## 16. Escopo Delimitado da Fase 4B (Fundação de Persistência e Auth)

Para garantir foco e respeitar o sequenciamento do roadmap, as entidades de fases posteriores (`agents`, `agent_versions`, `calls`, `campaigns`, `contacts`) foram **removidas** do escopo da Fase 4B.

O PROMPT-004B implementará exclusivamente a **Fundação de Identidade, Tenant e Comercial**:
1. Schemas e tabelas do framework de autenticação: `users`, `sessions`, `accounts`, `verifications`;
2. Schemas e tabelas de organização: `organizations`, `organization_memberships`;
3. Schemas e tabelas de governança global: `platform_admin_authorizations`;
4. Schemas e tabelas do modelo comercial: `plans`, `entitlements`, `subscriptions`, `commercial_grants`;
5. Estrutura mínima de trilha de auditoria (`audit_logs`) necessária à governança de autorização;
6. Repositories tipados em `packages/database` com validação de `organizationId`;
7. Suíte de testes automatizados das 7 Invariantes de Segurança.

*(Tabelas volumétricas de Usage serão mantidas com schema simples não-particionado; particionamento declarativo será avaliado empiricamente apenas sob demanda de escala).*

---

## 17. Recomendação Proposta para Aprovação Humana

```
┌────────────────────────────────────────────────────────────────────────┐
│                   RECOMMENDED STACK (PROPOSED)                         │
├──────────────────────────┬─────────────────────────────────────────────┤
│ Componente               │ Tecnologia Proposta                         │
├──────────────────────────┼─────────────────────────────────────────────┤
│ Motor de Banco de Dados  │ PostgreSQL (versão major alinhada ao cloud) │
│ Provedor de Banco Cloud  │ Neon Serverless Postgres (1ª Candidata)     │
│                          │ Supabase Postgres (Alternativa de 1ª Linha) │
│ Camada ORM / Persistência│ Drizzle ORM + drizzle-kit                   │
│ Driver de Conexão Node   │ postgres.js ou pg com connection pooling    │
│ Sistema de Autenticação  │ Better Auth (Option A: Identidade + Sessão) │
│ Autorização de Tenants   │ 100% no Domínio via Repositories Tipados    │
│ Papéis de Tenant         │ Enum de Domínio (OWNER..VIEWER)             │
│ Platform Admin           │ Tabela Global platform_admin_authorizations │
│ Desenvolvimento Local    │ Docker Compose (PostgreSQL limpo)           │
└──────────────────────────┴─────────────────────────────────────────────┘
```

---

## 18. Decisões Técnicas que Exigem Aprovação Humana Formal

Antes do início da implementação prática (PROMPT-004B), os seguintes itens requerem validação expressa pelo operador humano:

1. **Aprovação do Motor PostgreSQL** como padrão relacional unificado.
2. **Definição do Provedor Cloud Oficial** entre **Neon Serverless Postgres** (vantagem em branching para CI/CD e suporte a `sa-east-1`) e **Supabase Postgres** (vantagem em ecossistema integrado e suporte a `sa-east-1`).
3. **Aprovação da Adoção do Drizzle ORM** em `packages/database`.
4. **Aprovação do Better Auth sob a Option A** (Better Auth para identidade e sessão; autorização de organizações e memberships 100% no domínio).
5. **Aprovação do Uso de Docker Compose Local** para desenvolvimento offline de engenheiros e agentes de IA (sujeito à disponibilidade do Docker no ambiente do usuário).
