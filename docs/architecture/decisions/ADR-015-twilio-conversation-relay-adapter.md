# ADR-015: Twilio ConversationRelay Adapter Boundary e Protocolo de Transporte

- **Status**: Proposed
- **Data**: 2026-09-28

---

## Context (Contexto)

Com a fundação do runtime de voz provider-neutral estabelecida no Slice 006A (ADR-014), a plataforma inicia a implementação do adapter concreto de telefonia para o ecossistema Twilio (Slice 006B).

O transporte de voz conversacional impõe requisitos arquiteturais críticos:
1. **Seleção de Transporte Conversacional**: Twilio oferece múltiplos caminhos de áudio, incluindo Media Streams (áudio raw bi-direcional) e ConversationRelay (sessão orquestrada via WebSocket com STT/TTS gerenciados). ConversationRelay é o candidato principal para a rota conversacional de baixa latência e streaming de tokens de texto.
2. **Isolamento de Fornecedor (Provider-Neutral Core)**: O core de voz (`apps/voice`) e os contratos compartilhados (`packages/contracts`) devem permanecer 100% livres de dependências, tipos ou SDKs da Twilio.
3. **Autenticação e Integridade de Webhook/WebSocket**: A autenticação do handshake da Twilio deve validar formalmente a assinatura `X-Twilio-Signature` via HMAC-SHA1 usando primitivas criptográficas padrão, sem exigir a instalação de SDKs pesados.
4. **Isolamento Multi-Tenant Autoritativo**: O vínculo entre a conexão do provedor e a sessão (`CallSession`) deve ser estabelecido exclusivamente no servidor, proibindo a aceitação de `organizationId` ou metadados de tenant vindos de payloads de cliente não validados.
5. **Prevenção de Chunks Obsoletos (Barge-In)**: Interrupções do usuário detectadas pela Twilio devem invalidar imediatamente a geração em voo, impedindo que chunks de áudio atrasados do modelo sejam enviados ao transporte.

---

## Decision (Decisão)

1. **Localização Exclusiva no Pacote de Integrações**:
   - Todo código específico da Twilio reside em `packages/integrations/src/twilio/`.
   - Core do runtime (`apps/voice`) e contratos neutros (`packages/contracts`) nunca importam tipos ou código da Twilio.
2. **ConversationRelay como Candidato Conversacional Principal**:
   - Adotar o protocolo WebSocket do Twilio ConversationRelay para troca de mensagens estruturadas (`setup`, `prompt`, `interrupt`, `text`, `end`, `error`).
   - Media Streams permanece formalmente documentado como capacidade diferida (*deferred*) para futura observabilidade ou áudio raw.
   - Twilio Conference permanece diferido (*deferred*) para a implementação futura de human handoff.
3. **Tradução Bidirecional Imediata na Fronteira**:
   - `TwilioEventTranslator`: converte mensagens recebidas da Twilio diretamente em `VoiceInputEvent` provider-neutral.
   - `TwilioCommandTranslator`: converte `VoiceOutputCommand` provider-neutral em mensagens estruturadas da Twilio (`text`, `end`).
4. **Validação de Assinatura Desacoplada de SDK**:
   - Função `validateTwilioSignature` implementada com `node:crypto` HMAC-SHA1 e comparação de tempo constante (`timingSafeEqual`), sem adicionar dependências externas de pacotes npm.
5. **Simulador Local Determinístico**:
   - `FakeTwilioConversationRelaySimulator` permite simular cenários felizes, interrupção (barge-in), mensagens malformadas, desconexões e eventos desconhecidos com zero chamadas de rede externa.
6. **Classificação Factual de Provedor**:
   - O status da integração real com a Twilio é formalmente classificado como `PROVIDER-UNVERIFIED` até a execução de testes em tráfego homologado real com operadora.

---

## Consequences (Consequências)

### Positivas
- Zero dependências de SDK proprietário adicionadas ao repositório.
- A suíte de testes automatizados executa em milissegundos localmente sem requisições à internet ou custos de provedor.
- Isolamento multi-tenant garantido por construção.
- Regra de arquitetura automatizada em AST bloqueia qualquer vazamento de tipos da Twilio para o core de voz.

### Limitações e Mitigações
- Comportamentos de rede em condições anômalas reais (ex.: jitter de conexão WebSocket, desconexões silenciosas de carrier) permanecem `PROVIDER-UNVERIFIED` até validação homologada na Fase 8.
