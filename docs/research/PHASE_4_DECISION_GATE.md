# Pesquisa Arquitetural e Portão de Decisão — Fase 4: Persistência, Autenticação e Multi-Tenancy (PHASE_4_DECISION_GATE.md)

> **Status do Documento**: PROPOSED / HUMAN APPROVAL REQUIRED  
> **Data da Consulta / Pesquisa**: 22 de Setembro de 2026  
> **Origem da Demanda**: PROMPT-004A — Persistence, Auth & Multi-Tenancy Decision Gate  
> **Escopo**: Pesquisa comparativa, avaliação técnica, matriz de decisão e proposta de stack.  
> **Salvaguardas Críticas**: Zero dependências instaladas, zero provisionamento de infraestrutura/cloud, zero secrets criados ou manipulados, zero DDLs ou migrations executadas.

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
| **PostgreSQL & Drivers** | Context7 & Docs Oficiais | Node-Postgres (`pg`), `postgres.js` | 2026-09-22 | VERIFIED |
| **Drizzle ORM** | Context7 MCP | `/drizzle-team/drizzle-orm-docs` | 2026-09-22 | VERIFIED |
| **Prisma ORM** | Context7 MCP | `/websites/prisma_io` | 2026-09-22 | VERIFIED |
| **Kysely Query Builder** | Context7 MCP | `/kysely-org/kysely` | 2026-09-22 | VERIFIED |
| **Neon Serverless Postgres**| Context7 & Docs Oficiais | `/neondatabase/website` | 2026-09-22 | VERIFIED |
| **Supabase Postgres & Auth** | Context7 & Docs Oficiais | `/supabase/supabase` | 2026-09-22 | VERIFIED |
| **Railway PostgreSQL** | Docs Oficiais & CLI Guides | Railway Docs (PgBouncer, Patroni HA) | 2026-09-22 | VERIFIED |
| **Better Auth** | Context7 MCP | `/better-auth/better-auth` | 2026-09-22 | VERIFIED |
| **Clerk** | Context7 MCP | `/clerk/clerk-docs` | 2026-09-22 | VERIFIED |
| **Auth.js (NextAuth v5)** | Context7 MCP | `/websites/authjs_dev` | 2026-09-22 | VERIFIED |

---

## 3. Categoria 1 — Motor de Banco Relacional (Engine)

### 3.1. Avaliação do PostgreSQL
O **PostgreSQL** é avaliado frente aos requisitos estruturais da plataforma:

1. **Integridade Referencial e Constraints Fortes**:
   - `DOCUMENTED CAPABILITY`: Suporte robusto a chaves estrangeiras com ações estritas (`ON DELETE RESTRICT`, `ON DELETE CASCADE`), constraints de verificação (`CHECK`), restrições compostas de unicidade e índices parciais.
   - `PROJECT REQUIREMENT`: Essencial para garantir integridade entre `organizations`, `users`, `agents`, `agent_versions`, `calls`, `campaigns`, `subscriptions` e `entitlements`.
2. **Transações ACID e Controle de Concorrência (MVCC)**:
   - `DOCUMENTED CAPABILITY`: Isolamento transacional rigoroso (Read Committed, Repeatable Read, Serializable) com locking refinado (`SELECT FOR UPDATE`, advisory locks).
   - `PROJECT REQUIREMENT`: Mandatório para controle de turnos de chamadas, alocação de atendentes no *human handoff*, dedução determinística de cotas de minutos e concessões comerciais.
3. **Multi-Tenancy por `organizationId` e Índices Compostos**:
   - `DOCUMENTED CAPABILITY`: Índices B-Tree compostos de alto desempenho (ex.: `(organization_id, created_at DESC)`), índices parciais por tenant ativo e particionamento declarativo nativo (por lista ou hash).
4. **Tipagem Numérica Exata para Custos e Faturamento**:
   - `DOCUMENTED CAPABILITY`: Tipo `NUMERIC`/`DECIMAL` de precisão arbitrária e suporte nativo a inteiros de 64 bits (`BIGINT`) para valores monetários em *integer cents*.
5. **Versionamento e Dados Estruturados**:
   - `DOCUMENTED CAPABILITY`: Suporte nativo a tipos `JSONB` indexáveis (via GIN/GIST) para metadados de tool calling, configurações flexíveis de LLM e payloads de eventos, mantendo a integridade relacional no núcleo.
6. **Evolução Futura para Inteligência e Vetores**:
   - `DOCUMENTED CAPABILITY`: Extensão `pgvector` amplamente adotada e suportada para armazenamento e busca de embeddings vetoriais da Knowledge Base de agentes de voz, sem necessidade de introduzir um banco vetorial proprietário separado na fase inicial.

### 3.2. Conclusão sobre Bancos Não-Relacionais (NoSQL)
- Enginespuramente NoSQL (Document Stores, Key-Value puros) são **inadequados** para o core transacional desta plataforma devido à ausência de garantias ACID multi-documento rigorosas, complexidade de manutenção de integridade referencial manual, alto risco de inconsistência em faturamento/cotas e fragilidade de auditoria e multi-tenancy.
- **Veredito**: **PostgreSQL permanece como o motor relacional unificado e indispensável para a plataforma.**  
  *(Status: PROPOSED ENGINE: PostgreSQL).*

---

## 4. Categoria 2 — Managed Database Provider

Comparação técnica entre três fornecedores consolidados de PostgreSQL gerenciado:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   MANAGED POSTGRESQL PROVIDERS                         │
├──────────────────────┬──────────────────────┬──────────────────────────┤
│       NEON           │      SUPABASE        │         RAILWAY          │
│ Serverless / Branch  │ All-in-one / RLS     │ Containers / Patroni HA  │
│ Autoscaling / Zero   │ Supavisor Pooling    │ PgBouncer Nativo         │
│ Storage/Compute Sep. │ Ecossistema Aberto   │ Simplicidade Ops         │
└──────────────────────┴──────────────────────┴──────────────────────────┘
```

### 4.1. Neon Serverless Postgres
- **Arquitetura**: Separação completa entre camada de computação (compute nodes stateless) e camada de armazenamento distribuído (Neon Pageserver/Safekeepers).
- **Connection Pooling**: PgBouncer nativo integrado com endpoints dedicados (`-pooler`). Suporta até 10.000 conexões concorrentes em modo transação. Oferece endpoint direto (unpooled) obrigatório para migrations DDL e locks de sessão.
- **Database Branching (Copy-on-Write)**: Criação instantânea de branches isoladas do banco de dados (dados + schema) em segundos, ideal para pipelines de CI/CD, testes de regressão de migrations em PRs e ambientes de staging efêmeros.
- **Autoscaling e Scale-to-Zero**: Nós de computação podem escalar de 0.25 CU até 16+ CU e suspender automaticamente após 5 minutos de inatividade em desenvolvimento, reduzindo custos ociosos.
- **Compatibilidade**:
  - `apps/web` (Next.js): Excelente via connection pooler ou driver HTTP/WebSockets serverless (`@neondatabase/serverless`).
  - `apps/api` e `apps/worker`: Compatibilidade total via connection pooler (modo transação) e conexões TCP diretas.
- **Backups e PITR**: Restauração pontual baseada em histórico de log estruturado (Instant Restore de 6 horas a 30 dias dependendo do plano).
- **Preços Oficiais Verificados (22/09/2026)**:
  - *Free*: US$ 0/mês (0.5 GB storage, 100 CU-horas/mês, 1 projeto).
  - *Launch / Scale*: Baseado em consumo real, sem valor mínimo mensal obrigatório. Computação a partir de US$ 0.106/CU-hora; Storage a US$ 0.35/GB-mês.
- **Pontos de Atenção**: Latência de *cold start* caso o nó entre em suspensão (mitigável configurando compute sempre ativo em produção).

### 4.2. Supabase Postgres
- **Arquitetura**: Instância dedicada de PostgreSQL em contêiner gerenciado (AWS/Fly), acompanhada de pooler Supavisor e stack open-source.
- **Connection Pooling**: Pooler **Supavisor** de alto desempenho operando na porta 6543 (modo transação para serverless/APIs) e na porta 5432 (modo sessão para migrations e conexões persistentes).
- **Extensões e Recursos**: Suporte nativo completo a `pgvector`, `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, com interface gráfica administrativa.
- **Compatibilidade**: Excelente para todos os serviços (`apps/web`, `apps/api`, `apps/worker`, `apps/voice`) via portas dedicadas do Supavisor.
- **Preços Oficiais Verificados (22/09/2026)**:
  - *Free*: US$ 0/mês (500 MB database, pausa após 1 semana de inatividade).
  - *Pro*: US$ 25/mês (8 GB database incluído, US$ 10 de crédito de computação mensal cobrindo instância Micro, backups diários com 7 dias de retenção, spend cap configurável).
  - *Team*: A partir de US$ 599/mês (SOC 2, SSO corporativo).
- **Pontos de Atenção**: O plano Free suspende projetos inativos após 7 dias. O acoplamento com o ecossistema Supabase deve ser evitado usando o banco puramente como PostgreSQL padrão.

### 4.3. Railway PostgreSQL
- **Arquitetura**: PostgreSQL executado em contêineres sobre infraestrutura Railway com suporte a clusters de Alta Disponibilidade (HA) via **Patroni**, **etcd** e **HAProxy**.
- **Connection Pooling**: Integração nativa com **PgBouncer** comutada via painel ou CLI. Fornece variáveis separadas: `DATABASE_URL` (pool privado), `DATABASE_PUBLIC_URL` (pool externo) e `DATABASE_UNPOOLED_URL` (conexão direta para migrations).
- **Backups e PITR**: Suporte a backups automáticos e Point-in-Time Recovery via CLI (`railway postgres pitr restore`).
- **Preços Oficiais Verificados (22/09/2026)**:
  - *Hobby*: Assinatura de US$ 5/mês (inclui US$ 5 de créditos de consumo).
  - *Pro*: Assinatura de US$ 20/mês (inclui US$ 20 de créditos de consumo).
  - *Consumo de Recursos*: RAM a US$ 10/GB-mês; CPU a US$ 20/vCPU-mês; Storage a US$ 0.15/GB-mês; Egress a US$ 0.05/GB.
- **Pontos de Atenção**: Modelo de custos pode apresentar volatilidade em picos contínuos de memória/CPU comparado a instâncias previsíveis.

---

## 5. Categoria 3 — ORM / Camada de Persistência (Query Layer)

Comparativo entre as três ferramentas principais de TypeScript strict para PostgreSQL:

| Critério de Avaliação | Drizzle ORM | Prisma ORM | Kysely |
| :--- | :--- | :--- | :--- |
| **Paradigma** | TypeScript-first ORM / SQL-like | DSL proprietária (`schema.prisma`) | Type-Safe SQL Query Builder puro |
| **Definição de Schema** | 100% TypeScript puro (`pgTable`) | Arquivo DSL próprio com geração | TypeScript interfaces ou gerado do DB |
| **Geração de Código** | Nenhuma (zero build step para client) | Mandatório (`prisma generate`) | Nenhuma (tipagem estática pura) |
| **Runtime Overhead** | Próximo de zero (~overhead de query SQL) | Engine Rust / WASM intermediário | Zero overhead |
| **Migrations** | `drizzle-kit generate` / SQL puro versionado | `prisma migrate` (exige shadow database) | `Kysely Migrator` (TypeScript ou SQL) |
| **SQL Escape Hatch** | Tag `sql` totalmente tipada | `$queryRaw` fracamente tipado | Tag `sql` totalmente integrada |
| **Multi-Tenancy & Índices**| `uniqueIndex`, índices parciais e compostos nativos | Atributos `@@index`, `@@unique` limitados | Suporte total a DDL do PostgreSQL |
| **Compatibilidade Serverless**| Instantânea (peso de biblioteca mínimo) | Requer driver adapters (`@prisma/adapter-pg`)| Instantânea |
| **Testabilidade em Memória** | Simples com mocks de drivers ou PGlite | Complexo (mocking de PrismaClient extenso) | Simples com dialect de teste em memória |
| **Ergonomia Monorepo** | Excelente (cabe perfeitamente em `packages/database`)| Exige sincronização de artefatos gerados | Excelente |
| **Manutenibilidade por IA** | Altíssima (código TypeScript explícito) | Boa para CRUD; frágil em queries avançadas | Altíssima |

### Análise Crítica
1. **Drizzle ORM**: Oferece a combinação ideal de forte tipagem estática em TypeScript puro, ausência de binários compilados em tempo de execução, controle explícito sobre SQL gerado e migrations declaradas em arquivos SQL limpos e revisáveis por humanos em PRs.
2. **Prisma ORM**: Embora popular, a necessidade de uma DSL proprietária (`schema.prisma`), overhead de geração de cliente binário/WASM, dependência de *shadow database* para migrations e maior consumo de memória em processos serverless/containers representam desvantagens operacionais relevantes para este projeto.
3. **Kysely**: É um excelente query builder, extremamente leve e confiável, porém não inclui sistema de abstração de schema com detecção de migrações automáticas integrada (depende de migrações manuais ou ferramentas terceiras).
4. **Isolamento de Domínio**: Em qualquer das opções, confirma-se o requisito de que **o domínio (`packages/contracts`) nunca importará o ORM**. Repositories tipados em `packages/database` encapsulam completamente a persistência.

---

## 6. Categoria 4 — Autenticação e Sessões

Comparação detalhada para uma plataforma SaaS B2B com separação de Platform Admin e Tenant Application:

| Recurso / Requisito | Better Auth | Supabase Auth (GoTrue) | Clerk | Auth.js (NextAuth v5) |
| :--- | :--- | :--- | :--- | :--- |
| **Tipo de Solução** | Framework TS Open-Source Self-Hosted | BaaS Open-Source Gerenciado/Self | SaaS Especializado Gerenciado | Framework TS Open-Source |
| **Propriedade dos Dados**| 100% no banco da aplicação | No schema `auth` do Supabase | Na nuvem da Clerk | No banco da aplicação |
| **Vendor Lock-in** | **Zero** (MIT License) | Médio (dependência de GoTrue/JWT)| **Alto** (SaaS proprietário) | **Zero** (ISC License) |
| **Suporte Nativo B2B Multi-Tenant**| **Nativo** (`organization` plugin com roles e invites) | Parcial (via claims ou tabelas próprias) | **Nativo** (Organizations B2B) | Inexistente (requer implementação manual) |
| **Gestão de Sessões** | Cookie HTTP-only seguro + Bearer Token | Cookie / LocalStorage + JWT | Cookie gerenciado + JWT | Cookie HTTP-only assinado |
| **API Backend Separada (`apps/api`)**| **Excelente** (plugin `bearer` e verificação de sessão) | Boa (verificação de JWT com chave pública) | **Excelente** (`@clerk/backend` verifyToken) | Complexa fora do Next.js App Router |
| **MFA, Passkeys e OAuth**| Suporte nativo via plugins modulares | Suporte nativo (SMS, TOTP, OAuth) | Suporte nativo completo e pronto | Suporte a OAuth e Passkeys experimentais |
| **Isolamento de Platform Admin**| Simples (tabela de autorização desacoplada) | Requer metadata ou bypass de RLS | Requer metadata ou organização especial | Manual |
| **Custo de Licenciamento** | **US$ 0** (Open Source) | Incluído no plano do Supabase | Free até 50k MRU; Pro a US$ 25/mês | **US$ 0** (Open Source) |

### Análise Crítica
- **Better Auth**: Destaca-se como a solução mais alinhada com os princípios do repositório. É desenvolvida em TypeScript nativo, armazena seus dados diretamente no PostgreSQL da aplicação (via adaptador Drizzle/Kysely), possui um plugin nativo de organizações (`organization`) com suporte a múltiplos papéis e convites por e-mail, e inclui o plugin `bearer` para validação segura em APIs backend separadas (`apps/api`) sem depender de serviços em nuvem externos.
- **Clerk**: Possui a melhor experiência de usuário e componentes visuais prontos, mas introduz forte dependência de um serviço externo proprietário, custos por usuário que escalam rapidamente em B2B corporativo e complexidade na exportação de credenciais.
- **Supabase Auth**: É robusta e bem integrada ao ecossistema PostgreSQL, mas amarra a gestão de identidades ao schema interno `auth.users` e à mecânica específica de JWTs do Supabase.
- **Auth.js**: Focada prioritariamente em aplicações B2C com Next.js; não oferece abstrações prontas para B2B multi-tenant (organizações, convites, papéis por tenant), exigindo desenvolvimento customizado significativo.

---

## 7. Modelo de Identidade Conceitual

A arquitetura de identidade separa formalmente **Identidade**, **Usuário de Negócio**, **Organização**, **Afiliação (Membership)** e **Autorização Global de Platform Admin**:

```
                       ┌────────────────────────────┐
                       │        AuthIdentity        │
                       │ (provider, providerSubject)│
                       └─────────────┬──────────────┘
                                     │ 1:1 ou N:1
                                     ▼
                       ┌────────────────────────────┐
                       │            User            │
                       │ (id, email, name, status)  │
                       └──────┬──────────────┬──────┘
                              │              │
        ┌─────────────────────┘              └─────────────────────┐
        │ 1:N                                                      │ 1:1 (opcional)
        ▼                                                          ▼
┌───────────────────────────────┐                  ┌───────────────────────────────────┐
│     OrganizationMembership    │                  │    PlatformAdminAuthorization     │
│ (userId, organizationId, role)│                  │(userId, globalRole, auditMetadata)│
└───────────────┬───────────────┘                  └───────────────────────────────────┘
                │ N:1                                      (ESTRITAMENTE GLOBAL)
                ▼
┌───────────────────────────────┐
│         Organization          │
│(id, slug, name, billingMode)  │
└───────────────────────────────┘
```

### 7.1. Entidades Conceituais
1. **`User` (Usuário Interno de Negócio)**:
   - Identificador primário interno canônico (`id: UUIDv7`).
   - Dados de perfil: `email`, `name`, `avatarUrl`, `status: ACTIVE | SUSPENDED`.
   - `providerUserId` **NUNCA** é utilizado como chave universal de domínio.
2. **`AuthIdentity` (Credencial / Provedor de Autenticação)**:
   - Identificador primário (`id: UUIDv7`).
   - `provider: 'credential' | 'google' | 'magic_link' | 'sso'`.
   - `providerSubject`: identificador externo do sujeito (ex.: hash da senha, sub do OAuth).
   - `userId`: chave estrangeira referenciando `User.id`.
3. **`Organization` (Tenant Corporativo)**:
   - Identificador primário interno (`id: UUIDv7`).
   - Metadados: `name`, `slug` (único), `status: ACTIVE | SUSPENDED`.
4. **`OrganizationMembership` (Vínculo Tenant-Usuário)**:
   - Identificador primário (`id: UUIDv7`).
   - `userId`: referência a `User.id`.
   - `organizationId`: referência a `Organization.id`.
   - `role`: enum de papéis de tenant (`OWNER`, `ADMIN`, `MANAGER`, `OPERATOR`, `VIEWER`).
   - `status`: `INVITED | ACTIVE | SUSPENDED`.
   - Restrição de unicidade composta: `UNIQUE(userId, organizationId)`.
5. **`PlatformAdminAuthorization` (Master Admin Global)**:
   - Identificador primário (`id: UUIDv7`).
   - `userId`: referência a `User.id`.
   - `globalRole`: `PLATFORM_ADMIN | SUPPORT_OPERATOR`.
   - `grantedAt`: timestamp ISO da concessão.
   - `grantedBy`: identificador do operador que concedeu o acesso.
   - `auditMetadata`: justificativa formal da concessão.
   - **Regra de Isolamento**: Tabela técnica global, sem coluna `organizationId`. Não acessível por fluxos de tenant.

---

## 8. Estratégia de Multi-Tenancy e Isolamento

Comparação de quatro estratégias de isolamento de dados:

| Dimensão | (A) Aplicação Exclusiva | (B) PostgreSQL RLS Puro | (C) Defesa em Profundidade (A + B) | (D) Schema / DB por Tenant |
| :--- | :--- | :--- | :--- | :--- |
| **Risco de Data Leak** | Médio se query falhar | Baixo (garantido no DB) | **Mínimo Absoluto** | Baixo |
| **Complexidade de Código** | Baixa a moderada | Moderada a alta | Moderada | Extremamente alta |
| **Impacto em Poolers (PgBouncer)**| **Zero** (queries regulares) | Alto (`SET LOCAL` requer transação)| Moderado (RLS via transaction wrapper)| Incompatível com pooling unificado |
| **Workers / Jobs em Segundo Plano**| **Nativo e trivial** | Requer impersonation de contexto | **Nativo com contexto explícito** | Complexo (roteamento de conexões) |
| **Platform Admin Cross-Tenant** | **Simples e auditável** | Exige role especial de bypass | **Simples via bypass auditado** | Requer queries federadas |
| **Manutenção de Migrations** | **1x por ambiente** | 1x por ambiente | **1x por ambiente** | N vezes o número de tenants |

### Recomendação Arquitetural para o Estágio Atual
- **Abordagem Adotada**: **Aplicação com Enforçamento Estrito nos Repositories + Preparação para Defesa em Profundidade**.
- **Justificativa**: No estágio de fundação e MVP robusto, obrigar que 100% dos Repositories exijam `organizationId` tipado (validado por testes de segurança cross-tenant automatizados) oferece o menor overhead de conexão com poolers em modo transação (evitando a necessidade de injetar `SET LOCAL request.jwt.claims` em cada comando SQL) e garante simplicidade total para workers assíncronos e jobs do Platform Control Plane.
- O schema de banco de dados deve ser modelado com `organization_id` obrigatório e índices compostos, permitindo ativar políticas de RLS em tabelas ultra-sensíveis como camada de segurança adicional (*defense in depth*) quando necessário.

---

## 9. Fonte da Verdade e Separação de Autorização (Auth vs. AuthZ)

```
┌──────────────────────────────────────┐     ┌──────────────────────────────────────┐
│     AUTHENTICATION SOURCE OF TRUTH   │     │     AUTHORIZATION SOURCE OF TRUTH    │
│            (Quem é você?)            │     │         (O que pode fazer?)          │
├──────────────────────────────────────┤     ├──────────────────────────────────────┤
│ - Credenciais válidas                │     │ - Membership e Role na Organização   │
│ - Sessão ativa (cookie / bearer)     │     │ - Entitlements ativos do Plano       │
│ - Assinatura criptográfica de tokens │     │ - Estado comercial (Active, PastDue) │
│ - MFA / Passkeys verificadas         │     │ - Concessões manuais (CommercialGrant│
│ - Identificador único `User.id`      │     │ - Platform Admin (Autorização Global)│
└──────────────────────────────────────┘     └──────────────────────────────────────┘
```

- O provedor de autenticação **NUNCA** é a fonte de verdade para regras de negócio, limites de plano, cotas de minutos ou permissões financeiras.
- A autorização é resolvida exclusivamente pela camada de domínio da aplicação consultando o banco de dados relacional.

---

## 10. Resolução e Seleção de Organização Ativa

### 10.1. Mecanismo Proposto
1. **Navegação e Rotas**:
   - `apps/web` opera sob contexto de organização resolvido prioritariamente por rota ou seletor de tenant:
     - URL canônica: `/org/[organizationSlug]/dashboard` ou preferência ativa em sessão.
2. **Validação Server-Side Obrigatória**:
   - **Regra Anti-Bypass**: O client **NUNCA** pode forçar acesso a uma organização apenas enviando um header `x-organization-id` ou parâmetro de URL arbitrário.
   - Em toda requisição, o servidor (`apps/api` ou Server Action/Component) executa a validação:
     ```typescript
     const membership = await membershipRepository.findActiveMembership({
       userId: session.user.id,
       organizationId: requestedOrganizationId,
     });
     if (!membership || membership.status !== 'ACTIVE') {
       throw new ForbiddenError('User does not belong to active organization');
     }
     ```
3. **Plano de Controle Global**:
   - Rotas sob `/platform/*` são protegidas por guardião de `PlatformAdminAuthorization`:
     ```typescript
     const isPlatformAdmin = await platformAdminRepository.isAuthorized(session.user.id);
     if (!isPlatformAdmin) {
       throw new ForbiddenError('Access restricted to platform administrators');
     }
     ```

---

## 11. Arquitetura de Autenticação da API (`apps/web` -> `apps/api` e Serviços Internos)

```
[Browser] ──── (Cookie SameSite HTTP-only) ────► [apps/web]
                                                    │
                 ┌──────────────────────────────────┴──────────────────────────────────┐
                 │ (Forward de Sessão / Bearer Token + CorrelationId + OrgContext)     │
                 ▼                                                                     ▼
            [apps/api] ◄──────── (Internal Service Token / HMAC) ─────── [apps/worker / voice]
```

1. **Browser para `apps/web`**:
   - Cookie de sessão seguro, `SameSite=Lax` (ou `Strict`), `HttpOnly`, `Secure`.
2. **`apps/web` para `apps/api`**:
   - A aplicação web autentica chamadas à API gateway enviando o token de sessão no header `Authorization: Bearer <sessionToken>` ou repassando cookie autenticado, acompanhado obrigatoriamente de `X-Correlation-Id` e `X-Organization-Id`.
   - `apps/api` valida o token de sessão diretamente no repositório de sessões compartilhadas ou via chave pública simétrica.
3. **Serviços Internos (`apps/worker`, `apps/voice`) para `apps/api`**:
   - Comunicação máquina-a-máquina (M2M) autenticada via **Internal Service Token** (Bearer token criptográfico interno com assinatura HMAC/JWT e rotação de segredo).
   - Todo payload de evento ou job carrega explicitamente `organizationId` e `correlationId`.

---

## 12. Modelo de Conexão com Banco de Dados por Aplicação

| Serviço / Processo | Natureza do Processo | Tipo de Conexão Recomendado | Justificativa Técnica |
| :--- | :--- | :--- | :--- |
| **`apps/web` (Next.js)** | Serverless / Route Handlers | **Pooled (PgBouncer/Supavisor)** | Evita esgotamento de conexões em concorrência de requisições web curtas. |
| **`apps/api` (Core Gateway)** | Long-Lived Node.js Process | **Pooled (PgBouncer/Supavisor)** | Gerenciamento otimizado de pooling com número controlado de conexões ativas. |
| **`apps/worker` (Processamento)**| Long-Lived Worker Pool | **Direct ou Pooled (Session Mode)**| Suporta transações longas, advisory locks e processamento em lote confiável. |
| **`apps/voice` (Motor Realtime)**| Long-Lived Streaming WebSocket| **Mínima / Indireta via Redis** | O motor de voz não deve manter dezenas de conexões diretas ao DB durante picos de chamadas; grava eventos em Redis/filas para ingestão assíncrona pelo worker. |
| **CLI de Migrations (`drizzle-kit`)**| Ferramenta de linha de comando | **Direct Connection Obrigatória** | Comandos DDL, criação de tabelas e locks de schema falham em poolers transacionais. |

---

## 13. Governança de Migrações Versionadas

1. **Controle Estrito no Git**:
   - Todas as migrações residem em `packages/database/migrations/*.sql`.
   - Arquivos SQL são versionados, imutáveis e revisáveis linha por linha em Pull Requests.
2. **Zero DDL Manual em Produção**:
   - Proibido rodar comandos SQL de criação ou alteração manual no banco de dados.
3. **Execução Automatizada no Pipeline de CI/CD**:
   - As migrações são aplicadas automaticamente no deploy usando a URL de conexão direta (`DIRECT_URL`).
4. **Padrão Expand and Contract para Mudanças Não-Triviais**:
   - Alterações de schema que envolvam renomeação de colunas ou quebra de compatibilidade devem ocorrer em etapas:
     1. *Expand*: Adição da nova coluna mantendo a antiga compatível.
     2. *Migrate*: Código transiciona leitura e escrita.
     3. *Contract*: Remoção da coluna depreciada após validação.

---

## 14. Invariantes Mínimas de Segurança e Multi-Tenancy para PROMPT-004B

A implementação futura na Fase 4B deverá obrigatoriamente possuir testes automatizados cobrindo as seguintes invariantes:

- [ ] **Invariante 1**: Um usuário pertencente apenas à Organização A é categoricamente incapaz de ler, atualizar ou excluir recursos da Organização B.
- [ ] **Invariante 2**: Requisições para rotas com escopo de tenant exigem membership ativa; status `SUSPENDED` ou `INVITED` bloqueia acesso operacional.
- [ ] **Invariante 3**: A autorização de `Platform Admin` nunca é derivada de papéis de tenant (`OWNER`, `ADMIN`). Usuário comum não pode se auto-elevar a Platform Admin.
- [ ] **Invariante 4**: Todo método de repositório com escopo de tenant em `packages/database` exige obrigatoriamente `organizationId` no objeto de parâmetros.
- [ ] **Invariante 5**: Unique constraints em entidades de tenant são obrigatoriamente compostas com `organization_id` (ex.: dois tenants diferentes podem ter um agente com slug `"suporte"`).
- [ ] **Invariante 6**: Tarefas assíncronas (`apps/worker`) e eventos de áudio (`apps/voice`) validam e propagam explicitamente `organizationId` e `correlationId`.
- [ ] **Invariante 7**: O direito de acesso a recursos e cotas de uso nunca é validado por valor booleano vindo do client-side; é computado deterministicamente no servidor.

---

## 15. Compatibilidade com o Modelo Comercial e Planos

A stack proposta integra-se nativamente com os requisitos do [PLATFORM_CONTROL_PLANE.md](file:///d:/voice-agent-platform/docs/PLATFORM_CONTROL_PLANE.md):
- **Plan**: Tabela mestre no banco gerenciada pelo Platform Admin.
- **Entitlements**: Modelados como pares chave-limite (`key`, `value`) associados a planos e com suporte a *overrides* específicos por organização.
- **CommercialGrant**: Tabela de concessões corporativas manuais com vigência (`startsAt`, `endsAt`), autorizada por Platform Admin e com justificativa auditável.
- **Subscription**: Estado de assinatura (`TRIALING`, `ACTIVE`, `PAST_DUE`, `SUSPENDED`, `CANCELED`, `EXPIRED`) desacoplado de webhooks financeiros.
- **Usage**: Registros volumétricos em tabelas particionadas no PostgreSQL para minutos, tokens e chamadas, consumíveis pelo painel da plataforma.

---

## 16. Matriz de Decisão Comparativa

### 16.1. Matriz de Banco Gerenciado (Managed Database)

| Critério | Neon Postgres | Supabase Postgres | Railway PostgreSQL |
| :--- | :--- | :--- | :--- |
| **Pontos Fortes** | Branching instantâneo para CI/CD; autoscaling real; separação storage/compute; custo zero ocioso em dev. | Stack PostgreSQL madura; pooler Supavisor integrado; interface rica; ecossistema completo. | Controle direto de instâncias; PgBouncer e Patroni HA configuráveis via CLI; simplicidade. |
| **Trade-offs / Riscos** | Cold start em scale-to-zero (mitigável com compute fixo); pooler requer conexão direta para migrations. | Lock-in psicológico com BaaS (mitigável usando apenas Postgres); pausa de projetos no plano free. | Sem branching nativo copy-on-write; modelo de precificação por recurso volátil em picos. |
| **Aderência ao Projeto** | **Altíssima** (branching acelera testes de monorepo e PRs de migrations). | **Altíssima** (robusto, compatível com pooling de alta escala). | **Alta** (excelente para deploys convencionais). |
| **Lock-in de Fornecedor**| **Zero** (PostgreSQL 100% padrão; migrável via pg_dump/restore). | **Zero** se usado apenas como banco (PostgreSQL padrão). | **Zero** (PostgreSQL padrão em contêiner). |
| **Complexidade Operacional**| **Mínima** (totalmente serverless e gerenciado). | **Mínima** (totalmente gerenciado). | **Baixa a Média** (gerenciamento de contêineres). |
| **Status de Verificação** | **VERIFIED** via Context7 e documentação oficial (Set/2026). | **VERIFIED** via Context7 e documentação oficial (Set/2026). | **VERIFIED** via documentação oficial (Set/2026). |

### 16.2. Matriz de Camada de Persistência / ORM

| Critério | Drizzle ORM | Prisma ORM | Kysely |
| :--- | :--- | :--- | :--- |
| **Pontos Fortes** | TypeScript puro; zero overhead de runtime; migrations SQL limpas e auditáveis; excelente ergonomia monorepo. | Comunidade madura; documentação extensa; facilidade em CRUDs iniciais. | Query builder extremamente leve; zero geração de código; flexibilidade máxima de SQL. |
| **Trade-offs / Riscos** | Ecossistema mais jovem que Prisma (porém amplamente adotado e estável). | Overhead de engine Rust/WASM; shadow database mandatória para migrações; geração de binários pesados. | Não inclui gerador de migrations integrado a partir de schemas TypeScript. |
| **Aderência ao Projeto** | **Máxima** (respeita limites de complexidade, tipos puros e facilidade para agentes de IA). | **Média** (pesado para processos serverless e monorepos estritos). | **Alta** (excelente, mas requer ferramenta de migração complementar). |
| **Lock-in de Código** | **Mínimo** (schemas são representações diretas de tabelas SQL). | **Alto** (dependência da DSL `schema.prisma` e convenções do Prisma).| **Mínimo** (SQL tipado padrão). |
| **Status de Verificação** | **VERIFIED** via Context7 (`/drizzle-team/drizzle-orm-docs`). | **VERIFIED** via Context7 (`/websites/prisma_io`). | **VERIFIED** via Context7 (`/kysely-org/kysely`). |

### 16.3. Matriz de Autenticação e Gestão de Sessões

| Critério | Better Auth | Supabase Auth | Clerk | Auth.js (NextAuth v5) |
| :--- | :--- | :--- | :--- | :--- |
| **Pontos Fortes** | Open-source MIT; dados no nosso banco; plugin de organizações nativo; suporte a Bearer token e cookies; zero custo de licença. | Integrado ao Supabase; suporte a RLS nativo com JWTs; open-source. | UI pronta excepcional; onboarding rápido; recursos enterprise prontos. | Open-source popular; boa integração com Next.js App Router para B2C. |
| **Trade-offs / Riscos** | Biblioteca mais recente do ecossistema TS (embora já com v1.x estável e ampla adoção). | Amarrado ao schema e infraestrutura do Supabase; abstração de organizações não é nativa. | Alto lock-in; dependência de infraestrutura proprietária; custos crescentes em escala B2B. | Sem abstração de organizações B2B; desenvolvimento de multi-tenancy totalmente manual. |
| **Aderência ao Projeto** | **Máxima** (atende perfeitamente ao monorepo com `apps/web` e `apps/api` sem custos de terceiros). | **Alta** (se a stack for 100% baseada no Supabase). | **Média** (excelente UI, mas viola o princípio de baixo lock-in e soberania de dados). | **Baixa** (muito retrabalho para suportar B2B multi-tenant e API externa). |
| **Status de Verificação** | **VERIFIED** via Context7 (`/better-auth/better-auth`). | **VERIFIED** via Context7 (`/supabase/supabase`). | **VERIFIED** via Context7 (`/clerk/clerk-docs`). | **VERIFIED** via Context7 (`/websites/authjs_dev`). |

---

## 17. Recomendação Proposta para Aprovação Humana

Com base na investigação técnica aprofundada, requisitos inegociáveis e matrizes comparativas, submete-se para aprovação humana a seguinte proposta de stack para a Fase 4:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   RECOMMENDED STACK (PROPOSED)                         │
├──────────────────────────┬─────────────────────────────────────────────┤
│ Componente               │ Tecnologia Proposta                         │
├──────────────────────────┼─────────────────────────────────────────────┤
│ Motor de Banco de Dados  │ PostgreSQL 16+                              │
│ Provedor de Banco Cloud  │ Neon Serverless Postgres (ou Supabase PG)   │
│ Camada ORM / Persistência│ Drizzle ORM + drizzle-kit                   │
│ Driver de Conexão Node   │ postgres.js ou pg com connection pooling    │
│ Sistema de Autenticação  │ Better Auth (com Organization & Bearer)     │
│ Isolamento Multi-Tenant  │ Repositories Tipados + organization_id SSOT │
│ Local Development        │ Docker Compose (PostgreSQL local limpo)     │
└──────────────────────────┴─────────────────────────────────────────────┘
```

### Justificativa da Combinação
1. **Drizzle ORM + PostgreSQL**:
   - Elimina o atrito de engines compilados e gera migrações em arquivos SQL simples e idempotentes que passam por revisão de código em PRs.
   - Fornece tipagem estrita de TypeScript em nível de coluna e tabela, integrando-se diretamente ao `packages/database`.
2. **Neon Serverless Postgres como Provedor Cloud Primário**:
   - Oferece *database branching* automatizável, permitindo criar um banco de dados idêntico para cada Pull Request ou ambiente de testes sem custo adicional em repouso.
   - Fornece connection pooling nativo de até 10.000 conexões via PgBouncer.
   - *Alternativa de Primeira Linha*: **Supabase Postgres** (caso a governança prefira um painel administrativo unificado com Supavisor).
3. **Better Auth para Identidade e Sessões**:
   - Mantém 100% dos dados de autenticação e sessões dentro das tabelas do nosso próprio banco PostgreSQL, sem expor dados de clientes a terceiros.
   - Resolve o suporte B2B multi-tenant no código TypeScript através do plugin de organizações oficial, contemplando múltiplos papéis (`OWNER`, `ADMIN`, `MANAGER`, `OPERATOR`, `VIEWER`) e convites.
   - Suporta perfeitamente a divisão entre `apps/web` (cookies HTTP-only) e `apps/api` (Bearer tokens validados).

---

## 18. Decisões Técnicas que Exigem Aprovação Humana Formal

Antes do início da implementação técnica (PROMPT-004B), os seguintes itens requerem manifestação e validação pelo operador humano:

1. **Aprovação do Motor e Provedor Gerenciado de Banco**:
   - Confirmar a escolha do **PostgreSQL** como motor relacional.
   - Escolher entre **Neon** (vantagem em branching para CI/CD) ou **Supabase Postgres** (vantagem em ecossistema integrado) como provedor de homologação/produção.
2. **Aprovação da Camada de Persistência**:
   - Confirmar a adoção do **Drizzle ORM** em substituição a Prisma ou Kysely.
3. **Aprovação da Solução de Autenticação**:
   - Confirmar a adoção de **Better Auth** (self-hosted, dados no banco) versus uma alternativa BaaS/SaaS como **Clerk** ou **Supabase Auth**.
4. **Definição dos Ambientes de Banco de Desenvolvimento Local**:
   - Aprovar o uso de contêiner local `docker-compose.yml` para desenvolvimento offline/testes de integração locais, mantendo o banco cloud restrito a staging e production.

---

## 19. Plano de Implementação Sugerido para a Fase 4B (Após Aprovação)

Uma vez aprovada a proposta, a execução no PROMPT-004B deverá seguir o fluxo estruturado:

1. **Setup em `packages/database`**:
   - Instalação controlada de dependências de runtime (`drizzle-orm`, `postgres` ou `pg`) e desenvolvimento (`drizzle-kit`).
   - Configuração de conexão com suporte a pooling e conexão direta para migrations.
2. **Modelagem de Schemas no Drizzle**:
   - Schemas de identidade e organização: `users`, `auth_identities`, `organizations`, `organization_memberships`, `platform_admin_authorizations`.
   - Schemas de governança comercial e billing: `plans`, `entitlements`, `subscriptions`, `commercial_grants`, `usage_records`.
   - Schemas centrais de negócio: `agents`, `agent_versions`, `calls`, `campaigns`, `contacts`.
3. **Geração e Validação da Primeira Migração**:
   - Geração de `0000_initial_schema.sql` via `drizzle-kit generate`.
   - Revisão manual de constraints, foreign keys e índices compostos por `organization_id`.
4. **Implementação de Repositories Tipados**:
   - Implementação das classes/funções de repositório em `packages/database` exigindo `organizationId` obrigatório em todas as consultas tenant-scoped.
5. **Setup da Camada de Autenticação**:
   - Instalação e configuração do Better Auth integrado às tabelas do banco.
   - Exposição dos endpoints de autenticação em `apps/web/src/app/api/auth/[...all]/route.ts`.
6. **Bateria de Testes Automatizados**:
   - Testes unitários e de integração validando as 7 Invariantes de Segurança e Multi-Tenancy.
   - Execução do pipeline completo `pnpm check`.

---

## 20. Declaração de Salvaguardas Cumpridas (DoD desta Fase)

- [x] Nenhuma dependência foi instalada no `package.json` ou `pnpm-lock.yaml`.
- [x] Nenhum projeto ou recurso em nuvem foi provisionado.
- [x] Nenhum arquivo `.env` com segredos reais foi criado.
- [x] Nenhuma alteração estrutural no código de produto de `apps/web` foi aplicada.
- [x] O MCP do Supabase não foi invocado para criar tabelas ou recursos.
- [x] Todas as informações de fornecedores e capacidades foram rigorosamente verificadas contra a documentação oficial recente.
- [x] O arquivo central de auditoria `docs/AI_WORKLOG.md` foi atualizado de forma append-only.
