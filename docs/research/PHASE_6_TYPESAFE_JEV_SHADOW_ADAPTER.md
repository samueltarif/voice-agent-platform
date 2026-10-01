# Phase 6: Concrete TypeSafe Jev Shadow Adapter — Offline Implementation

- **Status**: `ADAPTER_IMPLEMENTED = YES` / `ADAPTER_RUNTIME_WIRED = NO` / `SHADOW_LIVE_ENABLED = NO`
- **Data**: 2026-09-30
- **Branch**: `feat/006p-typesafe-jev-shadow-adapter`
- **Contexto**: Implementação concreta e offline do adapter `TypeSafeJevTurnDecisionAdapter` satisfazendo o contrato provider-neutral `AuxiliaryTurnDecisionPort` para futura observação consultiva em Staging.

---

## 1. Revisão da Documentação Oficial TypeSafe

Antes de qualquer implementação de código, a documentação oficial da TypeSafe foi consultada formalmente a partir do índice canônico `https://docs.typesafe.ai/llms.txt`.

### URLs Oficiais Consultadas
1. `https://docs.typesafe.ai/llms.txt`: Índice geral e sitemap de documentação;
2. `https://docs.typesafe.ai/api.md`: Referência completa da API HTTP do endpoint `/v1/systemone`, esquemas de request, response e tipos de respostas;
3. `https://docs.typesafe.ai/models.md`: Catálogo de modelos, aliases (`jev-latest`, `jev-preview`), limites de taxa e precificação;
4. `https://docs.typesafe.ai/primitives/noul.md`: Especificação das perguntas Noul (questões probabilísticas sim/não).

### Consistência com o Baseline Histórico
- **`OFFICIAL_DOCS_CONFLICT = NO`**: A documentação oficial atual é 100% consistente com o baseline histórico utilizado nos benchmarks sintéticos do repositório:
  - Endpoint: `POST https://api.typesafe.ai/v1/systemone`;
  - Autenticação: `Authorization: Bearer <API_KEY>`;
  - Modelo solicitado padrão: `jev-latest` (apontando estavelmente para `jev-1.13.0`);
  - Estrutura de requisição: `{ model, state: { callerInput, language, channel }, questions }`;
  - Estrutura de resposta: `{ model, answers: { ... } }` contendo scores contínuos entre 0 e 1.

---

## 2. Escopo da Implementação Offline e Governança

1. **Implementação Offline Estrita**:
   - `OPENAI_CALLS = 0`, `JEV_CALLS = 0`, `TWILIO_CALLS = 0`.
   - Nenhum arquivo `.env` foi carregado ou inspecionado.
   - Todos os testes utilizam transporte HTTP mockado/injetado (`fetchFn`).
2. **Sem Fiação de Runtime (No Runtime Wiring)**:
   - O adapter foi implementado isoladamente em `packages/integrations/src/typesafe/`.
   - Não foi injetado no composition root do `apps/voice`.
   - O modo padrão de execução do runtime permanece: **`DISABLED`**.
   - `ACTIVE_GUARDED` permanece: **`BLOCKED`**.
   - `KNOWN_DETERMINISTIC_HANDLERS = 0`.
3. **Minimização Estrita de Estado e Privacidade**:
   - **`CUSTOMER_TRANSCRIPT_PROVIDER_PROCESSING_GATE = NOT CLEARED`**.
   - **`NO_TRANSCRIPT_EXTERNAL_TRANSMISSION = YES`**.
   - **`CUSTOMER_TRAFFIC = PROHIBITED`**.
   - O payload enviado ao endpoint contém exclusivamente o estado semântico necessário (`callerInput`, `language`, `channel`).
   - É terminantemente vedada a serialização de metadados internos: `organizationId`, `callId`, `turnId`, thresholds, policy hashes ou identificadores de tenant.
4. **Conjunto de Perguntas Atômicas (Atomic V1)**:
   - Foram preservadas as três perguntas atômicas Noul homologadas historicamente:
     1. `is_deterministic_candidate`
     2. `is_generative_required`
     3. `is_security_escalation`
   - O SHA-256 canônico da definição reproduz com exatidão o hash histórico:
     `3fecf9ce82ad600a74549d3459fe2b2b516fc3bd7b5fff33bf5b850cd48e8725`.
5. **Política de Retentativas e Falhas**:
   - `RETRIES = 0`: Exatamente 1 requisição HTTP por invocação de `evaluateTurn`.
   - Qualquer falha HTTP, erro de parsing ou anomalia de score rejeita a promessa com erro tipado, sendo absorvida de forma não-bloqueante pelo `AuxiliaryTurnShadowObserver`.
   - Não há fallback artificial ou invenção de scores para simular sucesso.
6. **Propagação de Cancelamento (AbortSignal)**:
   - O `AbortSignal` opcional recebido da porta é propagado fielmente para a requisição fetch nativa, abortando requisições pendentes em caso de desconexão da chamada.
7. **Ausência de Segredos em Logs**:
   - Credenciais de API são injetadas estritamente via configuração no construtor.
   - Nenhum cabeçalho de autorização, chave de API ou transcrição bruta de cliente é emitido em logs.

---

## 3. Componentes Implementados

| Componente | Arquivo | Responsabilidade |
| :--- | :--- | :--- |
| `JEV_ROUTING_ATOMIC_DEFINITION` | `packages/integrations/src/typesafe/typesafe-jev-atomic-definition.ts` | Definição canônica das 3 perguntas atômicas Noul e cálculo do hash de integridade SHA-256. |
| `TypeSafeJevTurnDecisionAdapter` | `packages/integrations/src/typesafe/typesafe-jev-turn-decision-adapter.ts` | Adapter concreto que satisfaz `AuxiliaryTurnDecisionPort` via fetch nativo injetável, com validação de resposta e medição de latência. |
| `index.ts` | `packages/integrations/src/typesafe/index.ts` | Ponto de exportação do módulo typesafe no pacote de integrações. |
