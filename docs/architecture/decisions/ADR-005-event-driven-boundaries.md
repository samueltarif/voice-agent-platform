# ADR-005: Fronteiras Orientadas a Eventos Internos Versionáveis

- **Status**: Accepted
- **Data**: 2026-09-21

---

## Context (Contexto)

O ciclo de vida de uma chamada telefônica envolve múltiplos estágios e efeitos colaterais: sinalização de início, streaming de áudio, execução de ferramentas, encerramento, cálculo financeiro de custos, upload de gravações de áudio, geração de transcrição em texto, diarização, análise de sentimento e sincronização com CRM.

Se o motor de voz em tempo real (`apps/voice`) tentar executar todas essas tarefas secundárias de forma síncrona e acoplada, haverá sério risco de:
1. Elevação da latência ou travamento do streaming de áudio por lentidão em tarefas secundárias;
2. Queda da chamada caso um serviço de terceiros (ex.: CRM ou transcriptor) falhe;
3. Dificuldade de auditar e reconstruir o histórico de eventos da ligação.

---

## Decision (Decisão)

Adotar **Fronteiras Orientadas a Eventos Internos Versionáveis**.

O serviço de voz e a API emitem eventos de domínio em momentos-chave (`call.created`, `call.started`, `call.tool_started`, `call.ended`, etc.). Os eventos seguem um envelope rígido com `id`, `name`, `version`, `timestamp`, `organizationId` e `correlationId`.

Tarefas desacopladas (transcrição completa, analytics, billing, envio de webhooks) são consumidas e processadas de forma assíncrona por workers dedicados (`apps/worker`), garantindo que o fluxo crítico de áudio permaneça imune a lentidões externas.

---

## Alternatives Considered (Alternativas Consideradas)

1. **Execução Síncrona Monolítica**:
   - *Descarte*: Acoplaria a estabilidade de uma chamada telefônica em andamento a serviços externos de CRM ou armazenamento, degradando a performance em tempo real.
2. **Consultas de Polling no Banco de Dados**:
   - *Descarte*: Ineficiente, adiciona latência artificial na entrega de transcrições e onera o banco relacional com leituras repetitivas.

---

## Consequences (Consequências)

### Positivas:
- O motor de voz em tempo real foca exclusivamente no pipeline de áudio de baixa latência;
- Falhas em serviços secundários não interrompem a conversa telefônica;
- Rastreamento ponta a ponta facilitado pelo `correlationId`;
- Consumidores assíncronos podem escalar independentemente.

### Negativas / Desafios:
- Exige que os consumidores de eventos implementem idempotência para lidar com possíveis reentregas de mensagens;
- Introduz consistência eventual entre o término da chamada e a disponibilidade da transcrição processada.
