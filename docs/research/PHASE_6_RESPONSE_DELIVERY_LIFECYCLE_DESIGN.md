# Phase 6 - Deterministic & Security Response Delivery Lifecycle: Documento de Design (PHASE_6_RESPONSE_DELIVERY_LIFECYCLE_DESIGN.md)

> **Status**: DESIGNED
> **Data**: 2026-10-02
> **Fase**: Phase 6 (Voice Model Routing & Jev Evaluation)
> **Prompt de Origem**: `PROMPT-006AC-DETERMINISTIC-SECURITY-RESPONSE-DELIVERY-LIFECYCLE-DESIGN-001`
> **Branch**: `research/006ac-response-delivery-lifecycle-design`
> **Base main SHA**: `2a09d323a27f9d4f527bb1da7f0fe85fe3eada84`
> **Fronteira Estrita**: AUDIT / DESIGN ONLY. Zero linhas de código funcional alteradas. Zero provider calls (TypeSafe = 0, OpenAI = 0, Twilio = 0). Zero conexões a DB, zero `.env` carregado, zero acesso a holdout.

---

## Executive Summary

Este documento define o design arquitetural provider-neutral para o ciclo de vida de entrega (*response delivery lifecycle*) de respostas determinísticas (`agent.operating_hours`) e estáticas de segurança (`SECURITY_BLOCKED`) em voz, com foco rigoroso no tratamento de **barge-in do usuário** e **interrupção de playback**.

O design resolve formalmente o cenário crítico:
```
assistant falando
  -> usuário começa a falar (barge-in)
  -> fala anterior deixa de ser válida (invalidated)
  -> playback anterior é interrompido conforme capacidade factual do provider (Twilio CR auto-stops audio)
  -> sistema aguarda a nova fala final do usuário (prompt / user.speech.final)
  -> próxima resposta é construída a partir da nova fala + contexto conversacional válido + informação factual da fala interrompida
  -> resposta antiga NÃO continua
  -> OpenAI NÃO dispara resposta paralela em fallback
  -> histórico NÃO inventa que o usuário ouviu texto que não ouviu.
```

### Readiness Classifications (Seção 25 do Prompt)

| Dimensão de Design | Status | Justificativa Factual |
|---|---|---|
| `DETERMINISTIC_RESPONSE_DELIVERY_DESIGN` | **DESIGNED** | Lifecycle de despacho single-shot unificado com pre-dispatch check e ownership commit |
| `SECURITY_RESPONSE_DELIVERY_DESIGN` | **DESIGNED** | Mesmas invariantes de delivery com OpenAI fallback categoricamente desautorizado |
| `USER_BARGE_IN_POST_DISPATCH_SEMANTICS` | **DESIGNED** | Baseado na capacidade comprovada do Twilio CR de auto-interrupção de áudio e evento inbound `interrupt` |
| `APPLICATION_INITIATED_CANCEL_SEMANTICS` | **DESIGNED** | Diferenciado de barge-in; provider não possui comando outbound de cancel; supressão in-memory de tokens |
| `PLAYBACK_COMPLETION_SEMANTICS` | **DESIGNED** | Provider não emite ack de reprodução acústica; `last: true` qualificado estritamente como fim de stream textual |
| `INTERRUPTED_CONTEXT_CONTINUITY` | **DESIGNED** | Identificado seam para propagar `utteranceUntilInterrupt` ao contexto do próximo turno |
| `HISTORY_COMPLETION_SEMANTICS` | **DESIGNED** | Separação entre Conversation Context e Delivery Audit; uso de `isInterrupted: true` sem forjar completion |

---

## 1. Current Runtime Facts

A auditoria do código versionado em `apps/voice/src/` e `packages/contracts/src/voice/` estabelece os seguintes fatos arquiteturais:

### 1.1 Fluxo Atual de Despacho e Interrupção
1. **Início do Turno**: `ConversationOrchestrator.handleUserSpeechFinal()` gera `generationId = "gen_" + turnId + "_" + counter`, marca `activeGenerations.set(callId, generationId)`, persiste a fala do usuário no `historyStore` e invoca `AssistantStreamCoordinator.streamTurn()`.
2. **Coordenação Generativa**: `processModelStream()` itera sobre o stream de chunks da OpenAI. Antes de despachar cada chunk via `transport.speak()`, ele valida `isGenerationActive(callId, generationId)`.
3. **Interrupção de Usuário (`user.interruption`)**:
   - `handleUserInterruption()` substitui `generationId` no `activeGenerations` por `"stale_" + turnId`, tornando ativa a invalidação de qualquer chunk futuro.
   - Em seguida, chama `transport.interruptSpeech(callId, { generationId: previousGen })`.
   - Se a interrupção ocorre durante o stream, o loop de chunks é interrompido e `AssistantStreamCoordinator.recordTurnCompletion()` **nunca é chamado**. Consequentemente, a resposta parcial do assistant é totalmente omitida do `historyStore`.
4. **Despacho Determinístico Atual (`agent.operating_hours`)**:
   - O handler determinístico emite seu texto em uma única chamada: `transport.speak(callId, { text, generationId, isFinal: true })`.
   - Como é uma chamada single-shot, o texto inteiro é enviado ao adapter de uma vez. O staleness check pré-despacho impede o envio se a interrupção ocorreu antes de `speak()`, mas não cobre o tempo em que o provider sintetiza e reproduz o áudio na linha telefônica após o retorno de `speak()`.

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

Consultando a documentação oficial da Twilio para o **ConversationRelay** (documentação técnica oficial de WebSocket para ConversationRelay / `<Connect><ConversationRelay>`):

### Perguntas e Evidências Oficiais

#### A. O provider interrompe o playback automaticamente quando o usuário fala durante TTS?
- **Evidência Oficial**: Na especificação do Twilio ConversationRelay, o atributo `interruptible` do TwiML `<ConversationRelay>` controla o comportamento de barge-in. Quando configurado como `speech`, `any` ou `true` (o modo padrão/nominal), o media server da Twilio detecta a atividade vocal do caller e **interrompe imediatamente a reprodução do áudio (TTS) no gateway de telefonia**.
- **Status**: `PROVIDER_DOCUMENTED = YES (Automatic playback interruption at edge)`.

#### B. O evento inbound "interrupt" significa que o playback já foi interrompido ou apenas notifica a aplicação?
- **Evidência Oficial**: O evento inbound `{ type: "interrupt", utteranceUntilInterrupt?: string, durationUntilInterruptMs?: number }` é emitido pela Twilio para a aplicação via WebSocket **após** o media server ter detectado a voz e suspendido o playback. Trata-se de uma notificação de evento de interrupção executada na ponta telefônica.
- **Status**: `PROVIDER_DOCUMENTED = YES (Notification of provider-executed audio halt)`.

#### C & D. Existe comando outbound oficial para cancel / clear / stop playback / interrupt TTS?
- **Evidência Oficial**: No protocolo WebSocket do Twilio ConversationRelay, os únicos tipos de mensagens outbound documentadas do servidor para a Twilio são:
  1. `text`: `{ type: "text", token: string, last: boolean }`
  2. `action`: `{ type: "action", ... }` (ex: handoff / endCall)
  **Não existe** mensagem outbound como `cancel`, `clear`, `stop` ou `interrupt`. A responsabilidade do servidor de aplicação ao receber `interrupt` é unicamente **parar de enviar novos tokens textuais** para aquele turno.
- **Status**: `PROVIDER_DOCUMENTED = NO (No outbound cancel/clear message in Twilio CR protocol)`.

#### E. Existe evento oficial de playback complete / audio drained / mark / ack de reprodução?
- **Evidência Oficial**: O protocolo ConversationRelay não emite evento de conclusão de playback acústico (`playback_complete` ou equivalente a WebSocket Media Streams `<Mark>`). A Twilio sintetiza e faz o buffer de reprodução de forma autônoma na borda.
- **Status**: `PROVIDER_DOCUMENTED = NO (No acoustic playback completion signal in Twilio CR)`.

#### F. O campo outbound "last: true" significa último token ou playback acústico concluído?
- **Evidência Oficial**: O campo `last: true` na mensagem `{ type: "text", token: "...", last: true }` instrui o motor de TTS da Twilio de que a transmissão do texto daquele turno foi finalizada (fechamento do stream textual). **Não significa** que o áudio terminou de ser reproduzido ou que o caller o ouviu na íntegra.
- **Status**: `FACTUAL: last=true SIGNALS END OF TEXT STREAM, NOT PLAYBACK COMPLETION`.

#### G & H. Semântica oficial de `utteranceUntilInterrupt` e `durationUntilInterruptMs`
- **Evidência Oficial**:
  - `utteranceUntilInterrupt`: Contém a porção do texto da mensagem do assistente que o motor de TTS da Twilio efetivamente sintetizou e reproduziu para o caller até o instante exato em que a voz do usuário foi detectada.
  - `durationUntilInterruptMs`: Duração em milissegundos do áudio reproduzido antes do corte.
  - Representa com precisão a fração da fala do assistente que foi audível ao usuário.
- **Status**: `PROVIDER_DOCUMENTED = YES (Accurate representation of spoken/heard assistant text)`.

#### I. Ordem entre `interrupt` e próximo `prompt` (fala final do usuário)
- **Evidência Oficial**: Quando o caller interrompe o assistente, a Twilio envia primeiro o evento `interrupt`. Em seguida, o STT da Twilio continua transcrevendo a fala do usuário. Quando o usuário para de falar e o endpointing de fala é atingido, a Twilio envia a mensagem `prompt` com o texto final (`voicePrompt`).
- **Status**: `PROVIDER_DOCUMENTED = YES (interrupt ALWAYS precedes next prompt)`.

#### J. Continuidade de escuta pós-barge-in
- **Evidência Oficial**: O canal de escuta do ConversationRelay permanece ativo após o barge-in, capturando o restante da fala do caller e emitindo o `prompt` subsequente de forma contínua.
- **Status**: `PROVIDER_DOCUMENTED = YES`.

---

## 3. Provider vs Adapter vs Runtime Matrix

A tabela abaixo separa estritamente os quatro estados de comprovação para cada capacidade:

| Capacidade | PROVIDER_DOCUMENTED | CURRENT_ADAPTER_IMPLEMENTED | RUNTIME_INTEGRATED | LIVE_PROVIDER_VERIFIED |
|---|---|---|---|---|
| **Barge-in detection** | `YES` (Twilio CR spec) | `YES` (parseia `interrupt`) | `YES` (emite `user.interruption`) | `PROVIDER-UNVERIFIED` |
| **Automatic playback interruption** | `YES` (media server edge stop) | `N/A` (provider nativo; in-memory drop) | `YES` (`stale_turnId` invalida chunks) | `PROVIDER-UNVERIFIED` |
| **Explicit outbound cancel** | `NO` (não existe no protocolo CR) | `NO` (`translateVoiceOutputCommand` retorna `null`) | `N/A` (chamada à porta existe, sem efeito sobre socket) | `N/A` |
| **Interruption metadata (`utteranceUntilInterrupt`)** | `YES` | `NO` (parseado em `parseInterrupt`, mas descartado em `translateTwilioInboundEvent`) | `NO` (`UserInterruptionEvent` não possui campos) | `PROVIDER-UNVERIFIED` |
| **Playback completion signal** | `NO` (não suportado em CR) | `NO` | `NO` | `N/A` |
| **Text final marker (`last: true`)** | `YES` | `YES` (`isFinal -> last: true`) | `YES` (gerado ao fim de stream ou single-shot) | `PROVIDER-UNVERIFIED` |
| **Next-user-turn delivery (`prompt`)** | `YES` | `YES` (mapeia para `user.speech.final`) | `YES` (inicia novo ciclo de turno) | `PROVIDER-UNVERIFIED` |

> **Nota Crucial**: O fato de o adapter Twilio retornar `null` em `interruptSpeech` (`case 'interrupt_speech': return null;`) **não é uma deficiência do adapter**, mas sim o reflexo exato da especificação do Twilio ConversationRelay, que não possui mensagem de cancelamento outbound. O cancelamento ocorre na borda da Twilio e via interrupção do envio de novos tokens pelo runtime.

---

## 4. Response Ownership & Commit Point

### 4.1 Comparação de Opções de Commit

| Dimensão | OPTION_A (Após `speak()` retornar) | OPTION_B (Imediatamente antes de `speak()`) | OPTION_C (Após ack do provider) |
|---|---|---|---|
| **Ponto de Commit** | Após await de `transport.speak()` | Antes de chamar `transport.speak()` | Após mensagem de confirmação do provider |
| **Risco de Double-Speech** | **ALTO**: Se `speak()` falhar parcialmente durante o envio pelo socket, o fallback para OpenAI dispararia fala concorrente | **ZERO**: Uma vez iniciado o despacho, a propriedade da resposta é irrevogável; fallback generativo é bloqueado | **INVIÁVEL**: Twilio CR não emite acks de despacho para mensagens `text` |
| **Unknown Partial Dispatch** | Inseguro: pode enviar parte do texto e ainda assim acionar fallback generativo | Seguro: qualquer tentativa de despacho assume que o provider pode ter reproduzido o texto | Impossível de observar no protocolo |
| **Transport Exception Handling** | Tende a tratar exceção como "nada foi falado", arriscando falar duas vezes | Trata exceção como falha técnica de entrega de turno, sem regredir para modelo generativo | N/A |
| **Complexidade** | Baixa | Mínima (uma única checagem/guarda determinística) | Alta (exigiria protocolo com ACKs) |

### 4.2 Decisão Arquitetural Formal
**Selecionado**: `OPTION_B` (Commit no início do despacho).

```
INVARIANTE FUNDAMENTAL:
DISPATCH_ATTEMPTED -> NO_OPENAI_FALLBACK
```

1. Quando o orquestrador seleciona uma resposta determinística ou de segurança e chama `transport.speak()`, o **Response Ownership é imediatamente comitado**.
2. A partir desse instante, é estritamente proibido realizar fallback para o modelo generativo (`streamTurn()`), mesmo que o transporte lance exceção ou que o usuário interrompa.
3. Para decisões `SECURITY_BLOCKED`, o fallback para OpenAI já é categoricamente `NOT AUTHORIZED` por definição de segurança; o commit em `OPTION_B` estende essa blindagem às respostas determinísticas (`agent.operating_hours`).

---

## 5. Lifecycle Semantics & State Model

Aplicando rigorosamente YAGNI (`CURRENT_REQUIREMENT`, `EXISTING_OPTION`, `MINIMAL_OPTION`), o ciclo de vida não requer uma nova máquina de estados pesada ou persistente em banco. Bastam marcadores conceituais determinísticos na memória do processo:

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
      v (Normal: tokens enviados)               v (Barge-in detectado)
  DISPATCH_ACCEPTED                         INTERRUPTED
      |                                         |
      v (last: true enviado)                    v (Áudio cortado na borda)
  COMPLETION_UNKNOWN                        WAIT_FOR_NEXT_SPEECH_FINAL
  (Playback completion acústica             (Aguardando novo prompt)
   NÃO observável no provider)
```

### Definição dos Marcadores Conceituais
- `PREPARED`: O texto da resposta foi gerado localmente pelo handler ou template de segurança.
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
  - `activeGenerations.get(callId)` foi alterado para `stale_turnId` por `handleUserInterruption()`.
  - O pre-dispatch guard verifica `isGenerationActive(callId, generationId)`.
  - Como é falso, o despacho é **suprimido**.
  - `transport.speak()` **NÃO é chamado**.
  - Nenhuma resposta do assistente é gravada no histórico.
  - `PRE_DISPATCH_INTERRUPTION_SEMANTICS = DESIGNED`.

### 6.2 Post-Dispatch Interruption (Barge-in em Reprodução)
- **Cenário**: `transport.speak()` já foi chamado (ou múltiplos chunks já foram despachados), o áudio está sendo emitido pela Twilio e o caller fala: *"Não, eu queria saber de sábado."*
- **Comportamento**:
  1. A Twilio corta o áudio imediatamente no gateway de telefonia.
  2. A Twilio envia a mensagem WebSocket `interrupt` com `{ utteranceUntilInterrupt, durationUntilInterruptMs }`.
  3. O adapter recebe `interrupt` e aciona o callback de `user.interruption`.
  4. O orquestrador executa `handleUserInterruption()`:
     - Marca a geração atual como `stale_turnId`.
     - Invalida o envio de quaisquer chunks restantes em memória.
  5. O sistema **NÃO tenta emitir cancel outbound via socket**, pois o provider já interrompeu o áudio e não suporta essa mensagem.
  6. O sistema **NÃO inicia uma nova resposta de IA imediatamente**.
  7. O sistema **permanece em espera** até que a Twilio envie a mensagem `prompt` (mapeada para `user.speech.final`).

---

## 7. App-Initiated vs User-Initiated Cancellation

| Dimensão | `USER_INITIATED_BARGE_IN` | `APPLICATION_INITIATED_CANCEL` |
|---|---|---|
| **Origem** | Caller começa a falar no telefone | Timeout interno, erro de lógica ou evento externo da aplicação |
| **Suporte Twilio CR** | **NATIVO / COMPROVADO**: Gateway detecta fala e corta áudio | **LIMITADO / NÃO SUPORTADO EM ÁUDIO**: Twilio CR não possui comando outbound de cancel |
| **Ação do Runtime** | Recebe `interrupt`, invalida geração e retém novos tokens | Invalida geração e para de enviar novos tokens; áudio já em trânsito no buffer da Twilio não pode ser abortado via socket |
| **Sinalização** | Evento inbound `interrupt` | Ação interna do orquestrador |

---

## 8. Interrupted Utterance Context & Seam de Preservação

### 8.1 Gap Atual Auditado
Na auditoria de `packages/integrations/src/twilio/twilio-event-translator.ts`:
- A função `parseInterrupt` extrai com sucesso `utteranceUntilInterrupt` e `durationUntilInterruptMs`.
- No entanto, a função `translateTwilioInboundEvent` mapeia a mensagem para `UserInterruptionEvent`, que possui apenas:
  ```typescript
  return {
    type: 'user.interruption',
    callId,
    organizationId,
    turnId,
    timestamp: new Date().toISOString(),
  };
  ```
- **Conclusão Factual**: `INTERRUPTED_UTTERANCE_METADATA_DROPPED = YES`.

### 8.2 Seam Mínimo para Preservação Futura (Sem Breaking Changes)
Para viabilizar a continuidade contextual sem quebrar contratos existentes:
1. Em `packages/contracts/src/voice/voice-events.ts`:
   Adicionar campos opcionais em `UserInterruptionEvent`:
   ```typescript
   export interface UserInterruptionEvent extends BaseVoiceEvent {
     readonly type: 'user.interruption';
     readonly turnId: string;
     readonly interruptedUtterance?: string;
     readonly interruptedDurationMs?: number;
   }
   ```
2. No adapter Twilio (`twilio-event-translator.ts`), repassar esses campos ao construir o evento.
3. No orquestrador (`ConversationOrchestrator`), armazenar efemeramente o `lastInterruptedContext` associado à chamada até a chegada do próximo `user.speech.final`.

---

## 9. Separação: Conversation Context vs Delivery Audit

É fundamental separar rigorosamente dois conceitos frequentemente confundidos:

```
+-------------------------------------------------------------------------+
| CONVERSATION CONTEXT (Efêmero, Cognitivo)                                |
| "O que o modelo/assistente precisa saber para formular o próximo turno" |
| Exemplo: Saber que o assistente chegou a dizer "Nosso horário é..."     |
| antes de o usuário intervir com "Não, queria saber de sábado".          |
+-------------------------------------------------------------------------+
                                    vs
+-------------------------------------------------------------------------+
| DELIVERY AUDIT / DURABLE HISTORY (Persistente, Factual)                 |
| "O que foi comprovadamente reproduzido e registrado para auditoria"     |
| Invariante: NUNCA gravar que o usuário ouviu a resposta completa        |
| quando ela foi interrompida no meio.                                    |
+-------------------------------------------------------------------------+
```

### Regras Fatuais de Distinção
1. `TEXT_DISPATCHED != AUDIO_PLAYED != AUDIO_HEARD_BY_USER`.
2. O envio de `last: true` indica apenas que o servidor terminou de mandar texto; não é ack acústico.
3. O histórico durável não pode conter texto fantasma que o usuário nunca ouviu.

---

## 10. History Models Evaluation

| Modelo | Descrição | Context Continuity | Factual Accuracy | Schema Impact | Veredito |
|---|---|---|---|---|---|
| **OPTION_H1** | Persistir resposta completa imediatamente após `speak()` | Péssima (assume que o usuário ouviu tudo) | **FALSA** (mente sobre o que foi ouvido sob barge-in) | Zero | **REJEITADO** |
| **OPTION_H2** | Não persistir nada até ack de playback acústico completo | Nula (perde o turno do assistente) | Inaplicável | Zero | **REJEITADO** (Twilio CR não emite ack, nenhum turno seria gravado) |
| **OPTION_H3** | Persistir estado `DISPATCHED/UNKNOWN` com novas colunas no DB | Alta | Média | **ALTO** (Requer migração de DB e alteração de schema) | **REJEITADO** (Viola YAGNI) |
| **OPTION_H4** | Em interrupção, gravar resposta com `isInterrupted: true` e `content = utteranceUntilInterrupt` | **EXCELENTE** | **EXATA** (reflete o que o provider reportou como falado) | **ZERO** (`AppendTurnInput` já suporta `isInterrupted?: boolean`) | **SELECIONADO (CANÔNICO)** |
| **OPTION_H5** | Manter contexto parcial apenas efêmero em memória; omitir do histórico durável | Boa para o turno imediato | Média (histórico durável fica sem fala do assistente) | Zero | **SELEÇÃO SECUNDÁRIA / FALLBACK** se metadata não estiver disponível |

### Estratégia Adotada: OPTION_H4
- Se o turno completou sem interrupção: grava o texto do assistente com `isInterrupted: false`.
- Se o turno sofreu interrupção e `utteranceUntilInterrupt` estiver disponível: grava o texto parcial com `isInterrupted: true`.
- Se o turno sofreu interrupção e o metadata foi descartado (estado atual): omite a gravação do assistente ou grava com marcador explícito de interrupção, sem forjar a conclusão do texto integral.

---

## 11. Event Ordering for Barge-In

O fluxo temporal rigoroso e ordenado para o tratamento de barge-in:

```
[1] ASSISTANT_RESPONSE_DISPATCHED
    - transport.speak() chamado com generationId = gen_turn_1
    - Twilio começa síntese e reprodução do áudio

[2] USER_INTERRUPTION_DETECTED
    - Caller fala na linha telefônica
    - Twilio CR corta o áudio imediatamente no gateway
    - Twilio envia mensagem inbound { type: "interrupt", utteranceUntilInterrupt: "..." }

[3] OLD_GENERATION_INVALIDATED
    - Orchestrator.handleUserInterruption() executa
    - activeGenerations.set(callId, "stale_turn_1")
    - Qualquer chunk remanescente em trânsito é descartado

[4] OLD_RESPONSE_SUPPRESSED / CANCELLED
    - Nenhuma mensagem outbound é necessária (Twilio já interrompeu áudio)
    - Metadata da interrupção é retido em memória para o próximo turno

[5] WAIT_FOR_NEW_USER_SPEECH_FINAL
    - INTERRUPTION_EVENT_ALONE_STARTS_NEW_MODEL_RESPONSE = NO
    - O sistema permanece em silêncio e escuta ativa, sem disparar LLM

[6] NEW_TURN_CREATED
    - Caller conclui sua fala
    - Twilio envia mensagem inbound { type: "prompt", voicePrompt: "Não, eu queria saber de sábado." }
    - Adapter emite evento user.speech.final para o orchestrator

[7] NEW_RESPONSE_ROUTED
    - Novo generationId = gen_turn_2 é registrado
    - Contexto é montado contendo a fala do usuário anterior + o fragmento que o assistente chegou a falar + a nova fala do usuário
    - Roteador decide deterministicamente ou via LLM a resposta para a pergunta de sábado
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
| 2. Immediate ownership commit (Option B)              |
| 3. Transport single-shot or stream dispatch           |
| 4. Strict post-dispatch OpenAI fallback prohibition   |
| 5. Post-dispatch barge-in listener & metadata capture |
| 6. Interrupted history qualification                  |
+-------------------------------------------------------+
```

### Particularidades de Segurança (`SECURITY_BLOCKED`)
- Para decisões `SECURITY_BLOCKED`, a resposta entregue ao usuário é estática, determinística e pré-aprovada.
- O fallback para OpenAI é categoricamente **PROIBIDO** (`SECURITY_OPENAI_FALLBACK = NOT AUTHORIZED`), independentemente de interrupção, erro de transporte ou desconexão.
- Se o usuário interromper a mensagem de bloqueio de segurança com uma nova fala, a nova fala gerará um novo evento `user.speech.final`, que passará novamente pelo pipeline de classificação de segurança e roteamento determinístico.

---

## 13. Failure Matrix

| Cenário de Falha | Ponto do Ciclo | Comportamento Determinístico Obrigatório | Fallback OpenAI Permitido? |
|---|---|---|---|
| **Erro no Handler determinístico antes do commit** | Antes de `speak()` | Se o handler falha por dados inválidos ou exceção, loga erro estruturado e avalia fallback configurado | SIM (se seguro e autorizado pela política) |
| **Interrupção de usuário antes do despacho** | Pre-dispatch | Despacho cancelado; `transport.speak()` não é chamado; sem histórico | NÃO (aguarda novo `speech.final`) |
| **Erro de transporte durante `speak()`** | Durante despacho | Loga erro de transporte; marca entrega como falha técnica; NÃO retenta com OpenAI | **PROIBIDO** (Risco de double-speech) |
| **Interrupção de usuário após despacho (`speak()` retornado)** | Post-dispatch | Provider corta áudio; orchestrator invalida geração; grava histórico com `isInterrupted: true` | **PROIBIDO** (Aguardar novo `speech.final`) |
| **Desconexão do WebSocket durante reprodução** | Post-dispatch | Transição de sessão para `ENDED`/`TERMINATED`; chamada encerrada; sem despacho adicional | **PROIBIDO** |
| **Erro do provider Twilio após despacho** | Post-dispatch | Log de erro do provider; encerramento controlado da chamada | **PROIBIDO** |
| **Erro ao gravar histórico após despacho** | Pós-despacho | Log de erro em store; não interrompe a chamada nem regera resposta | **PROIBIDO** |
| **Conclusão de áudio desconhecida (nominal)** | Pós-despacho | Trata como entregue na íntegra para contexto até que surja interrupção | **PROIBIDO** |

---

## 14. Contract Change Analysis

Avaliando a necessidade de alterações nos pacotes de contratos (`packages/contracts/src/voice/**`):

| Contrato | Mudança Proposta | CURRENT_REQUIREMENT | MINIMAL_OPTION | Risco de Vazamento Twilio | Veredito |
|---|---|---|---|---|
| `VoiceTransportPort` | Nenhuma | Manter métodos `speak` e `interruptSpeech` existentes | Manter contratos atuais intactos | Nenhum | **ZERO ALTERAÇÃO** |
| `VoiceOutputCommand` | Nenhuma | Comandos atuais já suportam `{ text, generationId, isFinal }` | Manter contratos atuais intactos | Nenhum | **ZERO ALTERAÇÃO** |
| `VoiceInputEvent` (`UserInterruptionEvent`) | Adicionar campos opcionais `interruptedUtterance?: string` e `interruptedDurationMs?: number` | Propagar contexto de interrupção para o domínio sem quebrar listeners | Campos puramente opcionais no evento | Baixo (conceitos universais de telefonia/STT) | **RECOMENDADO PARA SLICE FUTURO (NÃO ALTERAR AGORA)** |

**Conclusão**: Para este slice de design, **zero alterações de contrato são realizadas** (`CONTRACT_CHANGES_REQUIRED_FOR_DESIGN = NO`).

---

## 15. Implementation Slices Roadmap

A implementação subsequente do lifecycle de entrega deve ser dividida em slices coesos e progressivos:

### Slice A: Interruption Context Continuity & Domain Contracts (Offline)
- Adicionar campos opcionais `interruptedUtterance?: string` e `interruptedDurationMs?: number` a `UserInterruptionEvent` em `packages/contracts`.
- Atualizar `TwilioVoiceTransportAdapter` para propagar esses campos sem descartá-los.
- 100% offline, coberto por testes unitários de contrato e adapter.
- `TWILIO_ACCOUNT_REQUIRED = NO`.

### Slice B: Deterministic Response Delivery & Ownership in Orchestrator (Offline)
- Implementar helper coeso de despacho determinístico com `OPTION_B` (ownership commit).
- Blindagem explícita: `DISPATCH_ATTEMPTED -> NO_OPENAI_FALLBACK`.
- Tratamento de interrupção com gravação de histórico qualificado (`isInterrupted: true`).
- 100% offline, coberto por testes em `conversation-orchestrator.test.ts` usando mocks e fakes.
- `TWILIO_ACCOUNT_REQUIRED = NO`.

### Slice C: Security Response Delivery Integration (Offline)
- Integrar a ação offline `SECURITY_BLOCKED` (`security-blocked-action.ts`) com o lifecycle de entrega de resposta estática.
- Garantir `SECURITY_OPENAI_FALLBACK = NOT AUTHORIZED` em todas as bordas.
- Testes unitários e de integração de runtime offline.
- `TWILIO_ACCOUNT_REQUIRED = NO`.

### Slice D: Controlled Live Provider Verification
- Validação pontual com linha telefônica real e WebSocket Twilio em ambiente controlado.
- Exige credenciais reais de sandbox/teste, autorização humana formal e verificação do corte de áudio na chamada real.
- `TWILIO_ACCOUNT_REQUIRED = YES`.

---

## 16. Twilio Account Decision

- `TWILIO_ACCOUNT_REQUIRED_FOR_CURRENT_DESIGN_SLICE = NO`.
- `TWILIO_ACCOUNT_REQUIRED_FOR_NEXT_IMPLEMENTATION_SLICE = NO` (Slices A, B e C são estritamente offline com fakes e stubs tipados).
- Conta Twilio e configuração serão necessárias exclusivamente no **Slice D** (verificação live do provider).

---

## 17. Remaining Blockers Before Production Wiring

Antes de ativar `ACTIVE_GUARDED` ou plugar o roteamento em produção:
1. `SECURITY_RUNTIME_ROUTING_INTEGRATION` permanece `NOT IMPLEMENTED`.
2. `SECURITY_USER_RESPONSE_DELIVERY` permanece `NOT IMPLEMENTED`.
3. `POST_DISPATCH_BARGE_IN_RUNTIME` permanece `NOT IMPLEMENTED` (embora `POST_DISPATCH_BARGE_IN_DESIGN = DESIGNED`).
4. `INTERRUPTED_UTTERANCE_METADATA_DROPPED` precisa ser corrigido via Slice A.
5. `ACTIVE_GUARDED_PROVIDER_CALL_OWNERSHIP` permanece `BLOCKED / NOT IMPLEMENTED`.
6. `CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE` não liberado.
7. `PRODUCTION_RUNTIME_WIRING = NO`.
8. `CUSTOMER_TRAFFIC = PROHIBITED`.

---

## 18. Non-Goals Explícitos

1. Nenhuma linha de código funcional alterada neste slice.
2. Nenhum teste alterado ou adicionado.
3. Nenhuma alteração em contratos de pacotes.
4. Nenhuma chamada externa a provedores (TypeSafe = 0, OpenAI = 0, Twilio = 0).
5. Nenhum carregamento de variáveis de ambiente (`.env`).
6. Nenhuma conexão a banco de dados.
7. Nenhum acesso a datasets de calibração ou holdouts de segurança.
8. Nenhuma alteração de Frozen Policy.
9. Nenhuma exigência de criação de conta na Twilio neste momento.
