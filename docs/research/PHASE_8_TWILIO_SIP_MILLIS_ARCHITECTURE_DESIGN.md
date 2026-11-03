# Desenho Técnico Offline — Plataforma → Twilio Programmable Voice → +55 → SIP → Millis AI

> **DESENHO PARA REVISÃO. NÃO AUTORIZA IMPLEMENTAÇÃO DEPENDENTE NEM ATIVAÇÃO.**
> Reflete as preferências de produto do operador (Twilio na telefonia, Millis na conversação, SIP como primeira conexão a investigar, Media Streams como alternativa), mas **H1 (Twilio-led × Millis-led) e SIP × Media Streams continuam pendentes**.
> Não existe homologação ponta a ponta Twilio + Millis: a Twilio declarou que a engenharia não a homologou, e a Millis só respondeu por atendimento automatizado.
> Parâmetros marcados `DOCUMENTADO` constam da documentação pública consultada em 2026-11-03. Nenhum parâmetro, endpoint ou recurso da Millis não documentado é usado. Onde falta contrato, o desenho usa portas abstratas e simuladores.
> Invariantes: `ACTIVE_GUARDED = BLOCKED` | `CUSTOMER_TRAFFIC = PROHIBITED` | `PRODUCTION_RUNTIME_WIRING = NO` | `REAL_PROVIDER_CALLS = 0` | `PURCHASE_OF_PHONE_NUMBERS = 0` | `REMOTE_MIGRATIONS = 0` | `PUBLIC_WEBHOOKS = 0`.

- **Base**: `main` `22ab511` + PR #134 (pacote de decisão, seção 8 com a classificação das evidências).
- **O que já existe e é reaproveitado**:
  - FSM de tentativa da 008-OF1 (`packages/contracts/src/telephony/outbound-attempt-state.ts`): `ORIGINATION_PENDING → ORIGINATION_SENT → ORIGINATION_ACCEPTED → CLOSED`, com `OUTCOME_UNKNOWN`/`RECONCILIATION_PENDING` bloqueando rediscagem cega.
  - `TelephonyOriginationPort` e `TelephonyReconciliationPort`, provider-neutral.
  - Ingress de webhooks fail-closed da 008-OF4 (`ProviderWebhookAuthenticator`, tenant resolvido no servidor por `call_attempts.provider_reference`).
  - Barreira de envio `claimSend` (supressão, pausa e cancelamento da campanha), reservas de orçamento da 008-OF3.
  - Validador `X-Twilio-Signature` existente em `packages/integrations/src/twilio/` (hoje usado pelo ConversationRelay preservado e inativo).

## 1. Componentes e fronteiras

```
apps/worker (orquestrador da tentativa)
  ├─ ConversationSessionPort  ──► adapter Millis  (preparar/encerrar sessão; consultar histórico)
  ├─ TelephonyOriginationPort ──► adapter Twilio  (criar, consultar, encerrar chamada)
  └─ repositórios (call_attempts, call_sessions, call_events, ledgers)

apps/api/src/webhooks (ingress fail-closed, NÃO montado até staging autorizado)
  ├─ /webhooks/twilio/...  status da chamada pai, da perna SIP, da gravação
  └─ /webhooks/millis/...  fim de sessão (autenticação fail-closed até haver mecanismo verificável)
```

Regras:

- **Twilio = autoridade única de originação** (no desenho Twilio-led). A Millis nunca recebe ordem de discagem: recebe só a sessão conversacional por SIP.
- Nenhum tipo de fornecedor sai de `packages/integrations` (regra de arquitetura já verificada por `check:architecture`).
- Tenant **nunca** vem de payload de fornecedor: sempre da tentativa encontrada por referência opaca persistida pela própria plataforma.

### 1.1 Porta nova proposta (abstrata — sem campos não documentados)

```ts
/** Sessão conversacional preparada ANTES de a perna telefônica existir. */
interface ConversationSessionPort {
  prepare(input: {
    organizationId: string; attemptId: string; correlationId: string;
    agentSnapshotId: string;      // snapshot imutável (008-MVP3)
  }): Promise<
    | { kind: 'PREPARED'; sessionRef: string; mediaTarget: MediaTarget; expiresAt: Date | null }
    | { kind: 'UNAVAILABLE'; reason: 'PROVIDER_DOWN' | 'TIMEOUT' | 'REJECTED' }
  >;
  terminate(sessionRef: string): Promise<'TERMINATED' | 'NOT_FOUND' | 'UNKNOWN'>;
  fetchOutcome(sessionRef: string): Promise<ConversationOutcome | 'NOT_READY' | 'UNKNOWN'>;
}
type MediaTarget = { kind: 'SIP_URI'; uri: string } | { kind: 'BIDIRECTIONAL_AUDIO_STREAM'; url: string };
```

- `mediaTarget` cobre SIP (primeira opção) e *stream* bidirecional de áudio (alternativa; no adaptador Twilio corresponde ao Media Streams), sem a orquestração conhecer o transporte.
- `expiresAt: null` significa "validade desconhecida" — o caso atual, pois a Millis não documenta a validade do endereço SIP.
- O adapter Millis só mapeia campos documentados: `register_sip_call` (`agent_id`, `agent_config`, `metadata`), `POST /sessions/{session_id}/terminate`, `GET /call-logs/{session_id}`. A resposta de `register_sip_call` tem schema vazio na referência: o adapter valida com Zod estrito e devolve `UNAVAILABLE/REJECTED` se não encontrar um URI SIP válido (fail-closed).

### 1.2 Nomenclatura neutra nos contratos (revisão 2026-11-03)

Contratos genéricos (`packages/contracts`, schema do banco, domínio do worker) **não** usam nomes de fornecedor nem termos de produto de fornecedor. Os nomes de fornecedor aparecem **somente** dentro dos adaptadores em `packages/integrations` e nas colunas de mapeamento deste documento.

| Conceito | Nome neutro no contrato | Mapeamento (só no adaptador) |
| :--- | :--- | :--- |
| Perna telefônica com o contato | `CONTACT_LEG` | Twilio: chamada pai (`CallSid`) |
| Perna do motor conversacional | `AI_AGENT_LEG` | Twilio: perna filha do `<Dial>` (`DialCallSid`); Millis: sessão |
| Perna de atendente humano (futuro) | `HUMAN_AGENT_LEG` | Twilio: perna de `<Dial><Number>` ou participante de conferência |
| Resultado da conexão da perna do agente | evento `AI_AGENT_LEG_RESULT` com `bridgeStatus` e `transportResponseCode` (código SIP, quando houver) | Twilio: `DialCallStatus`, `DialSipResponseCode` |
| Destino de mídia | `SIP_URI` \| `BIDIRECTIONAL_AUDIO_STREAM` | Twilio: `<Dial><Sip>` \| `<Connect><Stream>` |
| Referência da sessão conversacional | `sessionRef` (opaca) | Millis: `session_id`/`call_id` |
| Referência da chamada na operadora | `providerReference` (opaca, já existente) | Twilio: `CallSid` |
| Origem de gravação/transcrição | `TELEPHONY_PROVIDER` \| `CONVERSATION_PROVIDER` \| `INDEPENDENT_STT` | Twilio \| Millis \| outro |

Um teste de arquitetura (`check:architecture`) já proíbe imports de fornecedor no core. Proposta para a S1: estender a verificação para recusar os identificadores literais `twilio`/`millis` em `packages/contracts` (exceto comentários de documentação).

## 2. Sequência principal (caminho feliz)

```
Worker          DB                Millis                    Twilio                 Contato (+55)
  │ claimSend ──►│ (supressão, pausa, cancelamento, orçamento reservado)
  │◄─ CLAIMED ───│
  │ prepare ─────────────────────► register_sip_call(agent_config do snapshot,
  │                                  metadata={correlationId})
  │◄──────────── sessionRef + SIP URI ─┘
  │ persiste sessionRef (call_sessions, estado PREPARED) ──►│
  │ SEND_STARTED (write-ahead) ─►│
  │ create Call ─────────────────────────────────────────► From=número BR Twilio, To=+55…,
  │                                                         Twiml=<Dial><Sip>, TimeLimit,
  │                                                         StatusCallback(+eventos), Record…
  │◄──────────────────────────────────────────────────── CallSid (perna pai)
  │ ORIGINATION_ACCEPTED(providerReference=CallSid) ─►│
  │                                                      Twilio disca ──────────► toca / atende
  │                                                      (atendeu) executa TwiML
  │                                                      <Dial><Sip> ─► INVITE ─► Millis
  │                                                      (perna filha: DialCallSid)
  │◄═══ status callbacks assinados (pai e filha) ═══════════┘
  │                                       … conversa (mídia Twilio ⇄ Millis) …
  │◄═══ completed (pai), Dial action (DialCallStatus, DialSipResponseCode) ═══
  │◄═══ fim de sessão Millis (webhook ou consulta call-logs) ═══
  │ CALL_CLOSED_CONFIRMED, liquidação no ledger, gravação/transcrição (desenho próprio)
```

### 2.1 Preparação da sessão Millis

1. Somente **depois** do `claimSend` (que já valida supressão, pausa e cancelamento) e da reserva de orçamento.
2. `agent_config` gerado a partir do snapshot publicado (008-MVP3), incluindo `language` e `session_timeout.max_duration` (`DOCUMENTADO`).
3. `metadata` leva só o `correlationId` opaco (UUID). **Nunca** telefone, nome, `organizationId` ou dados do contato além do necessário à conversa (minimização).
4. Persistir `sessionRef` e o URI SIP **antes** de criar a chamada, para que um crash não deixe a sessão órfã sem rastro.

**Incerteza crítica — momento do registro (decisão técnica após a resposta da Millis):**

| Variante | Como | Vantagem | Risco |
| :--- | :--- | :--- | :--- |
| **R1 — registrar antes de discar** (padrão do desenho) | TwiML inline com o URI já conhecido | A TwiML não depende de webhook no atendimento; nenhum atraso adicional após o "alô" | O URI pode expirar enquanto o telefone toca (validade **não documentada**); sessões preparadas e nunca usadas |
| **R2 — registrar no atendimento** | `Url` da chamada aponta para um endpoint da plataforma, que registra e devolve a TwiML | Sessão nasce só para chamadas atendidas | Exige webhook público no caminho crítico; acrescenta a latência do registro ao primeiro "alô" (pior para o critério 2 da DEC-044) |

### 2.2 Originação na Twilio (`DOCUMENTADO`)

Parâmetros da criação da chamada:

| Parâmetro | Valor | Motivo |
| :--- | :--- | :--- |
| `From` | número brasileiro Twilio do tenant | DEC-042 |
| `To` | E.164 +55 validado (008-MVP1) | — |
| `Twiml` | `<Response><Dial …><Sip …>URI</Sip></Dial></Response>` (≤ 4.000 caracteres) | R1 |
| `TimeLimit` | duração máxima da tentativa (segundos), derivada da política | Corte de segurança na operadora |
| `Timeout` | tempo de toque (padrão 60, máximo 600) | — |
| `StatusCallback` + `StatusCallbackEvent` | `initiated`, `ringing`, `answered`, `completed` | Eventos da perna pai |
| `MachineDetection` | opcional — **decisão de produto** (custo por chamada e atraso) | Evitar conectar a Millis a uma caixa postal |
| `Record=true`, `RecordingChannels=dual`, `RecordingStatusCallback` | **mecanismo único de gravação** quando a gravação estiver habilitada (§2.11) | Uma gravação por chamada; o `<Dial>` fica explicitamente sem gravação |

TwiML proposta:

```xml
<Response>
  <Dial timeLimit="{segundos}" action="{endpoint de resultado da perna do agente}?t={callbackToken}"
        record="do-not-record">  <!-- explícito: a gravação é feita no nível da chamada (§2.11) -->
    <Sip statusCallbackEvent="initiated ringing answered completed"
         statusCallback="{endpoint de status da perna do agente}?t={callbackToken}">
      {URI SIP devolvido pela Millis};transport={udp|tcp|tls};region={br1|us1|…}?x-vap-corr={token}
    </Sip>
  </Dial>
</Response>
```

- `region` define de onde a Twilio origina o SIP (`br1` existe). A melhor região depende de **onde o servidor SIP da Millis está** (não documentado; Millis só publica EUA e UE). Isso é medição da Fase 1, não suposição.
- `transport=tls` é preferível para sinalização, se a Millis aceitar (não documentado). Mídia criptografada (SRTP) também é pergunta à Millis.
- `x-vap-corr`: token **opaco** (HMAC do `correlationId` com segredo da plataforma), útil se a Millis repassar cabeçalhos SIP aos seus registros — não documentado. A correlação primária **não** depende dele.
- Autenticação SIP (`username`/`password` do `<Sip>`): só se a Millis exigir (não documentado).

### 2.3 Correlação segura entre os identificadores

| Identificador | Origem | Onde é guardado | Uso |
| :--- | :--- | :--- | :--- |
| `attemptId` / `correlationId` | Plataforma | `call_attempts` | Chave interna; `correlationId` é o único vínculo enviado a fornecedores |
| `sessionRef` (`session_id`/`call_id` da Millis) | Resposta de `register_sip_call` | `call_sessions` (nova coluna ou tabela de referências externas) | Encerrar sessão, consultar `call-logs`, casar o webhook de fim |
| `CallSid` da perna pai | Resposta síncrona da criação da chamada | `call_attempts.provider_reference` (índice já existe) | Resolver o tenant nos callbacks; encerrar a chamada; reconciliar |
| `DialCallSid` (perna SIP) | Callback de status do `<Sip>` e `action` do `<Dial>` | Tabela de pernas (`call_legs`, proposta) | Diagnóstico da perna Millis; gravação |
| `DialSipCallId` | `action` do `<Dial>` | Tabela de pernas | Cruzar com os registros da Millis (se ela expuser o Call-ID SIP — não documentado) |
| `RecordingSid` | Callback de gravação | Desenho de gravação | — |

Regras:

- Um callback só é aceito se a assinatura for válida **e** o `CallSid` (ou `ParentCallSid` de uma perna filha) estiver persistido para uma tentativa. O tenant vem da tentativa.
- Evento da Millis sem `sessionRef` conhecido é descartado e auditado.
- Uma tentativa tem no máximo 1 perna pai e 1 perna Millis ativa; uma segunda perna Millis é rejeitada (invariante de autoridade única).

### 2.4 Estados e callbacks

- **Tentativa** (FSM existente, sem mudança de semântica):
  - `SEND_STARTED` antes de chamar a Twilio;
  - `ORIGINATION_ACCEPTED` com o `CallSid`;
  - `ORIGINATION_REJECTED` em erro definitivo da API;
  - `ORIGINATION_RESULT_UNKNOWN` em timeout ou erro de transporte;
  - `CALL_CLOSED_CONFIRMED` somente quando o encerramento da perna pai for confirmado.
- **Sessão de chamada** (`call_sessions`): `PREPARED` (nova) → `CONNECTING` → `ACTIVE` → `ENDING` → encerrada.
- **Perna** (proposta `call_legs`, nomes neutros — §1.2): `CONTACT_LEG` e `AI_AGENT_LEG` (e, no futuro, `HUMAN_AGENT_LEG`), cada uma com o status e os horários dos callbacks.

Mapeamento de status Twilio da perna pai (`queued`, `ringing`, `in-progress`, `completed`, `busy`, `failed`, `no-answer`, `canceled`):
- `busy`, `no-answer` e `failed` antes do atendimento: chamada encerrada **sem conversa**;
- `in-progress`: atendida;
- `completed`: encerrada.
- No adaptador Twilio, `DialCallStatus` e `DialSipResponseCode` viram o evento neutro `AI_AGENT_LEG_RESULT`, que informa o destino da perna do agente **separadamente** do destino da chamada.

**Ordenação**: `SequenceNumber` e `Timestamp` dos callbacks + deduplicação por chave composta da 008-OF4. Um evento fora de ordem nunca regride o estado.

### 2.5 Autenticação e validação dos eventos

| Fonte | Mecanismo | Situação |
| :--- | :--- | :--- |
| Twilio (status, Dial `action`, gravação) | `X-Twilio-Signature` (HMAC com o *auth token*, URL canônica + parâmetros); validador existente | `DOCUMENTADO`; reaproveitar com testes |
| Millis (fim de sessão) | Apenas cabeçalho estático configurável (documentado). HMAC/`X-Millis-Signature` é só afirmação do chatbot | **Fail-closed**: o webhook da Millis nunca muda estado financeiro nem encerra tentativa sozinho; serve de *gatilho* para uma **consulta autenticada** a `GET /call-logs/{session_id}`, cuja resposta é a fonte |

Também valem em ambos: janela anti-replay, corpo bruto preservado, limite de tamanho e rejeição 401/403 sem detalhes.

#### 2.5.1 Corrida: callbacks que chegam antes da persistência do `CallSid`

**Cenário**: a Twilio pode enviar `initiated`/`ringing` (e, em teoria, eventos posteriores) antes de o worker gravar o `CallSid` devolvido pela criação da chamada — resposta lenta, crash do worker ou timeout que deixou a tentativa em `OUTCOME_UNKNOWN`. Procurar o tenant só pelo `CallSid` falharia exatamente nesse caso.

**Desenho proposto**:

1. **Token de callback por tentativa**: gerado no passo *write-ahead*, antes do `SEND_STARTED` ser confirmado:
   - aleatório, com ≥ 128 bits;
   - no banco fica só o **hash**, com índice único;
   - vai como parâmetro `t` em todos os URLs de callback daquela tentativa: `StatusCallback`, `statusCallback` do `<Sip>`, `action` do `<Dial>` e `RecordingStatusCallback`;
   - a assinatura `X-Twilio-Signature` é calculada sobre o URL completo, incluindo a *query* (algoritmo documentado; o validador e o resolvedor de URL canônico já existem), então o token não pode ser trocado sem invalidar a assinatura;
   - o token não identifica o tenant nem dá acesso a nada sem uma assinatura válida.
2. **Ordem de processamento** de cada callback:
   1. **Verificar a assinatura.** Se falhar: 401/403, auditoria, nenhum efeito.
   2. **Resolver a tentativa pelo hash do token.** Token desconhecido: rejeição auditada; nunca se cria tentativa nem sessão a partir de callback.
   3. **Tenant = `organizationId` da tentativa encontrada.** Nunca do payload.
   4. **Vincular o `CallSid` por *compare-and-set***, na mesma transação que aplica o evento:
      - `provider_reference` vazio e estado `ORIGINATION_SENT`, `OUTCOME_UNKNOWN` ou `RECONCILIATION_PENDING`: o callback **prova** que a chamada foi criada. Vincula o `CallSid` e resolve o desconhecido como originado, **sem rediscagem**.
      - Mesmo `CallSid` já vinculado: segue normalmente.
      - **`CallSid` diferente** do já vinculado: **anomalia de possível originação duplicada**. Nenhuma transição, alerta operacional, tentativa marcada para revisão manual e **nenhuma rediscagem**. Encerramento automático **não** é padrão: exige identificar a perna (callback de perna filha legítima ou de transferência não é anomalia) e comprovar a duplicidade (ressalva R-1, seção 7.1 do pacote de decisões offline), além de aprovação explícita de **D-DUP-CALL**.
   5. **Deduplicar** por chave única (fornecedor, `CallSid`, perna, evento/status, `SequenceNumber`). Repetição é ignorada de forma idempotente.
   6. **Ordenar** por `SequenceNumber`/`Timestamp`: evento atrasado nunca regride estado. Evento após `CLOSED` é só auditado, sem efeito financeiro.
3. **O caminho da resposta síncrona** (criação da chamada) usa o **mesmo** *compare-and-set*: se um callback já vinculou o mesmo `CallSid`, não faz nada; se vinculou outro, aplica a mesma regra de anomalia.
4. **Resposta HTTP**:
   - 2xx somente após a persistência durável;
   - erro de banco gera 5xx;
   - a política de reenvio de *status callbacks* da Twilio **não está verificada**, por isso a perda de eventos é coberta pela reconciliação por consulta (§2.6), nunca por suposição.
5. **Callback sem token** (configuração incorreta): rejeitado e auditado. Não se adota fila de eventos "sem dono", porque `call_events` exige tenant e tentativa (FK composta); essa fila exigiria novos estados sem necessidade atual (YAGNI). O desfecho vem da reconciliação.

### 2.6 Reconciliação após falhas e prevenção de rediscagem

| Falha | Estado resultante | Recuperação |
| :--- | :--- | :--- |
| Crash depois de `prepare` e antes de `SEND_STARTED` | Sessão `PREPARED` sem chamada | Varredura encerra a sessão (`terminate`); tentativa pode seguir (nada foi discado) |
| Crash ou timeout depois de `SEND_STARTED` e sem `CallSid` | `OUTCOME_UNKNOWN` | **Nunca rediscar.** Reconciliar listando chamadas na Twilio pelo par `From`/`To` e janela de tempo (filtros do recurso Call; **validar no chamado técnico**). Inconclusivo → `RECONCILIATION_PENDING` + revisão manual |
| `CallSid` persistido e callbacks perdidos | `ORIGINATION_ACCEPTED` sem desfecho | Consultar a chamada pelo `CallSid` (fonte de verdade da operadora) |
| Webhook da Millis perdido | Sessão sem desfecho | Consultar `call-logs` com *backoff*; desfecho conversacional fica "desconhecido" até lá — nunca inventado |

Chave de idempotência local (`deriveAttemptIdempotencyKey`) continua só local: a criação de chamada na Twilio não tem idempotência documentada.

### 2.7 Encerramento seguro e limites de duração

São três limites, sempre com o **menor** vencendo:
1. `TimeLimit` da chamada pai (Twilio);
2. `timeLimit` do `<Dial>` (padrão e máximo de 4 h; `DOCUMENTADO`);
3. `session_timeout.max_duration` da Millis.

**Encerramento forçado (kill switch)** — ordem do encerramento:
1. encerrar a perna pai na Twilio (atualização da chamada para `completed`; parâmetro a reconfirmar na referência *Update a Call*);
2. `POST /sessions/{session_id}/terminate` na Millis;
3. aguardar a confirmação por callback ou consulta.

Pausa e cancelamento de campanha: valem para chamadas **ainda não enviadas** (semântica da #129). Encerrar chamadas em curso é ação explícita e separada.

Liquidação no ledger: só com o desfecho confirmado. O custo de telefonia é casado ao `CallSid` e o custo conversacional ao `session_id`.

### 2.8 Falhas SIP e indisponibilidade da Millis

| Situação | Onde aparece | Tratamento proposto |
| :--- | :--- | :--- |
| Millis indisponível no `prepare` | `UNAVAILABLE` | **Não discar.** Tentativa permanece não enviada; nova tentativa conforme a política de retentativa existente |
| URI SIP expirado ou recusado depois do atendimento (4xx/5xx em `DialSipResponseCode`) | `action` do `<Dial>` | **O contato já atendeu**: decisão de produto **D-SIP-FAIL** — (a) mensagem curta pré-gravada em pt-BR e desligar; (b) desligar sem mensagem. Nunca deixar a linha em silêncio. Sem rediscagem automática |
| Queda da mídia no meio da conversa | Fim antecipado da perna SIP | Encerrar a pai; desfecho "interrompida por falha técnica" |
| Latência ou indisponibilidade parcial | Métricas | Disjuntor por tenant: interromper novas tentativas e manter as em curso |

### 2.9 Alternativa Media Streams (mesma orquestração)

- `ConversationSessionPort.prepare` devolveria `BIDIRECTIONAL_AUDIO_STREAM`, e o adaptador Twilio geraria `<Connect><Stream url=…/>` (Media Streams).
- A Millis documenta esse caminho apenas para chamadas de **entrada** (`twilio_inbound/{public_key}/{agent_id}`), sem `agent_config` por chamada no URL.
- Formato fixo μ-law 8 kHz; mensagens `clear` e `mark` documentadas.
- **Não se afirma superioridade de SIP nem de Media Streams sem medição** (seção 5).

### 2.10 Transferência para atendente humano (alternativas — decisão futura, 008-POST3)

| Alternativa | Como | Continuidade | Gravação | Observação |
| :--- | :--- | :--- | :--- | :--- |
| **T-A: Atualizar a chamada** | Redirecionar a perna pai para nova TwiML `<Dial><Number>` do vendedor (encerra a perna Millis) | Fria (sem apresentação) | Gravação no nível da chamada (mecanismo único, §2.11) deve continuar — **a confirmar com a Twilio** | Mais simples |
| **T-B: Conference desde o início** | Contato, Millis e, depois, o vendedor na mesma sala | Morna (IA pode apresentar) | Gravação dupla isola só o primeiro participante; IA e vendedor ficam misturados no canal 2 | Custo e complexidade maiores |
| **T-C: SIP REFER pela Millis** | A Millis transfere por REFER | Depende da Millis | Não documentado | Twilio cobra por REFER; **não documentado na Millis** |

### 2.11 Estratégia de gravação na Twilio (mecanismo primário único)

**Fatos documentados**:
- Na criação da chamada, `Record` com `RecordingChannels=dual` grava a chamada com a perna pai no canal 1 e a filha no canal 2; o padrão de `RecordingTrack` é `both`.
- `<Dial record="record-from-answer-dual">` grava só enquanto aquele `<Dial>` durar, também com pai no canal 1 e filha no canal 2.
- Em conferência com gravação dupla, só o primeiro participante fica isolado; os demais são misturados no canal 2.
- Cada gravação é um recurso próprio (`RecordingSid`), cobrado por minuto gravado e por armazenamento.

**Inferência**: ligar a gravação na chamada **e** no `<Dial>` produz duas gravações do mesmo período, com **cobrança duplicada** e **dados pessoais duplicados**. A documentação não diz que a Twilio deduplica; o desenho trata como duplicado.

**Estratégia proposta** (validação na Fase 1 e no chamado técnico):

| Topologia | Mecanismo único | `<Dial record>` | Resultado esperado |
| :--- | :--- | :--- | :--- |
| Padrão (contato + agente de IA por SIP) | Gravação **no nível da chamada**: `Record=true`, `RecordingChannels=dual`, `RecordingStatusCallback` | `do-not-record`, explícito | 1 gravação por chamada: canal 1 = perna do contato; canal 2 = perna conectada no momento |
| Transferência T-A (redirecionamento) | Mesma gravação no nível da chamada | `do-not-record` em todo `<Dial>` | Canal 2 contém o agente de IA e depois o humano, **em intervalos diferentes**; a atribuição usa os horários das pernas (`AI_AGENT_LEG` × `HUMAN_AGENT_LEG`). Continuidade após o redirecionamento: **a confirmar** |
| Conferência T-B (se adotada) | Gravação **da conferência**; gravação no nível da chamada **desligada** | — | Contato isolado no canal 1 só se entrar primeiro; agente de IA e humano **misturados** no canal 2 (rótulos degradados, declarados como tal) |
| Contingência (se a Twilio indicar que a gravação no nível da chamada não capta a perna SIP corretamente) | Gravação **no `<Dial>`** (`record-from-answer-dual`), sem gravação no nível da chamada | Um por segmento | Arquivos por segmento sem sobreposição (não são duplicatas), unidos por linha do tempo |

**Guardas**:
- O gerador de TwiML (S2) recebe a estratégia como configuração única e tem teste que **impede** combinar a gravação no nível da chamada com `record≠do-not-record` no `<Dial>`.
- O pipeline espera **uma** gravação por chamada na topologia padrão. Um `RecordingSid` extra para o mesmo `CallSid` vira `UNEXPECTED_DUPLICATE`: alerta, nunca exibido como segunda gravação, candidato a exclusão após revisão.
- A atribuição canal → falante continua `UNVERIFIED` até o teste T6 da Fase 1.
- Preço da gravação: **divergente e não confirmado** — o e-mail da Twilio indica US$ 0,05/min e a tabela pública, US$ 0,0025/min (seção 8.1 do pacote). Nenhum dos dois é preço contratado.
- Gravar ou não, e quando, é decisão humana (**C-8**).

## 3. Segurança e dados

- Segredos (credenciais da Twilio, chave da Millis, segredo HMAC de correlação) só no servidor, por ambiente, nunca no navegador nem em logs.
- Recomenda-se subconta Twilio por ambiente: staging separado de produção.
- Telefones mascarados em logs e telas (já existente). `metadata` enviada à Millis sem PII além do mínimo da conversa.
- Webhooks continuam **não montados** até o staging autorizado (`PUBLIC_WEBHOOKS = 0`).

## 4. Riscos e incertezas abertas

| ID | Incerteza | Impacto | Como resolver |
| :---: | :--- | :--- | :--- |
| U1 | SIP de saída para +55 Twilio → Millis nunca homologado | Bloqueia a 008-OF6 | Chamado técnico Twilio + engenharia Millis + Fase 1 |
| U2 | Schema real de `register_sip_call` e validade do URI | Define R1 × R2 | Engenharia Millis |
| U3 | Região física do servidor SIP/mídia da Millis | Latência (critério 2) | Engenharia Millis + medição |
| U4 | TLS/SRTP e autenticação SIP aceitos pela Millis | Segurança da mídia | Engenharia Millis |
| U5 | Mecanismo verificável de autenticação dos webhooks Millis | Hoje fail-closed + consulta | Engenharia Millis (documentação oficial) |
| U6 | Estrutura do `chat` (papéis, *timestamps*, falas interrompidas) | Transcrição | Engenharia Millis + Fase 1 |
| U7 | Comportamento de *barge-in* pela ponte SIP | Critério 4 | Fase 1 |
| U8 | Reconciliação na Twilio por filtros de `From`/`To`/janela | Recuperação de crash | Chamado técnico Twilio |

## 5. Plano de qualidade pt-BR (offline agora; piloto só com autorização)

Complementa a seção 3.7 do pacote de decisão (DEC-044 inalterada).

**Matriz de configuração (braços):**

| Dimensão | Variantes |
| :--- | :--- |
| Idioma | `language` exclusivo pt-BR × configuração multilíngue |
| TTS | 2–3 vozes pt-BR disponíveis na Millis (lista real via `Get Voices` somente na Fase 1) |
| STT | provedores oferecidos pela Millis para pt-BR (a confirmar) |
| Transporte | SIP (`region` a medir) × Media Streams |

**Corpus pt-BR (preparado offline):** nomes próprios, números, datas, valores, CEP e CPF fictícios, endereços; sotaques de diferentes regiões; fala rápida e lenta; ruído de rua e de carro; interjeições ("uhum", "tá", "pera aí"); interrupções no meio da frase.

**Métricas:**

| Critério DEC-044 | Métrica |
| :--- | :--- |
| 1. Voz e pt-BR | Taxa de erro de palavras/caracteres do STT; nota cega de naturalidade e clareza (1–5, ≥ 3 avaliadores) |
| 2. Latência | Fim da fala do contato → primeiro áudio do agente: p50 e p95; atendimento → primeira palavra |
| 3. Estabilidade | Taxa de conexão SIP (`DialSipResponseCode`), quedas, áudio unidirecional, *jitter*/perda |
| 4. Barge-in | Início da fala do contato → silêncio do agente; falsas interrupções; frases cortadas |
| Gravação e transcrição | Os dois canais captam as vozes certas (T6); concordância da transcrição com a referência humana |

**O que pode ser feito offline (sem chamadas):** corpus, rubrica, planilha, e um *harness* de métricas que calcula latência e *barge-in* a partir de **arquivos de áudio de dois canais sintéticos** (gerados localmente, sem fornecedor) — prova o cálculo, não a qualidade.

**Piloto (Fase 1):** somente com autorização específica (número, créditos, chamadas para aparelhos do operador, teto de gasto).

## 6. Segurança e conformidade — decisões pendentes (não é parecer jurídico)

| ID | Decisão | Observação |
| :---: | :--- | :--- |
| C-1 | Aviso de gravação e identificação de agente automatizado (texto, momento, consequência de recusa) | Entra no snapshot do agente (primeira fala). PL 2338/2023 não está em vigor; obrigatoriedade para a revisão jurídica |
| C-2 | Base legal e evidência de consentimento | H3 do pacote (C2 recomendado). Gravação pode exigir base própria |
| C-3 | Quem acessa gravações e transcrições; quem baixa | Desenho de gravação, seção 6 |
| C-4 | Tempo de retenção (padrão por tenant e teto da plataforma) | Constituição, Artigo VIII: configurável, sem presumir prazos legais |
| C-5 | Exclusão e backups (prazo de propagação; *legal hold*) | Desenho de gravação |
| C-6 | Transferência internacional (Millis EUA/UE; Twilio; armazenamento) | LGPD art. 33; DPA de cada fornecedor |
| C-7 | Telefonia e telemarketing no Brasil: divergência sobre o 0303 (Anatel revogou a obrigatoriedade em ago/2025; a página da Twilio ainda o cita), Origem Verificada, cadastros de bloqueio | Revisão jurídica (H4) + chamado Twilio |
| C-8 | Política de gravação: gravar todas as chamadas, por campanha ou só com consentimento específico; o que fazer se o contato recusar | Estratégia técnica em §2.11; decisão humana e jurídica |

Supressão, consentimento, auditoria e isolamento por tenant continuam como estão na `main`. Orientação comercial da Twilio e respostas do chatbot da Millis **não** são parecer jurídico.

## 7. Implementação proposta em etapas (cada uma offline, pequena e testável)

| Etapa | Escopo | Testes offline | Depende de |
| :---: | :--- | :--- | :--- |
| **S1** | Contratos provider-neutral com nomes neutros (§1.2): `ConversationSessionPort`, `MediaTarget`, modelo de pernas (`call_legs`), evento `AI_AGENT_LEG_RESULT`, token de callback, estado `PREPARED` da sessão | Zod estrito, transições, correlação, ordenação | **H1 = Twilio-led como direção offline** |
| **S2** | Adapter Twilio offline: criação/consulta/encerramento por cliente HTTP falso; gerador de TwiML `<Dial><Sip>`; normalizador de callbacks; validador de assinatura reaproveitado | TwiML exata; token de callback em todos os URLs; **combinação proibida de gravação no nível da chamada + `<Dial record>`**; assinatura válida/inválida/replay (incluindo *query* adulterada); mapeamento de todos os status para eventos neutros; `DialSipResponseCode` → `AI_AGENT_LEG_RESULT` | S1 |
| **S3** | Adapter Millis offline: `register_sip_call` (só campos documentados, resposta validada fail-closed), `terminate`, `call-logs`; autenticador de webhook continua fail-closed | Resposta sem URI → `UNAVAILABLE`; `chat` tratado como texto não estruturado | S1 + respostas U2/U5 (o adapter é feito com o que é documentado; ajusta-se depois) |
| **S4** | Orquestração no worker: preparar → originar → callbacks → encerrar → liquidar; recuperação (2.6) e kill switch (2.7); simuladores `FakeTwilioOriginationSimulator` e `FakeMillisConversationSimulator` (fechamento da 008-OF5) | E2E offline: caminho feliz, crash em cada ponto, SIP 4xx/5xx, Millis fora, eventos duplicados e fora de ordem, zero rediscagem | S2, S3, **D-SIP-FAIL** |
| **R1–R3** | Gravação e transcrição | Ver o desenho próprio | C-1 a C-6 |
| **Q1** | *Harness* de métricas de qualidade sobre áudio sintético de dois canais | Cálculo de latência e *barge-in* com valores conhecidos | **Q0** |

## 8. Decisões humanas necessárias antes de cada etapa

| Antes de | Decisão |
| :--- | :--- |
| S1–S4 | **H1**: aprovar Twilio-led (com SIP como primeira conexão) **como direção do desenho offline** — não autoriza ativação |
| S4 | **D-SIP-FAIL**: comportamento quando a perna SIP falha depois do atendimento |
| S4 | **D-DUP-CALL**: só alertar (padrão) ou encerrar automaticamente com duplicidade comprovada, quando um callback revelar um segundo `CallSid` para a mesma tentativa (§2.5.1; ressalva R-1) |
| S4 (opcional) | **D-AMD**: usar detecção de secretária eletrônica da Twilio |
| R1 | C-3, C-4 e C-5 (acesso, retenção, exclusão) e H6 (empacotamento comercial gravação + transcrição) |
| R2 | C-6 (local de armazenamento e transferência internacional); D-COPY (copiar para armazenamento próprio e apagar no fornecedor) |
| R3 | C-1 (aviso de gravação e de IA) antes de qualquer gravação real |
| Q1 | **Q0** (Fase 0 do plano de qualidade) |
| Fase 1 (piloto) | Autorização específica: compra de número, créditos, chamadas para aparelhos do operador, teto de gasto, webhooks em staging |
| 008-POST3 | Topologia de transferência (T-A/T-B/T-C) |

## 9. Respostas pendentes dos fornecedores

**Engenharia da Millis:**
1. SIP de saída: sessão registrada por `register_sip_call` recebendo INVITE da Twilio numa chamada de saída para +55 — suportado?
2. Schema oficial da resposta de `register_sip_call` (URI SIP, `call_id`, `session_id`) e **validade** do endereço.
3. Região física do servidor SIP e de mídia; presença na América do Sul; `region` da Twilio recomendada.
4. Transporte TLS, SRTP, codecs aceitos, autenticação SIP e IPs de origem a liberar.
5. Recebe cabeçalhos SIP `x-`/UUI e os expõe em `call-logs` ou no webhook?
6. Assinatura de webhooks: documentação oficial (algoritmo, cabeçalho, janela anti-replay). Hoje só existe cabeçalho estático.
7. Estrutura de `chat`: papéis, *timestamps* por fala, marcação de falas interrompidas; diferença entre texto gerado e áudio efetivamente reproduzido.
8. Gravação: formato, canais, quem está em cada canal, URL (temporária ou permanente), retenção e o que `DELETE /call-logs/{session_id}/recording` apaga.
9. Retenção e exclusão de transcrições e metadados; DPA, subprocessadores e transferência internacional.
10. Preços de gravação, transcrição e minutos SIP; limites de concorrência.
11. *Barge-in* e detecção de fim de turno em pt-BR: parâmetros configuráveis.

**Chamado técnico da Twilio** ("SIP outbound +55 com endpoint da Millis"):
1. Validação do fluxo API → atendimento → `<Dial><Sip>` para +55, incluindo a `region` recomendada (`br1`?) para SIP de saída.
2. Confirmação de qual canal capta o contato e qual capta a perna SIP na gravação dupla, para gravação no nível da chamada e no `<Dial>`.
3. Preço de gravação: o e-mail indica US$ 50,00 por 1.000 min (US$ 0,05/min) e a tabela pública indica US$ 0,0025/min (com US$ 0,05/min listado como transcrição). Qual é o preço aplicável à nossa conta? Nenhum dos dois é tratado como confirmado.
6. Gravação no nível da chamada × no `<Dial>`: confirmação de que ativar as duas gera gravações e cobranças duplicadas; se a gravação no nível da chamada capta corretamente a perna SIP e continua após um redirecionamento (transferência T-A).
4. Filtros de listagem de chamadas para reconciliação após crash; encerramento de chamada em curso pela API.
5. Números 0303 × revogação da Anatel (ago/2025); Origem Verificada para tráfego originado pela Twilio.

## 10. Próxima PR sugerida (não será iniciada sem aprovação de H1)

**`008-OF5a` — contratos provider-neutral de sessão conversacional e pernas (S1).**

- **Escopo**: `packages/contracts/src/telephony/` — `ConversationSessionPort`, `MediaTarget` (`SIP_URI` | `BIDIRECTIONAL_AUDIO_STREAM`), estado `PREPARED`, modelo e eventos de pernas com nomes neutros (`CONTACT_LEG`, `AI_AGENT_LEG`, `HUMAN_AGENT_LEG` reservado), evento `AI_AGENT_LEG_RESULT` (status + `transportResponseCode`), token de callback por tentativa (geração e hash; §2.5.1), regras de correlação (uma `AI_AGENT_LEG` ativa por tentativa; perna sem `CONTACT_LEG` conhecida rejeitada; `providerReference` divergente = anomalia). Sem adapters, sem rede, sem schema de banco (migration só na S4).
- **Critérios de aceite**:
  - nenhum tipo **nem nome** de fornecedor nos contratos (`check:architecture`, estendido conforme §1.2);
  - FSM existente intacta;
  - eventos fora de ordem não regridem estado;
  - segunda `AI_AGENT_LEG` ativa rejeitada;
  - perna sem `CONTACT_LEG` rejeitada;
  - vínculo de `providerReference` por *compare-and-set*: igual → idempotente; diferente → anomalia sem transição;
  - gate canônico verde no HEAD exato.
- **Testes**: transições válidas e inválidas, deduplicação, correlação, corrida callback × resposta síncrona (vínculo antes e depois, `OUTCOME_UNKNOWN` resolvido sem rediscagem, `CallSid` divergente), Zod estrito (campos extras rejeitados), regressão da FSM da 008-OF1.
- **Bloqueio**: só começa com **H1 aprovada como direção offline**. Alternativa que não depende de H1: **Q1** (harness de métricas sobre áudio sintético), se **Q0** for aprovado.
