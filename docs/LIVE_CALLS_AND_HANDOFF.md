# Monitoramento ao Vivo, Gravações e Transbordo Humano (LIVE_CALLS_AND_HANDOFF.md)

> **Status**: Requisito Arquitetural Formal — Documentação Conceitual
> **Fase de Planejamento**: FASE 5 (Domínios Base), FASE 6 (Motor de Voz) e FASE 8 (Telefonia Real)
> **Data de Formalização**: 22 de Setembro de 2026 (PROMPT-002H)

Este documento especifica os requisitos arquiteturais para acompanhamento de chamadas em tempo real, armazenamento e governança de gravações, e o protocolo determinístico de transbordo para operadores humanos (*Human Handoff*).

---

## 1. Monitoramento de Chamadas em Tempo Real (Live Call Monitoring)

A visualização e acompanhamento de chamadas ativas em andamento é um requisito oficial do produto para supervisores e operadores comerciais autorizados da organização.

### 1.1. Visibilidade e Telemetria em Tempo Real
Para chamadas em andamento, o painel de monitoramento deve permitir visualizar:
- **Status da Chamada**: Estado corrente da conexão telefônica (discando, tocando, conectada, em diálogo, handoff em curso);
- **Duração**: Cronômetro de tempo decorrido da chamada;
- **Agente de Voz Ativo**: Identificação do agente e versão em execução;
- **Contato / Cliente**: Nome, número discado e dados contextuais da lista;
- **Transcrição em Tempo Real**: Fluxo de texto com separação de falas (interlocutor vs. agente de voz);
- **Eventos Operacionais**: Sinais de detecção de voz, acionamento de ferramentas determinísticas e respostas;
- **Tools Utilizadas**: Histórico e parâmetros de ferramentas invocadas no turno;
- **Sinais de Interesse / Qualificação**: Classificações preliminares de intenção identificadas pelo contexto;
- **Status do Handoff**: Indicação se há pedido de transferência para vendedor, vendedor notificado ou aguardando;
- **Vendedor Aguardando**: Identificação do operador alocado no protocolo de transferência.

### 1.2. Áudio ao Vivo (Live Audio Stream)
- **Status Arquitetural**: `STATUS: PLANNED / PROVIDER-DEPENDENT / NOT YET VALIDATED`
- **Ressalva Obrigatória**: A capacidade de ouvir o fluxo de áudio da chamada em tempo real pelo navegador depende de suporte técnico específico da arquitetura do provedor de telefonia e de streaming (WebRTC/WebSockets bidirecionais). Nenhum fornecedor (Twilio, Telnyx, etc.) teve suporte validado experimentalmente nesta fase.

---

## 2. Gravação de Chamadas (Call Recording)

A persistência e reprodução de áudios de chamadas telefônicas constituem um ativo central para auditoria, treinamento de modelos, conformidade e avaliação contínua.

### 2.1. Ativos Associados a uma Chamada Telefônica
Cada chamada telefônica finalizada pode conter os seguintes componentes correlacionados:
- **Recording Asset**: Arquivo de áudio gravado (ex.: estéreo com canais separados ou mono comprimido);
- **Transcript**: Transcrição textual completa com alinhamento temporal e diarização;
- **Summary**: Sumarização executiva dos tópicos tratados e acordos firmados;
- **Timeline**: Linha do tempo sequencial dos eventos da ligação;
- **Events**: Conjunto de eventos internos disparados durante a sessão;
- **Tool Calls**: Registro de ferramentas acionadas, parâmetros e retornos;
- **Handoff History**: Histórico do protocolo de transbordo caso tenha ocorrido;
- **Participants**: Relação de participantes (agente, cliente, operadores humanos);
- **Outcome**: Desfecho final classificado (agendado, qualificado, sem interesse, caixa postal, transferido).

### 2.2. Reprodução e Segurança de Acesso
- Usuários autorizados da organização poderão reproduzir gravações diretamente na aplicação web.
- **Acesso Restrito via URLs Pré-Assinadas**: O acesso a arquivos de áudio armazenados no object storage ocorre exclusivamente através de URLs temporárias pré-assinadas (*presigned URLs*), emitidas sob demanda após validação de autenticação e tenant (`organizationId`).
- O **tempo de expiração (TTL)** das URLs é configurável por ambiente.

### 2.3. Diretrizes de Infraestrutura e Governança
- **Object Storage**: Acesso encapsulado estritamente via `StorageProvider`;
- **Tenant Isolation**: Organização e arquivos estruturados com chave de partição lógica por organização;
- **Encryption**: Criptografia mandatória em repouso (at-rest) e em trânsito (TLS);
- **Access Audit**: Todo acesso ou download de gravação deve ser registrado na trilha de auditoria;
- **Políticas de Retenção e Expurgo**: O sistema deve permitir configurar regras de expiração, anonimização e exclusão automática de áudios por organização.

> [!WARNING]
> **Ressalva de Conformidade Jurídica**:
> `COMPLIANCE VERIFICATION REQUIRED BEFORE PRODUCTION`
> As normas jurídicas aplicáveis a gravação de chamadas, consentimento do interlocutor, regulamentação de telecomunicações (Anatel) e proteção de dados pessoais (LGPD/GDPR) NÃO estão verificadas nesta tarefa. Requisitos definitivos de aviso sonoro e prazos de retenção serão estabelecidos após parecer jurídico formal antes de produção.

---

## 3. Protocolo de Transbordo para Humano (Human Handoff)

O transbordo para operadores humanos é uma capacidade nativa de primeira classe da plataforma.

### 3.1. Princípio do Protocolo de Transbordo
- O ato de clicar em "Transferir para vendedor" ou o reconhecimento de uma oportunidade pela IA **não significa derrubar o cliente ou transferi-lo às cegas**.
- Essa ação inicia formalmente um **Protocolo de Handoff Orquestrado**:
  1. A IA identifica a oportunidade ou recebe solicitação de transferência;
  2. Um `Handoff Request` é despachado para a fila de vendas da organização;
  3. O vendedor/equipe é notificado com o resumo contextual prévio;
  4. Um vendedor aceita a solicitação e entra em estado de prontidão;
  5. Enquanto isso, a IA continua dialogando naturalmente com o cliente, sem pausas constrangedoras ou silêncio;
  6. A IA prepara a transição conversacional ("Estou conectando você agora com nosso especialista...");
  7. O sistema determinístico detecta o momento ideal de encaixe e sinaliza `READY_TO_JOIN`;
  8. O vendedor recebe sinal verde e se conecta à linha;
  9. A IA desengaja suavemente da condução da chamada (`AI_DETACHED`).

### 3.2. Controle Determinístico Obrigatório
- Modelos de linguagem (LLMs) auxiliam no tom e na fluidez conversacional da transição, mas **NUNCA controlam sozinhos o fluxo de conexão, estados ou autorizações**.
- A máquina de estados, validação de permissões, alocação de participantes, controle de linha telefônica, timeouts e cancelamentos são executados **estritamente por código determinístico testável**.

---

## 4. Máquina de Estados do Handoff (State Machine Conceitual)

O ciclo de vida do transbordo humano segue a seguinte state machine conceitual:

```
[NONE]
  │
  ▼
[REQUESTED] ───────────────► [TIMED_OUT / FAILED]
  │
  ▼
[SELLER_NOTIFIED] ─────────► [TIMED_OUT / FAILED]
  │
  ▼
[SELLER_READY] ────────────► [CANCELED]
  │
  ▼
[AI_PREPARING]
  │
  ▼
[READY_TO_JOIN]
  │
  ▼
[HUMAN_CONNECTED]
  │
  ▼
[AI_DETACHED]
```

### 4.1. Descrição dos Estados
- **`NONE`**: Estado padrão da chamada sem solicitação de transbordo ativo.
- **`REQUESTED`**: Intenção de transferência registrada pelo agente de voz ou por regra de negócio.
- **`SELLER_NOTIFIED`**: Fila de operadores comerciais notificada do pedido com briefing da conversa.
- **`SELLER_READY`**: Um vendedor específico aceitou o atendimento e aguarda o momento de entrada.
- **`AI_PREPARING`**: A IA está finalizando o raciocínio em curso e preparando o interlocutor para a entrada humana.
- **`READY_TO_JOIN`**: Momento acústico e conversacional ideal atingido; sinal verde emitido ao vendedor.
- **`HUMAN_CONNECTED`**: Canal de áudio do operador humano ativo na chamada com o cliente.
- **`AI_DETACHED`**: Agente de IA desvinculado da orquestração de fala da chamada; controle integral com o humano.
- **`FAILED`**: Falha técnica na sinalização SIP, bridging de áudio ou comunicação com o vendedor.
- **`CANCELED`**: Cancelamento manual do pedido pelo operador ou desistência explícita do cliente.
- **`TIMED_OUT`**: Esgotamento do tempo limite configurado para aceite ou conexão do vendedor.

---

## 5. Experiência do Operador: Espera e Modo Escuta (Listen-Only)

Durante a fase de prontidão do vendedor (`SELLER_READY`), a experiência desejada contempla:
1. **Contexto Imediato**: Exibição em tela de resumo estruturado, dados do lead e transcrição em tempo real;
2. **Sinalização Visual**: Indicador claro do momento de entrada (`READY_TO_JOIN`);
3. **Modo Escuta (*Listen-Only*)**:
   - Capacidade desejada onde o vendedor pode ouvir o áudio do diálogo (cliente + IA) antes de ingressar na chamada;
   - O cliente e a IA não escutam o vendedor enquanto este estiver em modo escuta;
   - **Status Arquitetural**: `PLANNED / PROVIDER-DEPENDENT / NOT YET VALIDATED`. Depende de suporte a conferência com muting seletivo por canal na telefonia.
4. **Whisper / Coach**:
   - Orientação sussurrada de supervisor para o vendedor; considerado como evolução futura fora do escopo MVP desta tarefa.

---

## 6. Fallback Obrigatório de Handoff e Prevenção de Abandono

A plataforma estabelece como regra fundamental de experiência do cliente:
- **Zero Silêncio Indefinido**: O cliente **nunca** deve ser deixado em silêncio absoluto ou com música de espera indefinida por ausência de resposta humana.

### 6.1. Regras de Fallback
Em caso de timeout na fila comercial (`TIMED_OUT`), ausência de operadores (`FAILED`) ou cancelamento (`CANCELED`):
1. A IA retoma a condução ativa do diálogo de maneira educada e fluida;
2. O agente pode oferecer alternativas configuráveis pela organização:
   - Continuar o atendimento automatizado com a própria IA;
   - Agendar um retorno telefônico por um especialista em horário conveniente (*callback*);
   - Encaminhar a demanda para atendimento assíncrono via WhatsApp ou e-mail.
3. **Configurabilidade de Timeouts**:
   - O tempo limite de espera por um vendedor deve ser configurável por organização e por campanha;
   - Nenhum valor numérico fixo em segundos é fixado nesta fase documental.

---

## 7. Fila de Vendas e Disponibilidade (Sales Queue & Seller Availability)

Para gerenciar o transbordo em escala, a arquitetura prevê conceitualmente:
- **Sales Queue**: Agrupamento de operadores por habilidades, produto ou campanha;
- **Seller Availability**: Controle de presença e prontidão dos operadores (ex.: Disponível, Em Atendimento, Ausente);
- **Human Participant**: Representação do operador humano como participante formal da chamada;
- **Handoff Assignment**: Registro de auditoria indicando qual operador aceitou e assumiu a chamada.

---

## 8. Eventos Canônicos de Gravação e Handoff

Os novos fluxos operam sob os seguintes eventos internos versionados (envelope canônico de `docs/EVENTS.md`):

### 8.1. Eventos de Gravação
- `call.recording_started` (v1.0): Sinaliza o início da gravação de áudio da chamada.
- `call.recording_available` (v1.0): Áudio processado, transferido para object storage e disponível para reprodução.

### 8.2. Eventos de Transbordo Humano
- `call.handoff_requested` (v1.0): Pedido de transbordo iniciado pela IA ou por regra de negócio.
- `call.seller_notified` (v1.0): Operadores da fila comercial notificados sobre a oportunidade.
- `call.seller_ready` (v1.0): Um operador aceitou a chamada e aguarda autorização para entrar.
- `call.handoff_ready` (v1.0): A IA preparou o cliente e o sistema liberou a entrada do vendedor (`READY_TO_JOIN`).
- `call.human_joined` (v1.0): Operador humano conectado ativamente no canal de áudio com o cliente.
- `call.ai_detached` (v1.0): Agente de IA desvinculado com sucesso da fala da chamada.
- `call.handoff_failed` (v1.0): Falha técnica no estabelecimento da conexão do transbordo.
- `call.handoff_canceled` (v1.0): Protocolo de transbordo cancelado antes da conexão do operador.

---

## 9. Métricas e Analytics Futuros de Atendimento

O subsistema de analytics da plataforma deverá permitir medir e correlacionar:
- **Volume de Chamadas**: Chamadas disparadas, atendidas e tempo médio de conversação;
- **Funil de Handoff**: Handoffs solicitados vs. handoffs efetivamente concluídos;
- **Tempo de Resposta (TTA - Time to Answer)**: Tempo entre a solicitação e o momento em que o vendedor assume;
- **Taxa de Conversão pós-Handoff**: Índice de sucesso comercial de ligações onde houve transbordo humano;
- **Custo Integrado**: Custo da chamada agregando minutos de IA e minutos de telefonia do operador humano;
- **Performance Comparada**: Desempenho por agente de voz, por operador humano e por campanha.

---

## 10. Status de Implementação e Validação Técnica

| Capacidade | Status Arquitetural | Nota de Validação |
| :--- | :--- | :--- |
| **Live Call Telemetry** | `PLANNED` | Telemetria textual e de status via WebSockets/SSE. |
| **Live Audio Stream** | `NOT YET VALIDATED` | `PROVIDER-DEPENDENT`. Não validado com provider real. |
| **Call Recording** | `PLANNED` | Depende de configuração de carrier e object storage na FASE 6/8. |
| **Listen-Only Mode** | `NOT YET VALIDATED` | `PROVIDER-DEPENDENT`. Depende de suporte a conferência com mute seletivo. |
| **Human Handoff Protocol**| `PLANNED` | Arquitetura de máquina de estados definida; não implementada. |
| **Compliance de Gravação** | `COMPLIANCE REQUIRED`| Verificação jurídica necessária antes de produção. |
