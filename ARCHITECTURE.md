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
- **Papel**: Interface visual B2B mobile-first para gestão de organizações, agentes de voz, campanhas, clientes, histórico de chamadas, transcrições, catálogo de produtos/serviços e métricas de custo.
- **Natureza**: Renderização web moderna, adaptativa, comunicando-se exclusivamente com a API através de contratos tipados compartilhados (`packages/contracts`).

### 2.2. `apps/api` (Core Business & HTTP Gateway)
- **Papel**: Ponto central de validação de autenticação, autorização multi-tenant, gestão de recursos, recepção de webhooks de telefonia e disparo de chamadas ativas (outbound).
- **Diretriz**: Rotas e controllers enxutos; zero lógica de negócio em controllers. Todas as operações orquestram serviços e publicam eventos de domínio.

### 2.3. `apps/voice` (Motor de Voz em Tempo Real)
- **Papel**: Orquestrador de sessões de voz ativas com baixa latência e suporte a interrupção de fala (*barge-in*).
- **Funcionamento**: Gerencia o pipeline de áudio bidirecional:
  1. Recepção do fluxo de áudio da telefonia;
  2. Transcrição / Ingestão de áudio em tempo real (STT / Realtime Model);
  3. Contexto conversacional, histórico e execução determinística de ferramentas (*tool calling*);
  4. Síntese de fala (TTS / Voice stream) de volta para o canal telefônico.
- **Comunicação**: Protocolos de tempo real (WebSockets, WebRTC ou streaming gRPC).

### 2.4. `apps/worker` (Processamento Assíncrono)
- **Papel**: Execução de tarefas desacopladas de longa duração ou em lote.
- **Responsabilidades**: Pós-processamento de gravações, geração de transcrições detalhadas, extração de insights e sumarização de conversas via IA, disparo cadenciado de campanhas ativas e sincronizações de CRM/calendário.

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
- **Acesso**: Exclusivo através de repositories e modelos tipados. Queries inline descontroladas no código de negócio são vedadas.
- **Multi-Tenancy**: Particionamento lógico com coluna obrigatória `organizationId` em todas as tabelas com escopo de tenant.
- **Migrations**: Versionadas, reversíveis e executadas via pipeline automatizado (sem DDL manual em produção).
- **Status do Fornecedor / Motor**: *Pending Decision* (candidato prioritário: PostgreSQL).

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
