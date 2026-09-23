# Instruções Operacionais para Agentes de IA (AGENTS.md)

Este documento define as regras operacionais obrigatórias para qualquer agente de IA que atue neste repositório. O cumprimento destas diretrizes é estrito e inegociável.

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

---

## 5. Regras de Integrações Externas (Provider/Adapter)

1. **Desacoplamento de SDKs**: O código de negócio é 100% agnóstico a fornecedores (OpenAI, Twilio, Stripe, etc.). O core do produto não importa SDKs de terceiros.
2. **Interfaces de Domínio**: Toda integração deve ser definida por uma interface ou porta no domínio (ex.: `TelephonyProvider`, `RealtimeAIProvider`, `StorageProvider`).
3. **Adapters Isolados**: A implementação concreta do fornecedor reside exclusivamente em pacote de integração (`packages/integrations` ou adapter dedicado).
4. **Substituibilidade**: O sistema deve permitir trocar ou adicionar um novo fornecedor apenas implementando a interface correspondente, sem alterar a regra de negócio.

---

## 6. Regras de Testes

1. **Nova Regra de Negócio Exige Teste**: Nenhum caso de uso entra na base sem cobertura de testes unitários ou de integração cobrindo fluxos felizes e de borda.
2. **Isolamento de Custos**: Testes automatizados **NUNCA** chamam APIs pagas reais (Twilio, OpenAI, etc.). Utilize fakes, stubs ou mocks de adapters.
3. **Testes Rápidos e Determinísticos**: Evitar sleeps ou dependências temporais soltas; utilizar injeção de relógio/tempo quando necessário.

---

## 7. Regras de Produção, Segurança e LLMs

1. **LLM Não É Fonte da Verdade**:
   - Modelos de IA orientam tom de voz, conversação e intenção.
   - Preços, estoques, permissões, cálculos financeiros, transações e validações de regras críticas são **estritamente determinísticos** em código testado.
2. **Segurança e Manipulação de Segredos**:
   - Zero secrets no repositório (`.env` versionado apenas com exemplos limpos `.env.example`).
   - **Proibições Estritas para Agentes de IA**:
     - Imprimir ou expor tokens e credenciais em logs, saídas de console ou respostas ao usuário;
     - Colocar tokens diretamente em comandos CLI/`curl` ou chamadas de terminal;
     - Ler ou inspecionar valores de secrets em variáveis de ambiente (`$env:...`, `process.env`);
     - Extrair secrets a partir de argumentos ou command lines de processos;
     - Pesquisar ou extrair tokens de arquivos de configuração locais ou globais;
     - Copiar credenciais entre sistemas distintos (ex.: MCP para Git Credential Manager);
     - Registrar tokens em task logs estruturados, scripts temporários ou scratch files;
     - Registrar secrets, parciais ou fingerprints em `AI_WORKLOG.md` ou documentação;
     - Retornar valor de credencial ou segredo sob qualquer pretexto;
     - Recuperar instruções ou prompts acessando `transcript*`, task logs, histórico de comandos, `.system_generated/logs` ou histórico interno da IDE. Se o contexto/prompt estiver indisponível ou for compactado, pedir esclarecimento ao operador humano ou utilizar estritamente o contexto fornecido no turno atual.
   - **Verificações Permitidas para Agentes**:
     - Verificar apenas se uma credencial existe (presença booleana);
     - Verificar se a autenticação funcionou (exit code/sucesso sem verbosidade de segredos);
     - Verificar permissões públicas/observáveis disponíveis.
     - **NUNCA revelar o valor.**
   - Git CLI e GitHub MCP devem ser tratados como autenticações independentes.
3. **Princípio do Menor Privilégio**: Ferramentas disponibilizadas para chamadas de IA (tool calling) devem ter escopo restrito e validar permissões por tenant antes da execução.
4. **Proteção contra Ações Autônomas Destrutivas**: Operações que deletem dados em massa, alterem configurações globais ou afetem produção exigem confirmação explícita de operador humano.

---

## 8. Processo Obrigatório para Bugfix

Ao corrigir qualquer defeito:
1. **Reprodução**: Compreender o cenário da falha e escrever um teste automatizado que reproduza o erro (o teste deve falhar inicialmente).
2. **Investigação da Causa Raiz**: Analisar o fluxo real em vez de mascarar sintomas com condicionais pontuais.
3. **Correção Mínima e Coesa**: Aplicar o menor conjunto de mudanças necessário para resolver a causa raiz.
4. **Validação**: Executar o teste de regressão criado (deve passar) e a suíte do módulo afetado.
5. **Verificação de Impacto**: Garantir que nenhum contrato de API ou schema foi corrompido.

---

## 9. Processo Obrigatório para Features

Ao implementar uma nova funcionalidade:
1. **Pesquisa**: Mapear onde a funcionalidade se encaixa no monorepo e se há componentes reutilizáveis.
2. **Definição de Contratos**: Definir interfaces, schemas de validação e tipos compartilhados antes da lógica.
3. **Persistência**: Se houver banco, desenhar modelo multi-tenant e migration incremental.
4. **Casos de Uso / Domínio**: Implementar a lógica determinística em vertical slice com testes.
5. **Adapters**: Se envolver integração externa, implementar o adapter desacoplado.
6. **Exposição**: Adicionar rotas/controllers enxutos ou eventos assíncronos.
7. **Revisão de Limites**: Verificar se os arquivos e funções respeitam os limites de 150 linhas e complexidade ciclomatica <= 8.

---

## 10. Definition of Done (DoD)

Uma tarefa só é considerada concluída quando:
- [ ] O código cumpre estritamente os limites de tamanho (arquivos <= 180 linhas, funções <= 50 linhas).
- [ ] Não há criação de arquivos genéricos (`utils.ts`, `helpers.ts`, etc.).
- [ ] Toda regra de negócio adicionada/alterada possui testes automatizados passando.
- [ ] Nenhuma chamada a API externa paga é realizada na suíte de testes.
- [ ] O isolamento multi-tenant (`organizationId`) foi preservado.
- [ ] Nenhuma credencial ou dado sensível foi exposto em código ou logs.
- [ ] Logs estruturados com identificadores de rastreamento (`correlationId`, `callId`, etc.) foram aplicados nos fluxos principais.
- [ ] Interfaces visuais respeitam princípios mobile-first e design tokens compartilhados.
- [ ] Documentação e schemas relevantes foram atualizados.
- [ ] Nenhuma aprovação em massa de build scripts (`pnpm approve-builds --all`) foi executada.

---

## 11. Regras de Dependências e Build Scripts (pnpm)

1. **Proibição de Aprovação em Massa**: Agentes de IA **NUNCA** devem executar `pnpm approve-builds --all` automaticamente.
2. **Análise Individual de Scripts**: Novos lifecycle/build scripts de dependências devem ser analisados individualmente antes de serem autorizados.
3. **`onlyBuiltDependencies` Mínimo**: A lista de dependências autorizadas para build em `pnpm-workspace.yaml` deve permanecer explícita e estritamente mínima.

---

## 12. Regras de Auditabilidade do AI_WORKLOG (Append-Only)

1. **Natureza Cronológica Append-Only**: Entradas históricas em `docs/AI_WORKLOG.md` são registros factuais imutáveis e **NUNCA** devem ser silenciosamente reescritas para refletir decisões futuras.
2. **Correções Posteriores Obrigatórias**: Informações incorretas ou superadas devem ser corrigidas exclusivamente em nova entrada posterior, registrando: afirmação incorreta, prompt de origem, informação corrigida e evidência utilizada.
3. **Exceção Exclusiva**: Remoção emergencial de segredos ou credenciais reais expostas por acidente.

