# ADR-004: Padrão Provider/Adapter para Serviços Externos

- **Status**: Accepted
- **Data**: 2026-09-21

---

## Context (Contexto)

O ecossistema de voz e inteligência artificial está em evolução acelerada. Novos modelos de áudio realtime, fornecedores de síntese de voz (TTS) com menor latência, concorrentes de telefonia (PSTN/SIP) com custos mais agressivos e novas ferramentas de CRM surgem constantemente.

Se o código central de negócio importar diretamente SDKs de terceiros (como `twilio`, `openai`, `livekit` ou `elevenlabs`), a plataforma ficará refém de fornecedores (*vendor lock-in*), e os testes automatizados serão lentos, frágeis e excessivamente caros.

---

## Decision (Decisão)

Adotar o padrão **Provider/Adapter (Ports and Adapters)** de forma obrigatória para toda e qualquer integração com serviços externos.

- O domínio declara **Portas** (interfaces abstratas como `TelephonyProvider`, `RealtimeAIProvider`, `StorageProvider`, `CRMProvider`, `CalendarProvider`);
- O pacote `packages/integrations` implementa **Adaptadores concretos** para cada fornecedor (ex.: `TwilioTelephonyProvider`, `OpenAIRealtimeProvider`);
- O código de negócio e a orquestração de chamadas dependem unicamente das interfaces abstratas de domínio.

---

## Alternatives Considered (Alternativas Consideradas)

1. **Uso Direto de SDKs no Código de Negócio**:
   - *Descarte*: Acopla irreversivelmente o sistema a um único fornecedor, tornando a troca futura proibitivamente custosa e impossibilitando testes determinísticos isolados sem custo de rede.
2. **SDK Unificado de Terceiros (Meta-wrapper comercial)**:
   - *Descarte*: Introduziria uma dependência proprietária adicional fora do controle da equipe, sem garantia de suporte aos contratos necessários para nossa operação.

---

## Consequences (Consequências)

### Positivas:
- Liberdade total para alternar ou manter múltiplos fornecedores de telefonia e IA simultaneamente;
- Testabilidade de 100% dos fluxos de negócio usando Fakes e Mocks em memória com custo zero de API;
- Facilidade de simulação de falhas de rede e latências artificiais em ambiente de desenvolvimento.

### Negativas / Desafios:
- Necessidade de criar e manter camadas adicionais de abstração (interfaces e tradutores de tipos de dados de fornecedores).
