# ADR-009: Agent Studio Aggregate, Versioning and Persistence

## Status
Accepted

## Data
2026-09-23

## Motivo da Aceitação
Aprovação humana explícita recebida em 23 de Setembro de 2026, consolidando as análises arquiteturais e refinamentos de invariantes documentados em `docs/research/PHASE_5_AGENT_STUDIO_GATE.md` (PROMPTs 005A, 005A-FIX e 005A-FINAL-CHECK).

## Contexto
A Fase 5 estabelece a camada de domínios base da plataforma SaaS B2B, com foco prioritário no **Agent Studio**. Empresas clientes necessitam criar, configurar, calibrar, publicar e versionar agentes de voz declarativamente sem necessidade de codificação manual ou fine-tuning proprietário de modelos.
Para suportar essas operações com determinismo, auditabilidade e segurança multi-tenant, era necessário definir:
1. Como desacoplar a identidade corporativa do agente de suas frequentes mutações operacionais;
2. Como representar a versão atualmente ativa sem risco de divergência (dual source of truth);
3. Como garantir atomicidade e prevenir concorrência no consumo de limites contratuais (`agents.max`);
4. Qual estratégia de persistência adotar no PostgreSQL 16 para balancear integridade referencial com flexibilidade de evolução de parâmetros;
5. Como versionar o schema de configuração para evitar corrupção por migrações futuras.

## Decisão

### 1. Separação de Agregados: Identidade Estável vs. Configuração Versionada
Adota-se a segregação estrita entre dois agregados relacionais com escopo multi-tenant (`organizationId`):
- **`Agent` (Aggregate Root — Identidade Estável)**:
  - Representa a âncora administrativa e comercial no tenant.
  - Atributos relacionais: `id` (UUID), `organizationId` (UUID FK), `name`, `slug` (único no tenant), `status` (`ACTIVE` / `ARCHIVED`), `createdAt`, `updatedAt`.
  - Não contém prompts, regras conversacionais ou parâmetros de voz em colunas soltas.
  - Não contém coluna de ponteiro redundante para versão publicada (`current_published_version_id` rejeitado).
  - Ciclo de vida próprio: `ACTIVE` <──► `ARCHIVED`.
- **`AgentVersion` (Configuração Versionada 1:N)**:
  - Snapshot declarativo e auditável da configuração do agente.
  - Atributos: `id` (UUID), `agentId` (UUID FK), `organizationId` (UUID FK), `versionNumber` (inteiro monotônico crescente), `status` (`DRAFT`, `PUBLISHED`, `ARCHIVED`), `configurationSchemaVersion` (inteiro positivo NOT NULL), `configuration` (JSONB validado), `changelog`, `createdBy`, `publishedAt`, `publishedBy`, timestamps.

### 2. Fonte Única da Verdade para a Versão Publicada (Opção A)
- A versão publicada ativa é definida única e exclusivamente pela linha em `agent_versions` com `status = 'PUBLISHED'`.
- O banco de dados impõe unicidade estrita através de índice parcial único:
  ```sql
  CREATE UNIQUE INDEX unique_published_version_per_agent 
  ON agent_versions (agent_id) 
  WHERE status = 'PUBLISHED';
  ```
- Elimina ciclos de foreign keys (`agents` ↔ `agent_versions`) e erradica risco de divergência entre flags de status e ponteiros de chave estrangeira.

### 3. Ciclo de Vida Canônico e Supersessão de `TEST`
- O ciclo de vida formal da versão é:
  ```
  DRAFT ──────► PUBLISHED ──────► ARCHIVED
    │
    └─► (Descarte Físico / Hard Delete)
  ```
- **Supersessão Formal**: O ciclo conceitual anterior (`DRAFT → TEST → PUBLISHED → ARCHIVED`) foi superado. `TEST` deixa de ser um status relacional persistente da entidade `AgentVersion` e passa a ser uma atividade/execução pontual independente de avaliação/teste (*Agent Test Run*).
- **Single Active Draft**: No máximo um rascunho ativo por agente, garantido por índice parcial único (`UNIQUE(agent_id) WHERE status = 'DRAFT'`).
- **Descarte de Rascunhos**: Rascunhos nunca publicados podem sofrer exclusão física (*hard delete*) mediante validação de tenant e autorização, desde que sem vínculos de histórico ou auditoria. Lacunas resultantes na numeração `versionNumber` são permitidas.

### 4. Modelo de Persistência Híbrido (Opção C)
- **Metadados Relacionais**: `id`, `agent_id`, `organization_id`, `version_number`, `status`, `configuration_schema_version`, autores e datas em colunas relacionais tipadas com foreign keys, índices e restrições `CHECK`.
- **Snapshot Declarativo JSONB**: Conteúdo de configuração conversacional encapsulado na coluna `configuration` (JSONB), validado em tempo de execução via biblioteca declarativa de schema (`zod`) em `packages/contracts`.
- **Versionamento de Schema Obrigatório**: Coluna `configuration_schema_version integer NOT NULL CHECK (configuration_schema_version > 0)` sem default implícito.

### 5. Governança de Quotas (`agents.max`) e Concorrência
- O entitlement `agents.max` afere a quantidade de agregados `Agent` com `status = 'ACTIVE'`.
- Operações de criação (`Create Agent`) e reativação (`Reactivate Agent`) consomem e verificam a cota. Publicar uma nova versão de um agente já ativo não consome quota adicional.
- Arquivar um agente (`ARCHIVED`) não altera a versão publicada existente. Reativar não cria nem publica versão implicitamente.
- A concorrência por tenant no PostgreSQL é serializada via lock pessimista transacional na linha da `Organization` (`SELECT id FROM organizations WHERE id = $1 FOR UPDATE`).

### 6. Escopo do Snapshot v1 e Deferrals
- O schema de configuração v1 contempla exclusivamente atributos com semântica executável real: Persona/Papel, Idioma/Locale e Instruções/Regras conversacionais determinísticas (e playbooks/exemplos quando definidos pelo schema).
- Parâmetros avançados de voz são diferidos para a Fase 6 (*Motor de Voz*).
- Execução real de ferramentas (*tool calling*) e base de conhecimento/RAG são diferidos para a Fase 7 (*Agente IA e Tools*).

### 7. Validação de Schemas e Segurança de Acesso (RBAC)
- Adoção de `zod` em `packages/contracts` como biblioteca neutra de validação de schemas em runtime (sem acoplamento a frameworks HTTP ou ORM; instalação no Slice 005B).
- Separação de autorização RBAC entre `agent.read` (metadados e visualização de catálogo) e `agent.config.read` (leitura de prompt, regras e segredos de negócio, restrita a perfis superiores).

## Consequências

### Positivas
- Ausência total de dual source of truth para versão publicada;
- Integridade referencial multi-tenant protegida a nível de banco relacional;
- Imutabilidade absoluta garantida no domínio para versões publicadas e históricas;
- Prevenção garantida contra estouro concorrente de cotas (`agents.max`);
- Flexibilidade para evoluir schemas de agentes sem migrações destrutivas de colunas DDL;
- Código de validação desacoplado de dependências de infraestrutura.

### Trade-offs e Riscos
- Consultas complexas que dependam de propriedades internas do JSONB exigem operadores específicos do PostgreSQL (`->>`, `@>`) e potenciais índices GIN;
- O descarte físico de rascunhos gera lacunas em `versionNumber` (monotônico, porém não-contíguo);
- A serialização de criação/reativação via lock de organização gera pequeno enfileiramento transacional caso múltiplos operadores criem agentes simultaneamente na mesma empresa (cenário raro e aceitável em B2B).

## Capacidades Diferidas (Deferred Capabilities)
- **Fase 6**: Catálogo de vozes, síntese TTS, VAD, latência de áudio e barge-in.
- **Fase 7**: Sandboxing de tools, catálogo dinâmico de tools do tenant, ingestão de documentos e vetores RAG.
- **Fase 9**: Framework de Agent Evals e comparação automatizada entre versões via provedores externos.
