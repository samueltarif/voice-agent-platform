# Decisões para Iniciar a 008-OF5a (S1) — Contratos Provider-Neutral de Sessão Conversacional e Pernas

> **ESTE DOCUMENTO NÃO INICIA A IMPLEMENTAÇÃO E NÃO APROVA NADA.** O merge das PRs #134–#137 **não** aprova H1-OFF nem qualquer outra decisão.
> A S1 só começa com resposta explícita do operador às decisões da seção 2 e com a autorização literal da seção 6.
> Invariantes: `ACTIVE_GUARDED = BLOCKED` | `CUSTOMER_TRAFFIC = PROHIBITED` | `PRODUCTION_RUNTIME_WIRING = NO` | `REAL_PROVIDER_CALLS = 0` | `PURCHASE_OF_PHONE_NUMBERS = 0` | `REMOTE_MIGRATIONS = 0` | `PUBLIC_WEBHOOKS = 0`.

- **Base**: `main` `3b75e523ef0850515fce6581129166ce79b3e63c` (PR #137 mesclada).
- **Referências**:
  - desenho SIP: §1.1, §1.2, §2.3, §2.5.1, §2.11 e §10;
  - pacote de decisões offline: seção 7, com as ressalvas **R-1** e **R-2**;
  - correção da Twilio sobre gravação: T11–T18 do pacote de decisão.

## 1. O que a S1 entrega (e o que não entrega)

**Entrega** (somente `packages/contracts`, sem rede, adaptador, worker, banco ou migração):

1. `ConversationSessionPort` e `MediaTarget` (`SIP_URI` | `BIDIRECTIONAL_AUDIO_STREAM`), com nomes neutros (§1.2).
2. Modelo de pernas: `CONTACT_LEG`, `AI_AGENT_LEG` e `HUMAN_AGENT_LEG`, este último reservado e sem fluxo na S1.
3. Evento neutro `AI_AGENT_LEG_RESULT` (`bridgeStatus`, `transportResponseCode` opcional).
4. Regras puras de correlação:
   - uma `AI_AGENT_LEG` ativa por tentativa;
   - perna sem `CONTACT_LEG` conhecida é rejeitada;
   - vínculo de `providerReference` por *compare-and-set*: igual → idempotente; diferente → anomalia sem transição.
5. Classificação pura de "segundo identificador" conforme **R-1**: perna filha legítima e transferência **não** são anomalia; duplicidade só com todos os critérios. A S1 apenas classifica: **nenhum encerramento**.
6. Contrato do **token de callback** por tentativa (§2.5.1): formato, geração e hash. Persistência fica para a S4.
7. Extensão do `check:architecture` para recusar nomes de fornecedor em `packages/contracts` (§1.2).

**Não entrega**:
- adaptadores Twilio (S2) ou Millis (S3);
- orquestração (S4);
- gravação (R1–R3);
- migração, rota, webhook ou UI;
- qualquer comportamento de encerramento automático.

## 2. Decisões necessárias para iniciar a S1

| ID | Pergunta | Opções | Sugestão | Obrigatória para a S1? |
| :---: | :--- | :--- | :--- | :---: |
| **H1-OFF** | Adotar Twilio-led (Twilio origina; Millis só recebe a sessão) como **direção do desenho offline** | (a) Sim, SIP primeiro e *stream* bidirecional como alternativa no mesmo contrato; (b) Não | (a) — alinhada à preferência declarada | **Sim** |
| **D-CB-TOKEN** | Token de callback por tentativa nos URLs assinados | (a) Adotar; (b) Correlacionar só por `CallSid` | (a) — trata a corrida callback × `CallSid` | **Sim** (o contrato do token está no escopo) |
| **D-S1-SESSION-STATE** | Como representar a sessão conversacional **preparada** antes da chamada | (a) **Reutilizar** o estado existente `CREATED` da sessão e guardar a referência da sessão conversacional à parte, sem novo estado; (b) Novo estado `PREPARED` em `CALL_SESSION_STATES` | (a) — ver 2.1 | **Sim** |
| **D-S1-ARCH-CHECK** | Estender `check:architecture` para recusar os identificadores `twilio`/`millis` em `packages/contracts` (exceto comentários) | (a) Sim; (b) Não | (a) — garante a neutralidade de forma automática | Sim |

### 2.1 Correção do desenho: o estado `PREPARED`

- **Desenho anterior**: o §2.4 do desenho SIP previa um estado novo `PREPARED` da sessão de chamada.
- **Fato verificado no código**: `CALL_SESSION_STATES` (`packages/contracts/src/voice/call-session-contracts.ts`) alimenta o enum PostgreSQL `call_session_runtime_state` (`packages/database/src/schema/call-sessions.ts`). Acrescentar um estado exigiria **migração de banco**, o que contraria o escopo da S1 (sem schema).
- **Correção proposta**:
  - o estado `CREATED`, que já existe, significa "sessão criada e ainda não conectando", e cobre a preparação;
  - a referência opaca da sessão conversacional (`sessionRef`) e sua validade ficam num contrato próprio da preparação.
  - É a opção mínima pela regra YAGNI do AGENTS.md (§14.9):
    - `CURRENT_REQUIREMENT`: registrar a preparação antes de discar;
    - `EXISTING_OPTION`: o estado `CREATED`;
    - `MINIMAL_OPTION`: reutilizá-lo.
- Se o operador preferir (b), `PREPARED` vai para a **S4**, com migração aditiva local, e não para a S1.

### 2.2 Decisões que **não** são necessárias para a S1

Ficam para as etapas seguintes e **não** são presumidas:
- D-REC-MECH (S2; direção preferencial offline = gravação única no nível da chamada, conforme a correção da Twilio);
- D-MILLIS-DOC-ONLY (S3);
- D-SIP-FAIL, D-DUP-CALL (com R-1), D-AMD e D-REG-TIMING (S4);
- H6, C-3/C-4/C-5/C-8, D-COPY e D-TRANSCRIPT-SOURCE (com R-2) (R1–R3);
- Q0 e H5 (Q1);
- todas as decisões **definitivas** (aviso de gravação e de IA, base legal, prazos, armazenamento, telemarketing, preço, Fase 1).

## 3. Arquivos prováveis (proposta, sujeita a revisão)

Em `packages/contracts/src/telephony/`, com nomes por responsabilidade e sem `utils`/`helpers`:

| Arquivo | Conteúdo |
| :--- | :--- |
| `conversation-session-port.ts` | `ConversationSessionPort`, entrada e resultados de preparação, `MediaTarget` |
| `call-leg.ts` | Tipos de perna, estados de perna, schema Zod estrito |
| `call-leg-events.ts` | `AI_AGENT_LEG_RESULT` e eventos de perna normalizados |
| `evaluate-call-leg-correlation.ts` | Regras puras de correlação e classificação de "segundo identificador" (R-1) |
| `callback-token.ts` | Formato, geração e hash do token de callback |

Mais:
- `scripts/check-architecture.mjs`: regra de nomes de fornecedor;
- testes `*.test.ts` correspondentes;
- `index.ts` exportando os novos contratos.

Cada arquivo fica com ≤ 150 linhas, funções ≤ 30–50 linhas e complexidade ≤ 8.

## 4. Critérios de aceite da S1

1. Nenhum tipo **nem nome** de fornecedor em `packages/contracts` (verificado pelo `check:architecture` estendido).
2. FSM de tentativa da 008-OF1 e `CALL_SESSION_STATES` **inalterados** (opção a de D-S1-SESSION-STATE).
3. Schemas Zod estritos: campos extras rejeitados.
4. Correlação:
   - segunda `AI_AGENT_LEG` ativa rejeitada;
   - perna sem `CONTACT_LEG` rejeitada;
   - *compare-and-set* idempotente;
   - `providerReference` divergente é anomalia sem transição.
5. R-1:
   - perna filha legítima não é anomalia;
   - transferência não é anomalia;
   - "duplicidade comprovada" só com todos os critérios;
   - **nenhum** resultado do contrato significa "encerrar".
6. Token: entropia mínima de 128 bits, comparação por hash, token inválido rejeitado.
7. Gate canônico `pnpm install --frozen-lockfile && pnpm check` verde no HEAD exato, com worktree limpa.

## 5. Testes previstos

- Transições válidas e inválidas de perna.
- Eventos fora de ordem não regridem estado.
- Duplicata idempotente.
- Corrida callback × resposta síncrona:
  - vínculo antes e depois;
  - `OUTCOME_UNKNOWN` resolvido como originado **sem rediscagem**;
  - `CallSid` divergente.
- Classificação R-1 (filha, transferência, duplicidade com e sem cada critério).
- Token (formato, hash, comparação).
- Regra de arquitetura (arquivo sintético com nome de fornecedor reprovado).
- Regressão completa da FSM da 008-OF1.

## 6. Formato de autorização

```
H1-OFF: [a | b]
D-CB-TOKEN: [a | b]
D-S1-SESSION-STATE: [a | b]
D-S1-ARCH-CHECK: [a | b]
Autorizo iniciar a 008-OF5a (S1) offline: [SIM | NÃO]
```

Ao receber a autorização:
1. as decisões serão registradas como nova DEC em `docs/DECISIONS_LOG.md`, marcadas como **OFFLINE**;
2. só depois começa a implementação, numa branch própria;
3. a entrega será uma PR revisável, com o gate no HEAD exato e sem merge automático.
