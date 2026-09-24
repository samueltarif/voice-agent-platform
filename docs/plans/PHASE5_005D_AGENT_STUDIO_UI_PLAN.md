# Plano Arquitetural e Especificação de Integração — Agent Studio Web UI (Slice 005D)

> **Documento**: `docs/plans/PHASE5_005D_AGENT_STUDIO_UI_PLAN.md`  
> **Status**: PROPOSTO — GATE DE PESQUISA, AUDITORIA E PLANEJAMENTO (005D-A)  
> **Fase do Projeto**: FASE 5 (Domínios Base & Agent Studio)  
> **Data**: 24 de Setembro de 2026  
> **Branch**: `docs/phase5-agent-studio-ui-gate`  
> **Base SHA**: `cd73f9e2c0d0e9fe3dd604c18966d6f57f15053f`  

---

## 1. Auditoria do Estado Atual do Sistema (Baseline 005C)

### 1.1. Status Formal dos Slices Anteriores
- **Slice 005B (`packages/database` e `packages/contracts`)**:
  - **MERGED / NEON STAGING VALIDATED** (Migrations `0000_ambitious_groot.sql` e `0001_productive_tusk.sql`).
  - Domínios de `Agent` e `AgentVersion`, invariantes de integridade referencial, constraints compostas e parciais no PostgreSQL, resolução de cotas comerciais (`CommercialEntitlementResolver`), política de publicação com arquivamento atômico (`DefaultCommercialPublicationPolicy`) e concorrência validadas com zero resíduos em Neon staging.
- **Slice 005C (`apps/api` e Internal Service Auth)**:
  - **MERGED / LOCAL + NEON STAGING INTEGRATION VALIDATED**.
  - Servidor Hono (`@hono/node-server`) compilado com OpenAPI 3.1.0 (`@hono/zod-openapi`).
  - Autenticação interna de serviços assimétrica baseada em Ed25519 (`EdDSA`), formato JWK privado em `apps/web`, JWKS público em `apps/api`, biblioteca `jose` v6, TTL de 30 segundos, sem papel no token JWT.
  - Verificação dinâmica de autorização multi-tenant contra o PostgreSQL em cada request: existência de organização `ACTIVE`, membership ativa, validação em tempo real de revogação/suspensão de membro e resolução de papéis RBAC (`OWNER`, `ADMIN`, `MANAGER`, `OPERATOR`, `VIEWER`).
- **Status de Deploy e Produção**:
  - `apps/api`: **NOT DEPLOYED** (execução local conectada ao staging nos testes; sem runtime em nuvem).
  - Ambiente de Produção: **NOT PROVISIONED / UNTOUCHED**.
  - Autenticação E2E no Navegador: **NOT YET VALIDATED END-TO-END** (apenas a fronteira criptográfica BFF Signer -> API -> Neon foi validada).
  - **Slice 005D**: **NOT STARTED** (esta etapa representa exclusivamente o gate de planejamento 005D-A).

---

## 2. Contratos Canônicos das 11 Rotas do Agent Studio (`apps/api`)

Todas as rotas exigem o header `Authorization: Bearer <assertion>` assinado assimetricamente via Ed25519 com `iss: voice-agent:web`, `aud: voice-agent:api`, e `x-request-id` para correlação.

| # | Método | Caminho Canônico | Request Schema | Response Schema | Permissão Requerida | Serviço de Domínio Executado |
|---|--------|------------------|----------------|-----------------|---------------------|------------------------------|
| 1 | `GET` | `/v1/agents` | N/A | `AgentMetadataResponse[]` (200) | `agent.read` | `AgentRepository.listAgentsByOrganization` + `AgentVersionRepository.getCurrentPublishedVersion` |
| 2 | `GET` | `/v1/agents/{agentId}` | Params: `{ agentId: UUID }` | `AgentMetadataResponse` (200) | `agent.read` | `AgentRepository.getAgentById` + `AgentVersionRepository.getCurrentPublishedVersion` |
| 3 | `POST` | `/v1/agents` | Body: `createAgentHttpBodySchema` (`name`, `slug`) | `AgentMetadataResponse` (201) | `agent.create` | `AgentLifecycleService.createAgent` (valida cota `agents.max`) |
| 4 | `POST` | `/v1/agents/{agentId}/archive` | Params: `{ agentId: UUID }` | `AgentMetadataResponse` (200) | `agent.archive` | `AgentRepository.archiveAgent` |
| 5 | `POST` | `/v1/agents/{agentId}/reactivate` | Params: `{ agentId: UUID }` | `AgentMetadataResponse` (200) | `agent.archive` | `AgentLifecycleService.reactivateAgent` (revalida cota `agents.max`) |
| 6 | `GET` | `/v1/agents/{agentId}/versions` | Params: `{ agentId: UUID }` | `AgentVersionMetadataResponse[]` (200) | `agent.read` | `AgentVersionRepository.listVersionsByAgent` |
| 7 | `GET` | `/v1/agents/{agentId}/versions/{versionId}/configuration` | Params: `{ agentId: UUID, versionId: UUID }` | `AgentConfigurationSnapshotV1` (200) | `agent.config.read` | `AgentVersionRepository.getVersionById` |
| 8 | `POST` | `/v1/agents/{agentId}/drafts` | Params: `{ agentId: UUID }`<br>Body: `createDraftHttpBodySchema` (`configuration`, `changelog`) | `AgentVersionMetadataResponse` (201) | `agent.edit` | `AgentDraftService.createDraft` (impõe invariante de 1 rascunho por agente) |
| 9 | `PATCH` | `/v1/agents/{agentId}/drafts/{versionId}` | Params: `{ agentId: UUID, versionId: UUID }`<br>Body: `updateDraftHttpBodySchema` (`configuration`, `changelog`) | `AgentVersionMetadataResponse` (200) | `agent.edit` | `AgentDraftService.updateDraftConfiguration` |
| 10 | `DELETE` | `/v1/agents/{agentId}/drafts/{versionId}` | Params: `{ agentId: UUID, versionId: UUID }` | `{ success: boolean }` (200) | `agent.edit` | `AgentDraftDiscardService.discardDraft` |
| 11 | `POST` | `/v1/agents/{agentId}/drafts/{versionId}/publish` | Params: `{ agentId: UUID, versionId: UUID }` | `AgentVersionMetadataResponse` (200) | `agent.publish` | `AgentPublicationService.publishDraft` (arquiva publicação anterior de forma atômica) |

> [!IMPORTANT]
> **Rota Canônica de Configuração**: Conforme auditado no Slice 005C, a rota canônica para leitura da configuração de versão é estritamente `GET /v1/agents/:agentId/versions/:versionId/configuration` (exigindo `agent.config.read`). Nenhuma rota direta `/v1/agents/:agentId/configuration` existe ou deve ser criada.

---

## 3. Matriz RBAC e Regras Estritas de Confidencialidade

Conforme `apps/api/src/auth/agent-permissions.ts`, a plataforma possui 5 papéis de tenant (`TenantRole`):

| Papel | `agent.read` (Metadados) | `agent.config.read` (Configuração) | `agent.create` (Novo Agente) | `agent.edit` (Drafts) | `agent.test` (Test Run)* | `agent.publish` (Publicar) | `agent.archive` (Arquivar/Reativar) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **OWNER** | SIM | SIM | SIM | SIM | SIM | SIM | SIM |
| **ADMIN** | SIM | SIM | SIM | SIM | SIM | SIM | SIM |
| **MANAGER** | SIM | SIM | NÃO | SIM | SIM | NÃO | NÃO |
| **OPERATOR** | SIM | NÃO | NÃO | NÃO | SIM | NÃO | NÃO |
| **VIEWER** | SIM | NÃO | NÃO | NÃO | NÃO | NÃO | NÃO |

*\*Nota: O endpoint de Agent Test Run ainda não foi construído no backend (`apps/api`). Logo, nenhum botão funcional de teste deve ser implementado no frontend na Fase 5.*

### Regras de Confidencialidade na UI:
1. **Confidencialidade de Configuração**: Para os papéis `VIEWER` e `OPERATOR`, os campos `configuration`, `persona`, `rules`, `playbook` e `examples` são omitidos na API e devem ser estritamente bloqueados na UI.
2. **Defesa em Profundidade no BFF**: O BFF não deve invocar a rota `GET /v1/agents/:agentId/versions/:versionId/configuration` se o usuário logado possuir papel `VIEWER` ou `OPERATOR`.
3. **Não-Vazamento Visual**: O frontend deve ocultar completamente seções de edição e CTAs de criação/publicação para papéis sem privilégio, evitando renderizar ações inviáveis ou expor dados restritos.

---

## 4. Auditoria do Frontend Existente (`apps/web` e `@voice-agent/ui`)

### 4.1. Estrutura de Rotas e Componentes Atual
- **Next.js 15.2.0 (App Router)**:
  - `src/app/layout.tsx`: Root Layout com providers (`UiPreferencesProvider`).
  - `src/app/page.tsx`: Redirecionamento inicial para `/dashboard`.
  - `src/app/dashboard/page.tsx`: Dashboard mockada com cartões e métricas.
  - `src/app/calls/page.tsx`: Lista de chamadas com visualização detalhada.
  - `src/app/platform/page.tsx`: Gestão de plataforma (visão master/admin).
  - `src/app/api/auth/[...all]/route.ts`: Handler do Better Auth (`toNextJsHandler(auth)`).
- **Application Shell (`src/shell/`)**:
  - `TenantShell`: Container principal com `DesktopSidebar`, `AppTopbar`, `MobileBottomNav`, `MobileMenuDrawer` e `CommandPaletteDialog`.
  - `DesktopSidebar`: Barra lateral recolhível. Atualmente, o item "Agente IA" está presente apontando para `#` com `badge: 'Em breve', disabled: true`.
  - `AppTopbar`: Cabeçalho fixo com busca rápida (Ctrl+K), seletor de densidade (compacto/padrão/espaçoso), alternador de tema claro/escuro e avatar estático (`OP`).
- **Design System (`packages/ui`)**:
  - Primitivas disponíveis: `Button`, `Input`, `Card`, `Badge`, `Avatar`, `Table`, `Dialog`, `Sheet`, `DropdownMenu`, `Tooltip`, `Separator`, `Skeleton`, `Command`, `Progress`.
  - Compatibilidade comprovada com Tailwind CSS v4, dark mode nativo via classes de design tokens HSL e suporte mobile-first.

---

## 5. Fluxo de Autenticação: Browser -> BFF -> API -> Neon

```
┌─────────────────┐       (1) HTTPS Cookie       ┌───────────────────────────────┐
│ Browser (Client)├─────────────────────────────>│ apps/web (BFF / Server)       │
│                 │  better-auth.session_token   │                               │
│                 │                              │ 1. auth.api.getSession()      │
│                 │                              │ 2. Resolve userId             │
│                 │                              │ 3. Resolve active Org Context │
│                 │                              │ 4. InternalServiceSigner      │
└─────────────────┘                              │    (Ed25519 Private Key)      │
                                                 └──────────────┬────────────────┘
                                                                │ (2) Asymmetric Assertion
                                                                │     Authorization: Bearer <JWT>
                                                                │     x-request-id: <uuid>
                                                                v
                                                 ┌───────────────────────────────┐
                                                 │ apps/api (Gateway & Domain)   │
                                                 │                               │
                                                 │ 1. ServiceAssertionVerifier   │
                                                 │ 2. authorizeTenant()          │
                                                 │ 3. RBAC & Quota Enforcement   │
                                                 └──────────────┬────────────────┘
                                                                │ (3) SQL Queries
                                                                v
                                                 ┌───────────────────────────────┐
                                                 │ PostgreSQL (Neon Staging/Prod)│
                                                 │                               │
                                                 │ organizations, memberships,   │
                                                 │ agents, agent_versions        │
                                                 └───────────────────────────────┘
```

### 5.1. Perguntas Arquiteturais Obrigatórias (Seção 5 da Demanda)
- **A. Como `apps/web` recupera a sessão no servidor?**  
  Via `auth.api.getSession({ headers: await headers() })` (onde `headers` provém de `next/headers`). Retorna o objeto `{ session, user }` ou `null`.
- **B. Qual é a fonte factual de `userId`?**  
  A propriedade `session.user.id` retornada pelo Better Auth após validação criptográfica do cookie contra a tabela `session`.
- **C. A sessão/browser contém `organizationId`?**  
  **NÃO**. A instância atual do Better Auth está configurada sem plugins de organização. Os dados de sessão compreendem exclusivamente usuário, conta e token de sessão.
- **D. Como o usuário escolhe a organização ativa?**  
  O usuário deve selecionar sua organização ativa a partir da lista de organizações em que possui membership ativa (`organization_memberships`).
- **E. Onde o `organizationId` ativo deve viver?**  
  No contexto da requisição web (ver alternativas arquiteturais na Seção 6).
- **F. Como impedir que o `organizationId` enviado pelo browser seja tratado como autorização?**  
  O `organizationId` enviado pelo browser é **ESTRITAMENTE CONTEXTO DE INTENÇÃO**, nunca prova de acesso. O `apps/web/BFF` assina a asserção contendo `sub: userId` e `orgId: selectedOrgId`. O `apps/api` revalida compulsoriamente no banco de dados se o `userId` de fato possui membership ativa nessa organização e se sua role confere as permissões necessárias para o endpoint solicitado.

---

## 6. Proposta de Contexto de Organização Ativa (Seção 6 da Demanda)

Como o repositório atual **não possui** implementação prévia de switcher de organização ou persistência de tenant ativo, propõem-se no máximo duas alternativas arquiteturais para aprovação humana:

### Alternativa 1 (Recomendada): Contexto por Rota (`/orgs/[orgSlug]/agents`)
- **Conceito**: A organização ativa é parte explícita da URL. As rotas do Agent Studio ficam sob `/[orgSlug]/agents`.
- **UX**: URLs compartilháveis e favoráveis (bookmarks); permite ao usuário abrir múltiplas organizações em abas distintas sem conflito de sessão; histórico de navegação limpo.
- **Segurança**: Isolamento explícito; o slug na URL define o tenant alvo; se o usuário alterar manualmente o slug para uma organização à qual não pertence, a API responde imediatamente com HTTP 403 `FORBIDDEN` ou 404 `NOT_FOUND`.
- **Persistência**: Natural e determinística via URL. O último slug acessado pode ser salvo em cookie leve (`v_last_org_slug`) apenas para redirecionamento do `/` inicial.
- **SSR**: Nativo e ótimo no Next.js App Router. O Server Component recebe `params.orgSlug` diretamente, sem cascata de requisições.
- **Tamper Resistance**: Totalmente garantida pelo `apps/api` (não confia no cliente).
- **Impacto no BFF**: O BFF resolve o `slug -> orgId` e injeta `organizationId` no `InternalApiClient`.
- **Impacto no API**: Zero impacto nos contratos existentes (a asserção continua trafegando `orgId` como UUID).
- **Complexidade**: Baixa a Moderada (estrutura de pastas `app/[orgSlug]/agents`).

### Alternativa 2: Contexto por Cookie de Tenant (`v_active_org`)
- **Conceito**: URLs genéricas (`/agents`). A organização ativa é armazenada em um cookie `v_active_org=<organizationId>`.
- **UX**: URLs mais curtas. Switcher altera o cookie e dispara `router.refresh()`. Contudo, abas simultâneas competem pelo mesmo cookie, podendo causar confusão de contexto se o usuário alternar organização em uma aba.
- **Segurança**: Cookie `SameSite=Lax`, `HttpOnly`. Tamper resistance garantida pelo `apps/api`.
- **Persistência**: Baseada no cookie do navegador.
- **SSR**: Lida via `cookies()` em Server Components.
- **Tamper Resistance**: Garantida pelo backend.
- **Impacto no BFF**: O BFF lê o cookie na requisição e passa para o `InternalApiClient`.
- **Impacto no API**: Zero impacto.
- **Complexidade**: Baixa.

> **Decisão Recomendada para Aprovação**: **Alternativa 1 (Contexto por Rota)** pela robustez multi-abas e alinhamento com padrões modernos de plataformas B2B SaaS.

---

## 7. Estratégia CSRF: Browser -> BFF (Seção 7 da Demanda)

### 7.1. Diagnóstico do Next.js 15 e Better Auth
- O Better Auth protege automaticamente seus próprios endpoints `/api/auth/*` contra CSRF.
- Rotas personalizadas do BFF (`/api/bff/*`) no Next.js App Router **não** possuem proteção automática contra CSRF baseada em token gerada pelo Next.js para métodos `POST`, `PATCH` e `DELETE`.
- Server Actions do Next.js possuem proteção nativa contra CSRF baseada em verificação de `Host` e `Origin`.

### 7.2. Proposta Concreta de Proteção CSRF (Zero Novas Dependências)
1. **Validação Estrita de `Origin` e `Host`**:
   - Todo handler de mutação no BFF (`POST`, `PATCH`, `DELETE`) valida que o header `Origin` ou `Referer` corresponde estritamente ao header `Host` da aplicação (`NEXT_PUBLIC_APP_URL` ou hostname local).
   - Requisições cross-origin não autorizadas são rejeitadas com HTTP 403 `CSRF_VALIDATION_FAILED`.
2. **Cookies de Sessão com `SameSite=Lax`**:
   - O cookie do Better Auth é configurado como `SameSite: 'lax'` e `HttpOnly`, impedindo o envio inadvertido de credenciais em requisições de sites externos.
3. **Uso de Server Actions para Formulários de Edição**:
   - Para submissões de rascunho e formulários de configuração, utilizar Server Actions do Next.js, aproveitando a verificação criptográfica interna do framework.

---

## 8. Arquitetura da Camada BFF e Integração com `InternalApiClient`

O browser **NUNCA** acessa `apps/api` diretamente. O `apps/web` atua como BFF:

1. **Serviço Singleton**: `InternalApiClient` configurado no servidor com a chave privada Ed25519 de runtime (`INTERNAL_SERVICE_PRIVATE_JWK`).
2. **Handlers Especializados do BFF** (ex.: `src/lib/api/agent-bff-service.ts`):
   - Recupera a sessão Better Auth do usuário logado via `headers()`.
   - Extrai `userId = session.user.id`.
   - Obtém o `organizationId` ativo.
   - Invoca `internalApiClient.request()` repassando a asserção gerada em memória pelo `InternalServiceSigner`.
   - Propaga o `requestId` para rastreabilidade de logs.
   - Trata e normaliza erros da API (400, 401, 403, 404, 409, 500) em respostas canônicas para a UI.

---

## 9. Mapa de Telas e Fluxos de Usuário do Agent Studio (005D)

### 9.1. Mapa de Páginas
1. **`/agents` — Lista de Agentes (Catálogo)**:
   - Tabela responsiva / grid de cartões de agentes.
   - Badges de status do ciclo de vida: `ACTIVE` (verde) e `ARCHIVED` (cinza).
   - Badge da versão publicada atual (ex: `v2` ou `Sem versão publicada`).
   - Indicador de rascunho em aberto (ex: `Rascunho v3 pendente`).
   - Botão primário "Criar Agente" (visível e habilitado apenas para `OWNER` e `ADMIN`).
   - Estado vazio quando não houver agentes cadastrados.
2. **`/agents/new` — Criação de Agente**:
   - Formulário com campos `name` e `slug` (gerado automaticamente a partir do nome, com opção de edição).
   - Validação inline conforme `createAgentHttpBodySchema`.
   - Tratamento de erro de cota comercial excedida (`ENTITLEMENT_EXCEEDED` / `agents.max`), exibindo mensagem clara instruindo contato com o administrador da organização ou upgrade de plano.
3. **`/agents/[agentId]` — Detalhes do Agente**:
   - Cabeçalho com nome, slug, status (`ACTIVE`/`ARCHIVED`), data de criação e versão publicada ativa.
   - Card de Rascunho Ativo: Se existir rascunho, exibe opções para "Continuar Editando", "Publicar" ou "Descartar". Se não houver, exibe botão "Criar Novo Rascunho" (para `OWNER`, `ADMIN`, `MANAGER`).
   - Histórico de Versões: Lista cronológica de versões (`versionNumber`, `status: DRAFT / PUBLISHED / ARCHIVED`, `publishedAt`, `changelog`).
   - Ações de Ciclo de Vida: Botão "Arquivar Agente" / "Reativar Agente" (restrito a `OWNER` e `ADMIN`).
4. **`/agents/[agentId]/edit` — Editor de Configuração (Snapshot V1)**:
   - Formulário estruturado com base exclusivamente no schema `AgentConfigurationSnapshotV1`:
     - **Persona**: Nome/papel do atendente, empresa, objetivo, tom (`FORMAL`, `CASUAL`, `EMPATHETIC`), frases de saudação, encerramento e fallback.
     - **Voz**: Idioma fixo (`pt-BR`).
     - **Regras**: Regras conversacionais e regras determinísticas (desconto máximo, horários de operação).
     - **Playbook**: Estágios de atendimento (acolhimento, triagem, resolução) com metas claras.
     - **Exemplos**: Pares de input do cliente e resposta ideal do agente.
   - Ações de Rascunho: "Salvar Alterações" (PATCH no rascunho) e "Publicar Versão" (dispara modal de confirmação).

---

## 10. UX de Rascunhos, Publicação, Arquivamento e Reativação

### 10.1. Ciclo de Vida de Rascunho (Draft UX)
- **Invariante**: Existe no máximo 1 rascunho (`DRAFT`) por agente a qualquer momento.
- Se o usuário tentar criar um segundo rascunho enquanto já houver um aberto, a UI intercepta o erro HTTP 409 `DRAFT_ALREADY_EXISTS` do backend e direciona o usuário para o rascunho existente.
- A exclusão de um rascunho ("Descartar Rascunho") exige diálogo modal de confirmação e invoca `DELETE /v1/agents/:agentId/drafts/:versionId`.

### 10.2. Publicação com Confirmação Visual (Publish UX)
- A publicação é uma ação destrutiva/substitutiva no ciclo de vida:
  - O modal de publicação deve informar expressamente:
    *"Ao publicar esta versão, a versão atualmente em produção será arquivada e o novo rascunho entrará em vigor imediatamente para novas chamadas."*
  - Exibe sumário do `changelog`.
  - Ao confirmar, invoca `POST /v1/agents/:agentId/drafts/:versionId/publish`.

### 10.3. Arquivamento e Reativação (Archive & Reactivate UX)
- **Arquivamento**:
  - Modal de confirmação: *"Agentes arquivados não podem receber novas chamadas telefônicas ou ter novas versões publicadas."*
  - Invoca `POST /v1/agents/:agentId/archive`.
- **Reativação**:
  - Invoca `POST /v1/agents/:agentId/reactivate`.
  - Tratamento de erro de cota: Se a organização já estiver com a cota `agents.max` preenchida, o backend rejeita com HTTP 403 `ENTITLEMENT_EXCEEDED`. A UI deve capturar esse erro canônico e informar que a reativação foi bloqueada por limite de cota de agentes ativos.

---

## 11. Estratégia de Responsividade e Tokens de Design

- **Grid e Breakpoints Suportados**:
  - `320px` a `430px` (Smartphones compactos e padrão): Coluna única, formulários com campos empilhados, navegação inferior fixa (`MobileBottomNav`).
  - `768px` (Tablets / Telas intermediárias): Layout flexível de 2 colunas para cards de métricas e histórico.
  - `1024px`, `1440px`, `1920px` (Desktop): Sidebar lateral fixa (`DesktopSidebar`), tabelas expandidas, visualização lado a lado de rascunho e histórico.
- **Design Tokens**:
  - Uso estrito das variáveis CSS já configuradas em `apps/web/src/app/globals.css` (`--background`, `--foreground`, `--card`, `--primary`, `--border`, `--muted`).
  - Estados de foco e touch targets mínimos de 44x44px em telas sensíveis ao toque.

---

## 12. Tratamento de Estados: Carregamento, Erros e Estados Vazios

A interface do Agent Studio cobrirá integralmente a seguinte matriz de estados:

| Estado | Cenário de Ocorrência | Componente Visual / Comportamento |
| :--- | :--- | :--- |
| **Loading** | Carregamento inicial de lista ou detalhe | Skeletons de linha de tabela e cards (`Skeleton` de `@voice-agent/ui`) |
| **Empty** | Organização sem agentes cadastrados | Card com ilustração e botão "Criar Primeiro Agente" |
| **404 Not Found** | Agente inexistente ou de outro tenant | Tela de recurso não encontrado com link para retorno ao catálogo |
| **403 Forbidden** | Usuário sem permissão para ação | Botão desabilitado com tooltip explicativo ou banner de acesso negado |
| **409 Conflict** | Tentativa de criar draft concorrente | Alerta inline com link para o rascunho já existente |
| **Quota Exceeded** | Cota de agentes ativos atingida | Banner de alerta explicativo informando limite de agentes do plano atual |
| **Archived** | Agente em estado arquivado | Badge cinza de alerta e bloqueio de criação de rascunhos |

---

## 13. Estratégia de Testes para o Slice 005D-B

1. **Testes Unitários (`apps/web`)**:
   - `agent-permissions.test.ts`: Derivação de ações e visibilidade na UI por papel (`OWNER`, `ADMIN`, `MANAGER`, `OPERATOR`, `VIEWER`).
   - `csrf-protection.test.ts`: Validação de rejeição de requisições sem `Origin`/`Host` correspondente.
   - `error-mapping.test.ts`: Mapeamento de envelopes canônicos da API para mensagens de erro amigáveis ao usuário.
2. **Testes de Integração de Fluxo BFF**:
   - Sessão Better Auth -> BFF -> `InternalApiClient` -> `apps/api` -> Mock / Test Database.
   - Verificação de propagação de `x-request-id` e sanitização de dados confidenciais para papéis restritos.
3. **Smoke UI e Acessibilidade**:
   - Renderização dos componentes com navegação por teclado e sem quebras visuais nos breakpoints alvos.

---

## 14. Auditoria de Dependências: Zero Novas Dependências

As dependências já instaladas em `apps/web` e no monorepo são 100% suficientes para a conclusão do Slice 005D:
- `next` (v15.2.0)
- `react` e `react-dom` (v19.0.0)
- `better-auth` (v1.7.5)
- `jose` (v6.2.12)
- `lucide-react` (v0.475.0)
- `@voice-agent/ui` (Design System)
- `@voice-agent/contracts` (Schemas e DTOs)
- `@voice-agent/database` (Persistência)

> **Decisão**: **ZERO novas dependências** adicionadas no package.json.

---

## 15. Itens Expressamente Diferidos (Fora do Escopo 005D)

Para manter o foco estrito na entrega da UI do Agent Studio:
1. **Twilio e Telefonia**: Nenhuma integração com Twilio Voice, WebRTC de telefonia ou Media Streams (pertence à Fase 6).
2. **Execução de Teste do Agente (Test Run Endpoint)**: Diferido para quando a infraestrutura de simulação em tempo real for implementada.
3. **Deploy em Nuvem**: O aplicativo continuará operando localmente no ambiente de desenvolvimento/staging.
4. **Configurações Avançadas de LLM**: Customização de provedores externos, tools e RAG avançado continuam diferidos.

---

## 16. Perguntas Abertas para Alinhamento com o Operador Humano

Antes de iniciar a codificação do Slice 005D-B, submetem-se para aprovação humana as seguintes decisões arquiteturais:
1. **Abordagem de Resolução de Organização Ativa**: Confirma-se a adoção da **Alternativa 1 (Contexto por Rota `/[orgSlug]/agents`)** ou prefere-se a Alternativa 2 (Cookie de Sessão `v_active_org`)?
2. **Formulário de Configuração do Agente**: Deseja-se salvar alterações de rascunho de forma atômica via botão explícito ("Salvar Rascunho") ou auto-save por campo com debounce? (Recomendação: Salvamento explícito no 005D-B para maior previsibilidade e simplicidade).
3. **Navegação do Shell**: O item "Agente IA" da barra lateral deve ser ativado apontando diretamente para o catálogo de agentes da organização ativa? (Recomendação: Sim, ativando o link existente na sidebar).

---

## 17. Slices Propostos para Implementação em 005D-B

A implementação do 005D-B será dividida em entregas incrementais e testáveis:
- **Slice 005D-B1**: Contexto de Organização Ativa, Switcher no Shell e Ativação do link na Sidebar.
- **Slice 005D-B2**: Catálogo de Agentes (`/agents`) e Criação com Validação de Cota (`/agents/new`).
- **Slice 005D-B3**: Visualização de Detalhes (`/agents/[agentId]`), Histórico de Versões e Ações de Ciclo de Vida (Archive / Reactivate).
- **Slice 005D-B4**: Editor de Configuração V1 (`/agents/[agentId]/edit`), Gestão de Draft e Modal de Publicação com Confirmação Visual.
- **Slice 005D-B5**: Suíte de Testes Automatizados da UI e Auditoria Final de Conformidade.
