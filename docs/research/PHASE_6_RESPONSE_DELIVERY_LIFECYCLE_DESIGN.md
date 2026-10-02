# Phase 6 - Deterministic & Security Response Delivery Lifecycle: Documento de Design (PHASE_6_RESPONSE_DELIVERY_LIFECYCLE_DESIGN.md)

> **Status**: DESIGNED (Runtime: NOT IMPLEMENTED; Live Verification: PROVIDER-UNVERIFIED)
> **Data**: 2026-10-02
> **Fase**: Phase 6 (Voice Model Routing & Jev Evaluation)
> **Prompt de Origem**: `PROMPT-006AC-DETERMINISTIC-SECURITY-RESPONSE-DELIVERY-LIFECYCLE-DESIGN-001`
> **Prompt de Hardening**: `PROMPT-006AC-PR57-DELIVERY-DESIGN-HARDENING-AND-MERGE-001`
> **Branch**: `research/006ac-response-delivery-lifecycle-design`
> **Base main SHA**: `2a09d323a27f9d4f527bb1da7f0fe85fe3eada84`
> **Fronteira Estrita**: AUDIT / DESIGN ONLY. Zero linhas de código funcional alteradas. Zero provider calls (TypeSafe = 0, OpenAI = 0, Twilio = 0). Zero conexões a DB, zero `.env` carregado, zero acesso a holdout.

---

## Executive Summary

Este documento define o design arquitetural provider-neutral para o ciclo de vida de entrega (*response delivery lifecycle*) de respostas determinísticas (`agent.operating_hours`) e estáticas de segurança (`SECURITY_BLOCKED`) em voz, com foco rigoroso no tratamento de **barge-in do usuário**, **supressão de tokens** e **continuidade contextual**.

O design aborda conceitualmente o seguinte cenário de turno:
```
assistant falando
  -> usuário começa a falar (barge-in)
  -> fala anterior deixa de ser válida na aplicação (invalidated)
  -> playback anterior é interrompido conforme capacidade documentada do provider
  -> sistema suprime despacho de novos tokens e aguarda a nova fala final do usuário
  -> próxima resposta é construída a partir da nova fala + contexto conversacional válido + informação reportada da fala interrompida
  -> resposta antiga NÃO continua
  -> OpenAI NÃO dispara resposta paralela em fallback
  -> histórico NÃO inventa que o usuário ouviu texto que não ouviu.
```

### Readiness Classifications (Design vs Runtime vs Live Verification)

| Dimensão | Design Status | Runtime Implementation | Live Provider Verification | Nota Factual |
|---|---|---|---|---|
| `DETERMINISTIC_RESPONSE_DELIVERY` | **DESIGNED** | `NOT IMPLEMENTED` | `PROVIDER-UNVERIFIED` | Lifecycle unificado com pre-dispatch guard e ownership commit |
| `SECURITY_RESPONSE_DELIVERY` | **DESIGNED** | `NOT IMPLEMENTED` | `PROVIDER-UNVERIFIED` | Invariantes de delivery com OpenAI fallback categoricamente desautorizado |
| `USER_BARGE_IN_POST_DISPATCH` | **DESIGNED** | `NOT IMPLEMENTED` | `PROVIDER-UNVERIFIED` | Baseado na auto-interrupção documentada do Twilio CR e evento inbound `interrupt` |
| `APPLICATION_INITIATED_CANCEL` | **DESIGNED** | `NOT IMPLEMENTED` | `PROVIDER-UNVERIFIED` | Supressão de tokens em memória; protocolo Twilio CR não documenta cancel outbound |
| `PLAYBACK_COMPLETION` | **DESIGNED** | `NOT IMPLEMENTED` | `N/A` | Provider não documenta ack acústico; `last: true` qualificado como fim de stream textual |
| `INTERRUPTED_CONTEXT_CONTINUITY` | **DESIGNED** | `NOT IMPLEMENTED` | `PROVIDER-UNVERIFIED` | Seam identificado em `UserInterruptionEvent` para propagar `utteranceUntilInterrupt` |
| `HISTORY_COMPLETION_SAFETY` | **DESIGNED** | `NOT IMPLEMENTED` | `NO` | Separação entre Conversation Context e Delivery Audit; uso de `isInterrupted: true` |

---

## 1. Current Runtime Facts

A auditoria do código versionado em `apps/voice/src/` e `packages/contracts/src/voice/` estabelece os seguintes fatos:

### 1.1 Fluxo Atual de Despacho e Interrupção
1. **Início do Turno**: `ConversationOrchestrator.handleUserSpeechFinal()` gera `generationId = "gen_" + turnId + "_" + counter`, marca `activeGenerations.set(callId, generationId)`, persiste a fala do usuário no `historyStore` e invoca `AssistantStreamCoordinator.streamTurn()`.
2. **Coordenação Generativa**: `processModelStream()` itera sobre o stream de chunks da OpenAI. Antes de despachar cada chunk via `transport.speak()`, ele valida `isGenerationActive(callId, generationId)`.
3. **Interrupção de Usuário (`user.interruption`)**:
   - `handleUserInterruption()` substitui `generationId` no `activeGenerations` por `"stale_" + turnId`, tornando stale qualquer chunk futuro.
   - Em seguida, chama `transport.interruptSpeech(callId, { generationId: previousGen })`.
   - Se a interrupção ocorre durante o stream, o loop de chunks é interrompido e `AssistantStreamCoordinator.recordTurnCompletion()` **nunca é chamado**. Consequentemente, a resposta parcial do assistant é totalmente omitida do `historyStore`.
4. **Despacho Determinístico Atual (`agent.operating_hours`)**:
   - O handler determinístico emite seu texto em chamada única: `transport.speak(callId, { text, generationId, isFinal: true })`.
   - Como é uma chamada single-shot, o texto inteiro é enviado ao adapter de uma vez. O staleness check pré-despacho impede o envio se a interrupção ocorreu antes de `speak()`, mas uma vez enviado ao adapter, a aplicação depende do media server para interromper a reprodução de áudio.

### 1.2 Auditoria de Contratos (`packages/contracts/src/voice/**`)
- `VoiceTransportPort`:
  - `speak(callId: string, command: VoiceOutputCommand): Promise<void>`
  - `interruptSpeech(callId: string, command: VoiceCancelCommand): Promise<void>`
  - `endCall(callId: string, reason: string): Promise<void>`
- `VoiceOutputCommand`: `{ text: string; generationId?: string; isFinal?: boolean }`
- `VoiceCancelCommand`: `{ generationId?: string }`
- `VoiceInputEvent`: `UserInterruptionEvent` possui atualmente apenas `{ callId, organizationId, turnId, timestamp }`. Não possui campos de texto ou duração interrompida.
- `AppendTurnInput`: já possui o campo opcional `isInterrupted?: boolean`.
- `CURRENT_PROVIDER_NEUTRAL_CANCEL_COMMAND`: `interruptSpeech(callId, { generationId })`.
- `CURRENT_PROVIDER_NEUTRAL_PLAYBACK_COMPLETE_EVENT`: **NONE** (não existe evento de playback acústico completo).
- `CURRENT_INTERRUPTION_METADATA`: `turnId` apenas (`utteranceUntilInterrupt` é descartado no adapter).

---

## 2. Official Twilio Capability Evidence

Fontes oficiais consultadas em 2026-10-02:
- **Fonte 1**: Twilio ConversationRelay Technical Documentation (`https://www.twilio.com/docs/voice/conversation-relay`, seção: *Conversation Relay WebSocket Messages Reference*).
- **Fonte 2**: Twilio TwiML Reference: `<ConversationRelay>` (`https://www.twilio.com/docs/voice/twiml/conversationrelay`, seção: *ConversationRelay Attributes*).

### Verificação Factual de Claims

#### A. Automatic Playback Interruption Under Interruptible Mode
- **Documentação Oficial**: No elemento TwiML `<ConversationRelay>`, o atributo `interruptible` controla se a fala do caller ou dígitos DTMF podem interromper o TTS. Valores documentados incluem `"speech"`, `"any"` e `"true"`. Quando ativo, a fala do caller detectada pela Twilio interrompe a reprodução de áudio na conexão.
- **Status Factual**: `PROVIDER_DOCUMENTED_IN_SOURCES_CONSULTED`.
- **Limitação de Evidência**: Trata-se de especificação documental. Comportamento acústico exato em tráfego de produção é classificado como `PROVIDER-UNVERIFIED` até teste live.

#### B. Meaning of Inbound `interrupt` Event
- **Documentação Oficial**: Quando uma interrupção ocorre sob modo `interruptible`, a Twilio envia uma mensagem inbound via WebSocket com `type: "interrupt"`, acompanhada de campos como `utteranceUntilInterrupt` e `durationUntilInterruptMs`. Trata-se de uma notificação de interrupção executada pela infraestrutura do provedor.
- **Status Factual**: `PROVIDER_DOCUMENTED_IN_SOURCES_CONSULTED`.

#### C. Documented Outbound Message Types
- **Documentação Oficial**: Na documentação de mensagens WebSocket de ConversationRelay, as mensagens outbound documentadas do servidor de aplicação para a Twilio são:
  - `text`: `{ type: "text", token: string, last: boolean }`
  - `action`: `{ type: "action", ... }` (ex: transfer, endCall)
- **Status Factual**: `PROVIDER_DOCUMENTED_IN_SOURCES_CONSULTED`.

#### D. Existence of Explicit Outbound Cancel / Clear / Stop Command
- **Documentação Oficial**: As fontes oficiais consultadas para o protocolo WebSocket do Twilio ConversationRelay **não documentam** comando outbound do servidor para abortar ou limpar áudio em buffer (como `clear`, `cancel` ou `stop_playback`). A documentação orienta que o servidor, ao receber `interrupt`, cesse o streaming de novos tokens.
- **Status Factual**: `NOT_DOCUMENTED_IN_SOURCES_CONSULTED`.
- **Classificação**: `PROVIDER_BEHAVIOR_BEYOND_DOCUMENTATION = NOT VERIFIED`.

#### E. Existence of Playback Completion Event
- **Documentação Oficial**: Não há evento inbound documentado nas fontes consultadas para notificar a conclusão acústica de reprodução de TTS (sem equivalente ao evento de completion ou drain).
- **Status Factual**: `NOT_DOCUMENTED_IN_SOURCES_CONSULTED`.
- **Classificação**: `PROVIDER_BEHAVIOR_BEYOND_DOCUMENTATION = NOT VERIFIED`.

#### F. Meaning of `last=true`
- **Documentação Oficial**: O campo booleano `last` na mensagem outbound `text` sinaliza à Twilio que o token enviado é o último da resposta atual, encerrando o fluxo textual daquele turno.
- **Status Factual**: `PROVIDER_DOCUMENTED_IN_SOURCES_CONSULTED`.
- **Distinção Crítica**: `last=true` representa conclusão da transmissão textual para o gateway; `last=true != acoustic playback completion`.

#### G & H. Meaning of `utteranceUntilInterrupt` and `durationUntilInterruptMs`
- **Documentação Oficial**: A mensagem `interrupt` inclui `utteranceUntilInterrupt` (texto que a síntese/reprodução alcançou até o corte) e `durationUntilInterruptMs` (duração em ms do áudio reproduzido até a interrupção).
- **Status Factual**: `PROVIDER_DOCUMENTED_IN_SOURCES_CONSULTED`.
- **Rigor de Evidência**: Trata-se de **dados reportados pelo provedor**, e não de prova pericial acústica absoluta do que o usuário efetivamente escutou e compreendeu.

#### I. Documented Ordering between `interrupt` and Next `prompt`
- **Documentação Oficial**: A sequência descrita na documentação de ConversationRelay apresenta o evento `interrupt` sendo emitido quando a fala do usuário é detectada, seguido posteriormente pela mensagem `prompt` quando o usuário finaliza sua fala.
- **Status Factual**: `DOCUMENTED_EXPECTED_SEQUENCE = interrupt -> subsequent prompt after caller speech finalization`.
- **Garantia Universal**: `UNIVERSAL_ORDERING_GUARANTEE = NOT VERIFIED`.
- **Invariante de Design**: Independentemente de ordenações imprevistas de rede, `INTERRUPTION_EVENT_ALONE_STARTS_NEW_RESPONSE = NO` e `NEXT_USER_SPEECH_FINAL_DRIVES_NEW_RESPONSE = YES`.

#### J. Continued Listening After Barge-in
- **Documentação Oficial**: Após o corte de áudio por interrupção, o canal de reconhecimento de voz permanece ativo, transcrevendo a fala do caller e entregando-a na mensagem `prompt` subsequente.
- **Status Factual**: `PROVIDER_DOCUMENTED_IN_SOURCES_CONSULTED`.

---

## 3. Provider vs Adapter vs Runtime Matrix

A tabela abaixo separa estritamente a capacidade nativa do provedor, o suporte no adapter, a integração no runtime e a verificação ao vivo:

| Capacidade | PROVIDER_DOCUMENTED_IN_SOURCES_CONSULTED | CURRENT_ADAPTER_SUPPORT | RUNTIME_SUPPORT | LIVE_PROVIDER_VERIFIED |
|---|---|---|---|---|
| **Barge-in detection** | `YES` (Twilio CR spec) | `YES` (parseia `interrupt`) | `YES` (emite `user.interruption`) | `PROVIDER-UNVERIFIED` |
| **Provider-native playback stop** | `YES` (media server edge stop) | `N/A` (executado pelo media server) | `N/A` (sem controle direto do media server) | `PROVIDER-UNVERIFIED` |
| **Runtime future-token suppression** | `N/A` (responsabilidade da aplicação) | `YES` (rastreio de geração em memória) | `YES` (`stale_turnId` invalida chunks no stream) | `TESTED LOCALLY` (generativo) |
| **Explicit outbound cancel command** | `NOT_DOCUMENTED` | `NO` (`interruptSpeech` retorna `null`) | `N/A` (método de porta sem mensagem física) | `N/A` |
| **Interruption metadata preservation** | `YES` (`utteranceUntilInterrupt`) | `YES` (`IMPLEMENTED / TESTED LOCALLY`) | `NO` (consumo no orchestrator pendente no Slice B) | `PROVIDER-UNVERIFIED` |
| **Playback completion ack** | `NOT_DOCUMENTED` | `NO` | `NO` | `N/A` |
| **Text final marker (`last: true`)** | `YES` | `YES` (`isFinal -> last: true`) | `YES` (ao fim de stream ou single-shot) | `PROVIDER-UNVERIFIED` |
| **Next-user-turn delivery (`prompt`)** | `YES` | `YES` (mapeia para `user.speech.final`) | `YES` (inicia novo ciclo de turno) | `PROVIDER-UNVERIFIED` |

---

## 4. Response Ownership & Commit Point

### 4.1 Comparação de Opções de Commit

| Dimensão | OPTION_A (Após `speak()` retornar) | OPTION_B (Imediatamente antes de `speak()`) | OPTION_C (Após ack do provider) |
|---|---|---|---|
| **Ponto de Commit** | Após await de `transport.speak()` | Imediatamente antes de chamar `transport.speak()` | Após mensagem de confirmação do provider |
| **Risco de Double-Speech** | **ALTO**: Se `speak()` falhar parcialmente durante o envio pelo socket, o fallback para OpenAI dispararia fala concorrente | **MINIMIZADO PELA INVARIANTE DA APLICAÇÃO**: Uma vez iniciado o despacho, a propriedade da resposta é irrevogável; fallback generativo é bloqueado | **INVIÁVEL**: Twilio CR não emite acks de despacho para mensagens `text` |
| **Unknown Partial Dispatch** | Inseguro: pode enviar parte do texto e ainda assim acionar fallback generativo | Seguro: qualquer tentativa de despacho assume que o provider pode ter recebido e sintetizado o texto | Inobservável documentalmente |
| **Transport Exception Handling** | Tende a tratar exceção como "nada foi falado", arriscando falar duas vezes | Trata exceção como falha técnica de entrega de turno, sem regredir para modelo generativo | N/A |
| **Complexidade** | Baixa | Mínima (uma guarda determinística) | Alta (exigiria protocolo com ACKs) |

### 4.2 Decisão Arquitetural Formal
**Selecionado**: `OPTION_B` (Commit imediatamente antes da tentativa de despacho).

```
INVARIANTE DE DESIGN:
DISPATCH_ATTEMPTED -> NO_OPENAI_FALLBACK
```

1. Quando o orquestrador seleciona uma resposta determinística ou de segurança e prepara a chamada a `transport.speak()`, o **Response Ownership é comitado**.
2. A partir da tentativa de despacho, o fallback para o modelo generativo (`streamTurn()`) é bloqueado pela invariante da aplicação, prevenindo concorrência de fala no mesmo turno.
3. Para decisões `SECURITY_BLOCKED`, o fallback para OpenAI já é categoricamente `NOT AUTHORIZED` por definição de segurança; o commit em `OPTION_B` estende essa blindagem às respostas determinísticas (`agent.operating_hours`).

---

## 5. Lifecycle Semantics & Conceptual States

Aplicando YAGNI (`CURRENT_REQUIREMENT`, `EXISTING_OPTION`, `MINIMAL_OPTION`), o ciclo de vida não requer persistência pesada de estados em banco, operando via marcadores conceituais determinísticos na memória do processo:

```
[TURN START]
      |
      v
  PREPARED
      |  (Seleção determinística ou estática de segurança concluída)
      v
  OWNERSHIP_COMMITTED  <-- Ponto de Não-Retorno (Fallback OpenAI Proibido)
      |
      v
  DISPATCH_ATTEMPTED   <-- Chamada a transport.speak() iniciada
      |
      +-----------------------------------------+
      |                                         |
      v (Tokens transmitidos no socket)         v (Barge-in detectado)
  DISPATCH_ACCEPTED                         INTERRUPTED
      |                                         |
      v (last: true enviado)                    v (Áudio cortado na borda)
  COMPLETION_UNKNOWN                        WAIT_FOR_NEXT_SPEECH_FINAL
  (Playback completion acústica             (Aguardando novo prompt)
   inobservável no provider)
```

### Definição dos Marcadores Conceituais
- `PREPARED`: O texto da resposta foi produzido localmente pelo handler ou template de segurança.
- `OWNERSHIP_COMMITTED`: A resposta foi designada como definitiva para o turno; fallback generativo desautorizado.
- `DISPATCH_ATTEMPTED`: `transport.speak()` foi invocado com o `generationId` ativo.
- `DISPATCH_ACCEPTED`: O socket transmitiu os tokens sem erro imediato de I/O.
- `INTERRUPTED`: Evento `user.interruption` recebido; `generationId` marcado como `stale`; despacho de novos chunks bloqueado.
- `COMPLETION_UNKNOWN`: Tokens transmitidos, porém a audição integral pelo usuário é inobservável por falta de ack acústico do provider.

---

## 6. Pre-Dispatch vs Post-Dispatch Interruption

### 6.1 Pre-Dispatch Interruption
- **Cenário**: O usuário emite nova fala ou ruído antes que o handler termine de calcular ou antes da chamada a `transport.speak()`.
- **Comportamento**:
  - `activeGenerations.get(callId)` é alterado para `stale_turnId` por `handleUserInterruption()`.
  - O pre-dispatch guard verifica `isGenerationActive(callId, generationId)`.
  - Sendo falso, o despacho é **suprimido**.
  - `transport.speak()` **NÃO é chamado**.
  - Nenhuma resposta do assistente é gravada no histórico.
  - `PRE_DISPATCH_INTERRUPTION_SEMANTICS = DESIGNED`.

### 6.2 Post-Dispatch Interruption (Barge-in Durante Reprodução)
- **Cenário**: `transport.speak()` já foi chamado, o áudio está sendo emitido pelo provider e o caller fala.
- **Comportamento**:
  1. O media server da Twilio interrompe a reprodução de áudio na conexão telefônica conforme documentado para `interruptible=true`.
  2. A Twilio envia a mensagem WebSocket `interrupt` com `{ utteranceUntilInterrupt, durationUntilInterruptMs }`.
  3. O adapter recebe `interrupt` e aciona o callback de `user.interruption`.
  4. O orquestrador executa `handleUserInterruption()`:
     - Marca a geração atual como `stale_turnId`.
     - Invalida o envio de quaisquer chunks restantes em memória.
  5. A aplicação não envia cancel outbound via socket (comando não documentado no protocolo).
  6. A aplicação **NÃO inicia uma nova resposta de IA imediatamente** (`INTERRUPTION_EVENT_ALONE_STARTS_NEW_RESPONSE = NO`).
  7. O sistema **aguarda** a mensagem `prompt` (mapeada para `user.speech.final`).

---

## 7. App-Initiated vs User-Initiated Cancellation

| Dimensão | `USER_INITIATED_BARGE_IN` | `APPLICATION_INITIATED_CANCEL` |
|---|---|---|
| **Origem** | Caller começa a falar no telefone | Decisão interna da aplicação (timeout, erro, lógica de negócio) |
| **Suporte Twilio CR** | `DOCUMENTED_IN_SOURCES_CONSULTED` (Gateway detecta fala e interrompe áudio) | `NOT_DOCUMENTED_IN_SOURCES_CONSULTED` (Twilio CR não possui comando outbound de cancel) |
| **Ação do Runtime** | Recebe `interrupt`, invalida geração e retém novos tokens | Invalida geração e cessa envio de novos tokens; áudio já em buffer não pode ser abortado via socket |
| **Sinalização** | Evento inbound `interrupt` | Ação interna do orquestrador |

---

## 8. Interrupted Utterance Context & Seam de Preservação

### 8.1 Gap Auditado e Resolução no Slice A
Na auditoria inicial de `packages/integrations/src/twilio/twilio-event-translator.ts`:
- A função `parseInterrupt` extraía com sucesso `utteranceUntilInterrupt` e `durationUntilInterruptMs`.
- No entanto, a função `translateTwilioInboundEvent` mapeava a mensagem para `UserInterruptionEvent` descartando esses campos.
- **Resolução no Slice A**: `INTERRUPTED_UTTERANCE_METADATA_DROPPED = NO` (`TWILIO_INTERRUPTION_METADATA_PROPAGATION = IMPLEMENTED / TESTED LOCALLY`; campos propagados para o evento provider-neutral).

### 8.2 Seam Implementado no Slice A (Contratos Provider-Neutral)
1. Em `packages/contracts/src/voice/voice-events-contracts.ts`:
   Estendido `UserInterruptionEvent` com campos opcionais provider-neutral:
   ```typescript
   export interface UserInterruptionEvent extends BaseVoiceInputEvent {
     readonly type: 'user.interruption';
     readonly turnId: string;
     readonly interruptedUtterance?: string;
     readonly interruptedDurationMs?: number;
   }
   ```
2. No adapter Twilio (`twilio-event-translator.ts`), função pura `translateInterruptEvent` repassa esses campos ao construir o evento (`!== undefined` preserva duration zero e omite propriedades ausentes).
3. No orquestrador, o consumo desse contexto será integrado no Slice B (`INTERRUPTED_CONTEXT_CONTINUITY_RUNTIME = NOT IMPLEMENTED`).

---

## 9. Separação: Conversation Context vs Delivery Audit

```
+-------------------------------------------------------------------------+
| CONVERSATION CONTEXT (Efêmero, Cognitivo)                                |
| "O que o modelo/assistente precisa saber para formular o próximo turno" |
| Baseado em: texto parcial reportado pelo provider (utteranceUntilInterrupt) |
+-------------------------------------------------------------------------+
                                    vs
+-------------------------------------------------------------------------+
| DELIVERY AUDIT / DURABLE HISTORY (Persistente, Factual)                 |
| "O que é registrado de forma durável para auditoria"                    |
| Invariante: NUNCA atestar entrega completa de resposta interrompida.    |
+-------------------------------------------------------------------------+
```

### Regras de Distinção
1. `TEXT_DISPATCHED != AUDIO_PLAYED != AUDIO_HEARD_BY_USER`.
2. `last: true` sinaliza fim de transmissão textual; não é confirmação acústica.
3. `INTERRUPTED_ASSISTANT_TEXT_SOURCE = provider-reported utteranceUntilInterrupt`.
4. `INTERRUPTED_ASSISTANT_TEXT_ACOUSTIC_PROOF = NO`.
5. `INTERRUPTED_ASSISTANT_TEXT_USE = conversation context + interrupted history metadata`.

---

## 10. History Models Evaluation

| Modelo | Descrição | Context Continuity | Factual Accuracy | Schema Impact | Veredito |
|---|---|---|---|---|---|
| **OPTION_H1** | Persistir resposta completa imediatamente após `speak()` | Ruim (assume que usuário ouviu tudo) | Incorreta sob barge-in | Zero | **REJEITADO** |
| **OPTION_H2** | Não persistir nada até ack de playback acústico completo | Nula (perde o turno do assistente) | Inaplicável (sem ack) | Zero | **REJEITADO** |
| **OPTION_H3** | Persistir estado `DISPATCHED/UNKNOWN` com novas colunas no DB | Alta | Média | Alto (Requer migração de DB) | **REJEITADO** (YAGNI) |
| **OPTION_H4** | Gravar resposta com `isInterrupted: true` e `content = utteranceUntilInterrupt` quando disponível | Alta | Provider-Reported / Não-fabricada | Zero (`AppendTurnInput` já suporta `isInterrupted?: boolean`) | **SELECTED DESIGN** (Runtime: `NOT IMPLEMENTED`) |
| **OPTION_H5** | Contexto parcial efêmero em memória; omitir do histórico durável | Média (turno imediato ok; histórico durável sem fala do assistente) | Conservadora | Zero | **FALLBACK DESIGN** se metadata ausente |

### Resumo da Decisão
- `OPTION_H4 = SELECTED DESIGN`
- `content = provider-reported interrupted assistant utterance when available`
- `isInterrupted = true`
- `HISTORY_RUNTIME_IMPLEMENTATION = NOT IMPLEMENTED`
- `LIVE_PROVIDER_VERIFICATION = NO`
- Se o metadata estiver ausente: fallback para H5 (histórico durável não registra fala completa do assistente).

---

## 11. Event Ordering for Barge-In

```
[1] ASSISTANT_RESPONSE_DISPATCHED
    - transport.speak() invocado com generationId = gen_turn_1
    - Twilio inicia síntese e reprodução do áudio

[2] USER_INTERRUPTION_DETECTED
    - Caller fala na linha telefônica
    - Media server interrompe áudio (interruptible=true)
    - Twilio envia mensagem inbound { type: "interrupt", utteranceUntilInterrupt: "..." }

[3] OLD_GENERATION_INVALIDATED
    - Orchestrator.handleUserInterruption() executa
    - activeGenerations.set(callId, "stale_turn_1")
    - Supressão em memória de chunks subsequentes

[4] OLD_RESPONSE_SUPPRESSED
    - Aplicação cessa envio de novos tokens
    - Metadata de interrupção reportado é retido em memória para o próximo turno

[5] WAIT_FOR_NEW_USER_SPEECH_FINAL
    - INTERRUPTION_EVENT_ALONE_STARTS_NEW_MODEL_RESPONSE = NO
    - Aplicação permanece em silêncio e escuta ativa, sem disparar LLM

[6] NEW_TURN_CREATED
    - Caller conclui sua fala
    - Twilio envia mensagem inbound { type: "prompt", voicePrompt: "..." }
    - Adapter emite evento user.speech.final para o orchestrator

[7] NEW_RESPONSE_ROUTED
    - Novo generationId = gen_turn_2 é registrado
    - Contexto é montado com a fala anterior + fração reportada do assistente + nova fala do usuário
    - Roteador decide deterministicamente ou via LLM
```

---

## 12. Security & Deterministic Response Delivery Lifecycle

O ciclo de vida de entrega é unificado, separando a **fonte do conteúdo** do **mecanismo de despacho**:

```
+-------------------------------------------------------+
| RESPONSE CONTENT SOURCES                              |
| - DETERMINISTIC_HANDLER (agent.operating_hours)       |
| - SECURITY_STATIC_RESPONSE (SECURITY_BLOCKED)         |
| - GENERATIVE_STREAM (OpenAI streamTurn)               |
+-------------------------------------------------------+
                           |
                           v
+-------------------------------------------------------+
| RESPONSE DELIVERY LIFECYCLE (Shared Invariants)       |
| 1. Pre-dispatch staleness guard check                 |
| 2. Ownership commit immediately before dispatch       |
| 3. Transport single-shot or stream dispatch           |
| 4. Dispatch attempted -> no generative fallback       |
| 5. Post-dispatch barge-in listener & metadata capture |
| 6. Interrupted history qualification                  |
+-------------------------------------------------------+
```

### Particularidades de Segurança (`SECURITY_BLOCKED`)
- A resposta entregue ao usuário é estática, determinística e pré-aprovada.
- O fallback para OpenAI é categoricamente **PROIBIDO** (`SECURITY_OPENAI_FALLBACK = NOT AUTHORIZED`).
- Se o usuário interromper a mensagem de bloqueio com nova fala, o novo `user.speech.final` passará novamente pelo pipeline de classificação de segurança e roteamento determinístico.

---

## 13. Failure Matrix

| Cenário de Falha | Ponto do Ciclo | Comportamento Determinístico Obrigatório | Fallback OpenAI Permitido? |
|---|---|---|---|
| **Erro no Handler determinístico antes do commit** | Antes de `speak()` | Loga erro estruturado e avalia fallback configurado | SIM (se seguro e autorizado pela política) |
| **Interrupção de usuário antes do despacho** | Pre-dispatch | Despacho cancelado; `transport.speak()` não é chamado; sem histórico | NÃO (aguarda novo `speech.final`) |
| **Erro de transporte durante `speak()`** | Durante despacho | Loga erro de transporte; marca entrega como falha técnica; NÃO retenta com OpenAI | **PROIBIDO** (Risco de double-speech) |
| **Interrupção de usuário após despacho (`speak()` retornado)** | Post-dispatch | Provider interrompe áudio; orchestrator invalida geração; grava histórico com `isInterrupted: true` | **PROIBIDO** (Aguardar novo `speech.final`) |
| **Desconexão do WebSocket durante reprodução** | Post-dispatch | Transição de sessão para `ENDED`/`TERMINATED`; chamada encerrada | **PROIBIDO** |
| **Erro do provider Twilio após despacho** | Post-dispatch | Log de erro do provider; encerramento controlado da chamada | **PROIBIDO** |
| **Erro ao gravar histórico após despacho** | Pós-despacho | Log de erro em store; não interrompe chamada nem regera resposta | **PROIBIDO** |
| **Conclusão de áudio desconhecida (nominal)** | Pós-despacho | Trata como entregue na íntegra para contexto até que surja interrupção | **PROIBIDO** |

---

## 14. Contract Change Analysis

| Contrato | Mudança Proposta | Status no PR #57 | Status no Slice A | Justificativa |
|---|---|---|---|---|
| `VoiceTransportPort` | Nenhuma | `NO CHANGE` | `NO CHANGE` | Métodos `speak` e `interruptSpeech` existentes são suficientes |
| `VoiceOutputCommand` | Nenhuma | `NO CHANGE` | `NO CHANGE` | Já suporta `{ text, generationId, isFinal }` |
| `VoiceInputEvent` (`UserInterruptionEvent`) | Adicionar campos opcionais `interruptedUtterance?: string` e `interruptedDurationMs?: number` | `NO CHANGE` | `IMPLEMENTED / TESTED LOCALLY` | Propagar metadados reportados pelo provider sem quebrar contratos existentes |

- `CONTRACT_CHANGES_IN_PR57` = `NO`
- `CONTRACT_CHANGES_IN_SLICE_A` = `IMPLEMENTED / TESTED LOCALLY`

---

## 15. Implementation Slices Roadmap (Ordem Estrita)

A implementação deve seguir estritamente a ordem de dependências arquiteturais:

```
Slice A (Contratos & Adapter Offline) [IMPLEMENTED / TESTED LOCALLY]
   -> Slice B (Orchestrator Delivery & Ownership Offline) [NEXT]
   -> Slice C (Security Integration Offline)
   -> Slice D (Controlled Live Provider Verification)
```

### Slice A: Interruption Context Continuity & Domain Contracts (Offline) — [IMPLEMENTED / TESTED LOCALLY]
- Estendido `UserInterruptionEvent` em `packages/contracts/src/voice/voice-events-contracts.ts` com campos opcionais provider-neutral (`interruptedUtterance?: string`, `interruptedDurationMs?: number`).
- Atualizado `twilio-event-translator.ts` para repassar esses campos ao emitir `UserInterruptionEvent`.
- 100% offline, coberto por testes unitários de contrato e adapter (27 testes focados, typecheck aprovado).
- `TWILIO_ACCOUNT_REQUIRED = NO`.

### Slice B: Deterministic Response Delivery & Ownership in Orchestrator (Offline) — [PRÓXIMO PASSO SELECIONADO]
- Implementar despacho determinístico no orquestrador com ownership commit `OPTION_B`.
- Invariante formal: `DISPATCH_ATTEMPTED -> NO_OPENAI_FALLBACK`.
- Tratamento de interrupção com gravação de histórico qualificado (`Option H4`: `isInterrupted: true`).
- 100% offline, coberto por testes unitários e de integração em `conversation-orchestrator.test.ts` usando mocks e fakes.
- `TWILIO_ACCOUNT_REQUIRED = NO`.

### Slice C: Security Response Delivery Integration (Offline)
- Integrar a ação offline `SECURITY_BLOCKED` (`security-blocked-action.ts`) com o lifecycle de entrega de resposta estática.
- Assegurar `SECURITY_OPENAI_FALLBACK = NOT AUTHORIZED` em todas as bordas.
- Testes unitários e de integração offline.
- `TWILIO_ACCOUNT_REQUIRED = NO`.

### Slice D: Controlled Live Provider Verification
- Validação pontual com linha telefônica real e WebSocket Twilio em ambiente controlado.
- Exige credenciais reais de sandbox/teste, autorização humana formal e verificação do corte de áudio na chamada real.
- `TWILIO_ACCOUNT_REQUIRED = YES`.

---

## 16. Twilio Account Decision

- `TWILIO_ACCOUNT_REQUIRED_FOR_CURRENT_DESIGN_SLICE = NO`.
- `TWILIO_ACCOUNT_REQUIRED_FOR_NEXT_IMPLEMENTATION_SLICE = NO` (Slice B é estritamente offline em orquestrador local com mocks).
- Conta Twilio será exigida exclusivamente no **Slice D** (verificação live do provider).

---

## 17. Remaining Blockers Before Production Wiring

Antes de ativar `ACTIVE_GUARDED` ou plugar o roteamento em produção:
1. `SECURITY_RUNTIME_ROUTING_INTEGRATION` permanece `NOT IMPLEMENTED`.
2. `SECURITY_USER_RESPONSE_DELIVERY` permanece `NOT IMPLEMENTED`.
3. `POST_DISPATCH_BARGE_IN_RUNTIME` permanece `NOT IMPLEMENTED`.
4. `INTERRUPTED_UTTERANCE_METADATA_DROPPED`: RESOLVIDO no Slice A (`INTERRUPTION_METADATA_PROPAGATION = IMPLEMENTED / TESTED LOCALLY`; consumo no orchestrator pendente no Slice B).
5. `ACTIVE_GUARDED_PROVIDER_CALL_OWNERSHIP` permanece `BLOCKED / NOT IMPLEMENTED`.
6. `CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE` não liberado.
7. `PRODUCTION_RUNTIME_WIRING = NO`.
8. `CUSTOMER_TRAFFIC = PROHIBITED`.

---

## 18. Non-Goals Explícitos

1. Nenhuma linha de código funcional alterada neste PR.
2. Nenhum teste alterado ou adicionado.
3. Nenhuma alteração contratual executada no PR #57 (postergada para o Slice A).
4. Nenhuma chamada externa a provedores (TypeSafe = 0, OpenAI = 0, Twilio = 0).
5. Nenhum carregamento de variáveis de ambiente (`.env`).
6. Nenhuma conexão a banco de dados.
7. Nenhum acesso a datasets de calibração ou holdouts de segurança.
8. Nenhuma alteração de Frozen Policy.
9. Nenhuma exigência de criação de conta na Twilio neste momento.
