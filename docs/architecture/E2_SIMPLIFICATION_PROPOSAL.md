# E2 — Proposta de simplificação após a E2-V (Millis nativa)

Status: **ADOTADA (DEC-077) e implementada na PR "E2 simplificada"** (27/11/2026). Ajustes do operador em relação a esta proposta: a reserva NÃO acontece durante a chamada — só intenção pendente, efetivada na reconciliação pós-chamada; opt-out preventivo e barreira de novas tentativas até reconciliar. Documento central: [E2V_RESEARCH_AND_VALIDATION.md](E2V_RESEARCH_AND_VALIDATION.md). Texto original abaixo, preservado. Base: DEC-076; código da E2 em `cc68b9f` (PR #183, empilhada na #182, ambas sem merge); evidências da E2-V em `exp/e2v-millis-native` (`experiments/e2v-millis-native/FINDINGS.md`).

Classificação: **[REAL]** observado em experimento autorizado; **[DOC]** documentação oficial; **[HIP]** hipótese; **[LACUNA]** não confirmado.

## 1. Evidências que mudam o desenho

| Tema | Classe | Consequência |
| :- | :- | :- |
| Millis conduz o diálogo (raciocínio, STT, TTS, barge-in) com qualidade aprovada (E0) | REAL | VAP não precisa de motor conversacional próprio |
| Ferramentas: webhook **POST** autenticado por cabeçalho, com `session_id` e parâmetros comerciais | REAL | Ponto de autoridade da VAP = **execução da ferramenta** |
| HTTP 500 comunicado corretamente como falha técnica; 404 (antes) virou "sem horários" | REAL | Contrato de resultado explícito (`AVAILABLE`/`NO_AVAILABILITY`/`TECHNICAL_ERROR`) é obrigatório |
| `response_mode: strict` **não** garante reprodução literal | REAL | Nenhum controle pode depender de o agente "ler" um texto exato |
| `execute_after_message`: texto final 13:57:44.897Z → requisição 45.143Z → HTTP 200 45.144Z → `onfunction` 45.323Z | REAL | Ordena a execução após o TEXTO; **não prova entrega integral do áudio** |
| Inatividade nativa: aviso, retomada e encerramento funcionaram; despedida não ouvida | REAL | Usar recurso nativo; despedida: investigar corte no cliente do protótipo [HIP] |
| Eventos `ontranscript`, `onresponsetext`, `onfunction`, `clear`, `pause`, `unpause`, `timestamp` | REAL | Existem **só para quem mantém o WebSocket nativo** (cliente/bridge), não para a VAP na conexão direta |
| Relatório pós-chamada (`session_data_webhook`: histórico e chamadas de função) | DOC | Insumo de auditoria pós-chamada; **não validado** |
| Indisponibilidade, `error_200`, timeout da ferramenta | LACUNA | Validar antes do piloto |
| Modelo efetivo (config `gpt-4o` × faturamento DeepInfra) | LACUNA | Travar e confirmar com a Millis |

## 2. Conexão direta Twilio–Millis × Media Bridge nativo

| Critério | Direta (`<Connect><Stream>` → Millis, E0) | Media Bridge (Twilio ↔ VAP ↔ WebSocket nativo) |
| :- | :- | :- |
| O que a VAP observa | status da Twilio, webhooks de ferramenta [REAL], relatório pós-chamada [DOC] | + transcrições, respostas, `onfunction`, `clear`/`pause` em tempo real [REAL no WS]; + confirmação de reprodução da Twilio (`mark`) [DOC Twilio, não validado] |
| Prova de áudio entregue | impossível | possível (único caminho) |
| Opt-out detectado durante a chamada pela VAP | não (depende da ferramenta) | sim (classificador da PR 1 sobre `ontranscript` final) |
| Latência (25% do critério DEC-044) | menor (1 salto, comprovada) | + 1 salto e conversão de áudio (μ-law 8 kHz ↔ PCM 16 kHz; formato aceito pelo WS nativo: LACUNA) |
| Operação | nada novo | serviço WSS público 24/7, escala, failover, barge-in repassado (`clear` → Twilio) |
| Risco de reconstruir o que a Millis faz | nenhum | baixo se só repassar áudio e observar; alto se tentar controlar turnos |

**Recomendação:** **conexão direta** para a E2 simplificada e o piloto supervisionado; as proteções ficam na execução das ferramentas e na auditoria pós-chamada. **Media Bridge só por gatilho objetivo**: (a) exigência regulatória/contratual de transcrição em tempo real ou de prova de reprodução; (b) no piloto, opt-out falado não registrado pela ferramenta ou reserva sem confirmação no histórico acima de zero casos não explicados; (c) a Millis não entregar relatório pós-chamada confiável. Nesse caso, bridge mínimo (repasse de áudio + observação), sem controlar turnos.

## 3. Como as proteções obrigatórias ficam (conexão direta)

| Proteção | Mecanismo proposto | Reaproveita |
| :- | :- | :- |
| **Confirmação segura de reserva** | `confirm_offer(offer_id, lead_confirmation)`: só oferta emitida pelo servidor **nesta sessão**, da lista vigente, não expirada; `lead_confirmation` (frase do interlocutor) classificada pelo classificador determinístico da PR 1 como aceite; reserva transacional; resposta com o texto do servidor ligado à reunião **verificada** | offers/offer-steps (A5), booking, booking-hooks, booking-verify, `classifyLeadReply`, `renderBookedSpeech` |
| **Consentimento** (residual: o modelo pode citar uma frase não dita) | auditoria pós-chamada: reserva sem aceite do usuário no histórico após a releitura ⇒ reunião marcada para revisão do operador (sem cancelamento automático na 1ª versão) | classificador da PR 1 |
| **Opt-out** | ferramenta `lead.record_opt_out(lead_phrase)` **sempre** registra a supressão canônica (fail-safe; a frase vai para auditoria) + varredura pós-chamada do histórico registra a supressão que faltar (origem `POST_CALL`); reunião preservada; DNC | `recordCanonicalOptOut`, `recordLeadOptOut` (E1), supressão de telefone, classificador de opt-out da PR 1 |
| **CALL_OUTCOME** | só com interlocução comprovada (ferramenta chamada na sessão ou fala do usuário no relatório); fim por `timeout` **não** é desinteresse e **não** é automaticamente inatividade (distinguir `max_idle`, `max_duration`, falha) | matriz D5, `lead-tools` |
| **Isolamento multiempresa** | contexto da sessão fixado (0015) + credencial por tentativa no cabeçalho (DEC-073 Opção A) + pipeline de webhook com resposta uniforme para chamada desconhecida/de outro tenant | scope/resolver/pin, `provider-tool-invocation.ts` |
| **Idempotência e integridade** | inalteradas: trava K e ordem K → L → C → O → A → S → P; guarda temporal final; repetição devolve o mesmo resultado | E1 + hooks da E2 |

## 4. Revisão da implementação (cc68b9f)

**Reaproveitar sem mudança**
- PR 1 (main): contexto de sessão (0015, `scheduling-session-context*`), política D1, geração de horários, `zoned-wall-time`, classificador `lead-reply-*` (passa a classificar frases citadas e o histórico pós-chamada), `lead-status` e matriz.
- E1: `meeting-booking-*`, cancelamento, `contact-suppression-repository`, `lead-opt-out`, `send-time-suppression-guard`.
- E2: `agent-scheduling-publication-guard`, `scheduling-toolset-publication`, `scheduling-agent-scope`, `scheduling-agent-offers`/`-offer-steps` (incl. A5), `scheduling-agent-booking-hooks`, `scheduling-agent-booking-verify`, `scheduling-agent-opt-out`, `scheduling-agent-lead-tools` (D5), `scheduling-speech` (textos do resultado), `provider-webhook-*` (API).

**Simplificar**
- Redutor `booking-protocol`: fases → `IDLE`, `OFFERED`, `BOOKING`, `BOOKED`, `OPTED_OUT`, `CLOSED` (saem `PRESENTING`, `READBACK_*`, `AWAITING_*`, `AUTHORIZED`); `booking-protocol-interventions` mantém só `QUERY_EMPTY`/lista.
- `scheduling-agent-port`/`lead-agent-port`: sem métodos de fala, turno e `authorizeOutput`; `confirm_offer` e `record_opt_out` recebem a frase do interlocutor.
- `scheduling-agent-booking`: autorização por evento de fala → verificação de oferta vigente + aceite classificado.
- Migrations (nunca aplicadas fora de bancos descartáveis): **0016** sem `lead_speech_started_seq`; **0017** só `CALL_OUTCOME` + `opt_out_recorded_at`/`opt_out_source` (`TOOL`, `POST_CALL`, `RECOVERY`).
- `apps/voice/scheduling-agent-tools`, `lead-agent-tools`: definição no esquema `Function` da Millis (`method: POST`, cabeçalho de credencial, `params`, `timeout`, contrato `result`).

**Remover**
- `scheduling-agent-speech.ts`, `scheduling-agent-utterance.ts`, `scheduling-agent-clarification.ts`, parte de fala/turno de `scheduling-agent-events.ts`, `scheduling-agent-output.ts` (+ contrato), `booking-claim-filter.ts`, `offline-commercial-simulation.ts`/`offline-simulation-outputs.ts`; colunas de turno e de pergunta de opt-out; testes correspondentes (substituídos por testes no nível da ferramenta e do webhook).
- Justificativa: não há, na conexão direta, evento que os alimente; `strict` e `execute_after_message` também não dão a garantia que eles exigiam. Mantê-los seria controle sem insumo.

**Acrescentar (mínimo)**
- Gerador de `agent_config` a partir da versão publicada: ferramentas com credencial da tentativa, `inactivity_handling` + `session_timeout`, `agent_terminate_call` (encerrar só com despedida/pedido), timeouts com contrato `TECHNICAL_ERROR`.
- Receptor do relatório pós-chamada (opt-out faltante, auditoria de reserva, desfecho por evidência) — **depende de validação real do payload**.

## 5. Riscos residuais

- Frase de aceite fabricada pelo modelo: mitigada por auditoria pós-chamada e piloto supervisionado; eliminada só com Media Bridge.
- Opt-out falado e não registrado durante a chamada: janela até o fim da chamada; supressão pós-chamada antes de qualquer nova tentativa.
- Autenticação do webhook por cabeçalho estático do agente: credencial por tentativa, expiração e revogação (DEC-073).
- Entrega/ordem dos webhooks não garantidas: idempotência existente.

## 6. Plano agrupado (sem ciclos intermediários)

1. **Decisões do operador** (uma rodada): D-ARCH (direta agora, bridge por gatilho), D-OPTOUT-TOOL (supressão sempre, frase auditada), D-CONFIRM (aceite classificado + revisão pós-chamada, sem cancelamento automático), D-POSTCALL (relatório pós-chamada obrigatório para o piloto).
2. **E2-V final — 1 sessão curta real** (com o protótipo): indisponibilidade, `error_200`, timeout da ferramenta, despedida após correção do cliente e **payload do relatório pós-chamada**. ≈ 2–3 min, ≈ US$ 0,30–0,60.
3. **PR única "E2 simplificada"** a partir de `cc68b9f`, substituindo #182/#183: remoções e simplificações da §4, gerador de `agent_config`, contrato `result`; migrations 0016/0017 regeneradas. Um gate Linux, **uma** auditoria independente consolidada e um gate Windows.
4. Receptor pós-chamada na mesma PR se o passo 2 confirmar o payload; senão, PR seguinte pequena.

Sem E3, merge ou produção até as decisões e a auditoria.
