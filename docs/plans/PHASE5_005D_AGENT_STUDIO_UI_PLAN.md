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
  - **MERGED / NEON STAGING VALIDATED**.
  - Migrações canônicas reais em disco (`packages/database/src/migrations/`):
    - `0000_dizzy_runaways.sql` (Foundation: auth, organizations, memberships, commercial, audit)
    - `0001_numerous_eddie_brock.sql` (Agent Domain: agents, agent_versions, lifecycle, constraints)
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

## 2. Decisões Humanas Aprovadas para o Slice 005D

Conforme deliberação formal do operador humano:

1. **Contexto de Organização por Rota Canônica**:
   - Padrão oficial obrigatório: `/orgs/[orgSlug]/agents`.
   - Sub-rotas:
     - `/orgs/[orgSlug]/agents/new`
     - `/orgs/[orgSlug]/agents/[agentId]`
     - `/orgs/[orgSlug]/agents/[agentId]/edit`
   - *Motivo*: Evita colisão com rotas top-level existentes (`/dashboard`, `/calls`, `/platform`), provê deep-linking e bookmarks determinísticos e suporta navegação multi-abas sem contaminação de contexto. O `orgSlug` na URL atua estritamente como **CONTEXTO DE INTENÇÃO**, nunca como prova de autorização.
2. **UX de Salvamento de Rascunho (Draft Save UX)**:
   - **Salvamento Explícito**: Ação acionada pelo usuário via botão canônico `"Salvar rascunho"`.
   - Auto-save ou debounce permanecem **descartados** no 005D-B inicial para assegurar previsibilidade e simplificar a máquina de estados.
3. **Navegação no Application Shell**:
   - O item `"Agente IA"` da navegação lateral (`DesktopSidebar`) e móvel será ativado, com `href` apontando para `/orgs/{orgSlug}/agents` derivado da organização ativa no contexto. Zero ações mortas na interface.

---

## 3. Contratos Canônicos das 11 Rotas do Agent Studio (`apps/api`)

Todas as 11 rotas de agente exigem o header `Authorization: Bearer <assertion>` assinado assimetricamente via Ed25519 com `iss: voice-agent:web`, `aud: voice-agent:api`, e `x-request-id` para correlação.

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

## 4. Matriz RBAC e Regras Estritas de Confidencialidade

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
1. **Confidencialidade de Configuração**: Para os papéis `VIEWER` e `OPERATOR`, os campos `configuration`, `persona`, `rules`, `playbook`, `examples`, `changelog` e `nextVersionNumber` são omitidos na API e devem ser estritamente bloqueados na UI.
2. **Defesa em Profundidade no BFF**: O BFF não deve invocar a rota `GET /v1/agents/:agentId/versions/:versionId/configuration` se o usuário logado possuir papel `VIEWER` ou `OPERATOR`.
3. **Não-Vazamento Visual**: O frontend deve ocultar completamente seções de edição e CTAs de criação/publicação para papéis sem privilégio, evitando renderizar ações inviáveis ou expor dados restritos.

---

## 5. Auditoria do Frontend Existente (`apps/web` e `@voice-agent/ui`)

### 5.1. Versões Reais em Execução (Auditadas no `pnpm-lock.yaml`)
- **Next.js**: `15.5.25` (declarado no `package.json` como `^15.2.0`)
- **React**: `19.3.0` (declarado no `package.json` como `^19.0.0`)
- **React DOM**: `19.3.0`
- **Better Auth**: `1.7.5`
- **jose**: `6.2.12`
- **lucide-react**: `0.475.0`
- **Tailwind CSS**: `4.0.0`

### 5.2. Estrutura de Rotas e Componentes Atual
- **Next.js App Router**:
  - `src/app/layout.tsx`: Root Layout com providers (`UiPreferencesProvider`).
  - `src/app/page.tsx`: Redirecionamento inicial para `/dashboard`.
  - `src/app/dashboard/page.tsx`: Dashboard com cartões e métricas baseados em mocks.
  - `src/app/calls/page.tsx`: Lista de chamadas com visualização detalhada.
  - `src/app/platform/page.tsx`: Gestão de plataforma (visão admin).
  - `src/app/api/auth/[...all]/route.ts`: Handler HTTP do Better Auth (`toNextJsHandler(auth)`).
- **Application Shell (`src/shell/`)**:
  - `TenantShell`: Container com `DesktopSidebar`, `AppTopbar`, `MobileBottomNav`, `MobileMenuDrawer` e `CommandPaletteDialog`.
  - `DesktopSidebar`: Barra lateral recolhível. Atualmente, o item "Agente IA" aponta para `#` com `badge: 'Em breve', disabled: true`.
  - `AppTopbar`: Cabeçalho fixo com busca rápida (Ctrl+K), seletor de densidade (compacto/padrão/espaçoso), alternador de tema claro/escuro e avatar estático (`OP`).
- **Design System (`packages/ui`)**:
  - Primitivas disponíveis: `Button`, `Input`, `Card`, `Badge`, `Avatar`, `Table`, `Dialog`, `Sheet`, `DropdownMenu`, `Tooltip`, `Separator`, `Skeleton`, `Command`, `Progress`.

---

## 6. Auditoria de Bootstrap de Organização: Identificação do Gap Arquitetural

### 6.1. Respostas Factuais às Perguntas de Bootstrap
1. **Como um usuário recém-logado descobre as organizações das quais possui membership ativa?**
   *Hoje*: Não descobre. Não há nenhum endpoint na API ou no BFF que liste as organizações vinculadas ao `userId`.
2. **Como o shell obtém dados para o organization switcher?**
   *Hoje*: O shell exibe apenas o texto estático `"Workspace Demo"` sem dados dinâmicos.
3. **Como `orgSlug` é convertido para `organizationId` sem `apps/web` acessar diretamente a persistência de domínio?**
   *Hoje*: Não existe rota de resolução. E `apps/web` está estritamente proibido de consultar repositórios de banco de dados diretamente por DEC-029 / ADR-010.
4. **Como isso funciona antes de existir um `orgId` com o qual assinar a assertion tenant-scoped atual?**
   *Hoje*: **Não funciona**. O contrato `serviceAssertionClaimsSchema` exige rigorosamente `orgId: z.string().uuid()`. Logo, o `InternalServiceSigner` recusa assinar asserções sem `organizationId`, tornando impossível chamar qualquer rota sob `/v1/*`.
5. **Existe hoje endpoint ou control-plane capability que resolva isso?**
   *Hoje*: **NÃO EXISTE**. O Slice 005C implementou exclusivamente as rotas de agente, que assumem um tenant já pré-resolvido.

### 6.2. Diagnóstico Formal
> **ACTIVE ORGANIZATION BOOTSTRAP GAP = CONFIRMED**

Para viabilizar a navegação em `/orgs/[orgSlug]/agents` sem violar o isolamento do banco e sem quebrar os contratos criptográficos existentes, é indispensável definir um slice preparatório de bootstrap: **`005D-B0 — Tenant Context Bootstrap`**.

---

## 7. Proposta de Arquitetura para o Slice 005D-B0 (Tenant Context Bootstrap)

> [!CAUTION]
> **ARCHITECTURAL EXTENSION REQUIRED — HUMAN APPROVAL REQUIRED**
> A especificação DEC-031 / ADR-012 fixou o formato de asserção interna tenant-scoped (`sub`, `orgId`, `iss`, `aud`, `iat`, `exp`, `jti`). Para permitir que o BFF consulte organizações antes de conhecer um `orgId`, é necessária uma extensão controlada de autenticação.

### Alternativa A (Recomendada): Perfil de Asserção User-Scoped para Bootstrap (`UserBootstrapAssertion`)
- **Conceito**: O mesmo `InternalServiceSigner` assina um token assimétrico Ed25519 exclusivo para descoberta de tenant:
  - Header: `{ alg: 'EdDSA', typ: 'JWT', kid: '<staging-or-prod-kid>' }`
  - Payload: `{ sub: userId, scope: 'user:bootstrap', iss: 'voice-agent:web', aud: 'voice-agent:api', iat, exp, jti }`
  - Note: Sem `orgId` e sem papéis/roles.
- **Novos Endpoints Mínimos no `apps/api`**:
  - `GET /v1/me/organizations`: Retorna a lista de organizações em que o `sub` (userId) possui membership ativa (`[{ id, name, slug, role, status }]`).
  - `GET /v1/organizations/by-slug/{slug}`: Valida se o `sub` pertence à organização indicada pelo `slug` e retorna o respectivo `organizationId` (UUID) e metadados básicos.
- **Segurança**:
  - As 11 rotas `/v1/agents/*` continuam rejeitando terminantemente tokens sem `orgId`. Apenas os novos endpoints sob `/v1/me/*` ou `/v1/organizations/by-slug/*` aceitam o escopo de bootstrap.
  - Zero exposição de chaves privadas ou tokens no navegador.
- **Vantagens**: Preserva o canal criptográfico assimétrico unificado Ed25519 sem criar métodos paralelos de autenticação.

### Alternativa B: Resolução de Tenant via BFF Server-to-Server com Credencial de Plataforma
- **Conceito**: Um endpoint `/v1/internal/tenant-lookup` autenticado via chave de serviço compartilhada ou mTLS que aceita `(userId, slug)` e retorna o `organizationId`.
- **Desvantagem**: Introduz uma segunda modalidade de autenticação interna concorrente ao ADR-012.

> **Recomendação Submetida a Aprovação**: **Alternativa A**, formalizada como extensão controlada de ADR no Slice 005D-B0.

---

## 8. Estratégia CSRF: Browser -> BFF

- **Next.js 15 Server Actions**:
  Server Actions contam com mecanismo próprio de validação de `Host` e `Origin` em requisições POST para mitigação nativa de CSRF (**VERIFIED BY DOCS** no Next.js 15.5.25).
- **Route Handlers Personalizados (`/api/bff/*`)**:
  Para Route Handlers HTTP normais, a validação de CSRF deve ser implementada no próprio handler do BFF, comparando o header `Origin` ou `Referer` com o `Host` esperado da aplicação (`NEXT_PUBLIC_APP_URL` ou hostname local).
- **Cookies de Sessão**:
  O cookie de sessão do Better Auth permanece configurado como `SameSite: 'lax'` e `HttpOnly`.
- **Dependências**: Zero novas dependências de CSRF.

---

## 9. Arquitetura da Camada BFF e Integração com `InternalApiClient`

O navegador **NUNCA** acessa `apps/api` diretamente. O `apps/web` atua como BFF:

1. **Serviço Singleton**: `InternalApiClient` configurado no servidor com a chave privada Ed25519 de runtime (`INTERNAL_SERVICE_PRIVATE_JWK`).
2. **Handlers Especializados do BFF** (ex.: `src/lib/api/agent-bff-service.ts`):
   - Recupera a sessão Better Auth do usuário logado via `headers()`.
   - Extrai `userId = session.user.id`.
   - Obtém o `organizationId` ativo validado pelo bootstrap de rota.
   - Invoca `internalApiClient.request()` repassando a asserção tenant-scoped gerada em memória pelo `InternalServiceSigner`.
   - Propaga o `requestId` para rastreabilidade de logs.
   - Trata e normaliza erros da API (400, 401, 403, 404, 409, 500) em respostas canônicas para a UI.

---

## 10. Mapa Canônico de Páginas e Rotas da UI (005D)

Todas as rotas de agente seguem o padrão `/orgs/[orgSlug]/agents`:

```
/orgs/[orgSlug]/agents
  ├── /new                          (Criação de Agente)
  └── /[agentId]                    (Detalhes, Histórico e Lifecycle)
        └── /edit                   (Editor de Configuração Snapshot V1)
```

1. **`/orgs/[orgSlug]/agents` — Catálogo de Agentes**:
   - Tabela responsiva / grid de cartões de agentes.
   - Badges de status do ciclo de vida: `ACTIVE` (verde) e `ARCHIVED` (cinza).
   - Badge da versão publicada atual (ex: `v2` ou `Sem versão publicada`).
   - Indicador de rascunho em aberto (ex: `Rascunho v3 pendente`).
   - Botão primário "Criar Agente" (visível e habilitado apenas para `OWNER` e `ADMIN`).
   - Estado vazio quando não houver agentes cadastrados.
2. **`/orgs/[orgSlug]/agents/new` — Criação de Agente**:
   - Formulário com campos `name` e `slug` (gerado automaticamente a partir do nome, com opção de edição).
   - Validação inline conforme `createAgentHttpBodySchema`.
   - Tratamento de erro de cota comercial excedida (`ENTITLEMENT_EXCEEDED` / `agents.max`), exibindo mensagem clara instruindo upgrade ou liberação de agentes inativos.
3. **`/orgs/[orgSlug]/agents/[agentId]` — Detalhes do Agente**:
   - Cabeçalho com nome, slug, status (`ACTIVE`/`ARCHIVED`), data de criação e versão publicada ativa.
   - Card de Rascunho Ativo: Se existir rascunho, exibe opções para "Continuar Editando", "Publicar" ou "Descartar". Se não houver, exibe botão "Criar Novo Rascunho" (para `OWNER`, `ADMIN`, `MANAGER`).
   - Histórico de Versões: Lista cronológica de versões (`versionNumber`, `status: DRAFT / PUBLISHED / ARCHIVED`, `publishedAt`, `changelog`).
   - Ações de Ciclo de Vida: Botão "Arquivar Agente" / "Reativar Agente" (restrito a `OWNER` e `ADMIN`).
4. **`/orgs/[orgSlug]/agents/[agentId]/edit` — Editor de Configuração (Snapshot V1)**:
   - Formulário estruturado com base exclusivamente no schema `AgentConfigurationSnapshotV1`:
     - **Persona**: Nome/papel do atendente, empresa, objetivo, tom (`FORMAL`, `CASUAL`, `EMPATHETIC`), frases de saudação, encerramento e fallback.
     - **Voz**: Idioma fixo (`pt-BR`).
     - **Regras**: Regras conversacionais e regras determinísticas (desconto máximo, horários de operação).
     - **Playbook**: Estágios de atendimento (acolhimento, triagem, resolução) com metas claras.
     - **Exemplos**: Pares de input do cliente e resposta ideal do agente.
   - Ações de Rascunho: Botão explícito `"Salvar rascunho"` (PATCH no rascunho) e botão `"Publicar versão"` (dispara modal de confirmação).

---

## 11. UX de Rascunhos, Publicação, Arquivamento e Reativação

### 11.1. Ciclo de Vida de Rascunho (Draft UX)
- **Invariante**: Existe no máximo 1 rascunho (`DRAFT`) por agente a qualquer momento.
- Se o usuário tentar criar um segundo rascunho enquanto já houver um aberto, a UI intercepta o erro HTTP 409 `DRAFT_ALREADY_EXISTS` do backend e direciona o usuário para o rascunho existente.
- A exclusão de um rascunho ("Descartar rascunho") exige diálogo modal de confirmação e invoca `DELETE /v1/agents/:agentId/drafts/:versionId`.

### 11.2. Publicação com Confirmação Visual (Publish UX)
- A publicação é uma ação atômica e substitutiva no ciclo de vida:
  - O modal de publicação deve informar expressamente:
    *"Ao publicar esta versão, a versão atualmente em produção será arquivada e o novo rascunho entrará em vigor imediatamente para novas chamadas."*
  - Exibe sumário do `changelog`.
  - Ao confirmar, invoca `POST /v1/agents/:agentId/drafts/:versionId/publish`.

### 11.3. Arquivamento e Reativação (Archive & Reactivate UX)
- **Arquivamento**:
  - Modal de confirmação: *"Agentes arquivados não podem receber novas chamadas telefônicas ou ter novas versões publicadas."*
  - Invoca `POST /v1/agents/:agentId/archive`.
- **Reativação**:
  - Invoca `POST /v1/agents/:agentId/reactivate`.
  - Tratamento de erro de cota: Se a organização já estiver com a cota `agents.max` preenchida, o backend rejeita com HTTP 403 `ENTITLEMENT_EXCEEDED`. A UI deve capturar esse erro canônico e informar que a reativação foi bloqueada por limite de cota de agentes ativos.

---

## 12. Estratégia de Responsividade e Tokens de Design

- **Grid e Breakpoints Suportados**:
  - `320px` a `430px` (Smartphones compactos e padrão): Coluna única, formulários com campos empilhados, navegação inferior fixa (`MobileBottomNav`).
  - `768px` (Tablets): Layout flexível de 2 colunas para cards de métricas e histórico.
  - `1024px`, `1440px`, `1920px` (Desktop): Sidebar lateral fixa (`DesktopSidebar`), tabelas expandidas, visualização lado a lado de rascunho e histórico.
- **Design Tokens**:
  - Uso estrito das variáveis CSS já configuradas em `apps/web/src/app/globals.css` (`--background`, `--foreground`, `--card`, `--primary`, `--border`, `--muted`).
  - Estados de foco e touch targets mínimos de 44x44px em telas sensíveis ao toque.

---

## 13. Tratamento de Estados: Carregamento, Erros e Estados Vazios

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

## 14. Estratégia de Testes para o Slice 005D-B

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

## 15. Auditoria de Dependências: Zero Novas Dependências

As dependências já instaladas em `apps/web` e no monorepo são 100% suficientes para a conclusão do Slice 005D:
- `next` (v15.5.25)
- `react` e `react-dom` (v19.3.0)
- `better-auth` (v1.7.5)
- `jose` (v6.2.12)
- `lucide-react` (v0.475.0)
- `@voice-agent/ui` (Design System)
- `@voice-agent/contracts` (Schemas e DTOs)
- `@voice-agent/database` (Persistência)

> **Decisão**: **ZERO novas dependências** adicionadas no package.json.

---

## 16. Itens Expressamente Diferidos (Fora do Escopo 005D)

Para manter o foco estrito na entrega da UI do Agent Studio:
1. **Twilio e Telefonia**: Nenhuma integração com Twilio Voice, WebRTC de telefonia ou Media Streams (pertence à Fase 6).
2. **Execução de Teste do Agente (Test Run Endpoint)**: Diferido para quando a infraestrutura de simulação em tempo real for implementada.
3. **Deploy em Nuvem**: O aplicativo continuará operando localmente no ambiente de desenvolvimento/staging.
4. **Configurações Avançadas de LLM**: Customização de provedores externos, tools e RAG avançado continuam diferidos.

---

## 17. Slices Propostos para Implementação em 005D-B

Com a identificação do gap de bootstrap, a implementação do 005D-B passa a ser estruturada em 6 etapas incrementais e testáveis:

- **Slice 005D-B0 — Tenant Context Bootstrap**:
  - Extensão arquitetural de asserção assimétrica user-scoped (`scope: 'user:bootstrap'`).
  - Endpoints no `apps/api`: `GET /v1/me/organizations` e `GET /v1/organizations/by-slug/{slug}`.
  - Testes de integração do fluxo de bootstrap e resolução segura de slug sem acesso direto do BFF ao banco.
- **Slice 005D-B1 — Active Organization Context & Shell Switcher**:
  - Contexto de organização ativa baseado em rota `/orgs/[orgSlug]/*`.
  - Componente de Switcher de organização no `AppTopbar`.
  - Ativação do item "Agente IA" na barra lateral apontando para `/orgs/{orgSlug}/agents`.
- **Slice 005D-B2 — Catálogo de Agentes e Criação com Quota**:
  - Página `/orgs/[orgSlug]/agents` (lista, badges de status, empty state).
  - Página `/orgs/[orgSlug]/agents/new` (criação e tratamento de cota `agents.max`).
- **Slice 005D-B3 — Detalhes do Agente, Histórico e Lifecycle**:
  - Página `/orgs/[orgSlug]/agents/[agentId]` (metadados, card de rascunho, lista de versões).
  - Diálogos de confirmação de Arquivamento e Reativação com revalidação de cota.
- **Slice 005D-B4 — Editor de Configuração Snapshot V1 e Publicação**:
  - Página `/orgs/[orgSlug]/agents/[agentId]/edit` (Persona, Voz pt-BR, Regras, Playbook, Exemplos).
  - Salvamento explícito com botão "Salvar rascunho".
  - Diálogo modal de publicação com aviso explícito de arquivamento da versão anterior.
- **Slice 005D-B5 — Suíte de Testes Automatizados e Auditoria Final**:
  - Testes unitários e de integração cobrindo papéis RBAC, confidencialidade, CSRF e responsividade.
