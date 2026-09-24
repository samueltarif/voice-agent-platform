# Arquitetura do Sistema (ARCHITECTURE.md)

Este documento descreve a visão arquitetural do sistema, estabelecendo as fronteiras dos módulos, o fluxo de dados e dependências, e a separação de responsabilidades da plataforma SaaS B2B de agentes de voz com IA.

---

## 1. Visão Geral da Arquitetura

O sistema é concebido como um **Monorepo Modular** centrado no domínio do negócio, estruturado em fatias verticais (*vertical slices*) e guiado por contratos estritos.

```
                  ┌─────────────────────────────────────────┐
                  │          Frontend (apps/web)            │
                  │   Dashboard B2B Responsivo Mobile-First │
                  └────────────────────┬────────────────────┘
                                       │ HTTPS / WSS
                                       ▼
┌──────────────────────────┐      ┌─────────────────────────┐
│   Telefonia / Provedor   │◄────►│   API Gateway / Core    │
│       (Webhooks/SIP)     │      │       (apps/api)        │
└─────────────┬────────────┘      └────────────┬────────────┘
              │                                │
              │ Audio Streams                  │ Eventos / Jobs
              ▼                                ▼
┌──────────────────────────┐      ┌─────────────────────────┐
│   Voice Engine Service   │      │   Worker Assíncrono     │
│      (apps/voice)        │      │      (apps/worker)      │
│  Orquestrador Realtime   │      │ Transcrição, Analytics, │
│  (STT, LLM, TTS, Tools)  │      │ Relatórios e Campanhas  │
└─────────────┬────────────┘      └────────────┬────────────┘
              │                                │
              └───────────────┬────────────────┘
                              ▼
               Camada de Infraestrutura e Estado
         ┌───────────────────────────────────────────┐
         │ - Banco Relacional (Persistência / Repos) │
         │ - Cache / Sessões / PubSub Realtime       │
         │ - Fila de Mensageria                      │
         │ - Object Storage                          │
         └───────────────────────────────────────────┘
```

---

## 2. Processos e Aplicações do Monorepo

O monorepo divide o ciclo de vida da execução em quatro processos fundamentais:

### 2.1. `apps/web` (Dashboard Administrativo)
- **Papel**: Interface visual B2B mobile-first atendendo a dois contextos arquiteturais distintos:
  1. **Tenant Application**: Gestão das empresas clientes (agentes, campanhas, contatos, chamadas ao vivo e gravadas, transbordo, catálogo, analytics e equipe);
  2. **Platform Control Plane**: Gestão global do SaaS pelo proprietário (organizações, planos, assinaturas, entitlements, concessões comerciais, usage e auditoria da plataforma). Consulte `docs/PLATFORM_CONTROL_PLANE.md`.
- **Natureza**: Renderização web moderna, adaptativa, comunicando-se exclusivamente com a API através de contratos tipados compartilhados (`packages/contracts`).

### 2.2. `apps/api` (Core Business & HTTP Gateway)
- **Papel**: Ponto central de validação de autenticação interna (Internal Service Auth assimétrica via DEC-029/ADR-010), autorização multi-tenant, gestão de recursos e persistência.
- **Framework HTTP**: **Hono** para Node.js (Node 22/24) com `@hono/node-server` e `@hono/zod-openapi` selecionado formalmente via DEC-029 / ADR-010 (**005C: IMPLEMENTED / LOCAL + NEON STAGING INTEGRATION VALIDATED** — rotas, middleware de autenticação interna assimétrica tenant-scoped DEC-031/ADR-012, autorização multi-tenant e endpoints /v1 de Agent Studio validados contra Neon staging via TCP real. **Tenant Context Bootstrap**: 005D-B0 ARCHITECTURE ACCEPTED (DEC-032 / ADR-013) / NOT IMPLEMENTED; **Neon**: DATA/AUTHZ INTEGRATION VALIDATED; **API Deployment**: NOT DEPLOYED; **Production**: NOT PROVISIONED / UNTOUCHED; **Browser E2E**: NOT CLAIMED; **Slice 005D-B**: NOT STARTED).
- **Diretriz**: Rotas e controllers enxutos; zero lógica de negócio em controllers. Todas as operações orquestram serviços e publicam eventos de domínio.

### 2.3. `apps/voice` (Motor de Voz em Tempo Real)
- **Papel**: Orquestrador de sessões de voz ativas com baixa latência, suporte a interrupção de fala (*barge-in*), monitoramento de chamadas e transbordo determinístico para humanos (*Human Handoff*). Consulte `docs/LIVE_CALLS_AND_HANDOFF.md`.
- **Funcionamento**: Gerencia o pipeline de áudio bidirecional:
  1. Recepção do fluxo de áudio da telefonia;
  2. Transcrição / Ingestão de áudio em tempo real (STT / Realtime Model);
  3. Contexto conversacional, histórico e execução determinística de ferramentas (*tool calling*);
  4. Síntese de fala (TTS / Voice stream) de volta para o canal telefônico.
- **Comunicação**: Protocolos de tempo real (WebSockets, WebRTC ou streaming gRPC).

### 2.4. `apps/worker` (Processamento Assíncrono)
- **Papel**: Execução de tarefas desacopladas de longa duração ou em lote.
- **Responsabilidades**: Pós-processamento e ingestão segura de gravações em object storage, geração de transcrições detalhadas com diarização, extração de insights e sumarização via IA, consolidação de custos/uso e disparo cadenciado de campanhas ativas. Consulte `docs/LIVE_CALLS_AND_HANDOFF.md`.

---

## 3. Fluxo de Dependências e Pacotes Compartilhados

O fluxo de dependências segue uma hierarquia unidirecional estrita:

```
[apps/*] ───► [packages/contracts]
[apps/*] ───► [packages/ui] (apenas apps/web)
[apps/*] ───► [packages/integrations] (via interfaces abstratas)
[apps/*] ───► [packages/database] (via repositories tipados)
[apps/*] ───► [packages/logger, packages/errors, packages/config]
```

- **Regra de Isolamento**: Módulos de aplicação (`apps/*`) nunca importam código interno uns dos outros diretamente. Compartilhamento ocorre unicamente através de pacotes tipados em `packages/*`.
- **Regra de Domínio**: `packages/contracts` e a camada de domínio não conhecem detalhes de implementação de banco de dados nem de SDKs externos.
- **Contratos e Validação de Schemas**: `packages/contracts` centraliza interfaces compartilhadas, DTOs e schemas canônicos de validação (biblioteca Zod selecionada via DEC-028/ADR-009, sem dependências de framework ou banco; instalação no Slice 005B).

---

## 4. O Padrão Provider / Adapter

Para manter a neutralidade e permitir a substituição de qualquer fornecedor externo sem impacto no core:

1. **Porta (Interface Abstrata de Domínio)**:
   Definida com tipos neutros do domínio (ex.: `TelephonyProvider`, `RealtimeAIProvider`, `StorageProvider`, `CRMProvider`, `CalendarProvider`).
2. **Adaptador (Adapter Concreto)**:
   Implementa a interface mapeando dados do domínio para o formato proprietário do fornecedor e vice-versa.
3. **Fábrica / Injeção**:
   A aplicação instancia o adaptador configurado por variáveis de ambiente ou por tenant, permitindo fallback ou migração transparente de vendor.

*Nota: Exemplos como Twilio, OpenAI Realtime ou Cloudflare R2 são conceituais. Nenhuma escolha definitiva de fornecedor está amarrada ao código do produto nesta fase.*

---

## 5. Camada de Dados e Persistência

### 5.1. Banco de Dados Principal
- **Decisão Arquitetural**: Banco de dados relacional com integridade referencial, suporte a transações ACID e controle de concorrência.
- **Engine Relacional**: PostgreSQL 16 (DEC-026 / ADR-008).
- **Camada de Acesso / ORM**: Drizzle ORM + drizzle-kit (DEC-026 / ADR-008).
- **Acesso**: Exclusivo através de repositories e modelos tipados. Queries inline descontroladas no código de negócio são vedadas.
- **Multi-Tenancy**: Particionamento lógico com coluna obrigatória `organizationId` em todas as tabelas com escopo de tenant.
- **Migrations**: Sequenciais e versionadas, executadas via pipeline automatizado (sem DDL manual em produção; reversibilidade/rollback não são presumidos universalmente conforme `docs/DATABASE.md`).
- **Provedor Managed Staging**: Neon Serverless Postgres (`aws-sa-east-1` / São Paulo).
- **Recurso de Banco em Produção**: **NOT PROVISIONED** (desenho de topologia e alta disponibilidade pendentes).

### 5.2. Sessões, Cache e Estado Volátil (Redis / In-Memory Store)
- **Decisão Arquitetural**: Armazenamento em memória para controle de chamadas em andamento, rate limiting, cache de tokens e barramento Pub/Sub local para coordenação de instâncias.
- **Status do Fornecedor**: *Pending Decision* (candidato prioritário: Redis / Valkey).

### 5.3. Filas e Mensageria Assíncrona
- **Decisão Arquitetural**: Fila de mensagens confiável para desacoplar a ingestão da API do processamento de workers (garantindo entrega de webhooks, retry exponencial e dead-letter queues).
- **Status do Fornecedor**: *Pending Decision*.

### 5.4. Armazenamento de Objetos (Storage)
- **Decisão Arquitetural**: Object storage compatível com S3 para persistência segura de arquivos de áudio, transcrições completas e anexos. Acessado estritamente via `StorageProvider`.
- **Status do Fornecedor**: *Pending Decision*.

---

## 6. Eventos Internos

O sistema adota limites orientados a eventos para manter os módulos desacoplados.
- Todo evento interno possui um envelope padrão:
  - `id`: Identificador único do evento;
  - `name`: Nome semântico versionado (ex.: `call.started`);
  - `version`: Versão do schema do evento (ex.: `1.0`);
  - `timestamp`: Momento ISO-8601 UTC do evento;
  - `organizationId`: Escopo do tenant (quando aplicável);
  - `correlationId`: Rastreabilidade da transação ponta a ponta;
  - `payload`: Dados específicos validados por schema.

---

## 7. Frontend e Experiência do Usuário

- **Abordagem**: Interface responsiva e adaptativa construída **mobile-first**.
- **Design System**: Centralizado em `packages/ui`, fundamentado em tokens universais (cores, tipografia, espaçamento, sombras, breakpoints, transições).
- **Sem Bifurcação**: A mesma base de código atende smartphones, tablets e desktops widescreen sem criar aplicações separadas.

---

## 8. Segurança e Isolamento Operacional

1. **Separação de Ambientes**: Separação conceitual e física de `dev`, `staging` e `production`.
2. **Ambiente de Produção Protegido**: Bloqueio de execuções automatizadas autônomas destrutivas por IAs.
3. **Credenciais e Secrets**: Injeção via variáveis de ambiente/secret manager. Nunca em disco ou logs.
4. **Tool Calling Seguro**: Chamadas de ferramentas executadas pelos agentes de IA durante uma ligação de voz só acessam recursos explicitamente concedidos àquela organização com validação estrita de permissões.
5. **Isolamento do Platform Admin**: `Platform Admin` (Master Admin) é uma autorização estritamente global, independente da hierarquia de tenants. Usuários de tenant não podem se auto-elevar a administradores da plataforma.
6. **Segurança de Gravações e Áudios**: Gravações e áudios no object storage são privados por padrão e acessados apenas via mecanismo autenticado/autorizado, temporário e auditável quando aplicável (como URLs pré-assinadas, signed delivery ou endpoint autenticado), com validação mandatória de `organizationId` e TTL configurável.

---

## 9. Documentos Canônicos de Especialização

Para especificações detalhadas de subsistemas complexos, consulte os documentos canônicos dedicados:
- [Platform Control Plane e Modelo Comercial](file:///d:/voice-agent-platform/docs/PLATFORM_CONTROL_PLANE.md) (`docs/PLATFORM_CONTROL_PLANE.md`)
- [Monitoramento ao Vivo, Gravações e Transbordo Humano](file:///d:/voice-agent-platform/docs/LIVE_CALLS_AND_HANDOFF.md) (`docs/LIVE_CALLS_AND_HANDOFF.md`)
- [Agent Studio, Configuração e Versionamento](file:///d:/voice-agent-platform/docs/AGENT_STUDIO.md) (`docs/AGENT_STUDIO.md`)
- [Arquitetura do Motor de Voz e Barge-in](file:///d:/voice-agent-platform/docs/VOICE_ARCHITECTURE.md) (`docs/VOICE_ARCHITECTURE.md`)
- [Modelo de Custos e Rastreamento Financeiro](file:///d:/voice-agent-platform/docs/COST_MODEL.md) (`docs/COST_MODEL.md`)
- [Arquitetura Orientada a Eventos](file:///d:/voice-agent-platform/docs/EVENTS.md) (`docs/EVENTS.md`)

