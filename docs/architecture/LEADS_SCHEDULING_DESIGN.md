# Leads, agenda e reuniões (E1, DEC-074)

> **Escopo:** OFFLINE. Domínio, banco (migration `0014`, só em banco descartável), repositórios e API autenticada.
> Nenhuma ligação, ferramenta de agente, tela, endpoint público ou fornecedor externo. As ferramentas do agente são a E2; as telas, a E3.

## 1. Modelo

| Tabela | Papel | Garantias no banco |
| :--- | :--- | :--- |
| `leads` | Situação comercial de um contato existente (nome e telefone continuam só em `contacts`) | Um lead por contato e organização; vínculo composto com `contacts` do mesmo tenant |
| `lead_status_changes` | Histórico das mudanças (conteúdo imutável) | Origem (`CREATED`, `MANUAL`, `OPT_OUT`, `MEETING_BOOKED`, `MEETING_CANCELED`) e ator (`USER`, `AGENT`, `SYSTEM`); reunião referenciada por chave composta `(meeting_id, organization_id)` — só reunião existente do mesmo tenant; gatilho recusa `UPDATE` |
| `scheduling_calendars` | Agenda da organização: fuso IANA, duração, intervalo (buffer), antecedência mínima e horizonte | Nome único por organização; limites numéricos; `version` para concorrência otimista |
| `scheduling_availability_rules` | Janelas semanais locais (dia ISO 1–7, minutos 0–1440) | Janela válida (início < fim) |
| `scheduling_availability_exceptions` | Bloqueio de uma data (dia inteiro ou janela) ou horário extra | Bloqueio sem janela só para `UNAVAILABLE`; janela parcial (só início ou só fim) é recusada pelo CHECK |
| `meeting_slot_offers` | Horário **efetivamente oferecido** a um lead (com tentativa de ligação opcional) e validade | Vínculos compostos com agenda, lead e `call_attempts` do mesmo tenant |
| `meetings` | Reunião marcada ou cancelada | Chave de idempotência única por organização; uma reunião ativa por lead e por tentativa; uma reserva por oferta; **exclusão `btree_gist`**: nenhuma sobreposição de reuniões ativas na mesma agenda |

Todas as mudanças gravam `audit_logs` na mesma transação (sem telefone, nome ou texto livre do lead nos metadados).

## 2. Regras

- **Status do lead** (`packages/contracts/src/scheduling/lead-status.ts`):
  - um telefone já suprimido cria o lead como `DO_NOT_CALL`;
  - `MEETING_SCHEDULED` só é alcançado por reserva e só é deixado por cancelamento;
  - o cancelamento devolve o lead a `QUALIFIED`, ou a `DO_NOT_CALL` se o telefone estiver suprimido (cancelar nunca reabilita ligações).
- **Pedido de não receber ligações (opt-out)** (`lead-opt-out.ts`, auditoria A4):
  - registra **sempre e primeiro** a supressão canônica `OPT_OUT` do telefone (a mesma consultada no disparo, 008-MVP1), qualquer que seja o status comercial;
  - lead aberto → `DO_NOT_CALL`; reunião ativa → a reunião é **preservada** até cancelamento explícito (`OPTED_OUT_MEETING_PRESERVED`); já `DO_NOT_CALL` → só garante a supressão;
  - `POST /v1/leads/{id}/status` com `DO_NOT_CALL` segue esse fluxo **sem exigir a versão comercial atual** (2ª auditoria): uma versão desatualizada não impede o opt-out; `expectedVersion` continua obrigatório no corpo e protege todas as **outras** mudanças comerciais (`VERSION_CONFLICT`); `recordOptOut` é o mesmo fluxo para chamadas internas;
  - exige autenticação, vínculo ativo, `leads.manage` e lead do próprio tenant (VIEWER = 403; outro tenant = 404, sem supressão);
  - repetir o pedido é idempotente (uma única supressão);
  - nenhum fluxo do E1 remove uma supressão, e **não existe** rota nem método de remoção de supressão no código atual.
- **Reserva manual × prospecção ativa:**
  - *reserva manual* (`bookMeeting`, só ator `USER`): o cliente pediu a reunião por outro canal e um usuário a registra. É aceita mesmo com telefone suprimido ou lead `DO_NOT_CALL` e **não** remove a supressão;
  - *prospecção ativa* (ofertas e `bookOfferedSlot`, caminho do agente): recusada com `LEAD_SUPPRESSED` para telefone suprimido ou lead `DO_NOT_CALL`; o agente não reserva por horário livre (`bookMeeting` com ator não-usuário = `OFFER_REQUIRED`).
- **Procedência de reserva não atribuída a usuário** (2ª auditoria, A3): exige oferta registrada **e** tentativa não nula, igual à da oferta, do mesmo tenant, cuja tentativa → job → telefone corresponda ao contato do lead; tudo revalidado sob trava na confirmação. A ausência dos dois identificadores nunca vale como correspondência (`ATTEMPT_REQUIRED`). A unicidade do telefone por organização liga a tentativa a um único contato e lead.
- **Horários** (`slot-generation.ts`, `slot-bookability.ts`):
  - grade fixa por janela local, com passo igual à duração;
  - horário local inexistente (pulo do horário de verão) não é ofertado; horário ambíguo usa a primeira ocorrência;
  - antecedência, horizonte, exceções e buffer em volta de reuniões ativas.
- **Horário de verão nas bordas da janela** (auditoria M2): além do minuto local, o início e o fim reais (instantes) precisam caber entre os instantes de abertura e fechamento da janela naquele dia.
- **Reserva** (`meeting-booking-service.ts`, `meeting-booking-validation.ts`):
  - travas na ordem global da §2.1;
  - a chave é lida **depois** das travas: repetições concorrentes veem a reserva vencedora, e pedidos com a mesma chave e argumentos diferentes recebem `IDEMPOTENCY_KEY_REUSED`, nunca um conflito de horário (M4);
  - o instante da decisão vem do relógio da aplicação, injetado no serviço e lido **depois de todas as travas, inclusive a do telefone** (não é o início da transação nem um valor do chamador): validade da oferta e antecedência mínima são decididas com ele (A2);
  - **guarda final**: depois da última escrita (reunião, oferta, lead, histórico, auditoria), o relógio é lido de novo; se a oferta venceu ou a antecedência deixou de valer durante qualquer espera posterior à decisão (FK, gatilho, E/S), a transação inteira é desfeita e volta `OFFER_EXPIRED` / `INSIDE_MINIMUM_NOTICE`. Resta só o próprio `COMMIT`;
  - uma reserva válida já confirmada continua sendo repetida (`REPLAYED`) depois de a oferta vencer, sem esperar a trava do telefone;
  - o horário é revalidado dentro da transação; violações do banco viram resultados de negócio (`SLOT_UNAVAILABLE`, `LEAD_HAS_ACTIVE_MEETING`, `ATTEMPT_HAS_ACTIVE_MEETING`, `OFFER_ALREADY_USED`, `ATTEMPT_NOT_FOUND`);
  - qualquer recusa acontece antes de escrever: oferta continua `OFFERED`, lead e histórico intactos.
- **Ofertas e confirmação futura pelo agente** (auditoria A1/A3):
  - `offerSlots` registra os horários apresentados; com tentativa, a tentativa precisa ter discado **exatamente** o telefone do lead (destino do job durável, resolvido no servidor) — senão `ATTEMPT_LEAD_MISMATCH`/`ATTEMPT_NOT_FOUND`; identificadores enviados por um modelo não são confiados;
  - `bookOfferedSlot` só reserva uma oferta em aberto, não vencida, da mesma organização e da mesma tentativa, e repete a verificação tentativa ↔ lead e a supressão sob trava;
  - o **intervalo inteiro** ofertado (início e fim) precisa ser igual ao revalidado pela política vigente; se a política mudou, `OFFER_STALE` e é preciso uma nova oferta;
  - o horário vem da oferta, nunca do modelo. A confirmação explícita do lead entra na E2 (não autorizada).

### 2.1 Ordem global de travas (2ª auditoria)

Travas explícitas e implícitas (FKs pedem `FOR KEY SHARE` na linha referenciada, que conflita com `FOR UPDATE`):

| Sigla | Trava | Tipo |
| :--- | :--- | :--- |
| K | chave de idempotência (tenant + chave) | advisory de transação |
| L | linha do lead | `FOR UPDATE` |
| M | linha da reunião (cancelamento) | `FOR UPDATE` |
| C | linha da agenda | `FOR UPDATE` (reserva) / `FOR KEY SHARE` (oferta) |
| O | linha da oferta | `FOR UPDATE` |
| A | linha da tentativa | `FOR KEY SHARE` (oferta/reserva) / `FOR UPDATE` (`claimSend`) |
| P | telefone (tenant + telefone, `lockSuppressionKey`) | advisory de transação — **sempre a última** |

**Ordem global: K → L → M → C → O → A → P.** Toda operação pega um subconjunto nessa ordem; as FKs dos `INSERT` só pedem linhas já travadas antes de P.

| Operação | Antes (`a1f5892`) | Depois |
| :--- | :--- | :--- |
| Reserva por oferta | K → L → C → O → P → (FK em A no `INSERT`) | K → L → C → O → A → P → relógio → escritas → guarda final |
| Reserva manual (USER) | K → L → C | K → L → C → relógio → escritas → guarda final |
| Emissão de oferta | P → (FK em L, C, A no `INSERT`) | L → C (key share) → A (key share) → P |
| Opt-out (rota ou `recordOptOut`) | L → P (rota: recusava antes, por versão) | L → P, sem depender da versão |
| Cancelamento | L → M → P | L → M → P (sem mudança) |
| Supressão pela API de contatos | P | P (sem mudança) |
| `claimSend` (disparo) | A (`FOR UPDATE`) → P | A → P (sem mudança) |
| Criação de lead | contato (`FOR SHARE`) → P | sem mudança (lead novo; não trava L) |

Ciclos reproduzidos antes da correção (PostgreSQL `40P01 deadlock_detected`, testes determinísticos):
- oferta segurava P e esperava a FK em L, enquanto o opt-out segurava L e esperava P;
- oferta segurava P e esperava a FK em A, enquanto o `claimSend` segurava A e esperava P.

Sem aumento de timeout e sem retry: a ordem foi corrigida na origem.

## 3. API (asserção interna obrigatória; sem rota pública)

| Rota | Permissão |
| :--- | :--- |
| `POST/GET /v1/leads`, `GET /v1/leads/{id}` | `leads.manage` / `leads.read` |
| `POST /v1/leads/{id}/status` | `leads.manage` |
| `POST/GET /v1/scheduling/calendars`, `GET …/{id}`, `PUT …/{id}/policy` | `scheduling.manage` / `scheduling.read` |
| `PUT …/{id}/availability`, `POST/DELETE …/{id}/exceptions` | `scheduling.manage` |
| `GET …/{id}/slots` | `scheduling.read` (não reserva nada) |
| `POST/GET /v1/scheduling/meetings`, `POST …/{id}/cancel` | `scheduling.book` / `scheduling.read` |

Papéis: OWNER, ADMIN e MANAGER têm tudo; OPERATOR opera leads e reuniões; VIEWER só lê. Ofertas não têm rota HTTP nesta etapa. Organização, vínculo (`ACTIVE`) e papel são revalidados no banco a cada pedido; vínculo revogado = 403, sem asserção = 401.

**Histórico do lead por permissão** (`lead-projection.ts`, 2ª auditoria B1): VIEWER e OPERATOR recebem status anterior e novo, origem, tipo de ator, reunião referenciada e data; o id do ator e o texto livre do motivo só para `scheduling.manage`; ids da linha e do tenant nunca saem.

**DTO de reunião por permissão** (`meeting-projection.ts`, auditoria B1): todos os leitores recebem id, agenda, lead, início, fim, status, versão, tipo de quem marcou, criação e cancelamento (a listagem acrescenta nome do contato e status do lead). Quem tem `scheduling.manage` recebe também autor da reserva e do cancelamento, motivo livre do cancelamento e tentativa de origem. Chave de idempotência, impressão digital do pedido e id da oferta **nunca** saem da API. `GET …/calendars/{id}` devolve as exceções com `id`, usado pelo `DELETE` (M1).

## 4. Garantias reais de imutabilidade e exclusão (auditoria M5)

- `lead_status_changes`:
  - o banco **bloqueia `UPDATE`** (gatilho `lead_status_changes_no_update`);
  - a aplicação **não oferece** exclusão direta do histórico (nenhum `DELETE` no código);
  - as FKs permitem exclusão **por cascata** quando a organização ou o lead é excluído;
  - um `DELETE` direto por usuário privilegiado do banco **não** é impedido pela migration. Não é append-only absoluto.
- A referência à reunião é protegida por chave estrangeira composta (`ON DELETE NO ACTION`): não aponta para reunião inexistente nem de outro tenant.
- `audit_logs` é gravado na mesma transação; esta etapa **não** adiciona gatilho de imutabilidade a essa tabela (o código não a altera nem apaga, mas isso é garantia de aplicação, não do banco).

## 5. Limitações conhecidas

- Supressão registrada pela API de supressões não muda o status do lead; a leitura mostra `phoneSuppressed`, e ofertas e reservas do agente são recusadas (`LEAD_SUPPRESSED`).
- `ATTEMPT_HAS_ACTIVE_MEETING` deixou de ser alcançável pelo serviço (a tentativa só entra por oferta do próprio lead); o índice único continua como defesa em profundidade, provado por inserção direta.
- Não há remoção de supressão no código atual (nem rota nem método). Se uma supressão desaparecer por fora da aplicação (ex.: SQL direto), um lead `DO_NOT_CALL` continua `DO_NOT_CALL` — a mudança manual não sai desse status.
- `offerSlots` recebe o instante de emissão do chamador; a validade final de qualquer oferta é decidida na confirmação, com o relógio do servidor depois das travas.
- A ordem global cobre os fluxos diretamente envolvidos (oferta, reserva, cancelamento, opt-out, supressão por contatos, `claimSend`, criação de lead). Outros fluxos da plataforma não foram reauditados nesta etapa.
- Remarcar = cancelar e marcar de novo (uma reunião ativa por lead).
- A migration `0014` exige a extensão confiável `btree_gist` (contrib do PostgreSQL).
- O plano de snapshots da Base de Conhecimento, que citava "migration 0014", passa a usar o próximo número livre.
