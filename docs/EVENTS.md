# Arquitetura Orientada a Eventos Internos (EVENTS.md)

Este documento especifica o padrão de eventos assíncronos e internos do sistema, garantindo desacoplamento entre módulos, rastreabilidade e extensibilidade para auditoria, analytics e automações.

---

## 1. Estrutura Canônica do Envelope de Evento

Todo evento trafegado no sistema (seja em barramento em memória, filas Redis ou mensageria externa) deve obedecer estritamente à seguinte estrutura de envelope tipado:

```json
{
  "id": "evt_01J8ABC123XYZ456789DEF0123",
  "name": "call.started",
  "version": "1.0",
  "timestamp": "2026-09-21T13:00:00.000Z",
  "organizationId": "org_01J8ABC999AAA111222333444",
  "correlationId": "req_01J8XYZ888BBB444555666777",
  "causationId": "evt_01J8PREV000000000000000000",
  "payload": {
    "callId": "call_01J8CALL555666777888999000",
    "agentId": "agt_01J8AGENT11122233344455566",
    "campaignId": "cmp_01J8CAMP77788899900011122",
    "callerNumber": "+5511999999999",
    "recipientNumber": "+5511988888888",
    "startedAt": "2026-09-21T13:00:00.000Z"
  }
}
```

### Campos Obrigatórios:
- **`id`**: Identificador único global do evento (UUID v7 ou CUID2).
- **`name`**: Nome semântico no padrão `<entidade>.<ação_no_passado>` em minúsculas com pontos.
- **`version`**: Versão do contrato do payload (ex.: `1.0`, `1.1`). Permite evolução de schemas sem quebra de consumidores antigos.
- **`timestamp`**: Data e hora em UTC no padrão ISO-8601.
- **`organizationId`**: Identificador da organização à qual o evento pertence. Deve ser `null` apenas para eventos puramente operacionais do sistema global.
- **`correlationId`**: Identificador de rastreamento distribuído que amarra todas as ações decorrentes de uma mesma intenção original.
- **`causationId`**: (Opcional) Identificador do evento ou comando imediatamente anterior que causou este evento.
- **`payload`**: Dados específicos validados contra o schema canônico do evento.

---

## 2. Catálogo Canônico de Eventos de Chamadas de Voz

O ciclo de vida de uma chamada telefônica é orquestrado através dos seguintes eventos oficiais:

| Nome do Evento | Versão | Origem Principal | Descrição |
| :--- | :--- | :--- | :--- |
| `call.created` | 1.0 | `apps/api` | Disparo da intenção de chamada registrado no sistema e enfileirado para execução. |
| `call.ringing` | 1.0 | `apps/voice` / Telephony | O telefone de destino começou a tocar (sinalização de rede recebida). |
| `call.connected` | 1.0 | `apps/voice` / Telephony | A chamada foi atendida pelo destinatário; canais de áudio estabelecidos. |
| `call.started` | 1.0 | `apps/voice` | A sessão do agente de voz com o interlocutor foi iniciada com streaming ativo. |
| `call.tool_started` | 1.0 | `apps/voice` | O agente de voz iniciou a execução de uma ferramenta determinística (ex.: consulta de produto). |
| `call.tool_completed` | 1.0 | `apps/voice` | A ferramenta concluiu a execução determinística e devolveu o resultado ao contexto do diálogo. |
| `call.transferred` | 1.0 | `apps/voice` | A chamada foi transferida para outro número telefônico ou fila humana. |
| `call.ended` | 1.0 | `apps/voice` / Telephony | A chamada foi encerrada normalmente (pelo usuário ou pelo agente) e áudios finalizados. |
| `call.failed` | 1.0 | `apps/voice` / Telephony | A chamada falhou (ocupado, não atende, erro de rede ou erro na sessão de IA). |

---

## 3. Eventos de Pós-Processamento e Analytics

| Nome do Evento | Versão | Origem Principal | Descrição |
| :--- | :--- | :--- | :--- |
| `call.audio_uploaded` | 1.0 | `apps/voice` | Gravação da chamada armazenada com sucesso no object storage. |
| `call.transcription_completed` | 1.0 | `apps/worker` | Transcrição textual completa, alinhada e diarizada gerada com sucesso. |
| `call.analysis_completed` | 1.0 | `apps/worker` | Análise de sentimento, classificação de desfecho e cálculo de custos consolidados. |

---

## 4. Diretrizes de Consumo e Idempotência

1. **Garantia de Entrega**: Consumidores de eventos devem ser implementados considerando semântica de entrega *at-least-once*.
2. **Processamento Idempotente**: Handlers de eventos devem verificar se o `id` do evento já foi processado antes de executar efeitos colaterais críticos (ex.: cobrança financeira ou envio de webhook externo).
3. **Imutabilidade**: Uma vez publicado, um evento nunca deve ser alterado ou deletado.
