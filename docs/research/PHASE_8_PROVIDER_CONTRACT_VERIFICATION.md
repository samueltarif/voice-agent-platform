# Verificação dos contratos oficiais — Twilio outbound `<Dial><Sip>` + Millis AI (008-OF5)

> **Data da verificação:** 2026-11-11. **Escopo:** OFFLINE (DEC-052). Nenhuma chamada real, credencial real, compra ou webhook público.
> Este documento complementa o [desenho SIP](PHASE_8_TWILIO_SIP_MILLIS_ARCHITECTURE_DESIGN.md) e o [pacote H1](PHASE_8_TELEPHONY_AUTHORITY_AND_CONTACT_POLICY_DECISION_PACKAGE.md). O que a Twilio já confirmou por e-mail (T1–T10 do pacote H1) **não** é perguntado de novo.

## 1. Classificação

Legenda: `DOCUMENTED_OFFICIAL` (página oficial atual), `VERIFIED_IN_CODE` (implementado conforme a documentação), `TESTED_OFFLINE` (coberto por teste com simulador — **não é homologação**), `PROVIDER_UNVERIFIED` (documentação ausente, vaga ou contraditória), `REQUIRES_PROVIDER_SUPPORT` (só o fornecedor responde), `REQUIRES_OPERATOR_ACTION` (console, conta, documento ou decisão humana).

### 1.1 Twilio

| Item | Classificação | Evidência |
| :--- | :--- | :--- |
| Calls API: criar chamada (`To`, `From`, `Twiml` ≤ 4.000, `Timeout` 60/máx. 600, `TimeLimit`, `StatusCallback`, `StatusCallbackEvent`) | DOCUMENTED_OFFICIAL + VERIFIED_IN_CODE + TESTED_OFFLINE | [Call resource](https://www.twilio.com/docs/voice/api/call-resource) |
| `CallSid` = `CA` + 32 hex; status queued/ringing/in-progress/canceled/completed/busy/no-answer/failed | DOCUMENTED_OFFICIAL + VERIFIED_IN_CODE | Idem |
| Encerrar chamada: atualização com `Status` = `completed`/`canceled` | DOCUMENTED_OFFICIAL (valores); semântica exata em chamada tocando: PROVIDER_UNVERIFIED | Idem |
| Consulta por `CallSid` para reconciliação | DOCUMENTED_OFFICIAL + TESTED_OFFLINE | Idem |
| Listagem por `To`/`From`/`StartTime` (dia UTC) para tentativa sem `CallSid` | DOCUMENTED_OFFICIAL; **insuficiente** para identificar a tentativa — o adaptador devolve INCONCLUSIVE | Idem |
| Idempotência na criação de chamada | PROVIDER_UNVERIFIED (não documentada) — por isso falha ambígua = `OUTCOME_UNKNOWN`, nunca rediscagem | — |
| `<Dial>`: `action`, `timeLimit` (padrão e máx. 14.400 s), `record` (padrão `do-not-record`), `DialCallStatus`/`DialCallSid` | DOCUMENTED_OFFICIAL + VERIFIED_IN_CODE + TESTED_OFFLINE | [Dial](https://www.twilio.com/docs/voice/twiml/dial) |
| `<Sip>`: URI < 255, `transport` udp/tcp/tls, `region` (inclui `br1`), `statusCallbackEvent`, `ParentCallSid`, `SequenceNumber`, `DialSipResponseCode`, `DialSipCallId` | DOCUMENTED_OFFICIAL + VERIFIED_IN_CODE + TESTED_OFFLINE | [Sip](https://www.twilio.com/docs/voice/twiml/sip) |
| SRTP (mídia criptografada) no `<Sip>` | PROVIDER_UNVERIFIED (não mencionado na página) | — |
| `X-Twilio-Signature` (HMAC-SHA1 do URL completo + parâmetros ordenados) | DOCUMENTED_OFFICIAL + VERIFIED_IN_CODE + TESTED_OFFLINE | [Webhook security](https://www.twilio.com/docs/usage/security) |
| Erros 21211, 21215, 21210 e 20429 ("aren't processed") | DOCUMENTED_OFFICIAL + VERIFIED_IN_CODE + TESTED_OFFLINE | Páginas de erro oficiais |
| Reenvio de status callbacks perdidos | PROVIDER_UNVERIFIED — coberto por reconciliação por consulta | — |
| Saída para +55 a partir de número brasileiro Twilio; requisitos de cadastro | Confirmado anteriormente (pacote H1, T1–T10); número e documentação na conta: REQUIRES_OPERATOR_ACTION | Pacote H1 |
| Fluxo ponta a ponta Twilio → `<Dial><Sip>` → endpoint Millis | **Não homologado** pela Twilio (T9): REQUIRES_PROVIDER_SUPPORT + teste real autorizado | Pacote H1 |

### 1.2 Millis AI

| Item | Classificação | Evidência |
| :--- | :--- | :--- |
| Servidores `https://api-west.millis.ai` e `https://api-eu-west.millis.ai`; nenhuma região na América do Sul | DOCUMENTED_OFFICIAL + VERIFIED_IN_CODE | [OpenAPI](https://docs.millis.ai/api-reference/openapi.json), [Regions](https://docs.millis.ai/core-concepts/regions.md) |
| Autenticação: cabeçalho `authorization` obrigatório; não há `securitySchemes`; exemplo usa `Authorization: YOUR_API_KEY` | DOCUMENTED_OFFICIAL (nome); formato exato do valor: PROVIDER_UNVERIFIED | OpenAPI, [Outbound call](https://docs.millis.ai/integration/outbound-call) |
| `POST /register_sip_call`, corpo `InitAgent` (`agent_id`, `agent_config`, `metadata`, `include_metadata_in_prompt`, `from_phone`, `to_phone`, `session_continuation`; nenhum obrigatório) | DOCUMENTED_OFFICIAL + VERIFIED_IN_CODE + TESTED_OFFLINE | OpenAPI, [SIP](https://docs.millis.ai/integration/sip) |
| **Resposta** de `register_sip_call` | **PROVIDER_UNVERIFIED** — schema 200 vazio (`{}`); prosa cita `call_id` e `sip_uri`, exemplo usa `"sip"`; `session_id` não citado. O adaptador aceita as duas grafias, recusa se divergirem e encerra a sessão quando o URI é inutilizável | OpenAPI, SIP |
| Validade do URI SIP / da sessão registrada | **PROVIDER_UNVERIFIED** — nenhum campo de validade; o adaptador devolve `expiresAt = null` (UNKNOWN, nunca presumido válido) | OpenAPI |
| `POST /sessions/{session_id}/terminate` (corpo opcional `message`) | DOCUMENTED_OFFICIAL + VERIFIED_IN_CODE + TESTED_OFFLINE; resposta 200 com schema vazio | OpenAPI |
| `GET /call-logs/{session_id}` (`CallHistory`, `call_status` com enum de 20 valores) | DOCUMENTED_OFFICIAL + VERIFIED_IN_CODE + TESTED_OFFLINE | OpenAPI |
| Relação `call_id` × `session_id` na sessão SIP (qual identifica a sessão para encerrar/consultar) | **REQUIRES_PROVIDER_SUPPORT** — sem `session_id` na resposta o adaptador não encerra nem consulta (UNKNOWN) | — |
| `agent_config.language` aceita `pt-BR`; `session_timeout.max_duration`/`max_idle`/`message` | DOCUMENTED_OFFICIAL | OpenAPI (`Language`, `SessionTimeout`) |
| Webhook de fim de sessão (`session_data_webhook`): URL ou objeto `url` + `headers`; sem assinatura, retentativas ou timeout documentados | DOCUMENTED_OFFICIAL (formato); autenticação forte: PROVIDER_UNVERIFIED — continua fail-closed e só dispara consulta a `call-logs` | [Webhooks](https://docs.millis.ai/core-concepts/webhooks.md) |
| `start_outbound_call`: "Only US phone numbers are supported" | DOCUMENTED_OFFICIAL — reforça Twilio-led; **não usado** (autoridade única = Twilio) | Outbound call |
| SIP: transporte (UDP/TCP/TLS), SRTP, codecs, autenticação SIP, IP de origem, região do servidor SIP | **REQUIRES_PROVIDER_SUPPORT** (não documentados) | SIP |
| Recebe chamadas SIP **originadas pela Twilio** num fluxo de saída para +55 | **REQUIRES_PROVIDER_SUPPORT** | — |

## 2. Dúvidas técnicas ainda abertas

### 2.1 Twilio (chamado técnico ainda não aberto — T10)

1. Validação do fluxo Calls API → atendimento → `<Dial><Sip>` para o URI devolvido pela Millis, numa chamada de saída para +55, e região recomendada (`br1`?).
2. `<Sip>` com `transport=tls`: a mídia é SRTP? Há opção documentada para exigir mídia criptografada?
3. Atualização com `Status=completed` numa chamada ainda tocando cancela a chamada (equivale a `canceled`)?
4. Política de reenvio de status callbacks quando o endpoint responde 5xx.

### 2.2 Millis AI (engenharia, não o chatbot)

1. Schema oficial da resposta 200 de `register_sip_call`: o campo do URI é `sip_uri` ou `sip`? A resposta inclui `session_id`?
2. Qual identificador encerra e consulta a sessão SIP (`/sessions/{session_id}/terminate`, `/call-logs/{session_id}`)?
3. Validade do URI SIP e da sessão registrada; o que acontece se nenhum INVITE chegar (expiração, cobrança)?
4. Aceita INVITE vindo da Twilio (`<Dial><Sip>`) em chamada de saída para +55? Há lista de IPs, autenticação SIP ou domínio a configurar?
5. Transporte (UDP/TCP/TLS), SRTP, codecs suportados e localização do servidor SIP (EUA/UE).
6. Formato exato do cabeçalho `authorization` (valor da chave sem prefixo?).
7. Autenticação forte do `session_data_webhook` (assinatura, anti-replay), retentativas e timeout.
8. Códigos de erro e semântica de 4xx/5xx em `register_sip_call` (em especial se uma resposta 5xx pode ter criado sessão).

### 2.3 Operador

- Abrir os dois chamados com as mensagens da seção 3; obter número brasileiro e cadastro regulatório; definir o teto de gasto (bloqueio 5 da 008-OF6); decidir D-SIP-FAIL e D-REG-TIMING; indicar responsável jurídico (Anatel/LGPD).

## 3. Mensagens prontas

### 3.1 Para o suporte técnico da Twilio (Programmable Voice)

> Assunto: SIP outbound +55 com endpoint SIP de terceiro (Millis AI) via `<Dial><Sip>`
>
> Olá. Já recebemos orientações sobre saída no Brasil, ConversationRelay, transferência por Conference, preços e requisitos de conta. Agora precisamos de uma confirmação técnica específica. Criamos a chamada pela Calls API, a partir de um número brasileiro da Twilio, para um destino +55. A chamada usa TwiML inline com `<Dial timeLimit action record="do-not-record"><Sip statusCallbackEvent="initiated ringing answered completed" statusCallback=…>sip:<id>@<servidor-millis>;region=<região>;transport=tls</Sip></Dial>`.
> 1. Esse fluxo é suportado para saída +55? Qual `region` recomendam para um servidor SIP nos EUA ou na UE?
> 2. Com `transport=tls`, a mídia é SRTP? Existe forma de exigir mídia criptografada no `<Sip>`?
> 3. `Status=completed` numa chamada ainda tocando equivale a `canceled`?
> 4. Status callbacks que recebem 5xx são reenviados? Com que política?
>
> Não faremos chamadas antes da resposta. Obrigado.

### 3.2 Para a engenharia da Millis AI

> Subject: `register_sip_call` contract for Twilio-originated outbound calls to Brazil (+55)
>
> Hello. We will originate outbound calls ourselves through the Twilio Calls API, to Brazilian numbers (+55), and bridge the answered call to Millis with TwiML `<Dial><Sip>` to the address returned by `POST /register_sip_call`. Millis would never originate the call. Please confirm in writing:
> 1. The exact 200 response schema of `/register_sip_call` (the OpenAPI shows `{}`; the SIP page mentions `call_id` and `sip_uri`, but its example uses `"sip"`). Is `session_id` returned?
> 2. Which identifier we must use for `/sessions/{session_id}/terminate` and `/call-logs/{session_id}` for a SIP-registered session.
> 3. How long the SIP URI/session stays valid if no INVITE arrives, and whether an unused registration is billed.
> 4. Whether INVITEs originated by Twilio are accepted (IP allowlist, SIP auth or domain needed), supported transports (UDP/TCP/TLS), SRTP, codecs, and where your SIP servers are located.
> 5. The exact `authorization` header value format.
> 6. Whether `session_data_webhook` deliveries can be authenticated beyond static headers (signature, replay protection), plus retry and timeout behavior.
> 7. Error codes for `/register_sip_call`, and whether a 5xx response can still create a session.
> 8. `pt-BR` support quality for STT/TTS in this SIP flow.
>
> We will not place calls until this is confirmed. Thank you.
