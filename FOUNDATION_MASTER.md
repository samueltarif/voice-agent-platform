# Fundação Arquitetural, Documental e Operacional (FOUNDATION_MASTER.md)

> **Documento Consolidado Único**
> **Data de Consolidação Inicial**: 21 de Setembro de 2026
> **Última Revisão**: 21 de Setembro de 2026 (PROMPT-001B)
> **Status**: Fundação Revisada — Fase 0 Concluída (Aguardando Aprovação para Implementação)
> **Localização do Repositório**: `D:/voice-agent-platform`

---

## Sumário Executivo

Este documento consolida em um único arquivo todas as definições, diretrizes operacionais, regras de governança, padrões arquiteturais e registros de decisão estabelecidos para a **Plataforma SaaS B2B de Agentes de Voz com IA**.

O objetivo primordial desta fundação é garantir que agentes de IA e engenheiros humanos desenvolvam e mantenham o software com:
- **Segurança estrita** (isolamento multi-tenant, proteção de produção, menores privilégios);
- **Determinismo inegociável** (LLM orienta diálogo e intenção; código determinístico executa regras comerciais, preços e permissões);
- **Baixa latência como objetivo de engenharia** (interrupção humana via *barge-in*, streaming contínuo de áudio, com meta inicial de <800ms a ser validada experimentalmente);
- **Código limpo e modular** (arquivos pequenos, sem arquivos genéricos, vertical slices e desacoplamento de fornecedores);
- **Custo zero em testes** (emulação de provedores externos via interfaces de domínio e fakes).

---

## Legenda de Status de Decisões

| Status | Significado |
|:---|:---|
| **Princípio Confirmado** | Regra arquitetural aprovada e inegociável |
| **Configuração Recomendada** | Padrão recomendado, pode ser ajustado com justificativa |
| **Status: Proposed Default** | Referência inicial a ser aprovada formalmente antes da implementação |
| **Meta de Engenharia** | Objetivo a ser validado experimentalmente com dados reais |
| **Status: Pending Decision** | Aguarda aprovação humana explícita — nenhuma implementação antes da decisão |
| **Decisão de Produto** | Requisito funcional aprovado, implementação futura |
| **Requisito Documentado** | Documentado conceitualmente, implementação em fase futura |

---

# 1. Visão Geral do Produto e Negócio

### 1.1. O Produto
Plataforma SaaS corporativa (B2B) que permite a empresas criarem, calibrarem e gerenciarem **agentes de voz com IA** programáveis.
- **Fase Outbound**: Chamadas ativas para qualificação de leads, cobrança preventiva, agendamentos e pesquisas.
- **Fase Inbound**: Chamadas receptivas com atendimento 24/7, triagem inteligente e transbordo humano assistido.

### 1.2. Requisitos de Conversação de Voz
- **Latência**: Meta de engenharia inicial `<800ms` ponta a ponta — a ser validada experimentalmente (**Meta de Engenharia**, não SLA aprovado);
- Interrupção natural da fala (*barge-in* imediato ao detectar fala humana) — **Princípio Confirmado**;
- Memória de curto prazo na sessão e persistência de histórico;
- Invocação determinística de ferramentas (*tool calling*) com acesso controlado a dados de produtos, clientes, CRM e agenda.

### 1.3. Escopo do Dashboard B2B Mobile-First (Tenant Application)
Gerenciamento completo e adaptativo para empresas clientes:
1. **Organizações** (dados cadastrais, plano ativo e limites de concorrência);
2. **Usuários** (controle de acesso granular RBAC);
3. **Agent Studio** (configuração visual completa de agentes sem edição de código);
4. **Clientes / Contatos** (gestão de bases de discagem e histórico de interações);
5. **Produtos & Serviços** (catálogo determinístico de itens e preços consultáveis por tools);
6. **Campanhas** (disparo cadenciado de ligações com horários e regras de discagem);
7. **Chamadas** (listagem em tempo real, monitoramento ao vivo e desfechos);
8. **Transcrições & Áudios** (player integrado com acesso a gravações protegido por mecanismo autenticado e temporário);
9. **Integrações** (configuração de telefonia, CRMs, calendários e webhooks);
10. **Analytics** (taxas de conversão, duração média, handoffs e métricas operacionais);
11. **Custos & Finanças** (apropriação transparente de custos e saldo de créditos);
12. **Configurações** (caller IDs, políticas de expiração de dados e conformidade).

### 1.4. Platform Control Plane e Modelo Comercial
- **Platform Control Plane**: Painel administrativo interno e global do SaaS (proprietário/administração). Responsável por gerenciar organizações, planos, assinaturas, concessões manuais (`CommercialGrant`), entitlements, auditoria global e custos operacionais.
- **Platform Admin Global**: Autorização global estrita (`Platform Admin` / `Master Admin`). Proibido modelar como membership de tenant. Usuários de tenant não podem se auto-elevar.
- **Modelo Comercial Desacoplado**: Pagamento ≠ Direito de Acesso. Resolução via Planos + Entitlements + Estado Comercial. Modos: `SELF_SERVICE`, `MANUAL`, `COMPLIMENTARY`.
- **Separação de Medição**: `Usage` (consumo bruto) ≠ `Cost` (custo dos provedores) ≠ `Billing` (cobrança ao cliente).
- Documentação canônica: [`docs/PLATFORM_CONTROL_PLANE.md`](file:///D:/voice-agent-platform/docs/PLATFORM_CONTROL_PLANE.md).

---

# 2. Constituição do Projeto (Princípios Inegociáveis)

Estes treze artigos representam as leis fundamentais do projeto. Nenhuma IA ou desenvolvedor pode violá-los silenciosamente:

1. **Artigo I — Multi-Tenancy Nativo**: Toda entidade com escopo de cliente corporativo deve possuir `organizationId`. Tabelas globais, catálogos de sistema e metadados técnicos são exceções legítimas documentadas. Vazamento de dados entre empresas é incidente crítico.
2. **Artigo II — Baixo Acoplamento e Vertical Slices**: Favorecer fatias verticais por funcionalidade/domínio em vez de camadas técnicas transversais distantes.
3. **Artigo III — Providers e Adapters Substituíveis**: O código de negócio nunca importa SDKs externos diretamente. Toda integração depende de uma interface de domínio neutra.
4. **Artigo IV — Determinismo: LLM Nunca é Fonte da Verdade**: Preços, estoques, autorizações e regras financeiras/fiscais são computados exclusivamente por código determinístico testado. Prompts guiam conversa, não lógica crítica.
5. **Artigo V — Proteção Incondicional de Produção**: Produção é blindada contra ações destrutivas autônomas de IA. Migrations e deploys em produção exigem aprovação humana.
6. **Artigo VI — Migrations Versionadas Obrigatórias**: Zero DDL manual em produção. Toda alteração de schema é versionada. O padrão *Expand and Contract* é aplicado em migrations com alterações incompatíveis; migrations triviais não exigem esse padrão.
7. **Artigo VII — Observabilidade e Rastreabilidade Integral**: Toda operação carrega `correlationId`, `requestId`, `callId` e `organizationId`. Proibido `console.log` em produção.
8. **Artigo VIII — Auditoria e Políticas de Retenção**: Ações críticas geram trilha imutável de auditoria. Gravações, transcrições e dados pessoais possuem políticas configuráveis de retenção, expiração, anonimização e exclusão. Períodos legais específicos aguardam pesquisa jurídica.
9. **Artigo IX — Segurança e Menor Privilégio**: Zero credenciais no repositório ou em logs. Tools de IA operam com escopo mínimo restrito ao tenant ativo.
10. **Artigo X — Testabilidade como Pré-Requisito**: Nenhuma regra de negócio entra sem testes automatizados. Testes de unidade nunca realizam chamadas a APIs externas pagas.
11. **Artigo XI — Mobile-First e Responsividade Universal**: O dashboard é desenvolvido prioritariamente para smartphones e se expande progressivamente. Proibido criar bases de código bifurcadas para mobile e desktop.
12. **Artigo XII — Arquitetura Amigável para Agentes de IA**: Arquivos concisos (80–150 linhas, máx 180), funções curtas (até 30 linhas, máx 50), tipagem forte e banimento total de arquivos genéricos.
13. **Artigo XIII — Rejeição à Complexidade Prematura**: Rejeição explícita a microserviços prematuros. Monorepo modular oferece velocidade com coesão.

---

# 3. Manual Operacional para Agentes de IA (Regras de Codificação)

### 3.1. Limites Estritos de Código
- **Arquivos de Lógica**: Alvo entre 80 e 150 linhas. Máximo recomendado de 180 linhas. Ultrapassar 180 linhas exige justificativa arquitetural explícita.
- **Funções**: Alvo de até 30 linhas. Máximo de 50 linhas para funções com lógica.
- **Complexidade Ciclomática**: Máximo de 8 por função.
- **Nível de Aninhamento (Nesting)**: Máximo de 3 níveis (`if`, loops, callbacks). Utilizar *early returns* e *guard clauses*.
- **Parâmetros**: Proibida lista longa de parâmetros soltos. Utilizar objetos tipados para mais de 2 parâmetros opcionais ou mais de 3 obrigatórios.
- **Proibição Total de Arquivos Genéricos**: É expressamente proibido criar `utils.ts`, `helpers.ts`, `common.ts`, `misc.ts`, `manager.ts`. Utilizar nomes com responsabilidade explícita (ex.: `normalize-phone-number.ts`, `calculate-call-cost.ts`, `validate-discount.ts`).

### 3.2. Ciclo de Investigação Obrigatório
Antes de criar qualquer função, classe, tabela, rota ou componente, a IA deve:
1. Navegar pelo módulo correspondente;
2. Pesquisar se já existe implementação equivalente ou reutilizável (anti-duplicação);
3. Consultar testes existentes para compreender contratos vigentes;
4. Consultar documentação oficial e versões instaladas de dependências externas (não alucinar APIs por memória);
5. Mapear consumidores para evitar breaking changes.

### 3.3. Processo Obrigatório para Correção de Bugs (Bugfix TDD)
1. **Reproduzir**: Escrever teste automatizado que reproduza a falha (o teste deve falhar no primeiro momento);
2. **Causa Raiz**: Identificar o motivo de fundo sem mascarar o sintoma;
3. **Correção Mínima**: Aplicar o menor conjunto de código coeso para sanar o defeito;
4. **Validar**: Executar o teste de regressão (deve passar) e a suíte completa do módulo.

### 3.4. Processo Obrigatório para Features
1. Pesquisar código existente e definir onde a funcionalidade se encaixa;
2. Definir contratos, schemas de validação e interfaces antes da lógica;
3. Se envolver banco, modelar schema multi-tenant (quando aplicável) e migration incremental;
4. Implementar a lógica determinística em vertical slice acompanhada de testes;
5. Se envolver integração externa, implementar o adapter desacoplado;
6. Expor endpoints enxutos e verificar limites de linhas/complexidade.

### 3.5. Definition of Done (DoD)
A tarefa só é considerada concluída quando:
- Arquivos respeitam os limites de linhas (<= 180) e funções (<= 50);
- Não há arquivos genéricos (`utils`, `helpers`, etc.);
- Toda regra de negócio possui testes passando;
- Zero chamadas pagas reais em testes automatizados;
- O isolamento multi-tenant (`organizationId`) foi garantido onde aplicável;
- Nenhum dado confidencial ou segredo está em logs ou código;
- Logs estruturados possuem identificadores de rastreamento (`correlationId`, `callId`);
- Telas cumprem princípios mobile-first e design tokens compartilhados;
- Entrada no `docs/AI_WORKLOG.md` criada para a tarefa.

---

# 4. Mapa do Monorepo e Fronteiras dos Módulos

```
voice-agent-platform/
├── apps/
│   ├── web/              # Dashboard B2B mobile-first para gestão de agentes, campanhas e chamadas.
│   ├── api/              # API HTTP Gateway para autenticação, regras multi-tenant e webhooks.
│   ├── voice/            # Motor em tempo real para streaming de áudio, VAD configurável, barge-in e síntese de voz.
│   └── worker/           # Processamento assíncrono para transcrições, analytics, relatórios e tarefas em lote.
│
├── packages/
│   ├── ui/               # Componentes visuais responsivos e design tokens unificados.
│   ├── database/         # Schemas, repositories tipados e migrations versionadas multi-tenant.
│   ├── contracts/        # DTOs, schemas de validação, eventos de domínio e interfaces compartilhadas.
│   ├── config/           # Validação e carregamento tipado de variáveis de ambiente.
│   ├── logger/           # Logging estruturado em JSON com injeção de correlationId e sanitização.
│   ├── errors/           # Catálogo centralizado de exceções e erros semânticos tipados.
│   ├── integrations/     # Implementações concretas de adaptadores externos (telefonia, IA, storage, CRM).
│   └── test-utils/       # Fakes, mocks e utilitários para testes determinísticos sem custos de API.
│
├── docs/                 # Documentação técnica e registros de decisões de arquitetura (ADRs).
│   └── AI_WORKLOG.md     # Registro central obrigatório de todas as tarefas de IA neste projeto.
├── AGENTS.md             # Instruções operacionais para agentes de IA.
├── PROJECT_CONSTITUTION.md # Leis fundamentais do sistema.
├── ARCHITECTURE.md       # Desenho da arquitetura de referência.
├── PROJECT_MAP.md        # Mapa topológico do monorepo.
└── FOUNDATION_MASTER.md  # Documento consolidado mestre (este arquivo).
```

### Regras de Dependência:
- `apps/*` consomem pacotes de `packages/*`.
- Nenhuma aplicação de `apps/*` importa código de outra aplicação de `apps/*`.
- O código de domínio e contratos (`packages/contracts`) é puro e desconhece detalhes de infraestrutura.

---

# 5. Arquitetura do Sistema e Fluxo de Dados

```
                  ┌─────────────────────────────────────────┐
                  │          Frontend (apps/web)            │
                  │   Dashboard B2B Responsivo Mobile-First │
                  └────────────────────┬────────────────────┘
                                       │ HTTPS / WSS
                                       ▼
┌──────────────────────────┐      ┌─────────────────────────┐
│   Telefonia Externa      │◄────►│   API Gateway / Core    │
│    (Webhooks / SIP)      │      │       (apps/api)        │
└─────────────┬────────────┘      └────────────┬────────────┘
              │                                │
              │ Audio Streams                  │ Eventos / Jobs
              ▼                                ▼
┌──────────────────────────┐      ┌─────────────────────────┐
│   Voice Engine Service   │      │   Worker Assíncrono     │
│      (apps/voice)        │      │      (apps/worker)      │
│  Orquestrador Realtime   │      │ Transcrição, Analytics, │
│  (STT, LLM, TTS, Tools)  │      │ Relatórios e Faturamento│
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

# 6. Motor de Voz em Tempo Real (`apps/voice`)

### 6.1. Pipeline de Áudio Bidirecional
1. **Ingestão**: Recepção de stream contínuo de áudio da telefonia (PSTN/SIP via WebSockets);
2. **VAD (Voice Activity Detection)**:
   - Detecta início e fim de turno de fala com **parâmetros configuráveis**;
   - Os limiares de duração de fala e silêncio são **configuráveis por provider, idioma, cenário e ambiente acústico** — nenhum valor numérico é fixado como regra arquitetural permanente;
3. **Barge-In (Cancelamento Imediato de Fala da IA)**:
   - Se o interlocutor humano falar enquanto a IA reproduz áudio, o buffer de saída na telefonia é limpo de imediato;
   - A geração no provedor de IA é cancelada e o estado transiciona para escuta;
4. **Orquestração Conversacional**:
   - Mediada via `RealtimeAIProvider` (suportando modelo multimodal integrado ou pipeline em cascata STT + LLM + TTS);
5. **Tool Calling Determinístico**:
   - Ao receber intenção de ferramenta (ex.: `checkProductPrice`), o motor intercepta, valida `organizationId` e executa o serviço de domínio determinístico;
   - O resultado verificado é injetado no diálogo sem risco de alucinação de dados críticos;
6. **Transmissão de Áudio**: Envio de blocos contínuos de áudio de volta ao canal telefônico.

---

# 7. Agent Studio — Requisito Fundamental de Produto

O **Agent Studio** é o ambiente de configuração e evolução de agentes de voz disponibilizado às empresas clientes. Empresas poderão criar, configurar, testar, publicar e evoluir seus agentes sem editar código.

> Documentação completa: [`docs/AGENT_STUDIO.md`](file:///D:/voice-agent-platform/docs/AGENT_STUDIO.md)

### 7.1. Componentes Configuráveis de um Agente
- Identidade, função, objetivos;
- Personalidade, tom de voz, estilo de fala;
- Instruções, regras, limites, comportamento proibido;
- Ferramentas autorizadas (Toolset);
- Base de Conhecimento (dados estruturados + documentos não estruturados);
- Playbooks, objeções e exemplos de conversa;
- VoiceConfig (voz sintética);
- Human Handoff (condições e contexto de transferência);
- Configurações de atendimento;
- Métricas e versões.

### 7.2. Versionamento de Agentes
- Ciclo de vida: `DRAFT → TEST → PUBLISHED → ARCHIVED`
- Alterar configuração não afeta produção imediatamente
- Rastreabilidade por chamada das versões utilizadas

### 7.3. Agent Evals
- Cenários de avaliação antes de publicar nova versão
- Comparação de performance entre versões
- Sem chamadas pagas reais nos evals

### 7.4. Feedback Supervisionado
- Revisão humana de transcrições com feedback positivo/negativo
- Geração de nova versão DRAFT a partir de feedback
- Nenhuma avaliação negativa altera agente em produção automaticamente

### 7.5. Live Calls, Recording e Human Handoff
- **Monitoramento ao Vivo**: Transcrição, eventos, sinais de interesse/intenção baseados no conteúdo da conversa e status em tempo real via WebSocket. Áudio ao vivo classificado como `STATUS: PLANNED / PROVIDER-DEPENDENT / NOT YET VALIDATED`.
- **Gravação de Chamadas**: Gravações privadas por padrão em object storage acessadas via mecanismo autenticado/autorizado, temporário e auditável (como presigned URLs, signed delivery ou endpoint autenticado), com isolamento multi-tenant e trilha de auditoria. Governança jurídica: `COMPLIANCE VERIFICATION REQUIRED BEFORE PRODUCTION`.
- **Protocolo de Human Handoff**: Orquestração determinística (máquina de estados: `NONE` → `REQUESTED` → `SELLER_NOTIFIED` → `SELLER_READY` → `AI_PREPARING` → `READY_TO_JOIN` → `HUMAN_CONNECTED` → `AI_DETACHED`).
- **Modo Listen-Only**: Vendedor escuta antes de entrar; classificado como `STATUS: PLANNED / PROVIDER-DEPENDENT / NOT YET VALIDATED`.
- **Regra de Zero Silêncio**: Se o vendedor não atender ou ocorrer timeout, a IA reassume deterministicamente sem deixar o cliente aguardando em silêncio.
- Documentação canônica: [`docs/LIVE_CALLS_AND_HANDOFF.md`](file:///D:/voice-agent-platform/docs/LIVE_CALLS_AND_HANDOFF.md).

**Status**: Requisitos Documentados — Implementação nas fases 6 e 8 do roadmap.

---

# 8. Governança de Banco de Dados e Multi-Tenancy

1. **Multi-Tenancy por Entidade de Tenant**: Toda tabela com escopo de cliente corporativo contém `organization_id`. Tabelas globais, catálogos de sistema e tabelas técnicas são exceções legítimas documentadas.
2. **Estratégia de Índices**: A inclusão de `organization_id` em índices compostos é fortemente recomendada para tabelas tenant. A ordem dos índices segue padrões reais de consulta, validados por análise de query — não é regra universal absoluta.
3. **Acesso Exclusivo via Repositories**: Regras de negócio não escrevem queries SQL manuais soltas. Todas as consultas residem em repositórios tipados que exigem `organizationId` quando aplicável.
4. **Checklist Pré-Alteração de Schema**:
   - Inspecionar schemas, migrations, repositories, models e queries existentes;
   - Verificar foreign keys, constraints e índices;
   - **Garantir que a informação não possa ser derivada de dados já existentes antes de criar nova coluna**.
5. **Zero DDL Manual em Produção**: Migrações via arquivos versionados no pipeline de CI/CD.
6. **Padrão Expand and Contract**: Aplicado quando a migration for incompatível, envolver rollout seguro ou exigir zero/baixo downtime. Migrations triviais não exigem esse padrão.

---

# 9. Arquitetura Orientada a Eventos Internos

Todos os eventos internos adotam o envelope canônico com identificadores de correlação e escopo organizacional:

```json
{
  "id": "evt_01J8ABC123XYZ456789DEF0123",
  "name": "call.started",
  "version": "1.0",
  "timestamp": "2026-09-21T13:00:00.000Z",
  "organizationId": "org_01J8ABC999AAA111222333444",
  "correlationId": "req_01J8XYZ888BBB444555666777",
  "causationId": "evt_01J8PREV000000000000000000",
  "payload": {
    "callId": "call_01J8CALL555666777888999000",
    "agentId": "agt_01J8AGENT11122233344455566",
    "campaignId": "cmp_01J8CAMP77788899900011122",
    "callerNumber": "+5511999999999",
    "recipientNumber": "+5511988888888"
  }
}
```

> Nota: `organizationId` pode ser `null` para eventos puramente operacionais do sistema global.

### Catálogo de Eventos do Ciclo de Vida da Chamada:
- `call.created`, `call.ringing`, `call.connected`, `call.started`;
- `call.tool_started`, `call.tool_completed`;
- `call.transferred`, `call.ended`, `call.failed`;
- `call.audio_uploaded`, `call.transcription_completed`, `call.analysis_completed`.

---

# 10. Integrações Externas e Padrão Provider/Adapter

| Porta Abstrata | Responsabilidade no Domínio | Status da Escolha |
| :--- | :--- | :--- |
| **`TelephonyProvider`** | Disparo de chamadas, encerramento, transferência e streaming de áudio PSTN. | **Status: Pending Decision** |
| **`RealtimeAIProvider`**| Sessão conversacional de voz, streaming bidirecional e tool calling. | **Status: Pending Decision** |
| **`StorageProvider`**   | Upload/download de gravações e transcrições via URLs autenticadas. | **Status: Pending Decision** |
| **`CRMProvider`**       | Sincronização de contatos, notas de chamada e oportunidades. | **Status: Pending Decision** |
| **`CalendarProvider`**  | Checagem de disponibilidade e agendamento de reuniões. | **Status: Pending Decision** |

*Benefício*: Permite testes unitários e de integração com fakes em memória com zero custo financeiro e execução instantânea.

---

# 11. Segurança, Isolamento e Governança de Segredos

1. **Gestão de Segredos**: Zero credenciais no código-fonte. `.env` versionado unicamente como `.env.example`. Mascaramento automático de dados sensíveis e tokens em logs.
2. **Isolamento de Tenants**: Toda requisição e acesso a banco de dados valida se o usuário autenticado pertence à organização solicitada.
3. **Segurança de Tool Calling**:
   - Escopo mínimo estrito por organização;
   - Validação forte de schemas de parâmetros enviados pelo modelo;
   - Ações financeiras ou destrutivas exigem confirmação em duas etapas ou mediação humana.
4. **Mídias Protegidas**: Arquivos de áudio são privados por padrão. Acesso concedido apenas através de mecanismo autenticado/autorizado, temporário e auditável quando aplicável (como URLs pré-assinadas, signed delivery ou endpoint autenticado), com TTL configurável conforme política de segurança.
5. **Políticas de Dados**: Audit trail imutável; gravações, transcrições e PII gerenciados por políticas configuráveis de retenção, expiração, anonimização e exclusão. Períodos legais definidos após pesquisa jurídica.

---

# 12. Observabilidade e Métricas de Latência

1. **Zero `console.log` em Produção**: Logs estruturados em formato JSON com injeção automática de contexto (`correlationId`, `requestId`, `callId`, `organizationId`).
2. **Métricas do Pipeline de Voz** (todas expostas com p50, p95 e p99):
   - `voice.vad.silence_detection_ms` (detecção de fim de turno);
   - `voice.stt.latency_ms` (transcrição, se aplicável ao provedor);
   - `voice.llm.time_to_first_token_ms` (primeiro token gerado);
   - `voice.tts.time_to_first_audio_ms` (primeiro bloco de áudio sintetizado);
   - `voice.barge_in.cancellation_latency_ms` (tempo de corte ao ser interrompido);
   - `voice.turn.roundtrip_total_ms` (latência total de turno);
   - `voice.tool.execution_latency_ms` (execução de tools determinísticas).
3. **Meta de Latência**: `<800ms` de turno ponta a ponta — **Meta de Engenharia Inicial**, não SLA aprovado. SLAs finais serão definidos após análise experimental em produção real.

---

# 13. Design System e Diretrizes Mobile-First

### 13.1. Princípios Confirmados (Inegociáveis)
- **Mobile-First**: Estilos base são móveis; expansão progressiva para telas maiores.
- **Responsividade Universal**: Uma base de código para smartphones, tablets e desktops.
- **Design Tokens**: Tokens universais como única fonte da verdade visual.
- **Componentes Compartilhados**: Proibida duplicação de componentes por viewport.
- **Acessibilidade**: WCAG 2.1 AA, navegação por teclado, ARIA adequado, área de toque mínima 44x44px.
- **Densidade Adaptativa**: Tabelas densas no desktop convertem-se em cartões no mobile.

### 13.2. Configurações Proposed Default (Aguardam Aprovação Humana)
As configurações abaixo são pontos de partida recomendados, **não decisões definitivas aprovadas**:

| Token | Valor Proposed Default |
|:---|:---|
| Família tipográfica de UI | Inter / Geist Sans |
| Família tipográfica monoespaçada | JetBrains Mono |
| Breakpoint `sm` | 640px |
| Breakpoint `md` | 768px |
| Breakpoint `lg` | 1024px |
| Breakpoint `xl` | 1280px |
| Breakpoint `2xl` | 1536px |

### 13.3. Diretrizes Mobile-First na Prática
- Estilos base são móveis (`min-width` para expansão progressiva em telas maiores);
- Proibida duplicação de componentes (`ComponentMobile` vs `ComponentDesktop`);
- Área de toque mínima de **44x44px** para qualquer botão ou controle de áudio;
- Tabelas densas de chamadas no desktop convertem-se em cartões verticais no smartphone;
- Navegação inferior fixa (*bottom bar*) no mobile transforma-se em sidebar lateral no desktop.

---

# 14. Estratégia de Testes

1. **Pirâmide de Testes**:
   - **Unitários**: Regras de negócio determinísticas, cálculos de tarifação e validadores (execução instantânea em memória);
   - **Integração**: Repositories com banco de dados de teste, contratos de API e despacho de eventos com fakes;
   - **E2E**: Fluxos críticos no dashboard web em staging.
2. **Isolamento de Custos**: Nenhum teste automatizado faz requisição real a serviços externos pagos (Twilio, OpenAI, ElevenLabs).
3. **TDD para Defeitos**: Todo bugfix inicia obrigatoriamente pela escrita de um teste que reproduza a falha antes da correção.

---

# 15. Ambientes e Implantação (Deployment)

1. **Ambientes Segregados**:
   - `dev`: Desenvolvimento local com emuladores e fakes sem custo;
   - `staging`: Homologação integrada com limites orçamentários rígidos;
   - `production`: Tráfego real corporativo.
2. **Produção Protegida**:
   - Nenhum deploy em produção sem gate de aprovação humana (*Human-in-the-Loop*);
   - Agentes de IA não possuem permissão de execução autônoma de comandos DDL ou exclusão de dados em produção;
   - Encerramento gracioso (*graceful shutdown*) no serviço de voz.

---

# 16. Modelo de Custos por Chamada

O custo unitário de uma ligação telefônica com IA é calculado deterministicamente ao término da chamada:

$$\text{Custo Total da Chamada} = C_{\text{telefonia}} + C_{\text{ia\_audio}} + C_{\text{storage}} + C_{\text{infra}}$$

- **Telefonia**: Minutos trafegados na rede pública $\times$ tarifa do carrier;
- **IA e Áudio**: Minutos de streaming multimodal ou soma ponderada de STT + tokens de LLM + caracteres de TTS;
- **Storage**: Custo de armazenamento dos arquivos de áudio gravados por período de retenção;
- **Governança de Saldo**: Suporte a carteira de créditos pré-pagos e limites mensais pós-pagos (*hard caps*).

---

# 17. Roteiro de Desenvolvimento (11 Fases)

- [x] **FASE 0**: Constituição e Documentação *(Concluída — revisão PROMPT-001B realizada)*;
- [ ] **FASE 1**: Arquitetura e Contratos *(Aguardando Aprovação)*;
- [ ] **FASE 2**: Monorepo e Tooling;
- [ ] **FASE 3**: Design System e Shell da Aplicação;
- [ ] **FASE 4**: Persistência, Autenticação e Multi-Tenancy;
- [ ] **FASE 5**: Domínios Base — Clientes, Produtos, Serviços e Campanhas (+ Agent Studio);
- [ ] **FASE 6**: Motor de Voz (+ Human Handoff);
- [ ] **FASE 7**: Agente IA e Tools (+ Versionamento + Knowledge Base);
- [ ] **FASE 8**: Telefonia Real;
- [ ] **FASE 9**: Observabilidade, Evals e Custos (+ Agent Evals + Feedback Supervisionado);
- [ ] **FASE 10**: Hardening, Staging e Produção.

Consulte [`docs/ROADMAP.md`](file:///D:/voice-agent-platform/docs/ROADMAP.md) para o detalhamento completo de cada fase.

---

# 18. Registro de Architecture Decision Records (ADRs)

| ADR | Título | Decisão Sumarizada |
| :--- | :--- | :--- |
| **ADR-001** | Adoção de Monorepo Modular | Organização unificada em `apps/` e `packages/` compartilhando contratos tipados de ponta a ponta. |
| **ADR-002** | Arquitetura Modular e Vertical Slices | Organização por domínio funcional com limites claros, rejeitando microserviços prematuros. |
| **ADR-003** | Multi-Tenancy Nativo Lógico | Isolamento de dados garantido por `organization_id` em entidades com escopo de tenant e repositories tipados. |
| **ADR-004** | Padrão Provider/Adapter | Código de negócio isolado de SDKs proprietários, permitindo substituição de fornecedores e testes com custo zero. |
| **ADR-005** | Fronteiras Orientadas a Eventos | Desacoplamento entre motor de voz e pós-processamento pesado via eventos internos versionados. |
| **ADR-006** | Abordagem Mobile-First Unificada | Uma única base de código adaptativa para smartphones e desktops através de design tokens. |

---

# 19. Decisões Confirmadas vs. Decisões Humanas Pendentes

### Decisões Confirmadas (Princípios Arquiteturais):
- Monorepo modular em `apps/` e `packages/`;
- Sem microserviços prematuros;
- Vertical slices nos módulos de domínio;
- Provider/Adapter obrigatório para telefonia, IA, storage, CRM e calendário;
- Acesso a banco unicamente por Repositories;
- Multi-tenancy lógico centrado em `organizationId` para entidades de tenant;
- Migrations versionadas sem DDL manual em produção;
- Expand and Contract para migrations incompatíveis (não obrigatório para triviais);
- LLMs orientam conversa, código determinístico valida preços/finanças/estoque;
- Interface mobile-first unificada;
- Proteção estrita de produção com gate humano;
- Segregação formal de dev, staging e prod;
- Limites de 80–150 linhas por arquivo de lógica (máx 180) e funções até 30 linhas (máx 50);
- Proibição de arquivos utilitários genéricos (`utils.ts`, etc.);
- Investigação prévia obrigatória antes de criar código;
- Eventos internos versionados com envelope canônico e correlationId;
- Logs estruturados em JSON sem `console.log` em produção;
- TDD obrigatório para bugfixes e zero dependência de APIs pagas em testes;
- Agent Studio como requisito fundamental de produto;
- Versionamento de agentes (DRAFT → TEST → PUBLISHED → ARCHIVED);
- Separação de dados estruturados (determinísticos) vs. não estruturados (referência) na Knowledge Base;
- Agent Evals como subsistema futuro obrigatório;
- Human Handoff como capacidade fundamental do produto;
- Policies de retenção, expiração e exclusão de dados configuráveis (especificação regulatória aguarda pesquisa jurídica);
- Separação entre Tenant Application e Platform Control Plane com Platform Admin Global (DEC-019);
- Desacoplamento de Pagamento e Direito de Acesso via Entitlements e CommercialGrants (DEC-020);
- Separação conceitual entre Usage, Cost e Billing (DEC-021);
- Monitoramento de chamadas ao vivo com dados/eventos realtime; áudio ao vivo marcado como dependente de provedor e não validado (DEC-022);
- Gravação de chamadas em Object Storage com acesso autenticado/temporário (ex.: presigned URLs) e verificação regulatória pendente (DEC-024);
- Protocolo determinístico de Human Handoff com fallback de zero silêncio; Listen-Only planejado e não validado (DEC-023).

### Decisões com Status: Proposed Default (Aguardam Aprovação Humana para Tornar-se Definitivas):
- Tipografia de UI: Inter / Geist Sans;
- Tipografia monoespaçada: JetBrains Mono;
- Breakpoints: 640px / 768px / 1024px / 1280px / 1536px.

### Decisões Humanas Pendentes (Pending Human Decisions):
Nenhum agente de IA deve implementar dependências concretas para estes tópicos sem instrução humana prévia:

| # | Tópico | Candidatos | Status |
|:---|:---|:---|:---|
| 1 | Motor de Banco de Dados | PostgreSQL 16 (Local: Docker; Staging: Neon) | **Status: Decided (DEC-026 / ADR-008)** |
| 2 | Camada ORM / Query Builder | Drizzle ORM + drizzle-kit | **Status: Decided (DEC-026 / ADR-008)** |
| 3 | Linguagem do Voice Engine (`apps/voice`) | TypeScript / Python / Go / Rust | **Pending Decision** |
| 4 | Cache & Sessões em Tempo Real | Redis / Valkey | **Pending Decision** |
| 5 | Filas & Mensageria | BullMQ / RabbitMQ / AWS SQS / Temporal | **Pending Decision** |
| 6 | Fornecedor Primário de Telefonia | Twilio / Telnyx / Plivo | **Pending Decision** |
| 7 | Motor de IA Realtime | OpenAI Realtime / Cascata (Deepgram + LLM + ElevenLabs) | **Pending Decision** |
| 8 | Object Storage | Cloudflare R2 / AWS S3 / GCS | **Pending Decision** |
| 9 | Autenticação de Usuários | Better Auth (Identity + Session only) | **Status: Decided (DEC-026 / ADR-008)** |
| 10 | Framework Frontend (`apps/web`) | Next.js 15 (App Router) + React 19 + Tailwind v4 | **Status: Decided (DEC-025 / ADR-007)** |
| 11 | Cloud & Hospedagem | AWS / GCP / Fly.io / Kubernetes | **Pending Decision** |
| 12 | Gateway de Pagamento SaaS | Stripe / Asaas / Pagar.me | **Pending Decision** |
| 13 | Framework de Agent Evals | A definir | **Pending Decision** |
| 14 | Estratégia de RAG para Knowledge Base | A definir | **Pending Decision** |
| 15 | TTL de Signed URLs | Configurável — valor a definir por política de segurança | **Pending Decision** |
| 16 | Tipografia e Breakpoints | Inter/Geist/JetBrains Mono + breakpoints listados | **Status: Proposed Default** |
| 17 | Períodos de retenção de dados (LGPD/GDPR) | Aguarda pesquisa jurídica | **Pending Decision** |
| 18 | Live Audio Streaming | WebRTC / WebSocket de áudio via provider telefônico | **STATUS: PLANNED / PROVIDER-DEPENDENT / NOT YET VALIDATED** |
| 19 | Listen-Only Mode na Telefonia | Conferência / Whisper / Dual-stream PSTN | **STATUS: PLANNED / PROVIDER-DEPENDENT / NOT YET VALIDATED** |
| 20 | Call Recording Compliance & Retenção | Requisitos de aviso, ciência, consentimento e/ou outra base legal aplicável (conforme jurisdição, finalidade e regulação vigente) | **COMPLIANCE VERIFICATION REQUIRED BEFORE PRODUCTION** |

---

# 20. AI_WORKLOG — Registro Central Obrigatório

O arquivo [`docs/AI_WORKLOG.md`](file:///D:/voice-agent-platform/docs/AI_WORKLOG.md) é obrigatório e inviolável. Toda tarefa executada por agente de IA neste repositório **deve** acrescentar uma entrada cronológica com:
- Objetivo e data;
- O que foi implementado, criado, alterado e removido;
- Dependências, alterações de banco, API e configuração;
- Decisões tomadas e temporárias;
- Testes executados e resultados reais;
- Problemas, pendências e dívidas técnicas;
- Próximo passo recomendado.

**Regras absolutas**: Nunca apagar entradas anteriores. Nunca incluir secrets. Nunca afirmar que teste foi executado quando não foi. Nunca omitir falha conhecida.
