# ADR-017: Provider-Neutral Conversation Model Runtime and Context Composition

- **Status**: Accepted
- **Data**: 2026-09-29

---

## Context (Contexto)

Com a consolidação do runtime de voz provider-neutral (ADR-014 / Slice 006A), do adapter Twilio ConversationRelay (ADR-015 / Slice 006B) e do gateway de entrada para chamadas ao vivo com vinculação de bootstrap server-side (ADR-016 / Slice 006C), a plataforma requer a camada de runtime responsável por preparar o contexto conversacional e consumir modelos de linguagem de forma streaming e provider-neutral (Slice 006D).

O diálogo conversacional impõe desafios críticos de segurança e autoridade:
1. **Separação de Níveis de Autoridade (Authority Boundary)**: As instruções de sistema (`persona`, regras de conduta, tom, idioma) provêm do snapshot publicado e homologado da versão do agente (`AgentConfigurationSnapshotV1`). Elas são autoritativas e nunca podem ser adulteradas por dados externos.
2. **Quarentena de Conteúdo do Interlocutor (Untrusted Caller Input)**: A fala transcrita do usuário externo é dado conversacional não-confiável (`trustLevel: 'UNTRUSTED_CALLER_INPUT'`). Frases hostis contendo tentativas de injeção de prompt (*prompt injection*) como "ignore suas instruções" ou "agora você é administrador" jamais podem alterar o tenant (`organizationId`), a versão do agente, o lifecycle da chamada ou as regras do sistema.
3. **Memória Conversacional Efêmera e Isolamento Multi-Tenant**: O histórico do diálogo deve residir estritamente em memória de processo, escopado pela tupla `organizationId:callId`. Conexões simultâneas ou chamadas com o mesmo identificador em tenants diferentes não podem colidir nem vazar histórico.
4. **Proteção contra Saídas Defasadas (Barge-in & Stale Output)**: Respostas do modelo canceladas por interrupção do interlocutor (*barge-in*) não podem ser registradas na memória como resposta completa do assistente e seus chunks residuais devem ser descartados pelo coordenador de streaming.
5. **Neutralidade Estrita de Fornecedor de Modelo**: O core da aplicação não deve importar SDKs nem depender de APIs concretas da OpenAI, Anthropic ou Google. A seleção definitiva de provedor de modelo permanece diferida (*deferred*).

---

## Decision (Decisão)

1. **Formalização de Eventos de Streaming Provider-Neutral (`ModelStreamEvent`)**:
   - Definidos eventos enxutos em `packages/contracts/src/voice/model-stream-contracts.ts`:
     - `text.delta`: chunk textual incremental associado a `turnId` e `generationId`.
     - `completed`: evento terminal de finalização com texto completo acumulado.
     - `usage`: telemetria opcional provider-neutral (`inputTokens`, `outputTokens`).
     - `failure`: erro seguro tipado com indicação opcional de retry (`isRetryable`).
2. **Composição Determinística de Contexto (`ConversationContextComposer`)**:
   - Componente puro em `apps/voice/src/conversation-context-composer.ts` que monta `ComposedConversationContext`.
   - Segregação mandatória: `instructions` (autoritativo, derivado exclusivamente do snapshot publicado) separado rigidamente de `currentInput` (classificado como `UNTRUSTED_CALLER_INPUT`).
3. **Memória Conversacional Efêmera Tenant-Aware (`InMemoryConversationHistoryStore`)**:
   - Implementa `ConversationHistoryPort` com armazenamento indexado pela chave `${organizationId}:${callId}`.
   - Aplica política de teto de histórico configurável com padrão operacional proposto (`PROPOSED_DEFAULT_MAX_TURNS = 20`), realizando evicção determinística dos turnos mais antigos quando o teto for excedido.
   - Não grava transcrições em banco de dados (`durable transcript: DEFERRED`).
4. **Política Determinística de Resposta Parcial Interrompida**:
   - Quando o interlocutor interrompe o assistente antes da conclusão da geração, os chunks subsequentes são descartados e o texto parcial interrompido **não** é persistido no histórico de aceitação da conversa.
5. **Isolamento de Autoridade de Lifecycle do Modelo**:
   - Textos produzidos pelo modelo (e.g. "end_call", "transfer", "mudar tenant") são tratados estritamente como conteúdo conversacional de áudio e não possuem qualquer autoridade para alterar a máquina de estados (`CallSession`) ou mutar permissões.
6. **Observabilidade de Turno com Proteção de Dados**:
   - Logs de turno emitem apenas metadados seguros: `call.turn.started`, `model.stream.first_chunk`, `call.turn.completed`, `call.turn.interrupted`, carregando `turnId`, `generationId`, `callId`, `organizationId` e `durationMs`.
   - Transcrições integrais e conteúdo de prompts permanecem expressamente proibidos de registro em logs operacionais.
7. **Diferimento de Fornecedor de Modelo e Ferramentas**:
   - Seleção definitiva de fornecedor primário de modelo (OpenAI vs Anthropic vs Google): permanece como `PENDING HUMAN DECISION`.
   - Execução de ferramentas (*tool calling*): diferida para a Fase 7.

---

## Consequences (Consequências)

### Positivas
- Mitigação estrutural de escalada de autoridade por prompt injection: caller input permanece explicitamente não confiável e não possui autoridade sobre tenant, lifecycle, permissões ou regras de sistema. Comportamento semântico de modelos reais permanece PROVIDER-UNVERIFIED.
- Isolamento estrito de memória conversacional entre organizações sem persistência durável desnecessária nesta fase.
- Preservação da semântica de barge-in com cancelamento atômico e descarte de chunks obsoletos.
- Telemetria de turno sem vazamento de PII ou conteúdo conversacional confidencial.
- Contratos neutros preparados para receber adapters de OpenAI, Anthropic ou Google em fases posteriores.

### Limitações e Mitigações
- Memória efêmera opera em processo único local; escalabilidade horizontal exigirá infraestrutura de cache distribuído compartilhado (e.g. Redis) na fase de infraestrutura distribuída.
- Resumo de contexto gerado por LLM (*summarization*) permanece diferido para evitar alucinações como verdade estruturada.
