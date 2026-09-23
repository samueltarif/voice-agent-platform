# Diretrizes de Segurança da Informação (SECURITY.md)

Este documento estabelece as normas mandatórias de proteção de dados, gestão de segredos, controle de acesso e segurança de execução para toda a plataforma e para agentes de IA operando no repositório.

---

## 1. Gestão de Segredos e Credenciais

1. **Zero Credenciais no Repositório**:
   - É estritamente proibido realizar commit de chaves de API, tokens JWT, senhas de banco, certificados ou arquivos `.env` contendo dados reais.
   - Apenas o arquivo `.env.example` com chaves sem valores sensíveis e descrições explicativas deve ser versionado.
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
   - Zero segredos em repositório: arquivos `.env.staging` e `.env.production` permanecem estritamente não rastreados e cobertos pelo `.gitignore`.


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
