# Diretrizes de Segurança da Informação (SECURITY.md)

Este documento estabelece as normas mandatórias de proteção de dados, gestão de segredos, controle de acesso e segurança de execução para toda a plataforma e para agentes de IA operando no repositório.

---

## 1. Gestão de Segredos e Credenciais

1. **Zero Credenciais no Repositório**:
   - É estritamente proibido realizar commit de chaves de API, tokens JWT, senhas de banco, certificados ou arquivos `.env` contendo dados reais.
   - Somente templates sanitizados de ambiente com sufixo `*.example` e sem valores sensíveis podem ser versionados (ex.: `.env.example`, `.env.staging.example`, `.env.production.example` quando necessários e vazios/sanitizados).
   - Arquivos reais de ambiente (`.env`, `.env.local`, `.env.staging`, `.env.production`) ou qualquer arquivo contendo segredos reais são terminantemente proibidos de versionamento e devem permanecer cobertos por `.gitignore`.
2. **Proteção de Logs (Sanitização Automática)**:
   - Nenhum segredo ou informação de autenticação (ex.: `Bearer token`, `apiKey`, `client_secret`, senhas, dados de cartão) pode ser gravado em logs.
   - O pacote `packages/logger` deve implementar mascaramento (*redaction*) automático em tempo de serialização para campos sensíveis conhecidos.
3. **Injeção de Configuração em Produção**:
   - Configurações e segredos são injetados exclusivamente via variáveis de ambiente fornecidas por gerenciadores dedicados (ex.: AWS Secrets Manager, HashiCorp Vault ou Doppler).
4. **Autenticação e Sessões (Better Auth - DEC-026)**:
   - Better Auth opera exclusivamente para Identidade e Sessão em `apps/web`.
   - O plugin `organization` do Better Auth é desabilitado; a governança de organizações, membros e permissões pertence integralmente ao domínio da aplicação.
   - Segredos de autenticação (`BETTER_AUTH_SECRET`) e credenciais de banco (`DATABASE_URL`) são obrigatórios apenas em runtime e estritamente proibidos de inclusão em repositório ou logs.
5. **Governança de Conexões Gerenciadas em Nuvem e TLS Estrito**:
   - Conexões ao PostgreSQL gerenciado em nuvem (Neon) exigem criptografia em trânsito TLS mandatória (`sslmode=require`).
   - É estritamente proibido desabilitar a validação de certificados da Autoridade Certificadora (`rejectUnauthorized: false` é terminantemente proibido).
   - Segregação de endpoints: o runtime utiliza o endpoint com pool gerenciado (`DATABASE_URL`), enquanto migrações de schema exigem conexão direta (`MIGRATION_DATABASE_URL`) com validação *fail-closed*.
6. **Fronteira de Confiança e Autenticação Interna de Serviços (DEC-029 / ADR-010)**:
   - **Browser ──► Web**: Usuários do navegador comunicam-se com `apps/web` (BFF) através de sessões protegidas por Better Auth e mecanismos de proteção contra CSRF.
   - **Web ──► API**: Comunicação entre serviços utiliza asserção assinada assimetricamente de curta duração (*Short-Lived Asymmetric Signed Service Assertion*). `apps/web` detém material privado de assinatura e `apps/api` detém estritamente o material público de verificação.
   - **Contenção de Blast Radius**: O material privado nunca reside na API; o comprometimento de `apps/api` não permite forjar novas asserções de serviço.
   - **Modelo de Confiança Unificado**: Dev, Staging e Produção adotam exatamente o mesmo modelo criptográfico assimétrico, segregando apenas as chaves por ambiente.
   - **Defesa em Profundidade**: A verificação da assinatura na API não anula a autorização de domínio; `apps/api` revalida membership (`OrganizationMembership`), status do membro, RBAC (`agent.read`, `agent.config.read`) e quotas (`agents.max`).
   - **Janela de Replay**: A expiração curta da asserção delimita a janela de reutilização; prevenção stateful de reutilização *one-time* não está implementada nesta fase (`PENDING EPHEMERAL INFRASTRUCTURE`).
   - **Perfil Criptográfico Tenant-Scoped (DEC-031 / ADR-012)**: Implementado e testado no Slice 005C com assinatura Ed25519 (`EdDSA`), formato JWK privado em `apps/web`, JWKS público em `apps/api`, biblioteca `jose` v6, TTL nominal de 30 segundos (`exp - iat <= 30`), clock tolerance de 5 segundos, header obrigatório (`alg: EdDSA`, `typ: JWT`, `kid`), e claims canônicas (`sub`, `orgId`, `iss`, `aud: 'voice-agent:api'`, `iat`, `exp`, `jti`). Exclusivo das rotas tenant-scoped (`/v1/agents/*`).
   - **Perfil Criptográfico User-Scoped para Bootstrap (DEC-032 / ADR-013)**: Aprovado formalmente para o Slice 005D-B0. Token segregado para descoberta de organizações (`scope: 'user:bootstrap'`, `sub: userId`, `aud: 'voice-agent:api:bootstrap'`), proibindo categoricamente `orgId` e claims de autorização. Consumido exclusivamente pelas rotas `/v1/me/*` via `BootstrapAssertionVerifier`. Revalidação determinística de membership e status no banco; resposta 404 em slugs não acessíveis para mitigar enumeração.
   - **Status da Autenticação Interna de Serviços**: **005C: IMPLEMENTED / LOCAL + NEON STAGING INTEGRATION VALIDATED**. **Tenant Context Bootstrap**: **005D-B0: STAGING CRYPTOGRAPHIC + DATA/AUTHZ BOUNDARY VALIDATED** (DEC-032 / ADR-013). **Production**: NOT PROVISIONED / UNTOUCHED. **Slice 005D-B1**: MERGED / IMPLEMENTED. **Browser Session E2E**: VALIDATED. **Login UI visual E2E**: NOT VALIDATED.


---

## 2. Multi-Tenancy e Isolamento de Dados

1. **Vazamento Cross-Tenant como Incidente Crítico**:
   - A violação do isolamento entre organizações é tratada como severidade máxima.
   - Toda query, mutação, leitura em cache ou evento deve validar o escopo de `organizationId`.
2. **Autorização em Camadas**:
   - Autenticação valida a identidade do usuário/serviço.
   - Autorização verifica:
     1. Se o usuário pertence à organização solicitada;
     2. Se o papel do usuário (RBAC) possui a permissão requerida para a ação (`calls:create`, `agents:edit`, `billing:read`).
3. **Isolamento Estrutural do Platform Admin (Master Admin)**:
   - `Platform Admin` é uma autorização estritamente **GLOBAL**, desacoplada da hierarquia de tenants.
   - Não é modelada como um papel interno a uma `Organization`.
   - Um usuário de tenant está categoricamente impossibilitado de se auto-elevar a Platform Admin por alteração de memberships ou papéis organizacionais. Consulte `docs/PLATFORM_CONTROL_PLANE.md`.

---

## 3. Segurança na Invocação de Ferramentas por IA (Tool Calling)

A execução de ferramentas por agentes de voz durante chamadas telefônicas apresenta vetores de ataque específicos (ex.: *prompt injection* ou coerção do interlocutor). Portanto:

1. **Princípio do Menor Privilégio para Tools**:
   - Cada ferramenta registrada para um agente de voz deve ter escopo estritamente delimitado e somente de leitura sempre que possível.
   - Exemplo: uma tool de "consultar preço de produto" só pode ler dados daquele `organizationId` e não pode ter acesso a dados financeiros globais ou outros tenants.
2. **Validação Determinística Obrigatória**:
   - Parâmetros passados pelo LLM para invocar uma tool (ex.: `productId`, `date`, `quantity`) devem ser submetidos a validação rigorosa de schema (tipagem, limites, sanitização de caracteres) antes de qualquer processamento.
3. **Ações Críticas Exigem Autorização Explícita**:
   - Ferramentas com efeitos colaterais de alto impacto (ex.: estorno financeiro, contratação de planos, exclusão de dados) não podem ser executadas autonomamente pelo agente de voz sem confirmação segura em duas etapas ou intermediação humana.

---

## 4. Proteção de Chamadas Telefônicas e Áudio

1. **Mídias Privadas com Acesso Autorizado**:
   - Arquivos de gravação de chamadas armazenados no object storage são privados por padrão e nunca devem possuir acesso público direto.
   - O acesso deve ocorrer apenas através de mecanismo autenticado/autorizado, temporário e auditável quando aplicável (como URLs pré-assinadas, signed delivery ou endpoint autenticado), após validação estrita de autenticação e tenant (`organizationId`).
   - O **tempo de expiração (TTL)** de tokens de acesso ou URLs é configurável conforme política de segurança e risco de cada deployment — nenhum valor numérico fixo é tratado como regra imutável.
2. **Separação Conceitual de Dados Sensíveis**:
   Os seguintes tipos de dados possuem natureza e tratamento distintos e devem ser gerenciados por políticas separadas:
   - **Audit trail**: Registros imútáveis de ações críticas de usuários e agentes.
   - **Operational logs**: Logs operacionais com retenção definida por política.
   - **Gravações**: Arquivos de áudio das chamadas.
   - **Transcrições**: Texto das conversões com diarização.
   - **Dados pessoais (PII)**: Informações identificáveis de interlocutores.
   - **Dados analíticos**: Métricas e agregações sem PII.
3. **Políticas de Retenção e Privacidade**:
   A plataforma deve permitir futuramente a configuração de políticas de: retenção, expiração, anonimização, pseudonimização, exclusão e legal hold. Períodos legais e regras regulatórias específicas (LGPD, GDPR) não serão definidos sem pesquisa jurídica atualizada.
4. **Conformidade com Privacidade**:
   - Notificação explícita ao interlocutor no início da chamada informando sobre a gravação e processamento por IA, quando exigido pela regulamentação aplicável.
   - Suporte a expurgo programado de áudio e transcrição mediante solicitação de exclusão do titular.
5. **Verificação Regulatória Obrigatória Pré-Produção**:
   - `STATUS: COMPLIANCE VERIFICATION REQUIRED BEFORE PRODUCTION`.
   - Requisitos de aviso, ciência, consentimento e/ou outra base legal aplicável à gravação devem ser verificados antes da produção conforme jurisdição, finalidade, tipo de chamada e legislação/regulação vigente (incluindo telecomunicações e proteção de dados pessoais/LGPD). Prazos de retenção e conformidade serão definidos estritamente após parecer jurídico formal. Consulte `docs/LIVE_CALLS_AND_HANDOFF.md`.

---

## 5. Proteção do Ambiente de Produção contra Agentes de IA

1. **Impossibilidade de Execução Autônoma Destrutiva**:
   - Agentes de IA que auxiliam no desenvolvimento não possuem acesso a credenciais de produção.
   - Scripts de migração com comandos destrutivos (`DROP`, `TRUNCATE`) devem ser bloqueados em pipelines de CI/CD automatizados sem autorização manual.
2. **Ambientes Segregados**:
   - Os ambientes de `dev`, `staging` e `production` possuem bancos, redes, chaves e credenciais totalmente isoladas.

---

## 6. Fronteiras de Segurança e Threat Model do Voice Runtime (Phase 6 / 006A)

1. **Autoridade do Runtime vs. Provedores Externos**:
   - Provedores de telefonia (Twilio) e modelos de IA (LLMs) **NÃO SÃO** a fonte da verdade do domínio.
   - O runtime determinístico (`CallSession`, `ConversationOrchestrator`) detém autoridade total sobre o ciclo de vida, turnos, interrupções e cancelamentos.
   - Provedores externos nunca decidem autonomamente tenant, permissões, faturamento ou encerramento de sessão.
2. **Mitigação de Chunks Atrasados e Concorrência de Fala (Barge-In Threat Boundary)**:
   - Respostas do assistente são estritamente rastreadas por `generationId` unívoco atrelado ao `turnId`.
   - Ao detectar interrupção do usuário (`user.interruption`), a geração ativa é invalidada de forma síncrona.
   - Chunks atrasados originados de chamadas concorrentes da IA são descartados deterministicamente antes de atingirem o transporte de voz, impedindo sobreposição vocal ou desinformação ao interlocutor.
3. **Isolamento Multi-Tenant em Memória**:
   - `CallSessionStorePort` impõe validação obrigatória de `organizationId` em todas as operações de busca e persistência (`organizationId:callId`).
   - Sessões em memória são estritamente particionadas; tentativas de acesso a chamadas de outro tenant retornam `null` e falham com `CallSessionNotFoundError`.
4. **Invariante de Versão Publicada (Published-Only Execution)**:
   - A criação de sessões de chamada exige explicitamente `agentVersionStatus === 'PUBLISHED'`.
   - Rascunhos (`DRAFT`) ou versões arquivadas (`ARCHIVED`) são rejeitados imediatamente com `InvalidAgentVersionStatusError`, eliminando o risco de executar configurações experimentais ou não homologadas em produção.

---

## 7. Threat Model do Adapter de Telefonia e WebSocket Boundary (Phase 6 / 006B)

1. **Entrada de Provedor Não Confiável (Untrusted WebSocket/Provider Input)**:
   - Todo payload recebido via WebSocket do provedor é tratado como não confiável.
   - Mensagens são submetidas a parsing seguro e validação de schema rigorosa antes de qualquer processamento (`InvalidProviderMessageError`).
   - Mensagens malformadas são rejeitadas com segurança sem causar encerramento anômalo (*crash*) do processo ou exposição de stack traces ao provedor.
2. **Falsificação de Assinatura (Signature Spoofing)**:
   - O handshake de conexão deve validar formalmente a assinatura criptográfica `X-Twilio-Signature` calculada via HMAC-SHA1 com o Auth Token do provedor.
   - A comparação de assinaturas utiliza comparação de tempo constante (`timingSafeEqual`) para mitigar ataques de temporização (*timing attacks*).
   - Falhas de assinatura rejeitam a requisição com `ProviderAuthenticationError`.
3. **Vínculo Autoritativo de Tenant e Proteção contra Hijack (Cross-Tenant Binding & Connection Hijack)**:
   - O contexto de sessão (`organizationId`, `callId`, `agentSnapshot`) é vinculado autoritativamente no lado do servidor no momento do bootstrap da chamada.
   - Nenhuma mensagem, parâmetro de query ou metadado enviado pelo cliente ou provedor pode alterar o `organizationId` vinculado à conexão.
   - Conexões com mesmo identificador em tenants distintos operam em namespaces estritamente segregados, impossibilitando mutações cruzadas (*cross-tenant mutations*).
4. **Proteção contra Replay e Eventos Duplicados (Replay / Duplicate Event Protection)**:
   - Handlers de desconexão e encerramento operam de forma determinística e idempotente; desconexões duplicadas não quebram o estado da sessão.
   - A geração em voo é rastreada por `generationId`; eventos duplicados ou defasados são neutralizados pelo orquestrador.
5. **Prevenção de Vazamento de PII e Transcrição em Logs (PII & Transcript Leakage)**:
   - Logs estruturados na camada de adapter são limitados a metadados seguros: `callId`, `organizationId`, tipo de evento, `turnId`, `generationId` e códigos de erro seguros.
   - É expressamente proibido registrar em logs operacionais: transcrições completas da fala, áudio raw, números de telefone, tokens de autenticação ou assinaturas criptográficas.
6. **Desconexão Inesperada e Resiliência (Unexpected Disconnect)**:
   - Desconexões súbitas de transporte são traduzidas para `transport.disconnected`.
   - Se a desconexão ocorrer antes da chamada atingir o estado `ACTIVE` (e.g. em `CONNECTING`), a máquina de estados transita deterministicamente para `FAILED`, prevenindo estados fantasmas em memória.
7. **Mitigação de Chunks Tardios após Interrupção (Stale Output After Interruption)**:
   - O adapter de transporte (`TwilioVoiceTransportAdapter`) mantém controle de gerações canceladas e suprime síncronamente qualquer chunk residual gerado por modelos assíncronos após evento de barge-in.

---

## 8. Threat Model do Gateway de Chamadas e Bootstrap de Sessão (Phase 6 / 006C)

> **Classificação de Evidência da Fronteira (Slice 006C)**: `IMPLEMENTED` / `TESTED LOCALLY`. Todas as mitigações criptográficas (assinatura de webhook e handshake de WebSocket) e garantias de isolamento de bootstrap foram testadas deterministicamente com fixtures locais e simuladores. Validação contra infraestrutura de rede externa ou tráfego de telecomunicação real da Twilio permanece categorizada estritamente como `PROVIDER-UNVERIFIED`.

1. **Falsificação de Webhook (Webhook Spoofing)**:
   - Todo webhook HTTP de voz é submetido à validação de assinatura `X-Twilio-Signature` (HMAC-SHA1 com o Auth Token do provedor) antes de qualquer parsing de regras de negócio, carregamento de configuração ou inicialização de chamada.
   - Requisições sem assinatura ou com assinatura inválida falham imediatamente (*fail-closed*) com `ProviderAuthenticationError` (HTTP 401).

2. **Confusão de URL Canônica e Cabeçalhos Não Confiáveis (Canonical URL Confusion & Untrusted Forwarded Headers)**:
   - A URL canônica utilizada para validação de assinatura é derivada exclusivamente de `PUBLIC_VOICE_BASE_URL` configurado server-side de forma autoritativa.
   - Cabeçalhos de proxy vindos da rede pública (`Host`, `X-Forwarded-Host`, `X-Forwarded-Proto`, `Forwarded`) são terminantemente ignorados e descartados pelo `TwilioCanonicalUrlResolver` na ausência de política formal de proxy confiável, impossibilitando bypass de assinatura ou redirecionamentos maliciosos.

3. **Roubo, Replay e Duplo Consumo de Bootstrap (Bootstrap Theft, Replay & Double Consume)**:
   - O identificador de bootstrap (`bootstrapId`) é um UUID aleatório opaco (`crypto.randomUUID()`) de uso estritamente único (*consume-once*).
   - O consumo via `CallBootstrapRegistryPort.consume(bootstrapId)` é atômico. Se o identificador já tiver sido consumido, a requisição falha imediatamente com `CallBootstrapAlreadyConsumedError` (HTTP 409).
   - Tokens expirados (`now > expiresAt`) são invalidados e rejeitados com `CallBootstrapExpiredError` (HTTP 410).

4. **Isolamento de Tenant no Bootstrap (Cross-Tenant Bootstrap Misuse)**:
   - O `CallBootstrap` armazena o contexto autoritativo (`organizationId`, `callId`, `agentId`, `agentVersionId`, `agentSnapshot`) provisionado pelo servidor.
   - Parâmetros recebidos da Twilio (query params, body params, customParameters) não têm permissão para sobrescrever `organizationId` ou qualquer entidade de autorização vinculada ao bootstrap.

5. **Injeção de XML (XML Injection Defense)**:
   - A geração de TwiML pelo `generateConversationRelayTwiML` submete todos os valores interpolados (URLs, atributos, parâmetros customizados) a escape rigoroso de caracteres XML especiais (`&`, `<`, `>`, `"`, `'`), impedindo injeção de tags ou alteração da árvore XML.

6. **Desacoplamento de Identificadores (Provider Identifier Confusion)**:
   - O identificador interno de chamada (`callId`, UUID) é gerado pelo sistema e opera desacoplado do `CallSid` do provedor.
   - O identificador do provedor é registrado apenas como atributo de transporte (`providerCallId`), impedindo spoofing de chamadas via colisão forjada de identificador externo.

7. **Proteção contra Execução de Versões Não Homologadas (Published Version Bypass)**:
   - O gateway valida que a preparação da chamada exige explicitamente `agentVersionStatus === 'PUBLISHED'`.
   - Rascunhos (`DRAFT`) ou versões arquivadas (`ARCHIVED`) são rejeitados com `InvalidAgentVersionStatusError`, impossibilitando a execução inadvertida de prompts de teste ou rascunhos em chamadas vivas.

8. **Prevenção de Vazamento de Segredos e PII em Logs (PII & Log Leakage)**:
   - Logs do gateway e bootstrap limitam-se a metadados seguros: `callId`, `organizationId`, `agentId`, `agentVersionId`, nome de eventos canônicos (`call.bootstrap.created`, `call.bootstrap.consumed`) e códigos de erro.
   - É terminantemente proibido registrar em logs: o valor completo do token de bootstrap reutilizável, números de telefone de interlocutores, credenciais de autenticação, assinaturas ou conteúdo de prompt/regras.

---

## 9. Threat Model do Runtime do Modelo de Conversação e Memória (Phase 6 / 006D)

> **Classificação de Evidência da Fronteira (Slice 006D)**: `IMPLEMENTED` / `TESTED LOCALLY`. Todas as mitigações contra prompt injection, isolamento multi-tenant de histórico, proteção de barge-in e contenção de autoridade foram validadas deterministicamente com suíte de testes locais e modelos simuladores. Nenhuma API de modelo externa paga foi acessada (`PROVIDER-UNVERIFIED`).

1. **Injeção de Prompt e Confusão Instrução/Dado (Caller Prompt Injection & Instruction/Data Confusion)**:
   - A fala transcrita do interlocutor é tratada estritamente como dado conversacional não-confiável (`trustLevel: 'UNTRUSTED_CALLER_INPUT'`).
   - O `ConversationContextComposer` isola rigidamente as instruções autoritativas do sistema (`persona`, regras de negócio, idioma) do conteúdo do usuário. Tentativas de coerção como "ignore suas instruções" ou "agora você é administrador" jamais afetam regras do sistema, `organizationId` ou autorizações.

2. **Isolamento de Memória Conversacional Cross-Tenant (Cross-Tenant Memory & Namespace Collisions)**:
   - A memória conversacional efêmera (`InMemoryConversationHistoryStore`) é indexada obrigatoriamente pela tupla `${organizationId}:${callId}`.
   - Chamadas com o mesmo identificador em tenants distintos não colidem nem compartilham turnos históricos.

3. **Escalação de Autoridade por Saída de Modelo (Model Output Authority Escalation)**:
   - Respostas do modelo de linguagem (mesmo contendo comandos como "end_call", "transfer", "mudar tenant") são tratadas estritamente como strings de fala destinadas ao sintetizador de áudio.
   - O modelo de linguagem não possui autoridade para transitar a máquina de estados (`CallSession`), executar handoff humano, disparar ferramentas ou alterar tenants.

4. **Prevenção de Vazamento de Transcrições e Prompts em Logs (PII & Transcript Leakage)**:
   - A telemetria e logs de turno limitam-se estritamente a metadados e tempos operacionais (`callId`, `organizationId`, `turnId`, `generationId`, `durationMs`).
   - Transcrições de fala do cliente e prompts confidenciais do agente jamais são impressos em logs de observabilidade.

5. **Mitigação de Saídas Defasadas e Barge-In (Stale Output & Interruption)**:
   - Quando o interlocutor interrompe o assistente, a geração ativa é invalidada atomicamente.
   - O `AssistantStreamCoordinator` descarta qualquer chunk tardio gerado assincronamente pelo modelo, impedindo a emissão de fala defasada no canal de áudio.

6. **Envenenamento de Contexto por Resposta Interrompida (Context Poisoning via Partial Output)**:
   - Respostas parciais do assistente canceladas por interrupção não são persistidas no histórico de aceitação da conversa, evitando alucinações e contaminação em turnos subsequentes.

7. **Sobrecarga de Contexto e Esgotamento de Memória (Unbounded Memory & Context Overflow)**:
   - A memória efêmera aplica política determinística de teto de turnos (`PROPOSED_DEFAULT_MAX_TURNS = 20`), realizando a evicção dos turnos mais antigos quando o limite configurado é atingido.

8. **Tratamento Seguro de Falhas de Provedor (Provider Error Leakage & Fail-Closed)**:
   - Erros do modelo são encapsulados em tipos neutros (`ConversationModelError`), sem vazar detalhes internos de transporte ou dados brutos de provedor externo.

---

## 10. Threat Model do OpenAI Conversation Model Adapter (Phase 6 / 006G)

> **Classificação de Evidência da Fronteira (Slice 006G)**: `IMPLEMENTED` / `TESTED LOCALLY`. Todas as mitigações contra vazamento de credenciais, sanitização de erros HTTP/SSE, isolamento de autoridade, cancelamento de turno e isolamento multi-tenant foram validadas deterministicamente com suíte de testes locais sem chamadas à rede externa (`PROVIDER-UNVERIFIED`).

1. **Vazamento de Chave de API do Provedor (Provider Key Leakage)**:
   - A chave de API (`OPENAI_API_KEY`) reside exclusivamente no servidor em tempo de execução.
   - O adapter nunca registra a chave de API em logs, métricas ou mensagens de erro.
   - Chaves reais são estritamente proibidas em testes, fixtures, commits e documentação.

2. **Vazamento de Prompt e Dados do Usuário em Exceções e Logs (Prompt & PII Leakage)**:
   - Respostas de erro da API da OpenAI ou de rede são tratadas sem gravar o corpo bruto da requisição ou resposta nos logs operacionais.
   - O mapper sanitiza erros em mensagens padronizadas por categoria (`authentication`, `rate_limit`, `timeout_network`, `provider_unavailable`, `invalid_request`, `unknown`).

3. **Vazamento de Erros e Stack Traces Brutos (Provider Error Leakage)**:
   - Mensagens de erro de infraestrutura ou cabeçalhos de resposta proprietários não são propagados para a máquina de estados ou para a interface do usuário.

4. **Isolamento de Contexto Multi-Tenant (Cross-Tenant Context Leakage)**:
   - O adapter não define ou altera a organização (`organizationId`). O contexto é fornecido exclusivamente pelo runtime autoritativo.
   - Requisições paralelas para tenants distintos com o mesmo `turnId` geram payloads estritamente isolados sem cruzamento de dados.

5. **Mitigação de Saídas Tardias e Cancelamento (Stale Output & Abort Signal)**:
   - O cancelamento por interrupção (*barge-in*) propaga o `AbortSignal` diretamente para o fetch nativo e o parser SSE, descartando imediatamente chunks tardios.

6. **Contenção de Autoridade de Saída do Modelo (Model Output Authority Escalation)**:
   - Expressões produzidas pelo modelo (como "end_call", "transfer", "change organization") são estritamente mantidas como texto conversacional e não realizam transições de máquina de estados ou de autorização.

7. **Indisponibilidade e Queda do Provedor (Provider Outage & Fallback Isolation)**:
   - Falhas 5xx e erros de rede emitem evento terminal de falha com indicação de retryabilidade (`isRetryable`), sem bloquear indefinidamente a sessão de chamada.





