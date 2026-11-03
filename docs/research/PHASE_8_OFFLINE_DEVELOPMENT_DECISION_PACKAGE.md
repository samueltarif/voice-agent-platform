# Pacote de Decisões Humanas — Desenvolvimento Offline da Fase 8 (Twilio + Millis via SIP, Gravação + Transcrição)

> **ESTE DOCUMENTO NÃO TOMA NENHUMA DECISÃO.** Ele organiza o que precisa ser aprovado para que cada etapa **offline** possa começar.
> A direção preferida declarada pelo operador vai indicada como "opção alinhada à preferência", **sem estar aprovada**.
> Aprovar uma etapa offline autoriza apenas código, testes e simuladores locais.
> **Nunca** autoriza: chamada real, compra de número, crédito, credencial real, webhook público, migração remota ou ativação de provedor.
> Invariantes: `ACTIVE_GUARDED = BLOCKED` | `CUSTOMER_TRAFFIC = PROHIBITED` | `PRODUCTION_RUNTIME_WIRING = NO` | `REAL_PROVIDER_CALLS = 0` | `PURCHASE_OF_PHONE_NUMBERS = 0` | `REMOTE_MIGRATIONS = 0` | `PUBLIC_WEBHOOKS = 0`.

- **Base**: `main` `93888679c684f40beb6e42d425e40801c9f6ae72` (PR #135 mesclada).
- **Documentos de referência**:
  - [pacote de decisão H1–H6 e evidências](PHASE_8_TELEPHONY_AUTHORITY_AND_CONTACT_POLICY_DECISION_PACKAGE.md) (DEC-044 inalterada);
  - [desenho SIP offline](PHASE_8_TWILIO_SIP_MILLIS_ARCHITECTURE_DESIGN.md);
  - [gravação + transcrição](PHASE_8_CALL_RECORDING_TRANSCRIPTION_DESIGN.md).
- **Direção preferida do operador (não aprovada)**:
  - Twilio para controle telefônico;
  - Millis AI para voz e conversação;
  - SIP como primeira conexão a investigar;
  - gravação + transcrição no mesmo plano comercial;
  - qualidade acima de preço (DEC-044).

## 1. Princípio: decisão de desenvolvimento offline ≠ decisão de produção

Várias decisões jurídicas e comerciais (retenção, acesso, aviso de gravação, preço) **não precisam de valores definitivos** para que o código offline seja escrito e testado. Basta aprovar que o código seja **configurável**, com **padrão seguro** (por exemplo, gravação desligada) e **sem dados reais**. Os valores definitivos continuam como decisão humana e jurídica antes de qualquer uso real.

Cada item abaixo diz se a aprovação pedida é:

- **OFFLINE**: só permite escrever código e testes locais;
- **DEFINITIVA**: fixa uma política ou um valor de produção.

## 2. Decisões por etapa

### Etapa S1 — `008-OF5a`: contratos provider-neutral de sessão conversacional e pernas

| ID | Pergunta | Opções | Opção alinhada à preferência | Tipo |
| :---: | :--- | :--- | :--- | :---: |
| **H1-OFF** | Adotar Twilio-led (Twilio origina; Millis só recebe a sessão) como **direção do desenho offline**? | (a) Sim, com SIP como primeiro transporte e *stream* bidirecional como alternativa no mesmo contrato; (b) Não, manter H1 em aberto; (c) Millis-led | (a) | OFFLINE |

A S1 só cria contratos e testes, sem rede, adaptador ou migração. Escopo, critérios de aceite e testes estão na seção 10 do desenho SIP.

### Etapa S2 — adaptador Twilio offline (cliente HTTP falso, TwiML, callbacks)

| ID | Pergunta | Opções | Opção alinhada / sugerida | Tipo |
| :---: | :--- | :--- | :--- | :---: |
| **D-REC-MECH** | Mecanismo único de gravação no gerador de TwiML | (a) Gravação no nível da chamada, com `<Dial record="do-not-record">` (§2.11 do desenho SIP); (b) gravação por `<Dial>` | (a), sujeita à confirmação da Twilio | OFFLINE |
| **D-CB-TOKEN** | Token de callback por tentativa nos URLs assinados (§2.5.1) | (a) Adotar; (b) Correlacionar só por `CallSid` (vulnerável à corrida) | (a) | OFFLINE |

### Etapa S3 — adaptador Millis offline (só campos documentados)

| ID | Pergunta | Opções | Sugerida | Tipo |
| :---: | :--- | :--- | :--- | :---: |
| **D-MILLIS-DOC-ONLY** | Implementar o adaptador apenas com o que está **documentado** (`register_sip_call`, `/sessions/{id}/terminate`, `/call-logs/{id}`), com resposta validada *fail-closed* e webhook só como gatilho de consulta, **antes** da resposta da engenharia da Millis? | (a) Sim, ajustando depois; (b) Aguardar a engenharia | (a) — o adaptador fica isolado e sem rede | OFFLINE |

### Etapa S4 — orquestração no worker e simuladores ponta a ponta (fecha a 008-OF5 offline)

| ID | Pergunta | Opções | Sugerida | Tipo |
| :---: | :--- | :--- | :--- | :---: |
| **D-SIP-FAIL** | A perna do agente falha **depois** que o contato atendeu | (a) Mensagem curta pré-gravada em pt-BR e desligar; (b) Desligar sem mensagem | (a) — nunca deixar silêncio. O texto da mensagem fica para C-1 | OFFLINE (comportamento) |
| **D-DUP-CALL** | Callback revela um segundo `CallSid` para a mesma tentativa | (a) Só alertar e marcar para revisão; (b) Encerrar automaticamente a segunda chamada e alertar | (b) — protege o contato de duas ligações simultâneas | OFFLINE |
| **D-AMD** | Detecção de secretária eletrônica antes de conectar a IA | (a) Configurável por campanha, desligada por padrão; (b) Sempre ligada; (c) Não suportar | (a) | OFFLINE |
| **D-REG-TIMING** | Momento do registro da sessão Millis (§2.1) | (a) R1 — antes de discar; (b) R2 — no atendimento; (c) Suportar os dois por configuração e decidir pela medição | (c) — a validade do URI é desconhecida e R2 custa latência | OFFLINE |

### Etapas R1–R3 — histórico de conversas (gravação + transcrição)

| ID | Pergunta | Opções | Sugerida para o offline | Tipo |
| :---: | :--- | :--- | :--- | :---: |
| **H6** | Empacotamento comercial | (a) Uma *entitlement* `conversationHistory` (áudio + transcrição juntos) com interruptores técnicos independentes; (b) Recursos vendidos separadamente | (a) — preferência declarada; **preço e plano continuam DEFINITIVOS e pendentes** | OFFLINE |
| **C-3-OFF** | Permissões para desenvolvimento | Proposta: leitura de histórico para OWNER/ADMIN/MANAGER/OPERATOR; transcrição e reprodução para OWNER/ADMIN/MANAGER; download e exclusão só para OWNER/ADMIN | Aprovar **como configuração inicial de desenvolvimento**; a matriz final é DEFINITIVA | OFFLINE |
| **C-4/C-5-OFF** | Retenção e exclusão no código | Prazo configurável por tenant com teto da plataforma; **sem valor padrão de produção**; *legal hold*; job de expiração; exclusão a pedido do titular | Aprovar o **mecanismo**; prazos são DEFINITIVOS e jurídicos | OFFLINE |
| **C-8-OFF** | Padrão de gravação | (a) **Desligada por padrão**, ativada por tenant/campanha só após decisão C-8 definitiva; (b) Ligada por padrão | (a) | OFFLINE |
| **D-COPY** | Mídia sob controle da plataforma | (a) Copiar para armazenamento privado próprio, verificar SHA-256 e apagar no fornecedor; (b) Manter no fornecedor e servir por *proxy* | (a), com armazenamento falso no offline (local real: C-6) | OFFLINE |
| **D-TRANSCRIPT-SOURCE** | Fonte da transcrição | (a) Millis se comprovada; contingência com STT independente sobre o canal do agente; (b) Só Millis; (c) Só STT independente | (a) | OFFLINE |

### Etapa Q1 — *harness* de métricas de qualidade (áudio sintético local)

| ID | Pergunta | Opções | Sugerida | Tipo |
| :---: | :--- | :--- | :--- | :---: |
| **Q0** | Aprovar a Fase 0 (perguntas aos fornecedores + preparação offline do plano, corpus pt-BR, rubrica e *harness*) | Sim / Não | Sim — custo zero, sem chamadas | OFFLINE |
| **H5** | Incluir variantes de STT/TTS pt-BR da Millis no teste da Fase 1 | Sim / Não | Sim — é onde está a maior parte do peso de qualidade (DEC-044) | Escopo do piloto |

## 3. Decisões que continuam DEFINITIVAS e fora do desenvolvimento offline

Estas decisões não bloqueiam o código offline, mas **bloqueiam qualquer gravação real, piloto ou Gate A**:

- **C-1**: texto e momento do aviso de gravação e de agente automatizado; recusa do contato.
- **C-2/H3**: base legal e evidência de consentimento (recomendação anterior: C2, registro estruturado por contato).
- **H2**: remoção de supressões (recomendação anterior: P2, revogação controlada).
- **C-3, C-4, C-5, C-8 (finais)**: matriz definitiva de acesso, prazos de retenção, propagação em backups, quando gravar.
- **C-6**: local de armazenamento e transferência internacional (Millis EUA/UE, Twilio, armazenamento próprio); DPAs.
- **C-7**: telemarketing no Brasil — divergência sobre o 0303, Origem Verificada, cadastros de bloqueio.
- **H4**: responsável e prazo da revisão jurídica.
- **Preço e plano** (parte definitiva de H6), considerando que o preço da gravação Twilio está **divergente e não confirmado** (US$ 0,05/min no e-mail × US$ 0,0025/min na tabela pública).
- **H1 definitiva** e **SIP × stream definitivo**: após a Fase 1 medir a qualidade pela DEC-044.
- **Autorização da Fase 1**: número, créditos, chamadas para aparelhos do operador, teto de gasto, webhooks em staging.

## 4. Ações humanas externas (não executadas por agentes)

1. Abrir o chamado técnico na Twilio ("SIP outbound +55 com endpoint da Millis") com as 6 perguntas da seção 9 do desenho SIP.
2. Obter resposta da **engenharia** da Millis (não do chatbot) para as 11 perguntas da mesma seção.
3. Indicar o responsável pela revisão jurídica (H4).

## 5. Sequência sugerida de PRs (cada uma pequena, offline e com gate no HEAD exato)

```
S1 (008-OF5a) ──► S2 ──► S4 ──► (008-OF5 offline concluída)
        └──► S3 ───┘
R1 ──► R2 ──► R3          (paralelo à trilha S; independe de H1 exceto na integração)
Q1                        (paralelo; depende só de Q0)
```

A trilha R pode começar antes da S se o operador preferir, porque seus contratos são provider-neutral.

## 6. Formato de resposta sugerido

```
H1-OFF: [a | b | c]
D-REC-MECH: [a | b]        D-CB-TOKEN: [a | b]       D-MILLIS-DOC-ONLY: [a | b]
D-SIP-FAIL: [a | b]        D-DUP-CALL: [a | b]       D-AMD: [a | b | c]       D-REG-TIMING: [a | b | c]
H6: [a | b]                C-3-OFF: [aprovar | ajustar: …]   C-4/C-5-OFF: [aprovar | ajustar]
C-8-OFF: [a | b]           D-COPY: [a | b]           D-TRANSCRIPT-SOURCE: [a | b | c]
Q0: [sim | não]            H5: [sim | não]
Primeira PR a iniciar: [S1 | R1 | Q1]
```

Cada aprovação será registrada como nova DEC em `docs/DECISIONS_LOG.md`, indicando **OFFLINE** ou **DEFINITIVA**, antes de iniciar a etapa correspondente.
