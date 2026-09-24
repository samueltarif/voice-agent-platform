# ADR-013: User-Scoped Tenant Bootstrap Authentication for Dynamic Organization Discovery

## Status
Accepted

## Data
2026-09-24

## Motivo da Aceitação
Aprovação humana formal concedida no PROMPT-005D-A-APPROVAL como extensão controlada de DEC-029/ADR-010 e DEC-031/ADR-012, viabilizando o Slice 005D-B0 (Tenant Context Bootstrap).

## Contexto
O ADR-010 e o ADR-012 fixaram o protocolo de autenticação interna assimétrica entre o BFF (`apps/web`) e a API central (`apps/api`) baseado em *Short-Lived Asymmetric Signed Service Assertions* (Ed25519/EdDSA via `jose`). O contrato de claims canônicas (`serviceAssertionClaimsSchema`) estabelecido no Slice 005C exige estritamente `orgId: z.string().uuid()`.

Entretanto, durante a auditoria arquitetural do Slice 005D-A (Agent Studio Web UI), constatou-se que:
1. O Better Auth em `apps/web` gerencia unicamente a sessão e a identidade do usuário (`userId`), sem persistir `organizationId` no cookie de sessão;
2. As rotas de negócio no `apps/api` exigem um tenant pré-identificado;
3. O `apps/web` está categoricamente proibido de consultar diretamente os repositórios de banco de dados (`packages/database`) para descobrir memberships por DEC-029 / ADR-010;
4. O `InternalServiceSigner` recusa-se a assinar asserções sem `organizationId`, inviabilizando qualquer requisição a `/v1/*` antes de conhecer o tenant.

Este cenário confirmou formalmente o **Active Organization Bootstrap Gap**. Era necessário projetar um canal criptográfico seguro para descoberta e resolução de organizações sem enfraquecer o isolamento multi-tenant nem permitir tokens ambíguos.

## Decisão

### 1. Separação Estrita de Perfis Criptográficos (No Optional `orgId`)
Rejeita-se categoricamente tornar `orgId` opcional no contrato `serviceAssertionClaimsSchema` ou criar união permissiva de schemas. Em vez disso, estabelece-se um segundo perfil criptográfico formal e estritamente segregado: **`UserBootstrapAssertion`**.

- **Tenant Service Assertion** (ADR-012): Exclusivo para operações tenant-scoped (`/v1/agents/*`). Exige obrigatoriamente `orgId: UUID`. Audiência: `voice-agent:api`.
- **User Bootstrap Assertion** (ADR-013): Exclusivo para descoberta e resolução de tenant do usuário autenticado (`/v1/me/*`). Proíbe categoricamente `orgId`. Audiência: `voice-agent:api:bootstrap`.

### 2. Especificação do Perfil `UserBootstrapAssertion`
- **Protected Header**:
  - `alg`: `'EdDSA'` (pinned; qualquer outro algoritmo é rejeitado)
  - `kid`: Identificador da chave de assinatura (reutiliza o par Ed25519 do ambiente)
  - `typ`: `'JWT'` (obrigatório e estrito)
- **Claims Canônicas Obrigatórias**:
  - `sub`: Identificador do usuário autenticado no Better Auth (`session.user.id`, string `text`)
  - `scope`: Valor literal estrito `'user:bootstrap'`
  - `iss`: Identificador estável do emissor (`'voice-agent:web'`)
  - `aud`: Audiência segregada `'voice-agent:api:bootstrap'`
  - `iat`: Timestamp UNIX em segundos da emissão
  - `exp`: Timestamp UNIX em segundos de expiração (`iat + 30s`)
  - `jti`: UUID v4 único da asserção (`crypto.randomUUID()`)
- **Claims Proibidas (Fail-Closed)**:
  O schema do token rejeita expressamente a presença de: `orgId`, `role`, `roles`, `permissions`, `entitlements`, `plan`, `membership` ou dados de perfil do usuário.

### 3. Parâmetros Temporais e Semântica de Replay
- **TTL Nominal Máximo**: **30 segundos** (`exp - iat <= 30s`).
- **Clock Skew Tolerance**: **5 segundos** (acomoda desvios de relógio sem dilatar a validade máxima).
- **Semântica**: Efêmero, assinado no servidor (`server-only`), nunca exposto ao navegador do usuário.

### 4. Segregação de Componentes e Verificação
Para evitar cruzamento indevido ou parsing permissivo:
- **No `apps/web`**:
  - `InternalServiceSigner`: Responsável exclusivo por assinar asserções de tenant (`signTenantAssertion(userId, orgId)`).
  - `InternalBootstrapSigner`: Componente dedicado para assinar asserções de bootstrap (`signBootstrapAssertion(userId)`).
- **No `apps/api`**:
  - `ServiceAssertionVerifier`: Middleware exclusivo das rotas de tenant (`/v1/agents/*`), exigindo `aud: 'voice-agent:api'` e `orgId`.
  - `BootstrapAssertionVerifier`: Middleware exclusivo das rotas de usuário (`/v1/me/*`), exigindo `aud: 'voice-agent:api:bootstrap'` e `scope: 'user:bootstrap'`, e rejeitando tokens que contenham `orgId`.

### 5. Endpoints de Bootstrap Sob `/v1/me/*`
Todas as capacidades de descoberta do usuário são agrupadas sob o namespace `/v1/me/*`:

1. `GET /v1/me/organizations`
   - Retorna as organizações nas quais o usuário autenticado (`sub`) possui membership ativa.
   - Filtros no banco: `membership.userId == assertion.sub`, `membership.status == 'ACTIVE'`, `organization.status == 'ACTIVE'`.
   - DTO de Retorno Mínimo:
     ```json
     [
       {
         "id": "uuid",
         "slug": "string",
         "name": "string",
         "role": "OWNER | ADMIN | MANAGER | OPERATOR | VIEWER"
       }
     ]
     ```
   - O campo `role` é derivado deterministicamente da tabela `organization_memberships` no momento da requisição; nunca é lido de claims do token.

2. `GET /v1/me/organizations/{orgSlug}`
   - Resolve o slug da organização informada na rota.
   - Valida se a organização existe, está `ACTIVE`, e se o usuário (`sub`) possui membership `ACTIVE`.
   - DTO de Retorno Mínimo: `{ id, slug, name, role }`.
   - **Mitigação contra Enumeração de Tenants**: Caso o slug não exista ou pertença a organização na qual o usuário não possui membership ativa, a API responde HTTP 404 (`Not Found`). O slug nunca é tratado como concessão de autorização.

### 6. Fluxos Operacionais Aprovados

#### A. Fluxo de Deep Link (`/orgs/[orgSlug]/agents`)
1. Usuário acessa `/orgs/acme-corp/agents` no navegador;
2. `apps/web` (BFF) obtém a sessão do Better Auth e extrai `userId`;
3. `apps/web` utiliza `InternalBootstrapSigner` e gera `UserBootstrapAssertion` efêmera;
4. BFF chama `GET /v1/me/organizations/acme-corp`;
5. `apps/api` valida o token via `BootstrapAssertionVerifier`, consulta o banco e confirma membership ativa de `userId` em `acme-corp`;
6. `apps/api` retorna `{ id: "<orgId-uuid>", slug: "acme-corp", name: "Acme Corp", role: "ADMIN" }`;
7. Com o `organizationId` em mãos, o BFF utiliza `InternalServiceSigner` para gerar uma `TenantServiceAssertion` válida;
8. BFF chama `GET /v1/agents` na API e renderiza a interface do Agent Studio.

#### B. Fluxo do Switcher de Organizações no Shell
1. Shell do dashboard solicita lista de organizações disponíveis para o usuário logado;
2. BFF emite `UserBootstrapAssertion` e chama `GET /v1/me/organizations`;
3. `apps/api` retorna a lista filtrada de organizações ativas;
4. Shell renderiza o dropdown de troca de organização;
5. Ao selecionar uma organização, a UI navega deterministicamente para `/orgs/{selectedOrgSlug}/agents`.

Nenhum token interno (Bootstrap ou Tenant) é transmitido ao navegador em nenhuma etapa.

### 7. Requisitos Obrigatórios de Testes para o Slice 005D-B0
A futura implementação do Slice 005D-B0 só será aceita mediante comprovação automatizada de 18 casos de segurança:
1. `UserBootstrapAssertion` válida em `GET /v1/me/organizations` retorna HTTP 200 com lista de tenants ativos;
2. `UserBootstrapAssertion` válida em `GET /v1/me/organizations/{slug}` com membership ativa retorna HTTP 200 com metadados;
3. `UserBootstrapAssertion` submetida a rotas de tenant (`/v1/agents/*`) é rejeitada com HTTP 401;
4. `TenantServiceAssertion` submetida a rotas de bootstrap (`/v1/me/*`) é rejeitada com HTTP 401;
5. Asserção com claim `orgId` submetida a rotas de bootstrap é rejeitada;
6. Asserção com claims de autorização (`role`, `permissions`) é sumariamente rejeitada;
7. Asserção com `scope` incorreto ou ausente em `/v1/me/*` resulta em HTTP 401;
8. Asserção com `aud` diferente de `'voice-agent:api:bootstrap'` resulta em HTTP 401;
9. Asserção com assinatura Ed25519 adulterada resulta em HTTP 401;
10. Asserção assinada com `kid` desconhecido resulta em HTTP 401;
11. Asserção expirada (`exp < now`) resulta em HTTP 401;
12. Asserção com duração excessiva (`exp - iat > 30s`) resulta em HTTP 401;
13. Usuário com membership `SUSPENDED` ou inativa não recebe o tenant na listagem e recebe HTTP 404 em resolução por slug;
14. Organização arquivada ou inativa é omitida na listagem e retorna HTTP 404 em resolução por slug;
15. Usuário A é terminantemente impedido de resolver o slug ou obter metadados de Organização B na qual não é membro;
16. Alteração de papel (`role`) de um usuário no banco reflete imediatamente na próxima requisição sem necessidade de renovar a sessão do Better Auth;
17. Nenhum segredo criptográfico ou token serializado vaza em logs de erro ou payloads de resposta;
18. Todos os testes unitários e de integração existentes de autenticação tenant-scoped (`/v1/agents/*`) permanecem verdes.

## Alternativas Rejeitadas

1. **Tornar `orgId` opcional no `ServiceAssertion` Existente**: Rejeitado porque criaria superfícies de ataque ambíguas, enfraqueceria as validações obrigatórias de tenant nas rotas de negócio e aumentaria o risco de falhas de isolamento cross-tenant.
2. **Schema com União Permissiva (`z.union([TenantAssertion, BootstrapAssertion])`)**: Rejeitado para evitar complexidade e permissividade em middleware único. Cada rota monta o middleware de verificação exato para o seu perfil.
3. **Credencial Compartilhada / Chave Simétrica / mTLS no BFF**: Rejeitado por introduzir um segundo mecanismo criptográfico concorrente ao padrão assimétrico Ed25519 estabelecido no ADR-012.
4. **Consulta Direta do BFF ao Banco de Dados**: Rejeitado categoricamente por violar DEC-026, DEC-029 e ADR-010.

## Consequências
- **Positivas**:
  - Elimina o gap de bootstrap permitindo navegação profunda por rota (`/orgs/[orgSlug]/agents`) e preenchimento dinâmico do organization switcher;
  - Preserva 100% da garantia e rigidez das 11 rotas de agentes criadas no Slice 005C;
  - Mantém o princípio do menor privilégio: o token de bootstrap apenas atesta quem é o usuário, enquanto a autorização e mapeamento de tenant ocorrem exclusivamente na camada de persistência sob governança de `apps/api`.
- **Compromissos**:
  - Exige a implementação do slice preparatório `005D-B0 — Tenant Context Bootstrap` com a criação dos componentes `InternalBootstrapSigner` e `BootstrapAssertionVerifier`, além dos 2 endpoints sob `/v1/me/*`.
