# Primeira ligação real (WSS), decisões do piloto comercial e diagnóstico financeiro (E0)

> **E0 — DEC-073.** Registro documental. Não autoriza ligações, gastos, endpoints públicos, configuração de fornecedores nem ativação da Base de Conhecimento v2.
> Data do registro: 25/11/2026. Fonte da evidência da ligação: relato do operador (não há log do fornecedor no repositório).

## 1. Evidência da primeira ligação real (25/11/2026)

**Classificação:** `OBSERVED` pelo operador, ligação única, supervisionada, para o celular verificado do próprio operador. **Não é homologação** de produção, de SIP nem da plataforma.

| Item | Valor informado pelo operador |
| :--- | :--- |
| Conta Twilio | Paga (Full), saldo inicial US$ 20, recarga automática desligada |
| Origem / destino | Número americano da Twilio → celular brasileiro verificado do operador |
| Originação | Calls API da Twilio com TwiML inline `<Connect><Stream url="wss://api-west.millis.ai:8080/twilio_inbound/{PUBLIC_KEY}/{AGENT_ID}"/></Connect>` |
| Parâmetros | `Timeout=30`, `TimeLimit=120`, `Record=false` |
| Transporte de áudio | Media Streams da Twilio por WebSocket seguro (WSS) até a Millis. **SIP não foi usado**; nenhuma credencial Twilio foi importada na Millis; nenhum webhook existente foi alterado |
| Agente | Dedicado "TESTE VOZ VAP" (não QUALITEC), modelo `gpt-5.6-luna`, voz Brian (ElevenLabs), pt-BR |
| Duração registrada pela Millis | 64 s, 418 caracteres, status `user-ended` |
| Custo Millis | US$ 0,0699 (TTS 0,0418; STT 0,0062; LLM 0,0005; plataforma 0,0214) |
| Custo Twilio | US$ 0,1414 (diferença de saldo; não é fatura) |
| Total observado | **US$ 0,2113** |
| Qualidade | Áudio e conversa aprovados pelo operador; possíveis erros pontuais de reconhecimento e um silêncio percebido, **causa não comprovada** |

**O que esta evidência NÃO prova:** a ligação iniciada pela plataforma, ferramentas e dados do backend durante a chamada, a origem +55, SIP (`<Dial><Sip>`), a escala, a gravação ou transcrição pela plataforma, nem o comportamento com clientes reais.

## 2. Decisões do operador (25/11/2026) — ver DEC-073

1. O primeiro piloto usa a integração **WSS Twilio ↔ Millis** comprovada.
2. A arquitetura continua **independente da operadora**: WSS é o transporte da Twilio; operadoras e BYOC futuros entram por SIP. Ferramentas, agenda e dados são chamadas HTTPS da Millis para a plataforma, sem depender da operadora.
3. A pilha antiga **#150–#154 não será integrada como está**. Componentes úteis serão reaproveitados em PRs novas sobre a `main` (comunicação HTTP, leitura e conferência de status da Twilio; mapeamento do agente da #153; verificação prévia da #154 adaptada ao WSS).
4. **#151 e #152 ficam preservadas** como referência para futuras integrações SIP.
5. **Opção A provisória** — agente temporário na Millis por tentativa de ligação, com credencial própria — condicionada à validação do contrato real da Millis.
6. Desenvolvimento OFFLINE das ferramentas de agendamento e das futuras escritas de reuniões **autorizado**, com isolamento, permissões e confirmação explícita. Isso abre exceção pontual à regra "integrações empresariais somente leitura", só para a agenda **da própria plataforma**; integrações com sistemas externos continuam somente leitura.
7. Armazenamento de transcrição **só planejado** e só para o teste supervisionado; gravação e tratamento de conversas de clientes reais continuam proibidos.

## 3. Lacunas contratuais da Millis (não bloqueiam o desenvolvimento offline)

Documentação pública consultada em 23 e 25/11/2026 (docs.millis.ai); nenhuma consulta autenticada feita.

| # | Lacuna | Impacto |
| :---: | :--- | :--- |
| M1 | Corpo do pedido que a Millis envia ao webhook de uma ferramenta (argumentos, `session_id`, metadados) não documentado | Define como a plataforma identifica a ligação |
| M2 | Uso de variáveis `{metadado}` em **cabeçalhos** de ferramentas não documentado (há menção a parâmetros e funções) | Opção B depende disso |
| M3 | Parâmetros personalizados do `<Stream>` da Twilio chegarem à Millis como metadados: não documentado | Alternativa de correlação |
| M4 | Assinatura das chamadas de webhook, repetições e tempo limite: não documentados (só cabeçalhos estáticos) | Estratégia de segurança (§4) |
| M5 | Criação e exclusão de agente por API (Opção A): endpoints documentados; limites, latência e custo de agentes temporários não documentados | Validar antes do piloto |
| M6 | Compatibilidade, codecs e SRTP do SIP (para operadoras futuras) | Fora do piloto WSS |

As mensagens prontas para os fornecedores foram entregues ao operador em 23/11/2026; o envio fica a critério dele.

## 4. Estratégia de segurança para as ferramentas do piloto (planejamento; implementação na E2/E4)

- **Credencial por tentativa de ligação** (não por requisição): criada pelo servidor ao preparar a tentativa, guardada só como hash, vinculada a organização, agente, versão publicada e tentativa.
  - Permite **várias** chamadas de ferramentas durante a sessão.
  - **Expira** (prazo curto após o fim da ligação) e é **revogável** a qualquer momento (encerramento, botão de parada, incidente).
  - Não é um token descartado após o primeiro uso.
- A Millis só recebe a credencial no cabeçalho das ferramentas do agente temporário (Opção A); nada vai ao navegador nem a logs.
- O contexto (empresa, agente, versão, tentativa) vem **sempre** do registro durável da tentativa, nunca do corpo enviado pelo fornecedor (padrão já usado pelo ingresso 008-OF4).
- Somente as ferramentas concedidas pela versão publicada; limite de tamanho (já existente), limite de requisições e tempo limite.
- Reservas de reunião pelo agente só a partir de **ofertas registradas** pelo servidor (E1: `meeting_slot_offers`), com reconsulta da agenda na transação e confirmação explícita do lead (E2).
- Exposição pública: um gateway mínimo só com as rotas de webhook, separado da API principal; depende de autorização própria (E5).

## 5. Diagnóstico do sistema financeiro existente (requisito futuro)

**Objetivo do operador:** mensalidade + créditos pré-pagos comprados na plataforma (Pix ou cartão); Twilio, Millis e operadoras administradas pela plataforma.

| Componente pedido | Situação no código (`main` `755aa37`) |
| :--- | :--- |
| Carteira individual por empresa | **Ausente.** Existe `outbound_budget_ledgers` por organização, mas é um **teto de gasto de fornecedor** (centavos de USD), não um saldo de créditos comprados |
| Histórico financeiro auditável | **Parcial.** `outbound_budget_reservations` (reserva → liquidação/liberação) e `audit_logs`; não há lançamentos de crédito, compra ou estorno |
| Confirmação idempotente de pagamentos | **Ausente.** Nenhum gateway; DECISIONS_LOG §2: "Gateway de Pagamento / Faturamento SaaS — Pending Decision" |
| Reserva de saldo antes das chamadas | **Existe** para o custo de fornecedor: reserva por tentativa, global e por empresa, com bloqueio fail-closed (008-OF3, PRs #122–#124) |
| Débito e conciliação de consumo | **Parcial.** Liquidação separa custo de operadora e de conversação (`settled_carrier`, `settled_conversational`) por estimativa; não há conciliação com fatura real do fornecedor |
| Controle de chamadas simultâneas | **Existe:** `max_concurrent_calls` global e por empresa |
| Tarifas comerciais configuráveis | **Ausente.** `plans.price_cents` (mensalidade) existe; não há tarifa por minuto de venda |
| Custo de fornecedor × preço de venda | **Parcial.** Só o custo (USD). `docs/COST_MODEL.md` separa Usage, Cost e Billing (DEC-022), mas Billing não existe |
| Margem, câmbio e despesas | **Ausente** (sem taxa de câmbio, margem ou despesas) |
| Bloqueio por saldo insuficiente | **Existe** para o teto de fornecedor (`INSUFFICIENT_FUNDS`, `GLOBAL_INSUFFICIENT_FUNDS`); não para créditos comprados |
| Monitoramento de saldo dos fornecedores | **Ausente** |
| Planos, assinaturas, concessões e direitos | **Existe** (`plans`, `entitlements`, `subscriptions`, `commercial_grants`, DEC-020/021/030), sem cobrança |

**Compatibilidade das decisões atuais:** a E1 não toca dinheiro; `meetings.source_attempt_id` liga a reunião à tentativa, que já liga à reserva de orçamento, então o custo por reunião será atribuível. Nada na E0/E1 impede uma futura carteira (créditos em BRL + lançamentos append-only + conversão do custo USD com câmbio registrado), que exige decisão própria (gateway, moeda, câmbio, impostos e tratamento contábil).
