# Leads, agenda e reuniões (E1, DEC-074)

> **Escopo:** OFFLINE. Domínio, banco (migration `0014`, só em banco descartável), repositórios e API autenticada.
> Nenhuma ligação, ferramenta de agente, tela, endpoint público ou fornecedor externo. As ferramentas do agente são a E2; as telas, a E3.

## 1. Modelo

| Tabela | Papel | Garantias no banco |
| :--- | :--- | :--- |
| `leads` | Situação comercial de um contato existente (nome e telefone continuam só em `contacts`) | Um lead por contato e organização; vínculo composto com `contacts` do mesmo tenant |
| `lead_status_changes` | Histórico append-only das mudanças | Origem (`CREATED`, `MANUAL`, `MEETING_BOOKED`, `MEETING_CANCELED`) e ator (`USER`, `AGENT`, `SYSTEM`) |
| `scheduling_calendars` | Agenda da organização: fuso IANA, duração, intervalo (buffer), antecedência mínima e horizonte | Nome único por organização; limites numéricos; `version` para concorrência otimista |
| `scheduling_availability_rules` | Janelas semanais locais (dia ISO 1–7, minutos 0–1440) | Janela válida (início < fim) |
| `scheduling_availability_exceptions` | Bloqueio de uma data (dia inteiro ou janela) ou horário extra | Bloqueio sem janela só para `UNAVAILABLE` |
| `meeting_slot_offers` | Horário **efetivamente oferecido** a um lead (com tentativa de ligação opcional) e validade | Vínculos compostos com agenda, lead e `call_attempts` do mesmo tenant |
| `meetings` | Reunião marcada ou cancelada | Chave de idempotência única por organização; uma reunião ativa por lead e por tentativa; uma reserva por oferta; **exclusão `btree_gist`**: nenhuma sobreposição de reuniões ativas na mesma agenda |

Todas as mudanças gravam `audit_logs` na mesma transação (sem telefone, nome ou texto livre do lead nos metadados).

## 2. Regras

- **Status do lead** (`packages/contracts/src/scheduling/lead-status.ts`):
  - `DO_NOT_CALL` é terminal e grava a supressão `OPT_OUT` do telefone, reaproveitando o bloqueio de envio existente (008-MVP1);
  - um telefone já suprimido cria o lead como `DO_NOT_CALL`;
  - `MEETING_SCHEDULED` só é alcançado por reserva e só é deixado por cancelamento, que devolve o lead a `QUALIFIED`.
- **Horários** (`slot-generation.ts`, `slot-bookability.ts`):
  - grade fixa por janela local, com passo igual à duração;
  - horário local inexistente (pulo do horário de verão) não é ofertado; horário ambíguo usa a primeira ocorrência;
  - antecedência, horizonte, exceções e buffer em volta de reuniões ativas.
- **Reserva** (`meeting-booking-service.ts`):
  - ordem fixa de travas: lead → agenda → oferta (o cancelamento usa lead → reunião, sem ciclo);
  - a chave de idempotência é lida **depois** da trava do lead, para repetições concorrentes verem a reserva vencedora;
  - o horário é revalidado dentro da transação; violações do banco viram resultados de negócio (`SLOT_UNAVAILABLE`, `LEAD_HAS_ACTIVE_MEETING`, `ATTEMPT_HAS_ACTIVE_MEETING`, `OFFER_ALREADY_USED`, `ATTEMPT_NOT_FOUND`);
  - mesma chave + mesmo pedido = `REPLAYED`; mesma chave + pedido diferente = `IDEMPOTENCY_KEY_REUSED`.
- **Confirmação futura pelo agente:** `offerSlots` registra os horários apresentados; `bookOfferedSlot` só reserva uma oferta válida, não expirada, da mesma organização e da mesma tentativa. O horário vem da oferta, nunca do modelo. A confirmação explícita do lead entra na E2.

## 3. API (asserção interna obrigatória; sem rota pública)

| Rota | Permissão |
| :--- | :--- |
| `POST/GET /v1/leads`, `GET /v1/leads/{id}` | `leads.manage` / `leads.read` |
| `POST /v1/leads/{id}/status` | `leads.manage` |
| `POST/GET /v1/scheduling/calendars`, `GET …/{id}`, `PUT …/{id}/policy` | `scheduling.manage` / `scheduling.read` |
| `PUT …/{id}/availability`, `POST/DELETE …/{id}/exceptions` | `scheduling.manage` |
| `GET …/{id}/slots` | `scheduling.read` (não reserva nada) |
| `POST/GET /v1/scheduling/meetings`, `POST …/{id}/cancel` | `scheduling.book` / `scheduling.read` |

Papéis: OWNER, ADMIN e MANAGER têm tudo; OPERATOR opera leads e reuniões; VIEWER só lê. Ofertas não têm rota HTTP nesta etapa.

## 4. Limitações conhecidas

- Supressão registrada pela API de supressões não muda o status do lead; a leitura mostra `phoneSuppressed` e as ofertas e reservas de leads `DO_NOT_CALL` são recusadas.
- Remarcar = cancelar e marcar de novo (uma reunião ativa por lead).
- A migration `0014` exige a extensão confiável `btree_gist` (contrib do PostgreSQL).
- O plano de snapshots da Base de Conhecimento, que citava "migration 0014", passa a usar o próximo número livre.
