# E2 — Agendamento pelo agente: protocolo, contexto e autorização (DEC-075)

> Estado: **PR 1 integrada** (#180, merge `2100145`). **PR 2 em revisão** (#182; oferta, confirmação e reserva operacional OFFLINE; §9). **PR 3 em revisão** (PR empilhada sobre a #182; opt-out operacional, `CALL_OUTCOME` e simulação comercial offline; §10). Ambas sem merge até a auditoria consolidada da E2. Nenhuma rota, composição de produção ou telefonia. Tudo offline.
> Base da PR 2: main `e842ea9609e271604c113be3b6d8d18246dee407`.

## 1. Objetivo e divisão aprovada

O agente, numa chamada (simulada offline nesta etapa), poderá consultar e oferecer horários, vincular a confirmação explícita à oferta correta, agendar, registrar o resultado comercial e o opt-out — sempre pelos serviços canônicos da E1 e pelo motor de ferramentas existente (`ToolExecutionEngine` + `PublishedToolGrant`).

| PR | Escopo | Estado |
| :--- | :--- | :--- |
| **PR 1** | Contexto sessão–tentativa–tenant–lead–agenda, D1, fundamentos da autorização, precedência do opt-out, contratos de eventos e estados, máquina de estados, projeto de persistência e fronteiras transacionais | integrada (#180) |
| **PR 2** | Oferta, confirmação, reserva, persistência do estado, atomicidade, replay, controle da fala transacional | **em revisão** (§9) |
| **PR 3** | Opt-out operacional, `CALL_OUTCOME`, simulação offline integrada | **em revisão** (§10) |

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
- Porta única no runtime de voz: `resolveSchedulingContextForGrant` (`apps/voice`) — concessão copiada, JSON ou fabricada lança erro antes de consultar; agenda vinda da versão publicada precisa coincidir com `schedulingCalendarId`, **valor** capturado no preparo confiável e congelado na concessão (M2): mutar o snapshot depois não muda a autoridade.
- `optOut.available` indica que um pedido pode ser aplicado a este destinatário; não é prova de recebimento de um pedido.
- Snapshots antigos (sem `scheduling`) continuam válidos e caem para o padrão da empresa ou para `ABSENT`.

**Limite registrado:** hoje o `CallLifecycleGateway` gera o `callId` sozinho; a montagem que faz o `callId` coincidir com a sessão durável pertence à E4/E5. Os testes provam a cadeia com a sessão durável criada com o `callId` da concessão.

## 5. Máquina de estados controlada pelo servidor (implementada, pura)

Eventos só do servidor/transporte, com `seq` monotônico por sessão atribuído pelo servidor. Texto, booleanos, ordinais, ids de turno ou afirmações do modelo **não são eventos**. A intenção do interlocutor vem de `classifyLeadReply` (pt-BR, determinístico, conservador; 2ª auditoria A1/A2):
- **Preparação:** NFKC unifica variantes de compatibilidade (`？` → `?`); caracteres invisíveis, de formatação ou de controle são detectados **antes** de qualquer limpeza.
- **Aceite, recusa e escolha:** só se o texto inteiro passa numa **gramática de permissão** — palavras, vírgula entre palavras e `.`/`!` no fim — e, reduzido, é uma forma conhecida. Aspas de qualquer tipo (inclusive `'…'` e tipográficas), interrogação de qualquer tipo, invisíveis e símbolos tiram o texto do aceite. Condicionais, discurso relatado e conteúdo extra viram `AMBIGUOUS`.
- **Forma de comparação sem perda (3ª/4ª auditorias, I1/I6):** uma palavra de saída por palavra lexical de entrada, em minúsculas e NFC, **com os acentos**. Palavra com outro alfabeto, diacrítico estranho ao português ou marca combinante sobrando vira `_` e nunca desaparece (`Sim, нет.` → esclarecimento). Formas permitidas são escritas com a ortografia correta; a única variante declarada é a **omissão** de acento (`nao`, `ta bom`, `numero`, `tres`). Acento trocado ou acrescentado nunca casa: `Pôde marcar.` ≠ `Pode marcar.`; formas compostas e decompostas são equivalentes. Sem tradução nem detecção de idioma.
- **Citação antes da segmentação (I2):** a fala inteira é percorrida e cada trecho entre aspas pareadas sai do texto próprio (vira `_`); o conteúdo citado só pode ser menção, e a pontuação interna não cria frase própria. Aspa sem par, fechamento sem abertura ou apóstrofo isolado torna a fala inteira não apta a pedido.
- **Opt-out — decisão pela fala inteira (4ª auditoria, I7):** a fala é dividida em frases (pontuação forte `.`/`!`/`?`/`…`) e cláusulas (`;` ou conectivo de contraste; a vírgula não é fronteira), sem descartar nenhuma. `OPT_OUT` exige ao menos um **pedido atual** e que **toda** outra cláusula, em qualquer posição, seja **trecho independente conhecido**: (a) só cortesia/saudação/despedida; (b) forma inteira da lista fechada `INDEPENDENT_FORMS` ("não se preocupe", "não precisa confirmar a reunião", "hoje não posso", "não tenho interesse", "se eu precisar, ligo para vocês"…); (c) aceite, recusa ou escolha inteiros, fora de pergunta, **somente antes do primeiro pedido e sem conectivo de contraste** (precedência D2). **Posição (5ª auditoria, N1):** cada cláusula guarda sua ordem e se foi aberta por contraste; depois do pedido, ou aberta por contraste, só valem cortesias não negativas e as formas de `INDEPENDENT_FORMS` (revisadas: nenhuma reverte o pedido). "Me descadastre, só que não.", "Me descadastre. Não." e "Me descadastre. Não. Pode marcar." ⇒ esclarecimento; pedido aberto por contraste continua pedido ("Não se preocupe, mas me descadastre."). **Interrogação:** a segmentação cobre todo o texto; um `?` isolado ou de abertura ("Me descadastre. ?", "¿Me descadastre.") vira cláusula própria que não casa com nada ⇒ esclarecimento. Qualquer outra cláusula — condição, ressalva, hipótese, relato, citação ou simplesmente desconhecida — leva a esclarecimento. Não há lista de palavras proibidas. Pedido atual = forma explícita (`FORMS`) com, antes dela, só cortesia, interpelação, modal de pedido ou conectivo simples (`LEAD_INS`), e, depois, só complementos permitidos (`TAILS`); em pergunta exige modal de pedido. Vocabulário em `lead-reply-lexicon.ts`.
- **Invariantes testadas** (`lead-reply-invariants.test.ts` e `lead-reply-grammar.test.ts`, expectativas por categoria, classificação + redutor): **I1** nenhum consentimento resulta de perda de conteúdo lexical; **I2** nenhuma diretiva de opt-out resulta só de conteúdo citado, hipotético ou relatado; **I3** nenhuma condição que restrinja o pedido é descartada pela segmentação; **I4** pedidos e aceites inequívocos cobertos pelas regras continuam funcionando; **I5** entrada fora da gramática reconhecida nunca autoriza reserva; **I6** acentos com significado são preservados; **I7** nenhuma cláusula desconhecida é ignorada para produzir uma operação. Não há promessa de cobertura semântica universal.
O estado guarda a maior revisão já vista (`maxRevision`): lista descartada, vencida ou substituída nunca volta, e retry técnico só recupera a lista vigente, sem renovar TTL (M1). `SESSION_CLOSED` é processado antes do filtro de fases terminais; em `CLOSED` nada novo é aceito (nem opt-out), e `meetingId` e `optOutSeq` anteriores são preservados (A3).

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
- **Nesta PR:** o resolvedor lê todas as prioridades D1 e fixa a agenda numa única transação `REPEATABLE READ` (mesma visão; auditoria A4), com `INSERT … ON CONFLICT DO NOTHING RETURNING`; perder a disputa pela PK (linha vencedora invisível na visão, ou `40001`) repete a transação (até 3 vezes) e devolve a linha vencedora. Não há `FOR UPDATE`. A FK da fixação pede `FOR KEY SHARE` na linha da sessão: uma transição de sessão (`FOR UPDATE`) concorrente **pode esperar** por ela, e vice-versa; esse par isolado não forma ciclo, pois a fixação não pega outra trava depois. Isso é revisão estática dos fluxos envolvidos, não prova de ausência universal de deadlock (B1).

## 7. Requisitos futuros registrados

**PR 2** — tratados na §9 (revalidação dentro da transação do efeito; S entre A e P; consumo e reserva atômicos; agenda validada na publicação; `seq`/`at`/início de fala atribuídos pelo servidor; recusa definitiva × resultado desconhecido com reconciliação pela mesma chave).

**PR 3** — tratados na §10 (opt-out gravado pelo servidor na mesma transação da fala, independente do modelo e do toolset; sessão encerrada não aceita pedido novo — como o registro é atômico com a evidência, não há evidência pendente para repetir; possível opt-out interrompe a abordagem até esclarecimento; `CALL_OUTCOME`; simulação integrada). **A validação com eventos reais de voz continua obrigatória antes de qualquer prospecção real.** Registro original:
- **Possível opt-out não reconhecido interrompe a abordagem comercial:** quando o classificador devolver esclarecimento por menção a opt-out (forma fora da lista, cláusula desconhecida na fala, citação, aspa sem par, palavra fora do alfabeto), o agente deve suspender oferta e argumentação e só perguntar se a pessoa quer deixar de receber ligações. Validar com eventos reais de voz antes de qualquer prospecção real. Não implementado nesta PR.

**E4/E5**
- Associação real do `callId` à sessão durável; autenticação e evidência do transporte real.

## 8. Limitações conhecidas

- O classificador é uma regra fechada em português, não compreensão semântica; ambiguidade sempre pede esclarecimento.
- Opt-out com prefixo fora da lista de permissão (ex.: "Escuta aqui, moço, já falei: me tira da lista") ou com forma fora da lista fechada não é reconhecido como pedido: vira esclarecimento (falso negativo seguro), nunca aceite. Ampliar listas exige teste novo.
- Citação na mesma cláusula do pedido o anula; aspa sem par ou apóstrofo isolado (inclusive em palavras como "d'água") anula todo pedido da fala; também vira esclarecimento. Não há analisador de citações: só pares de aspas balanceados.
- A gramática do opt-out é fechada: qualquer cláusula fora dela leva a esclarecimento mesmo quando seria inofensiva ("Me descadastre. Nunca mais.", "Oi, tudo bem? Me descadastre.", "Já falei: me descadastre."). "Não, não me ligue mais." também vira esclarecimento: aceitar "não" como introdução faria "Não me descadastre" virar pedido. Falso negativo seguro; ampliar exige teste novo.
- Símbolos sem palavra (`/`, parênteses, emoji) não bloqueiam o opt-out quando todas as palavras estão na gramática ("Me descadastre/obrigado"): o viés é cumprir o pedido de supressão. No aceite, qualquer símbolo continua tirando o texto da gramática.
- Mudança de comportamento (N1): aceite, recusa ou escolha depois do pedido levam a esclarecimento mesmo quando seriam só confirmação ("Me descadastre. Ok.", "Me descadastre; sim."), e "não, obrigado" depois do pedido também; antes do pedido continuam valendo ("Ok. Me descadastre."). Pergunta com sinal de abertura `¿` não é pedido.
- Mudança de comportamento: o `e` aceito antes como introdução não casa com `é` ("É, me descadastre" vira esclarecimento); `ü` e acentos fora da posição da forma permitida também não casam.
- Palavra com qualquer letra fora do alfabeto do português (outros alfabetos, homóglifos, `ñ`, `ß`, `ì`) vira `_`: impede aceite e também tira o pedido de opt-out da lista de complementos (vira esclarecimento). Variantes de largura total (ex.: `Ｓｉｍ`) continuam aceitas após NFKC.
- O vínculo `callId` da concessão = sessão durável ainda não é montado em produção (E4/E5).
- ~~A publicação de versão ainda não valida `scheduling.calendarId` contra o tenant~~ — validada na publicação desde a PR 2 (§9).
- Remover uma agenda fixada é detectado e bloqueia; agenda da campanha não pode ser excluída enquanto configurada (`RESTRICT`).

## 9. PR 2 — oferta, confirmação e reserva operacional (offline)

**Ferramentas canônicas** (`CANONICAL_TOOL_NAMES`, ampliação compatível): `scheduling.find_slots` (argumento único, sem autoridade: `day` local opcional) e `scheduling.confirm_offer` (nenhum argumento: o consentimento é o estado do protocolo). Ligadas a uma `PublishedToolGrant` legítima (`apps/voice/src/scheduling-agent-tools.ts`); o motor ainda exige a ferramenta no toolset publicado. **Nenhuma composição de produção as registra.** O Agent Studio lista as duas, com o aviso "Ainda não é usada em chamadas reais".

**Publicação** (`agent-scheduling-publication-guard.ts`, na transação da publicação): as duas ferramentas só juntas; a `scheduling.calendarId` da versão precisa existir no mesmo tenant (`FOR KEY SHARE`).

**Autoridade:** o escopo vem só da concessão (tenant, sessão = `callId`, agente, versão, agenda da versão como valor); o resolvedor da PR 1 deriva tentativa, job, destino, lead e agenda fixada; cada efeito revalida sob a trava S (`lockProtocol`): tentativa com vínculo de volta, sessão `ACTIVE` da mesma tentativa, agente e versão. Sessão inativa ⇒ `SESSION_CLOSED` gravado.

**Persistência:** `scheduling_protocol_states` (migration **0016**, aditiva): uma linha por (tenant, sessão) com o estado do redutor puro (`jsonb`), `seq` do servidor, início de fala pendente, `opt_out_pending` e contador de escritas; FK composta para a sessão.

**Eventos do harness** (`scheduling-agent-events.ts`): `SPEECH_STARTED/COMPLETED/INTERRUPTED` (formato conferido), início da fala do interlocutor (marca do servidor) e fala final (classificada no servidor). `seq` e `at` sempre do servidor; fala final sem início registrado é ignorada. Falas determinísticas (lista, releitura com data, hora e fuso, resultado) renderizadas pelo servidor (`scheduling-speech.ts`).

**Oferta** (`scheduling-agent-offers.ts`): (1) transação S curta: bloqueios comerciais e retry técnico (mesma `queryKey`, lista viva ⇒ mesmos ids, ordem e prazo, sem novas ofertas); (2) E1 `offerSlots` (L → C → A → P), até 3, TTL 15 min; (3) transação S: revalida, repete o retry (duplicatas concorrentes convergem) e emite `OFFER_LIST_ISSUED` com revisão nova. Ofertas de uma lista que não entrou no protocolo nunca são apresentadas nem reservadas; só vencem.

**Reserva** (`scheduling-agent-booking*.ts`): executor canônico da E1 refatorado para aceitar ganchos **na mesma transação** (`meeting-booking-transaction.ts`; sem ganchos, comportamento idêntico):
- ordem efetiva **K → L → C → O → A → S → P** (S = tentativa `FOR KEY SHARE` → sessão `FOR SHARE` → linha de estado `FOR UPDATE`), seguida do relógio, das escritas da E1, do registro do resultado e da guarda temporal final;
- `afterAttemptLock` (entre A e P): revalida sessão, vínculo, opt-out e a MESMA autorização não consumida e não vencida; grava `AUTHORIZED → BOOKING`;
- `beforeCommit` (todo resultado): grava `BOOKING_RESULT`; `BOOKED` só com reunião da mesma oferta e tentativa; repetição concorrente da mesma autorização vira recuperação;
- recusa do protocolo lança `ProtocolAbort` e desfaz a transação inteira; recusa definitiva da E1 consome a autorização e volta a `IDLE` na mesma transação; nunca há reunião sem autorização consumida, nem autorização consumida com sucesso sem reunião.
- Interações verificadas: transição de sessão (só S `FOR UPDATE`) e eventos de tentativa (A `FOR UPDATE` → S `FOR UPDATE`) seguem A antes de S; nenhum caminho pega S antes de K/L. Revisão estática dos fluxos envolvidos mais testes com travas reais; não é prova universal de ausência de deadlock.

**Idempotência e reconciliação:** chave derivada de (tenant, sessão, autorização). Erro antes do fim da transação ⇒ rollback certo (`NOT_BOOKED`/`TECHNICAL_FAILURE`, autorização intacta); erro depois de `beforeCommit` (inclusive no COMMIT ou na resposta) ⇒ `UNKNOWN`, sem anúncio de sucesso nem de fracasso; a chamada seguinte reconcilia sob K (`REPLAYED` ⇒ recuperação; nada commitado ⇒ reserva normal). Sessão encerrada nunca autoriza reserva nova.

**Verdade da fala (A5):** `mayAnnounceBooking` só com estado commitado `BOOKED`, reunião `SCHEDULED` da mesma oferta, tentativa e lead, e sessão ativa. O modelo recebe só motivos grossos (`SLOT_UNAVAILABLE`, `OFFER_EXPIRED`, `NOT_BOOKABLE`, `TECHNICAL_FAILURE`), nunca supressão ou dados do lead. `createSchedulingReplyGuard` + `createBookingClaimFilter`: no streaming do modelo, frases sobre marcar/agendar/confirmar são descartadas até um `BOOKED` verificado.

**Opt-out (D2) nesta PR:** pedido reconhecido prevalece no protocolo; **possível** opt-out (`mentionsOptOut`: menção não reconhecida como pedido) liga `opt_out_pending`, neutraliza intenções comerciais seguintes (viram esclarecimento) e bloqueia oferta e reserva pelo resto da sessão (resolução = PR 3). Registro operacional, `CALL_OUTCOME` e simulação integrada continuam na PR 3; prospecção real continua proibida até lá.

**Limitações da PR 2:**
- `opt_out_pending` não é liberado nesta PR (falso negativo comercial seguro).
- A guarda de streaming é um componente testado, não ligado a uma composição real (ativação = E4/E5).
- A trava S não cobre a primeira transação da oferta: ofertas órfãs podem existir até vencer (sem efeito comercial).
- `find_slots` repetido com consultas diferentes cria ofertas novas a cada chamada (sem limite de taxa nesta PR).
- O estado do protocolo é `jsonb` versionado pelo código; mudança futura do redutor exige compatibilidade com linhas de sessões em curso.
- Validade da oferta limitada pela sessão via `SESSION_CLOSED` (não há prazo absoluto de sessão no modelo atual).

## 10. PR 3 — opt-out operacional, `CALL_OUTCOME` e simulação comercial (offline)

**D2 — opt-out gravado pelo servidor:** a fala final do interlocutor é classificada no servidor; pedido reconhecido (ou "sim" à pergunta de esclarecimento) grava a **supressão canônica** NA MESMA transação do evento (`recordCanonicalOptOut`; ordem **L → A → S → P**), sem depender do modelo nem do toolset. Com lead: `recordLeadOptOut` da E1 (`DO_NOT_CALL`, ou reunião ativa preservada). Sem lead para o destino: o telefone discado é suprimido mesmo assim. A sessão guarda `opt_out_recorded_at` e a origem (`LEAD_UTTERANCE`, `CLARIFICATION`, `RECOVERY` — ver §11). Depois do registro, nenhuma fala move o protocolo e oferta, reserva e resultado comercial são recusados. Sessão encerrada não aceita pedido novo.

**Possível opt-out (requisito desta PR):** menção não reconhecida como pedido liga `opt_out_pending`; intenções comerciais viram esclarecimento; a pergunta é sem dupla negação ("você quer que a gente pare de ligar para você? Responda sim ou não") e tem entrega própria (`SPEECH_*` com propósito `OPT_OUT_QUESTION`, fora do redutor). Só vale resposta que **começou depois da entrega completa** da pergunta: lista fechada de "sim" ⇒ opt-out (`CLARIFICATION`); exatamente "não" ⇒ a abordagem recomeça com **nova lista** (o consentimento anterior não é reaproveitado); qualquer outra resposta (inclusive "sim, pode marcar", "não, obrigado", "talvez") mantém o bloqueio e exige perguntar de novo. Ambiguidade nunca autoriza continuar.

**D5 — `CALL_OUTCOME`** (migration **0017**, aditiva: valor de enum + colunas nulas, com teste de upgrade): o agente registra `CONTACTED` (só a partir de `NEW`), `QUALIFIED` ou `NOT_INTERESTED`; nunca sai de `DO_NOT_CALL`, nunca entra/sai de `MEETING_SCHEDULED` nem leva a `DO_NOT_CALL`. Sem resposta/falha técnica não são resultado do agente. Matriz de transições estendida (180 células).

**Ferramentas:** `lead.record_outcome` (argumento único: o resultado) e `lead.record_opt_out` (nenhum), ligadas à concessão; ordem L → A → S (→ P); idempotentes (`ALREADY_RECORDED`; opt-out já gravado devolve `RECORDED` sem nova escrita). Após a auditoria consolidada, `lead.record_opt_out` só conclui ou recupera pedido reconhecido pelo servidor, e `lead.record_outcome` exige interlocução (§11).

**Simulação comercial offline** (`apps/voice/src/offline-commercial-simulation.ts`): "modelo" = roteiro determinístico; motor de ferramentas com concessão, serviços canônicos, protocolo persistido e guarda de saída reais; o harness reage às diretivas (apresentar, reler, marcar, perguntar). Fluxos testados: qualificação → oferta → escolha → releitura → reserva → resultado; opt-out falado; possível opt-out com esclarecimento ("sim" e "não"); sessão encerrada; frase prematura do modelo descartada.

**Guarda de saída:** substituída na auditoria consolidada pela autoridade de saída no servidor (§11); o filtro lexical ficou sempre ligado e é só defesa adicional.

**Autorrevisão adversarial consolidada (PR 1–3):** ordem de travas por caminho (fala L → A → S → P; resultado L → A → S; reserva K → L → C → O → A → S → P; eventos e oferta A → S; aplicador de tentativa A → S) — nenhum caminho pega S antes de L/K. Achados corrigidos: (1) depois de opt-out pela ferramenta, uma fala posterior ainda gerava releitura (protocolo agora congelado; teste falha sem a correção); (2) a guarda descartava perguntas legítimas; (3) "sim, pode marcar" não pode confirmar opt-out (lista fechada de "sim").

**Limitações da PR 3:**
- O roteiro da simulação substitui o modelo: não mede a qualidade de um LLM real.
- Esclarecimento sem resposta clara mantém o bloqueio até o fim da sessão (falso negativo comercial seguro).
- A guarda de saída e a simulação não estão ligadas a composição real (E4/E5).
- Validação com eventos reais de voz é obrigatória antes de qualquer prospecção real.


## 11. Correções consolidadas da E2 (auditoria Codex: BLOQUEADA)

Aplicadas na branch da PR 3 (#183), sem merge; reprodução antes da correção em teste de integração dedicado (`scheduling-agent-audit-e2.integration.test.ts`), com efeitos persistidos conferidos.

- **A1 — consentimento ligado à pergunta certa.** Toda fala do agente é informada ao servidor (`SPEECH_*` com propósito `AGENT`); fala do agente entre a pergunta transacional e a resposta anula a releitura/apresentação (o redutor volta a `READBACK_PENDING`/`PRESENTING` e exige nova fala completa). Início e fim de fala do interlocutor levam o **id de turno do transporte** (`LeadTurn`): final de outro turno (`TURN_MISMATCH`), repetido (`DUPLICATE_FINAL`) ou sem início (`UTTERANCE_WITHOUT_START`) é ignorado. Ids nunca vêm do modelo.
- **A2 — opt-out sem evidência.** `lead.record_opt_out({})` só conclui/recupera pedido com evidência do protocolo (`optOutSeq`, escrita só pelo redutor a partir do classificador); sem evidência: `NO_OPT_OUT_EVIDENCE`. O caminho obrigatório continua automático na fala final, inclusive sem ferramentas publicadas e sem lead.
- **A3 — bloqueio comercial.** Possível opt-out pendente emite esclarecimento também em `IDLE`; enquanto pendente, só pergunta/esclarecimento são autorizados; depois de opt-out registrado, até a recuperação de uma reserva (replay de `confirm_offer`) é recusada, sem anúncio, e a reunião é preservada.
- **A4 — interrupção e contexto.** `INTERRUPTED(q)` zera a geração da pergunta; `COMPLETED(q)` tardio não restaura entrega (exige nova geração). Fala acima de 4.000 caracteres não decide pelo prefixo: mantém pendência, sem efeito comercial.
- **A5 — consulta vazia e cache.** Consulta nova sem disponibilidade (ou recusada) invalida, sob trava, lista e autorização anteriores (evento `QUERY_EMPTY` com revisão nova); a repetição técnica legítima continua devolvendo a mesma lista, mas revalida a supressão canônica antes (ordem S → P) e, se suprimido, invalida a lista.
- **A6 — saída verdadeira.** Nova porta `authorizeOutput(scope, output)` decide no instante da emissão a partir do estado atual: sessão inativa ⇒ nada; opt-out ⇒ só a confirmação do opt-out; pendente ⇒ só esclarecimento; texto livre do modelo só em `IDLE`; apresentação/releitura só da lista/oferta vigentes; `BOOKING_RESULT` só com a reunião persistida conferida **agora** (agendada, mesma oferta, tentativa e lead) e com o **texto do servidor**. A fase `BOOKED` histórica não basta: reunião cancelada ⇒ `NOT_BOOKED`/sem anúncio. O booleano permanente "reservado" foi eliminado; o filtro lexical ficou sempre ligado e virou regra estrutural (o modelo nunca afirma nada sobre agenda/horários/reunião, só pergunta) — defesa adicional, não prova. A simulação autoriza toda saída, inclusive texto livre, e registra o que foi retido.
- **A7 — `CALL_OUTCOME` sem interlocução.** Exige ao menos uma fala final confiável do interlocutor nesta sessão (`lead_final_utterances`); sem isso, `NO_INTERLOCUTION`, sem alterar status nem histórico. DNC e `MEETING_SCHEDULED` preservados.
- **Migration 0017 (integridade).** CHECK corrigido: `opt_out_recorded_at` e `opt_out_source` ambos nulos ou ambos preenchidos com origem conhecida (`LEAD_UTTERANCE`, `CLARIFICATION`, `RECOVERY`); novos CHECKs de turno (início e id juntos) e contagem ≥ 0. SQL, ORM e metadados coerentes. Upgrade conservador: início de fala legado sem turno é descartado (a próxima final é ignorada); linha legada `OPTED_OUT` sem supressão **não** é suprimida automaticamente nem ganha evidência inventada — continua comercialmente bloqueada e pode ser recuperada pela ferramenta (origem `RECOVERY`), inclusive após o fim da sessão. Sessões legadas começam com `lead_final_utterances = 0` (resultado comercial só após nova fala final).

**Limitações remanescentes:** texto livre do modelo em `IDLE` é autorizado e só passa pelo filtro estrutural (não é prova de veracidade); depois da reserva, o modelo não fala livremente (só falas do servidor) — a experiência de encerramento depende da composição real (E4/E5); a validação com eventos reais de voz continua obrigatória antes de qualquer prospecção real.

## 12. E2 simplificada — conexão direta (DEC-077)

Substitui, para a integração real, os controles de fala das §§5, 10 e 11 (mantidos acima como histórico). Evidências: [E2V_RESEARCH_AND_VALIDATION.md](E2V_RESEARCH_AND_VALIDATION.md).

**Fluxo.** `scheduling.find_slots` (inalterada: oferta da E1, lista com revisão, A5) → `scheduling.request_booking({ listRevision, option, leadConfirmation })` registra intenção `PENDING_EVIDENCE` (oferta desta sessão, vigente, sem opt-out, telefone não suprimido; um novo pedido substitui o anterior) → fim da chamada → relatório pós-chamada (canal `SESSION_REPORT` do pipeline de webhooks) → `DrizzlePostCallReconciliationService.ingest`: registro idempotente (digest) → avaliação PURA do histórico (`evaluatePostCallReport`) → efeitos → fechamento `RECONCILED` ou `NEEDS_REVIEW`.

**Aceite.** Só com: chamada da ferramenta no histórico para a MESMA lista/opção; ordem provada (`TIMELINE`); última fala do lead antes dela = `AFFIRM` do classificador da PR 1; fala do agente imediatamente anterior citando dia da semana e hora da oferta (`mentionsSlot`); nenhuma fala posterior contraditória. Recusa ⇒ `REJECTED`; qualquer dúvida ⇒ `NEEDS_REVIEW`. Aceite ⇒ `bookOfferedSlot` da E1 com chave `booking-intent:<id>`, intenção travada no gancho (I) e marcada `BOOKED` na mesma transação; oferta vencida, horário ocupado ou lead bloqueado ⇒ revisão, nada reservado.

**Opt-out.** Ferramenta: supressão canônica imediata (`TOOL`), intenção pendente `CANCELED`. Histórico: pedido sem ferramenta ⇒ supressão (`POST_CALL`); menção ambígua ⇒ revisão; ferramenta sem pedido no histórico ⇒ supressão mantida e revisão.

**Resultado.** Proposto pela ferramenta; aplicado (D5, origem `CALL_OUTCOME`) só com fala do lead no histórico e sem opt-out.

**Barreira.** `post_call_reconciliations` aberta (relatório pendente/ausente/conflitante, revisão) ⇒ claim de envio recusa novas tentativas ao mesmo telefone (`POST_CALL_RECONCILIATION_PENDING`, sem cancelar). Relatório ausente além do prazo ⇒ `REPORT_MISSING`; relatório registrado cujo processamento não terminou no prazo ⇒ `REPORT_PROCESSING_INCOMPLETE` (ambos revisão). Relatório de sessão cujo `current_attempt_id` não é a tentativa informada ⇒ `SESSION_ATTEMPT_MISMATCH` (rejeitado). Adaptador do relatório real da Millis e autenticação por token na URL: `E2V_RESEARCH_AND_VALIDATION.md` §4.4. Só `resolveReview` (usuário) libera uma revisão.

**Travas.** K → L → C → O → A → S → I → R → P. `request_booking` trava o lead primeiro (a FK da intenção pega `KEY SHARE` no lead; sem isso, impasse com o opt-out — encontrado e corrigido no teste de concorrência).

**Persistência (0016/0017 regeneradas).** `scheduling_protocol_states` sem colunas de fala; `opt_out_recorded_at`/`opt_out_source` (`TOOL`|`POST_CALL`, CHECK sem brecha de NULL); `booking_intents` (uma pendente por sessão; `BOOKED` ⇔ reunião); `post_call_reconciliations` (status, digest, motivo de fim, motivos de revisão, resultado proposto/aplicado; o histórico NÃO é armazenado).

**Removido.** `recordSpeech`, `recordLeadSpeechStarted`, `recordLeadUtterance`, `authorizeOutput`, `confirm_offer`, filtro de afirmações, esclarecimento de opt-out por fala, simulação de fala e respectivos testes (substituídos por testes no nível da ferramenta, do relatório e da concorrência). As fases de fala do redutor da PR 1 ficam inertes (nenhum evento as aciona); remoção candidata numa limpeza futura, para não reabrir a PR 1 auditada.

**Pendências.** Adaptador do relatório real (depende da amostra anonimizada); composição/rotas (E3+); autenticação do relatório pela Millis [LACUNA].
