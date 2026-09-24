# Agent Studio — Conceito, Componentes e Versionamento (AGENT_STUDIO.md)

> **Status**: Slices 005B e 005C Implementados (005B Staging Validated; 005C Local/Integration Validated) — Slice 005D Pendente
> **Fase de Planejamento**: FASE 5 (Domínios Base & Agent Studio)
> **Data de Criação**: 21 de Setembro de 2026
> **Data de Aceitação Arquitetural**: 23 de Setembro de 2026 (Aprovação Humana Formal)

Este documento formaliza o conceito de **Agent Studio** como subsistema central da plataforma, definindo os agregados de domínio (`Agent` e `AgentVersion`), o ciclo de vida formal, as regras de publicação e integridade, e o escopo de evolução por fases.

> [!IMPORTANT]
> **ARCHITECTURE ACCEPTED vs IMPLEMENTED**: A arquitetura de domínio, versionamento, persistência e invariantes de integridade do Agent Studio foram formalmente aceitas via **DEC-028** e **ADR-009** (Aprovação Humana em 2026-09-23). A implementação técnica ocorre de forma particionada: Slice 005B (`packages/database` e `packages/contracts`: IMPLEMENTED / STAGING VALIDATED), Slice 005C (`apps/api` e internal service auth: IMPLEMENTED LOCAL / INTEGRATION TESTED) e Slice 005D (`apps/web` UI: NOT STARTED). Nenhuma implementação prévia deve ser presumida antes da conclusão dos respectivos slices.

---

## 1. Visão do Agent Studio

O **Agent Studio** é o ambiente de configuração e evolução de agentes de voz disponibilizado às empresas clientes da plataforma. Seu princípio central é:

> **Empresas devem poder criar, configurar, testar, publicar e evoluir seus agentes de voz sem editar código.**

O Agent Studio não se baseia em fine-tuning obrigatório de modelos de linguagem. A configuração do agente é realizada por composição de componentes declarativos e dados estruturados.

---

## 2. Componentes Configuráveis de um Agente

Um agente de voz é modelado como a composição dos seguintes componentes independentes:

### 2.1. Identidade e Persona
- **Nome do Agente**: Nome pelo qual o agente se apresenta ao interlocutor.
- **Função / Papel**: Ex.: Consultor de vendas, Agente de cobrança, Atendente de suporte.
- **Objetivos**: O que o agente deve alcançar ao final de cada chamada.

### 2.2. Personalidade e Estilo Conversacional
- **Personalidade**: Traços de comportamento do agente (ex.: empático, direto, formal, descontraído).
- **Tom de Voz**: Tom emocional predominante da conversa (ex.: calmo, entusiasta, profissional).
- **Estilo de Fala**: Vocabulário preferencial, nível de formalidade, uso de pausas e marcadores conversacionais.

### 2.3. Instruções e Regras
- **Instruções Gerais**: Diretrizes de comportamento conversacional.
- **Regras**: Restrições operacionais a seguir (ex.: nunca prometer prazo que não tenha confirmação determinística).
- **Limites**: O que o agente não pode fazer ou prometer.
- **Comportamento Proibido**: Lista explícita de ações vedadas ao agente.

### 2.4. Ferramentas Autorizadas (Toolset)
- Conjunto de ferramentas determinísticas que o agente pode invocar durante a chamada.
- Exemplos: `checkProductPrice`, `checkAvailability`, `scheduleAppointment`, `lookupCustomer`.
- Cada ferramenta tem escopo restrito ao `organizationId` do tenant.
- O agente só pode invocar ferramentas explicitamente habilitadas em sua configuração publicada.

### 2.5. Dados de Negócio e Catálogo
- **Produtos e Serviços**: Referência ao catálogo determinístico consultável via tool calling.
- **Regras Comerciais**: Políticas de desconto, condições especiais e limites.

### 2.6. Base de Conhecimento (Knowledge Base)

A base de conhecimento do agente é separada conceitualmente em duas camadas:

#### Dados Estruturados (Consulta Determinística)
Informações que devem ser consultadas por código determinístico, nunca dependendo de RAG para precisão:
- Produtos, preços e especificações;
- Estoque e disponibilidade;
- Clientes e histórico de relacionamento;
- Regras comerciais e políticas de desconto;
- Agendamentos e disponibilidade de calendário.

> [!IMPORTANT]
> Dados determinísticos **nunca** devem depender exclusivamente de RAG (Retrieval-Augmented Generation). Eles são acessados via tool calling com código testável.

#### Conhecimento Não Estruturado (Referência Contextual)
Documentos que o agente pode consultar como contexto conversacional:
- PDFs de manuais e catálogos;
- FAQs e políticas internas;
- Documentação de produtos e serviços;
- Scripts e roteiros de vendas;
- Perguntas e respostas frequentes.

### 2.7. Playbooks e Fluxos Conversacionais
- **Playbooks**: Roteiros estruturados para situações específicas (abertura da chamada, tratamento de objeções, encerramento).
- **Objeções**: Respostas pré-configuradas para objeções comerciais comuns.
- **Exemplos de Conversa**: Exemplos de diálogos ideais para calibração de tom e abordagem.

### 2.8. Voz e Síntese
- **VoiceConfig**: Configuração de voz sintética (timbre, velocidade, idioma, sotaque).
- Selecionável a partir de catálogo de vozes do provider configurado (Pending Decision).

### 2.9. Transferência para Humano (Human Handoff)
- Condições configuráveis que disparam transferência para operador humano.
- Resumo de contexto a ser disponibilizado ao operador no momento da transferência.
- Consulte a seção 6 deste documento para o requisito completo de Human Handoff.

### 2.10. Configurações de Atendimento
- Horários de operação permitidos;
- Número máximo de tentativas por contato;
- Tempo máximo de chamada;
- Comportamento em caso de não atendimento ou caixa postal.

### 2.11. Avaliações, Testes e Métricas
- Cenários de avaliação vinculados ao agente;
- Métricas de performance (taxa de sucesso de objetivo, tempo médio de chamada, taxa de transferência).

### 2.12. Versões
- Histórico completo de versões publicadas com data, autor e diff conceitual.
- Capacidade de comparar versões lado a lado.

---

## 3. Modelo de Domínio e Versionamento de Agentes (DEC-028 / ADR-009)

### 3.1. Agregados do Domínio: Identidade Estável vs. Configuração Versionada

Para garantir desacoplamento entre a entidade de negócio e suas alterações operacionais frequentes, adota-se a separação estrita em dois agregados:

1. **`Agent` (Aggregate Root — Identidade Estável)**:
   - Representa a âncora relacional e comercial do agente dentro do tenant (`organizationId`).
   - Atributos centrais: `id` (UUID), `organizationId` (UUID), `name`, `slug`, `status` (`ACTIVE` / `ARCHIVED`), `createdAt`, `updatedAt`.
   - **Não armazena prompts, parâmetros de voz ou regras de negócio em colunas soltas**.
   - **Não possui ponteiro redundante de versão publicada** (`currentPublishedVersionId` foi expressamente rejeitado para evitar dual source of truth).
   - **Ciclo de Vida do Agent**: `ACTIVE` <──► `ARCHIVED`.
   - **Isolamento de Estado**: Arquivar um agente **não altera nem remove** a versão `PUBLISHED` existente em `agent_versions`. Reativar um agente **não cria nem publica** nenhuma versão implicitamente e deve revalidar a quota `agents.max`.

2. **`AgentVersion` (Configuração Versionada 1:N)**:
   - Representa um snapshot declarativo e auditável de configuração associado a um agente.
   - Atributos centrais: `id` (UUID), `agentId` (UUID FK), `organizationId` (UUID FK), `versionNumber` (inteiro monotônico crescente), `status` (`DRAFT`, `PUBLISHED`, `ARCHIVED`), `configurationSchemaVersion` (inteiro NOT NULL sem default), `configuration` (JSONB validado por schema), `changelog`, `createdBy`, `publishedAt`, `publishedBy`, `createdAt`, `updatedAt`.

---

### 3.2. Ciclo de Vida Canônico da Versão e Supersessão do Lifecycle Anterior

```
┌────────────────────────────────────────────────────────┐
│   Ciclo Canônico de Versão (AgentVersion.status):      │
│                                                        │
│         DRAFT ──────► PUBLISHED ──────► ARCHIVED       │
│           │                                            │
│           └─► (Descarte Físico / Hard Delete)          │
└────────────────────────────────────────────────────────┘
```

#### Estados Canônicos:
- **`DRAFT`**: Rascunho em edição. Não afeta chamadas em produção. Cada agente pode possuir no máximo **um único DRAFT ativo por vez**, garantido por índice parcial único no banco:
  ```sql
  CREATE UNIQUE INDEX unique_active_draft_per_agent 
  ON agent_versions (agent_id) 
  WHERE status = 'DRAFT';
  ```
- **`PUBLISHED`**: Versão ativa em produção e **FONTE ÚNICA DA VERDADE** da versão publicada atual. No máximo **uma versão publicada por agente**, garantida fisicamente por índice parcial único:
  ```sql
  CREATE UNIQUE INDEX unique_published_version_per_agent 
  ON agent_versions (agent_id) 
  WHERE status = 'PUBLISHED';
  ```
- **`ARCHIVED`**: Versão histórica arquivada após publicação de uma versão mais nova. Preservada para histórico, comparação e auditoria.

#### Nota de Supersessão Formal (2026-09-23):
> **SUPERSESSÃO DE `TEST` COMO STATUS**: O ciclo de vida conceitual anterior (`DRAFT → TEST → PUBLISHED → ARCHIVED`) foi **formalmente superado**. O estado `TEST` deixa de ser um status persistente da entidade `AgentVersion` e passa a ser modelado como uma **atividade/execução de validação independente** (*Agent Test Run / Validation Activity*). Rascunhos (`DRAFT`) ou versões ativas podem ser submetidos a simulações de teste sem que o status relacional da versão seja poluído com estados transitórios. Esta alteração é um registro formal de supersessão arquitetural e não constitui apagamento histórico.

---

### 3.3. Invariantes de Domínio e Políticas de Integridade

1. **Imutabilidade Estrita de Versões Publicadas e Arquivadas**:
   - Uma vez que uma versão atinge o status `PUBLISHED` ou `ARCHIVED`, seu conteúdo de configuração (`configuration`) e metadados tornam-se **estritamente imutáveis**.
   - Qualquer ajuste exige a geração de um novo `DRAFT` derivado.
2. **Política de Descarte de Rascunhos (Draft Discard)**:
   - Um `DRAFT` que nunca foi publicado pode ser fisicamente descartado (*hard delete*), liberando o slot de draft para o agente.
   - Condições obrigatórias para descarte: validação de tenant (`organizationId`), autorização do usuário, inexistência de referências históricas ou de auditoria vinculadas à versão.
   - O descarte pode gerar lacunas na numeração `versionNumber`, o que é aceito arquiteturalmente (a numeração é estritamente monotônica crescente por agente, mas não contígua).
3. **Versionamento Explícito de Schema (`configuration_schema_version`)**:
   - A coluna `configuration_schema_version` é obrigatória, positiva (`CHECK (configuration_schema_version > 0)`) e explícita, sem valor default implícito.
4. **Governança de Quotas (`agents.max`) e Concorrência**:
   - O entitlement `agents.max` afere a quantidade de agregados `Agent` com `status = 'ACTIVE'` na organização.
   - Operações de `Create Agent` e `Reactivate Agent` consomem/verificam `agents.max`. Publicar uma nova versão de um agente já ativo não consome quota adicional.
   - Para prevenir *race conditions* de estouro de cota, as operações de criação e reativação serializam a concorrência via lock pessimista transacional na linha da `Organization` (`SELECT id FROM organizations WHERE id = $1 FOR UPDATE`).

---

### 3.4. Escopo do Snapshot Declarativo v1 e Deferrals por Fase

O snapshot de configuração armazenado no campo `configuration` (JSONB) no Slice 005B contempla estritamente o que possui semântica executável real:
- **Snapshot v1 (Fase 5)**:
  - **Persona / Identidade Básica**: nome operacional, papel, objetivos.
  - **Idioma e Locale**: idioma base (ex.: `pt-BR`, `en-US`).
  - **Instruções e Regras**: diretrizes operacionais determinísticas e limites de comportamento.
  - **Playbooks e Exemplos**: diálogos de referência quando contemplados pelo schema v1.
- **Capacidades Diferidas (Deferred)**:
  - **Voice Avançado**: Parâmetros de síntese e provedores reais diferidos para a **Fase 6** (*Motor de Voz*).
  - **Execução Real de Tools**: Registro dinâmico de tools e sandboxing diferidos para a **Fase 7** (*Agente IA e Tools*).
  - **Knowledge Base e RAG**: Ingestão de embeddings vetoriais e busca semântica diferidos para a **Fase 7**.

---

### 3.5. Rastreabilidade por Chamada e Matriz de Permissões (RBAC)

1. **Rastreabilidade**: Futuras chamadas telefônicas e logs de execução registrarão a tupla imutável `(agentId, agentVersionId)`.
2. **Proteção Confidencial (RBAC)**:
   - `agent.read`: Permissão para visualizar metadados do agente (nome, status, versão atual publicada, datas).
   - `agent.config.read`: Permissão segregada e restrita a perfis com privilégio superior (ex.: `MANAGER`, `ADMIN`, `OWNER`) para acessar regras de prompt, instruções e conteúdos confidenciais de negócio.

---

## 4. Agent Evals (Avaliações de Agente)

### 4.1. Propósito

O subsistema de avaliações permite que, antes de publicar uma nova versão de agente em produção, sejam executados cenários de teste controlados e comparações entre versões.

### 4.2. Cenários de Avaliação (Exemplos)

Os cenários de avaliação cobrem situações que o agente deve saber lidar:

| Cenário | Comportamento Esperado |
|:---|:---|
| Cliente solicita preço de produto | Invocar tool determinística; não inventar preço |
| Produto inexistente | Comunicar ausência; não alucinar produto |
| Tool indisponível (timeout/erro) | Tratar erro graciosamente; não travar |
| Cliente interrompe (barge-in) | Parar imediatamente; ouvir e responder |
| Cliente solicita falar com humano | Identificar intenção; iniciar handoff com contexto |
| Tentativa de obter desconto proibido | Recusar com elegância; não ceder fora da política |
| Informação desconhecida | Admitir desconhecimento; não alucinar |
| Objeção comercial | Aplicar playbook de objeções configurado |
| Silêncio prolongado | Tratar conforme política de silêncio configurada |
| Encerramento da ligação | Encerrar de forma educada; registrar desfecho |

### 4.3. Comparação entre Versões

As avaliações devem permitir:
- Executar o mesmo conjunto de cenários em duas ou mais versões do agente.
- Comparar resultados quantitativos (taxa de acerto, tempo de resposta, taxa de handoff).
- Gerar relatório de diferenças para suportar decisão de publicação.

### 4.4. Requisito de Isolamento

- Avaliações nunca chamam provedores de telefonia pagos reais.
- Avaliações usam fakes de áudio e simuladores de conversação.
- O framework de eval será definido futuramente (Status: Pending Decision).

---

## 5. Feedback Supervisionado

O sistema deve prever futuramente um fluxo de melhoria contínua de agentes baseado em feedback humano:

```
Chamada encerrada
       │
       ▼
Supervisor revisa transcrição + áudio
       │
       ├── Feedback positivo: marca como exemplo positivo
       ├── Feedback negativo: identifica falha
       │       │
       │       ▼
       │   Sugestão de melhoria (resposta esperada)
       │       │
       │       ▼
       │   Revisão humana da sugestão
       │       │
       │       ▼
       │   Geração de nova versão DRAFT
       │       │
       │       ▼
       │   Testes (Agent Evals)
       │       │
       │       ▼
       │   Publicação aprovada pelo humano
       │
       └── Ciclo continua
```

> [!CAUTION]
> **Regra inviolável**: Nenhuma avaliação negativa ou feedback automático pode alterar diretamente um agente em produção (PUBLISHED) sem revisão humana e publicação de nova versão.

---

## 6. Human Handoff (Transferência para Humano)

A transferência para operador humano é uma capacidade fundamental do produto, não um caso de exceção.

### 6.1. Requisito Conceitual

O agente de voz deve ser capaz de:
1. **Identificar a necessidade de transferência**: Seja por solicitação explícita do cliente, por limite de competência do agente, por regra de negócio ou por falha técnica.
2. **Comunicar a transição**: Informar o cliente de forma natural que será transferido.
3. **Preservar o contexto**: Gerar resumo estruturado da conversa até o ponto de transferência.
4. **Executar a transferência**: Acionar o mecanismo de transferência de chamada via `TelephonyProvider`.
5. **Disponibilizar resumo ao operador**: O operador humano recebe, antes de atender, um briefing com o contexto da conversa.

### 6.2. Condições de Transferência Configuráveis
- Solicitação explícita do cliente ("quero falar com uma pessoa");
- Tópico fora do escopo do agente;
- Número máximo de tentativas frustradas;
- Escalada por regra de negócio (ex.: reclamação formal);
- Falha técnica persistente (tool unavailable).

### 6.3. Status de Implementação
**Status: Requisito Documentado — Não implementado.**
A implementação ocorrerá nas fases de Motor de Voz (FASE 6) e Telefonia Real (FASE 8) do roadmap.

---

## 7. Status de Decisões Arquiteturais do Agent Studio

| Tópico | Status | Referência |
|:---|:---|:---|
| **Agregados, Versionamento e Ciclo de Vida** | **Decided / Accepted** | DEC-028 / ADR-009 (Aprovação Humana em 2026-09-23) |
| **Persistência Relacional e Domínio Base (005B)** | **STAGING MIGRATED / STAGING INTEGRATION TESTED** | DEC-028 / ADR-009 / DEC-030 / ADR-011 (PR #8 Merged) |
| **Formato de Persistência (Metadados + JSONB)** | **Decided / Accepted** | DEC-028 / ADR-009 (Opção C: Relacional + JSONB) |
| **Biblioteca de Validação de Schema (Zod)** | **Decided / Accepted** | DEC-028 / ADR-009 (`packages/contracts`, instalação no Slice 005B) |
| **APIs HTTP, OpenAPI 3.1.0 e Internal Service Auth (005C)** | **IMPLEMENTED LOCAL / INTEGRATION TESTED** | DEC-029 / ADR-010 / DEC-031 / ADR-012 |
| **Interface do Agent Studio (Web UI) (005D)** | **NOT STARTED** | FASE 5 (Slice 005D) |
| **Provider de síntese de voz (VoiceConfig)** | **Deferred Fase 6** | Motor de Voz (FASE 6) |
| **Execução Real de Tools** | **Deferred Fase 7** | Agente IA e Tools (FASE 7) |
| **Estratégia de RAG para Knowledge Base** | **Deferred Fase 7** | Agente IA e Tools (FASE 7) |
| **Framework de Agent Evals** | **Pending Decision** | Observabilidade e Evals (FASE 9) |
