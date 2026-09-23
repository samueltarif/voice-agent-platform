# Agent Studio, API Boundary & Internal Auth Decision Gate (PHASE_5_AGENT_STUDIO_GATE.md)

> **Documento de Pesquisa e Proposta de Arquitetura — Fase 5**  
> **Data**: 23 de Setembro de 2026  
> **Status**: PROPOSED / HUMAN APPROVAL REQUIRED (Nenhuma decisão nova tratada como ACCEPTED sem aprovação explícita)

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
  3. *Ephemeral State / Filas*: Ainda `PENDING` (Redis/BullMQ).
  4. *Usage Persistence*: `DEFERRED` para fases de telefonia/áudio.

---

## 2. Scope of Phase 5 (Escopo e Objetivos da Fase 5)

A Fase 5 estabelece a camada de domínios base da plataforma B2B, com foco prioritário no **Agent Studio**:
- **Objetivo Central**: Permitir que empresas clientes criem, configurem, testem simulações, publiquem e versionem seus agentes de voz via interface web declarativa, **sem edição de código ou fine-tuning de modelos**.
- **O que ENTRA no escopo conceitual da Fase 5**:
  - Modelo de domínio do Agente (`Agent` e `AgentVersion`);
  - Ciclo de vida, versionamento monotônico e imutabilidade de versões publicadas;
  - Snapshot declarativo de configuração (Persona, Regras de Negócio, Voz provider-neutral, Playbook de abordagem, Permissões de Ferramentas, Exemplos);
  - Transação atômica de publicação com validação de entitlements (`agents.max`);
  - Matriz de autorização multi-tenant (RBAC) para operações de agente;
  - Resolução da fronteira de confiança e autenticação interna `apps/web` → `apps/api`;
  - Seleção do framework HTTP de `apps/api` e estratégia de OpenAPI/contratos.
- **O que NÃO ENTRA no escopo da Fase 5 (Limites Estritos)**:
  - Motor de áudio/voz em tempo real (reservado para a Fase 6);
  - Provedor real de telefonia / DIDs / SIP trunking (reservado para a Fase 8);
  - Ingestão de embeddings vetoriais ou RAG complexo (reservado para a Fase 7);
  - Execução de tools externas contra APIs reais de terceiros (apenas allowlist/permissões nesta fase);
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
│  - currentPublishedVersionId: UUID | null (FK Version) │
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
│  - configuration: JSONB (Snapshot Tipado e Validado)   │
│  - changelog: string | null                            │
│  - createdBy: text (FK User)                           │
│  - publishedAt: Timestamp | null                       │
│  - publishedBy: text | null (FK User)                  │
│  - createdAt: Timestamp                                │
│  - updatedAt: Timestamp                                │
└────────────────────────────────────────────────────────┘
```

### Justificativa Arquitetural:
- A entidade `Agent` **não armazena prompts, parâmetros de voz ou regras conversacionais**. Ela representa puramente a âncora relacional e comercial no tenant.
- Chamadas telefônicas futuras, campanhas e logs de auditoria sempre referenciarão `(agentId, agentVersionId)`. Mesmo que o nome do agente mude ou uma nova versão seja publicada, a integridade da chamada histórica permanece matematicamente inalterada.

---

## 4. Version Model (Modelo Canônico de Versionamento)

1. **Relação 1 -> N**: Cada `Agent` possui zero ou mais `AgentVersion`.
2. **Numeração Monotônica**:
   - `versionNumber` é um inteiro sequencial estritamente crescente (1, 2, 3...) por `agentId`.
   - Garantido por constraint de unicidade no banco: `UNIQUE(agent_id, version_number)`.
3. **Prevenção de Race Conditions na Geração de Versão**:
   - O número da versão é gerado exclusivamente dentro de transação no banco através de lock pessimista da linha pai do agente:
     ```sql
     SELECT id FROM agents WHERE id = $1 FOR UPDATE;
     SELECT COALESCE(MAX(version_number), 0) + 1 FROM agent_versions WHERE agent_id = $1;
     ```
   - Isso elimina concorrência entre dois operadores criando drafts simultaneamente.
4. **Política de Drafts (Single Active Draft vs. Multi-Draft)**:
   - **Proposta Recomendada**: **Single Active Draft** por Agente.
   - *Justificativa*: Simplifica radicalmente a experiência do usuário (sem árvore de branches desnecessária para um painel B2B corporativo) e impede divergências operacionais conflitantes.
   - *Garantia*: Índice parcial único no banco:
     ```sql
     CREATE UNIQUE INDEX unique_active_draft_per_agent 
     ON agent_versions (agent_id) 
     WHERE status = 'DRAFT';
     ```
   - Se uma nova versão precisar ser editada, o operador cria um novo `DRAFT` clonado a partir da versão `PUBLISHED` ativa (ou de uma versão histórica selecionada).
5. **Ponteiro de Versão Publicada**:
   - O campo `Agent.currentPublishedVersionId` aponta como Foreign Key para a `AgentVersion` com status `PUBLISHED`.
   - Pode ser `null` quando o agente for recém-criado e ainda não tiver versão publicada.

---

## 5. Lifecycle (Ciclo de Vida da Versão e Análise de Estados)

A documentação conceitual preliminar previa o ciclo: `DRAFT → TEST → PUBLISHED → ARCHIVED`. Este gate avaliou criticamente a pertinência de `TEST` como status persistido de versão:

### Comparação de Modelos de Estado

| Critério | Modelo A: `TEST` como Status de Versão | Modelo B: `TEST` como Atividade/Execução (Recomendado) |
| :--- | :--- | :--- |
| **Definição de `status`** | `DRAFT`, `TEST`, `PUBLISHED`, `ARCHIVED` | `DRAFT`, `PUBLISHED`, `ARCHIVED` |
| **Comportamento Concorrente** | Estado volátil: uma versão pode ficar presa em `TEST` indefinidamente se o teste falhar ou for interrompido. | A versão permanece `DRAFT` estável enquanto testes de validação ou simulação são executados. |
| **Resultados de Teste** | Mistura o status de publicação da versão com o resultado pontual de uma bateria de testes. | Test runs são modelados como execuções/avaliações associadas a uma versão (`validation_results`), preservando histórico de múltiplos testes. |
| **Complexidade da State Machine** | Exige transições bidirecionais complexas (`DRAFT → TEST → DRAFT`, `TEST → PUBLISHED`). | Máquina de estados unidirecional determinística: `DRAFT → PUBLISHED → ARCHIVED`. |

### Proposta Recomendada:
- **Estados Canônicos da Versão**:
  1. `DRAFT`: Versão mutável em configuração. Não atende tráfego de produção.
  2. `PUBLISHED`: Versão promovida, congelada e ativa para o runtime.
  3. `ARCHIVED`: Versão substituída ou aposentada, preservada como registro imutável histórico.
- **`TEST` como Atividade**: Testes de simulação ou validação de configuração são executados contra o `DRAFT` atual. O resultado de validação (`valid: boolean`, `errors: []`) é retornado ao cliente e, quando necessário, persistido em log de auditoria ou metadado, sem transicionar o status permanente da versão.

### Transições Permitidas
- `DRAFT → PUBLISHED` (via Ação de Publicação Transacional);
- `PUBLISHED → ARCHIVED` (automático quando uma nova versão é publicada, ou manual via arquivamento do agente);
- `ARCHIVED` é estado terminal (imutável para sempre).
- **Transições Proibidas**:
  - `PUBLISHED → DRAFT` (violação da imutabilidade);
  - `ARCHIVED → DRAFT` ou `ARCHIVED → PUBLISHED` (violação de rastreabilidade).

---

## 6. Immutability of Published Versions (Imutabilidade Rígida)

**Princípio Fundamental de Operação**:
> Uma vez que uma `AgentVersion` atinge o status `PUBLISHED`, ela se torna **100% IMUTÁVEL**.

- **Garantias Operacionais**:
  - Proibido alterar prompt, instruções, voz, regras de negócio, lista de tools autorizadas ou exemplos de conversa diretamente na versão publicada.
  - Qualquer alteração exige:
    1. Criar um novo `DRAFT` (clonando a configuração da versão publicada);
    2. Modificar a configuração no `DRAFT`;
    3. Validar a configuração;
    4. Executar transação de publicação para gerar uma nova versão imutável.
- **Defesa em Profundidade**:
  - Na camada de repositório (`AgentRepository`), métodos de mutação (`updateDraftConfig`) aceitam estritamente versões com `status = 'DRAFT'`. Tentativas de atualização contra versões `PUBLISHED` ou `ARCHIVED` disparam erro imediato de domínio (`InvalidStateTransitionError`).

---

## 7. Publication Transaction (Transação Atômica de Publicação)

A publicação de um agente é uma operação determinística e transacional executada no banco de dados através dos seguintes passos sequenciais:

```
Passo 1: Lock Pessimista do Agente
  SELECT * FROM agents WHERE id = :agentId AND organization_id = :orgId FOR UPDATE;

Passo 2: Verificação do Draft Elegível
  SELECT * FROM agent_versions WHERE agent_id = :agentId AND status = 'DRAFT' FOR UPDATE;
  (Se não existir draft, falha com NOT_FOUND / INVALID_STATE)

Passo 3: Validação Semântica da Configuração
  Validar completude obrigatória do JSONB (Persona, Voz, Regras mínimas). Se inválido, falha com VALIDATION_ERROR.

Passo 4: Validação de Entitlements do Tenant
  Verificar se a organização possui direito de manter agentes publicados (cota agents.max e status comercial ativo).

Passo 5: Arquivamento da Versão Publicada Anterior
  UPDATE agent_versions 
  SET status = 'ARCHIVED', updated_at = NOW() 
  WHERE agent_id = :agentId AND status = 'PUBLISHED';

Passo 6: Promoção do Draft para PUBLISHED
  UPDATE agent_versions 
  SET status = 'PUBLISHED', published_at = NOW(), published_by = :userId, updated_at = NOW()
  WHERE id = :draftId;

Passo 7: Atualização do Ponteiro do Agente e Auditoria
  UPDATE agents 
  SET current_published_version_id = :draftId, updated_at = NOW() 
  WHERE id = :agentId;

  INSERT INTO audit_logs (organization_id, actor_id, action, resource_type, resource_id, metadata)
  VALUES (:orgId, :userId, 'agent.version_published', 'agent', :agentId, json_build_object('versionId', :draftId, 'versionNumber', :versionNum));
```

### Tratamento de Concorrência
- Graças ao lock pessimista (`FOR UPDATE`) sobre a linha pai `agents`, duas solicitações simultâneas de publicação são serializadas no banco. A primeira transação promove o draft; a segunda detecta ausência de draft elegível e falha graciosamente com erro de conflito (`ConflictError: No active draft found to publish`).

---

## 8. Configuration Ownership Matrix (Matriz de Configuração e Classificação)

Cada dimensão da configuração de um agente é classificada segundo seu escopo e ciclo de vida:

| Componente | Classificação Arquitetural | Onde Reside | Justificativa |
| :--- | :--- | :--- | :--- |
| **Persona / Identidade** | **VERSIONED PERSISTED CONFIG** | `AgentVersion.configuration.persona` | Define papel, tom, estilo e comportamento base da versão. |
| **Business Rules (Conversacionais)** | **VERSIONED PERSISTED CONFIG** | `AgentVersion.configuration.rules.conversational` | Instruções de tom e postura que orientam o LLM. |
| **Business Rules (Determinísticas)** | **VERSIONED PERSISTED CONFIG** | `AgentVersion.configuration.rules.deterministic` | Restrições estruturadas (ex.: desconto máx, horários) validadas por código. |
| **VoiceConfig** | **VERSIONED PERSISTED CONFIG** | `AgentVersion.configuration.voice` | Parâmetros provider-neutral de síntese de voz da versão. |
| **Playbook** | **VERSIONED PERSISTED CONFIG** | `AgentVersion.configuration.playbook` | Fases conversacionais, gatilhos de transbordo e desfechos esperados. |
| **ToolPermissions** | **VERSIONED PERSISTED CONFIG** | `AgentVersion.configuration.tools` | Allowlist de capabilities/chaves de ferramentas autorizadas. |
| **ConversationExamples** | **VERSIONED PERSISTED CONFIG** | `AgentVersion.configuration.examples` | Diálogos de calibração que compõem o contexto da versão. |
| **Knowledge (Estruturado)** | **REFERENCE TO DOMAIN RESOURCE** | `AgentVersion.configuration.knowledge.catalog_refs` | Referências a IDs de categorias/catálogos de produtos no banco. |
| **Knowledge (Não Estruturado)** | **REFERENCE TO VERSIONED RESOURCE** | `AgentVersion.configuration.knowledge.document_refs` | IDs de documentos na Base de Conhecimento (não embute textos no agente). |
| **RuntimeContext** | **RUNTIME-ONLY CONTEXT** | Memória Efêmera / Payload de Chamada | Telemetria, áudio em buffer, estado da chamada telefônica ativa. |
| **Usage & Costs** | **DEFERRED DOMAIN** | Tabelas de Faturamento / Usage | Registrado exclusivamente após o término da chamada. |

---

## 9. Persistence Options (Comparação de Modelos de Armazenamento)

Para armazenar a configuração versionada do agente, três opções técnicas foram analisadas:

### Opção A: Tabelas Componentes Normalizadas
- Criação de tabelas relacionais separadas: `agent_personas`, `agent_voice_configs`, `agent_rules`, `agent_playbooks`, `agent_tool_permissions`, `agent_examples`.
- **Vantagens**: Constraints relacionais puras do PostgreSQL; foreign keys estritas por componente.
- **Desvantagens**: 
  - Extremamente pesado para versionamento imutável: cada publicação ou criação de draft exige clonar linhas em 6+ tabelas distintas sob transação;
  - Risco de escrita parcial ou desalinhamento de integridade;
  - Leituras do runtime exigem múltiplos `JOIN`s relacionais para reconstruir o estado do agente;
  - Evolução de schema rígida para ajustes em campos experimentais de prompt.

### Opção B: Snapshot Único JSONB (Schema-less total)
- Toda a entidade `Agent` e suas versões armazenadas em um blob JSON livre.
- **Vantagens**: Simplicidade inicial extrema de persistência.
- **Desvantagens**:
  - Impossibilidade de impor constraints de multi-tenancy e unicidade relacional via PostgreSQL;
  - Falta de integridade referencial com usuários, organizações e auditoria;
  - Queries de catálogo lentas e não indexáveis de forma padronizada;
  - Viola a governança estrita de banco definida em `docs/DATABASE.md`.

### Opção C: Híbrido Relacional + Snapshot JSONB Tipado e Validado (Recomendado)
- **Tabela Relacional `agents`**: Colunas relacionais estritas (`id UUID`, `organization_id UUID`, `name text`, `slug text`, `status enum`, `current_published_version_id UUID`).
- **Tabela Relacional `agent_versions`**: Colunas relacionais para metadados de governança (`id UUID`, `agent_id UUID`, `organization_id UUID`, `version_number integer`, `status enum`, `changelog text`, `created_by text`, `published_at timestamp`, `published_by text`).
- **Configuração como JSONB Tipado (`configuration JSONB`)**:
  - Toda a árvore configurável (persona, regras, voz, playbook, tools, examples, knowledge_refs) é encapsulada em uma única coluna JSONB tipada.
  - **Validação Estrita**: O JSONB é 100% validado por schema estrito antes de qualquer inserção/atualização.
  - **Clonagem Instantânea**: Criar um draft a partir de uma versão publicada consiste em um único `INSERT ... SELECT configuration FROM agent_versions`, com custo O(1) no banco.
  - **Runtime Otimizado**: Carregar o agente no motor de voz requer uma única query de uma linha (`SELECT configuration FROM agent_versions WHERE id = :versionId`), sem nenhum JOIN.

### Recomendação Formal: **Opção C (Híbrido Relacional + JSONB Tipado)**.

---

## 10. Persona / Agent Config (Estrutura Tipada da Configuração Base)

A configuração base não deve ser uma string bruta monolítica nem um emaranhado de dezenas de colunas esparsas. A estrutura tipada recomendada para o schema do JSONB é:

```typescript
export interface AgentPersonaConfig {
  readonly role: string;                  // Ex: "Assistente de Atendimento e Qualificação"
  readonly companyName: string;           // Nome da empresa representada
  readonly objective: string;             // Meta central da chamada
  readonly tone: 'FORMAL' | 'CASUAL' | 'EMPATHETIC' | 'OBJECTIVE';
  readonly language: 'pt-BR' | 'en-US' | 'es-ES';
  readonly conversationalStyle: {
    readonly pacing: 'SLOW' | 'NORMAL' | 'FAST';
    readonly verbosity: 'CONCISE' | 'BALANCED' | 'DETAILED';
    readonly allowHumor: boolean;
  };
  readonly greeting: {
    readonly openingPhrase: string;       // Frase inicial de identificação
    readonly askForCustomerName: boolean;
  };
  readonly closing: {
    readonly closingPhrase: string;       // Frase padrão de encerramento
    readonly confirmNextSteps: boolean;
  };
  readonly fallbackBehavior: {
    readonly notUnderstoodPhrase: string; // Frase ao não compreender o áudio
    readonly maxConsecutiveFailures: number; // Limite antes de transbordo (ex: 3)
  };
}
```

---

## 11. Business Rules (Regras Conversacionais vs. Regras Determinísticas)

O Agent Studio deve segregar explicitamente:

### Categoria A: Regras Conversacionais (Guidance para o LLM)
- Orientam postura, estilo e polidez.
- Exemplos: *"Nunca use gírias excessivas"*, *"Sempre peça desculpas antes de pedir para o cliente repetir"*, *"Não mencione concorrentes diretamente"*.
- **Mecanismo**: Injetadas no system prompt do modelo de linguagem.

### Categoria B: Regras Determinísticas Estruturadas (Código / Validação Server-Side)
- **O LLM NÃO é fonte da verdade para regras financeiras, limites ou ações proibidas.**
- Exemplos críticos:
  - *Desconto Comercial*: Percentual máximo de desconto aplicável em propostas (ex.: `maxDiscountPercent: 15`). Se o LLM alucinar 30%, o backend ou a tool de precificação rejeita determinísticamente.
  - *Horário de Atendimento*: Janela horária operacional (`businessHours`).
  - *Requisitos de Qualificação*: Campos obrigatórios do cliente antes de agendamento (ex.: `requireCpf: true`).
  - *Gatilhos Obrigatórios de Handoff*: Palavras-chave ou intenções de cancelamento/reclamação formal que forçam transbordo imediato para operador humano.

---

## 12. Voice Config (Configuração de Voz Provider-Neutral)

O domínio da plataforma permanece agnóstico a fornecedores de voz sintética (OpenAI, ElevenLabs, Deepgram, Azure). A configuração de voz no domínio expressa apenas parâmetros semânticos padronizados:

```typescript
export interface AgentVoiceConfig {
  readonly voiceGender: 'FEMALE' | 'MALE' | 'NEUTRAL';
  readonly languageCode: 'pt-BR' | 'en-US' | 'es-ES';
  readonly speedRate: number;      // Multiplicador de velocidade (0.8 a 1.2, padrão 1.0)
  readonly pitch: number;          // Variação de tom (-2.0 a 2.0, padrão 0.0)
  readonly stability: number;      // 0.0 a 1.0 (estabilidade conversacional)
  readonly providerHint?: string;  // Dica opcional de identificador neutro (ex: "pt-BR-natural-1")
}
```
*Adapters concretos em `packages/integrations` mapearão esses atributos para a API do fornecedor que for selecionado futuramente.*

---

## 13. Knowledge Boundary (Fronteira da Base de Conhecimento)

- **Dados Estruturados de Negócio**: Catálogo de produtos, preços, estoque e agenda de compromissos **não utilizam RAG**. São consultados determinísticamente via *tool calling* contra repositories do PostgreSQL.
- **Conhecimento Não Estruturado (Documentos e FAQs)**:
  - A versão do agente (`AgentVersion`) armazena estritamente **IDs de referência** aos documentos pertencentes à organização (`documentIds: string[]`).
  - Nenhum conteúdo de PDF, markdown bruto ou chunk de texto é embutido na tabela do agente.
  - **Decisão para o MVP da Fase 5**: A ingestão de documentos, geração de embeddings e banco vetorial permanecem **PENDING / DEFERRED** para a Fase 7. O Agent Studio apenas registrará as referências estruturadas.

---

## 14. Playbook (Roteiro e Guias Conversacionais)

O Playbook modela o direcionamento conversacional da chamada como fases estruturadas, sem construir um motor de workflow genérico complexo:

```typescript
export interface PlaybookStage {
  readonly id: string;
  readonly name: string;                  // Ex: "Qualificação de Necessidades"
  readonly order: number;
  readonly goal: string;                  // O que descobrir nesta fase
  readonly keyQuestions: readonly string[]; // Perguntas sugeridas ao agente
  readonly completionTrigger: string;    // Critério para avançar para a próxima fase
  readonly handoffOnFailure: boolean;    // Transborda se o cliente resistir
}

export interface AgentPlaybookConfig {
  readonly stages: readonly PlaybookStage[];
  readonly objectionHandlers: readonly {
    readonly trigger: string;            // Ex: "Preço muito alto"
    readonly suggestedApproach: string; // Como o agente deve contornar
  }[];
}
```
*Recomendação*: Manter o Playbook como parte do snapshot JSONB de `AgentVersion` na Fase 5, evitando tabelas adicionais antes de validação de mercado.

---

## 15. Tool Permissions (Allowlist Determinística de Ferramentas)

A invocação de ferramentas por IA apresenta riscos de segurança e integridade. A versão do agente deve conter uma allowlist determinística de ferramentas autorizadas:

```typescript
export interface ToolPermissionConfig {
  readonly toolKey: string;              // Identificador estável (ex: "catalog.check_price")
  readonly enabled: boolean;
  readonly maxInvocationsPerCall: number;// Teto de chamadas por ligação (ex: 5)
  readonly allowedParametersFilter?: Record<string, unknown>; // Restrições de escopo
}
```
- **Regra de Segurança**: O runtime do motor de voz rejeitará qualquer tentativa do modelo de linguagem de invocar uma ferramenta cuja `toolKey` não esteja explicitamente listada e habilitada na versão publicada do agente.
- **Nenhum SDK de terceiros** é importado no domínio do Agent Studio.

---

## 16. Conversation Examples (Exemplos de Calibração)

- Os exemplos de conversa configurados no Agent Studio representam diálogos de referência para calibração de tom, ritmo e assertividade (*few-shot in-context learning*).
- **Estrutura**:
  ```typescript
  export interface ConversationExample {
    readonly id: string;
    readonly scenarioTag: string;        // Ex: "cliente_apressado", "duvida_de_preco"
    readonly customerInput: string;
    readonly idealAgentResponse: string;
  }
  ```
- **Princípio**: Não constituem dataset de fine-tuning nem mutam pesos de modelos. São renderizados no prompt do agente de forma estruturada.

---

## 17. Feedback / Auto-Learning (Revisão Supervisionada Obrigatória)

- **Regra Inviolável (DEC-008 / DEC-010)**: Avaliações negativas, feedbacks de clientes ou transcrições de chamadas **NUNCA alteram diretamente uma versão publicada em produção**.
- **Fluxo Obrigatório**:
  1. Feedback registrado em fila de auditoria/revisão;
  2. Operador humano analisa o caso no painel;
  3. Operador cria manualmente um novo `DRAFT`, aplica as correções recomendadas e submete à bateria de testes;
  4. Nova versão publicada por decisão humana.

---

## 18. Evals Boundary (Fronteira de Avaliação)

- O framework automatizado de LLM Evals com geração de scores por modelos juízes é complexo e pertence à **Fase 9**.
- **Escopo na Fase 5**:
  - Validação determinística de completude (checagem se todos os campos obrigatórios da Persona, Voz e Regras estão preenchidos antes de permitir publicação);
  - Interface preparada para receber suítes de teste simuladas no futuro.

---

## 19. Entitlements (Conformidade com o Modelo Comercial)

O Agent Studio deve respeitar integralmente a governança comercial aprovada em DEC-020 e DEC-021:
1. **Entitlement Primário**: `agents.max` (número máximo de agentes ativos por organização).
2. **Local de Validação**:
   - A validação de limites ocorre **exclusivamente no servidor** (`apps/api` / Repositories) antes de persistir novos registros.
   - Proibido confiar em verificações puramente client-side no frontend (`apps/web`).
3. **Comportamento em Falha**:
   - Se o tenant já atingiu a cota estipulada em sua `Subscription` ou `CommercialGrant`, a tentativa de criação falha com erro de domínio tipado: `EntitlementExceededError('agents.max')` mapeado para HTTP `403 Forbidden` com código comercial explícito.

---

## 20. Tenant Authorization Matrix (Matriz RBAC do Agent Studio)

A autorização multi-tenant é aplicada com base nos papéis organizacionais já existentes (`TenantRole`), sem criar sistemas paralelos de permissão:

| Ação | Descrição | OWNER | ADMIN | MANAGER | OPERATOR | VIEWER |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `agent.read` | Listar agentes, visualizar configurações e histórico | ✅ | ✅ | ✅ | ✅ | ✅ |
| `agent.create` | Criar novo Agente e seu primeiro Draft | ✅ | ✅ | ❌ | ❌ | ❌ |
| `agent.edit` | Modificar configurações do Draft ativo | ✅ | ✅ | ✅ | ❌ | ❌ |
| `agent.test` | Executar simulação de conversa em ambiente de teste | ✅ | ✅ | ✅ | ✅ | ❌ |
| `agent.publish`| Promover Draft para versão publicada ativa | ✅ | ✅ | ❌ | ❌ | ❌ |
| `agent.archive`| Arquivar agente ou versão histórica | ✅ | ✅ | ❌ | ❌ | ❌ |

- **Isolamento de Platform Admin**: Usuários com credencial de `Platform Admin` atuam no plano de suporte e governança global. Eles não herdam automaticamente permissões de tenant a menos que explicitamente vinculados como membros da organização.

---

## 21. Delete Policy (Política de Exclusão e Retenção)

- **Hard Delete Proibido para Versões Referenciadas**:
  - Uma `AgentVersion` que foi publicada ou associada a chamadas telefônicas históricas **nunca pode ser deletada fisicamente** (`DELETE FROM agent_versions`), sob pena de corromper a rastreabilidade jurídica e operacional da plataforma.
- **Política de Arquivamento**:
  - Agentes são arquivados (`status = 'ARCHIVED'`). O registro permanece visível em histórico de auditoria e relatórios analíticos, mas não pode receber novas chamadas nem novos drafts.
  - Drafts não publicados podem ser cancelados/descartados se o operador humano assim desejar antes da publicação.

---

## 22. First Vertical Slice (Primeiro Slice Implementável da Fase 5)

Para evitar pull requests massivas e garantir entregas verificáveis e estáveis, a Fase 5 é particionada em sub-fases coesas:

```
┌────────────────────────────────────────────────────────────────────────┐
│ PROMPT-005A: Decision Gate (Esta entrega — Desenho & Contratos)        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PROMPT-005B: Domain Core & Database Persistence                        │
│ - Schemas Drizzle: `agents` e `agent_versions` (PostgreSQL)            │
│ - Migration versionada incremental no packages/database                │
│ - Repositories tipados: AgentRepository, AgentVersionRepository        │
│ - Transação de publicação atômica e testes unitários/integração        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PROMPT-005C: API Framework, Internal Auth & /v1 Endpoints             │
│ - Configuração do framework HTTP em `apps/api` (Hono / Fastify)       │
│ - Implementação do Internal Service Auth (apps/web -> apps/api)        │
│ - Endpoints REST /v1: list, get, create, edit-draft, publish, archive │
│ - Contratos compartilhados em `packages/contracts` com OpenAPI        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PROMPT-005D: Frontend Agent Studio (apps/web UI)                      │
│ - Lista de agentes com filtros e status badges                        │
│ - Editor de Draft (Persona, Voz, Regras, Playbook, Ferramentas)       │
│ - Histórico de versões e botão de publicação com confirmação          │
│ - Design System unificado mobile-first / desktop                      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 23. API Boundary & Threat Model (Fronteira Web -> API e Modelo de Ameaça)

### O Bloqueio Atual
`apps/web` atua como BFF e gerencia sessões de usuários com Better Auth. No entanto, o acesso ao banco de domínio pertence a `apps/api`. A comunicação `apps/web` → `apps/api` está pendente de resolução formal de autenticação e confiança.

### Threat Model da Fronteira
1. **O Navegador NÃO é Confiável**:
   - O browser do cliente não pode se comunicar com `apps/api` passando headers arbitrários como `X-User-Id` ou `X-Organization-Id`. Qualquer usuário poderia forjar esses headers para sequestrar dados de outros tenants.
2. **BFF Headers não são Prova de Identidade sem Assinatura**:
   - Simplesmente encaminhar headers não assinados entre `apps/web` e `apps/api` cria vulnerabilidade de injeção direta caso a porta da API fique exposta na rede.
3. **Defesa em Profundidade**:
   - `apps/api` deve validar a autenticidade criptográfica de quem fez a chamada E revalidar no banco se o usuário possui acesso à organização e à ação requerida.

---

## 24. Internal Service Auth Options (Comparação de Mecanismos)

Três mecanismos técnicos foram analisados para autenticar chamadas `apps/web` → `apps/api`:

### Opção 1: Short-Lived HMAC / Asymmetric Signed Service Assertion (Recomendado)
- **Como Funciona**:
  - `apps/web` valida o cookie de sessão do Better Auth.
  - Ao chamar `apps/api`, `apps/web` emite uma asserção interna compacta assinada criptograficamente (JWT ou token HMAC com secret interno `INTERNAL_SERVICE_SECRET`).
  - **Payload**:
    ```json
    {
      "sub": "user_id_123",
      "orgId": "org_uuid_456",
      "iss": "apps/web",
      "aud": "apps/api",
      "exp": 1727092860, // TTL curto de 30 a 60 segundos
      "jti": "nonce_uuid"
    }
    ```
  - `apps/api` valida a assinatura e a expiração no middleware e extrai `userId` e `organizationId` autenticados.
- **Vantagens**:
  - Desacoplamento de rede total;
  - Zero chamadas adicionais de rede de `apps/api` para validar sessão;
  - TTL curto previne ataques de replay;
  - Funciona perfeitamente em dev local, Docker, staging e produção sem infraestrutura externa.

### Opção 2: Revalidação de Sessão Compartilhada via Better Auth
- **Como Funciona**:
  - `apps/web` repassa o header `Authorization: Bearer <sessionToken>` ou cookie recebido do browser diretamente para `apps/api`.
  - `apps/api` instancia cliente do Better Auth e executa `auth.api.getSession({ headers })` contra o banco para revalidar a sessão.
- **Vantagens**: Reutiliza a engine do Better Auth diretamente.
- **Desvantagens**:
  - Cada requisição à API realiza uma query extra ao banco apenas para validar a sessão que o BFF já validou;
  - Acopla `apps/api` à biblioteca Better Auth, violando a separação estrita de que Better Auth pertence ao BFF/Web.

### Opção 3: mTLS (Mutual TLS) + Unsigned Context Headers
- **Como Funciona**: Conexão de rede autenticada por certificados cliente/servidor mútuos.
- **Vantagens**: Padrão ouro em malhas corporativas de microsserviços.
- **Desvantagens**:
  - Complexidade operacional excessiva para o estágio atual do monorepo;
  - Dificulta enormemente a execução em desenvolvimento local de engenheiros e agentes de IA;
  - Incompatível com o princípio de simplicidade inicial (DEC-002).

### Recomendação Formal: **Opção 1 (Short-Lived Signed Service Assertion)**.

---

## 25. HTTP Framework Comparison for `apps/api` (Comparação Técnica com Fatos Context7)

A plataforma exige um framework HTTP moderno para `apps/api` compatível com Node 22/24 e TypeScript estrito:

| Critério | Fastify v5 | Hono v4 (com `@hono/node-server`) (Recomendado) |
| :--- | :--- | :--- |
| **Padrão Arquitetural** | Baseado em Node.js HTTP nativo, sistema de plugins encapsulados (`fastify-plugin`). | Baseado em Web Standards (`Request`/`Response`, Fetch API nativa do Node 22/24). |
| **Suporte a TypeScript** | Excelente via type providers (`@fastify/type-provider-typebox` ou `@fastify/type-provider-zod`). | Tipagem fim-a-fim nativa com inferência total de rotas e clientes RPC (`hc`). |
| **Integração OpenAPI** | `@fastify/swagger` + `@fastify/swagger-ui`. Fastify v5 exige JSON schema completo para querystrings e body. | `@hono/zod-openapi` oficial: define rotas, validações e documentação OpenAPI 3.0/3.1 em um único bloco coeso (`createRoute`). |
| **Overhead e Simplicidade** | Framework maduro, porém com curva de aprendizado de ciclo de vida e encapsulamento de contexto (`decorate`, escopo de plugins). | Extremamente enxuto, direto, sem boilerplate, com middleware trivial e API minimalista. |
| **Testabilidade** | `server.inject()` muito rápido. | `app.request()` nativo sem abrir portas de rede, suporte imediato com Vitest. |
| **Portabilidade de Runtime** | Estritamente Node.js. | Executa nativamente em Node 22/24, Docker, e pode ser portado para Edge/Serverless se necessário. |
| **Manutenibilidade por IA** | Exige gerenciamento cuidadoso de plugins e tipos de request decorators. | Código plano, linear, altamente idiomático e com baixíssimo índice de alucinação sintática por modelos de IA. |

### Fatos Observados via Context7:
- **Fastify (`/fastify/fastify`)**: Na v5, a opção simplificada `jsonShortHand` foi removida, exigindo JSON schema explícito ou integração via type providers.
- **Hono (`/websites/hono_dev`)**: O pacote `@hono/zod-openapi` integra nativamente a criação de rotas tipadas com Zod, gerando especificação OpenAPI em `/doc` e interface Swagger UI sem duplicar definições de tipos.

### Recomendação Formal: **Hono (com `@hono/node-server` e `@hono/zod-openapi`)** para `apps/api`.
*(Alternativa aceitável: Fastify v5 com TypeBox/Zod caso haja preferência explícita do operador humano).*

---

## 26. Domain Types & Conceptual Contracts (Contratos Iniciais)

Para orientar a implementação na Fase 5B/5C, definem-se os contratos conceituais essenciais:

```typescript
// Identificadores Tipados
export type AgentId = string;         // UUID
export type AgentVersionId = string;  // UUID
export type AgentStatus = 'ACTIVE' | 'ARCHIVED';
export type AgentVersionStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

// Comandos de Domínio
export interface CreateAgentCommand {
  readonly organizationId: string;
  readonly name: string;
  readonly slug?: string;
  readonly createdBy: string;
}

export interface CreateDraftCommand {
  readonly agentId: string;
  readonly organizationId: string;
  readonly sourceVersionId?: string; // Clona de versão publicada se omitido
  readonly createdBy: string;
}

export interface UpdateDraftCommand {
  readonly agentId: string;
  readonly versionId: string;
  readonly organizationId: string;
  readonly configuration: AgentConfigurationSnapshot;
  readonly changelog?: string;
  readonly updatedBy: string;
}

export interface PublishAgentVersionCommand {
  readonly agentId: string;
  readonly versionId: string;
  readonly organizationId: string;
  readonly publishedBy: string;
}

export interface ArchiveAgentCommand {
  readonly agentId: string;
  readonly organizationId: string;
  readonly archivedBy: string;
}
```

---

## 27. Eventos de Domínio do Agente

Seguindo o envelope padrão de eventos da plataforma (`DomainEvent` com versionamento e `correlationId`):

1. `agent.created` (v1): Disparado na criação de um novo agente.
2. `agent.draft_created` (v1): Disparado na geração de um novo draft.
3. `agent.draft_updated` (v1): Disparado na modificação da configuração do draft.
4. `agent.version_published` (v1): Disparado na promoção de uma versão para produção (consumidores futuros: motor de voz, telemetria de catálogo).
5. `agent.archived` (v1): Disparado no arquivamento do agente.

---

## 28. Error Model & HTTP Mapping (Mapeamento de Erros)

Mapeamento determinístico dos erros de domínio para o envelope HTTP padronizado da API:

| Erro de Domínio | Classe Base | HTTP Status | Código HTTP |
| :--- | :--- | :---: | :--- |
| Validação de Schema inválida | `ValidationError` | `400` | `VALIDATION_ERROR` |
| Asserção de serviço inválida/expirada | `UnauthorizedError` | `401` | `UNAUTHORIZED` |
| Falta de permissão no tenant (RBAC) | `ForbiddenError` | `403` | `FORBIDDEN` |
| Limite de agentes excedido (`agents.max`)| `EntitlementExceededError` | `403` | `ENTITLEMENT_EXCEEDED` |
| Agente ou versão não encontrada | `NotFoundError` | `404` | `NOT_FOUND` |
| Tentativa de publicar com outro publish em curso / Race Condition | `ConflictError` | `409` | `STATE_CONFLICT` |
| Violação de transição de estado (ex: editar versão publicada) | `AppError` | `422` | `UNPROCESSABLE_ENTITY` |
| Falha interna inesperada | `AppError` | `500` | `INTERNAL_ERROR` |

---

## 29. Security & Confidentiality of Configuration

1. **Classificação de Dados**: A configuração do agente (instruções, regras comerciais, exemplos) contém propriedade intelectual confidencial do tenant. Deve ser isolada rigidamente por `organizationId`.
2. **Proibição de Logs Brutos**: É proibido imprimir prompts completos ou regras comerciais em logs de requisição da API (`packages/logger` deve redigir payloads extensos de configuração).
3. **Prevenção de Prompt Injection**: O design de Business Rules determinísticas (validação de código de descontos e limites) impede que prompt injections no canal de voz forcem comportamentos comerciais proibidos.

---

## 30. UI Information Architecture (Visão Geral de Telas do Agent Studio)

A interface em `apps/web` adotará arquitetura de informação com *Progressive Disclosure*:
1. **Lista de Agentes (`/agents`)**: Tabela responsiva com busca, status (`ACTIVE` / `ARCHIVED`), versão publicada atual, data de modificação e indicador de draft pendente.
2. **Visão do Agente (`/agents/:id`)**:
   - Header com status, número da versão publicada e ações primárias (*Publicar Draft*, *Descartar Draft*, *Novo Draft*);
   - Abas do Editor:
     - **Identidade & Persona**: Nome, papel, tom, estilo conversacional;
     - **Regras & Limites**: Diretrizes conversacionais e limites determinísticos;
     - **Voz**: Seletor neutro de voz, velocidade e estabilidade;
     - **Playbook**: Roteiro e tratamento de objeções;
     - **Ferramentas**: Toggles das ferramentas habilitadas;
     - **Exemplos**: Cadastro de diálogos de calibração;
     - **Histórico de Versões**: Linha do tempo de versões publicadas com changelog.

---

## 31. Resumo das Decisões Propostas (Proposed Decisions)

As seguintes propostas aguardam aprovação humana explícita:

1. **PROPOSAL-005A-1**: Adoção do modelo de **Agente com Identidade Estável (`Agent`) + Versões Imutáveis (`AgentVersion`)** com versionamento monotônico inteiro por agente.
2. **PROPOSAL-005A-2**: Adoção da **Opção C (Híbrido Relacional + Snapshot JSONB Tipado e Validado)** para persistência do Agent Studio.
3. **PROPOSAL-005A-3**: Ciclo de vida com **Single Active Draft** por agente (`DRAFT → PUBLISHED → ARCHIVED`), tratando `TEST` como atividade/execução pontual e não como estado persistido de versão.
4. **PROPOSAL-005A-4**: Publicação atômica em transação determinística com lock pessimista da linha do agente.
5. **PROPOSAL-005A-5**: Mecanismo de **Internal Service Auth via Short-Lived Signed Service Assertion (JWT/HMAC)** entre `apps/web` e `apps/api`.
6. **PROPOSAL-005A-6**: Framework HTTP de `apps/api`: **Hono com `@hono/node-server` e `@hono/zod-openapi`** (alternativa documentada: Fastify v5).
7. **PROPOSAL-005A-7**: Particionamento da Fase 5 nos slices: `005B` (Domínio & Persistência), `005C` (API & Internal Auth), `005D` (Frontend UI).

---

## 32. Decisões Postergadas (Deferred / Pending Decisions)

- **Vector Database / RAG Pipeline**: `DEFERRED` para a Fase 7.
- **Provider Concreto de Síntese de Voz**: `PENDING` para a Fase 6.
- **Framework de LLM Evals Automatizados**: `PENDING` para a Fase 9.
- **Recurso de Banco e Topologia de Produção**: `NOT PROVISIONED` (Pendente de desenho de produção).
- **Provedor de Fila / Cache Efêmero**: `PENDING` (Redis/BullMQ).
- **Usage Persistence**: `DEFERRED`.

---

## 33. Checklist para Aprovação Humana (Human Review Required)

- [ ] Aprova a modelagem canônica de `Agent` (identidade estável) e `AgentVersion` (histórico imutável)?
- [ ] Aprova a persistência híbrida (metadados relacionais + snapshot JSONB tipado e validado)?
- [ ] Aprova a regra de versão `Single Active Draft` com ciclo `DRAFT → PUBLISHED → ARCHIVED`?
- [ ] Aprova a asserção interna assinada de curta duração para autenticação entre `apps/web` e `apps/api`?
- [ ] Aprova a escolha preliminar do framework Hono para `apps/api` (ou prefere Fastify v5)?
- [ ] Autoriza o início da implementação do primeiro slice na Fase 5B (`Domain Core & Database Persistence`)?
