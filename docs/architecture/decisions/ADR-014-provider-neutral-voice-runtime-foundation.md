# ADR-014: Provider-Neutral Voice Runtime Foundation e Modelo Determinístico de Sessão

- **Status**: Accepted
- **Data**: 2026-09-28

---

## Context (Contexto)

Com a conclusão do ciclo de publicação do Agent Studio (Phase 5), a plataforma inicia a fundação do runtime de voz da Phase 6 (Voice Agent Runtime & Telephony Integration). 

A execução de chamadas telefônicas com inteligência artificial conversacional em tempo real impõe desafios críticos:
1. **Vendor Lock-in e Custo de Testes**: Importar SDKs de fornecedores (Twilio, OpenAI, Anthropic, Google) no core da aplicação inviabilizaria a troca de provedores e forçaria chamadas pagas de rede em suítes de teste automatizadas.
2. **Latência e Concorrência de Turnos (Barge-In)**: Quando um interlocutor interrompe o agente no meio da fala, respostas parciais já em voo geradas pelo modelo (chunks atrasados) correm o risco de colidir com o novo turno do usuário.
3. **Multi-Tenancy e Isolamento Rigoroso**: Sessões de chamada de diferentes organizações não podem colidir em memória nem permitir consultas cruzadas.
4. **Governança de Versões**: O runtime deve executar determinísticamente uma versão explicitamente auditada e publicada (`PUBLISHED`), sendo proibido o uso de rascunhos (`DRAFT`) ou seleção implícita silenciosa da versão "mais recente".

---

## Decision (Decisão)

1. **Abstração Provider-Neutral (Ports and Adapters)**:
   - Declarar portas tipadas em `@voice-agent/contracts`: `ConversationModelPort`, `VoiceTransportPort` e `CallSessionStorePort`.
   - O core do runtime (`apps/voice`) depende estritamente dessas portas e **NÃO IMPORTA** SDKs da Twilio, OpenAI, Anthropic ou Google.
2. **Máquina de Estados Finita Determinística**:
   - Estados canônicos de sessão: `CREATED`, `CONNECTING`, `ACTIVE`, `ENDING`, `ENDED`, `FAILED`.
   - Transições inválidas e transições a partir de estados terminais disparam `InvalidStateTransitionError`.
3. **Controle de Geração e Barge-In**:
   - Toda geração de resposta do assistente possui um `generationId` unívoco atrelado ao `turnId`.
   - Ao receber o evento `user.interruption`, a geração ativa é invalidada imediatamente no orchestrator, o comando provider-neutral `interruptSpeech` é emitido para o transporte e chunks atrasados da geração antiga são descartados sem envio para fala.
4. **Isolamento Multi-Tenant**:
   - `CallSessionStorePort` exige `organizationId` em todas as operações de busca e persistência (`getById(orgId, callId)`).
   - O `InMemoryCallSessionStore` indexa por chave composta `${organizationId}:${callId}`.
5. **Garantia de Versão Publicada**:
   - Criação de sessão de chamada exige explicitamente `agentVersionStatus === 'PUBLISHED'`.
   - Rascunhos (`DRAFT`) ou versões arquivadas são rejeitados com `InvalidAgentVersionStatusError`.

---

## Alternatives Considered (Alternativas Consideradas)

1. **Acoplamento Direto aos SDKs de Provedores**:
   - *Descarte*: Viola as diretrizes mandatórias de `AGENTS.md` (Seção 5) e impede testes determinísticos com custo zero.
2. **Delegação da Lógica de Barge-In Exclusivamente ao Provedor Telefônico**:
   - *Descarte*: O modelo continuaria consumindo recursos e gerando tokens descartados sem coordenação do orchestrator.
3. **Seleção Implícita da "Última Versão" do Agente**:
   - *Descarte*: Introduz risco operacional grave ao permitir que rascunhos em edição sejam executados inadvertidamente em chamadas reais.

---

## Consequences (Consequências)

### Positivas:
- Desacoplamento arquitetural 100% neutro em relação a fornecedores de telefonia e LLMs;
- Suíte completa de testes unitários executável sem rede, sem dependências de infraestrutura e com custo zero;
- Controle refinado e testado de interrupções de fala e chunks residuais;
- Conformidade total com a governança multi-tenant e o ciclo de vida do Agent Studio.

### Negativas / Desafios:
- Necessidade de implementar adapters concretos (Twilio ConversationRelay/MediaStreams e LLMs reais) em etapas posteriores da Phase 6.
