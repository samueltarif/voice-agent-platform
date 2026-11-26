# E2 — Agendamento pelo agente: protocolo, contexto e autorização (DEC-075)

> Estado: **PR 1 em revisão** (contratos, contexto, política D1, fundamentos da autorização e máquina de estados). **PR 2 e PR 3 NÃO iniciadas.** Nenhuma ferramenta operacional, rota ou composição de produção. Tudo offline.
> Base: main `05d0252f2c0d56ac45abdc5d80338f4f3b75db18` (E0 e E1 integradas).

## 1. Objetivo e divisão aprovada

O agente, numa chamada (simulada offline nesta etapa), poderá consultar e oferecer horários, vincular a confirmação explícita à oferta correta, agendar, registrar o resultado comercial e o opt-out — sempre pelos serviços canônicos da E1 e pelo motor de ferramentas existente (`ToolExecutionEngine` + `PublishedToolGrant`).

| PR | Escopo | Estado |
| :--- | :--- | :--- |
| **PR 1** | Contexto sessão–tentativa–tenant–lead–agenda, D1, fundamentos da autorização, precedência do opt-out, contratos de eventos e estados, máquina de estados, projeto de persistência e fronteiras transacionais | **esta PR** |
| PR 2 | Oferta, confirmação, reserva, persistência do estado, atomicidade, replay, controle da fala transacional | não autorizada |
| PR 3 | Opt-out operacional, `CALL_OUTCOME`, simulação offline integrada | não autorizada |

## 2. Decisões aprovadas (D1–D5) e como a PR 1 as trata

| Decisão | Regra | PR 1 |
| :--- | :--- | :--- |
| **D1 Agenda** | Campanha → versão publicada → padrão explícito da empresa; só a **ausência** permite fallback; explícita inválida/excluída/de outro tenant **bloqueia**; agenda, origem e versão **fixadas** na sessão; sem agenda, opt-out preservado | **Implementada**: `outbound_campaigns.scheduling_calendar_id` (FK composta por tenant, `RESTRICT`), `scheduling_calendars.is_organization_default` (no máximo uma por empresa), bloco opcional `scheduling.calendarId` no snapshot v1, resolução em `scheduling-calendar-resolution.ts` e fixação em `scheduling_session_contexts` |
| **D2 Opt-out** | Capacidade de segurança obrigatória, independente do toolset; reconhecido **antes** do modelo; não depende de o LLM chamar ferramenta | **Precedência definida e testada** no protocolo e no classificador; contexto `BOUND` sempre expõe `optOut.available`, mesmo sem agenda e com sessão encerrada. Gravação operacional = PR 3 |
| **D3 Ofertas** | Até 3 opções; TTL 15 min, limitado por sessão, autorização e conjunto vigente; nova consulta genuína invalida a anterior; retry técnico preserva ids, ordem e TTL; oferecer não reserva | Contratos (`MAX_OFFERS_PER_LIST`, `OFFER_TTL_MINUTES`, revisão + `queryKey`, `RETRY_SAME_LIST`/`STALE_LIST`); emissão real = PR 2 |
| **D4 Simulação** | Só offline: testes e futura superfície interna protegida, permissão específica de escrita; UI = E3 | Sem superfície nesta PR |
| **D5 `CALL_OUTCOME`** | Nova origem para resultados do agente; preserva `DO_NOT_CALL`, supressão e `MEETING_SCHEDULED`; sem resposta/falha técnica ≠ `NOT_INTERESTED` | Registrada; implementação = PR 3 |

## 3. Ajustes obrigatórios do Codex

| Ajuste | Tratamento |
| :--- | :--- |
| **A1** `speak` não prova entrega | Apresentação e releitura só valem com o evento **explícito** `SPEECH_COMPLETED` da geração vigente; `SPEECH_INTERRUPTED` obriga a falar de novo, inteiro |
| **A2** Ordinal isolado não identifica oferta | Toda lista tem `revision` monotônica + `queryKey`; o ordinal só é resolvido contra a lista **vigente**, depois da entrega completa dela |
| **A3** Concessão legítima ≠ sessão ativa | A concessão só fornece identidade; o servidor exige sessão `ACTIVE` e tentativa vinculada nos dois sentidos antes de qualquer capacidade de agendamento |
| **A4** Autorização e reserva sem commits independentes | Desenho de unidade de trabalho única (§6); autorização de **uso único** no protocolo; implementação = PR 2 |
| **A5** `SUCCESS` do motor ≠ reunião | Sucesso só com `BOOKED`/`REPLAYED` **e** reunião conferida para a **mesma** oferta (`BOOKING_RESULT.verifiedMeeting`) |
| **M1** Agenda e versão fixadas | Linha por sessão em `scheduling_session_contexts`; versão da sessão (`call_sessions.agent_version_id`) é a única considerada; concessão com outra versão é recusada |
| **M2** Resultado automático ≠ alteração manual | Origem própria `CALL_OUTCOME` (PR 3); nenhuma escrita comercial do agente nesta PR |

## 4. Contexto confiável (implementado)

Cadeia, resolvida só no servidor (`DrizzleSchedulingSessionContextResolver`):

`PublishedToolGrant` (registro privado `WeakSet`, snapshot e toolset congelados) → `callId` = `call_sessions.id` → `call_sessions.current_attempt_id` → `call_attempts` com `call_session_id` apontando **de volta** (mesmo tenant, mesma versão) → `outbound_call_jobs.destination_phone` → contato (telefone único por empresa) → lead → agenda (D1, fixada).

- Identidades nunca confundidas: `sessionId` (= `callId`), `attemptId`, `jobId`; a referência do provedor não participa.
- `REFUSED`: sessão inexistente ou de outro tenant, agente ou versão diferentes, tentativa sem vínculo de volta, tentativa em estado sem chamada.
- `BOUND`: vínculo verificado ⇒ **opt-out disponível**. Agendamento só com sessão `ACTIVE`, lead do destino e agenda `RESOLVED`; senão `UNAVAILABLE` com motivo.
- Porta única no runtime de voz: `resolveSchedulingContextForGrant` (`apps/voice`) — concessão copiada, JSON ou fabricada lança erro antes de consultar; agenda vinda da versão publicada precisa coincidir com o snapshot congelado na concessão.
- Snapshots antigos (sem `scheduling`) continuam válidos e caem para o padrão da empresa ou para `ABSENT`.

**Limite registrado:** hoje o `CallLifecycleGateway` gera o `callId` sozinho; a montagem que faz o `callId` coincidir com a sessão durável pertence à E4/E5. Os testes provam a cadeia com a sessão durável criada com o `callId` da concessão.

## 5. Máquina de estados controlada pelo servidor (implementada, pura)

Eventos só do servidor/transporte, com `seq` monotônico por sessão atribuído pelo servidor. Texto, booleanos, ordinais, ids de turno ou afirmações do modelo **não são eventos**. A intenção do interlocutor vem de `classifyLeadReply` (pt-BR, conservador, frase inteira; ambiguidade ⇒ esclarecimento).

| Fase | Evento aceito | Próxima fase | Diretiva |
| :--- | :--- | :--- | :--- |
| `IDLE` | `OFFER_LIST_ISSUED` (revisão nova, 1–3 ofertas) | `PRESENTING` | `PRESENT_LIST` |
| `PRESENTING` | `SPEECH_STARTED` (PRESENTATION, lista vigente) / `SPEECH_COMPLETED` da mesma geração | `AWAITING_SELECTION` | — |
| `PRESENTING` | `SPEECH_INTERRUPTED` da geração | `PRESENTING` | `PRESENT_LIST` |
| `AWAITING_SELECTION` | fala que **começou depois** da entrega: `SELECT k` válido (ou `AFFIRM` com uma única opção) | `READBACK_PENDING` | `READ_BACK(oferta exata)` |
| `AWAITING_SELECTION` | `NEGATE` / `TIME_CHANGE` | `IDLE` | `REQUEST_NEW_LIST` |
| `READBACK_PENDING` | `SPEECH_STARTED` (READBACK da oferta selecionada, lista vigente) | `READBACK_SPEAKING` | — |
| `READBACK_SPEAKING` | `SPEECH_COMPLETED` da geração | `AWAITING_CONFIRMATION` | — |
| `READBACK_SPEAKING` | `SPEECH_INTERRUPTED` | `READBACK_PENDING` | `READ_BACK` |
| `AWAITING_CONFIRMATION` | fala que começou depois da releitura: `AFFIRM`, oferta não vencida | `AUTHORIZED` | `BOOK(autorização de uso único)` |
| `AWAITING_CONFIRMATION` | `SELECT j` / `NEGATE` / `TIME_CHANGE` | `READBACK_PENDING` / `AWAITING_SELECTION` / `IDLE` | `READ_BACK` / `ASK_CLARIFICATION` / `REQUEST_NEW_LIST` |
| `AUTHORIZED` | `AUTHORIZATION_CONSUMED` (mesmo id, uma vez, antes de vencer) | `BOOKING` | — |
| `BOOKING` | `BOOKING_RESULT` `BOOKED`/`REPLAYED` + reunião conferida da mesma oferta | `BOOKED` | `ANNOUNCE_BOOKED` |
| `BOOKING` | qualquer outro resultado | `IDLE` | `ANNOUNCE_NOT_BOOKED`, `REQUEST_NEW_LIST` |
| qualquer não terminal | fala `OPT_OUT` (sem exigência temporal) | `OPTED_OUT` | `RECORD_OPT_OUT` (autorização anulada) |
| `BOOKED` | fala `OPT_OUT` | `OPTED_OUT` | `RECORD_OPT_OUT` (reunião preservada, E1) |
| qualquer | `SESSION_CLOSED` | `CLOSED` | — (tudo anulado) |

Também: `AMBIGUOUS`/`SILENCE` ⇒ `ASK_CLARIFICATION` (após 2, nova lista); `CLOCK` com a oferta relevante vencida ⇒ `IDLE`; evento repetido/fora de ordem ⇒ ignorado sem mudança; geração antiga ⇒ `STALE_GENERATION`; lista antiga ⇒ `STALE_LIST`; retry técnico da mesma consulta ⇒ `RETRY_SAME_LIST` (lista preservada); nova lista durante `BOOKING` ⇒ ignorada.

## 6. Travas, atomicidade e persistência (projeto para a PR 2; PR 1 sem efeitos)

- **Ordem global (E1) estendida:** K → L → M → C → O → A → **S** → P, com S = trava da sessão (`call_sessions` `FOR SHARE` + linha de estado do protocolo `FOR UPDATE`). Compatível com a ordem existente tentativa → sessão (`checkSessionBinding`, `createInTx`: A `FOR UPDATE` → S `FOR UPDATE`): S sempre depois de A; P continua a última.
- **Unidade de trabalho única (A4):** na PR 2 o serviço canônico de reserva da E1 passa a aceitar o executor da transação; consumir a autorização (transição `AUTHORIZED → BOOKING` gravada) e reservar acontecem no **mesmo** `db.transaction`, sem transação aninhada em outra conexão. Rollback desfaz os dois.
- **Persistência mínima (PR 2):** uma linha por (tenant, sessão) com fase, `last_seq`, revisão da lista, ids das ofertas na ordem apresentada, gerações e `deliveredSeq`, autorização (id, oferta, consumida) e versão otimista; escrita só pelo redutor puro.
- **Reconciliação (PR 2):** resposta perdida ⇒ repetir com a mesma chave de idempotência derivada da autorização ⇒ `REPLAYED` + conferência da reunião; rollback ⇒ autorização volta a não consumida; revogação/encerramento ⇒ `SESSION_CLOSED` anula autorização não consumida; anúncio de sucesso só após `BOOKED`/`REPLAYED` **e** reunião conferida.
- **Nesta PR:** o resolvedor só lê e fixa a agenda (`INSERT … ON CONFLICT DO NOTHING`, sem `FOR UPDATE`); a FK da fixação pede `FOR KEY SHARE` na sessão, compatível com a transição de sessão.

## 7. Limitações conhecidas

- O classificador é uma regra fechada em português, não compreensão semântica; ambiguidade sempre pede esclarecimento.
- O vínculo `callId` da concessão = sessão durável ainda não é montado em produção (E4/E5).
- A publicação de versão ainda não valida `scheduling.calendarId` contra o tenant (a resolução bloqueia); validação na publicação fica para a PR 2/E3.
- Remover uma agenda fixada é detectado e bloqueia; agenda da campanha não pode ser excluída enquanto configurada (`RESTRICT`).
