# E2-V — Evidências consolidadas e proposta de simplificação da E2

Data: 27/11/2026. Branch `exp/e2v-millis-native`. Classificação: **[DOC]** documentação oficial da Millis (esquema `AgentConfig`/`Function` da API de agentes, docs.millis.ai, consultado em 27/11/2026); **[REAL]** observado nos experimentos reais autorizados; **[HIP]** hipótese ainda não comprovada; **[LACUNA]** contrato não confirmado.

## 1. Evidências

| # | Tema | Classe | Evidência |
| :- | :- | :- | :- |
| 1 | WebSocket nativo `wss://api-west.millis.ai:8080/millis` com raciocínio, STT e TTS da Millis | REAL | 3 rodadas de sessões pelo SDK oficial 1.0.12 |
| 2 | Eventos de transporte: `ontranscript` (parcial/final), `onresponsetext`, `start_answering`, `clear`, `pause`, `unpause`, `timestamp` (por caractere), `onsessionended` | REAL | 1º experimento |
| 3 | `onfunction` com nome, parâmetros e resultado da ferramenta | REAL | 3º experimento; forma exata do payload ainda **LACUNA** (o correlacionador aceita variações) |
| 4 | `agent_config` inline aceito com `llm.model = gpt-4o`; `azure_gpt-5.6-luna` rejeitado | REAL | 2º experimento. A doc lista modelos como `gpt-4o`, `gpt-4.1`, `gpt-5-mini`, `gpt-5.6` [DOC] |
| 5 | Modelo efetivamente executado | LACUNA | Config registra `gpt-4o`; o faturamento identifica DeepInfra |
| 6 | Painel mostra prompt e tools vazios para sessão inline, apesar da execução | REAL | Painel não é fonte de verdade da configuração inline |
| 7 | Ferramenta: `method`, `header`, `params`, `response_mode` (`strict`/`flexible`), `execute_after_message`, `messages`, `timeout`, `run_after_call`, `exclude_session_id`, `include_metadata` | DOC | Esquema `Function` |
| 8 | Sem `method` a Millis chamou via **GET**; com `method: "POST"` chamou via POST | REAL | 2º e 3º experimentos |
| 9 | Cabeçalho `x-e2v-token` repassado; 2 respostas HTTP 200; `session_id` e parâmetros comerciais recebidos | REAL | 3º experimento |
| 10 | Horários interpretados corretamente; proibição de confirmar reserva respeitada | REAL | 3º experimento (amostra pequena) |
| 11 | HTTP 404 falado como "sem horários" | REAL | Risco comercial; corrigido na descrição/retornos (ainda **HIP** que a Millis repassa o corpo de erros ao LLM — cenários `error` e `error_200`) |
| 12 | `session_timeout.max_idle` encerra com status `timeout` | REAL+DOC | ≈ 20 s após o último `idle` com `max_idle: 20` |
| 13 | `flow.inactivity_handling = { idle_time, message }`; `flow.agent_terminate_call = { enabled, instruction, messages }` | DOC | Comportamento real ainda **LACUNA** (repetição do aviso; se a fala do agente reinicia `max_idle`) |
| 14 | Custo: 96 s, 855 caracteres, US$ 0,2987 (TTS US$ 0,2565); voz ElevenLabs Alcione com tarifa 3× | REAL | Faturamento |

## 2. Implementado nesta rodada (offline)

- **Inatividade nativa**: `inactivity_handling { idle_time: 7, "Você ainda está aí?" }` + `session_timeout.max_idle = 14` (7 + 7) com despedida + `agent_terminate_call` instruído a encerrar só com despedida/pedido, **nunca por silêncio**. Fim por `timeout` é classificado como **INATIVIDADE**, sem resultado comercial (`tools/correlate.mjs`).
- **Desfechos da agenda inequívocos**: `result` = `AVAILABLE` | `NO_AVAILABILITY` | `TECHNICAL_ERROR` em todos os cenários (inclusive `error_200`: falha com HTTP 200) e descrição da ferramenta proibindo afirmar indisponibilidade em falha.
- **`onfunction`** reconhecido e correlacionado ao webhook por evidência (`PARAMS_AND_RESULT` > `PARAMS` > `RESULT` > `TIME_ONLY`/`NONE`), sem presumir entrega nem turno.
- **`strict`/`flexible`, `execute_after_message`, `messages`, `timeout`** configuráveis; `execute_after_message` exige mensagem predefinida (doc).
- **Interface**: ajustes aplicados **antes** da validação final (o `voice_id` pode vir só do campo).
- **Registros**: remoção por nome de chave, de todos os valores de `header(s)` e dos valores secretos conhecidos em qualquer texto (erros, query, eco do fornecedor, exportação).

## 3. Proposta de simplificação da E2 (versão inicial — substituída)

> Substituída pela proposta revisada da 4ª rodada: `docs/architecture/E2_SIMPLIFICATION_PROPOSAL.md` na branch da PR #183 (resumo na §6).

Premissa (DEC-076): a Millis conduz o diálogo; a VAP é autoridade sobre dados, autorização, agenda, supressão e isolamento. Na integração real (Twilio → Millis), a VAP **não recebe** transcrições, turnos nem eventos de fala — só chamadas de ferramenta (webhook) e, se configurado, o relatório pós-chamada. Controles que dependem desses eventos não têm insumo em produção.

**Manter (autoridade da VAP, independente do motor conversacional)**
- Contexto confiável da sessão vinculado à concessão; isolamento multiempresa; ferramentas por concessão publicada.
- Reserva transacional: idempotência, travas K → L → C → O → A → S → P, verificação da reunião, política D1 de agenda.
- Oferta com revisão e expiração; confirmação só de oferta emitida pelo servidor nesta sessão; invalidação de lista vazia/recusada (A5); supressão revalidada antes de devolver cache.
- Opt-out/DNC canônico e supressão de telefone; reunião preservada; `CALL_OUTCOME` com a matriz D5 (sem sair de DNC/MEETING_SCHEDULED).
- Anúncio de reserva vinculado à reunião verificada **como texto do resultado da ferramenta** (a Millis fala o que a ferramenta devolve).

**Substituir por recurso nativo da Millis**
- Rastreamento de fala (`SPEECH_*`, gerações, turnos do transporte, `AGENT_SPEECH_STARTED`) e entrega da releitura → `execute_after_message` + `messages` (releitura predefinida) e `response_mode: strict` (resposta fiel ao resultado) — **após** comprovação no próximo experimento.
- Detecção de opt-out pela classificação de cada fala no servidor → ferramenta `lead.record_opt_out` chamada pela Millis + **varredura pós-chamada** do histórico (`session_data_webhook`, `chat`/`function_calls` [DOC]) como rede de segurança que registra a supressão canônica.
- Evidência de interlocução (A7, `lead_final_utterances`) → chamada de ferramenta na sessão e/ou mensagens do usuário no relatório pós-chamada.
- Inatividade e encerramento → `inactivity_handling`, `session_timeout`, `agent_terminate_call`.

**Remover (antes do merge, pois #182/#183 ainda não estão integradas)**
- `authorizeOutput`, filtro lexical de afirmações e o simulador de transporte de fala (não há caminho de saída do modelo controlado pela VAP na arquitetura nativa).
- Colunas de turno/fala da migration 0017 (`lead_turn_id`, `last_final_turn_id`, `lead_final_utterances`, `lead_speech_started_seq`, geração/entrega da pergunta de opt-out) e os eventos correspondentes do redutor — a 0017 volta a ser só `CALL_OUTCOME` + registro canônico de opt-out.

**Riscos e mitigação**
- **Consentimento sem prova de turno**: a confirmação passa a depender do LLM chamar `confirm_offer` só após um "sim". Mitigar: confirmação exige `offer_id` emitido nesta sessão + parâmetro com a frase do interlocutor; `execute_after_message`/`strict` se comprovados; auditoria pós-chamada que sinaliza reserva sem confirmação no histórico; piloto supervisionado.
- **Opt-out perdido durante a chamada**: rede de segurança pós-chamada; prompt; supressão idempotente. Janela residual até o fim da chamada.
- **Entrega/ordem de webhooks não garantidas**: idempotência e travas já existentes; timeouts curtos com desfecho `TECHNICAL_ERROR` explícito.
- **Autenticação do webhook**: só cabeçalho estático (assinatura da Millis não verificada) — token por tentativa (DEC-073 Opção A) e rotação.
- **Modelo efetivo e custo** (DeepInfra × `gpt-4o`; voz 3×): validar com a Millis antes do piloto; travar modelo e voz por agente publicado.

## 4. Próximo experimento real (proposto; exige autorização)

Agrupado para minimizar sessões e TTS (voz ElevenLabs de tarifa padrão, não Alcione; `gpt-4o`; `max_duration` 150 s):

| Sessão | Conteúdo | Duração |
| :- | :- | :- |
| A — inatividade + falhas (flexível, padrão) | falar → 7 s de silêncio (aviso?) → responder (reinicia?) → pedir horários com webhook em `error` → trocar para `error_200` e pedir outro dia → trocar para `timeout` (webhook 15 s, ferramenta `timeout: 5`) e pedir de novo → silêncio até o encerramento (14 s ou 21 s?) | ≈ 2,5 min |
| B — `response_mode: strict` | `success` e depois `unavailable` | ≈ 1 min |
| C — `execute_after_message: true` + mensagem "Um momento, vou consultar." | `success` | ≈ 1 min |

Total ≈ 4,5–5 min de conversa; operador ≈ 30–40 min. Custo estimado: ≈ US$ 0,40–0,60 com voz de tarifa padrão (≈ US$ 0,08/min, derivado do teste de 96 s com TTS a 1/3); ≈ US$ 1,00 se repetir a Alcione. Teto prudente US$ 2. Túnel rápido sem custo; sem Twilio. Incertezas: modelo efetivo/tarifa do LLM; retentativas da Millis em erro/timeout; repetição do aviso de inatividade.

## 5. 4º experimento real (27/11/2026) — resultados

| Item | Classe | Resultado |
| :- | :- | :- |
| Webhook POST autenticado com `session_id` e parâmetros comerciais | REAL | Confirmado novamente |
| Inatividade nativa (`inactivity_handling` + `max_idle`) | REAL | Aviso, retomada e encerramento funcionaram; **despedida não ouvida** |
| HTTP 500 | REAL | Agente informou corretamente falha técnica |
| `response_mode: strict` | REAL | O agente continua elaborando as próprias respostas; **não** garante reprodução literal |
| `execute_after_message` | REAL | Texto final 13:57:44.897Z → requisição 13:57:45.143Z → HTTP 200 13:57:45.144Z → `onfunction` 13:57:45.323Z: ordena a execução após o TEXTO; **não comprova entrega integral do áudio** |
| Indisponibilidade, `error_200`, timeout da ferramenta | LACUNA | Sem validação real |

**Correções offline desta rodada**
- **Timeout ≠ inatividade**: `correlate` classifica o fim `timeout` por evidência — `MAX_DURATION` (duração ≥ `max_duration`), `INACTIVITY_TIMEOUT` (intervalo desde a última fala do usuário ≥ `max_idle`, com indicação de aviso observado) ou `TIMEOUT_UNCLASSIFIED`; timeout da **ferramenta** (`aborted` no webhook) é listado à parte (`tool_timeouts`). Nenhum é resultado comercial.
- **Despedida não ouvida** [HIP]: a página parava o áudio no instante do `onsessionended`, cortando a fila de reprodução. Agora aguarda o estado `idle` do SDK (fim da reprodução) ou 6 s; o registro mostra se chegou áudio depois do fim. Limite: se a Millis fechar o socket logo após enviar o áudio, o próprio SDK 1.0.12 para o áudio ao fechar (não alterável sem reescrever o SDK). Na conexão telefônica direta o comportamento pode diferir.
- **Relatório pós-chamada** pronto para captura: rota `POST /session/e2v-report` (token no cabeçalho ou em `?t=`, pois cabeçalhos para `session_data_webhook` não estão documentados [LACUNA]; corpo até 512 KB; registrado sem o token) e opção na página.
- Testes: **40 aprovados**.

## 6. Proposta revisada (resumo)

Conexão **direta** Twilio–Millis para a E2 simplificada e o piloto; proteções da VAP na **execução das ferramentas** (oferta emitida nesta sessão + aceite citado classificado pelo classificador da PR 1 + reserva transacional verificada) e na **auditoria pós-chamada** (opt-out faltante, reserva sem aceite no histórico); **Media Bridge** só por gatilho objetivo (transcrição exigida, falhas não explicadas no piloto, relatório pós-chamada indisponível). Detalhes, revisão arquivo a arquivo e plano agrupado: `docs/architecture/E2_SIMPLIFICATION_PROPOSAL.md` (PR #183).

**Próxima sessão real (uma, ≈ 2–3 min):** `unavailable`, `error_200`, timeout da ferramenta (`timeout: 5`, webhook 15 s), despedida com o cliente corrigido e captura do **relatório pós-chamada** (`session_data_webhook`).

## 7. 5º experimento real (final, 27/11/2026) e encerramento da E2-V

| Item | Classe | Resultado |
| :- | :- | :- |
| Relatório pós-chamada (`session_data_webhook`) | REAL | Recebido por POST com histórico por interlocutor, `function_calls`, `session_id`, metadados, duração, status e custos por serviço |
| Indisponibilidade, `error_200`, timeout da ferramenta | REAL | Tratados corretamente (nenhuma falha falada como "sem horários") |
| Inatividade nativa | REAL | Aviso e **despedida ouvidos** pelo operador (após a correção do cliente da 4ª rodada) |
| Consumo | REAL | 96,09 s; 11,9967 créditos |

**Encerramento:** experimentos E2-V concluídos. A arquitetura decidida (DEC-077: conexão direta, intenção pendente, reconciliação pós-chamada) e o histórico completo estão no documento central `docs/architecture/E2V_RESEARCH_AND_VALIDATION.md` (PR "E2 simplificada"). Pendente do operador: amostra anonimizada do relatório real e exportações das linhas do tempo, para o adaptador do provedor.
