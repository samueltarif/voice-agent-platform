# Agent Studio, API Boundary & Internal Auth Decision Gate (PHASE_5_AGENT_STUDIO_GATE.md)

> **Documento de Pesquisa e Proposta de Arquitetura — Fase 5**  
> **Data**: 23 de Setembro de 2026 (Revisão Final de Invariantes — PROMPT-005A-FINAL-CHECK)  
> **Status**: PROPOSED / HUMAN APPROVAL REQUIRED (Nenhuma decisão nova tratada como ACCEPTED sem aprovação humana explícita)

---

## 1. Current State (Estado Atual da Plataforma)

Ao término bem-sucedido das Fases 4B1 e 4B2:
- **Persistência Relacional**: PostgreSQL 16 (Drizzle ORM + Drizzle Kit) operando localmente em Docker Compose e validado em cloud gerenciada Neon Staging (`aws-sa-east-1` / São Paulo).
- **Modelo de Identidade e Sessão**: Better Auth integrado exclusivamente para `User`, `Session`, `Account` e `Verification`. O plugin `organization` do Better Auth permanece desabilitado (`DISABLED`).
- **Governança Multi-Tenant e Comercial**: Entidades `Organization`, `OrganizationMembership`, `TenantRole`, `PlatformAdminAuthorization`, `Plans`, `Entitlements`, `Subscriptions` e `CommercialGrants` pertencem 100% ao domínio da aplicação, com isolamento lógico rígido por `organizationId` e restrições de integridade referencial física (`ON DELETE RESTRICT`, restrições `CHECK`, índices parciais únicos).
- **Fronteira das Aplicações**: `apps/web` opera como UI e Backend-for-Frontend (BFF), consumindo Better Auth em route handlers; `apps/api` está estruturado como pacote esqueleto tipado com `@voice-agent/contracts`, `@voice-agent/errors` e `@voice-agent/logger`, sem framework HTTP ou endpoints implementados.
- **Topologia de Banco em Produção**: **NOT PROVISIONED** (Recurso de banco de produção não provisionado; topologia, capacidade e alta disponibilidade pendentes de desenho de produção).
- **Pendências Críticas**:
  1. *Internal Service Auth Mechanism*: Ainda `PENDING` (comunicação segura `apps/web` → `apps/api`).
  2. *Framework HTTP de `apps/api`*: Ainda `PENDING`.
  3. *Validation Schema Library*: Nenhuma biblioteca de schema validation instalada no monorepo (`PENDING`).
  4. *Ephemeral State / Filas*: Ainda `PENDING` (Redis/BullMQ).
  5. *Usage Persistence*: `DEFERRED` para fases de telefonia/áudio.

---

## 2. Scope of Phase 5 (Escopo e Objetivos da Fase 5)

A Fase 5 estabelece a camada de domínios base da plataforma B2B, com foco prioritário no **Agent Studio**:
- **Objetivo Central**: Permitir que empresas clientes criem, configurem, testem simulações, publiquem e versionem seus agentes de voz via interface web declarativa, **sem edição de código ou fine-tuning de modelos**.
- **O que ENTRA no escopo conceitual da Fase 5**:
  - Modelo de domínio do Agente (`Agent` e `AgentVersion`);
  - Ciclo de vida, versionamento monotônico e imutabilidade de versões publicadas;
  - Snapshot declarativo v1 com semântica genuína (Persona, Regras, Idioma/Locale);
  - Versionamento explícito do schema da configuração (`configuration_schema_version`);
  - Transação atômica de publicação e governança de quotas (`agents.max`) com serialização concorrente;
  - Matriz de autorização multi-tenant (RBAC) com proteção a configurações confidenciais;
  - Resolução da fronteira de confiança e autenticação interna assimétrica entre `apps/web` e `apps/api`;
  - Seleção da biblioteca de validação compartilhada (`packages/contracts`) e do framework HTTP de `apps/api`.
- **O que NÃO ENTRA no escopo da Fase 5 (Limites Estritos)**:
  - Motor de áudio/voz em tempo real (reservado para a Fase 6);
  - Provedor real de telefonia / DIDs / SIP trunking (reservado para a Fase 8);
  - Ingestão de embeddings vetoriais ou RAG complexo (reservado para a Fase 7);
  - Execução de tools externas contra APIs reais de terceiros (reservado para a Fase 7);
  - Execução de LLM Evals com provedores externos pagos (reservado para a Fase 9);
  - Campanhas de discagem massiva e gestão de contatos (subfases subsequentes da Fase 5).

---

## 3. Agent Aggregate (Identidade Estável do Agente)

Para garantir desacoplamento entre a entidade de negócio e suas alterações operacionais frequentes, o Agente é modelado pelo princípio de **Identidade Estável vs. Configuração Versionada**:

```
┌────────────────────────────────────────────────────────┐
│                   Agent (Aggregate Root)               │
│  - id: UUID (PK)                                       │
│  - organizationId: UUID (Tenant Scope, FK)             │
│  - name: string (Nome de exibição administrativo)      │
│  - slug: string (Identificador amigável único no tenant)│
│  - status: enum ('ACTIVE', 'ARCHIVED')                 │
│  - createdAt: Timestamp                                │
│  - updatedAt: Timestamp                                │
└───────────────────────────┬────────────────────────────┘
                            │ 1
                            │
                            │ N (Histórico Imutável)
                            ▼
┌────────────────────────────────────────────────────────┐
│                      AgentVersion                      │
│  - id: UUID (PK)                                       │
│  - agentId: UUID (FK Agent)                            │
│  - organizationId: UUID (Tenant Scope, FK)             │
│  - versionNumber: integer (Monotônico por Agent)       │
│  - status: enum ('DRAFT', 'PUBLISHED', 'ARCHIVED')     │
│  - configurationSchemaVersion: integer (NOT NULL)      │
│  - configuration: JSONB (Snapshot Validado por Schema) │
│  - changelog: string | null                            │
│  - createdBy: text (FK User)                           │
│  - publishedAt: Timestamp | null                       │
│  - publishedBy: text | null (FK User)                  │
│  - createdAt: Timestamp                                │
│  - updatedAt: Timestamp                                │
└────────────────────────────────────────────────────────┘
```

A entidade `Agent` **não armazena prompts, parâmetros de voz ou regras conversacionais**. Ela representa puramente a âncora relacional e comercial no tenant. Chamadas telefônicas futuras, campanhas e logs de auditoria sempre referenciarão `(agentId, agentVersionId)`.

---

## 4. Current Published Version: Fonte Única da Verdade

Para evitar **dual source of truth** entre status e ponteiros, adota-se estritamente a **Opção A**:
- A tabela `agents` **não terá coluna de ponteiro** (`current_published_version_id`).
- A versão publicada ativa é definida única e exclusivamente pela linha em `agent_versions` com `status = 'PUBLISHED'`.
- O banco de dados garante fisicamente que nunca existirá mais de uma versão publicada simultânea para o mesmo agente através de:
  ```sql
  CREATE UNIQUE INDEX unique_published_version_per_agent 
  ON agent_versions (agent_id) 
  WHERE status = 'PUBLISHED';
  ```
- **Vantagens Arquiteturais**: Elimina ciclos de Foreign Keys (`agents` ↔ `agent_versions`), elimina riscos de divergência entre status e ponteiro e simplifica transações de publicação.

---

## 5. Agent Version: Modelo Canônico e Numeração Monotônica

1. **Relação 1 -> N**: Cada `Agent` possui zero ou mais `AgentVersion`.
2. **Numeração Monotônica Sequencial**:
   - `versionNumber` é um inteiro estritamente crescente (1, 2, 3...) por `agentId`.
   - Constraint de unicidade no banco: `UNIQUE(agent_id, version_number)`.
3. **Prevenção de Race Conditions**:
   - O número da versão é gerado exclusivamente dentro de transação com lock pessimista na linha do agente:
     ```sql
     SELECT id FROM agents WHERE id = $1 FOR UPDATE;
     SELECT COALESCE(MAX(version_number), 0) + 1 FROM agent_versions WHERE agent_id = $1;
     ```
4. **Política de Single Active Draft**:
   - Cada agente pode possuir no máximo **um único `DRAFT` ativo por vez**.
   - Garantido por índice parcial único no banco:
     ```sql
     CREATE UNIQUE INDEX unique_active_draft_per_agent 
     ON agent_versions (agent_id) 
     WHERE status = 'DRAFT';
     ```

---

## 6. Descarte de Draft e Numeração Monotônica Não-Contígua

O modelo de *Single Active Draft* exige um mecanismo explícito para abandonar rascunhos indesejados antes da publicação:

### Regra de Descarte de Rascunho (Draft Discard):
Um registro de `AgentVersion` com `status = 'DRAFT'` pode sofrer **hard delete físico** (`DELETE FROM agent_versions WHERE id = :id`) **EXCLUSIVAMENTE QUANDO**:
1. `status = 'DRAFT'`;
2. Nunca foi promovido a `PUBLISHED` (`published_at IS NULL`);
3. Não possui referências externas (chamadas, execuções de teste persistidas);
4. O `organizationId` do tenant foi rigidamente validado;
5. A operação é autorizada para o papel do usuário (`ADMIN` / `OWNER`);
6. A ação de descarte é registrada em `audit_logs`.

### Consequência Canônica para `versionNumber`:
- O campo `versionNumber` é **estritamente monotônico crescente, mas NÃO necessariamente contíguo**.
- *Exemplo legítimo*: Se a versão 1 foi publicada, a versão 2 foi publicada, o draft da versão 3 foi descartado e um novo draft foi aberto, a próxima versão será a **4** (`1, 2, 4`).
- **Proibição**: É terminantemente proibido reutilizar o status `ARCHIVED` silenciosamente para representar "drafts nunca publicados". `ARCHIVED` representa exclusivamente versões que foram ativas em produção no passado.

---

## 7. Separação de Estados: Arquivamento e Reativação de Agentes

As máquinas de estado de `Agent` e `AgentVersion` são **completamente distintas e desacopladas**:

```
State Machine do Agente:           State Machine da Versão:
┌────────┐      ┌──────────┐       ┌───────┐      ┌───────────┐      ┌──────────┐
│ ACTIVE │ ───► │ ARCHIVED │       │ DRAFT │ ───► │ PUBLISHED │ ───► │ ARCHIVED │
└────────┘ ◄─── └──────────┘       └───────┘      └───────────┘      └──────────┘
```

### Operação de Arquivamento do Agente (`Agent.status -> ARCHIVED`):
1. O status do agente torna-se `ARCHIVED` (`agents.status = 'ARCHIVED'`);
2. **NÃO altera o status da `AgentVersion` com status `PUBLISHED`**: a versão permanece intacta como `PUBLISHED`, representando o último estado operacional publicado histórico;
3. O agente arquivado **não pode** receber novas chamadas telefônicas ou operações em tempo real;
4. O agente arquivado **não conta** para a cota de `agents.max`;
5. Tentativas de editar rascunhos ou publicar versões enquanto o agente está `ARCHIVED` **falham fechadas** com erro de domínio (`InvalidStateTransitionError`).

### Operação de Reativação do Agente (`Agent.status -> ACTIVE`):
1. **Validação de Cota em Transação**: Executada com lock de linha na organização para garantir que `count(ACTIVE agents) < entitlement(agents.max)`;
2. O status do agente retorna para `ACTIVE` (`agents.status = 'ACTIVE'`);
3. A versão com status `PUBLISHED` pré-existente (se houver) permanece imediatamente como versão ativa;
4. **Nenhuma versão nova é criada ou publicada implicitamente** pela reativação;
5. Se o agente nunca teve versão publicada antes do arquivamento, ele reativa como `ACTIVE` sem versão publicada, permitindo abrir um novo draft.

---

## 8. Lifecycle da Versão: Proposta de Supercessão Documental

Propõe-se formalmente substituir o ciclo histórico `DRAFT → TEST → PUBLISHED → ARCHIVED` por:

```
DRAFT ──────────────► PUBLISHED ──────────────► ARCHIVED
  │                       │
  ▼                       ▼
[Atividade de Teste]    [Atividade de Teste]
(Validação / Simulação) (Avaliação Contínua)
```

- **Justificativa**: `TEST` não é um estado da versão, mas uma atividade de execução pontual (`test run` / `validation_results`). Rascunhos em validação continuam sendo `DRAFT`.
- **Registro Formal**: Trata-se de uma **supercessão de ciclo de vida**. Os documentos canônicos (`docs/AGENT_STUDIO.md`, `FOUNDATION_MASTER.md`) serão atualizados somente após aprovação humana explícita. Entradas históricas do `AI_WORKLOG` permanecem imutáveis.

---

## 9. Imutabilidade de Versões Publicadas e Invariantes de Metadata

**Intended Domain Invariant**:
> Versões com status `PUBLISHED` são **completamente imutáveis**. Qualquer alteração exige abrir um novo `DRAFT`.

### Invariantes Estritas de Metadata para `AgentVersion`:
Como drafts abandonados sofrem hard delete e nunca transitam para `ARCHIVED`, toda versão `ARCHIVED` foi necessariamente publicada no passado. Portanto, as invariantes relacionais são:

1. **`status = 'DRAFT'`**:
   - `published_at IS NULL`
   - `published_by IS NULL`
2. **`status IN ('PUBLISHED', 'ARCHIVED')`**:
   - `published_at IS NOT NULL`
   - `published_by IS NOT NULL`

### Constraint Declarativa no PostgreSQL (Slice 005B):
```sql
ALTER TABLE agent_versions ADD CONSTRAINT check_published_metadata_consistency CHECK (
  (status = 'DRAFT' AND published_at IS NULL AND published_by IS NULL) OR
  (status IN ('PUBLISHED', 'ARCHIVED') AND published_at IS NOT NULL AND published_by IS NOT NULL)
);
```

---

## 10. Transação Atômica de Publicação

A publicação é serializada e atômica sob a mesma transação:

```
Passo 1: Lock Pessimista do Agente
  SELECT id FROM agents WHERE id = :agentId AND organization_id = :orgId FOR UPDATE;

Passo 2: Verificação do Draft Elegível
  SELECT * FROM agent_versions WHERE agent_id = :agentId AND status = 'DRAFT' FOR UPDATE;
  (Se ausente, aborta com 404/409)

Passo 3: Validação Estrita do Snapshot contra configurationSchemaVersion
  (Se schema inválido, aborta com 400)

Passo 4: Verificação Comercial de Regularidade
  (Garante tenant ativo e subscription regular)

Passo 5: Arquivamento da Versão Publicada Anterior
  UPDATE agent_versions 
  SET status = 'ARCHIVED', updated_at = NOW() 
  WHERE agent_id = :agentId AND status = 'PUBLISHED';

Passo 6: Promoção do Draft para PUBLISHED
  UPDATE agent_versions 
  SET status = 'PUBLISHED', published_at = NOW(), published_by = :userId, updated_at = NOW()
  WHERE id = :draftId;

Passo 7: Registro Auditável
  INSERT INTO audit_logs (organization_id, actor_id, action, resource_type, resource_id, metadata)
  VALUES (:orgId, :userId, 'agent.version_published', 'agent', :agentId, 
          json_build_object('versionId', :draftId, 'versionNumber', :versionNum));
```
*Se qualquer passo falhar, ocorre rollback integral automático.*

---

## 11. Configuration Schema Versioning Explícito

Para impedir que a evolução de schemas no código rotule silenciosamente configurações novas com versões legadas:
1. **Definição de DDL**:
   ```sql
   configuration_schema_version integer NOT NULL CHECK (configuration_schema_version > 0)
   ```
   **SEM `DEFAULT 1` implícito.**
2. **Imposição em Código**:
   - Todo comando de criação ou clonagem de draft no domínio deve fornecer explicitamente a versão do schema (`configurationSchemaVersion: 1`).
   - Omitir a versão gera erro de compilação em TypeScript e erro de validação de schema.
   - Snapshots históricos publicados **nunca são alterados retroativamente**.

---

## 12. Config Snapshot v1: Semântica Real e Eliminação de Fake References

O snapshot v1 do `AgentConfigurationSnapshot` conterá **exclusivamente propriedades com semântica real implementada**, sem campos fictícios ou não verificados:

```typescript
export interface AgentConfigurationSnapshotV1 {
  readonly persona: {
    readonly role: string;                  // Ex: "Assistente de Atendimento e Qualificação"
    readonly companyName: string;           // Nome da empresa representada
    readonly objective: string;             // Meta central da conversa
    readonly tone: 'FORMAL' | 'CASUAL' | 'EMPATHETIC' | 'OBJECTIVE';
    readonly greetingPhrase: string;       // Frase inicial de atendimento
    readonly closingPhrase: string;        // Frase padrão de encerramento
    readonly fallbackPhrase: string;       // Frase para não entendimento de áudio
  };
  readonly voice: {
    readonly languageCode: 'pt-BR' | 'en-US' | 'es-ES'; // Propriedade neutra real
  };
  readonly rules: {
    readonly conversational: readonly string[]; // Diretrizes de postura para o prompt
    readonly deterministic: {
      readonly maxDiscountPercent?: number;     // Exemplo de limite checado por código
      readonly operatingHours?: string;         // Janela de funcionamento
    };
  };
  readonly playbook?: {
    readonly stages: readonly {
      readonly name: string;
      readonly goal: string;
    }[];
  };
  readonly examples?: readonly {
    readonly customerInput: string;
    readonly idealAgentResponse: string;
  }[];
}
```

### Deferrals Explícitos no Snapshot v1:
- **`VoiceConfig` Avançado**: Parâmetros como `pitch`, `stability`, `speedRate`, `voiceProfileKey` são **`DEFERRED (FASE 6)`** até validação real de capacidades com provedores de voz.
- **`ToolPermissions`**: Sem execution registry em vigor, ferramentas são **`DEFERRED (FASE 7)`** (ausente ou `tools: []` vazio e não editável).
- **`Knowledge References`**: Sem entidades de Base de Conhecimento persistidas, referências a documentos são **`DEFERRED (FASE 7)`**.

---

## 13. Persistência: Híbrido Relacional + JSONB (Opção C)

- **Correção Técnica**: Clonagem de drafts é uma operação atômica única no banco cujo custo de I/O é proporcional ao tamanho do snapshot JSONB (não é O(1)).
- **Indexabilidade do JSONB**: Reconhece-se que o PostgreSQL indexa JSONB via GIN e índices de expressão. A rejeição da opção pura sem tabelas decorre da necessidade de governança multi-tenant declarativa e constraints de Foreign Key para auditoria.
- **Localização Canônica do Schema**: Residirá em **`packages/contracts`** (`@voice-agent/contracts`), totalmente agnóstico a Hono e Drizzle.

---

## 14. Validation Schema Library (`zod` em `packages/contracts`)

- **Necessidade no Slice 005B**: O Slice 005B exige validar o JSONB antes que a API (Slice 005C) exista.
- **Fronteira Arquitetural Estrita**:
  - `packages/contracts` depende de **`zod`** como validador neutro compartilhado;
  - `packages/contracts` **NÃO PODE DEPENDER** de Hono, Drizzle, Better Auth ou SDKs de terceiros;
  - `@hono/zod-openapi` residirá exclusivamente em `apps/api` no Slice 005C.
- **Status da Proposta**: **`VALIDATION SCHEMA LIBRARY (ZOD): PROPOSED / HUMAN APPROVAL REQUIRED`**.

---

## 15. Concorrência Transacional e Semântica de `agents.max`

### Semântica Canônica:
- `agents.max` mede a quantidade de Agentes agregados com `status = 'ACTIVE'`.
- Consumido em `Create Agent` e `Reactivate Agent`.
- `Publish Version` valida a regularidade da assinatura, mas **não consome cota adicional**.
- Histórico de versões e drafts não consome cota (`count(versions) != count(agents)`).

### Prevenção de Race Conditions no Slice 005B:
Para evitar que requisições concorrentes ultrapassem o limite de `agents.max`, a validação e a inserção/reativação devem ser serializadas por tenant no PostgreSQL:

```sql
BEGIN;
  -- Serializa operações concorrentes de criação/reativação para o mesmo tenant:
  SELECT id FROM organizations WHERE id = :orgId FOR UPDATE;
  
  -- Resolve o entitlement atual da organização:
  -- (consulta subscriptions/commercial_grants para agents.max)
  
  -- Conta agentes ativos sob o lock:
  SELECT count(*) FROM agents WHERE organization_id = :orgId AND status = 'ACTIVE';
  
  -- Se count >= limit: ROLLBACK com EntitlementExceededError
  
  -- Insere o novo agente ou reativa o agente existente:
  INSERT INTO agents (id, organization_id, name, slug, status) VALUES (...);
COMMIT;
```
*Zero necessidade de Redis ou distributed locks; o lock de linha na organização garante serialização física limpa no PostgreSQL.*

---

## 16. Proteção RBAC a Configurações Confidenciais

Refinamento da matriz de autorização para proteger prompts e regras sensíveis contra visualização acidental por papéis operacionais/visualizadores:

| Permissão | Propósito | OWNER | ADMIN | MANAGER | OPERATOR | VIEWER |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `agent.read` | Listar agentes, ver nome, slug, status, versão atual | ✅ | ✅ | ✅ | ✅ | ✅ |
| `agent.config.read` | Visualizar prompts sensíveis, regras e playbook | ✅ | ✅ | ✅ | ❌ | ❌ |
| `agent.create` | Criar novo Agente (consumindo `agents.max`) | ✅ | ✅ | ❌ | ❌ | ❌ |
| `agent.edit` | Modificar configurações do Draft ativo | ✅ | ✅ | ✅ | ❌ | ❌ |
| `agent.draft.discard`| Descartar rascunho ativo não publicado | ✅ | ✅ | ✅ | ❌ | ❌ |
| `agent.test` | Executar simulação de conversa em sandbox | ✅ | ✅ | ✅ | ✅ | ❌ |
| `agent.publish` | Promover Draft para versão publicada ativa | ✅ | ✅ | ❌ | ❌ | ❌ |
| `agent.archive` | Arquivar ou reativar agente | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## 17. Internal Service Auth: Modelo Assimétrico Unificado em Todos os Ambientes

### Unificação Estrita de Modelo:
- **Proibição de Fallback Simétrico**: Rejeita-se a proposta de "HMAC em dev e assimétrico em produção". **Dev, Staging e Produção utilizam o MESMO modelo criptográfico**: **Short-Lived Asymmetric Signed Service Assertion**.
- Apenas o material de chaves/configuração é segregado por ambiente.
- **Contenção de Blast Radius**: `apps/web` (BFF) detém a chave privada de assinatura. `apps/api` detém estritamente a chave pública de verificação. Uma API comprometida não pode forjar asserções.
- **Seleção de Algoritmo no Slice 005C**: O algoritmo concreto (`Ed25519`, `ES256`), biblioteca JWT e serialização de chaves serão avaliados e selecionados no Slice 005C via documentação atual e bibliotecas mantidas, sem criptografia proprietária.
- **Zero Segredos no Git**: Nenhuma chave privada será commitada.

### Replay Window e Limitações:
- `REPLAY WINDOW: BOUNDED BY ASSERTION EXPIRATION`: TTL curto (ex.: 30-60s) limita a janela de reutilização.
- `REPLAY PREVENTION: NOT IMPLEMENTED / REQUIRES ADDITIONAL MECHANISM`: Prevenção one-time estrita requer cache stateful de nonces (`PENDING EPHEMERAL INFRASTRUCTURE`).

---

## 18. HTTP Framework: Hono para Node 22/24

- Framework selecionado para proposta: **Hono com `@hono/node-server` e `@hono/zod-openapi`**.
- Runtime real da API: **Node.js 22/24** (portabilidade para Edge runtime não é requisito e permanece não verificada).
- Interface Swagger UI: Fornecida via middleware dedicado (`@hono/swagger-ui` ou `@scalar/hono-api-reference`).

---

## 19. Sequenciamento dos Slices da Fase 5

```
┌────────────────────────────────────────────────────────────────────────┐
│ PROMPT-005B: Domain Core & Database Persistence                        │
│ - Adicionar `zod` em `packages/contracts` para schemas de configuração │
│ - Schemas Drizzle: `agents` e `agent_versions` (PostgreSQL 16)         │
│ - Migration versionada incremental em `packages/database`              │
│ - Repositories tipados: AgentRepository, AgentVersionRepository        │
│ - Concorrência de `agents.max` com lock transacional na Organization   │
│ - Transação de publicação atômica e descarte seguro de rascunhos       │
│ - Testes unitários e de integração de persistência (100% isolados)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PROMPT-005C: API Framework, Internal Auth & /v1 Endpoints             │
│ - Instalação de Hono, `@hono/node-server`, `@hono/zod-openapi`         │
│ - Implementação da asserção assimétrica unificada (Web -> API)         │
│ - Endpoints REST /v1: list, get, create, edit-draft, discard, publish  │
│ - Testes de integração de API e rota OpenAPI (/v1/doc)                 │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PROMPT-005D: Frontend Agent Studio UI                                  │
│ - Telas do Agent Studio em `apps/web` (Dashboard B2B)                  │
│ - Visualização de metadados, editor de draft e publicação transacional │
│ - Design System unificado mobile-first / desktop                       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 20. Tabela Consolidada de Decisões Propostas (Proposed Decisions)

Todas as propostas abaixo são independentes e aguardam **aprovação humana explícita**:

| ID da Proposta | Dimensão Arquitetural | Proposta Técnica | Status |
| :--- | :--- | :--- | :--- |
| **PROP-005A-01** | **Agente Aggregate** | Identidade estável `Agent` desacoplada da configuração em `AgentVersion`. | **PROPOSED / HUMAN APPROVAL REQUIRED** |
| **PROP-005A-02** | **Fonte da Versão Publicada** | **Opção A**: Status `PUBLISHED` em `AgentVersion` com índice parcial único. Tabela `Agent` sem ponteiro redundante. | **PROPOSED / HUMAN APPROVAL REQUIRED** |
| **PROP-005A-03** | **Single Active Draft** | No máximo um draft por agente garantido por índice parcial único no banco. | **PROPOSED / HUMAN APPROVAL REQUIRED** |
| **PROP-005A-04** | **Supercessão de Ciclo de Vida**| Ciclo canônico `DRAFT → PUBLISHED → ARCHIVED` (`TEST` como atividade pontual). | **PROPOSED / HUMAN APPROVAL REQUIRED** |
| **PROP-005A-05** | **Descarte de Rascunhos** | Hard delete permitido exclusivamente para `DRAFT`s nunca publicados (gerando `versionNumber`s monotônicos não-contíguos). | **PROPOSED / HUMAN APPROVAL REQUIRED** |
| **PROP-005A-06** | **Arquivo / Reativação de Agente**| `Agent.status` e `AgentVersion.status` são desacoplados. Arquivamento não altera versão publicada. Reativação valida `agents.max`. | **PROPOSED / HUMAN APPROVAL REQUIRED** |
| **PROP-005A-07** | **Invariantes de Metadata** | Constraint CHECK impondo que `DRAFT` possui `published_* IS NULL` e `PUBLISHED`/`ARCHIVED` possuem `published_* IS NOT NULL`. | **PROPOSED / HUMAN APPROVAL REQUIRED** |
| **PROP-005A-08** | **Schema Versioning Explícito** | Coluna `configuration_schema_version integer NOT NULL CHECK (> 0)` sem default implícito. | **PROPOSED / HUMAN APPROVAL REQUIRED** |
| **PROP-005A-09** | **Snapshot v1 Realista** | Somente campos semânticos reais (Persona, Idioma, Regras). Tools, Voice avançado e Knowledge deferidos. | **PROPOSED / HUMAN APPROVAL REQUIRED** |
| **PROP-005A-10** | **Persistência Híbrida** | **Opção C**: Metadados relacionais indexáveis + snapshot JSONB tipado e validado. | **PROPOSED / HUMAN APPROVAL REQUIRED** |
| **PROP-005A-11** | **Validation Library** | Adoção de `zod` em `packages/contracts` como validador neutro compartilhado para 005B e 005C. | **PROPOSED / HUMAN APPROVAL REQUIRED** |
| **PROP-005A-12** | **Concorrência de `agents.max`**| Validação de cota e inserção/reativação serializadas por lock de linha na Organization (`FOR UPDATE`). | **PROPOSED / HUMAN APPROVAL REQUIRED** |
| **PROP-005A-13** | **Proteção Confidencial RBAC** | Separação entre `agent.read` (metadados) e `agent.config.read` (prompt/regras restrito a MANAGER+). | **PROPOSED / HUMAN APPROVAL REQUIRED** |
| **PROP-005A-14** | **Internal Service Auth** | Asserção assimétrica unificada em dev/staging/production (Web assina com chave privada, API verifica com pública). | **PROPOSED / HUMAN APPROVAL REQUIRED** |
| **PROP-005A-15** | **Framework HTTP de API** | Hono com `@hono/node-server` e `@hono/zod-openapi` para Node 22/24. | **PROPOSED / HUMAN APPROVAL REQUIRED** |
| **PROP-005A-16** | **Fatiamento em Slices** | Execução sequencial em 005B (Persistência), 005C (API/Auth) e 005D (Frontend UI). | **PROPOSED / HUMAN APPROVAL REQUIRED** |

---

## 21. Checklist para Aprovação Humana (Human Review Required)

- [ ] Aprova a eliminação do ponteiro duplicado `currentPublishedVersionId`, adotando a **Opção A** (Status em `AgentVersion` com índice parcial único como fonte única da verdade)?
- [ ] Aprova a **supercessão formal de ciclo de vida**, adotando `DRAFT → PUBLISHED → ARCHIVED` e tratando `TEST` como atividade pontual?
- [ ] Aprova a política de descarte de drafts nunca publicados com numeração monotônica não-contígua?
- [ ] Aprova a separação das state machines de `Agent.status` (ACTIVE/ARCHIVED) e `AgentVersion.status` (DRAFT/PUBLISHED/ARCHIVED)?
- [ ] Aprova a inclusão de `configuration_schema_version` sem default implícito?
- [ ] Aprova o snapshot v1 realista sem campos fictícios de tools ou knowledge?
- [ ] Aprova a serialização de concorrência de `agents.max` com lock de linha na organização?
- [ ] Aprova a adoção formal de `zod` em `packages/contracts` para validação de schema a partir do Slice 005B?
- [ ] Aprova a autenticação interna assimétrica unificada para dev, staging e production (seleção de algoritmo no 005C)?
- [ ] Aprova a escolha de Hono (`@hono/node-server` + `@hono/zod-openapi`) para `apps/api`?
- [ ] Autoriza o fatiamento e início do desenvolvimento no Slice 005B (`Domain Core & Database Persistence`)?
