# ADR-012: Concrete Internal Service Assertion Cryptographic Profile

## Status
Accepted

## Data
2026-09-23

## Motivo da Aceitação
Aprovação humana formal concedida no PROMPT-005C após a conclusão satisfatória do Research Gate e Zod Compatibility Gate, complementando DEC-029 e ADR-010.

## Contexto
O ADR-010 estabeleceu que a comunicação interna entre o BFF (`apps/web`) e o núcleo de negócio (`apps/api`) seria realizada através de *Short-Lived Asymmetric Signed Service Assertions*, mantendo a chave privada exclusivamente no emissor (BFF) e a chave pública no receptor (API), garantindo contenção de blast radius e defesa em profundidade.
O ADR-010 manteve pendente a seleção técnica do algoritmo concreto, biblioteca, representação de chaves, claims e valores temporais estritos.

## Decisão

### 1. Algoritmo Criptográfico Concreto
- **Algoritmo**: `EdDSA` utilizando a curva elíptica `Ed25519` (RFC 8037 Octet Key Pair `OKP`).
- **Justificativa**: Suporte nativo e universal no Node.js 22/24 (tanto em `node:crypto` quanto em `crypto.subtle` WebCrypto), sem necessidade de addons nativos ou bibliotecas binárias, com desempenho superior e assinaturas compactas determinísticas.
- **Rejeição**: Rejeita-se categoricamente qualquer algoritmo simétrico (HMAC), algoritmos legados (RSA/RS256) ou fallback em desenvolvimento.

### 2. Biblioteca Criptográfica
- **Biblioteca Selecionada**: `jose` (v6.x).
- **Justificativa**: Implementação completa dos padrões JOSE/JWT/JWS/JWK/JWKS baseada estritamente em Web Standards / WebCrypto API, zero dependências nativas, ativamente mantida e auditada.

### 3. Representação de Chaves (JWK / JWKS)
- **Emissor (`apps/web`)**: Chave privada serializada no formato JSON Web Key (`JWK`):
  - `kty`: `'OKP'`
  - `crv`: `'Ed25519'`
  - `alg`: `'EdDSA'`
  - `kid`: Key ID estável para identificação
  - Parâmetros `x` (público) e `d` (privado).
- **Receptor (`apps/api`)**: Conjunto de chaves públicas em formato JSON Web Key Set (`JWKS`):
  - `keys`: array de chaves públicas (`kty`, `crv`, `alg`, `kid`, `x`).
  - **Invariante de Segurança**: O API verifier valida e rejeita explicitamente qualquer JWKS que contenha material de chave privada (ex.: parâmetro `d`).
- **Suporte a Rotação**: O verifier seleciona a chave pública apropriada a partir do `kid` presente no cabeçalho protegido do token.

### 4. Parâmetros Temporais e Semântica de Replay
- **TTL Nominal Máximo**: **30 segundos**.
- **Invariante de Duração**: `exp - iat <= 30 segundos`. O receptor rejeita tokens cujo tempo total de vida exceda 30 segundos.
- **Clock Skew Tolerance**: **5 segundos**. Utilizado exclusivamente para acomodar pequenas divergências de relógio em `iat` e `exp`. Não amplia o TTL nominal da asserção.
- **Janela de Replay**: Delimitada pelo TTL (TTL-bounded replay window). Prevenção stateful *one-time* permanece pendente de infraestrutura de cache efêmero.

### 5. Cabeçalho Protegido e Claims Canônicos
- **Protected Header**:
  - `alg`: `'EdDSA'` (pinned; qualquer outro algoritmo é rejeitado)
  - `kid`: Identificador da chave de assinatura
  - `typ`: `'JWT'` (obrigatório e estrito)
- **Claims do Payload**:
  - `sub`: Identificador do usuário autenticado no Better Auth (`text`)
  - `orgId`: Contexto de tenant solicitado pelo BFF (`uuid`)
  - `iss`: Identificador estável do emissor (ex.: `'voice-agent:web'`)
  - `aud`: Identificador estável da API (ex.: `'voice-agent:api'`)
  - `iat`: Timestamp UNIX em segundos da emissão
  - `exp`: Timestamp UNIX em segundos de expiração (`iat + 30s`)
  - `jti`: Identificador único da asserção (`crypto.randomUUID()`)
- **Proibição de Claims de Autorização**: O token **NÃO** contém papéis (`role`), permissões (`permissions`), quotas (`agents.max`), status de membership ou dados de perfil. O API consulta deterministicamente o banco de dados para revalidar a autorização de domínio em tempo de execução.

## Consequências
- Modelo de confiança criptográfica idêntico entre desenvolvimento local, staging e produção, variando apenas o par de chaves por ambiente;
- Garantia de que a posse do token não substitui a validação de tenancy e associação ativa do usuário;
- Rotação de chaves viabilizada por `kid` sem interrupção de serviço.
