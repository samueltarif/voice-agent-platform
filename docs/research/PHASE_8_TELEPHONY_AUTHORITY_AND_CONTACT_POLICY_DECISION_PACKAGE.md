# Pacote de Decisão Humana — Autoridade de Originação (Twilio-led × Millis-led), Remoção de Supressões e Evidência de Consentimento

> **ESTE DOCUMENTO NÃO TOMA NENHUMA DECISÃO E NÃO AUTORIZA NADA.**
> Nenhuma opção está pré-selecionada. As recomendações são sugestões para avaliação do operador humano.
> Nenhuma conta de provedor foi acessada, nenhuma chamada foi feita, nenhum número foi comprado e nenhum
> gasto ocorreu para produzi-lo. As fontes são documentação pública consultada em 2026-11-03.
> Não é parecer jurídico: os itens regulatórios e de LGPD exigem revisão de advogado antes do Gate A.

## 1. Identidade

- **DECISION_PACKAGE_STATUS**: `AWAITING_HUMAN_DECISION`
- **BASE_MAIN**: `22ab511a396e1192e5ffb093f7b4121259e6ed8e` (pós-merge da PR #133; trilha 008-MVP1 a 008-MVP4 concluída offline)
- **DECISÕES ANTERIORES APLICÁVEIS**: DEC-042 (números exclusivamente gerenciados pela Twilio; Millis AI selecionada para conversação; BYON cancelado) e DEC-043 (sequenciamento; autoridade A/B expressamente **não** decidida).
- **PREFERÊNCIA HUMANA REGISTRADA**: telefonia na nuvem. As duas opções abaixo são telefonia na nuvem (Twilio como operadora em ambas); a preferência não distingue entre elas.
- **INVARIANTES PRESERVADOS**: `ACTIVE_GUARDED = BLOCKED` | `CUSTOMER_TRAFFIC = PROHIBITED` | `PRODUCTION_RUNTIME_WIRING = NO` | `REAL_PROVIDER_CALLS = 0` | `PURCHASE_OF_PHONE_NUMBERS = 0` | `REMOTE_MIGRATIONS = 0` | `PUBLIC_WEBHOOKS = 0`.

## 2. Decisões solicitadas

| ID | Decisão | Bloqueia |
| :--- | :--- | :--- |
| **H1** | Autoridade de originação: Opção A (Millis-led), Opção B (Twilio-led) ou adiar até respostas escritas dos fornecedores | 008-OF5, 008-MVP3, 008-OF6 |
| **H2** | Política de remoção de supressões (P1, P2 ou P3) | Remoção na API/UI (hoje somente inclusão) |
| **H3** | Modelo de evidência de consentimento/base legal (C1, C2 ou C3) e se ele bloqueia a discagem | Elegibilidade de contatos no Gate B |
| **H4** | Quem fará a revisão jurídica (LGPD, telemarketing, divulgação de IA, gravação) e quando | Gate A (008-OF6) e Gate B |

Nenhuma implementação dependente destas decisões será iniciada antes da aprovação.

## 3. H1 — Autoridade de originação

### 3.1 O que cada opção significa

- **Opção A — Millis-led**: a plataforma chama `POST /start_outbound_call` da Millis (`from_phone`, `to_phone`, `agent_id` e/ou `agent_config` por chamada, `metadata`). O número Twilio é **importado na Millis com as credenciais da conta Twilio**, e a Millis cria a perna telefônica. A plataforma recebe o resultado pelo *end-of-call webhook* da Millis.
- **Opção B — Twilio-led**: a plataforma cria a chamada na API REST da Twilio (número Twilio brasileiro como origem) e conecta o áudio à Millis — por `<Connect><Stream>` para o endpoint de mídia Twilio da Millis, ou por `<Dial><Sip>` para o endereço SIP devolvido por `POST /register_sip_call` (que aceita `agent_config` e `metadata` por chamada). A Millis atua só como motor conversacional; as credenciais Twilio ficam apenas na plataforma.

Invariante da DEC-043 mantido em ambas: **uma única autoridade de originação por tentativa**.

### 3.2 Fatos verificados em documentação pública (2026-11-03)

| Fato | Fonte | Impacto |
| :--- | :--- | :--- |
| A página de integração *Outbound call* da Millis diz: "Only US numbers are supported". A referência da API (`start_outbound_call`) não menciona restrição de país. | [Millis — Outbound call](https://docs.millis.ai/integration/outbound-call), [Millis — Start Outbound Call](https://docs.millis.ai/api-reference/call-management/start-outbound-call.md) | **Risco crítico para a Opção A** em +55; contradição a esclarecer por escrito com a Millis. |
| `start_outbound_call` devolve `call_id` e `session_id`; `agent_config` por chamada inclui `prompt`, `voice`, `tools`, `language` (padrão `en-US`) e `session_timeout.max_duration`. Nenhuma chave de idempotência documentada. | Millis — Start Outbound Call | A e B (via `register_sip_call`) permitem o *snapshot* imutável por chamada exigido pela 008-MVP3. Sem idempotência, a recuperação de crash depende de consulta/reconciliação. |
| Webhooks da Millis: *prefetch* (GET antes da conversa) e *end-of-call* (POST com `call_status`, `duration`, `cost_breakdown`, `voip`, `recording`, `metadata`). Autenticação: apenas cabeçalhos estáticos configuráveis; **nenhuma assinatura HMAC documentada**; timeouts e retentativas não documentados. | [Millis — Webhooks](https://docs.millis.ai/core-concepts/webhooks) | Fica abaixo do padrão da 008-OF4 (autenticação comprovada, anti-replay). Afeta A mais do que B, porque em A esse webhook é a única fonte do desfecho telefônico. |
| Regiões Millis: `us-west` e `eu-west` ("mais em breve"); nenhuma na América do Sul. | [Millis — Regions](https://docs.millis.ai/core-concepts/regions.md) | Latência de áudio Brasil↔EUA/UE nas duas opções; precisa de medição no Gate A. |
| Millis documenta a ligação de números Twilio por `<Connect><Stream>` para `wss://api-west.millis.ai:8080/twilio_inbound/{public_key}/{agent_id}` (fluxo descrito como entrada). | [Millis — Inbound call](https://docs.millis.ai/integration/inbound-call) | Base técnica da Opção B; uso em chamada de saída iniciada pela plataforma é `NOT_VERIFIED`. |
| `register_sip_call` devolve `call_id` e um endereço SIP por chamada; aceita `agent_id`, `agent_config` e `metadata`. Autenticação SIP e codecs não documentados. | [Millis — SIP Trunking](https://docs.millis.ai/integration/sip) | Caminho da Opção B com configuração por chamada. |
| Importação de números na Millis: Twilio, Vonage, Plivo, Exotel; a página não diz quais credenciais são guardadas nem o que a Millis altera no número. | [Millis — Import phone number](https://docs.millis.ai/phone/import-phone-number.md) | Em A, um terceiro guarda credenciais capazes de originar chamadas na nossa conta Twilio. |
| Twilio Brasil: chamadas de saída a partir de números brasileiros da Twilio são permitidas; números de terceiros não; *toll-free* não origina; CLI nacional "não garantido"; ainda menciona números 0303 para quem se classifica como telemarketing (regra de 2022). | [Twilio — Brazil Voice Guidelines](https://www.twilio.com/en-us/guidelines/br/voice) | Compatível com a DEC-042. A menção ao 0303 está desatualizada em relação à Anatel (ver 5.1). |
| Twilio Brasil, números: local e nacional só para empresas (CNPJ, endereço no Brasil, registro comercial); móvel para pessoa física ou jurídica com CNPJ. | [Twilio — Brazil Regulatory](https://www.twilio.com/en-us/guidelines/br/regulatory) | Pré-requisito documental do bloqueio 2 da 008-OF6 em ambas as opções. |
| Preços de tabela Twilio Brasil (agosto/2026, USD/min): saída local US$ 0,0310; móvel US$ 0,0663; a partir de 0303 US$ 0,0620; Media Streams US$ 0,0044; interface SIP US$ 0,0040; número local US$ 4,25/mês. | [Twilio — Voice Pricing BR](https://www.twilio.com/en-us/voice/pricing/br) | Ordem de grandeza apenas; tarifa efetiva `NOT_VERIFIED`. |
| Millis (preço de terceiros, marcado como desatualizado): plataforma US$ 0,02/min + STT US$ 0,0043/min + LLM (≈ US$ 0,004/min com GPT-4o) + TTS por 1.000 caracteres. | [The Front Desk Review — Millis AI](https://frontdeskreview.com/software/ai-voice-agents/millis-ai/) | Ordem de grandeza apenas; confirmar na conta/contrato. |

Estimativa ilustrativa por minuto para celular brasileiro (não é orçamento): Twilio ≈ US$ 0,066 + Millis ≈ US$ 0,03–0,05 ⇒ ≈ US$ 0,10–0,12/min nas duas opções. A Opção B soma ≈ US$ 0,004/min de Media Streams ou SIP; na Opção A, o custo equivalente da perna de mídia é desconhecido (`NOT_VERIFIED`). **A diferença de custo entre as opções é pequena diante da incerteza das tarifas.**

### 3.3 Comparação contra os invariantes já implementados (008-OF1 a 008-OF4)

| Critério | A — Millis-led | B — Twilio-led |
| :--- | :--- | :--- |
| Suporte documentado a destino +55 | **Conflitante** ("Only US numbers") | Twilio permite saída de número brasileiro Twilio; a perna Millis é mídia (não depende do país do destino) — `NOT_VERIFIED` ponta a ponta |
| Autoridade única de originação | Millis | Plataforma (via Twilio) |
| Custódia de credenciais Twilio | Compartilhada com a Millis | Só a plataforma |
| Identificador da operadora (Call SID) para reconciliação | Indireto (campo `voip` do webhook; formato não documentado) | Direto (devolvido na criação) |
| Recuperação de crash sem rediscagem cega (OF1/OF2) | Sem idempotência documentada; reconciliação por consulta à Millis (endpoint de consulta não confirmado) | Sem idempotência nativa na criação; reconciliação por consulta à chamada na Twilio (API documentada) |
| Webhooks autenticados e fail-closed (OF4) | Cabeçalho estático apenas | Status da Twilio assinado (`X-Twilio-Signature`; validador já existe em `packages/integrations/src/twilio/`) + webhook da Millis (cabeçalho estático) só para dados conversacionais |
| Corte de segurança e encerramento forçado | `session_timeout.max_duration` na Millis | Limite de duração e encerramento pela API da Twilio, além do limite da Millis |
| Separação de custo telefonia × conversacional (OF3) | Custos da Millis no webhook; custo Twilio na conta Twilio, sem vínculo garantido à tentativa | Custo Twilio por Call SID + `cost_breakdown` da Millis por `call_id` |
| Snapshot imutável do agente (008-MVP3) | `agent_config` por chamada | `agent_config` por chamada via `register_sip_call` (com `<Connect><Stream>`, só `agent_id` fixo no URL) |
| Esforço de integração (008-OF5) | Menor: 1 chamada de API + 1 webhook | Maior: TwiML, *status callbacks*, ponte de mídia/SIP, 2 fontes de eventos |
| Dependência de rota não documentada | Saída +55 | Uso do caminho de mídia/SIP "de entrada" da Millis numa chamada de saída |
| Detecção de secretária eletrônica | `call_status` inclui `voicemail-*` (comportamento em pt-BR não verificado) | AMD da Twilio disponível (precisão em pt-BR não verificada) + sinais da Millis |

### 3.4 Recomendação (para avaliação, não decidida)

**Sugestão: aprovar a Opção B (Twilio-led) como direção da 008-OF5 offline, condicionando a 008-OF6 às confirmações escritas da seção 3.5.** Motivos, em ordem de peso:

1. A Opção A tem, na documentação da própria Millis, uma restrição explícita de saída a números dos EUA. Até prova em contrário, isso inviabiliza o uso principal (destinos +55).
2. Em B, a plataforma mantém a autoridade sobre originação, encerramento, reconciliação e custo de operadora, que é o que as fatias 008-OF1 a 008-OF4 já modelam; o desfecho telefônico chega por webhook assinado, compatível com a 008-OF4 sem afrouxar a regra fail-closed.
3. Em B, as credenciais Twilio não são entregues a terceiros.
4. O trabalho offline da 008-OF5 em B não depende de nenhum item não verificado da Millis para ser testado com simuladores; se a confirmação falhar, o adaptador fica isolado em `packages/integrations` e a troca para A é localizada.

**Quando a Opção A seria preferível**: se a Millis confirmar por escrito suporte de saída para +55, autenticação verificável dos webhooks e um meio de reconciliação por `call_id`, e se o operador valorizar menor esforço de integração e menos uma fonte de eventos. Nesse caso, recomenda-se uma subconta Twilio dedicada só à Millis, com limites de gasto próprios.

**Alternativa conservadora**: adiar H1 até as respostas escritas. Custo: a 008-OF5 e a 008-MVP3 ficam paradas; não há outra fatia offline relevante desbloqueada.

### 3.5 Perguntas a fazer aos fornecedores (ação humana; não executada)

Para a Millis:
1. Chamadas de saída para destinos +55 (móvel e fixo) a partir de número Twilio brasileiro importado são suportadas? A nota "Only US numbers are supported" ainda vale?
2. Usar o caminho `twilio_inbound` (`<Connect><Stream>`) ou `register_sip_call` numa chamada **de saída criada pelo cliente na Twilio** é suportado? Quem fala primeiro e como se configura?
3. Existe assinatura (HMAC) ou outro mecanismo verificável nos webhooks? Timeouts e retentativas?
4. Existe chave de idempotência para `start_outbound_call` e um endpoint para consultar o estado de uma chamada por `call_id`?
5. Que credenciais Twilio são armazenadas na importação, onde (região) e o que a Millis altera na configuração do número?
6. Há região ou ponto de presença na América do Sul, ou previsão? Onde ficam processados e armazenados áudio, transcrição e gravações?
7. Suporte a pt-BR em STT/TTS e qualidade de detecção de secretária eletrônica em pt-BR.
8. Termos de tratamento de dados (DPA), subprocessadores e transferência internacional (LGPD, art. 33).

Para a Twilio:
1. Disponibilidade de números brasileiros (móvel × local) para empresa com CNPJ e prazo do *bundle* regulatório.
2. Situação do serviço "Origem Verificada" (STIR/SHAKEN brasileiro) para tráfego originado pela Twilio e exigências para empresas abaixo de 500 mil chamadas/mês.
3. A orientação de números 0303 para telemarketing ainda vale para clientes Twilio após a revogação da obrigatoriedade pela Anatel em agosto de 2025?
4. Cobrança de tentativas sem atendimento e tarifas efetivas por tipo de destino.

### 3.6 O que muda em cada caso (escopo, sem execução)

- **Se B**: 008-OF5 implementa offline um adaptador de originação Twilio (criação, consulta, encerramento), validação de *status callbacks* reaproveitando o validador existente, adaptador de sessão Millis via `register_sip_call` (ou Stream, conforme a resposta 2) e simuladores `FakeTwilioOriginationSimulator` e `FakeMillisConversationSimulator`. ConversationRelay continua preservado e inativo.
- **Se A**: 008-OF5 implementa offline um adaptador de originação Millis, o normalizador do *end-of-call webhook* com autenticação por cabeçalho (fail-closed, com reconciliação por consulta antes de qualquer efeito financeiro) e o simulador Millis.
- **Em ambos**: nenhuma chamada real, compra de número, credencial real, webhook público ou migração remota. A 008-OF6 continua exigindo os 9 bloqueios da ROADMAP e autorização separada.

## 4. H2 — Política de remoção de supressões

### 4.1 Estado atual (na `main`)

- `contact_suppressions`: por tenant e E.164, motivos `OPT_OUT`, `DO_NOT_CALL_REGISTRY` e `MANUAL`, `evidence_reference` opcional e `created_by_user_id`.
- Somente inclusão: não há remoção na API nem na UI. Um número suprimido não vira job (trigger) e não é discado (barreira do `claimSend`).
- Não existe lista global da plataforma; cada tenant mantém a sua.

### 4.2 Opções

| Opção | Regra | Prós | Contras |
| :--- | :--- | :--- | :--- |
| **P1 — Permanente** | Nunca remover; correções só por suporte da plataforma fora do produto | Máxima proteção ao titular e simplicidade | Bloqueia correção de erro de digitação e recontratação legítima; gera atrito operacional |
| **P2 — Revogação controlada por motivo** | Revogação lógica (registro preservado) com regras por motivo, papel restrito, justificativa e trilha de auditoria | Equilibra proteção e correção de erros; auditável | Mais regras para implementar e explicar |
| **P3 — Expiração por prazo** | Supressões expiram após prazo configurável | Automático | Contraria a natureza do opt-out (oposição do titular não expira); risco regulatório e reputacional |

### 4.3 Recomendação (para avaliação): **P2**, com estas regras

1. **Nunca apagar**: a revogação marca `revoked_at`, `revoked_by_user_id`, motivo da revogação e referência de evidência; a linha original é preservada e um evento de auditoria é gravado.
2. **Por motivo**:
   - `MANUAL` (ex.: erro de cadastro): revogável por OWNER ou ADMIN com justificativa obrigatória.
   - `OPT_OUT` (pedido do titular): revogável **somente** mediante novo consentimento do titular registrado **depois** da data do opt-out (vinculado a um registro de H3), por OWNER ou ADMIN. Recomenda-se dupla aprovação (quatro olhos).
   - `DO_NOT_CALL_REGISTRY`: não revogável manualmente; só por ressincronização futura com o cadastro de origem.
3. **Nunca em massa**: sem revogação por CSV ou em lote; uma por vez.
4. **Sem efeito retroativo**: a revogação não reabre campanhas em andamento; o número só fica elegível em materializações futuras.
5. **OPERATOR e VIEWER** nunca revogam.
6. **Lista global da plataforma** (números que reclamaram diretamente à plataforma, bloqueados para todos os tenants): proposta separada, a decidir — protege a reputação dos números Twilio compartilhados, mas exige base legal própria da plataforma e armazenamento minimizado (ex.: hash do número).

## 5. H3 — Evidência de consentimento e base legal

### 5.1 Contexto regulatório (não é parecer jurídico)

- **LGPD (Lei 13.709/2018)**: tratamento exige base legal (art. 7º — p.ex. consentimento, execução de contrato, legítimo interesse); se a base for consentimento, o ônus da prova é do controlador (art. 8º, §2º) e ele é revogável a qualquer momento (art. 8º, §5º); o titular pode se opor ao tratamento (art. 18). Nesta arquitetura, o **tenant é o controlador** dos contatos e a **plataforma é operadora**; a Millis e a Twilio seriam suboperadoras, com transferência internacional (art. 33).
- **Anatel**: a obrigatoriedade do prefixo 0303 para telemarketing ativo foi revogada em agosto de 2025, com prioridade para a autenticação de chamadas (Origem Verificada / STIR/SHAKEN), obrigatória primeiro para empresas acima de 500 mil chamadas/mês, com meta de cobertura total até 2028 ([Agência Brasil, 18/08/2025](https://agenciabrasil.ebc.com.br/geral/noticia/2025-08/anatel-justifica-fim-da-obrigatoriedade-do-uso-do-0303/), [Mobile Time, 07/08/2026](https://www.mobiletime.com.br/noticias/07/08/2026/anatel-6-bi-stir-shaken/)). A página da Twilio ainda menciona o 0303 (ver 3.2): divergência a confirmar.
- **"Não Me Perturbe"** e cadastros estaduais de bloqueio (ex.: Procon-SP): aplicabilidade a cada tenant depende do setor e do estado — `NOT_VERIFIED`; o motivo `DO_NOT_CALL_REGISTRY` já existe para registrá-los.
- **Inteligência artificial**: o PL 2338/2023 foi aprovado no Senado e aguarda parecer na Câmara (registro de 02/09/2026); não está em vigor ([CASRAI, 25/09/2026](https://casrai.org/guides/brazil-ai-bill-pl-2338-status)). Divulgar que o interlocutor é um agente automatizado é recomendado como boa prática; a obrigatoriedade fica para a revisão jurídica (H4).

### 5.2 Estado atual (na `main`)

`contacts.consent_reference` (texto opaco ≤ 200) e `contacts.consent_recorded_at`, opcionais; sem base legal estruturada, sem finalidade, sem revogação e sem efeito na elegibilidade.

### 5.3 Opções

| Opção | Modelo | Prós | Contras |
| :--- | :--- | :--- | :--- |
| **C1 — Declaração por importação/lista** | O tenant declara base legal e finalidade ao importar uma lista (registro por lote, com usuário e data) | Leve; rápido de implementar | Prova fraca por contato; difícil atender a um titular específico |
| **C2 — Registro estruturado por contato (append-only)** | Tabela de registros por tenant e E.164: base legal, finalidade, canal de coleta, data, versão do texto apresentado, referência externa e hash da evidência, quem registrou, revogação | Prova por contato; suporta revogação e P2; auditável | Mais esforço; exige que o tenant forneça a referência |
| **C3 — Evidência armazenada na plataforma** | C2 + upload do documento/áudio de consentimento | Prova mais forte | Mais dados pessoais sob custódia da plataforma (minimização), armazenamento e retenção ainda não decididos (R2 pendente) |

### 5.4 Recomendação (para avaliação): **C2**, com estas regras

1. Campos: `organization_id`, `phone_e164`, `contact_id` opcional, `legal_basis` (`CONSENT`, `CONTRACT`, `LEGITIMATE_INTEREST`, `OTHER_DECLARED`), `purpose` (ex.: contato comercial por voz automatizada), `collection_channel`, `captured_at`, `notice_version`, `evidence_reference` (ponteiro para o sistema do tenant) e `evidence_sha256` opcional, `recorded_by_user_id`, `revoked_at` e origem da revogação. **Sem armazenar o documento** (isso é C3).
2. Append-only: correções criam novo registro; revogação nunca apaga.
3. A revogação de consentimento cria automaticamente uma supressão `OPT_OUT`.
4. A importação CSV exige, por lote, a declaração do tenant (C1) como mínimo, e aceita referência por contato (C2).
5. Política de elegibilidade **configurável por tenant**, com padrão a decidir: `REQUIRE_BASIS` (sem registro válido, o contato não vira job — fail-closed) ou `WARN_ONLY`. Sugestão: `REQUIRE_BASIS` como padrão no Gate B.
6. Abertura da chamada: o *snapshot* do agente (008-MVP3) deve poder incluir identificação da empresa, aviso de agente automatizado e aviso de gravação quando houver; o texto exato fica com a revisão jurídica.

## 6. H4 — Revisão jurídica

Itens para advogado(a) antes do Gate A: aplicabilidade de normas de telemarketing e cadastros de bloqueio por setor e estado; base legal adequada por caso de uso; papéis controlador/operador e contratos (DPA) com Millis e Twilio; transferência internacional; aviso de IA e de gravação; retenção de transcrições e gravações (008-POST2); horários de contato.

## 7. Formato de resposta sugerido

```
H1: [A | B | ADIAR]   (observações)
H2: [P1 | P2 | P3]    (ajustes às regras de 4.3)
H3: [C1 | C2 | C3]    padrão de elegibilidade: [REQUIRE_BASIS | WARN_ONLY]
H4: responsável e prazo
```

Cada aprovação será registrada como nova DEC em `docs/DECISIONS_LOG.md` antes de qualquer implementação dependente.
