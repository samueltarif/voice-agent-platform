# E2-V — Pesquisa e validação da integração nativa com a Millis

**Documento central de referência** (27/11/2026). Explica por que a E2 passou a usar a conexão DIRETA telefonia → Millis, com as proteções da VAP na execução das ferramentas e na reconciliação pós-chamada, sem repetir pesquisas nem experimentos.

Relacionados: [DEC-076 e DEC-077](../DECISIONS_LOG.md) · [proposta de simplificação](E2_SIMPLIFICATION_PROPOSAL.md) · [desenho da E2 §12](E2_AGENT_SCHEDULING_PROTOCOL.md) · `experiments/e2v-millis-native/FINDINGS.md` (branch `exp/e2v-millis-native`) · [PROJECT_STATUS](../PROJECT_STATUS.md) · [AI_WORKLOG](../AI_WORKLOG.md) · [primeira ligação WSS (E0)](../research/PHASE_8_FIRST_LIVE_CALL_WSS_AND_SCHEDULING_DECISIONS.md).

Classificação usada em todo o documento: **[REAL]** observado em experimento autorizado; **[DOC]** documentação oficial; **[CÓDIGO]** lido no código-fonte de SDK/referência; **[HIP]** hipótese; **[LACUNA]** não confirmado.

Nenhuma credencial, token, dado pessoal ou URL privada de gravação está registrada aqui.

---

## 1. Fontes e materiais

### 1.1 Pesquisas externas (Grok, ChatGPT, Antigravity) — NÃO DISPONÍVEIS NESTE REPOSITÓRIO

Os relatórios originais das pesquisas feitas pelo operador com **Grok**, **ChatGPT** e **Antigravity** sobre a integração nativa da Millis **não foram fornecidos** a esta sessão nem estão no repositório ou nos documentos do projeto. Por regra (não reconstruir pesquisas por suposição), **nenhuma conclusão delas é reproduzida aqui**.

**O operador precisa fornecer**, para anexar sem resumo em `docs/research/e2v/` (nomes sugeridos):

| Arquivo esperado | Conteúdo |
| :- | :- |
| `GROK_MILLIS_NATIVE_RESEARCH.md` | Relatório original do Grok (fontes, links, conclusões) |
| `CHATGPT_MILLIS_NATIVE_RESEARCH.md` | Relatório original do ChatGPT |
| `ANTIGRAVITY_MILLIS_NATIVE_RESEARCH.md` | Relatório original do Antigravity |
| `E2V_SESSION_REPORT_SAMPLE.anonymized.json` | Relatório pós-chamada REAL do 5º experimento, anonimizado (sem telefone, nome, `session_id` real, custos podem ficar) |
| `E2V_TIMELINES/*.json` | Exportações da página e do webhook (`npm run timeline`/`correlate`) dos experimentos 2 a 5 |

Divergências entre essas pesquisas e o que foi observado devem ser registradas na §8 quando os arquivos chegarem.

### 1.2 Documentação oficial e código consultados

| Fonte | Tipo | Uso |
| :- | :- | :- |
| `docs.millis.ai` — API de agentes (esquema `AgentConfig` e `Function`), consultado em 27/11/2026 | DOC | Campos de ferramenta (`method`, `header`, `params`, `response_mode` = `strict`/`flexible`, `execute_after_message`, `messages`, `timeout`, `run_after_call`, `exclude_session_id`, `include_metadata`), `flow.inactivity_handling { idle_time, message }`, `flow.agent_terminate_call { enabled, instruction, messages }`, `session_timeout { max_duration, max_idle, message }`, lista de modelos de `llm.model` |
| Documentação da Millis (GitBook) — webhooks | DOC | `session_data_webhook`: POST pós-chamada com histórico (`chat`) e chamadas de função |
| `@millisai/web-sdk@1.0.12` (`dist/index.mjs` e `.d.mts`) | CÓDIGO | Endpoint `wss://api-west.millis.ai:8080/millis`; mensagem `initiate { agent: { agent_id } \| { agent_config }, public_key, metadata, include_metadata_in_prompt }`; áudio PCM 16 bits LE 16 kHz; o SDK consome `clear`, `pause`, `unpause`, `start_answering`, `pong` sem emiti-los |
| `github.com/jambonz/millisai-audio-socket` (arquivado em 02/09/2026) | CÓDIGO | Ponte SIP ↔ WebSocket nativo: `onready`, `clear` (→ `killAudio`), `ontranscript`, `onresponsetext`, `start_answering`, `ai_action`, `onsessionended`; `ping` a cada ~900 pacotes |
| Twilio Media Streams (`<Connect><Stream>`), usado na E0 | DOC/REAL | Conexão direta Twilio → `twilio_inbound` da Millis (DEC-073) |

---

## 2. Cronologia

| Data/hora (BRT) | Etapa | Commit | Resultado |
| :- | :- | :- | :- |
| 25/11 | **E0** — 1ª ligação real Twilio Media Streams → Millis (`twilio_inbound`), agente "TESTE VOZ VAP" | — | [REAL] 64 s, US$ 0,2113 (Millis 0,0699 + Twilio 0,1414 por diferença de saldo); qualidade aprovada; SIP não validado (DEC-073) |
| 27/11 07:43 | Premissa arquitetural | `375388e` | DEC-076: Millis conduz a conversa; Twilio telefonia; VAP plataforma |
| 27/11 08:39 | Protótipo offline (SDK oficial, microfone, escuta do WebSocket, ferramenta sem efeito) | `e6af259` | 16 testes |
| 27/11 | **Experimento 1** (`agent_id`) | — | [REAL] `ontranscript` parcial/final, `onresponsetext`, `start_answering`, `clear`, `pause`, `unpause`, `timestamp` (marcas por caractere) |
| 27/11 09:01 | 2ª etapa: agente dinâmico, webhook autenticado (`x-e2v-token`), cenários fictícios, registro, linha do tempo | `f8e7295` | 25 testes |
| 27/11 | **Experimento 2** | — | [REAL] `agent_config` inline aceito com `gpt-4o`; `azure_gpt-5.6-luna` rejeitado; webhook alcançado **3× via GET** (sem `method`) → 404; reconexão perdeu a captura (32 eventos locais/derivados); fim ≈ 20 s após o último `idle` |
| 27/11 09:38 | Correções: `method: POST`, 405 diagnóstico, escuta re-direcionada por sessão | `b2d1f55` | 27 testes; o teste de reconexão falhava antes |
| 27/11 | **Experimento 3** | — | [REAL] POST comprovado; 2 respostas 200; `session_id` e parâmetros recebidos; `onfunction` com nome, parâmetros e resultado; horários interpretados certo; proibição de confirmar respeitada; **404 falado como "sem horários"**; 2 sessões fim `timeout` (`max_idle: 20`); config `gpt-4o` × faturamento DeepInfra; painel mostra prompt/tools vazios; voz ElevenLabs (Alcione = tarifa 3×); 96 s, 855 caracteres, US$ 0,2987 (TTS 0,2565) |
| 27/11 10:07 | 3ª rodada: inatividade nativa, `result` inequívoco, correlação `onfunction`, opções nativas, validação após ajustes, redação | `c315c90` | 37 testes |
| 27/11 | **Experimento 4** | — | [REAL] webhook POST com `session_id`; inatividade: aviso, retomada e encerramento OK, **despedida não ouvida**; HTTP 500 comunicado como falha técnica; `strict` **não** garante texto literal; `execute_after_message`: texto final 13:57:44.897Z → requisição 45.143Z → HTTP 200 45.144Z → `onfunction` 45.323Z (não prova áudio entregue) |
| 27/11 11:00 | 4ª rodada: timeout classificado por evidência, parada após reprodução, captura do relatório pós-chamada | `4384352` | 40 testes; proposta de simplificação (`af29112`) |
| 27/11 | **Experimento 5 (final)** | — | [REAL] relatório pós-chamada por POST com histórico por interlocutor, `function_calls`, `session_id`, metadados, duração, status e custos por serviço; indisponibilidade, `error_200` e timeout tratados corretamente; aviso de inatividade e **despedida ouvida**; 96,09 s, **11,9967 créditos** (conversão créditos → US$ não registrada [LACUNA]) |
| 27/11 | Decisão e implementação | DEC-077; PR "E2 simplificada" | Conexão direta; intenção pendente; reconciliação pós-chamada |

Custos totais dos experimentos E2-V: somatório não consolidado pelo operador [LACUNA]; ordem de grandeza por sessão: US$ 0,07–0,30.

---

## 3. Recursos nativos da Millis

| Recurso | Comprovado [REAL] | Só documentado [DOC] | Hipótese/lacuna |
| :- | :- | :- | :- |
| Raciocínio, STT, TTS, barge-in (`clear`) | ✓ (E0, exp. 1–5) | | |
| `agent_config` inline por sessão | ✓ com `gpt-4o` | modelos listados | modelo efetivo (DeepInfra no faturamento) [LACUNA] |
| Ferramenta webhook `method: POST` + cabeçalho | ✓ | | assinatura do fornecedor [LACUNA] |
| `session_id` e parâmetros no corpo | ✓ | `exclude_session_id`, `include_metadata` | |
| `onfunction` (nome, parâmetros, resultado) no WebSocket | ✓ | | entrega/ordem garantidas [LACUNA] |
| Erro HTTP do webhook comunicado como falha | ✓ (500) | | 404 foi falado como "sem horários" (antes do contrato `result`) |
| `response_mode: strict` | ✓ **não** garante texto literal | `strict`/`flexible` | |
| `execute_after_message` + `messages` | ✓ executa após o TEXTO | "após a mensagem terminar de tocar" | entrega do áudio [LACUNA] |
| `flow.inactivity_handling` | ✓ aviso e retomada | `idle_time`, `message` | repetição do aviso [LACUNA] |
| `session_timeout.max_idle` | ✓ encerra com status `timeout` | | se a fala do agente reinicia a contagem [LACUNA] |
| `flow.agent_terminate_call` | | `enabled`, `instruction`, `messages` | comportamento real [LACUNA] |
| Relatório pós-chamada (`session_data_webhook`) | ✓ (exp. 5) | histórico + `function_calls` | autenticação do POST, retentativas e atraso [LACUNA] |
| Eventos de fala/turno para quem NÃO mantém o WebSocket | — | — | não disponíveis na conexão direta via Twilio [REAL por ausência] |

---

## 4. Contratos observados

### 4.1 Ferramenta (forma enviada no `agent_config`)

```json
{
  "name": "e2v_consultar_agenda",
  "description": "… usa o campo result: AVAILABLE | NO_AVAILABILITY | TECHNICAL_ERROR …",
  "webhook": "https://<túnel temporário>/tool/e2v-agenda",
  "method": "POST",
  "header": { "x-e2v-token": "<efêmero>" },
  "params": [{ "name": "preferencia", "type": "string", "description": "…", "required": false }],
  "response_mode": "strict",
  "execute_after_message": true,
  "messages": ["Um momento, vou consultar."],
  "timeout": 5
}
```

Resposta do webhook (contrato da VAP, para que falha NUNCA seja falada como indisponibilidade): `{ "result": "AVAILABLE" | "NO_AVAILABILITY" | "TECHNICAL_ERROR", "instructions": "…", "slots": […] }`.

### 4.2 Eventos do WebSocket nativo (servidor → cliente)

`onready`, `ontranscript` (`data`: texto; `payload.is_final`), `onresponsetext` (`data`; `payload.is_final`), `start_answering`, `clear`, `pause`, `unpause`, `timestamp`, `onfunction`, `ai_action` [CÓDIGO jambonz], `onsessionended` (status, ex.: `timeout`), `pong`; áudio binário PCM16 16 kHz. Exemplo anonimizado:

```json
{"method":"ontranscript","data":"quero ver os horários","payload":{"is_final":true}}
{"method":"onfunction","data":{"name":"e2v_consultar_agenda","params":{"preferencia":"terça"},"result":"{\"result\":\"AVAILABLE\",…}"}}
{"method":"onsessionended","data":{"status":"timeout"}}
```

(Forma exata do `onfunction` e do `onsessionended`: [LACUNA] até anexar as exportações da §1.1.)

### 4.3 Relatório pós-chamada

[REAL] POST contendo: histórico por interlocutor (`chat`), `function_calls`, `session_id`, metadados da sessão, duração, status e custos por serviço. **Nomes de campo e aninhamento exatos: [LACUNA] — dependem da amostra anonimizada (§1.1).** Por isso a VAP define uma forma **normalizada e neutra** (`packages/contracts/src/scheduling/post-call-report.ts`): `ordering` (`TIMELINE`|`UNKNOWN`), `entries` (`LEAD`/`AGENT`/`TOOL_CALL`), `endReason`, `durationSeconds`. O adaptador do provedor (pendente) traduz o relatório real para ela; se não provar a ordem, usa `UNKNOWN` e nada que dependa de ordem é decidido.

---

## 5. Conexão direta × proxy transparente × Media Bridge

| Critério | Direta (Twilio `<Connect><Stream>` → Millis) | Proxy transparente (Twilio ↔ VAP ↔ Millis `twilio_inbound`, só repasse) | Media Bridge nativo (Twilio ↔ VAP ↔ WebSocket nativo) |
| :- | :- | :- | :- |
| O que a VAP observa | status Twilio; webhooks de ferramenta [REAL]; relatório pós-chamada [REAL] | + quadros de mídia no formato Twilio; transcrição **não** [HIP] | + `ontranscript`, `onresponsetext`, `onfunction`, `clear`… em tempo real [REAL no WS]; confirmação de reprodução via `mark` da Twilio [DOC Twilio, não validado] |
| Prova de áudio entregue | impossível | impossível | possível (único caminho) |
| Latência (25% do critério DEC-044) | menor; comprovada na E0 | + 1 salto | + 1 salto + conversão μ-law 8 kHz ↔ PCM 16 kHz |
| Operação | nada novo | serviço WSS público 24/7 | serviço WSS público 24/7, escala, failover, repasse de barge-in |
| Reconstrói o que a Millis faz? | não | não | só se tentar controlar turnos (proibido pela DEC-076) |

**Escolha (DEC-077): conexão direta.** O proxy transparente não traz evidência útil adicional (não vê transcrições) e adiciona operação; o Media Bridge só por gatilho (§7).

---

## 6. Evolução das decisões e por que a E2 foi simplificada

1. **DEC-075 (E2 PR 1–3)** desenhou um protocolo de consentimento no servidor dirigido por eventos de fala (entrega da releitura, turnos do transporte, autoridade de saída, filtro de afirmações) — pressupunha que a VAP recebesse esses eventos.
2. **DEC-076** fixou a premissa: a Millis conduz o diálogo; não reconstruir o que ela oferece; verificar capacidades antes.
3. **E2-V** mostrou: (a) na conexão direta a VAP não recebe eventos de fala; (b) `strict` não garante texto literal e `execute_after_message` não prova áudio — logo, nenhum controle pode depender de "o agente falou exatamente X"; (c) webhook POST autenticado, `session_id`, `onfunction` e relatório pós-chamada existem e funcionam.
4. **DEC-077** — consequência: os controles de fala ficaram sem insumo e foram removidos; as proteções migraram para (i) a execução das ferramentas (dados, oferta desta sessão, supressão, travas, idempotência) e (ii) a reconciliação pós-chamada com o histórico (aceite, opt-out faltante, resultado comercial).

---

## 7. Proteções comerciais, riscos residuais e critérios do Media Bridge

| Proteção | Mecanismo (E2 simplificada) |
| :- | :- |
| Confirmação segura | `scheduling.request_booking` só registra intenção pendente da oferta desta sessão (lista vigente, não vencida, sem opt-out, telefone não suprimido). Reserva só na reconciliação: chamada da ferramenta no histórico para a MESMA lista/opção, última fala do lead = aceite inteiro (classificador da PR 1), fala anterior do agente cita dia da semana e hora da oferta, nada depois contradiz; então a reserva transacional da E1 (mesma oferta/tentativa, idempotência). Dúvida ⇒ revisão humana |
| Consentimento | a frase passada pelo modelo nunca é prova; só o histórico |
| Opt-out | ferramenta suprime na hora (preventivo) e cancela intenção pendente; reconciliação registra o opt-out dito sem ferramenta; menção ambígua ⇒ revisão |
| Novas tentativas | claim de envio recusa o telefone enquanto houver reconciliação aberta (relatório pendente, atrasado, ausente, conflitante ou revisão) |
| CALL_OUTCOME | ferramenta só propõe; aplicado só com fala do lead no histórico; timeout genérico nunca é desinteresse nem, por si, inatividade |
| Relatório | resolução da tentativa só no servidor; sessão validada e vinculada à tentativa (`current_attempt_id`); digest para idempotência; conflito ⇒ revisão; ausência (`REPORT_MISSING`) ou processamento interrompido (`REPORT_PROCESSING_INCOMPLETE`) ⇒ revisão após prazo |
| Multiempresa, idempotência, transação | contexto fixado da sessão; ordem global de travas K → L → C → O → A → S → I → R → P; chave de idempotência por intenção |

**Riscos residuais:** histórico é texto de STT/LLM e não prova áudio reproduzido nem compreensão; o motor pode citar mal um horário (regra conservadora manda para revisão); opt-out dito sem ferramenta só é registrado após a chamada; autenticação do relatório e das ferramentas depende do que a Millis suporta (cabeçalho estático; assinatura [LACUNA]); o adaptador do relatório real ainda depende da amostra.

**Critérios objetivos para adotar o Media Bridge:** (a) exigência regulatória/contratual de transcrição em tempo real ou de prova de reprodução; (b) no piloto supervisionado, qualquer opt-out falado não registrado pela ferramenta, ou reserva confirmada sem aceite no histórico, sem explicação; (c) relatório pós-chamada ausente/atrasado acima de 1% das chamadas ou sem conteúdo suficiente para a reconciliação; (d) taxa de revisão humana por evidência ambígua que torne a operação inviável.

---

## 8. Divergências e limitações registradas

- Pesquisas externas (§1.1) ausentes: divergências não avaliadas.
- Modelo efetivo da sessão e conversão de créditos: a confirmar com a Millis.
- Comportamento real de `agent_terminate_call`, repetição de `inactivity_handling` e reinício de `max_idle` pela fala do agente: não medidos.
- A despedida não ouvida no exp. 4 e ouvida no exp. 5: a correção do cliente do protótipo (parar só após a reprodução) é a explicação mais provável [HIP].
