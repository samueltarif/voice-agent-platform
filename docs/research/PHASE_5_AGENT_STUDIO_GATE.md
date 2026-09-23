# Agent Studio, API Boundary & Internal Auth Decision Gate (PHASE_5_AGENT_STUDIO_GATE.md)

> **Documento de Pesquisa e Proposta de Arquitetura — Fase 5**  
> **Data**: 23 de Setembro de 2026 (Revisão de Precisão — PROMPT-005A-FIX)  
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
  - Snapshot declarativo de configuração (Persona, Regras de Negócio, Voz neutra, Playbook, Permissões de Ferramentas, Exemplos);
  - Versionamento explícito do schema da configuração (`configurationSchemaVersion`);
  - Transação atômica de publicação e governança de quotas (`agents.max`);
  - Matriz de autorização multi-tenant (RBAC) com proteção a configurações confidenciais;
  - Resolução da fronteira de confiança e autenticação interna `apps/web` → `apps/api`;
  - Seleção da biblioteca de validação compartilhada (`packages/contracts`) e do framework HTTP de `apps/api`.
- **O que NÃO ENTRA no escopo da Fase 5 (Limites Estritos)**:
  - Motor de áudio/voz em tempo real (reservado para a Fase 6);
  - Provedor real de telefonia / DIDs / SIP trunking (reservado para a Fase 8);
  - Ingestão de embeddings vetoriais ou RAG complexo (reservado para a Fase 7);
  - Execução de tools externas contra APIs reais de terceiros (apenas allowlist/permissões neutras nesta fase);
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
│  - configurationSchemaVersion: integer (Ex: 1)         │
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

## 4. Current Published Version: Análise da Fonte Única da Verdade

A proposição inicial continha ambiguidade ao sugerir simultaneamente `Agent.currentPublishedVersionId` e `AgentVersion.status = 'PUBLISHED'`. Para evitar **dual source of truth**, foram comparadas duas alternativas arquiteturais:

### Comparação de Alternativas

| Critério | Opção A: Status em `AgentVersion` é Canônico (Recomendada) | Opção B: Pointer `Agent.currentPublishedVersionId` é Canônico |
| :--- | :--- | :--- |
| **Mecanismo Central** | Índice parcial único no banco: `UNIQUE(agent_id) WHERE status = 'PUBLISHED'`. | Coluna `current_published_version_id` na tabela `agents`. |
| **Integridade Relacional** | **Sem ciclo de FKs**. `AgentVersion` referencia `Agent`. A tabela `Agent` não depende de versões para ser criada. | **Dependência circular de Foreign Keys**: `Agent` referencia `AgentVersion`, que referencia `Agent`. Exige FK nullable e ordenação complexa de criação. |
| **Risco de Incoerência** | **Zero**. Impossível haver divergência entre o status da versão e o ponteiro do agente, pois só existe um local de verdade. | **Alto risco de divergência**: o ponteiro pode apontar para a versão X enquanto a versão Y está marcada como `PUBLISHED`, a menos que mantido por triggers complexos. |
| **Complexidade de Publicação** | Transação simples de mutação de status em `agent_versions`. | Exige atualizar o status da versão anterior, da nova versão E atualizar a coluna na tabela `agents`. |
| **Consulta da Versão Ativa** | `SELECT * FROM agent_versions WHERE agent_id = $1 AND status = 'PUBLISHED';` (instantâneo via índice parcial). | `SELECT * FROM agents a JOIN agent_versions v ON a.current_published_version_id = v.id`. |

### Recomendação Formal: **Opção A (Status em `AgentVersion` é a Fonte Única da Verdade)**
- A tabela `agents` **não terá** a coluna `current_published_version_id`.
- A versão publicada ativa é definida única e exclusivamente pela linha em `agent_versions` com `status = 'PUBLISHED'`.
- O banco de dados garante fisicamente que nunca existirá mais de uma versão publicada simultânea para o mesmo agente através de:
  ```sql
  CREATE UNIQUE INDEX unique_published_version_per_agent 
  ON agent_versions (agent_id) 
  WHERE status = 'PUBLISHED';
  ```

---

## 5. Agent Version: Modelo Canônico e Numeração Monotônica

1. **Relação 1 -> N**: Cada `Agent` possui zero ou mais `AgentVersion`.
2. **Numeração Monotônica Sequencial**:
   - `versionNumber` é um inteiro estritamente crescente (1, 2, 3...) por `agentId`.
   - Garantido por constraint de unicidade no banco: `UNIQUE(agent_id, version_number)`.
3. **Prevenção de Race Conditions na Geração**:
   - O número da versão é gerado exclusivamente dentro de transação de banco com lock pessimista na linha do agente:
     ```sql
     SELECT id FROM agents WHERE id = $1 FOR UPDATE;
     SELECT COALESCE(MAX(version_number), 0) + 1 FROM agent_versions WHERE agent_id = $1;
     ```
4. **Política de Drafts (Single Active Draft)**:
   - Cada agente pode possuir no máximo **um único `DRAFT` ativo por vez**.
   - Garantido por índice parcial único no banco:
     ```sql
     CREATE UNIQUE INDEX unique_active_draft_per_agent 
     ON agent_versions (agent_id) 
     WHERE status = 'DRAFT';
     ```
   - Operação: Se o operador desejar alterar a configuração de um agente publicado, o sistema gera um novo registro em `agent_versions` com `status = 'DRAFT'`, copiando o snapshot da versão publicada atual.

---

## 6. Lifecycle da Versão: Proposta de Supercessão Documental

Os documentos históricos de concepção (`docs/AGENT_STUDIO.md`, `FOUNDATION_MASTER.md`) mencionavam o fluxo:
`DRAFT → TEST → PUBLISHED → ARCHIVED`.

### Proposta de Supercessão do Ciclo de Vida:
Propõe-se formalmente substituir esse modelo pela segregação clara entre **Status da Versão** e **Execução de Testes**:

```
DRAFT ──────────────► PUBLISHED ──────────────► ARCHIVED
  │                       │
  ▼                       ▼
[Atividade de Teste]    [Atividade de Teste]
(Validação / Simulação) (Avaliação Contínua)
```

1. **Por que eliminar `TEST` como status de versão?**
   - Evita versões zumbis "presas em teste" que bloqueiam a criação de novos drafts;
   - Uma versão em validação continua sendo conceitualmente um rascunho (`DRAFT`);
   - Testes geram relatórios e execuções pontuais (`validation_results`), não alterações estruturais no ciclo de vida da versão;
   - Mantém a máquina de estados estritamente unidirecional e previsível: `DRAFT → PUBLISHED → ARCHIVED`.
2. **Impacto Documental**: Esta proposta representa uma **supercessão formal de ciclo de vida**. Se aprovada pelo operador humano, os documentos canônicos do produto serão atualizados correspondentemente. Entradas históricas do `AI_WORKLOG` permanecem imutáveis.

---

## 7. Imutabilidade de Versões Publicadas

**Intended Domain Invariant**:
> Uma vez que uma `AgentVersion` é promovida para `PUBLISHED`, seu conteúdo torna-se **completamente imutável**.

- **Precisão Arquitetural**: Esta garantia não nasce "automaticamente" apenas por declaração; ela exige imposição programática deliberada.
- **Mecanismos de Imposição no Slice 005B**:
  1. *Repository Guard*: Todas as operações de mutação de configuração no repositório (`updateDraftConfig`) devem conter filtro obrigatório de estado (`WHERE id = :id AND status = 'DRAFT'`).
  2. *Rejeição de Estado Inválido*: Qualquer tentativa de update em versão com `status != 'DRAFT'` dispara erro de domínio determinístico (`InvalidStateTransitionError`).
  3. *Triggers de Banco (Avaliação Futura)*: Caso se deseje imposição estrita no nível de DDL/PostgreSQL (`DATABASE-ENFORCED`), triggers `BEFORE UPDATE` bloqueando alterações em colunas de configuração quando `status IN ('PUBLISHED', 'ARCHIVED')` poderão ser avaliados no PR correspondente.

---

## 8. Transação Atômica de Publicação e Tratamento de Concorrência

A publicação é uma operação transacional atômica no banco de dados:

```
Passo 1: Lock Pessimista do Agente
  SELECT id FROM agents WHERE id = :agentId AND organization_id = :orgId FOR UPDATE;

Passo 2: Verificação do Draft Elegível
  SELECT * FROM agent_versions WHERE agent_id = :agentId AND status = 'DRAFT' FOR UPDATE;
  (Se não houver draft ativo, aborta com 404/409)

Passo 3: Validação Estrita do Snapshot
  Validar a árvore JSONB contra o schema correspondente a configurationSchemaVersion.

Passo 4: Verificação Comercial de Status
  Verificar se a organização possui assinatura ativa e direito de operação. (Nota: agents.max já foi consumido na criação).

Passo 5: Arquivamento da Versão Publicada Anterior
  UPDATE agent_versions 
  SET status = 'ARCHIVED', updated_at = NOW() 
  WHERE agent_id = :agentId AND status = 'PUBLISHED';

Passo 6: Promoção do Draft para PUBLISHED
  UPDATE agent_versions 
  SET status = 'PUBLISHED', published_at = NOW(), published_by = :userId, updated_at = NOW()
  WHERE id = :draftId;

Passo 7: Registro em Audit Log
  INSERT INTO audit_logs (organization_id, actor_id, action, resource_type, resource_id, metadata)
  VALUES (:orgId, :userId, 'agent.version_published', 'agent', :agentId, 
          json_build_object('versionId', :draftId, 'versionNumber', :versionNum));
```

---

## 9. Configuration Schema Versioning (Evolução sem Mutação Histórica)

Para evitar que a evolução de features da plataforma quebre snapshots publicados no passado:
1. **Identificador de Versão de Schema**: Cada `AgentVersion` inclui a coluna relacional `configurationSchemaVersion integer NOT NULL DEFAULT 1`.
2. **Governança de Evolução**:
   - Todo snapshot JSONB é validado estritamente conforme as regras do seu respectivo `configurationSchemaVersion`;
   - O runtime de voz deve manter suporte retrocompatível a versões ativas em produção;
   - **Snapshots históricos publicados NUNCA são alterados retroativamente** por scripts de migração de schema da aplicação;
   - A adoção de novas capacidades pelo cliente ocorre mediante criação de um novo `DRAFT`, que migra a estrutura para o schema mais recente.

---

## 10. Persistência: Relacional vs JSONB (Correções Técnicas de Complexidade e Indexação)

### Retificação de Claims Técnicos Anteriores:
- **Complexidade de Clonagem**: A clonagem de um draft a partir de uma versão publicada **não é matematicamente O(1)**. Trata-se de uma operação SQL atômica única (`INSERT INTO ... SELECT configuration ...`), cujo custo de I/O é proporcional ao tamanho do snapshot copiado.
- **Indexabilidade de JSONB**: É incorreto afirmar que JSONB "é impossível de indexar". O PostgreSQL suporta expressamente índices GIN (`jsonb_ops`, `jsonb_path_ops`), índices funcionais/expressão e operadores de contenção (`@>`).

### Justificativa Real para a Opção C (Híbrida):
A rejeição da Opção B (JSONB puro para toda a entidade) não decorre de incapacidade de indexação, mas de:
1. Menor clareza e perda de garantias declarativas de integridade relacional;
2. Ausência de constraints de Foreign Key nativas para auditoria (`createdBy`, `publishedBy`, `organizationId`);
3. Dependência excessiva de validações em código de aplicação para integridade referencial;
4. Desalinhamento com os padrões de listagem e filtragem multi-tenant da plataforma.

A **Opção C (Metadados Relacionais + Configuração em JSONB com Schema Versioning)** permanece como recomendação técnica ideal.

---

## 11. "Typed JSONB" e Localização Canônica do Schema

- **Precisão Conceitual**: No PostgreSQL, a coluna `configuration` é fisicamente `JSONB` (binário não tipado pelo engine).
- **De Onde Vem a Segurança de Tipos?**
  1. Validação determinística de runtime por schema library antes de qualquer persistência;
  2. Tipagem estática inferida em TypeScript;
  3. Versionamento estrutural via `configurationSchemaVersion`;
  4. Constraints relacionais para metadados de ciclo de vida;
  5. Testes unitários de serialização/desserialização.
- **Localização Canônica do Schema**:
  - O schema canônico da configuração do agente residirá em **`packages/contracts`** (`@voice-agent/contracts`).
  - `packages/contracts` é um pacote neutro, livre de dependências de framework web (sem Hono) e de banco (sem Drizzle).
  - Ele exportará o schema de validação, os tipos inferidos TypeScript (`AgentConfigurationSnapshot`) e os contratos reutilizáveis pela API e pelo BFF.

---

## 12. Estratégia de Validação Compartilhada (Zod em `packages/contracts`)

Como o slice 005B (Persistência) precisa validar o JSONB antes que a API (slice 005C) exista, a biblioteca de validação deve ser definida e aprovada neste gate:

### Proposta: Adoção de `zod` em `packages/contracts`
- **Motivo**: `zod` é o ecossistema padrão da indústria TypeScript para validação de runtime com inferência de tipos (`z.infer`).
- **Integração Futura no Slice 005C**: O framework HTTP Hono integra nativamente com Zod através de `@hono/zod-openapi`, permitindo que os schemas de `packages/contracts` sejam consumidos diretamente nas rotas da API sem duplicação de definições.
- **Status da Proposta**: **`VALIDATION SCHEMA LIBRARY (ZOD): PROPOSED / HUMAN APPROVAL REQUIRED`** (Nenhum pacote instalado nesta fase).

---

## 13. Configuration Ownership Matrix (Classificação Rigorosa)

| Componente | Classificação Arquitetural | Onde Reside | Justificativa |
| :--- | :--- | :--- | :--- |
| **Persona / Identidade** | **VERSIONED PERSISTED CONFIG** | `AgentVersion.configuration.persona` | Define papel, tom, estilo e comportamento base da versão. |
| **Business Rules (Conversacionais)** | **VERSIONED PERSISTED CONFIG** | `AgentVersion.configuration.rules.conversational` | Instruções de tom e postura que orientam o LLM. |
| **Business Rules (Determinísticas)** | **VERSIONED PERSISTED CONFIG** | `AgentVersion.configuration.rules.deterministic` | Restrições estruturadas (ex.: limites de desconto, horários) validadas por código. |
| **VoiceConfig** | **VERSIONED PERSISTED CONFIG (Mínimo Neutro)** | `AgentVersion.configuration.voice` | Parâmetros genuinamente neutros da versão. |
| **Playbook** | **VERSIONED PERSISTED CONFIG** | `AgentVersion.configuration.playbook` | Fases conversacionais, gatilhos de transbordo e desfechos. |
| **ToolPermissions** | **VERSIONED PERSISTED CONTRACT (Placeholder)** | `AgentVersion.configuration.tools` | Allowlist de capabilities (sem execução real na Fase 5). |
| **ConversationExamples** | **VERSIONED PERSISTED CONFIG** | `AgentVersion.configuration.examples` | Diálogos de calibração que compõem o contexto da versão. |
| **Knowledge (Estruturado)** | **REFERENCE TO DOMAIN RESOURCE** | `AgentVersion.configuration.knowledge` | Referências a IDs de catálogo determinístico. |
| **Knowledge (Não Estruturado)** | **DEFERRED (Fase 7)** | Fora do escopo da Fase 5 | Ingestão e documentos pertencem à Fase 7. |
| **RuntimeContext** | **RUNTIME-ONLY CONTEXT** | Memória Efêmera / Payload de Chamada | Telemetria, áudio em buffer, estado da chamada telefônica ativa. |
| **Usage & Costs** | **DEFERRED DOMAIN** | Tabelas de Faturamento / Usage | Registrado exclusivamente após o término da chamada. |

---

## 14. Persona / Agent Config (Campos Semânticos)

A Persona estrutura as diretrizes de apresentação do agente:
```typescript
export interface AgentPersonaConfig {
  readonly role: string;                  // Ex: "Assistente de Atendimento e Qualificação"
  readonly companyName: string;           // Nome da empresa representada
  readonly objective: string;             // Meta central da chamada
  readonly tone: 'FORMAL' | 'CASUAL' | 'EMPATHETIC' | 'OBJECTIVE';
  readonly language: 'pt-BR' | 'en-US' | 'es-ES';
  readonly greetingPhrase: string;       // Frase inicial de identificação
  readonly closingPhrase: string;        // Frase padrão de encerramento
  readonly fallbackPhrase: string;       // Frase ao não compreender o áudio
}
```

---

## 15. Business Rules (Conversacionais vs Determinísticas)

- **Regras Conversacionais**: Diretrizes de estilo injetadas no prompt do modelo de linguagem (*"Seja paciente ao explicar dados cadastrais"*).
- **Regras Determinísticas**: Parâmetros estruturados avaliados estritamente por código determinístico (*"Desconto comercial máximo de 15%"*, *"Horário de operação: 08:00 às 18:00"*). O LLM **nunca** é a fonte da verdade para limites comerciais ou fiscais.

---

## 16. Voice Config (Eliminação de Pseudo-Portabilidade)

A análise crítica da revisão externa apontou que parâmetros numéricos como `stability: 0.0 - 1.0`, `pitch: -2.0 - 2.0` e `providerHint` não possuem semântica universal entre provedores distintos (OpenAI vs ElevenLabs vs Deepgram).

### Decisão para a Fase 5:
- O domínio no Slice 005B conterá apenas propriedades genuinamente universais e neutras:
  ```typescript
  export interface AgentVoiceConfig {
    readonly languageCode: 'pt-BR' | 'en-US' | 'es-ES';
    readonly voiceProfileKey: string; // Ex: "platform-standard-female-1" (identificador neutro interno)
  }
  ```
- Parâmetros avançados de síntese (pitch, stability, speed multiplier, latency tradeoffs) são classificados como:
  **`PENDING PROVIDER CAPABILITY VALIDATION (FASE 6)`**.

---

## 17. Knowledge Boundary (Tratamento Rigoroso na Fase 5)

- Como o subsistema de Base de Conhecimento e RAG é escopo da **Fase 7**, a Fase 5 **não aceitará arrays arbitrários de IDs de documentos (`documentIds: string[]`)**, pois tais entidades ainda não existem no banco de dados.
- No schema inicial da Fase 5, referências a documentos não estruturados permanecem como campo reservado estritamente vazio/opcional ou **`DEFERRED`** para a modelagem da Fase 7.

---

## 18. Tool Permissions (Registry Neutro e Deferral de Execução Real)

- Na Fase 5, nenhuma ferramenta real é executada.
- Não serão permitidos filtros livres arbitrários do tipo `Record<string, unknown>`.
- O schema da versão conterá apenas uma allowlist tipada de capabilities neutras aprovadas (ex.: `toolKeys: string[]`), funcionando como placeholder para a futura conexão com o registro formal de ferramentas na Fase 7.

---

## 19. Conversation Examples (Calibração In-Context)

- Exemplos de conversa consistem em pares de diálogos para orientar a abordagem conversacional do modelo (*few-shot learning*).
- Não geram fine-tuning nem mutação de modelos.

---

## 20. Feedback / Auto-Learning (Revisão Supervisionada Obrigatória)

- É expressamente proibido qualquer mecanismo automático de mutação de agentes publicado a partir de feedbacks ou avaliações.
- Toda evolução exige criação de novo `DRAFT`, revisão humana e aprovação transacional de publicação.

---

## 21. Evals Boundary (Validação Estática vs LLM Evals)

- A Fase 5 implementa apenas a **validação estática e determinística** de completude do rascunho antes da publicação.
- Frameworks de LLM Evals com juiz automatizado e testes com modelos pagos permanecem **`PENDING (FASE 9)`**.

---

## 22. Entitlements e Semântica de `agents.max`

Para eliminar ambiguidades sobre quando a cota comercial é consumida:

### Definição Canônica:
- **`agents.max` mede estritamente a quantidade de Agentes agregados com `status = 'ACTIVE'` na organização.**
- **Momento do Consumo**:
  - `Create Agent`: Valida se `count(ACTIVE agents) < entitlement(agents.max)`. Consome 1 cota.
  - `Reactivate Agent`: Valida se reativar um agente arquivado cabe no limite.
- **Momento da Publicação**:
  - `Publish Version`: Valida se o tenant possui status comercial regular, mas **NÃO consome cota adicional de `agents.max`**.
- **Independência de Versões**: Criar rascunhos, editar rascunhos ou manter histórico de 10 versões publicadas no passado para o mesmo agente **não consome cota de `agents.max`** (número de versões != número de agentes).

---

## 23. Tenant Authorization Matrix & Proteção de Configurações Confidenciais

A revisão externa apontou risco de vazamento ao permitir que papéis com permissão básica de leitura (`VIEWER`) acessassem prompts e regras confidenciais do tenant. A matriz de autorização é refinada separando leitura de metadados de leitura de configuração:

| Permissão | Propósito | OWNER | ADMIN | MANAGER | OPERATOR | VIEWER |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `agent.read` | Listar agentes, ver nome, slug, status, versão atual | ✅ | ✅ | ✅ | ✅ | ✅ |
| `agent.config.read` | Visualizar prompts sensíveis, regras e playbook | ✅ | ✅ | ✅ | ❌ | ❌ |
| `agent.create` | Criar novo Agente (consumindo `agents.max`) | ✅ | ✅ | ❌ | ❌ | ❌ |
| `agent.edit` | Modificar configurações do Draft ativo | ✅ | ✅ | ✅ | ❌ | ❌ |
| `agent.test` | Executar simulação de conversa em sandbox | ✅ | ✅ | ✅ | ✅ | ❌ |
| `agent.publish` | Promover Draft para versão publicada ativa | ✅ | ✅ | ❌ | ❌ | ❌ |
| `agent.archive` | Arquivar ou reativar agente | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## 24. Delete Policy (Soft Archive e Proibição de Hard Delete)

- **Proibição de Hard Delete**: Versões de agentes referenciadas por chamadas históricas ou audit logs **nunca sofrem `DELETE` físico**.
- **Arquivamento**: A desativação de um agente ocorre via `status = 'ARCHIVED'`. Versões históricas arquivadas permanecem imutáveis para garantir auditoria, reprodução e conformidade legal.

---

## 25. Eventos de Domínio e Modelo de Entrega

- Eventos como `agent.created`, `agent.draft_updated`, `agent.version_published` são definidos como **`DOMAIN EVENT CONTRACTS / PLANNED`**.
- Como a infraestrutura de mensageria assíncrona (Redis/BullMQ) continua `PENDING`, **nenhuma tabela de transactional outbox ou mecanismo de entrega fire-and-forget será adicionado prematuramente no Slice 005B**.

---

## 26. API Boundary & Threat Model (BFF vs API)

1. **O Navegador NÃO é Confiável**: O browser comunica-se exclusivamente com `apps/web` (BFF) via cookies de sessão HTTP-only seguros do Better Auth.
2. **Proibição de Headers Unsigned**: O envio de headers abertos como `X-User-Id` ou `X-Organization-Id` pelo browser para a API é terminantemente rejeitado.
3. **Defesa em Profundidade**: `apps/api` autentica a chamada interna e revalida no banco se o usuário pertence à organização e possui papel autorizado para a ação.

---

## 27. Internal Service Auth: Análise Separada (Symmetric vs Asymmetric)

Para resolver a comunicação interna `apps/web` → `apps/api`, comparam-se duas arquiteturas criptográficas distintas:

### Comparação de Modelos

| Critério | Opção 1A: Symmetric HMAC (`HS256`) | Opção 1B: Asymmetric Signed Assertion (`Ed25519` / `ES256`) (Recomendada) |
| :--- | :--- | :--- |
| **Material Criptográfico** | Chave simétrica compartilhada (`INTERNAL_SERVICE_SECRET`). | Par de chaves: chave privada em `apps/web`, chave pública em `apps/api`. |
| **Contenção de Danos (Blast Radius)** | Se `apps/api` for comprometida, o invasor obtém a chave de assinatura e pode forjar tokens como qualquer usuário/tenant. | **Excelente**. A API possui apenas a chave pública de verificação. Um comprometimento da API não permite forjar tokens para outros serviços. |
| **Rotação de Chaves** | Rotação requer sincronizar a troca de secret simultaneamente em ambos os serviços. | Rotação elegante: `apps/web` assina com nova chave identificada por `kid` no header do JWT, e a API aceita chaves antigas até expiração. |
| **Complexidade Operacional** | Muito baixa em desenvolvimento local. | Levemente superior (gestão de par de chaves), mas nativa com APIs criptográficas padrão do Node.js (`crypto`). |

### Recomendação Formal: **Opção 1B (Short-Lived Asymmetric Signed Service Assertion)**
*(Alternativa aceita para dev local se aprovado pelo humano: fallback temporário para HMAC caso a infraestrutura de chaves não esteja provisionada).*

---

## 28. Assertion Claims, Validação e Replay Window vs Prevention

### Claims Conceituais Obrigatórias:
- `sub`: Identificador do usuário autenticado no Better Auth (`text`).
- `orgId`: Identificador da organização ativa para a operação (`UUID`).
- `iss`: Emissor da asserção (`"apps/web"`).
- `aud`: Audiência esperada (`"apps/api"`).
- `iat`: Timestamp de emissão.
- `exp`: Timestamp de expiração (**Short Configurable TTL**, ex.: 30 a 60 segundos).
- `jti`: Identificador único da asserção (UUID).
- `kid`: Identificador da chave de assinatura (para rotação).

### Correção Factual sobre Ataques de Replay:
- **`REPLAY WINDOW: BOUNDED BY ASSERTION EXPIRATION`**: Um TTL curto **limita** a janela de oportunidade de reutilização de um token interceptado. Ele **NÃO impede** que um token seja reutilizado múltiplas vezes durante a sua janela de validade (30s).
- **`REPLAY PREVENTION: NOT IMPLEMENTED / REQUIRES ADDITIONAL MECHANISM`**: A prevenção estrita de reutilização (one-time use) exigiria um cache distribuído stateful de JTIs/nonces consumidos. Como a infraestrutura efêmera (Redis) permanece `PENDING`, a plataforma opera com a janela de TTL delimitada.
- **Validação na API**: O middleware em `apps/api` deve validar assinatura, emissor, audiência, expiração, tolerância estrita de clock skew (máx 5s) e **revalidar no banco** o membership do usuário no tenant informado.

---

## 29. Janela de Consistência na Revogação de Sessão (Session Revocation)

- Se um usuário realizar logout ou sua sessão for revogada no Better Auth, uma Service Assertion previamente assinada e em trânsito permanecerá criptograficamente válida até seu `exp` (dentro da janela de 30-60s).
- Esta é uma **janela de consistência eventual deliberada**, comum em arquiteturas desacopladas baseadas em tokens sem checagem de revogação síncrona a cada salto de rede.

---

## 30. Proteção CSRF no Browser (BFF Guards Mantidos)

- A asserção de serviço protege estritamente o enlace `apps/web` → `apps/api`.
- Ela **não substitui** as proteções contra CSRF no canal `browser` → `apps/web`.
- As diretrizes de segurança de cookies (`HttpOnly`, `SameSite=Lax/Strict`, `Secure`), validação de cabeçalhos `Origin` e `Host`, e proteção em rotas de mutação no Next.js permanecem mandatórias no BFF.

---

## 31. HTTP Framework Comparison (Hono vs Fastify com Fatos Context7)

### Fatos Oficiais Atualizados (Context7):
1. **Hono (`/websites/hono_dev`)**:
   - Web framework baseado em Web Standards nativos (`Request`, `Response`, `fetch`), executando no Node 22/24 via `@hono/node-server`.
   - Suporte oficial a OpenAPI através de `@hono/zod-openapi` utilizando a função `createRoute` para mapear parâmetros, body e responses tipadas.
   - **Esclarecimento sobre Swagger UI**: `@hono/zod-openapi` gera exclusivamente o documento da especificação OpenAPI (ex.: `/doc`). A renderização visual interativa requer middleware dedicado, como `@hono/swagger-ui` ou `@scalar/hono-api-reference`.
   - Testabilidade ergonômica via `app.request()` sem subir servidores HTTP reais em portas TCP.
2. **Fastify (`/fastify/fastify`)**:
   - Fastify v5 removeu a opção `jsonShortHand`, exigindo definição completa de JSON schema ou type providers (`@fastify/type-provider-typebox` / `@fastify/type-provider-zod`).
   - Geração de documentação OpenAPI via `@fastify/swagger` e `@fastify/swagger-ui`.

### Critérios de Comparação Neutros:

| Critério | Fastify v5 | Hono v4 (com `@hono/node-server`) (Recomendado) |
| :--- | :--- | :--- |
| **API Surface & Composição** | Sistema baseado em plugins com ciclo de vida encapsulado (`fastify-plugin`, decorators de request). | Composição linear e direta de middlewares idiomáticos sobre Web Standards. |
| **Definição de Rotas e OpenAPI** | Esquema desacoplado da rota via schemas e swagger plugin. | Definição coesa de schema de validação, rota e contrato OpenAPI em um único bloco via `createRoute`. |
| **Footprint Conceitual** | Maior volume de conceitos proprietários de framework (`reply.send`, lifecycle hooks `preHandler`, `onRequest`). | Baixo footprint proprietário; manipulação direta de contexto `c.req` e `c.json()`. |
| **Ergonomia de Testes de Unidade** | `server.inject()` (muito bom). | `app.request()` nativo sem abrir sockets de rede (excelente). |

### Recomendação Formal: **Hono (com `@hono/node-server` e `@hono/zod-openapi`)** para `apps/api`.

---

## 32. Framework Portability vs Application Portability

- **Distinção Crítica**: Embora o Hono seja portável para múltiplos runtimes (Cloudflare Workers, Deno, Bun, Node), a aplicação `apps/api` depende diretamente de:
  1. PostgreSQL gerenciado;
  2. Driver nativo `node-postgres` (`pg`);
  3. Pool de conexões PgBouncer e Repositories do Drizzle ORM.
- **Registro Formal de Runtime**:
  - **`CURRENT API RUNTIME TARGET: Node.js (v22/v24)`**.
  - **`EDGE DEPLOYMENT: NOT A REQUIREMENT / NOT VERIFIED`**.

---

## 33. Contract Strategy & OpenAPI

- Rotas serão versionadas sob `/v1/agents`.
- Schemas compartilhados de input/output residirão em `packages/contracts`.
- Especificação OpenAPI 3.0/3.1 exportada pelo endpoint `/v1/doc`.
- Documentação interativa disponibilizada via `@hono/swagger-ui` em rota protegida de desenvolvimento/staging (`/v1/ui`).

---

## 34. Error Model & HTTP Mapping

| Erro de Domínio | Classe Base | HTTP Status | Código HTTP |
| :--- | :--- | :---: | :--- |
| Validação de Schema inválida | `ValidationError` | `400` | `VALIDATION_ERROR` |
| Asserção de serviço ausente/inválida/expirada | `UnauthorizedError` | `401` | `UNAUTHORIZED` |
| Falta de permissão no tenant (RBAC) | `ForbiddenError` | `403` | `FORBIDDEN` |
| Cota de agentes ativos excedida (`agents.max`) | `EntitlementExceededError` | `403` | `ENTITLEMENT_EXCEEDED` |
| Agente ou versão não encontrada | `NotFoundError` | `404` | `NOT_FOUND` |
| Tentativa de publicar com outro publish em curso | `ConflictError` | `409` | `STATE_CONFLICT` |
| Violação de imutabilidade (edição de versão publicada) | `AppError` | `422` | `UNPROCESSABLE_ENTITY` |
| Falha interna inesperada | `AppError` | `500` | `INTERNAL_ERROR` |

---

## 35. UI Information Architecture (Visão Geral de Telas do Agent Studio)

1. **Lista de Agentes (`/agents`)**: Tabela responsiva exibindo nome, slug, versão publicada ativa, badge de status (`ACTIVE`/`ARCHIVED`) e indicador de rascunho em edição.
2. **Visão do Agente (`/agents/:id`)**:
   - Cabeçalho com ações primárias (*Publicar Nova Versão*, *Descartar Rascunho*, *Novo Rascunho*);
   - Abas temáticas organizadas com *Progressive Disclosure*:
     - **Identidade**: Nome, papel, tom, saudações;
     - **Regras & Limites**: Diretrizes conversacionais e limites determinísticos;
     - **Voz**: Seletor de idioma e perfil de voz neutro;
     - **Playbook**: Roteiro e tratamento de objeções;
     - **Histórico**: Linha do tempo imutável de versões publicadas com changelog.

---

## 36. Particionamento e Sequenciamento dos Slices (005B, 005C, 005D)

Para viabilizar entregas atômicas e com revisão precisa:

```
┌────────────────────────────────────────────────────────────────────────┐
│ PROMPT-005B: Domain Core & Database Persistence                        │
│ - Adicionar `zod` em `packages/contracts` para schemas de configuração │
│ - Schemas Drizzle: `agents` e `agent_versions` (PostgreSQL)            │
│ - Migration versionada incremental em `packages/database`              │
│ - Repositories tipados: AgentRepository, AgentVersionRepository        │
│ - Transação de publicação atômica com validação de `agents.max`        │
│ - Testes unitários e de integração de persistência (100% isolados)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PROMPT-005C: API Framework, Internal Auth & /v1 Endpoints             │
│ - Instalação de Hono, `@hono/node-server`, `@hono/zod-openapi`         │
│ - Implementação do middleware de asserção assimétrica em `apps/api`    │
│ - Emissão de asserção no BFF (`apps/web`)                             │
│ - Endpoints REST /v1: list, get, create, edit-draft, publish, archive │
│ - Testes de integração de API e rota OpenAPI (/doc)                    │
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

## 37. Tabela Consolidada de Decisões Propostas (Proposed Decisions)

Todas as propostas abaixo são independentes e aguardam **aprovação humana explícita**:

| ID da Proposta | Tema | Decisão Proposta | Status |
| :--- | :--- | :--- | :--- |
| **PROP-005A-01** | **Agente Aggregate** | Identidade estável em `Agent` desacoplada de `AgentVersion`. | **PROPOSED / HUMAN APPROVAL REQUIRED** |
| **PROP-005A-02** | **Fonte da Versão Publicada** | **Opção A**: Status `PUBLISHED` em `AgentVersion` com índice parcial único. Tabela `Agent` não possui pointer redundante. | **PROPOSED / HUMAN APPROVAL REQUIRED** |
| **PROP-005A-03** | **Single Active Draft** | No máximo um draft por agente garantido por índice parcial único no banco. | **PROPOSED / HUMAN APPROVAL REQUIRED** |
| **PROP-005A-04** | **Supercessão de Ciclo de Vida**| Substituir `DRAFT → TEST → PUBLISHED → ARCHIVED` por `DRAFT → PUBLISHED → ARCHIVED` (`TEST` como atividade pontual). | **PROPOSED / HUMAN APPROVAL REQUIRED** |
| **PROP-005A-05** | **Imutabilidade Publicada** | Versões com status `PUBLISHED` são imutáveis; mutações bloqueadas no repositório (`WHERE status = 'DRAFT'`). | **PROPOSED / HUMAN APPROVAL REQUIRED** |
| **PROP-005A-06** | **Schema Versioning** | Coluna relacional `configurationSchemaVersion` protegendo snapshots históricos contra quebra silenciosa. | **PROPOSED / HUMAN APPROVAL REQUIRED** |
| **PROP-005A-07** | **Persistência Híbrida** | **Opção C**: Metadados relacionais indexáveis + snapshot JSONB tipado e validado. | **PROPOSED / HUMAN APPROVAL REQUIRED** |
| **PROP-005A-08** | **Validation Library** | Adoção de `zod` em `packages/contracts` como validador neutro compartilhado para 005B e 005C. | **PROPOSED / HUMAN APPROVAL REQUIRED** |
| **PROP-005A-09** | **Semântica de `agents.max`** | Cota mede quantidade de agentes `ACTIVE`. Consumido em Create/Reactivate. Publish não consome cota adicional. | **PROPOSED / HUMAN APPROVAL REQUIRED** |
| **PROP-005A-10** | **Voice Config Neutro** | Domínio da Fase 5 retém apenas idioma e perfil neutro; parâmetros avançados deferidos para a Fase 6. | **PROPOSED / HUMAN APPROVAL REQUIRED** |
| **PROP-005A-11** | **Knowledge & Tools Scope** | Referências não estruturadas de conhecimento e execução de tools deferidas para a Fase 7. | **PROPOSED / HUMAN APPROVAL REQUIRED** |
| **PROP-005A-12** | **Proteção Confidencial RBAC** | Separação entre `agent.read` (metadados) e `agent.config.read` (prompt/regras restrito a MANAGER+). | **PROPOSED / HUMAN APPROVAL REQUIRED** |
| **PROP-005A-13** | **Internal Service Auth** | Asserção assimétrica de curta duração (`apps/web` assina com chave privada, `apps/api` verifica com pública). | **PROPOSED / HUMAN APPROVAL REQUIRED** |
| **PROP-005A-14** | **Framework HTTP de API** | Hono com `@hono/node-server` e `@hono/zod-openapi` para Node 22/24. | **PROPOSED / HUMAN APPROVAL REQUIRED** |
| **PROP-005A-15** | **Fatiamento em Slices** | Execução sequencial em 005B (Persistência), 005C (API/Auth) e 005D (Frontend UI). | **PROPOSED / HUMAN APPROVAL REQUIRED** |

---

## 38. Decisões Postergadas / Pendentes (Deferred / Pending Decisions)

- **Vector Database / RAG Pipeline**: `DEFERRED (Fase 7)`.
- **Provider Concreto de Síntese de Voz**: `PENDING (Fase 6)`.
- **Framework de LLM Evals Automatizados**: `PENDING (Fase 9)`.
- **Recurso de Banco e Topologia de Produção**: `NOT PROVISIONED (Pending Production Design)`.
- **Provedor de Fila / Cache Efêmero**: `PENDING` (Redis/BullMQ).
- **One-Time Replay Prevention Stateful**: `NOT IMPLEMENTED / PENDING EPHEMERAL INFRASTRUCTURE`.
- **Usage Persistence**: `DEFERRED`.

---

## 39. Checklist para Aprovação Humana (Human Review Required)

- [ ] Aprova a eliminação do ponteiro duplicado `currentPublishedVersionId`, adotando a **Opção A** (Status em `AgentVersion` com índice parcial único como fonte única da verdade)?
- [ ] Aprova a **supercessão formal de ciclo de vida**, adotando `DRAFT → PUBLISHED → ARCHIVED` e tratando `TEST` como atividade/execução pontual?
- [ ] Aprova a adição de `configurationSchemaVersion` para governança de evolução do JSONB?
- [ ] Aprova a adoção formal de `zod` em `packages/contracts` para validação de schema a partir do Slice 005B?
- [ ] Aprova a semântica de `agents.max` medindo o total de agentes com status `ACTIVE`?
- [ ] Aprova a separação RBAC entre `agent.read` (metadados gerais) e `agent.config.read` (configuração sensível)?
- [ ] Aprova a autenticação interna via asserção de serviço assinada assimetricamente com chave privada/pública?
- [ ] Aprova a escolha de Hono (`@hono/node-server` + `@hono/zod-openapi`) para `apps/api`?
- [ ] Autoriza o fatiamento e início do desenvolvimento no Slice 005B (`Domain Core & Database Persistence`)?
