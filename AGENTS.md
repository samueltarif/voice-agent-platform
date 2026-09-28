# Instruções Operacionais para Agentes de IA (AGENTS.md)

Este documento define as regras operacionais obrigatórias para qualquer agente de IA que atue neste repositório. O cumprimento destas diretrizes é estrito e inegociável.

Documento de referência operacional detalhada: [docs/AI_EXECUTION_RULES.md](file:///D:/voice-agent-platform/docs/AI_EXECUTION_RULES.md).

---

## 1. Regras de Investigação Antes de Qualquer Alteração

Antes de criar ou alterar qualquer arquivo, o agente DEVE seguir este ciclo de investigação:

1. **Entender a Demanda**: Ler o requisito e isolar o objetivo exato sem assumir comportamentos implícitos.
2. **Navegar pelo Módulo**: Identificar o domínio de negócio e a vertical slice correspondente.
3. **Pesquisar Implementações Existentes**:
   - Antes de criar função, service, repository, endpoint, tabela, coluna, enum, interface, schema, provider, adapter, componente, hook, evento, fila ou worker, verificar se já existe implementação equivalente ou reaproveitável.
   - **Regra anti-duplicação**: Nunca duplicar código apenas por conveniência ou velocidade.
4. **Consultar Testes e Documentação**: Analisar testes unitários e de integração existentes no módulo para compreender contratos vigentes.
5. **Avaliar Impacto**: Identificar consumidores, dependências e efeitos colaterais antes de aplicar qualquer alteração.
6. **Consultar Docs Externas Reais**: Ao lidar com bibliotecas ou ferramentas externas, consultar documentação oficial e versões instaladas. **Nunca presumir APIs externas apenas com base na memória do modelo.**

---

## 2. Limites de Complexidade e Estrutura de Código

- **Tamanho de Arquivo de Lógica**:
  - Alvo: 80 a 150 linhas.
  - Máximo recomendado: 180 linhas.
  - Arquivos acima de 180 linhas exigem justificativa arquitetural explícita.
  - **Atenção**: Não fatiar arquivos artificialmente apenas para cumprir linhas; a divisão deve respeitar limites coesos de responsabilidade.
- **Tamanho de Funções**:
  - Alvo: até 30 linhas.
  - Máximo recomendado: 50 linhas para funções com lógica.
- **Complexidade Ciclomática**:
  - Máximo de 8 por função.
- **Profundidade de Nesting**:
  - Máximo de 3 níveis de aninhamento (`if`, `loops`, callbacks).
  - Usar early returns e guard clauses para achatar a estrutura.
- **Parâmetros de Função**:
  - Evitar listas extensas de parâmetros posicionais.
  - Usar objetos tipados (DTOs / Parameter Objects) para mais de 2 parâmetros opcionais ou mais de 3 parâmetros obrigatórios.
- **Proibição de Arquivos Genéricos**:
  - **TOTALMENTE PROIBIDO** criar arquivos como: `utils.ts`, `helpers.ts`, `common.ts`, `misc.ts`, `manager.ts`.
  - Todo arquivo reutilizável deve expressar sua responsabilidade única no nome (ex.: `normalize-phone-number.ts`, `calculate-call-cost.ts`, `validate-discount.ts`).

---

## 3. Regras de Banco de Dados e Persistência

1. **Isolamento de Persistência**: O código de negócio nunca executa queries SQL diretamente. O acesso é feito exclusivamente via Repositories ou camada de persistência tipada.
2. **Multi-Tenancy para Entidades de Tenant**: Toda entidade pertencente a uma organização deve conter obrigatoriamente `organizationId` (ou equivalente arquitetural formal) e ter o isolamento validado em queries. Tabelas puramente globais, catálogos de sistema, metadados de infraestrutura e tabelas técnicas sem escopo de tenant são exceções legítimas — devem ser documentadas e justificadas.
3. **Checagem Prévia Obrigatória**: Antes de propor qualquer nova tabela ou coluna, verificar:
   - Schema existente e migrations anteriores;
   - Repositories e models/types vigentes;
   - Endpoints relacionados e consumidores de dados;
   - Se a informação já existe, se pode ser derivada ou composta a partir de dados existentes;
   - Foreign keys, constraints e índices pertinentes.
4. **Migrations Versionadas**: Toda e qualquer alteração de schema deve ser realizada através de migration versionada.
5. **Proteção de Produção**: **NUNCA** executar DDL manual em produção. Migrations destrutivas ou incompatíveis devem seguir migração em duas etapas (expand/contract). Migrations triviais e compatíveis não exigem obrigatoriamente esse padrão.

---

## 4. Regras de API e Contratos

- **Controllers e Routes Enxutos**: Controladores devem apenas orquestrar: receber input, invocar validação, chamar o caso de uso (service/action) e mapear a resposta HTTP.
- **Zero Regra de Negócio em Controllers**: Regras de negócio, cálculos, decisões determinísticas e autorizações de domínio pertencem à camada de aplicação/domínio.
- **Validação Explícita de Entrada**: 100% dos dados externos (body, params, query, headers) devem ser validados via schema explícito antes de chegarem ao negócio.
- **Contratos e Versionamento**: Toda alteração em contratos de API deve avaliar todos os consumidores (web, workers, webhooks) para evitar breaking changes.
- **Abordagem Contract-First**: Antes de criar qualquer endpoint, campo, enum, default ou evento, verificar contratos existentes em `packages/contracts` e documentação. É proibido inventar campos fictícios apenas para preencher interfaces.

---

## 5. Regras de Integrações Externas e Arquitetura de Domínio (Phase 6+)

1. **Desacoplamento Estrito de SDKs (Provider-Neutral)**: O código de negócio e domínio é 100% agnóstico a fornecedores. O core da aplicação **NUNCA** importa SDKs de terceiros (Twilio, OpenAI, Anthropic, Google, AWS, Stripe).
2. **Interfaces de Domínio (Ports)**: Toda integração deve ser definida por uma interface no domínio (ex.: `TelephonyProvider`, `VoiceTransport`, `SpeechProvider`, `ConversationModel`, `CallControlPort`, `RecordingStoragePort`).
3. **Adapters Isolados**: A implementação concreta do fornecedor reside exclusivamente em pacote de integração (`packages/integrations` ou adapter dedicado).
4. **Autoridade do Runtime de Voz**: Provedores de telefonia (Twilio) e modelos de IA (LLMs) **NÃO SÃO** a fonte da verdade do domínio.
   - **Twilio**: Transporte, mídia, sinalização e conectores STT/TTS.
   - **Conversation Orchestrator**: Coordenação de turnos, barge-in, orquestração de ferramentas e handoff.
   - **Database**: Única fonte durável da verdade.
   - **CallSession / State Machine**: Autoridade sobre o estado da chamada em tempo real.
   - **LLM/Provedor NUNCA decidem autonomamente**: tenant, autorizações, precificação, faturamento, ciclo de vida da chamada ou publicação de versões.
5. **Declaração de Capacidades (Provider Claims)**: Qualquer comportamento ainda não homologado contra provedor real em testes com tráfego telefônico deve ser classificado estritamente como `PROVIDER-UNVERIFIED`. É proibido assumir status `VALIDATED` a partir de documentação de fornecedores.

---

## 6. Regras de Testes e Integridade de Fixtures

1. **Nova Regra de Negócio Exige Teste**: Nenhum caso de uso entra na base sem cobertura de testes automatizados cobrindo fluxos felizes e de borda.
2. **Isolamento de Custos**: Testes automatizados **NUNCA** chamam APIs pagas reais (Twilio, OpenAI, etc.). Utilize fakes, stubs ou mocks de adapters.
3. **Integridade de Fixtures**: Fixtures devem ser criadas prioritariamente através de services e repositórios canônicos. Se inserções diretas em banco forem inevitáveis, **todas as invariantes do domínio devem ser preservadas** (`next_version_number`, unicidade de rascunhos, unicidade de versão publicada, `organizationId`, status ativo, quotas comerciais).
4. **Proibição Absoluta de Patches Manuais de Dados**:
   - É **TERMINANTEMENTE PROIBIDO** executar `UPDATE`, `INSERT` ou `DELETE` manuais apenas para fazer um teste funcional passar.
   - Se um teste falhar por inconsistência de estado: **STOP**. Classificar como `PRODUCT BUG` ou `FIXTURE SETUP BUG`, corrigir a causa raiz e adicionar teste de regressão.
5. **Teardown Fail-Visible e Scoped**: Teardowns de teste devem utilizar identificadores sintéticos únicos (`runId`) e comprovar **zero resíduos** (*zero leftovers*) ao término da execução.
6. **Autenticação e RBAC em E2E**: Testes nunca devem contornar validações de autenticação, RBAC ou tenant isolation para declarar um fluxo como `VALIDATED`.
7. **Terminologia Normativa de Evidência**:
   - `IMPLEMENTED`: Código criado.
   - `TESTED`: Testes automatizados passando.
   - `VALIDATED`: Fluxo funcional completo comprovado em ambiente real (PostgreSQL real + Browser real).
   - `PROVIDER-UNVERIFIED`: Integração desenhada/implementada mas sem teste em provedor real pago.
   - `BLOCKED`: Bloqueado por dependência técnica ou decisão externa.
   - `NÃO VERIFICADO`: Nenhuma evidência factual produzida.
   - *Nota*: Screenshots visuais não equivalem a testes funcionais E2E.

---

## 7. Regras de Segurança Operacional, Segredos e Execução de Agentes

1. **Proibição Absoluta de Acesso a Storages Internos da IDE**:
   - Agentes de IA **NUNCA** devem ler, abrir, pesquisar, listar recursivamente, parsear, escrever ou usar como scratch qualquer diretório ou arquivo pertencente ao storage interno da IDE, ferramenta ou runtime:
     - `.system_generated/` (logs, tasks, steps)
     - `.gemini/` e `.agents/`
     - `antigravity-ide/` e `antigravity-ide/brain/`
     - Arquivos de log de background tasks (`task-*.log`)
     - Histórico da IDE, histórico de terminal e histórico de comandos
     - Transcripts internos (`transcript*.jsonl`)
   - Se o contexto estiver indisponível ou for compactado: **perguntar ao operador humano** ou utilizar estritamente o contexto fornecido no turno atual. É terminantemente proibido tentar recuperar contexto acessando logs ou transcripts internos.
2. **Blindagem e Não Exibição de Segredos (Never Print Secrets)**:
   - **NUNCA** imprimir, logar, exibir, ecoar ou retornar valor de: senhas, tokens de sessão, cookies, JWTs, Bearer tokens, API keys, GitHub tokens, chaves privadas (JWK, PEM), Better Auth secrets, connection strings literais e DSNs (`DATABASE_URL`, `postgresql://...`) ou credenciais de provedores.
   - A regra aplica-se igualmente a ambientes de produção, staging, dev, localhost, credenciais sintéticas e temporárias de E2E. **"É apenas local" NÃO é exceção.**
3. **Auditorias Baseadas Exclusivamente em Booleanos (Value-Blind)**:
   - Auditorias de segredos devem retornar estritamente valores booleanos/status: `SECRET_AUDIT_PASS` ou `SECRET_AUDIT_FAIL`, `PRESENT` / `ABSENT`, sem jamais imprimir a linha ou substring coincidente.
4. **Proteção de Arquivos de Ambiente (.env) e Processos**:
   - **NUNCA** executar `cat`, `type`, `Get-Content` ou abrir arquivos `.env`, `.env.local`, `.env.staging`, `.env.production` para inspecionar valores.
   - Diagnósticos de processos devem utilizar estritamente PID, nome do executável, porta TCP (`Get-NetTCPConnection`), healthchecks e exit code. É proibido inspecionar `CommandLine`, `argv` completo ou variáveis de ambiente de processos.
5. **Segurança de Banco de Dados e Sessões**:
   - É proibido passar DSNs literais com senhas/tokens em comandos de terminal (inclusive para localhost).
   - É proibido consultar `SELECT token FROM session` ou manipular cookies de sessão manualmente. Autenticação E2E deve ocorrer exclusivamente através dos endpoints oficiais do Better Auth e contexto real de navegador.
6. **Criptografia Efêmera em Testes (Ed25519)**:
   - Chaves privadas geradas para validação de asserções entre serviços devem existir apenas em memória, nunca ser salvas em disco e nunca ser impressas em logs. Diagnósticos permitidos: `KEYPAIR_GENERATED=true`, `SIGN_OK=true`, `VERIFY_OK=true`.
7. **Credenciais Sintéticas e Helpers Temporários**:
   - Senhas sintéticas de teste devem residir unicamente em memória de runtime, sendo proibido criar arquivos como `test-data.json` ou fixtures contendo senhas.
   - Helpers temporários de teste devem residir unicamente no repositório (ex.: `scripts/tmp-<proposito>.mjs`) e devem ser **obrigatoriamente excluídos antes de qualquer commit**.
8. **Fronteira de Rede e Operações Remotas**:
   - Neon, Staging, Produção, Twilio, OpenAI, Anthropic, Google, AWS e serviços externos só podem ser acessados mediante **autorização formal explícita no prompt**. Na ausência de autorização: **NO ACCESS**.
   - Operações destrutivas remotas (exclusão de repositórios, drop de banco, force push, alteração de regras do GitHub) exigem confirmação explícita de operador humano.
9. **Segurança de Git**:
   - Proibido force push, commits diretos na `main`, alteração de rulesets ou rebase de commits públicos já auditados.

---

## 8. Processo Obrigatório para Bugfix

Ao corrigir qualquer defeito:
1. **Reprodução**: Compreender o cenário da falha e escrever um teste automatizado que reproduza o erro (o teste deve falhar inicialmente).
2. **Investigação da Causa Raiz**: Analisar o fluxo real em vez de mascarar sintomas com condicionais pontuais ou patches manuais de banco.
3. **Correção Mínima e Coesa**: Aplicar o menor conjunto de mudanças necessário para resolver a causa raiz.
4. **Validação**: Executar o teste de regressão criado (deve passar) e a suíte do módulo afetado.
5. **Verificação de Impacto**: Garantir que nenhum contrato de API ou schema foi corrompido.

---

## 9. Processo Obrigatório para Features

Ao implementar uma nova funcionalidade:
1. **Pesquisa**: Mapear onde a funcionalidade se encaixa no monorepo e se há componentes reutilizáveis.
2. **Definição de Contratos**: Definir interfaces, schemas de validação e tipos compartilhados antes da lógica (contract-first).
3. **Persistência**: Se houver banco, desenhar modelo multi-tenant e migration incremental.
4. **Casos de Uso / Domínio**: Implementar a lógica determinística em vertical slice com testes.
5. **Adapters**: Se envolver integração externa, implementar o adapter desacoplado (provider-neutral).
6. **Exposição**: Adicionar rotas/controllers enxutos ou eventos assíncronos.
7. **Revisão de Limites**: Verificar se os arquivos e funções respeitam os limites de 150 linhas e complexidade ciclomatica <= 8.

---

## 10. Checklist Pré-Execução de Segurança (10 Pontos Mandatórios)

Antes de executar operações complexas de teste, scripts de automação ou tarefas de banco:

- [ ] **1. Escopo de Diretório**: Estou operando estritamente dentro do workspace do repositório?
- [ ] **2. Isolamento de Storage Interno**: Nenhum arquivo em `.system_generated/`, `.gemini/`, `antigravity-ide/`, `brain/` ou task logs será acessado ou usado como scratch?
- [ ] **3. Blindagem de Segredos**: O comando evita totalmente imprimir senhas, tokens, cookies, JWTs ou chaves privadas?
- [ ] **4. Ausência de DSN Literal**: Nenhuma connection string com usuário/senha está presente na linha de comando?
- [ ] **5. Proteção de Sessão**: Nenhuma query tenta ler `session.token` diretamente do banco de dados?
- [ ] **6. Diagnóstico de Processo**: Nenhuma inspeção de processos utiliza `CommandLine`, `argv` ou blocos de ambiente?
- [ ] **7. Integridade de Fixtures**: As fixtures respeitam todas as invariantes e regras de domínio da aplicação?
- [ ] **8. Limite de Rede / Provedores**: O acesso a redes externas, Neon, Staging ou APIs de terceiros está formalmente autorizado pelo prompt?
- [ ] **9. Limpeza Escopada**: A rotina de teardown utiliza identificador único de execução (`runId`) e assegura zero resíduos?
- [ ] **10. Classificação Factual**: Os resultados serão classificados com base em evidências reais (sem assumir `VALIDATED` sem prova)?

---

## 11. Definition of Done (DoD)

Uma tarefa só é considerada concluída quando:
- [ ] O código cumpre estritamente os limites de tamanho (arquivos <= 180 linhas, funções <= 50 linhas).
- [ ] Não há criação de arquivos genéricos (`utils.ts`, `helpers.ts`, etc.).
- [ ] Toda regra de negócio adicionada/alterada possui testes automatizados passando.
- [ ] Nenhuma chamada a API externa paga é realizada na suíte de testes.
- [ ] O isolamento multi-tenant (`organizationId`) foi preservado.
- [ ] Nenhuma credencial ou dado sensível foi exposto em código ou logs (`SECRET_AUDIT_PASS`).
- [ ] Nenhum helper temporário de teste permanece no repositório.
- [ ] Logs estruturados com identificadores de rastreamento (`correlationId`, `callId`, etc.) foram aplicados nos fluxos principais.
- [ ] Interfaces visuais respeitam princípios mobile-first e design tokens compartilhados.
- [ ] Documentação e schemas relevantes foram atualizados.
- [ ] Nenhuma aprovação em massa de build scripts (`pnpm approve-builds --all`) foi executada.
- [ ] O pipeline de qualidade (`pnpm check`) passou integralmente sem erros.

---

## 12. Regras de Dependências e Build Scripts (pnpm)

1. **Proibição de Aprovação em Massa**: Agentes de IA **NUNCA** devem executar `pnpm approve-builds --all` automaticamente.
2. **Análise Individual de Scripts**: Novos lifecycle/build scripts de dependências devem ser analisados individualmente antes de serem autorizados.
3. **`onlyBuiltDependencies` Mínimo**: A lista de dependências autorizadas para build em `pnpm-workspace.yaml` deve permanecer explícita e estritamente mínima.

---

## 13. Regras de Auditabilidade do AI_WORKLOG e Tratamento de Desvios

1. **Natureza Cronológica Append-Only**: Entradas históricas em `docs/AI_WORKLOG.md` são registros factuais imutáveis e **NUNCA** devem ser silenciosamente reescritas para refletir decisões futuras.
2. **Correções Posteriores Obrigatórias**: Informações incorretas ou superadas devem ser corrigidas exclusivamente em nova entrada posterior.
3. **Procedimento para Security Process Deviations**:
   - Se qualquer regra operacional for violada, o agente **NÃO DEVE** ocultar ou silenciar o fato.
   - Registrar imediatamente no `AI_WORKLOG.md` uma nova entrada classificada como `SECURITY PROCESS DEVIATION` (ou `SECURITY PROCESS DEVIATION — REPEATED PATTERN`), reportando: fato objetivo, escopo, risco, contenção aplicada, ação corretiva e necessidade ou não de rotação humana.
4. **Regra de Bloqueio Humano (Human Blocker)**: Solicitar intervenção humana apenas para ações externas indispensáveis (criação/rotação de credenciais, ações no console de provedores, configurações administrativas do GitHub). **Nunca solicitar ao humano que copie/cole tokens, cookies, chaves privadas ou DSNs literais no terminal.**
