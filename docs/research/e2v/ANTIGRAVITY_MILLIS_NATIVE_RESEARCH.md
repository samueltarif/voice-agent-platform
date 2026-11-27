Ran grep Millis references
Ran grep DEC-074 and DEC-075 · Exited with code 1
Ran grep DEC-074 and DEC-075 all repo · Exited with code 1
Ran grep DEC-074/075 in PR branch
Checked task Grep DEC-074/075 in PR branch
Killing task Grep DEC-074/075 in PR branch
Ran read Phase 8 Live Call Doc
Searched site:github.com/jambonz/millisai-audio-socket
Canceled fetch ws.js from github
Checked task Fetch ws.js from github
Killed task Fetch ws.js from github
Canceled fetch ws.js from github
Checked task Fetch ws.js from github
Killed task Fetch ws.js from github
Ran fetch ws.js from github
Ran fetch web-sdk index.d.mts
Ran fetch unpkg raw d.mts
Ran fetch web-sdk index.mjs head
Ran list jambonz repo contents
Ran fetch app.js and lib/routes
Ran list lib/routes/endpoints
Ran fetch millis.js
Ran fetch hotato contents and readme
Ran fetch twilio repos readmes
Ran fetch native-apps-with-websocket doc · Exited with code 1
Ran fetch Millis docs markdown
Ran fetch Millis llms.txt
Ran fetch Millis core concepts docs
Ran fetch Millis register-call, inbound, metadata, variables
Ran fetch Millis inbound-call, webrtc, sip
Ran search openapi.json
Ran fetch webhook-function-call-api tutorial
Searched "response_mode" "strict" "execute_after_message" millis
Searched millis.ai for "response_mode" site:docs.millis.ai
Ran inspect openapi schemas in python · Exited with code 1
Ran inspect openapi schemas via node
Searched "response_mode" "strict" "flexible" "execute_after_message"
Searched millis.ai for "response_mode" "strict"
Ran inspect app.millis.ai HTML
Ran fetch buildManifest.js
Ran search agentId bundle · Exited with code 1
Ran search app chunks
Ran find paths with Function/tools
Ran list all openapi paths
Ran inspect POST /agents schema
Ran inspect AgentCreate schema
Ran inspect AgentConfig-Input.tools schema

# Relatório Técnico de Investigação: Transporte Nativo Millis AI, Media Streams e Arquitetura de Telefonia (E2/E3)

**Modo de Execução:** READ-ONLY / Investigação Técnica Independente  
**Status Normativo:** `OBSERVED` em código/contratos públicos; `PROVIDER-UNVERIFIED` para comportamentos em tráfego telefônico real.  
**Alinhamento Arquitetural:** DEC-042, DEC-044, DEC-073, DEC-074, DEC-075 e `E2_AGENT_SCHEDULING_PROTOCOL.md`.

---

## 1. Evidências Documentais e de Código-Fonte

Todas as asserções a seguir baseiam-se em inspeção direta de repositórios e endpoints públicos oficiais.

### 1.1. Transporte Nativo Millis AI (`wss://api-west.millis.ai:8080/millis`)
* **Fonte:** `jambonz/millisai-audio-socket` (`lib/utils/ws.js` [L2-L135](https://raw.githubusercontent.com/jambonz/millisai-audio-socket/main/lib/utils/ws.js)) e `app.js` ([L36-L39](https://raw.githubusercontent.com/jambonz/millisai-audio-socket/main/app.js)):
  ```javascript
  const MILLISAI_WS_URL = process.env.MILLISAI_WS_URL || 'wss://api-west.millis.ai:8080/millis';
  // Handshake inicial após ws.on('open')
  const initiateMessage = {
    method: 'initiate',
    data: {
      agent: { agent_id: process.env.MILLISAI_AGENT_ID },
      public_key: process.env.MILLISAI_PUBLIC_KEY,
    }
  };
  ```
* **Formato de Áudio no Jambonz:** `lib/routes/endpoints/millis.js` ([L10-L19](https://raw.githubusercontent.com/jambonz/millisai-audio-socket/main/lib/routes/endpoints/millis.js)):
  `sampleRate: 16000`, `bidirectionalAudio: { enabled: true, streaming: true, sampleRate: 16000 }`.
* **Mensagens e Sinais Recebidos do Servidor Millis (`lib/utils/ws.js` L75-L105):**
  - `onready`: Servidor pronto para receber áudio binário do cliente.
  - `clear`: Sinal de *barge-in* do interlocutor. O adaptador converte imediatamente para `{ type: 'killAudio' }` para o PBX (Jambonz) descartar o buffer de playback.
  - `ontranscript`: Texto transcrito do cliente (`message.data`).
  - `onresponsetext`: Resposta do agente (`message.data`).
  - `start_answering`: Agente iniciou o processamento da resposta.
  - `ai_action`: Ação disparada pelo agente.
  - `onsessionended`: Término da sessão no servidor.

### 1.2. Millis AI Web SDK (`@millisai/web-sdk@1.0.12`)
* **Fonte:** `https://unpkg.com/@millisai/web-sdk@1.0.12/dist/index.mjs` e `dist/index.d.mts`.
* **Áudio e Codec:** `var I = 16e3;` (16 kHz mono). No worklet de captura/playback:
  ```javascript
  // 16-bit little-endian PCM para Float32 e vice-versa:
  sourceDataView.getInt16(i * 2, true) / Math.pow(2, 15);
  ```
  Comprovado: O transporte `/millis` trafega exclusivamente **Linear PCM 16-bit, 16.000 Hz, Little-Endian, Mono**.
* **Contrato de Inicialização Inline (Agente Temporário / Sem ID prévio):**
  `index.mjs` e `index.d.mts`:
  ```typescript
  type Agent = { agent_id: string } | { agent_config: AgentConfig };
  // Payload enviado no WebSocket:
  {
    method: "initiate",
    data: {
      agent: typeof idOrConfig === "string" ? { agent_id } : { agent_config },
      public_key: string,
      metadata?: object,
      include_metadata_in_prompt?: boolean
    }
  }
  ```

### 1.3. OpenAPI Oficial da Millis AI (`https://api-west.millis.ai/openapi.json`)
* **Campos Avançados de Ferramentas (`fast_api_data__data__Function`):**
  - `response_mode`: enum `["strict", "flexible"]`. Descrição oficial: *"Indicates if agent's response should be strict or flexible."*
  - `execute_after_message`: boolean. Descrição oficial: *"Indicates if the function starts executing only after a predefined message is played."*
  - `messages`: array de string. Descrição oficial: *"Predefined messages for agent to say while executing the function."*
  - `exclude_session_id`: boolean. Descrição: *"Indicates if the session ID should not be included in the webhook request."*
  - `include_metadata`: boolean. Descrição: *"Indicates if metadata should be included in the webhook request."*
* **Registro de Chamada (`POST /register_call`):**
  - Entrada: `InitAgent` (`agent_id`, `agent_config`, `metadata`, `include_metadata_in_prompt`, `from_phone`, `to_phone`, `session_continuation`).
  - Resposta: `CallRegistrationResponse` contendo `{ "call_id": string, "session_id": string }`.
  - **Fato observado:** Nenhuma menção a integração com TwiML Stream ou vinculação à rota `twilio_inbound`.

### 1.4. Segurança em WebSockets da Twilio (`bbTwilio/twilio-websocket-security`)
* **Problema documentado:** A URL `wss://` informada no TwiML é pública na internet. Twilio não possui IP fixo e, por padrão, não se autentica a menos que exigido. Um endpoint sem proteção permite injeção anônima de tráfego, consumo de minutos e exploração de inferência.
* **Camadas de controle comprovadas:**
  1. `wss://` com certificado TLS válido.
  2. Validação da assinatura `X-Twilio-Signature` no handshake HTTP Upgrade.
  3. Token efêmero de uso único (`nonce`/`jti`) atrelado estritamente ao `CallSid` na query string da URL do Stream.
  4. Fechamento de conexão imediato (código 1008 - Policy Violation) em caso de divergência de `CallSid`.

---

## 2. Comparação das Três Arquiteturas de Transporte

| Critério / Dimensão | 1. Integração Direta Atual (`twilio_inbound`) | 2. Proxy Transparente Twilio (WSS Proxy) | 3. Proxy Nativo Millis (Twilio ↔ VAP Bridge ↔ Millis `/millis`) |
| :--- | :--- | :--- | :--- |
| **Topologia da Conexão** | Twilio ➔ Millis direto via WSS. | Twilio ➔ VAP Proxy ➔ Millis (`twilio_inbound`). | Twilio ➔ VAP Bridge (WSS) ➔ Millis (`/millis`). |
| **Ponto de Borda Twilio** | Endpoint da Millis (`wss://api-west.millis.ai:8080/...`). | Endpoint da VAP (`wss://vap/stream?token=...`). | Endpoint da VAP (`wss://vap/stream?token=...`). |
| **Controle de Autenticação** | Inexistente na VAP. Chave pública e `agent_id` expostos na URL. | **Máximo.** Valida `X-Twilio-Signature` + token atrelado a `CallSid`. | **Máximo.** Valida `X-Twilio-Signature` + token atrelado a `CallSid`. |
| **Caminho de Mídia** | Fora da infraestrutura da VAP. | VAP faz relay de JSON frames Twilio (μ-law 8kHz). | VAP faz transcodificação bidirecional de mídia. |
| **Transcodificação de Codec** | Não exige CPU da VAP (feita internamente pela Millis). | Não exige CPU da VAP (passthrough dos frames). | **Obrigatória na VAP:** G.711 μ-law 8kHz ↔ Linear PCM 16kHz. |
| **Acesso a Eventos de IA** | **Nenhum em tempo real.** VAP só recebe webhooks HTTP da Millis. | **Nenhum.** O Stream Twilio só carrega frames de áudio e marks da Twilio. | **Total.** VAP recebe `ontranscript`, `start_answering`, `clear`, etc. |
| **Precedência do Opt-Out (D2)** | **Fraca.** Depende 100% de o LLM invocar o webhook `lead.record_opt_out`. | **Fraca.** Não há transcrição no canal do proxy transparente. | **Forte / Determinística.** VAP audita a transcrição e pode suprimir/abortar a chamada. |
| **Controle de Barge-in** | Delegado à Millis e Twilio. | Apenas observa o tráfego Twilio. | VAP recebe `clear` da Millis e envia `clear` à Twilio imediatamente. |
| **Complexidade e Operação** | Muito baixa. | Média (relay assíncrono de WebSockets). | Alta (processamento de streaming, áudio, resampling e sincronização). |
| **Latência Adicionada** | 0 ms (direto). | ~5 a 15 ms (se o proxy estiver na mesma região AWS/GCP). | ~10 a 25 ms (resampling + buffer de 20ms + RTT de rede). |

---

## 3. Matriz de Capacidades Reais da Millis AI

Classificação baseada em código observado e esquemas de API:

| Capacidade | Status de Evidência | Implementação Real Observada |
| :--- | :---: | :--- |
| **Endpoint `/millis` (Áudio Bidirecional)** | `OBSERVED` | WebSocket aceita Linear PCM 16kHz 16-bit mono. Mantém o LLM da Millis sem substituí-lo. |
| **Agente Temporário Inline (`agent_config`)** | `OBSERVED` | Handshake `initiate` aceita objeto `agent_config` completo. Não exige criação prévia de agente via REST. |
| **Metadados na Sessão** | `OBSERVED` | Enviados no `initiate` via `metadata`. Injetados em `extra_prompt_webhook` e repassados em ferramentas. |
| **Detecção de Barge-in (`clear`)** | `OBSERVED` | Servidor emite `{ "method": "clear" }` quando o interlocutor interrompe o agente. |
| **Detecção de Hesitação (`pause` / `unpause`)** | `OBSERVED` | Servidor emite `pause` em VAD incipiente e `unpause` se não houver fala contínua. |
| **Sinal de Início de Resposta (`start_answering`)** | `OBSERVED` | Servidor emite no instante em que o turno do usuário encerra e a IA inicia o raciocínio. |
| **Transcrição em Tempo Real (`ontranscript`)** | `OBSERVED` | Retorna texto com `payload.is_final`. **Não representa necessariamente fim de turno.** |
| **Texto de Resposta do Agente (`onresponsetext`)** | `OBSERVED` | Retorna o texto gerado pelo LLM em tempo real (com `is_final`). |
| **`onagentstate` pelo Servidor** | **INEXISTENTE** | **Comprovado em código:** É um estado puramente derivado no cliente pelo SDK, não emitido pelo servidor. |
| **Mensagem de Espera (`messages` em Tools)** | `OBSERVED` | Suportado no esquema OpenAPI (`fast_api_data__data__Function`). |
| **Execução Pós-Fala (`execute_after_message`)** | `OBSERVED` | Suportado no esquema OpenAPI; instrui o envio do webhook só após a fala do aviso. |
| **Modo de Resposta `strict`** | `OBSERVED` (Schema) / `PROVIDER-UNVERIFIED` (Runtime) | Campo presente no OpenAPI. **Sem comprovação empírica ou SLA** de imunidade a alucinações. |
| **Vínculo `register_call` ↔ Twilio Stream** | **INEXISTENTE** | Não documentado e não suportado pelo path `/twilio_inbound/{public_key}/{agent_id}`. |

---

## 4. Lacunas Contratuais e Limitações do Fornecedor

1. **Ausência de Garantia contra Alucinações pós-Ferramenta:**  
   O campo `response_mode: strict` não impede formalmente que um LLM estocástico afirme que uma reserva foi realizada quando o webhook retornou recusa (`SLOT_UNAVAILABLE`).
2. **Semântica do `is_final` no STT:**  
   `is_final: true` no evento `ontranscript` reflete a finalização de um bloco de áudio no transcritor (ASR), **não o término do turno conversacional**. Usuários que fazem pausas naturais de respiração disparam múltiplos `is_final` em uma única intervenção.
3. **Assinatura e Integridade dos Webhooks:**  
   Não há assinatura HMAC nativa nos webhooks de ferramentas (`tools`) enviados pela Millis; a proteção depende exclusivamente de tokens estáticos configurados nos headers (`header: { "Authorization": "..." }`) e da rota privada da VAP.
4. **Falta de Parâmetros de Correlação no TwiML da Millis:**  
   A rota `/twilio_inbound/{public_key}/{agent_id}` não aceita parâmetros customizados no path. Quaisquer `<Parameter>` do TwiML Stream não possuem garantia contratual de repasse aos webhooks de ferramentas.

---

## 5. Impacto sobre a E2 e Próximas Fases da VAP

### 5.1. Relação com a E2 (DEC-075)
A fundação da E2 estabeleceu regras determinísticas para o agendamento:
* O redutor de agendamento e o classificador de linguagem natural (`classifyLeadReply`) operam exclusivamente no servidor VAP.
* **Na Integração Direta Atual:** A VAP fica cega ao áudio e à transcrição em tempo real. Se o interlocutor disser "Me descadastre, pare de ligar" e o LLM da Millis ignorar ou alucinar em vez de acionar `lead.record_opt_out`, a VAP não recebe a fala e o opt-out é perdido.
* **No Transporte Nativo (`/millis`):** A VAP intercepta cada `ontranscript`. Isso permite alimentar o `classifyLeadReply` no próprio servidor VAP durante a chamada, garantindo que o opt-out (D2) seja executado **mesmo se a IA da Millis falhar**.

### 5.2. Transição entre Fases
* **E2 (Fundação de Agendamento):** Totalmente concluída e auditada em modo offline (PRs #180, #182 e #183).
* **E3 / E4 (Conectores Operacionais e Gateway):** O modelo direto atual pode ser utilizado para testes supervisionados pontuais, mas a transição para tráfego comercial com clientes reais exige o fechamento das brechas de segurança e governança de turnos.

---

## 6. Riscos de Segurança, Concorrência e Integridade

1. **Risco de Falsas Confirmações (Veracidade de Saída):**  
   Se o webhook de reserva demorar (ex: lock de banco de dados ou retry na transação `REPEATABLE READ`), o LLM pode preencher o silêncio com afirmações infundadas.  
   *Mitigação:* Uso obrigatório de `messages` ("Aguarde um instante enquanto verifico a agenda...") e `execute_after_message: true`.
2. **Exposição de Chaves no TwiML:**  
   Na integração direta, `PUBLIC_KEY` e `AGENT_ID` transitam em texto plano na resposta HTTP do TwiML para a Twilio.
3. **Bufferbloat e Descompasso de Codec:**  
   No Proxy Nativo, se a conversão G.711 ↔ PCM 16kHz sofrer gargalo de event-loop em Node.js, ocorrerá acúmulo de buffers, atrasando o áudio e gerando interrupções espúrias.

---

## 7. Proposta de Testes Estritamente Offline (Sem Custos e Sem Rede)

Para validar a arquitetura sem emitir tráfego real ou consumir saldo:

1. **Fixture de Transcodificação de Áudio (`test-audio-transcode.test.ts`):**
   - Entrada sintética: Buffer PCM 16-bit 16kHz (onda senoidal de 440 Hz).
   - Conversão para G.711 μ-law 8kHz e reconversão para PCM 16kHz.
   - Asserção: Relação sinal-ruído (SNR) e ausência de distorção de fase; tempo de processamento por chunk de 20ms < 0.5 ms.
2. **Simulador de WebSocket Millis (`fake-millis-native-server.ts`):**
   - Servidor local `ws` em memória simulando `wss://api-west.millis.ai:8080/millis`.
   - Emite sequência controlada de frames JSON: `onready` ➔ `start_answering` ➔ `ontranscript` (com e sem `is_final`) ➔ `clear` ➔ frames de áudio sintéticos ➔ `onsessionended`.
3. **Simulador de Twilio Media Stream (`fake-twilio-stream-client.ts`):**
   - Emite eventos `connected`, `start`, `media` (μ-law base64), `stop`.
   - Verifica se o gateway repassa corretamente o sinal de `clear` para a Twilio assim que a Millis envia `clear`.
4. **Teste de Precedência de Opt-Out com Falha do LLM:**
   - Injetar áudio ou texto de opt-out ("Não me ligue mais").
   - O simulador Millis simula um LLM que NÃO chama a ferramenta de opt-out.
   - Asserção: O gateway da VAP intercepta o `ontranscript`, roda o `classifyLeadReply`, identifica `OPT_OUT`, dispara o encerramento da chamada e registra o opt-out no banco durável.

---

## 8. Recomendação Arquitetural Fundamentada

### Diagnóstico
A integração direta via TwiML Stream (`twilio_inbound`) é válida exclusivamente como **PoC (Proof of Concept) de baixa complexidade para homologação de perna telefônica supervisionada**. Ela não atende aos requisitos de produção da VAP para clientes reais porque terceiriza integralmente o canal de voz, abrindo mão do controle determinístico sobre o opt-out (D2) e sobre a segurança do handshake (DEC-075).

### Recomendação Estratégica em Duas Etapas

```
[Etapa 1 - Piloto Supervisionado Restrito / E3]
Twilio ──(WSS TwiML)──> Millis AI (twilio_inbound)
                             │
                             └──(Webhook HTTPS com Auth Token)──> VAP Backend Gateway (E2 Tools)

[Etapa 2 - Produção Comercial Homologada / E4+]
Twilio ──(WSS + X-Twilio-Signature + Token)──> VAP Media Bridge ──(WSS /millis + PCM 16k)──> Millis AI
                                                     │
                                                     └── Observabilidade de Turnos & D2 Opt-Out Gate
```

1. **Piloto Imediato (Etapa 1):**  
   Manter temporariamente a conexão direta WSS Twilio ➔ Millis (`twilio_inbound`) apenas para testes manuais controlados pelo operador humano, adotando as ferramentas da E2 via webhook HTTPS com tokens efêmeros por tentativa de chamada (`session_id`).
2. **Evolução Definitiva (Etapa 2):**  
   Construir o **VAP Media Bridge** utilizando o endpoint nativo `wss://api-west.millis.ai:8080/millis`:
   - Permite o uso de agentes temporários declarados em tempo de execução via `agent_config` no handshake, eliminando chamadas REST para criar/excluir agentes na Millis.
   - Permite que a VAP atue como guardiã em tempo real dos turnos conversacionais, interceptando `ontranscript` e garantindo o cumprimento de supressões e opt-outs regulatórios mesmo diante de qualquer comportamento anômalo do modelo de linguagem.