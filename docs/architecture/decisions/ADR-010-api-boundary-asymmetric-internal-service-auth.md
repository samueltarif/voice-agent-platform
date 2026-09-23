# ADR-010: API Boundary and Asymmetric Internal Service Authentication

## Status
Accepted

## Data
2026-09-23

## Motivo da Aceitação
Aprovação humana explícita recebida em 23 de Setembro de 2026, com base nas análises de modelo de ameaça, limites de confiança de serviços e arquitetura de autenticação interna documentadas em `docs/research/PHASE_5_AGENT_STUDIO_GATE.md` (PROMPTs 005A, 005A-FIX e 005A-FINAL-CHECK).

## Contexto
Na arquitetura do sistema, `apps/web` atua como interface visual e Backend-for-Frontend (BFF), gerenciando sessões de usuários de navegador via Better Auth. `apps/api` atua como boundary central de regras de negócio, persistência multi-tenant e orquestração.
Era imperativo resolver a fronteira de comunicação segura e autenticação interna entre esses processos:
1. Como autenticar chamadas internas de serviço sem expor a API diretamente à internet sem autorização;
2. Como conter o raio de explosão (*blast radius*) de uma eventual invasão ou vazamento de segredos de um serviço;
3. Como garantir consistência do modelo criptográfico de segurança entre ambientes locais, de teste e de nuvem gerenciada;
4. Qual framework HTTP adotar para `apps/api` de forma a suportar contratos tipados e OpenAPI em Node.js.

## Modelo de Ameaça (Threat Model)
- **Falsificação de Chamadas por Clientes**: Usuários do navegador não devem poder enviar requisições forjadas diretamente para `apps/api` contornando a validação de sessão e CSRF do BFF.
- **Comprometimento de Serviço Backend**: Se a API (`apps/api`) for comprometida ou sofrer vazamento de memória/configuração, o atacante não deve obter a capacidade de assinar novas requisições em nome de outros serviços.
- **Insegurança de Segredos Compartilhados**: O uso de chaves simétricas compartilhadas (ex.: HMAC com secret único) tornaria qualquer nó consumidor capaz de emitir asserções arbitrárias, destruindo o isolamento entre camadas.
- **Divergência entre Ambientes**: Usar modelos simplificados em desenvolvimento (ex.: HMAC frágil ou bypass) introduz vulnerabilidades operacionais e riscos de vazamento ao migrar para produção.

## Decisão

### 1. Fronteira BFF vs. API de Negócio
- **`apps/web` (BFF)**: Recebe tráfego do navegador, valida sessão com Better Auth, aplica proteção contra CSRF, resolve identidade do operador e gera a asserção interna de serviço assinada assimetricamente para cada chamada repassada à API.
- **`apps/api` (Core Business & Persistence Boundary)**: Ponto central de validação criptográfica da asserção, autorização de domínio multi-tenant e acesso a Repositories tipados em `packages/database`. Acesso direto de navegadores à API sem mediação ou credencial autorizada de serviço é vedado.

### 2. Autenticação Interna de Serviços Assimétrica (Short-Lived Asymmetric Assertion)
- Adota-se o modelo **Short-Lived Asymmetric Signed Service Assertion**:
  - `apps/web` detém a chave privada e assina asserções criptográficas de curta duração para chamadas internas;
  - `apps/api` detém estritamente a chave pública correspondente e verifica a autenticidade e integridade da assinatura;
  - O material privado nunca é compartilhado com a API, contendo categoricamente o raio de explosão.
- **Modelo de Confiança Unificado por Ambiente**:
  - Dev, Staging e Produção utilizam rigorosamente o **mesmo modelo criptográfico assimétrico**;
  - Rejeita-se categoricamente qualquer fallback simétrico temporário em desenvolvimento. Apenas o par de chaves e os parâmetros de configuração variam por ambiente.

### 3. Defesa em Profundidade na Autorização
- A verificação da assinatura criptográfica da asserção interna responde estritamente que a chamada partiu de um serviço autenticado confiável;
- **Revalidação de Domínio Obrigatória**: A camada de aplicação em `apps/api` continua realizando revalidação determinística de:
  1. Associação e existência do membro no tenant (`OrganizationMembership`);
  2. Status ativo do membro (`membership.status == 'ACTIVE'`);
  3. Matriz de permissões por papel (RBAC para `agent.read`, `agent.config.read`, `agent.publish`, etc.);
  4. Quotas e limites operacionais (`agents.max`).

### 4. Semântica de Replay e Limitações
- **Replay Window Bounded by Expiration**: O TTL curto da asserção (ex.: 30-60 segundos) limita estritamente a janela temporal na qual uma asserção capturada poderia ser reutilizada.
- **Prevenção One-Time Stateful Pendente**: A prevenção de reutilização estrita (*one-time nonce tracking*) exige infraestrutura de cache efêmero e veloz (ex.: Redis/Valkey), mantida como `PENDING EPHEMERAL INFRASTRUCTURE`.

### 5. Seleção do Framework HTTP de `apps/api`
- Selecionado **Hono** para Node.js com os pacotes oficiais:
  - `@hono/node-server`: Adaptador para execução nativa no runtime Node.js 22/24 LTS;
  - `@hono/zod-openapi`: Integração de contratos tipados em Zod com geração automática de especificações OpenAPI 3.1.
- Justificativa: Arquitetura minimalista, tipagem TypeScript estrita e suporte nativo a middleware e validação compatível com a biblioteca compartilhada de schemas em `packages/contracts`. A instalação e configuração efetivas ocorrerão no Slice 005C.

## Consequências

### Positivas
- Contenção rigorosa de blast radius: `apps/api` comprometida não pode emitir asserções de serviço;
- Paridade de segurança total entre desenvolvimento local, staging e produção;
- Zero segredos privados commitados no repositório;
- Defesa em profundidade garantida (validação criptográfica não anula regras de domínio e tenant);
- Documentação de rotas e tipagem de contratos alinhadas via OpenAPI e Zod.

### Trade-offs e Riscos
- Assinatura e verificação assimétricas introduzem pequeno overhead de CPU por requisição comparado a chaves simétricas (mitigado por algoritmos modernos em chave elíptica);
- Requer governança de distribuição de chaves públicas/privadas na infraestrutura de deploy;
- A janela de replay permanece limitada pelo TTL da asserção até o provisionamento de cache de nonces.

## Decisões Pendentes para o Slice 005C (Pending 005C Decisions)
Os seguintes detalhes técnicos concretos permanecem em avaliação técnica e serão formalizados com base em documentação oficial e pacotes mantidos no Slice 005C:
1. **Algoritmo Concreto da Asserção**: Escolha entre `Ed25519` (EdDSA) e `ES256` (ECDSA P-256);
2. **Biblioteca JWT / JWS**: Avaliação e seleção de biblioteca mantida do ecossistema Node.js;
3. **Formato de Serialização de Chaves**: Avaliação de strings PEM em variáveis de ambiente vs. JWK;
4. **TTL Concreto**: Definição do valor numérico exato de expiração da asserção (alvo proposto de 30 a 60 segundos);
5. **Procedimento de Rotação de Chaves**: Política operacional de ciclo de vida e troca segura de chaves sem downtime.
