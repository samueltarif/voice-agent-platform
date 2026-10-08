# ADR-020: Knowledge Base / RAG Architecture & Domain Contracts

- **Status**: Proposed
- **Data**: 2026-10-08
- **Branch**: `feat/007g-knowledge-base-rag-architecture-contracts`

---

## Context (Contexto)

A Fase 7 exige uma decisão arquitetural formal sobre Knowledge Base / RAG, marcada como pendente desde a fundação (`ROADMAP.md`: "Knowledge Base: integração de dados estruturados (determinístico) e não estruturados (RAG — Pending Decision)"; `AGENT_STUDIO.md` Seção 2.6 separa dados estruturados de conhecimento não estruturado; `AI_CONTEXT.md`: `RAG_ARCHITECTURE_DECISION = PENDING`, `KNOWLEDGE_BASE_DOMAIN = NOT_IMPLEMENTED`).

A descoberta no HEAD `91a402a` confirmou ausência total de domínio de Knowledge Base: nenhum contrato, tabela, porta de retrieval ou porta de embedding existe em `packages/contracts`, `packages/database`, `packages/integrations`, `apps/voice`, `apps/worker` ou `apps/api` (única menção é um teste negativo que rejeita `knowledgeDocumentIds` no snapshot v1 da configuração do agente). O caminho determinístico vigente para dados de negócio é: repositórios tenant-scoped (`CatalogRepository`) + ferramentas determinísticas (`catalog.search`, `catalog.item_detail`, `agent.operating_hours`) executadas via `ToolExecutionEngine`/`InMemoryToolRegistry` sob autoridade de `AgentVersion` publicada. O `StorageProvider` permanece `Pending Decision` (`INTEGRATIONS.md`).

Este ADR resolve a decisão pendente no nível de ARQUITETURA + CONTRATOS, sem ativar runtime de ingestão, indexação, retrieval, provedores de embedding, vector stores, upload real, parsing de documentos, UI ou tráfego de clientes.

---

## Decision (Decisão)

### 1. Fronteira estruturado vs. não estruturado

- `STRUCTURED_DATA_AUTHORITY = DATABASE_AND_DETERMINISTIC_TOOLS`
- `UNSTRUCTURED_KNOWLEDGE_PATH = KNOWLEDGE_BASE_RETRIEVAL`
- `RAG_MAY_OVERRIDE_STRUCTURED_AUTHORITY = NO`

Dados estruturados autoritativos (itens de catálogo, preços, produtos/serviços, horários de operação e demais fatos relacionais autoritativos) permanecem consultas determinísticas a banco/ferramentas quando disponíveis. O RAG nunca se torna segunda fonte da verdade para esses dados e nunca pode sobrescrever a autoridade estruturada.

### 2. Camadas provider-neutral

A arquitetura separa oito conceitos: (1) documento-fonte, (2) conceito de job/solicitação de ingestão (deferred), (3) conteúdo normalizado, (4) chunk, (5) representação de embedding/índice opcional, (6) consulta de retrieval, (7) resultado de retrieval, (8) citação/referência de fonte. Nenhum contrato é acoplado a OpenAI, Supabase, pgvector, Pinecone, Qdrant, Weaviate, dimensões de embedding ou IDs de modelo. Todo provedor futuro implementa uma porta neutra.

### 3. Ciclo de vida do documento

- `DOCUMENT_LIFECYCLE = DECIDED`
- Estados: `PENDING` → `PROCESSING` → `READY` | `FAILED`; `ARCHIVED` como estado terminal de retenção a partir de `READY` ou `FAILED`.
- Transições válidas são explícitas e determinísticas; saída de LLM/provedor nunca decide transições de lifecycle.

### 4. Proveniência (`SOURCE_PROVENANCE = DECIDED`)

Todo chunk/resultado rastreia: organização, documento, tipo de fonte, localizador/referência de fonte, identidade do chunk e identidade de conteúdo/versão. URLs assinadas de storage são preocupação de transporte, nunca autoridade semântica durável, e nunca aparecem como campos públicos de citação.

### 5. Identidade de conteúdo

Arquitetura declara um conceito neutro de identidade de conteúdo/checksum para detecção determinística de duplicatas futuras. `LLM output is NOT used as an idempotency key.` Nenhuma infraestrutura de hashing é implementada neste slice além dos campos de contrato e testes.

### 6. Chunking (`CHUNKING_RESPONSIBILITY = DECIDED`)

A política de chunking é configurável e versionada (`chunkingPolicyVersion`), determinística para uma dada política + documento normalizado, com identidade de chunk estável sob as mesmas entradas. O chunker é independente do provedor de embedding; o modelo do provedor não decide autoridade de tenant. Limites numéricos neste slice são defaults de engenharia, não requisitos constitucionais.

### 7. Retrieval (`RETRIEVAL_PORT_BOUNDARY = DECIDED`)

A porta neutra exige: escopo de organização confiável, consulta textual, top-K limitado (`KNOWLEDGE_RETRIEVAL_MAX_TOP_K = 20` como default de engenharia), filtragem opcional por documento/fonte quando justificada, hits com proveniência completa e escore de relevância provider-neutral sem comparabilidade global entre provedores. O payload da requisição nunca sobrescreve a autoridade de tenant.

### 8. Embedding/índice

Somente o contrato neutro da porta é definido. Alternativas futuras (PostgreSQL/pgvector, vector stores hospedados, keyword/hybrid retrieval) permanecem possíveis sem que nenhuma seja obrigatória em 007G. `VECTOR_STORAGE_PROVIDER = NOT_BOUND_IN_007G`, `EMBEDDING_PROVIDER = NOT_BOUND_IN_007G`. PostgreSQL/pgvector é registrado apenas como candidato futuro, sem fiação ativa.

### 9. Relação com AgentVersion (`AGENT_KNOWLEDGE_ACCESS_BOUNDARY = DECIDED_OR_EXPLICITLY_DEFERRED_WITH_REASON`)

- `KNOWLEDGE_ACCESS_AUTHORITY = SERVER_SIDE`
- `MODEL_MAY_SELECT_ARBITRARY_TENANT_KNOWLEDGE = NO`
- Nenhum agente recebe silenciosamente acesso a todos os documentos da organização. Consultas carregam um escopo de acesso resolvido no servidor (`organizationId` obrigatório + `agentId`/`agentVersionId`/coleção opcional), seguindo os padrões de autoridade de toolset de `AgentVersion`. A política exata de binding (por organização, agente, versão ou coleções) é explicitamente diferida para o slice de persistência/runtime, em vez de inventar permissões sem justificativa.

### 10. Segurança

- `RETRIEVED_CONTENT_TRUST = UNTRUSTED_DATA`
- `RETRIEVED_CONTENT_MAY_OVERRIDE_SYSTEM_POLICY = NO`
- Isolamento por tenant, semântica de deleção/arquivamento, documentos com segredos, injeção de prompt contida em documentos (conteúdo recuperado é dado não confiável, sem elevação de permissões a partir de texto), nenhum provedor decidindo autorização e nenhum dado de transcrição/cliente enviado externamente neste slice.

### 11. Política de persistência e runtime

- `DATABASE_SCHEMA_CHANGED = NO`, `MIGRATION_CREATED = NO`, `API_CHANGED = NO`, `WORKER_CHANGED = NO`, `VOICE_CHANGED = NO`.
- `INGESTION_RUNTIME = DEFERRED`, `RETRIEVAL_RUNTIME = DEFERRED`.
- Tabelas de Knowledge Base pertencem ao slice posterior de ingestão/runtime, após revisão destes contratos/ADR.

---

## Alternatives Considered (Alternativas Consideradas)

1. **RAG como fonte única para todos os dados, incluindo preços e regras**: descartada — viola DEC-008 (LLM não é fonte da verdade para regras críticas) e `AGENT_STUDIO.md` Seção 2.6.
2. **Acoplamento direto a um vector store concreto (pgvector/hospedado) já em 007G**: descartado — criaria lock-in antes da decisão de persistência e violaria o padrão Provider/Adapter (DEC-004/ADR-004).
3. **Acesso irrestrito de todo agente a todos os documentos do tenant**: descartado — viola menor privilégio (`SECURITY.md` Seção 3) e os padrões de autoridade de `AgentVersion`.
4. **Scores de relevância globalmente comparáveis entre provedores**: descartado — semântica de escore é específica de cada implementação; contratos declaram explicitamente a não comparabilidade.

---

## Consequences (Consequências)

### Positivas:

- Decisão RAG pendente resolvida em nível arquitetural sem ativar custos, rede ou provedores.
- Contratos provider-neutral testados offline permitem slices futuros de persistência, ingestão e retrieval sem reescrever autoridade, tenant isolation ou proveniência.
- Fronteira estruturado/RAG impede que conhecimento não estruturado corrompa fatos autoritativos de negócio.

### Negativas / Desafios:

- Nenhuma capacidade funcional de Knowledge Base existe ainda para usuários (persistência, ingestão e retrieval seguem `NOT_IMPLEMENTED`/`DEFERRED`).
- A política exata de binding agente↔conhecimento exigirá decisão dedicada no próximo slice.
- A escolha do vector store (incluindo pgvector como candidato) permanece em aberto até evidência de persistência.
