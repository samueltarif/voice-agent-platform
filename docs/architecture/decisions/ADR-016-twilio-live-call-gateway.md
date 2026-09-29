# ADR-016: Twilio Live Call Gateway and Server-Side Bootstrap Binding

- **Status**: Proposed
- **Data**: 2026-09-29

---

## Context (Contexto)

Com a fundação do runtime de voz provider-neutral (ADR-014 / Slice 006A) e o adapter de transporte ConversationRelay (ADR-015 / Slice 006B), a plataforma necessita de uma fronteira de entrada HTTP e resolução de ciclo de vida (Slice 006C) para conectar chamadas telefônicas Twilio ao runtime de voz interno.

A orquestração do gateway de chamadas impõe requisitos fundamentais de segurança e governança:
1. **Validação de Assinatura Prévia (Signature-Before-Processing)**: Toda requisição HTTP recebida da Twilio deve ter sua assinatura criptográfica `X-Twilio-Signature` validada antes de qualquer processamento, consulta a banco, carregamento de configuração ou inicialização de sessão.
2. **Resolução de URL Pública Canônica (Canonical Public URL Policy)**: A validação de assinatura exige a URL exata assinada pelo provedor. Cabeçalhos de rede não confiáveis (`Host`, `X-Forwarded-Host`, `X-Forwarded-Proto`) vindos da internet não podem ser aceitos cegamente para evitar ataques de confusão de URL canônica (*canonical URL confusion*).
3. **Bootstrap Autoritativo Server-Side (Opaque Server-Side Bootstrap)**: A conexão WebSocket subsequente do ConversationRelay deve ser associada com segurança ao tenant (`organizationId`), agente (`agentId`), versão publicada (`agentVersionId`) e snapshot de configuração de forma autoritativa. Provedores externos nunca escolhem ou alteram essas entidades.
4. **Semântica Consume-Once Atômica**: O identificador de bootstrap deve ser opaco, de uso único (*consume-once*), temporário (TTL configurável) e consumido de forma estritamente atômica para prevenir ataques de replay e condições de corrida concorrentes.
5. **Invariante de Versão Publicada (Published-Only Invariant)**: Chamadas só podem ser preparadas para versões de agente com status `PUBLISHED`. Rascunhos (`DRAFT`) e versões arquivadas (`ARCHIVED`) são rejeitados deterministicamente.
6. **Segregação de Identificadores**: O identificador interno de chamada (`callId`, UUID) deve ser gerado pelo sistema e desacoplado do identificador do provedor (`callSid`), que atua apenas como metadado de correlação.
7. **Geração Segura de TwiML**: O gateway deve emitir respostas XML válidas para `<Connect><ConversationRelay url="wss://..."><Parameter name="bootstrapId" value="..." /></ConversationRelay></Connect>`, com sanitização estrita contra injeção de XML.

---

## Decision (Decisão)

1. **Política de URL Canônica e Descarte de Forwarded Headers**:
   - A URL canônica para validação de assinaturas é derivada exclusivamente de `PUBLIC_VOICE_BASE_URL` configurado server-side e normalizado (HTTPS obrigatório em produção, sem credenciais, sem fragmentos).
   - Cabeçalhos de proxy reverso (`Host`, `X-Forwarded-*`) são descartados na resolução da URL canônica para validação de assinatura na ausência de política explícita de proxy confiável.
2. **Validação de Assinatura Fail-Closed**:
   - `handleTwilioVoiceWebhook` rejeita requisições sem assinatura ou com assinatura inválida com `ProviderAuthenticationError` (HTTP 401 / fail-closed) antes de interagir com o bootstrap ou o core.
3. **Registro de Bootstrap em Memória e Tokens Opacos**:
   - Criado `CallBootstrapRegistryPort` e implementação `InMemoryCallBootstrapRegistry`.
   - O `bootstrapId` é um UUID aleatório opaco (`crypto.randomUUID()`) que não contém tenant ID, agent ID ou dados sensíveis.
   - Operação `consume(bootstrapId)` atômica: se já consumido, lança `CallBootstrapAlreadyConsumedError`; se expirado, lança `CallBootstrapExpiredError`; se inexistente, lança `CallBootstrapNotFoundError`.
4. **Aplicação do Princípio Published-Only**:
   - `CallLifecycleGateway.prepareCall` valida estritamente `agentVersionStatus === 'PUBLISHED'`, rejeitando `DRAFT` e `ARCHIVED` com `InvalidAgentVersionStatusError`.
5. **Geração Segura de TwiML**:
   - `generateConversationRelayTwiML` monta a estrutura oficial `<Response><Connect><ConversationRelay>` com parâmetros `<Parameter>`, sanitizando todos os valores via escape de XML (`&`, `<`, `>`, `"`, `'`).
   - A URL WebSocket é derivada server-side (`https:` -> `wss:`).
6. **Desacoplamento de Identificadores**:
   - `callId` interno é sempre um UUID nativo da aplicação; `providerCallId` (Twilio CallSid) é registrado apenas como atributo de transporte.
7. **Diferimento de Persistência e Provedores Reais**:
   - Persistência durável de bootstrap em banco ou infraestrutura efêmera (Redis) permanece diferida (*deferred*).
   - O status de integração real com a Twilio permanece categorizado como `PROVIDER-UNVERIFIED`.

---

## Consequences (Consequências)

### Positivas
- Proteção completa contra falsificação de webhook (*webhook spoofing*) e *canonical URL confusion*.
- Eliminação de replay e reutilização de tokens de bootstrap através de consumo atômico *consume-once*.
- Isolamento multi-tenant garantido: o provedor telefônico não possui autoridade sobre tenant ou versão do agente.
- Zero dependências de pacotes npm externos adicionadas.
- Cobertura de testes 100% local e determinística sem necessidade de rede externa ou credenciais reais da Twilio.

### Limitações e Mitigações
- O registro em memória (`InMemoryCallBootstrapRegistry`) atua em processo único; escalabilidade horizontal multi-instância exigirá infraestrutura compartilhada (ex.: Redis ou Postgres efêmero) na fase de infraestrutura distribuída.
- Testes reais de tráfego de telecomunicação dependem da Fase 8 para homologação final de carrier.
