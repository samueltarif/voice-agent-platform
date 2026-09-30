# Arquitetura do Motor de Voz em Tempo Real (VOICE_ARCHITECTURE.md)

Este documento especifica o funcionamento técnico do serviço de voz (`apps/voice`), detalhando o pipeline de áudio bidirecional de baixa latência, o tratamento de interrupções (*barge-in*), a orquestração de diálogos e o acionamento determinístico de ferramentas (*tool calling*).

> **Revisado em**: 21 de Setembro de 2026 (PROMPT-001B)

---

## 1. Princípios Operacionais da Conversação de Voz

1. **Baixa Latência como Objetivo de Engenharia**: O objetivo de engenharia inicial é minimizar ao máximo a latência ponta a ponta (tempo entre o final da fala do usuário e o início da resposta do agente). A meta de referência inicial é `<800ms`, porém esse valor ainda **não é um SLA definitivo aprovado** — deve ser validado experimentalmente com dados reais de produção. Consulte `docs/OBSERVABILITY.md` para a estratégia de medição (p50, p95, p99, time-to-first-audio, etc.).
2. **Interrupção Humana Natural (*Barge-In*)**: Quando o interlocutor humano começar a falar enquanto a IA estiver reproduzindo áudio, o sistema deve interromper imediatamente a transmissão do áudio pendente, descartar a fila de saída e registrar o evento de cancelamento no contexto.
3. **Memória Conversacional e Estado**: O contexto da chamada deve ser mantido de forma leve durante a sessão em memória/cache rápido, permitindo referências a tópicos abordados anteriormente no diálogo.
4. **Execução Determinística de Ferramentas**: Durante a conversa, o modelo pode solicitar a execução de ferramentas. Regras de negócio, preços, checagens de disponibilidade e gravações são executadas por código determinístico, retornando o resultado ao modelo sem que ele invente dados.

---

## 2. Pipeline de Áudio Bidirecional em Tempo Real

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Canal Telefônico                              │
│                      (PSTN / SIP / WebSockets)                         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Stream de Áudio (ex: G.711 / PCM 8k/16k)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        apps/voice (Voice Engine)                       │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ 1. Ingestão & VAD (Voice Activity Detection)                   │   │
│   │    - Detecta início da fala do usuário                         │   │
│   │    - Dispara sinal de cancelamento imediato de TTS (Barge-in)  │   │
│   │    - Detecta final de turno (parâmetros configuráveis)         │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   ▼                                    │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ 2. Orquestração Conversacional (via RealtimeAIProvider)        │   │
│   │    - Modelo multimodal direto (Áudio -> Áudio) OU              │   │
│   │    - Pipeline em cascata (STT -> LLM Streaming -> TTS)         │   │
│   │    - Injeção de System Prompt, persona e restrições de tenant  │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   ▼                                    │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ 3. Execução Determinística de Ferramentas (Tool Calling)       │   │
│   │    - Validação estrita de parâmetros solicitados pela IA       │   │
│   │    - Execução via Domain Services (ex: consultar produtos)     │   │
│   │    - Retorno imediato do resultado ao contexto do diálogo      │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   ▼                                    │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ 4. Transmissão do Áudio de Resposta (Streaming TTS)            │   │
│   │    - Envio de chunks contínuos de áudio para a telefonia       │   │
│   │    - Interrupção instantânea se VAD sinalizar fala humana      │   │
│   └────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Gestão de Interrupção Humana (*Barge-In*)

O algoritmo de barge-in opera segundo as seguintes regras de estado:

1. **Estado: Falando (Agent Speaking)**: O agente está transmitindo áudio de síntese para a chamada.
2. **Gatilho de Interrupção**: O VAD identifica atividade vocal contínua do interlocutor acima do limiar configurado (descartando ruídos breves de fundo, tossidas ou estalos). O limiar de duração mínima de fala para acionamento de barge-in é **configurável por provider, idioma, cenário e ambiente acústico** — nenhum valor é fixado como regra arquitetural permanente.
3. **Ações Imediatas de Cancelamento**:
   - Enviar comando de *clear audio buffer* para o provedor de telefonia imediatamente;
   - Cancelar a geração dos tokens/áudios restantes no provedor de IA (`RealtimeAIProvider`);
   - Atualizar a transcrição em memória marcando o ponto exato da fala onde ocorreu a interrupção;
   - Transicionar estado para *Ouvindo (Agent Listening)*.

---

## 4. Orquestração de Ferramentas (Tool Calling Determinístico)

Durante o diálogo, o agente de voz pode ter acesso a um conjunto de ferramentas declaradas:

```
Conversa ──► IA emite intenção: `checkProductPrice(sku: "PRD-102")`
                 │
                 ▼
         apps/voice intercepta
                 │
                 ▼
         Valida `organizationId` e parâmetros
                 │
                 ▼
         Executa `ProductPricingService.getPrice("PRD-102")` (código determinístico)
                 │
                 ▼
         Retorna: `{ price: 149.90, currency: "BRL", stock: 12 }`
                 │
                 ▼
         IA recebe dado real e sintetiza resposta natural ao cliente:
         "O produto está disponível por R$ 149,90 e temos 12 unidades."
```

- A IA **nunca** inventa o preço ou confirma transações sem invocar e receber o retorno da ferramenta determinística.
- Todas as execuções de ferramentas publicam eventos internos: `call.tool_started` e `call.tool_completed`.

---

## 4B. VAD — Princípio de Configurabilidade

Os parâmetros de detecção de atividade de voz (VAD) e detecção de fim de turno devem ser:

- **Configuráveis**: Por provider de IA, idioma do agente, cenário de uso e ambiente acústico.
- **Observáveis**: Métricas de VAD exportadas para o sistema de observabilidade (ex.: `voice.vad.silence_detection_ms`).
- **Testáveis**: Valores facilmente alteráveis em testes automatizados sem recompilação.
- **Calibráveis**: Ajustáveis por operador humano com base em dados reais de produção.

Exemplos de parâmetros configuráveis (valores são exemplos ilustrativos, não regras fixas):
- Duração mínima de fala para confirmar atividade vocal.
- Duração de silêncio para detectar fim de turno.
- Sensibilidade a ruídos de fundo.
- Latência de cancelamento de barge-in.

> Nenhum valor numérico de VAD deve ser tratado como regra arquitetural imutável. Os valores são resultado de calibração experimental.

---

## 5. Status de Fornecedores de Voz

- **Abordagem Técnica**:
  - Modelo A: **Pipeline Integrado Realtime Multimodal** (ex.: OpenAI Realtime API).
  - Modelo B: **Pipeline Modular em Cascata** (Deepgram Nova-2 STT + LLM rápido streaming + ElevenLabs / Cartesia TTS).
- **Decisão Definitiva**: **Status: Pending Decision**.
  A arquitetura isola essa escolha no pacote `packages/integrations`, permitindo suportar qualquer uma das abordagens via `RealtimeAIProvider`.

---

## 6. Monitoramento em Tempo Real, Gravações e Transbordo Humano

O motor de voz integra-se nativamente aos subsistemas de acompanhamento de chamadas ativas e transferência de controle:
- **Live Call Telemetry**: Transmissão contínua de transcrições parciais, eventos e métricas de turno;
- **Call Recording**: Gravação da sessão para object storage com acesso autenticado/temporário e isolamento por tenant;
- **Human Handoff Protocol**: Transbordo assistido para operadores humanos com máquina de estados determinística (`NONE` → `REQUESTED` → `SELLER_NOTIFIED` → `SELLER_READY` → `AI_PREPARING` → `READY_TO_JOIN` → `HUMAN_CONNECTED` → `AI_DETACHED`).

> Para a especificação completa de fluxos, estados, modo listen-only e eventos canônicos de gravação e handoff, consulte [docs/LIVE_CALLS_AND_HANDOFF.md](file:///d:/voice-agent-platform/docs/LIVE_CALLS_AND_HANDOFF.md).

---

## 7. Expressividade Conversacional de Voz (Conversational Voice Expressivity)

> **Status do Requisito**: `VOICE_CONVERSATIONAL_EXPRESSIVITY = REQUIRED_FUTURE_CAPABILITY`<br />
> **Prioridade de Engenharia**: `PRODUCT_DESIRED = YES` | `CURRENT_IMPLEMENTATION_PRIORITY = LATER_VOICE_EXPERIENCE_SLICE`<br />
> **Suporte Técnico de Provedor**: `NATURAL_LAUGHTER_PROVIDER_SUPPORT = NOT VERIFIED`<br />
> **Implementação no Slice Atual**: `NO` (Registro documental de requisito futuro)

### 7.1. Objetivo e Escopo do Requisito

Permitir que agentes de voz demonstrem expressividade acústica e conversacional limitada, contextual e configurável, reduzindo comportamentos robóticos ou mecânicos e preservando a naturalidade, adequação situacional e segurança da chamada.

### 7.2. Capacidades-Alvo Futuras (Target Capabilities)

As capacidades planejadas para a camada de expressividade incluem:
- **Risadas ou risos curtos e contextuais (*short laughter / chuckle*)**;
- **Pausas naturais e ritmo de fala humanizado**;
- **Reconhecimentos conversacionais (*conversational acknowledgements*)**;
- **Sinais de escuta ativa (*backchannels*)**;
- **Variação de prosódia e entonação**;
- **Estilo de resposta consciente de interrupção (*interruption-aware response style*)**;
- **Recuperação enxuta e rápida após interrupção (*shorter recovery after barge-in*)**;
- **Espelhamento emocional contido e calibrado (*restrained emotional mirroring*)**;
- **Expressividade configurável granularmente por agente de voz**.

### 7.3. Princípio de Não-Espelhamento Automático (No Blind Emotion Mirroring)

Fica formalmente estabelecida a invariante comportamental:
$$\text{CUSTOMER\_LAUGHTER} \centernot\implies \text{AGENT\_LAUGHTER}$$

O riso ou descontração do usuário **NÃO IMPLICA** riso correspondente pelo agente. A decisão conversacional deve ponderar obrigatoriamente:
1. Contexto semântico e tópico do diálogo;
2. Persona e perfil de personalidade do agente;
3. Nível configurado de expressividade;
4. Segurança e sensibilidade da situação;
5. Estado atual da interação na chamada.

**Exemplos Conceituais**:
- *Cenário Leve / Seguro*: Interlocutor diz *"Hahaha, essa foi boa."* $\to$ Agente responde com comentário amigável/bem-humorado ou riso curto natural, prosseguindo com o objetivo da chamada.
- *Cenário Delicado / Risco*: Interlocutor diz *"Haha... tô devendo muito e não sei o que fazer."* $\to$ Agente **NÃO PODE** espelhar o riso sob nenhuma hipótese; deve manter tom sóbrio, empático e focado na resolução.

### 7.4. Restrição Estrita em Contextos Sensíveis

A expressividade humorística ou risadas devem ser estritamente bloqueadas/suprimidas em situações sensíveis, incluindo (sem constituir classificação exaustiva):
- Cobrança e renegociação de dívidas;
- Reclamações e contestações;
- Situações de perda, luto ou fragilidade;
- Questões de saúde e emergência médica;
- Fraude, denúncia e disputas;
- Ameaças e riscos à segurança física ou patrimonial;
- Notificação de erro operacional grave do sistema ou serviço;
- Cancelamentos críticos ou sensíveis;
- Qualquer interação classificada como emocionalmente delicada.

### 7.5. Separação de Responsabilidades (LLM vs. TTS vs. Aplicação)

1. **Camada Conversacional / LLM**: Determina o conteúdo da fala e se uma expressão é contextualmente apropriada com base nas diretrizes do agente.
2. **Camada de Síntese de Voz / TTS**: Renderiza a expressão acústica suportada de forma natural e sem artefatos mecânicos.
3. **Plataforma / Aplicação (`apps/voice`)**: Aplica políticas de segurança, limites configurados no Agent Studio, cancelamento imediato em barge-in e observabilidade.

> [!WARNING]
> Nunca presumir que emitir texto bruto como `"hahaha"` ou `"kkk"` resulte em risada natural na síntese. Texto com risadas literais frequentemente soa artificial, mecânico e robotizado em sintetizadores de fala tradicionais.

### 7.6. Gate de Capacidades Técnicas do Provedor (Provider Capability Gate)

Antes de qualquer implementação funcional em código, é obrigatório homologar formalmente contra a documentação oficial e API do provedor de voz/TTS em uso:
- Suporte nativo a risos ou expressões não-verbais (*laughter/chuckle support*);
- Estilos expressivos e controle fino de prosódia/entonação;
- Inserção de pausas e suporte a SSML ou marcações canônicas de eventos;
- Compatibilidade com streaming de áudio bidirecional e ConversationRelay / WebSockets;
- Comportamento acústico diante de interrupções imediatas.

*Status atual*: `NATURAL_LAUGHTER_PROVIDER_SUPPORT = NOT VERIFIED`. É vedado presumir capacidades não homologadas.

### 7.7. Política de Fallback

Se o provedor de síntese em uso não possuir capacidade acústica nativa para renderizar expressões naturais:
- **Priorizar resposta verbal natural limpa sem risada artificial**: Uma resposta textual como *"Essa foi boa, entendi perfeitamente"* é superior e preferível a uma sintetização robótica e constrangedora de *"ha ha ha"*.

### 7.8. Invariante de Interrupção (*Barge-In Relation*)

A camada de expressividade conversacional subordina-se estritamente ao mecanismo de barge-in da plataforma:
- Expressões e risadas constituem áudio sintetizado e **devem ser imediatamente canceláveis** ao menor sinal de atividade vocal humana (`user.interruption`);
- A expressividade nunca pode bloquear ou postergar o descarte de buffers de áudio, o cancelamento da geração em andamento ou a supressão de chunks desatualizados (*stale chunks*).

### 7.9. Observabilidade e Telemetria de Expressividade

Métricas estruturadas planejadas para futura instrumentação:
- `expressive_event_requested`: Tentativas de acionamento deliberadas pelo modelo;
- `expressive_event_rendered`: Expressões efetivamente sintetizadas pelo TTS;
- `expressive_event_suppressed`: Expressões bloqueadas por contexto sensível ou política do agente;
- `expressive_event_interrupted`: Expressões canceladas por barge-in do usuário;
- `provider_expression_capability`: Disponibilidade e latência das extensões expressivas no provedor.

> [!IMPORTANT]
> Em conformidade com as regras de privacidade e proteção de dados, é proibido registrar transcripts de usuários ou dados sensíveis em logs estruturados apenas para telemetria de expressividade.

### 7.10. Quality Gate Perceptual Humano

Antes de qualquer liberação de recursos de expressividade vocal em ambiente de produção, será conduzida uma avaliação perceptual humana controlada sobre amostras gravadas, avaliando:
- Naturalidade (*naturalness*);
- Constrangimento ou estranheza (*awkwardness*);
- Risos descontextualizados ou inapropriados (*inappropriate laughter*);
- Fluidez de recuperação sob interrupção (*interruption behavior*);
- Artefatos de pronúncia ou clipping acústico;
- Latência adicional introduzida no pipeline de síntese;
- Consistência auditiva entre vozes, idiomas e gêneros.
