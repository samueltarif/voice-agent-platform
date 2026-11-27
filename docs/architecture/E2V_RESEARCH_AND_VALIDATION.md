# E2-V — Pesquisa e validação da integração nativa com a Millis

**Documento central de referência** (27/11/2026). Explica por que a E2 passou a usar a conexão DIRETA telefonia → Millis, com as proteções da VAP na execução das ferramentas e na reconciliação pós-chamada, sem repetir pesquisas nem experimentos.

Relacionados: [DEC-076 e DEC-077](../DECISIONS_LOG.md) · [proposta de simplificação](E2_SIMPLIFICATION_PROPOSAL.md) · [desenho da E2 §12](E2_AGENT_SCHEDULING_PROTOCOL.md) · `experiments/e2v-millis-native/FINDINGS.md` (branch `exp/e2v-millis-native`) · [PROJECT_STATUS](../PROJECT_STATUS.md) · [AI_WORKLOG](../AI_WORKLOG.md) · [primeira ligação WSS (E0)](../research/PHASE_8_FIRST_LIVE_CALL_WSS_AND_SCHEDULING_DECISIONS.md) · [evidências E2-V (pesquisas originais, amostra do relatório, linhas do tempo)](../research/e2v/README.md).

**Atualização de 27/11/2026 (complementação da PR #184):** os materiais do operador foram incorporados em `docs/research/e2v/`; §1.1, §2, §3, §4 e §8 foram completadas com a amostra real e as divergências; o adaptador Millis → `PostCallReport` foi implementado (§4.4).

Classificação usada em todo o documento: **[REAL]** observado em experimento autorizado; **[DOC]** documentação oficial; **[CÓDIGO]** lido no código-fonte de SDK/referência; **[HIP]** hipótese; **[LACUNA]** não confirmado.

Nenhuma credencial, token, dado pessoal ou URL privada de gravação está registrada aqui.

---

## 1. Fontes e materiais

### 1.1 Pesquisas externas e evidências experimentais — `docs/research/e2v/`

Fornecidas pelo operador em 27/11/2026 e incorporadas **sem reescrita** (cópias byte a byte; SHA-256 conferidos com o inventário do [README](../research/e2v/README.md)). As alegações das pesquisas **não foram verificadas independentemente**; o confronto com a evidência real está na §8.

| Arquivo | Autoria | SHA-256 (prefixo) | Conteúdo |
| :- | :- | :- | :- |
| [`GROK_MILLIS_NATIVE_RESEARCH.md`](../research/e2v/GROK_MILLIS_NATIVE_RESEARCH.md) | Grok | `8d94ba9a` | Documentação oficial (26/11): capacidades, matriz de eventos, A1–A7, arquitetura |
| [`GROK_MILLIS_PRACTICAL_RESEARCH.md`](../research/e2v/GROK_MILLIS_PRACTICAL_RESEARCH.md) | Grok | `c0520673` | Vídeos, GitHub, n8n/Make; demonstrado × só mencionado |
| [`CHATGPT_MILLIS_NATIVE_RESEARCH.md`](../research/e2v/CHATGPT_MILLIS_NATIVE_RESEARCH.md) | ChatGPT | `dae02840` | Documentação oficial, Twilio Media Streams (`mark`/`clear`), webhooks, garantias de entrega |
| [`CHATGPT_MILLIS_PRACTICAL_RESEARCH.md`](../research/e2v/CHATGPT_MILLIS_PRACTICAL_RESEARCH.md) | ChatGPT | `33a38514` | Implementações públicas; `strict`/`execute_after_message`; pós-chamada |
| [`ANTIGRAVITY_MILLIS_NATIVE_RESEARCH.md`](../research/e2v/ANTIGRAVITY_MILLIS_NATIVE_RESEARCH.md) | Antigravity | `8db616aa` | Código do SDK/jambonz, OpenAPI, comparação das três arquiteturas |
| [`E2V_SESSION_REPORT_SAMPLE.anonymized.json`](../research/e2v/E2V_SESSION_REPORT_SAMPLE.anonymized.json) | experimento 5 | — | Corpo (`body`) do relatório pós-chamada REAL, transcrito do registro apresentado pelo operador e anonimizado (não é o JSONL bruto) |
| [`E2V_TIMELINES/`](../research/e2v/E2V_TIMELINES/) `EXP01`, `EXP02`, `EXP03`, `EXP04_A/B/C`, `EXP05` | experimentos 1–5 | — | Exportações do NAVEGADOR (não combinadas com logs do servidor); `EXP02` só 32 eventos (falha de captura conhecida); IDs substituídos, URLs e credenciais redigidas |

**Ainda faltam (operador):** os JSONL originais do webhook no computador do operador e linhas do tempo combinadas página × servidor (`correlate`), se forem necessárias para auditoria. A ausência não invalida a evidência do exp. 5: o corpo do relatório está no pacote.

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
| 27/11 | **Experimento 2** | — | [REAL] `agent_config` inline aceito com `gpt-4o`; `azure_gpt-5.6-luna` rejeitado; webhook alcançado **3× via GET** (sem `method`: o padrão observado foi **GET**, não POST) → 404, **falado como "sem horários"**; reconexão perdeu a captura (32 eventos locais/derivados); fim ≈ 20 s após o último `idle` |
| 27/11 09:38 | Correções: `method: POST`, 405 diagnóstico, escuta re-direcionada por sessão | `b2d1f55` | 27 testes; o teste de reconexão falhava antes |
| 27/11 | **Experimento 3** | — | [REAL] POST comprovado; 2 respostas 200; `session_id` e parâmetros recebidos; `onfunction` com nome, parâmetros e resultado; horários interpretados certo; proibição de confirmar respeitada; 2 sessões fim `timeout` (`max_idle: 20`); config `gpt-4o` × faturamento DeepInfra; painel mostra prompt/tools vazios; voz ElevenLabs (Alcione = tarifa 3×); 96 s, 855 caracteres, US$ 0,2987 (TTS 0,2565) |
| 27/11 10:07 | 3ª rodada: inatividade nativa, `result` inequívoco, correlação `onfunction`, opções nativas, validação após ajustes, redação | `c315c90` | 37 testes |
| 27/11 | **Experimento 4** | — | [REAL] webhook POST com `session_id`; inatividade: aviso, retomada e encerramento OK, **despedida não ouvida**; HTTP 500 comunicado como falha técnica; `strict` **não** garante texto literal; `execute_after_message`: texto final 13:57:44.897Z → requisição 45.143Z → HTTP 200 45.144Z → `onfunction` 45.323Z (não prova áudio entregue) |
| 27/11 11:00 | 4ª rodada: timeout classificado por evidência, parada após reprodução, captura do relatório pós-chamada | `4384352` | 40 testes; proposta de simplificação (`af29112`) |
| 27/11 | **Experimento 5 (final)** | — | [REAL] ferramenta com `response_mode: flexible` e `execute_after_message` não ligado; relatório pós-chamada por POST para URL com **token na query** (`session_data_webhook` como texto) com histórico por interlocutor, `function_calls`, `session_id`, metadados, duração, status e custos por serviço; indisponibilidade, `error_200` e timeout tratados corretamente; aviso de inatividade e **despedida ouvida**; 96,09 s, **11,9967 créditos** (conversão créditos → US$ não registrada [LACUNA]) |
| 27/11 | Decisão e implementação | DEC-077; PR "E2 simplificada" | Conexão direta; intenção pendente; reconciliação pós-chamada |

Correção registrada (README das evidências): o erro 404 ocorreu no exp. 2, não no exp. 3; versões anteriores deste documento o atribuíam ao exp. 3.

Custos totais dos experimentos E2-V: somatório não consolidado pelo operador [LACUNA]; ordem de grandeza por sessão: US$ 0,07–0,30.

---

## 3. Recursos nativos da Millis

| Recurso | Comprovado [REAL] | Só documentado [DOC] | Hipótese/lacuna |
| :- | :- | :- | :- |
| Raciocínio, STT, TTS, barge-in (`clear`) | ✓ (E0, exp. 1–5) | | |
| `agent_config` inline por sessão | ✓ com `gpt-4o` | modelos listados | modelo efetivo (DeepInfra no faturamento) [LACUNA] |
| Ferramenta webhook `method: POST` + cabeçalho | ✓ | | assinatura do fornecedor: nenhuma encontrada [LACUNA] |
| Método padrão da ferramenta sem `method` | ✓ **GET** (exp. 2) | | |
| `session_id` e parâmetros no corpo | ✓ | `exclude_session_id`, `include_metadata` | |
| `onfunction` (nome, parâmetros, resultado) no WebSocket | ✓ | | entrega/ordem garantidas [LACUNA] |
| Erro HTTP do webhook comunicado como falha | ✓ (500) | | 404 foi falado como "sem horários" (antes do contrato `result`) |
| `response_mode: strict` | ✓ **não** garante texto literal | `strict`/`flexible` | |
| `execute_after_message` + `messages` | ✓ executa após o TEXTO | "após a mensagem terminar de tocar" | entrega do áudio [LACUNA] |
| `flow.inactivity_handling` | ✓ aviso e retomada | `idle_time`, `message` | repetição do aviso [LACUNA] |
| `session_timeout.max_idle` | ✓ encerra; relatório com `call_status: "timeout"`; `onsessionended` chegou com `payload` vazio (sem status) | | no exp. 5 o fim (≈91,4 s) ficou a ≈14 s do último texto final do agente antes do aviso (≈77,4 s), sugerindo que o aviso de inatividade não reiniciou a contagem [HIP, 1 sessão, tempos do navegador] |
| `flow.agent_terminate_call` | | `enabled`, `instruction`, `messages` | comportamento real [LACUNA] |
| Relatório pós-chamada (`session_data_webhook`) | ✓ (exp. 5, sessão WebSocket no navegador) | histórico + `function_calls` | via telefonia direta, retentativas, atraso e entrega única [LACUNA] |
| Autenticação do relatório | ✓ só **token na query da URL** configurada | cabeçalhos no `session_data_webhook` (alegado por pesquisa, §8) | cabeçalho e assinatura **não comprovados** |
| `agent_config` ecoado no relatório | ✓ veio com `prompt` vazio e `tools: []` apesar de a ferramenta ter sido usada | | não serve como evidência da configuração efetiva |
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

Formas observadas nas exportações do navegador (`E2V_TIMELINES/EXP05.json`, anonimizadas; o exportador registra `data` e `payload` de cada mensagem):

```json
{"type":"ontranscript","data":{"data":"Quais horários estão disponíveis para uma reunião?","payload":{"is_final":true}}}
{"type":"onfunction","data":{"data":null,"payload":{"name":"e2v_consultar_agenda","params":{"preferencia":"sexta-feira","session_id":"provider-session-07"},"result":"{\"result\":\"TECHNICAL_ERROR\",…}"}}}
{"type":"onsessionended","data":{"data":null,"payload":{}}}
```

`onfunction` traz `session_id` injetado em `params` e o resultado como texto; `onsessionended` veio **sem** status (exp. 3, 4 e 5) — o status só aparece no relatório. Mensagem interrompida: `clear` seguido de `onresponsetext` final com o trecho parcial (`"Você ainda"`, exp. 5).

### 4.3 Relatório pós-chamada

[REAL, 1 amostra] Corpo JSON recebido por POST (exp. 5; [amostra anonimizada](../research/e2v/E2V_SESSION_REPORT_SAMPLE.anonymized.json)). Campos observados:

| Campo | Observado | Uso na VAP |
| :- | :- | :- |
| `chat[]` | `{role, content}`; `role` = `assistant` / `user` / `tool`; `assistant.tool_calls[] = {id, type:"function", function:{name, arguments}}` com `arguments` **em texto JSON**; `tool = {name, tool_call_id, content}` (resultado em texto). **Sem timestamp por mensagem, sem marca de interrupção, sem indicador de reprodução.** Contém mensagem parcial interrompida (`"Você ainda"`) e a mensagem de encerramento por inatividade | fonte das entradas |
| `function_calls[]` | `{name, params, result, run_after_call}`; `params` inclui `session_id` injetado | conferência cruzada |
| `session_id` | id da sessão no PROVEDOR | referência da chamada |
| `metadata` | eco do que o cliente enviou no `initiate` (incluía o id local da sessão) | **não** usado para vínculo |
| `call_id`, `agent_id` | `null` (sessão de navegador) | não usados |
| `call_status` / `error_message` | `"timeout"` / `null` | motivo de fim |
| `duration`, `ts`, `call_metrics/call_end_ts` | segundos; época em segundos | duração; momento do fim |
| `cost_breakdown[]`, `chars_used` | créditos por serviço (tts, stt, llm, millis); soma 11,9967 | não usados (conversão monetária [LACUNA]) |
| `agent_config` | eco **incompleto** (prompt vazio, `tools: []`) e com a URL do próprio webhook | ignorado; pode conter segredo da URL — nunca registrar |
| `voip`, `recording`, `call_analysis` | `{}` | não usados |

Exemplo anonimizado (trecho):

```json
{"chat":[
  {"role":"user","content":"Pode consultar pode consultar novamente para a sextafeira?"},
  {"role":"assistant","content":"Vou consultar a disponibilidade para sexta-feira agora mesmo.",
   "tool_calls":[{"id":"chatcmpl-tool-example-02","type":"function","function":{"name":"e2v_consultar_agenda","arguments":"{\"preferencia\": \"sexta-feira\"}"}}]},
  {"role":"tool","name":"e2v_consultar_agenda","tool_call_id":"chatcmpl-tool-example-02","content":"{\"result\":\"TECHNICAL_ERROR\",…}"}],
 "function_calls":[{"name":"e2v_consultar_agenda","params":{"preferencia":"sexta-feira","session_id":"provider-session-07"},"result":"…","run_after_call":false}],
 "session_id":"provider-session-07","call_id":null,"agent_id":null,"call_status":"timeout","duration":96.09}
```

**Ordem.** Comparando o `chat` com a linha do tempo do navegador do mesmo experimento (`EXP05.json`), a sequência de mensagens coincidiu uma a uma (falas finais do lead, textos finais do agente, chamadas de função). **Dentro** de uma mensagem do agente, porém, o texto e a execução da ferramenta não estão em ordem cronológica: na 1ª chamada o `onfunction` (≈17,6 s) veio ANTES do texto final "Vou verificar…" (≈20,4 s); na 3ª, depois (65,5 s → 67,7 s). A mensagem de encerramento por inatividade está no `chat` mas não apareceu como `onresponsetext`. Conclusão: o `chat` serve como ordem **entre** mensagens; não prova reprodução nem o instante de execução.

A VAP mantém a forma **normalizada e neutra** (`packages/contracts/src/scheduling/post-call-report.ts`): `ordering` (`TIMELINE`|`UNKNOWN`), `entries` (`LEAD`/`AGENT`/`TOOL_CALL`), `endReason`, `durationSeconds`.

### 4.4 Adaptador Millis → `PostCallReport` (`packages/integrations/src/millis/`, `PROVIDER-UNVERIFIED`)

| Regra | Decisão |
| :- | :- |
| Autenticação | `createMillisReportQueryTokenAuthenticator`: só o mecanismo observado — token no parâmetro `t` da URL (valor único; repetido = ausente), comparação em tempo constante, segredo ≥ 32 caracteres ou fail-closed (`NOT_CONFIGURED`). **Cabeçalhos são ignorados** (autenticação por cabeçalho do relatório não comprovada; assinatura não presumida). A rota passa ao autenticador só parâmetros de valor único e nunca os registra |
| Referência | `providerCallReference` = `session_id` do provedor. `metadata`, `call_id` e `agent_id` não identificam a tentativa; tenant e sessão continuam resolvidos só no servidor (`resolveByProviderReference` + `current_attempt_id`). Sem `session_id` ⇒ quarentena (sem evento) |
| Falas | `user` ⇒ `LEAD`; `assistant` ⇒ `AGENT`, texto como veio (parcial/interrompido incluído, **sem** marca inventada). Conteúdo vazio/nulo não vira fala |
| Ferramentas | `assistant.tool_calls` ⇒ `TOOL_CALL` logo após o texto da mesma mensagem; argumentos = JSON decodificado; nome mapeado por tabela opcional (nome publicado na Millis → nome VAP; sem mapa, o nome fica como veio e a avaliação não reconhece a chamada ⇒ revisão) |
| Resultados | mensagens `tool` **nunca** viram fala; só conferem o pareamento `tool_call_id`/nome |
| Conferência cruzada | `function_calls` deve repetir as chamadas do `chat` na mesma ordem, nome e argumentos (ignorando o `session_id` injetado, que deve ser o da sessão) |
| Integridade (auditoria #184 A3 e reauditoria) | `INCOMPLETE` quando uma fala pode ter sido perdida (texto truncado, > 500 entradas, mensagem fora do formato, argumentos ilegíveis, fala sem texto legível — `SPEECH_UNREADABLE`); separado da ordem. A fala cortada leva `truncated` e nunca sustenta opt-out |
| Ordem | `TIMELINE` só sem nenhum desvio; qualquer desvio (papel desconhecido, conteúdo não textual, resultado sem chamada, id repetido, argumentos inválidos, `function_calls` ausente/divergente/de outra sessão, texto > 4000, > 500 entradas) ⇒ `UNKNOWN` (nenhuma decisão dependente de ordem; revisão) |
| Fim | `error_message` ⇒ `ERROR`; `call_status: "timeout"` ⇒ `TIMEOUT_UNSPECIFIED` (nunca inatividade nem desinteresse, mesmo quando a última fala é a mensagem de inatividade); demais valores, inclusive os documentados e não observados (`user-ended`, `agent-ended`…) ⇒ `UNKNOWN` |
| Duração e momento | `duration` em [0, 86400] senão nulo; `call_metrics/call_end_ts` (ou `ts`) plausível, senão o instante de recebimento |
| Consentimento | o adaptador não cria evidência: frase do modelo (`leadConfirmation`) fica só nos argumentos; resultado da ferramenta não é fala; aceite só existe se a fala do lead estiver no `chat` |

O adaptador e o autenticador **não estão compostos** em produção: a fiação do provedor (inclusive a convivência com o canal de ferramentas, autenticado por cabeçalho) e o vínculo `session_id` do provedor ↔ `call_attempts.provider_reference` são da E3. Até lá um relatório real não resolve tentativa e é ignorado sem efeito (fail-closed). Testes: `millis-session-report-adapter.test.ts` (amostra real + adversariais) e `millis-report-query-token-authenticator.test.ts`.

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
| Relatório | autenticação por token na URL (fail-closed); adaptador conservador (§4.4); resolução da tentativa só no servidor; sessão validada e vinculada à tentativa (`current_attempt_id`); digest para idempotência; conflito ⇒ revisão; ausência (`REPORT_MISSING`) ou processamento interrompido (`REPORT_PROCESSING_INCOMPLETE`) ⇒ revisão após prazo |
| Multiempresa, idempotência, transação | contexto fixado da sessão; ordem global de travas K → L → C → O → A → S → I → R → P; chave de idempotência por intenção |

**Riscos residuais:** histórico é texto de STT/LLM e não prova áudio reproduzido nem compreensão; o motor pode citar mal um horário (regra conservadora manda para revisão); opt-out dito sem ferramenta só é registrado após a chamada; ferramentas autenticadas por cabeçalho estático e relatório por **token na URL** (único mecanismo comprovado; pode vazar em logs de intermediários; sem anti-replay — repetição absorvida pela idempotência); assinatura não encontrada; o adaptador se baseia em UMA amostra de sessão WebSocket de navegador (falta validar via telefonia direta, entrega, retentativa e atraso); o `chat` não traz timestamps nem marca de interrupção, então mensagens parciais não são distinguíveis.

**Critérios objetivos para adotar o Media Bridge:** (a) exigência regulatória/contratual de transcrição em tempo real ou de prova de reprodução; (b) no piloto supervisionado, qualquer opt-out falado não registrado pela ferramenta, ou reserva confirmada sem aceite no histórico, sem explicação; (c) relatório pós-chamada ausente/atrasado acima de 1% das chamadas ou sem conteúdo suficiente para a reconciliação; (d) taxa de revisão humana por evidência ambígua que torne a operação inviável.

---

## 8. Divergências e limitações registradas

### 8.1 Pesquisas × evidência real

| Tema | O que a pesquisa afirmou | Evidência real | Situação |
| :- | :- | :- | :- |
| Método padrão da ferramenta | Grok §4: "default aparentemente POST" | exp. 2: sem `method`, as chamadas chegaram por **GET** (404) | **Diverge** — sempre declarar `method: POST` |
| Autenticação do relatório | ChatGPT nativa §7.2: `session_data_webhook` como objeto `{url, headers}` com `Authorization` | configuração usada: `session_data_webhook` como **texto** (URL) com token na query; recebido assim no exp. 5. Cabeçalho não testado | **Não comprovado** — não presumir cabeçalho |
| Assinatura dos webhooks | ChatGPT nativa §7.3 "HMAC não localizada"; Antigravity §4.3 "não há assinatura HMAC nativa" | nada recebido indica assinatura | **Converge** (ausência) |
| Garantias do relatório | ChatGPT nativa §7.3: retries, entrega única, ordem entre webhooks e ids por evento não comprovados | 1 entrega observada; sem id de entrega | **Converge** — idempotência por digest mantida |
| Campos do relatório | ChatGPT nativa §7.2 (lista); Grok prática §5 (chat, function_calls, session_id, recording) | todos presentes; `call_id`/`agent_id` nulos; `recording` e `voip` vazios; `agent_config` incompleto | **Converge com ressalvas** |
| Motivos de fim | ChatGPT nativa §7.2: `user-ended`, `agent-ended`, `api-ended`, `timeout`, `error`… | só `timeout` observado; `onsessionended` sem status | Só `timeout` mapeado; resto `UNKNOWN` |
| `execute_after_message` | Antigravity §3: envio "só após a fala do aviso"; descrição oficial "after a predefined message is played"; ChatGPT prática §10.1: semântica não confirmada, não usar como autorização | exp. 4: execução após o TEXTO final (ordem não prova início da execução nem entrega do áudio); exp. 5 (sem a opção): execução antes e depois do texto | **Diverge da descrição oficial / converge com ChatGPT** — não é garantia |
| `response_mode: strict` | Antigravity §3: no esquema, sem garantia em execução; ChatGPT prática §10.2: não confirmado | exp. 4: **não** garante texto literal | **Converge** (não é controle) |
| Eventos no WebSocket nativo | Antigravity §3 e Grok §3: `ontranscript`, `onresponsetext`, `start_answering`, `clear`, `pause`/`unpause`; ChatGPT nativa §5.1: acessibilidade à VAP **no WSS direto** "não comprovada" | todos observados no WebSocket nativo (exp. 1–5), inclusive `onfunction`; nenhum teste no WSS direto da Twilio | **Converge**: existem no WebSocket nativo; no WSS direto a VAP não os recebe (premissa da DEC-077) |
| `onagentstate`, `playback_finished` | Antigravity §3 e ChatGPT prática: derivados no SDK, não do servidor | não recebidos do servidor | **Converge** |
| `is_final` | Antigravity §4.2: fim de bloco do STT, não de turno | exp. 5: um `is_final` por fala do lead, mas parciais repetidos antes | Sem contradição; nada da VAP depende disso |
| Eventos na conexão direta Twilio | Grok §3/§5 e ChatGPT nativa §6: a VAP não recebe `mark`/`clear` nem transcrições | não testado com Twilio na E2-V (todos os exp. em WebSocket de navegador) | **Premissa aceita** (DEC-077) |
| `mark` como prova de reprodução | ChatGPT nativa §6.3: `mark` não significa reprodução integral; `clear` pode devolver marks pendentes | não testado | Media Bridge/`mark` **não provam** compreensão nem reprodução integral (§7) |
| Relatório como autorização | ChatGPT prática §13: não autorizar retroativamente operação que precisava de autorização na conversa | DEC-077: a ferramenta só registra intenção; nenhuma operação é feita na conversa; a reserva é feita depois, com evidência do histórico e revisão em dúvida | **Tensão registrada** — o desenho não legitima operação já feita; a auditoria deve avaliar se a evidência textual basta |
| Opt-out nativo | Grok §2/§6: `do_not_call_detection` existe, comportamento requer teste | não testado | Não usado; opt-out da VAP mantido |
| Custos | Grok §8: US$ 0,02/min base + STT + LLM + TTS | exp. 5: 11,9967 créditos; conversão não registrada | [LACUNA] — confirmar no painel |

### 8.2 Limitações

- Modelo efetivo da sessão (configurado `gpt-4o`, faturado como `deepinfra`) e conversão de créditos: a confirmar com a Millis.
- Comportamento real de `agent_terminate_call` e repetição de `inactivity_handling`: não medidos.
- A despedida não ouvida no exp. 4 e ouvida no exp. 5: a correção do cliente do protótipo (parar só após a reprodução) é a explicação mais provável [HIP].
- A amostra do relatório é de sessão WebSocket no navegador e foi transcrita do registro apresentado pelo operador (não o JSONL bruto); faltam relatório via telefonia direta, entrega/retentativa/atraso e autenticação de produção.
- Nenhuma evidência (relatório, linha do tempo, `mark` futuro) prova compreensão humana.
