# Diretrizes e Governança de Banco de Dados (DATABASE.md)

Este documento estabelece as regras estritas de modelagem, migração, acesso e governança de dados relacionais para o monorepo.

> **Revisado em**: 23 de Setembro de 2026 (PROMPT-004B2 — DEC-026 / DEC-027 / ADR-008)

---

## 1. Status de Seleção de Tecnologias

- **Motor de Banco Relacional**: **PostgreSQL 16** (selected stable major; Aprovado em DEC-026 / ADR-008. Local: Docker Compose `postgres:16-alpine`; Cloud Staging: Neon Serverless Postgres em `aws-sa-east-1` / São Paulo. **CLOUD PARITY VALIDATED FOR PERSISTENCE/AUTH FOUNDATION** — 23/09/2026).
- **Camada de Persistência / ORM**: **Drizzle ORM + drizzle-kit** (Aprovado em DEC-026 / ADR-008).
- **Provedor de Identidade e Sessão**: **Better Auth** (Aprovado em DEC-026; exclusivamente Identity + Session, plugin `organization` desabilitado).
- **Driver de Conexão**: **node-postgres (`pg`)** padrão agnóstico (sem lock-in a SDK proprietário).
- **Modelo de Conexão em Staging (Neon)**:
  - **Runtime da Aplicação**: Endpoint com pool de conexões gerenciado via PgBouncer em transaction mode (`-pooler`) associado a `DATABASE_URL` com TLS obrigatório (`sslmode=require`).
  - **Migrations / DDL Administrativo**: Endpoint direto sem pooler (`MIGRATION_DATABASE_URL`) exigido de forma *fail-closed* pelo comando de migração staging (`db:migrate:staging`).
  - *Nota de Precisão Arquitetural*: O uso de endpoint direto para migrations e pooled para runtime é diretriz e recomendação oficial do provedor (PgBouncer em transaction mode não preserva o estado de sessão requerido por runners de migration), diferenciando-se de uma restrição universal do engine PostgreSQL.


---

## 2. Princípios de Modelagem de Dados

### 2.1. Multi-Tenancy Nativo por Organização

O sistema adota multi-tenancy lógico. As seguintes regras se aplicam:

- Toda tabela que armazena dados pertencentes a clientes corporativos (entidades com escopo de tenant) deve conter obrigatoriamente a coluna `organization_id`.
- **Exceções legítimas**: Tabelas puramente globais (`platform_admin_authorizations`, `plans`), catálogos de sistema, metadados internos de infraestrutura e tabelas técnicas sem escopo de tenant **não possuem** `organization_id`. Essas exceções devem ser documentadas e justificadas.
- **Estratégia de Identificadores Internos (DEC-027)**:
  - Tabelas de autenticação (`user`, `session`, `account`, `verification`) utilizam string IDs gerados pela versão instalada do Better Auth (`text PRIMARY KEY`).
  - Chaves estrangeiras de domínio para o usuário (`userId`) utilizam estritamente o tipo físico compatível (`text`).
  - Chaves primárias de entidades de domínio (`organizations`, `organization_memberships`, `platform_admin_authorizations`, `plans`, `entitlements`, `subscriptions`, `commercial_grants`, `audit_logs`) utilizam o tipo PostgreSQL nativo `uuid` com geração padrão no banco via `defaultRandom()` (`gen_random_uuid()`) e geração app-side via `crypto.randomUUID()` nativo do Node.js, com zero dependências externas extras.
  - URLs amigáveis utilizam `slug` com índice único (`UNIQUE INDEX`).

### 2.1.1. Estratégia de Índices
- A inclusão de `organization_id` em índices compostos é fortemente recomendada para tabelas com escopo de tenant, pois melhora o isolamento de consultas e a performance de leituras por organização.
- A ordem e composição de índices deve ser definida com base nos **padrões reais de consulta** e validada por análise de query (EXPLAIN ANALYZE ou equivalente) — não há regra absoluta de que `organization_id` seja sempre o primeiro membro de todos os índices compostos.
- Exemplos orientativos (não mandatórios): `CREATE INDEX ON calls(organization_id, created_at DESC)` para listagens paginadas por tenant.

### 2.2. Integridade e Constraints
- Relacionamentos de domínio devem declarar foreign keys com ações seguras contra deleção acidental (`ON DELETE RESTRICT` como regra padrão em entidades de domínio, associações, auditoria e histórico comercial; `ON DELETE CASCADE` estritamente justificado e restrito a tabelas filhas subordinadas do framework de auth como `session` e `account`).
- Estados de domínio e papéis são estritamente fechados via tipos PostgreSQL `pgEnum` (`membership_status`, `organization_status`, `tenant_role`, `platform_admin_status`, `billing_mode`, `entitlement_value_type`, `plan_status`, `subscription_status`) e restrições físicas `CHECK` (ex.: integridade de tipo/valor de entitlements, grants com efeito obrigatório e período válido, preço não-negativo em planos e subscrições com término posterior ao início).
- Status de associação (`organization_memberships.status`) adota princípio de fail-closed: criação exige status explícito, sem default implícito de ativação.
- Autorização de Platform Admin global impõe índice parcial único (`UNIQUE INDEX ... WHERE status = 'ACTIVE'`) para garantir inexistência de múltiplas autorizações ativas ambíguas por usuário.
- Colunas financeiras e de custos devem utilizar tipos inteiros em centavos (`INTEGER`/`BIGINT price_cents`) ou decimais de precisão exata (`NUMERIC`/`DECIMAL`), nunca ponto flutuante (`FLOAT`/`DOUBLE`).

---

## 3. Checklist Obrigatório Antes de Criar Tabelas ou Colunas

Antes de propor ou implementar qualquer alteração em schema, o agente de IA DEVE obrigatoriamente inspecionar e documentar a análise dos seguintes itens:

1. **Schema Existente**: Verificar todas as tabelas e definições já vigentes.
2. **Histórico de Migrations**: Compreender a evolução do banco e decisões passadas.
3. **Repositories e Models/Types**: Analisar como as entidades já são representadas em código.
4. **Endpoints e Consumidores**: Mapear quais rotas e fluxos manipulam os dados correlacionados.
5. **Queries Existentes**: Verificar como as tabelas correlacionadas são consultadas.
6. **Foreign Keys e Constraints**: Evitar conflitos de chave ou integridade.
7. **Índices Existentes**: Evitar redundância de índices ou impacto severo em escritas.
8. **Derivação de Dados**: **A informação já existe ou pode ser calculada/derivada de colunas existentes?** Se sim, é proibido adicionar nova coluna duplicada sem justificativa de performance comprovada.

---

## 4. Política de Migrations Versionadas

1. **Zero DDL Manual em Produção**: É estritamente proibido rodar comandos SQL de criação/alteração (`ALTER TABLE`, `CREATE TABLE`, `DROP COLUMN`) diretamente no banco de produção.
2. **Migrations Sequenciais e Versionadas**: Toda mudança estrutural deve residir em um arquivo de migração versionado com numeração sequencial clara. O migration runner registra o histórico de execução em tabela de controle; transações podem fornecer atomicidade quando suportadas pelo banco e pelo comando executado, mas migrations **NÃO** são presumidas idempotentes.
3. **Padrão Expand and Contract para Alterações Incompatíveis**:
   O padrão Expand and Contract **deve ser utilizado** quando a alteração for incompatível, envolver rollout seguro ou exigir zero/baixo downtime:
   - **Fase 1 (Expand)**: Adicionar nova coluna/tabela sem remover a antiga; código passa a escrever em ambas.
   - **Fase 2 (Backfill)**: Popular dados históricos de forma assíncrona.
   - **Fase 3 (Contract)**: Código passa a ler exclusivamente da nova estrutura; em release posterior, remover a coluna obsoleta.
   Migrations triviais e compatíveis não precisam obrigatoriamente do padrão Expand and Contract.
4. **Bloqueio de Migrações Destrutivas Automáticas**: Qualquer comando de `DROP TABLE` ou `DROP COLUMN` deve passar por revisão e aprovação humana explícita.

---

## 5. Padrão de Camada de Persistência (Repositories)

- O código da aplicação (`apps/api`, `apps/worker`, `apps/voice`) **nunca** executa queries SQL inline no meio de regras de negócio.
- O acesso a dados ocorre unicamente através de classes ou funções de Repository tipadas localizadas em `packages/database`.
- Toda função de repositório deve exigir `organizationId` como parâmetro obrigatório para operações de leitura e escrita de dados com escopo de tenant, prevenindo vazamento de dados acidental.

---

## 6. Comandos Operacionais de Banco (packages/database)

- `pnpm --filter @voice-agent/database db:generate`: Gera novas migrations SQL versionadas a partir dos schemas TypeScript com Drizzle Kit.
- `pnpm --filter @voice-agent/database db:migrate`: Aplica migrations versionadas no banco de desenvolvimento ou teste.
- `pnpm --filter @voice-agent/database db:check`: Valida consistência de integridade dos schemas Drizzle.

