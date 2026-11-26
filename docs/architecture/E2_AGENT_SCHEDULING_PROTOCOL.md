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
- **Opt-out — decisão pela fala inteira (4ª auditoria, I7):** a fala é dividida em frases (pontuação forte `.`/`!`/`?`/`…`) e cláusulas (`;` ou conectivo de contraste; a vírgula não é fronteira), sem descartar nenhuma. `OPT_OUT` exige ao menos um **pedido atual** e que **toda** outra cláusula, em qualquer posição, seja **trecho independente conhecido**: (a) só cortesia/saudação/despedida; (b) forma inteira da lista fechada `INDEPENDENT_FORMS` ("não se preocupe", "não precisa confirmar a reunião", "hoje não posso", "não tenho interesse", "se eu precisar, ligo para vocês"…); (c) aceite, recusa ou escolha inteiros, fora de pergunta (precedência D2). Qualquer outra cláusula — condição, ressalva, hipótese, relato, citação ou simplesmente desconhecida — leva a esclarecimento. Não há lista de palavras proibidas. Pedido atual = forma explícita (`FORMS`) com, antes dela, só cortesia, interpelação, modal de pedido ou conectivo simples (`LEAD_INS`), e, depois, só complementos permitidos (`TAILS`); em pergunta exige modal de pedido. Vocabulário em `lead-reply-lexicon.ts`.
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

## 7. Requisitos futuros registrados (não implementados aqui)

**PR 2**
- `AVAILABLE` é leitura pontual, não autorização definitiva: revalidar sessão ativa e validade **dentro** da transação do efeito.
- Adquirir S entre A e P, nunca antes de chamar uma operação que começa em K.
- Consumo da autorização e reserva atômicos (mesma transação).
- Validar a agenda da versão na publicação antes de habilitar ferramentas.
- Vincular origem, sessão e geração de cada evento; exigir `deliveredSeq < startedSeq ≤ seq`; rejeitar datas e sequências inválidas.
- Distinguir recusa definitiva de resultado desconhecido após timeout de commit; reconciliar com a mesma chave antes de comunicar; nunca anunciar ausência de reserva quando o commit pode ter ocorrido.

**PR 3**
- Opt-out confiável e independente do modelo, com registro operacional.
- Retry de evidência legítima anterior aceito mesmo após o encerramento; nenhum pedido novo aceito de sessão encerrada.
- **Possível opt-out não reconhecido interrompe a abordagem comercial:** quando o classificador devolver esclarecimento por menção a opt-out (forma fora da lista, cláusula desconhecida na fala, citação, aspa sem par, palavra fora do alfabeto), o agente deve suspender oferta e argumentação e só perguntar se a pessoa quer deixar de receber ligações. Validar com eventos reais de voz antes de qualquer prospecção real. Não implementado nesta PR.
- `CALL_OUTCOME` e simulação integrada.

**E4/E5**
- Associação real do `callId` à sessão durável; autenticação e evidência do transporte real.

## 8. Limitações conhecidas

- O classificador é uma regra fechada em português, não compreensão semântica; ambiguidade sempre pede esclarecimento.
- Opt-out com prefixo fora da lista de permissão (ex.: "Escuta aqui, moço, já falei: me tira da lista") ou com forma fora da lista fechada não é reconhecido como pedido: vira esclarecimento (falso negativo seguro), nunca aceite. Ampliar listas exige teste novo.
- Citação na mesma cláusula do pedido o anula; aspa sem par ou apóstrofo isolado (inclusive em palavras como "d'água") anula todo pedido da fala; também vira esclarecimento. Não há analisador de citações: só pares de aspas balanceados.
- A gramática do opt-out é fechada: qualquer cláusula fora dela leva a esclarecimento mesmo quando seria inofensiva ("Me descadastre. Nunca mais.", "Oi, tudo bem? Me descadastre.", "Já falei: me descadastre."). "Não, não me ligue mais." também vira esclarecimento: aceitar "não" como introdução faria "Não me descadastre" virar pedido. Falso negativo seguro; ampliar exige teste novo.
- Símbolos sem palavra (`/`, parênteses, emoji) não bloqueiam o opt-out quando todas as palavras estão na gramática ("Me descadastre/obrigado"): o viés é cumprir o pedido de supressão. No aceite, qualquer símbolo continua tirando o texto da gramática.
- Mudança de comportamento: o `e` aceito antes como introdução não casa com `é` ("É, me descadastre" vira esclarecimento); `ü` e acentos fora da posição da forma permitida também não casam.
- Palavra com qualquer letra fora do alfabeto do português (outros alfabetos, homóglifos, `ñ`, `ß`, `ì`) vira `_`: impede aceite e também tira o pedido de opt-out da lista de complementos (vira esclarecimento). Variantes de largura total (ex.: `Ｓｉｍ`) continuam aceitas após NFKC.
- O vínculo `callId` da concessão = sessão durável ainda não é montado em produção (E4/E5).
- A publicação de versão ainda não valida `scheduling.calendarId` contra o tenant (a resolução bloqueia); validação na publicação fica para a PR 2/E3.
- Remover uma agenda fixada é detectado e bloqueia; agenda da campanha não pode ser excluída enquanto configurada (`RESTRICT`).
