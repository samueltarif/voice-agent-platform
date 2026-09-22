# Pesquisa Arquitetural e Portão de Decisão — Fase 4: Persistência, Autenticação e Multi-Tenancy (PHASE_4_DECISION_GATE.md)

> **Status do Documento**: PROPOSED / HUMAN APPROVAL REQUIRED  
> **Data da Consulta / Pesquisa**: 22 de Setembro de 2026  
> **Origem da Demanda**: PROMPT-004A, PROMPT-004A-FIX & PROMPT-004A-CHECK — Fechamento do Decision Gate antes da Aprovação Humana  
> **Escopo**: Pesquisa comparativa, avaliação técnica precisa, matriz de decisão e proposta de stack para validação humana.  
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

Todas as tecnologias foram investigadas através de documentação oficial recente via **Context7 MCP** (com identificadores de biblioteca verificados) e documentação pública complementar consultada em **22 de Setembro de 2026**.

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
- A decisão de não adotar NoSQL no core da plataforma baseia-se na perfeita adequação do modelo relacional ao domínio de SaaS B2B corporativo, sem necessidade de generalizar genericamente sobre a capacidade de outros bancos.
- **Status**: `PROPOSED ENGINE: PostgreSQL`. *(A versão major exata será fixada no momento da seleção do provedor cloud para garantir que `local == staging == production`).*

---

## 4. Categoria 2 — Managed Database Provider

Comparação técnica entre fornecedores consolidados de PostgreSQL gerenciado:

### 4.1. Neon Serverless Postgres
- **Arquitetura**: Separação completa entre computação (stateless compute) e armazenamento distribuído (Neon storage).
- **Connection Pooling**: PgBouncer integrado via endpoints dedicados (`-pooler`). Suporta modo transação para conexões de aplicação e disponibiliza endpoint direto (unpooled) para ferramentas que dependam de semântica de sessão.
- **Database Branching (Copy-on-Write)**: Criação de branches do banco de dados (schema + dados) via API (`createBranch`), permitindo ambientes isolados de CI/CD para testar migrations em Pull Requests.
- **Autoscaling e Scale-to-Zero**: Nós de computação podem escalar e entrar em suspensão após período de inatividade em desenvolvimento.
- **Localização de Dados (Data Locality)**:
  - `PRIMARY DATABASE REGION / DATA LOCALITY`: São Paulo (`aws-sa-east-1`) disponível — **VERIFIED** (Fonte: `https://neon.tech/docs/introduction/regions`, consultado em 22/09/2026).
  - `BACKUP RESIDENCY`: **NOT VERIFIED** (depende de configuração de storage do provedor cloud subjacente).
  - `LOG/TELEMETRY RESIDENCY`: **NOT VERIFIED**.
  - `SUPPORT/PROCESSING RESIDENCY`: **NOT VERIFIED**.
  - `LGPD COMPLIANCE`: **NÃO INFERIDO DA REGIÃO. LEGAL/COMPLIANCE VERIFICATION REQUIRED BEFORE PRODUCTION**. A mera presença de datacenter no Brasil não atesta, isoladamente, conformidade jurídica com a LGPD.
- **Precificação e Limites (Status de Verificação)**:
  - *Free Tier*: US$ 0/mês — **VERIFIED** em `neon.tech/pricing`.
  - *Modelo Launch/Scale*: Baseado em consumo de computação e armazenamento — **VERIFIED** em `neon.tech/pricing`.
  - *Pausa / Scale-to-zero*: Recurso documentado; detalhes específicos de retenção e limites de conexões simultâneas sujeitos a termos de serviço atualizados da conta.
- **Pontos de Atenção**: Latência de cold start em ambientes com compute suspenso (em produção, o compute deve ser configurado como sempre ativo).

### 4.2. Supabase Postgres
- **Arquitetura**: PostgreSQL dedicado em contêiner gerenciado acompanhado do pooler **Supavisor**.
- **Connection Pooling**: Supavisor nativo operando na porta 6543 (modo transação para serverless/APIs) e na porta 5432 (modo sessão para migrations e ferramentas de DDL).
- **Extensões**: Suporte nativo completo a `pgvector`, `pgcrypto`, `uuid-ossp`, com interface gráfica administrativa.
- **Localização de Dados (Data Locality)**:
  - `PRIMARY DATABASE REGION / DATA LOCALITY`: São Paulo (`sa-east-1`) disponível — **VERIFIED** (Fonte: `https://supabase.com/docs/guides/platform/regions`, consultado em 22/09/2026).
  - `BACKUP RESIDENCY`: **NOT VERIFIED** (região primária confirmada para dados; replicação de backup requer confirmação contratual).
  - `LOG/TELEMETRY RESIDENCY`: **NOT VERIFIED**.
  - `SUPPORT/PROCESSING RESIDENCY`: **NOT VERIFIED**.
  - `LGPD COMPLIANCE`: **NÃO INFERIDO DA REGIÃO. LEGAL/COMPLIANCE VERIFICATION REQUIRED BEFORE PRODUCTION**.
- **Precificação e Limites (Status de Verificação)**:
  - *Free / Pro Plans*: Níveis de serviço e valores base documentados em `supabase.com/pricing` — **VERIFIED**.
  - *Pausa de Projetos*: Pausa de projetos inativos no plano gratuito documentada nas políticas de uso.
- **Pontos de Atenção**: O uso deve permanecer estritamente restrito ao PostgreSQL padrão para evitar acoplamento a SDKs proprietários.

### 4.3. Railway PostgreSQL
- **Arquitetura**: PostgreSQL em contêiner com suporte a clusters Patroni HA e PgBouncer.
- **Regiões Suportadas**: US West, US East, Europe West e Asia Southeast (Fonte: `docs.railway.com`, consultado em 22/09/2026). **NÃO possui região no Brasil/América do Sul**, gerando latência transcontinental para chamadas originadas no Brasil.
- **Status Geral**: Descartado como primeira opção devido à ausência de datacenter na América do Sul e ausência de branching nativo copy-on-write para testes de PR.

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
1. **Definição de Schemas em TypeScript Puro**: As tabelas são declaradas diretamente em código TypeScript estrito (`pgTable`), sem necessidade de DSL proprietária externa.
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

## 7. Better Auth vs. Domínio — Resolução de Fronteiras de Autorização

Conforme auditoria arquitetural, investigou-se a fundo o funcionamento do Better Auth para eliminar qualquer risco de *dual source of truth* entre a camada de autenticação e as entidades de negócio.

### 7.1. Análise Técnica
- O Better Auth possui um plugin opcional `organization` que cria tabelas internas (`organization`, `member`, `invitation`).
- O núcleo do Better Auth funciona de forma autônoma e completa **SEM** esse plugin, gerenciando exclusivamente **Identidade e Sessão** através dos modelos conceituais `User`, `Session`, `Account` e `Verification`.
- Ativar o plugin de organização geraria concorrência direta com as tabelas de negócio da plataforma, criando dual source of truth para organizações, membros e permissões.

### 7.2. Proposta Arquitetural
- **PROPOSTA RECOMENDADA — HUMAN APPROVAL REQUIRED (Option A)**:
  - **Better Auth utilizado EXCLUSIVAMENTE para Identidade e Sessão** (modelos conceituais `User`, `Session`, `Account`, `Verification`).
  - O plugin `organization` do Better Auth **NÃO É ATIVADO** (`DISABLED / NOT PART OF PROPOSAL`).
  - As entidades `Organization`, `OrganizationMembership`, `TenantRole`, `PlatformAdminAuthorization`, `Plan`, `Entitlements`, `CommercialGrant` e `Subscription` pertencem **100% ao domínio da aplicação**, implementadas via Drizzle ORM e Repositories tipados em `packages/database`.
  - **Separação Canônica**:
    - **Autenticação (Better Auth)**: Responde estritamente *"quem é o usuário"*.
    - **Autorização de Domínio (Aplicação)**: Responde estritamente *"o que o usuário pode fazer"*.
    - Se o provedor de autenticação for alterado no futuro, nenhuma regra de negócio ou autorização é impactada.

---

## 8. Modelo Conceitual de Identidade e Separação de Schemas

```
┌────────────────────────────────────────────────────────┐
│        AUTH MODELS (Owned by Better Auth Framework)    │
├──────────────────────────┬─────────────────────────────┤
│ User                     │ id, email, name, image, ... │
│ Session                  │ id, token, userId, expiresAt│
│ Account / AuthLink       │ vínculo com provider/auth;  │
│                          │ schema físico a verificar   │
│ Verification             │ id, identifier, value, ...  │
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

### 8.1. Modelos Conceituais vs. Schema Físico do Better Auth
- **PHYSICAL AUTH SCHEMA: TO BE VERIFIED FROM INSTALLED BETTER AUTH VERSION IN 004B**.
- Nomes físicos de tabela (`users`, `sessions`, `accounts`, `verifications` ou prefixos equivalentes) e suas tipagens exatas não devem ser congelados antecipadamente antes da instalação real da versão aprovada.
- No PROMPT-004B, o procedimento obrigatório será:
  1. Consultar documentação oficial da versão exata a instalar;
  2. Instalar a dependência e verificar a versão resolvida no `pnpm-lock.yaml`;
  3. Gerar o schema Drizzle oficial conforme a CLI/configuração da versão instalada;
  4. Definir as migrações físicas a partir dessa evidência concreta.

### 8.2. Account / AuthLink e Material de Credencial
- O conceito `Account / AuthLink` representa o vínculo entre o usuário e o mecanismo/provedor de autenticação (OAuth, credenciais locais, etc.), com campos físicos definidos pela versão que for efetivamente instalada do Better Auth.
- **`CREDENTIAL FIELD LAYOUT: TO BE VERIFIED FROM INSTALLED BETTER AUTH VERSION IN 004B`**.
- Passwords e seus respectivos hashes continuam sendo material confidencial gerenciado estritamente pela camada de autenticação, mas sem antecipar ou congelar uma tabela ou coluna física específica (como uma presumida coluna `Account.password`).
- O `User.id` gerado pelo framework de auth atua como chave estrangeira (`user_id`) para as tabelas de domínio. `providerUserId` permanece categoricamente **proibido** como chave universal de negócio.
- **Estratégia de Identificadores Internos**: **`INTERNAL ID STRATEGY: PENDING DECISION`**. (UUIDv7, CUID2 e Nanoid permanecem como candidatas a serem avaliadas na Fase 4B quanto a geração na aplicação vs banco e indexação B-Tree).

---

## 9. Papéis de Tenant (`OrganizationRole`) e Platform Admin

### 9.1. Papéis de Tenant
Como o plugin `organization` não é utilizado, os papéis residem inteiramente na tabela de domínio `organization_memberships(role)` como um enum rigoroso do PostgreSQL:
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

## 10. Fluxo de Autenticação e Trust Boundaries (Browser, Web e API)

```
[Browser] ──── (Cookie HttpOnly Seguro / SameSite=Lax) ────► [apps/web (BFF)]
                                                                   │
                         ┌─────────────────────────────────────────┴─────────────────────────────────────────┐
                         │ (Server-to-Server com Contexto Validado / Header Interno com OrgId + CorrelationId)│
                         ▼                                                                                   ▼
                    [apps/api] ◄────────────── (Internal Service Auth - PENDING) ────────────── [apps/worker / voice]
```

### 10.1. Trust Boundary entre `apps/web` e `apps/api`
- **Regra Fundamental de Segurança**: Headers de contexto como `X-User-Id` e `X-Organization-Id` **NÃO constituem prova autônoma de identidade ou autorização**.
- A `apps/api` **NÃO PODE CONFIAR** em valores arbitrários enviados por um cliente não autenticado.
- Headers de contexto só podem ser considerados confiáveis **após a autenticação e validação estrita da chamada server-to-server** na fronteira da API.
- O mecanismo concreto de autenticação interna entre processos permanece:
  **`INTERNAL SERVICE AUTH MECHANISM: PENDING DECISION`**.
  - Opções a avaliar na Fase 4B: revalidação de sessão, assertions internas assinadas (JWT interno), mTLS ou shared secret token com autorização explícita.
  - O fluxo não deve ser tratado como pronto até a definição desse mecanismo.
- `X-Correlation-Id` é estritamente **metadado de rastreabilidade distribuída**, não possuindo função de controle de acesso ou autorização.

### 10.2. Mitigação de Riscos de CSRF e Proteção de Sessões
- **Precisão Técnica sobre Cookies e CSRF**:
  - `HttpOnly`: Protege o cookie de sessão contra leitura direta por JavaScript (mitigação essencial contra roubo de tokens via XSS), mas **NÃO É um mecanismo de proteção contra CSRF**.
  - `SameSite=Lax` (ou `Strict`): Reduz significativamente a superfície de ataques CSRF para navegações cruzadas comuns, mas **não deve ser tratado como proteção universal ou infalível**.
  - Para mutações de estado e requisições HTTP críticas, a arquitetura futura deverá contemplar:
    1. Validação estrita de cabeçalhos `Origin` e `Host`;
    2. Política de `SameSite` apropriada;
    3. Proteção anti-CSRF dedicada (tokens CSRF / Double Submit Cookie / headers customizados) quando exigido pelo fluxo de autenticação;
    4. Restrição rigorosa de políticas de CORS;
    5. Uso de métodos de alteração de estado apropriados, como POST, PUT, PATCH e DELETE, conforme a semântica da operação.
- **Status**: `CSRF MITIGATION: PENDING IMPLEMENTATION / VALIDATE WITH AUTH FRAMEWORK IN 004B`.

---

## 11. Fronteiras de Acesso ao Banco de Dados

| Serviço / Processo | Papel Arquitetural | Acesso a Modelos de Auth | Acesso a Tabelas de Domínio |
| :--- | :--- | :--- | :--- |
| **`apps/web`** | Interface Web / BFF | **SIM** (via route handlers do Better Auth) | **NÃO** (acesso a dados de negócio ocorre exclusivamente via `apps/api`) |
| **`apps/api`** | Gateway HTTP e Core Business | **SIM** (leitura de sessões para validação) | **SIM** (boundary primário de persistência via Repositories) |
| **`apps/worker`** | Processamento Assíncrono | **NÃO** | **SIM** (via Repositories para jobs e consolidações) |
| **`apps/voice`** | Motor Realtime de Streaming | **NÃO** | **NÃO** no critical path (utiliza infraestrutura efêmera e publica eventos) |

- **Regra de Isolamento**: O acesso direto de `apps/web` a tabelas de domínio é **EXPRESSAMENTE PROIBIDO**. `apps/web` atua como BFF e consome regras de negócio exclusivamente através de endpoints autenticados de `apps/api`.

---

## 12. Infraestrutura Efêmera e Filas

- O gerenciamento de estado em tempo real, cache de sessões de chamadas e filas de eventos permanece neutro:
  **`EPHEMERAL STATE / ASYNC EVENT INFRASTRUCTURE: PENDING DECISION`**.

---

## 13. Governança e Semântica de Migrações Versionadas

- As migrações devem seguir as recomendações técnicas do driver e do provedor de banco selecionado.
- Conexões de sessão direta (unpooled / direct) são fortemente preferidas por ferramentas de migração que dependem de semântica de sessão do PostgreSQL (como advisory locks e comandos DDL).
- As migrações são sequenciais, versionadas no Git em `packages/database/migrations/*.sql` e aplicadas via pipeline automatizado de CI/CD.
- O migration runner deve registrar quais migrações já foram aplicadas (tabela de controle de histórico de migrações).
- Transações podem fornecer atomicidade quando suportadas pelo banco e pelo comando executado; porém, atomicidade NÃO torna uma migração idempotente.
- Nenhuma migração deve ser presumida idempotente; o comportamento exato de isolamento e execução depende do tooling efetivamente instalado e configurado.
- Alterações estruturais incompatíveis seguem o padrão *Expand and Contract*.

---

## 14. Classificação Realista de Lock-in Tecnológico

| Dimensão de Lock-in | Neon Postgres | Supabase Postgres | Better Auth | Drizzle ORM |
| :--- | :--- | :--- | :--- | :--- |
| **Data Model Portability** | **Alta**: PostgreSQL padrão; exportável via `pg_dump`. | **Alta**: PostgreSQL padrão; exportável via `pg_dump`. | **Alta**: Tabelas SQL padrão no banco da aplicação. | **Alta**: Schemas traduzem diretamente para DDL SQL padrão. |
| **Operational Lock-in** | **Médio**: APIs de branching e autoscaling criam acoplamento de pipeline CI/CD. | **Médio**: Pooler Supavisor e infraestrutura integrada criam convenções de deploy. | **Baixo**: Executado em Node.js como biblioteca na aplicação. | **Baixo**: Executa via CLI Node padrão sem dependência de nuvem. |
| **SDK / API Lock-in** | **Baixo**: Conexão via drivers padrão (`pg`, `postgres.js`), mas APIs e capacidades específicas do provedor (branching, autoscaling e automação operacional) continuam provider-specific. | **Baixo**: Se usado puramente como PostgreSQL via drivers padrão. | **Baixo**: APIs de auth desacopladas do core de domínio (Option A). | **Baixo**: Código de negócio isolado via Repositories em `packages/database`. |
| **Auth Schema Lock-in** | N/A | **Médio**: Identidades residem no schema interno `auth.users`. | **Baixo a Médio**: Modelos padrão SQL no próprio banco da aplicação. | N/A |

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

## 16. Escopo Delimitado da Fase 4B (Fundação Enxuta)

Para assegurar foco rigoroso e respeitar o sequenciamento do roadmap, as entidades de fases posteriores (`agents`, `agent_versions`, `calls`, `campaigns`, `contacts`) foram **removidas** do escopo da Fase 4B.

O PROMPT-004B implementará exclusivamente a **Fundação de Identidade, Tenant e Comercial**:
1. Schemas físicos gerados a partir da versão instalada do Better Auth (`User`, `Session`, `Account`, `Verification`);
2. Tabelas de organização de domínio: `organizations`, `organization_memberships`;
3. Tabelas de governança da plataforma: `platform_admin_authorizations`;
4. Tabelas do modelo comercial: `plans`, `entitlements`, `subscriptions`, `commercial_grants`;
5. Estrutura mínima de trilha de auditoria (`audit_logs`) necessária à governança de autorização;
6. Repositories tipados em `packages/database` com validação de `organizationId`;
7. Suíte de testes automatizados das 7 Invariantes de Segurança.

### 16.1. Tratamento do Módulo de Usage
- **`USAGE PERSISTENCE SCHEMA: DEFERRED UNTIL DOMAIN/USAGE REQUIREMENTS ARE CONCRETE`**.
- Nesta fase, apenas os conceitos, tipos contratuais neutros e interfaces de telemetria serão mantidos.
- Nenhuma tabela de usage detalhado ou particionamento declarativo antecipado será criado na Fase 4B.

---

## 17. Decisões Propostas Submetidas para Aprovação Humana

Submete-se formalmente para apreciação e aprovação humana o seguinte conjunto de decisões arquiteturais:

| Item de Decisão | Proposta Técnica Recomendada | Status |
| :--- | :--- | :--- |
| **ENGINE** | **PostgreSQL** (versão major alinhada ao provedor cloud) | PROPOSED / HUMAN APPROVAL REQUIRED |
| **MANAGED DB FIRST CANDIDATE** | **Neon** (branching para CI/CD, sa-east-1) | PROPOSED / HUMAN APPROVAL REQUIRED |
| **MANAGED DB ALTERNATIVE** | **Supabase Postgres** (ecossistema maduro, sa-east-1) | PROPOSED / HUMAN APPROVAL REQUIRED |
| **ORM** | **Drizzle ORM + drizzle-kit** | PROPOSED / HUMAN APPROVAL REQUIRED |
| **AUTH** | **Better Auth somente Identity + Session** | PROPOSED / HUMAN APPROVAL REQUIRED |
| **BETTER AUTH ORGANIZATION PLUGIN** | **DISABLED / NOT PART OF PROPOSAL** | PROPOSED / HUMAN APPROVAL REQUIRED |
| **TENANT AUTHORIZATION SOURCE OF TRUTH**| **Application Domain** (Repositories tipados) | PROPOSED / HUMAN APPROVAL REQUIRED |
| **PLATFORM ADMIN** | **Global domain authorization, separate from tenant roles** | PROPOSED / HUMAN APPROVAL REQUIRED |
| **WEB ARCHITECTURE** | **apps/web as UI/BFF; apps/api as business/persistence boundary** | PROPOSED / HUMAN APPROVAL REQUIRED |
| **LOCAL DEVELOPMENT** | **Docker Compose PostgreSQL**, subject to human environment availability | PROPOSED / HUMAN APPROVAL REQUIRED |
| **ROW LEVEL SECURITY (RLS)** | **Incremental defense-in-depth candidate**, not primary mechanism | PROPOSED / HUMAN APPROVAL REQUIRED |
| **INTERNAL SERVICE AUTH** | **PENDING DECISION** | PENDING |
| **EPHEMERAL/QUEUE INFRASTRUCTURE** | **PENDING DECISION** | PENDING |
| **INTERNAL ID STRATEGY** | **PENDING DECISION** | PENDING |
| **USAGE SCHEMA** | **DEFERRED** | DEFERRED |

*Nenhum item possui status Accepted até a manifestação formal do operador humano.*
