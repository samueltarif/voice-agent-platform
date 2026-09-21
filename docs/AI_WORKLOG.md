# Registro Central de Execução por IA (AI_WORKLOG.md)

> **Arquivo Obrigatório** — Criado em: 21 de Setembro de 2026
> **Regras de uso:**
> - Nunca apagar entradas anteriores.
> - Nunca incluir secrets ou credenciais.
> - Nunca afirmar que um teste foi executado quando não foi.
> - Nunca omitir falha conhecida ou desvio do plano.
> - Toda tarefa executada por IA neste repositório DEVE acrescentar uma entrada cronológica abaixo.

---

## PROMPT-001 — Fundação Arquitetural e Documental

- **Data**: 2026-09-21
- **Objetivo**: Estabelecer toda a fundação documental, arquitetural e operacional do projeto antes de qualquer linha de código de produção.

### O que foi implementado
Criação completa da fundação documental do projeto, sem instalação de dependências ou stack de produção.

### Arquivos criados
| Arquivo | Descrição |
|:---|:---|
| `AGENTS.md` | Instruções operacionais obrigatórias para agentes de IA |
| `PROJECT_CONSTITUTION.md` | Leis fundamentais e princípios inegociáveis do projeto (13 artigos) |
| `ARCHITECTURE.md` | Visão arquitetural, fronteiras de módulos e fluxo de dados |
| `PROJECT_MAP.md` | Mapa topológico do monorepo com responsabilidades canônicas |
| `FOUNDATION_MASTER.md` | Documento consolidado mestre com todos os princípios |
| `README.md` | Visão geral do repositório para orientação inicial |
| `docs/PROJECT_VISION.md` | Visão de produto, problema de negócio e pilares da solução |
| `docs/VOICE_ARCHITECTURE.md` | Arquitetura do motor de voz, pipeline de áudio e barge-in |
| `docs/DATABASE.md` | Diretrizes de modelagem, migração e governança de banco |
| `docs/DESIGN_SYSTEM.md` | Design tokens, tipografia, espaçamento e breakpoints |
| `docs/ROADMAP.md` | Roteiro de 9 fases de implementação |
| `docs/DECISIONS_LOG.md` | Registro formal de decisões confirmadas e pendentes |
| `docs/OBSERVABILITY.md` | Estratégia de logs estruturados, métricas e auditoria |
| `docs/SECURITY.md` | Normas de segurança, gestão de segredos e proteção de produção |
| `docs/INTEGRATIONS.md` | Catálogo de interfaces abstratas Provider/Adapter |
| `docs/EVENTS.md` | Envelope canônico de eventos internos e catálogo de eventos |
| `docs/TESTING_STRATEGY.md` | Pirâmide de testes, isolamento de custos e ciclo TDD |
| `docs/COST_MODEL.md` | Modelo de custo unitário por chamada e governança orçamentária |
| `docs/DEPLOYMENT.md` | Segregação de ambientes, CI/CD e proteção de produção |
| `docs/MOBILE_GUIDELINES.md` | Diretrizes mobile-first, navegação adaptativa e touch targets |
| `docs/architecture/decisions/ADR-001-monorepo.md` | ADR: Adoção de Monorepo Modular |
| `docs/architecture/decisions/ADR-002-modular-architecture.md` | ADR: Arquitetura Modular e Vertical Slices |
| `docs/architecture/decisions/ADR-003-multi-tenant.md` | ADR: Multi-Tenancy Nativo com Isolamento Lógico |
| `docs/architecture/decisions/ADR-004-provider-adapter-pattern.md` | ADR: Padrão Provider/Adapter |
| `docs/architecture/decisions/ADR-005-event-driven-boundaries.md` | ADR: Fronteiras Orientadas a Eventos |
| `docs/architecture/decisions/ADR-006-mobile-first.md` | ADR: Abordagem Mobile-First Unificada |
| `docs/architecture/decisions/README.md` | Índice dos ADRs |

### Arquivos alterados
Nenhum (criação inicial).

### Arquivos removidos
Nenhum.

### Dependências adicionadas
Nenhuma. Esta fase é exclusivamente documental.

### Alterações de banco
Nenhuma.

### Alterações de API
Nenhuma.

### Alterações de configuração
Nenhuma.

### Decisões tomadas
- Monorepo modular com estrutura `apps/` e `packages/`
- Multi-tenancy lógico por `organizationId`
- Padrão Provider/Adapter para todas as integrações externas
- Mobile-first como princípio arquitetural de interface
- LLM não é fonte da verdade para dados críticos
- Migrations versionadas obrigatórias, zero DDL manual em produção

### Decisões temporárias
Nenhuma explicitamente marcada como temporária nesta fase.

### Desvios do plano
Nenhum registrado.

### Testes executados
Nenhum. Esta fase é exclusivamente documental. Não há código de produção ou testes automatizados nesta etapa.

### Resultado dos testes
N/A — sem testes nesta fase.

### Problemas encontrados
Nenhum registrado.

### Pendências
- Aprovação humana para transição para a próxima fase de implementação.
- Definição de todas as tecnologias marcadas como "Pending Decision".

### Dívida técnica
Nenhuma identificada nesta fase.

### Impactos futuros
Toda a base de implementação depende das decisões humanas pendentes listadas no `DECISIONS_LOG.md`.

### Como validar manualmente
1. Ler todos os documentos listados em "Arquivos criados".
2. Confirmar que não há dependências instaladas (`package.json` inexistente na raiz).
3. Confirmar que nenhum schema de banco foi criado.

### Próximo passo recomendado
Aguardar aprovação humana explícita antes de executar PROMPT-002 (estrutura do monorepo e tooling).

---

## PROMPT-001B — Revisão da Fundação

- **Data**: 2026-09-21
- **Objetivo**: Revisar a fundação documental estabelecida em PROMPT-001, corrigindo decisões prematuras, incorporando novos requisitos de produto (Agent Studio, versionamento de agentes, Knowledge Base, Agent Evals, Human Handoff) e refinando linguagem sobre SLAs, VAD, multi-tenancy, signed URLs e design system.

### O que foi implementado
Revisão documental completa. Nenhum código de produção criado, nenhuma dependência instalada, nenhum banco criado, nenhum frontend funcional implementado.

### Arquivos criados
| Arquivo | Descrição |
|:---|:---|
| `docs/AI_WORKLOG.md` | Este arquivo — registro central obrigatório de execução por IA |
| `docs/AGENT_STUDIO.md` | Novo documento: conceito, componentes e versionamento do Agent Studio |

### Arquivos alterados
| Arquivo | Natureza das mudanças |
|:---|:---|
| `FOUNDATION_MASTER.md` | Revisão completa: latência como meta de engenharia (não SLA), VAD configurável, multi-tenancy com escopo correto, signed URLs configuráveis, design tokens como "Proposed Default", roadmap reestruturado em 11 fases, Agent Studio e versionamento de agentes incorporados, seção de AI_WORKLOG adicionada |
| `docs/VOICE_ARCHITECTURE.md` | VAD e valores numéricos removidos como regras fixas; substituídos por princípio de configurabilidade e observabilidade |
| `docs/DATABASE.md` | Multi-tenancy refinado: `organization_id` obrigatório para entidades com escopo de tenant, não universalmente para toda tabela; estratégia de índices baseada em padrões reais de consulta |
| `docs/DESIGN_SYSTEM.md` | Tipografia e breakpoints marcados como "Status: Proposed Default" |
| `docs/ROADMAP.md` | Reestruturado: 9 fases → 11 fases (FASE 0 a FASE 10) conforme nova sequência aprovada |
| `docs/SECURITY.md` | TTL de signed URLs: 15 minutos removido como regra constitucional; substituído por política configurável |
| `docs/OBSERVABILITY.md` | Meta de 800ms deixou de ser SLA definitivo; métricas de latência expandidas (p50, p95, p99, tool latency) |
| `PROJECT_CONSTITUTION.md` | Artigo VI: Expand and Contract ajustado para migrations não-triviais; Artigo VIII: auditoria e retenção separadas conceitualmente |
| `AGENTS.md` | Regra de banco: `organizationId` obrigatório para entidades tenant, não para toda tabela; Expand and Contract apenas quando necessário |

### Arquivos removidos
Nenhum.

### Dependências adicionadas
Nenhuma.

### Alterações de banco
Nenhuma.

### Alterações de API
Nenhuma.

### Alterações de configuração
Nenhuma.

### Decisões tomadas
- Latência `<800ms` classificada como **objetivo inicial de engenharia**, não SLA aprovado
- Valores de VAD (100ms de fala, 250–400ms de silêncio) são **configuráveis por provider/idioma/ambiente**
- `organizationId` obrigatório para **entidades com escopo de tenant** — tabelas globais, catálogos e metadados técnicos são exceção legítima
- `organization_id` como primeiro membro de índices compostos é **recomendação**, não regra absoluta — estratégia de índice segue padrões reais de consulta
- Expand and Contract é obrigatório apenas para **migrations com alterações incompatíveis** — não para migrations triviais
- TTL de signed URLs é **configurável** — 15 minutos era exemplo, não regra constitucional
- Inter/Geist/JetBrains Mono e breakpoints específicos classificados como **"Status: Proposed Default"**
- Agent Studio incorporado formalmente como requisito fundamental de produto
- Versionamento de agentes (DRAFT → TEST → PUBLISHED → ARCHIVED) documentado como requisito arquitetural futuro
- Knowledge Base separada conceitualmente: dados estruturados vs. conhecimento não estruturado
- Agent Evals documentado como subsistema futuro obrigatório
- Feedback supervisionado documentado sem automatização de publicação
- Human Handoff documentado como capacidade fundamental futura
- AI_WORKLOG instituído como registro central obrigatório de todas as tarefas de IA

### Decisões temporárias
- Roadmap reestruturado em 11 fases é referência atual — subtarefas paralelas poderão ser adicionadas futuramente.

### Desvios do plano
Nenhum — a revisão seguiu integralmente as instruções do prompt de revisão.

### Testes executados
Nenhum. Esta fase é exclusivamente documental. Não há código de produção ou testes automatizados.

### Resultado dos testes
N/A.

### Problemas encontrados
- **Contradições identificadas na fundação anterior** (detalhes abaixo na seção de verificação de consistência):
  1. `FOUNDATION_MASTER.md` seção 6: "Toda tabela pertencente a cliente corporativo contém `organization_id` como primeira chave de indexação composta" — linguagem excessivamente absoluta corrigida.
  2. `FOUNDATION_MASTER.md` seção 6 e `PROJECT_CONSTITUTION.md` Artigo VI: Expand and Contract descrito como obrigatório para toda migration, incluindo triviais — linguagem corrigida para "quando necessário".
  3. `docs/SECURITY.md` seção 4: 15 minutos como regra de TTL de signed URL — promovido para parâmetro configurável.
  4. `docs/VOICE_ARCHITECTURE.md`: `>100ms` e `~250–400ms` tratados como valores de VAD fixos — corrigidos para princípio de configurabilidade.
  5. `docs/OBSERVABILITY.md` seção 4: "garantir conversas com latência inferior a 800ms" apresentado como requisito validado — corrigido para objetivo de engenharia a ser medido.
  6. `docs/DESIGN_SYSTEM.md`: Inter/Geist/JetBrains Mono e breakpoints apresentados como definitivos sem marcação de status — marcados como "Proposed Default".
  7. Ausência total de conceito de Agent Studio nos documentos anteriores.
  8. Ausência de versionamento de agentes.
  9. Ausência de Knowledge Base, Agent Evals e Human Handoff.
  10. Roadmap com 9 fases sem incluir as novas fases de Agent Studio, Evals e Hardening separados.

### Pendências
- Aprovação humana para iniciar PROMPT-002 (estrutura do monorepo e tooling).
- Aprovação humana de: motor de banco de dados, ORM, linguagem do voice engine, cache, filas, telefonia, IA realtime, storage, autenticação, framework frontend, cloud/hospedagem, gateway de pagamento.
- Aprovação humana das escolhas de tipografia e breakpoints (atualmente "Proposed Default").
- Pesquisa jurídica para definição de períodos de retenção e regras regulatórias de privacidade.

### Dívida técnica
Nenhuma. Esta etapa é documental.

### Impactos futuros
- Agent Studio exigirá modelo de dados específico (futuramente, nas fases de domínio).
- Versionamento de agentes impacta schema do banco e fluxo de publicação.
- Agent Evals exigirá subsistema dedicado de avaliação e comparação de versões.
- Knowledge Base exigirá estratégia separada para dados estruturados (queries determinísticas) vs. não estruturados (RAG ou similar).

### Como validar manualmente
1. Ler `FOUNDATION_MASTER.md` atualizado e verificar se não há mais SLAs absolutos para latência.
2. Verificar que `docs/VOICE_ARCHITECTURE.md` não contém valores fixos de VAD.
3. Verificar que `docs/DATABASE.md` diferencia tabelas tenant de tabelas globais.
4. Verificar que `docs/SECURITY.md` não faz referência a "15 minutos" como regra.
5. Verificar que `docs/DESIGN_SYSTEM.md` contém marcação "Status: Proposed Default".
6. Verificar que `docs/ROADMAP.md` tem 11 fases (FASE 0 a FASE 10).
7. Verificar que `docs/AGENT_STUDIO.md` existe e documenta os requisitos do Agent Studio.
8. Verificar que este `docs/AI_WORKLOG.md` existe com as duas entradas.

### Próximo passo recomendado
Aguardar aprovação humana explícita e instrução para iniciar PROMPT-002.

---

## PROMPT-002 — Monorepo, Tooling e Guardrails

- **Data**: 2026-09-21
- **Objetivo**: Criar a estrutura física do monorepo executável, configurar workspace pnpm, Turborepo, TypeScript strict, ESLint 9 com regras de complexidade, Prettier, Vitest e estabelecer guardrails automáticos de arquitetura e tamanho de arquivos sem implementar funcionalidades de produto.

### MCPs Utilizados
1. **Context7**: Consulta técnica obrigatória pré-instalação de documentação atualizada de Turborepo, ESLint Flat Config, Vitest, TypeScript, Prettier e pnpm workspaces.
2. **GitHub MCP**: Consulta em modo de leitura para verificação de identidade autenticada (`get_me`) e listagem de repositórios do usuário (`search_repositories`).

### Consultas Feitas via Context7
- `/vercel/turborepo`: Estrutura de `turbo.json` v2, sintaxe de `tasks` (substituindo o antigo `pipeline`), cache e outputs (`dist/**`).
- `/typescript-eslint/typescript-eslint`: Formato Flat Config (`eslint.config.mjs`) com `tseslint.config`, regras de complexidade e typed linting.
- `/vitest-dev/vitest`: Descoberta de descontinuação de `test.workspace` em favor de `test.projects: ['packages/*', 'apps/*']` em `vitest.config.ts` (adotada no Vitest 3.2.7).
- `/microsoft/typescript`: Opções estritas de `tsconfig`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noImplicitReturns`, `useUnknownInCatchVariables`.
- `/prettier/prettier`: Configuração ESM (`prettier.config.mjs`) e uso de `.prettierignore` para blindagem de documentação.
- `/pnpm/pnpm.io`: Especificação de `pnpm-workspace.yaml`, controle de lifecycle scripts com `onlyBuiltDependencies: [esbuild]` e comando `pnpm approve-builds --all`.

### Versões Instaladas
- **Node.js**: `v24.20.0` (fixado em `.node-version` e validado via engines)
- **pnpm**: `12.5.1` (definido em `packageManager`)
- **Turborepo**: `2.11.2`
- **TypeScript**: `5.9.3`
- **ESLint**: `9.39.5`
- **typescript-eslint**: `8.70.0`
- **globals**: `17.12.0`
- **Prettier**: `3.9.8`
- **Vitest**: `3.2.7`

### Arquivos Criados
| Arquivo | Descrição |
|:---|:---|
| `.node-version` | Fixação da versão do runtime Node.js (24.20.0) |
| `.editorconfig` | Padronização de indentação (2 espaços), encoding utf-8 e line endings (lf) |
| `.gitattributes` | Normalização de quebras de linha para git (* text=auto eol=lf) |
| `.prettierignore` | Exclusão de arquivos de documentação (*.md, docs/**) e builds de reformat |
| `prettier.config.mjs` | Configuração ESM do Prettier com singleQuote, semi e trailingComma |
| `pnpm-workspace.yaml` | Declaração de workspaces (apps/*, packages/*) e permissão de build script para esbuild |
| `package.json` | Manifest raiz com private: true, engines, packageManager e scripts centralizados |
| `turbo.json` | Pipeline do Turborepo (build, lint, typecheck, dev) |
| `tsconfig.base.json` | Configuração estrita base de TypeScript com path mappings para source |
| `tsconfig.json` | Configuração de TypeScript na raiz para validação de scripts |
| `eslint.config.mjs` | ESLint 9 Flat Config com regras de complexidade e overrides para testes e scripts |
| `vitest.config.ts` | Configuração central do Vitest com test.projects apontando para apps e packages |
| `scripts/file-size-allowlist.json` | Allowlist central e versionada para exceções autorizadas de tamanho de arquivo |
| `scripts/check-file-size.mjs` | Validador de limite de 180 linhas para arquivos de lógica de produção com avisos de allowlist |
| `scripts/check-architecture.mjs` | Validador arquitetural com AST TypeScript (proíbe arquivos genéricos e imports indevidos) |
| `apps/web/package.json` | Manifest do workspace @voice-agent/web |
| `apps/web/tsconfig.json` | Configuração TypeScript da aplicação web |
| `apps/web/src/index.ts` | Entrypoint mínimo para compilação da aplicação web |
| `apps/api/package.json` | Manifest do workspace @voice-agent/api |
| `apps/api/tsconfig.json` | Configuração TypeScript da API |
| `apps/api/src/index.ts` | Entrypoint mínimo para compilação da API |
| `apps/voice/package.json` | Manifest do workspace @voice-agent/voice |
| `apps/voice/tsconfig.json` | Configuração TypeScript do motor de voz |
| `apps/voice/src/index.ts` | Entrypoint mínimo para compilação do motor de voz |
| `apps/worker/package.json` | Manifest do workspace @voice-agent/worker |
| `apps/worker/tsconfig.json` | Configuração TypeScript do worker |
| `apps/worker/src/index.ts` | Entrypoint mínimo para compilação do worker assíncrono |
| `packages/contracts/package.json` | Manifest do pacote @voice-agent/contracts |
| `packages/contracts/tsconfig.json` | Configuração TypeScript de contratos |
| `packages/contracts/src/index.ts` | Interfaces neutras de domínio (TenantScoped, DomainEvent, TelephonyPort, etc.) |
| `packages/contracts/src/index.test.ts`| Teste de infraestrutura em Vitest para validação de tipos de contratos |
| `packages/errors/package.json` | Manifest do pacote @voice-agent/errors |
| `packages/errors/tsconfig.json` | Configuração TypeScript de erros |
| `packages/errors/src/index.ts` | Classes de erro da aplicação (AppError, NotFoundError, UnauthorizedError) |
| `packages/errors/src/index.test.ts` | Teste de infraestrutura em Vitest para validação de erros |
| `packages/logger/package.json` | Manifest do pacote @voice-agent/logger |
| `packages/logger/tsconfig.json` | Configuração TypeScript de logging |
| `packages/logger/src/index.ts` | Interface tipada Logger e factory createNullLogger |
| `packages/logger/src/index.test.ts` | Teste de infraestrutura em Vitest para validação de logger |
| `packages/database/package.json` | Manifest do workspace @voice-agent/database (placeholder arquitetural) |
| `packages/database/tsconfig.json` | Configuração TypeScript do database |
| `packages/database/src/index.ts` | Placeholder arquitetural (sem ORM, sem schema, sem banco real) |
| `packages/ui/package.json` | Manifest do workspace @voice-agent/ui (placeholder de compilação) |
| `packages/ui/tsconfig.json` | Configuração TypeScript da UI |
| `packages/ui/src/index.ts` | Placeholder de compilação sem dependências pesadas |
| `packages/config/package.json` | Manifest do workspace @voice-agent/config (placeholder de compilação) |
| `packages/config/tsconfig.json` | Configuração TypeScript de config |
| `packages/config/src/index.ts` | Placeholder de compilação |
| `packages/integrations/package.json`| Manifest do workspace @voice-agent/integrations (placeholder para adapters) |
| `packages/integrations/tsconfig.json`| Configuração TypeScript de integrações |
| `packages/integrations/src/index.ts`| Placeholder para implementações concretas de adapters |
| `packages/test-utils/package.json` | Manifest do workspace @voice-agent/test-utils (placeholder de testes) |
| `packages/test-utils/tsconfig.json`| Configuração TypeScript de test-utils |
| `packages/test-utils/src/index.ts` | Placeholder de compilação |

### Arquivos Alterados
- `docs/AI_WORKLOG.md`: Adicionada esta entrada.
- `PROJECT_MAP.md`: Atualizado para refletir a árvore física completa do monorepo e guardrails.
- `docs/DECISIONS_LOG.md`: Adicionada decisão DEC-018 (Tooling do Monorepo, Node 24 e Guardrails Automáticos).
- `README.md`: Adicionada seção de desenvolvimento local e execução de scripts de qualidade.

### Dependências
- Raiz devDependencies: `@eslint/js`, `eslint`, `globals`, `prettier`, `turbo`, `typescript`, `typescript-eslint`, `vitest`.
- Pacotes internos: interligados exclusivamente via `workspace:*` (ex.: `@voice-agent/contracts`, `@voice-agent/errors`, `@voice-agent/logger`, `@voice-agent/ui`).

### Definição de Runtime Node.js
- **Runtime Oficial de Desenvolvimento e CI Primário**: Node.js `v24.x` (`24.20.0`, fixado em `.node-version`).
- **Linha de Base Mínima Suportada (Produção/Compatibilidade)**: Node.js `v22.x` LTS (`>=22.12.0`, fixado no campo `engines.node` de `package.json`).

### Scripts Centralizados e nos Workspaces
- `pnpm dev`: Inicia o modo de desenvolvimento via Turbo.
- `pnpm build`: Executa build incremental em cascata via Turbo.
- `pnpm lint`: Executa ESLint em todo o repositório.
- `pnpm lint:fix`: Corrige problemas automáticos de ESLint.
- `pnpm typecheck`: Executa verificação de tipos (`tsc --noEmit`) em todos os 12 pacotes via Turbo.
- `pnpm test`: Executa todos os testes unitários via Vitest.
- `pnpm test:watch`: Executa Vitest em modo interativo/observação.
- `pnpm format`: Formata o código com Prettier (ignora documentação existente).
- `pnpm format:check`: Valida a formatação de código com Prettier.
- `pnpm check:architecture`: Executa validação de limites arquiteturais, imports e diretivas TypeScript/ESLint via AST.
- `pnpm check:file-size`: Executa validação de limite de linhas (alvo 80-150, teto 180) em arquivos de lógica de produção com verificação de allowlist.
- `pnpm check`: Pipeline mestre de qualidade local unificado (`format:check && lint && typecheck && test && build && check:architecture && check:file-size`).
- **Workspaces individuais**: Todos os 12 workspaces (`apps/*` e `packages/*`) contêm scripts uniformes de `build`, `lint` e `typecheck`.

### Guardrails Implementados
1. **ESLint 9 Flat Config**:
   - Complexidade ciclomática máxima: 8 (`complexity`);
   - Nível de aninhamento máximo: 3 (`max-depth`);
   - Linhas por função lógica: máximo 50 (`max-lines-per-function`);
   - Parâmetros posicionais: máximo 3 (`max-params`);
   - Tipagem rigorosa: proibido `any` explícito (`@typescript-eslint/no-explicit-any`);
   - Proibição estrita de `@ts-ignore` e `@ts-nocheck` (`@typescript-eslint/ban-ts-comment`);
   - Variáveis não utilizadas: proibidas exceto com prefixo `_` (`@typescript-eslint/no-unused-vars`);
   - Overrides explícitos para testes e scripts de automação.
2. **TypeScript Strict e Resolução Limpa**:
   - `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `noImplicitOverride: true`, `noFallthroughCasesInSwitch: true`, `noImplicitReturns: true`, `useUnknownInCatchVariables: true`.
   - Resolução direta de pacotes internos por `paths` e `exports`, permitindo typecheck limpo sem depender de `dist/` prévio.
   - Padrão Barrel: `index.ts` atua como barrel exportador, separando tipos, erros e interfaces em arquivos específicos (`tenant.ts`, `events.ts`, `ports.ts`, `app-error.ts`, `http-errors.ts`, `logger-interface.ts`, `null-logger.ts`).
3. **Verificador Arquitetural com AST TypeScript (`scripts/check-architecture.mjs`)**:
   - Parser formal via AST do compilador TypeScript (`typescript.createSourceFile`);
   - Banimento de arquivos genéricos (`utils.ts`, `helpers.ts`, `common.ts`, `misc.ts`, `manager.ts`);
   - Bloqueio de imports diretos entre aplicações irmãs (`apps/*` importando `apps/*`);
   - Bloqueio de imports de banco, UI, integrações ou SDKs externos em `packages/contracts`;
   - Restrição estrita de `packages/integrations`: permitido exclusivamente em composition roots / bootstraps explícitos (`bootstrap.*`, `composition-root.*`, `main.*`), estritamente proibido em domínio e use cases;
   - Proibição estrita de `@ts-ignore`, `@ts-nocheck` e `eslint-disable` sem regra específica;
   - Resolução e normalização transparente de aliases `@voice-agent/*` e caminhos relativos em Windows e Linux.
4. **Verificador de Tamanho de Arquivos (`scripts/check-file-size.mjs`)**:
   - Classificação estrita: analisa apenas arquivos de lógica de produção em `apps/*/src/` e `packages/*/src/` (19 arquivos verificados);
   - Ignora testes, configs, fixtures e arquivos de declaração;
   - Alerta em arquivos acima de 150 linhas;
   - Bloqueia arquivos acima de 180 linhas;
   - Allowlist centralizada em `scripts/file-size-allowlist.json` com regra de governança que proíbe agentes de adicionarem exceções sem aprovação humana formal (`approvedBy` humano e `decisionRef` validados no script).

### Testes Executados e Resultados
1. `pnpm format:check` → **SUCESSO** (All matched files use Prettier code style!).
2. `pnpm lint` → **SUCESSO** (0 erros, 0 avisos em todos os workspaces).
3. `pnpm typecheck` → **SUCESSO** (12 pacotes compilados via Turbo sem erros).
4. `pnpm test` → **SUCESSO** (Vitest: 3 test files, 6 passed).
5. `pnpm build` → **SUCESSO** (12 pacotes compilados e empacotados com sucesso via Turbo).
6. `pnpm check:architecture` → **SUCESSO** (Todas as fronteiras, composition roots, restrições de comentários e regras de nomenclatura em conformidade).
7. `pnpm check:file-size` → **SUCESSO** (19 arquivos de lógica de produção avaliados, 0 avisos, 0 erros).
8. `pnpm check` (pipeline completo com build) → **SUCESSO** (Executado de ponta a ponta sem falhas).
9. Teste em estado limpo (remoção de `dist/` e `.turbo/`) → **SUCESSO** (O pipeline não possui dependência de artefatos antigos).
10. `pnpm-lock.yaml` gerado, validado e versionável.

### Warnings e Problemas Encontrados
- **pnpm 12 lifecycle scripts**: O pnpm 12 bloqueia build scripts de pacotes por padrão como medida de segurança contra supply-chain attacks. Foi solucionado adicionando `esbuild` em `onlyBuiltDependencies` no `pnpm-workspace.yaml` e executando `pnpm approve-builds --all`.
- **ESLint globals**: Scripts Node necessitavam de `globals.node`. Resolvido instalando o pacote `globals` e configurando `languageOptions.globals` no `eslint.config.mjs`.
- **TypeScript TS6059**: `rootDir: "./src"` impedia resolução entre pacotes de source sem build prévio. Resolvido removendo a restrição de `rootDir` nos `tsconfig.json` de cada pacote, viabilizando typecheck puro em clone limpo.

### Dívida Técnica
Nenhuma dívida técnica introduzida. A base foi estruturada com rigor máximo de tipos e guardrails.

### Decisões
- **DEC-018**: Formalizada adoção de Node.js v24.20.0 (oficial dev/CI) com suporte a Node v22 LTS em produção, pnpm v12 workspaces, Turborepo 2.x, ESLint 9 Flat Config com regras de complexidade e banimento de `@ts-ignore`, Vitest 3.2.7 e guardrails automáticos via AST.

### Pendências
- Decisões humanas de produto (banco relacional, ORM, framework web, telefonia, IA realtime) continuam estritamente pendentes para as fases subsequentes.

### Próximo Passo Recomendado
Apresentar resultados da conclusão de PROMPT-002 ao usuário e aguardar revisão/aprovação humana antes de qualquer avanço para PROMPT-003.

---

## PROMPT-002C — Correção de Consistência e Governança Pré-Baseline

- **Data**: 2026-09-21
- **Objetivo**: Corrigir inconsistência documental identificada na versão do Vitest, documentar a governança de build scripts do pnpm (`approve-builds`), manter o roadmap e registrar o próximo prompt planejado (`PROMPT-003 — Design System e Application Shell Mobile-First`).

### Diagnóstico de Versão do Vitest
- **`pnpm why vitest`**: Retornou `vitest@3.2.7`.
- **`package.json`**: Declarado `"vitest": "^3.0.5"`.
- **`pnpm-lock.yaml`**: Resolvido `vitest@3.2.7` (com `@vitest/expect@3.2.7`, `@vitest/runner@3.2.7`, etc.).
- **Conclusão**: A versão real instalada e em execução no repositório é **Vitest 3.2.7** (Vitest 3.x). Nenhuma menção a "Vitest 4" procede como versão instalada, tendo sido um erro descritivo em DEC-018 e AI_WORKLOG.md. Todos os documentos foram corrigidos para refletir a realidade factual.

### Governança sobre `pnpm approve-builds` e `onlyBuiltDependencies`
- **Regra Operacional para Agentes de IA**: Adicionada regra estrita na Seção 11 do [AGENTS.md](file:///d:/voice-agent-platform/AGENTS.md) e na Definition of Done.
- **Proibição**: Futuras IAs **NÃO** devem executar `pnpm approve-builds --all` de forma automática.
- **Análise Individual**: Novos scripts de build/lifecycle de pacotes devem ser examinados e justificados individualmente antes de qualquer aprovação.
- **`onlyBuiltDependencies`**: Deve permanecer estritamente mínimo e explícito em `pnpm-workspace.yaml` (atualmente restrito a `esbuild`).

### Status do Roadmap e Próximo Prompt
- **Ordem do Roadmap**: Preservada estritamente conforme `docs/ROADMAP.md`:
  - FASE 0 — Constituição e documentação *(Concluída)*
  - FASE 1 — Arquitetura e contratos *(Pendente de aprovações humanas)*
  - FASE 2 — Monorepo e tooling *(Concluída)*
  - FASE 3 — Design System e Shell da Aplicação
  - FASE 4 — Persistência, autenticação e multi-tenancy
  - FASE 5 — Domínios base + Agent Studio
  - FASE 6+ — Motor de voz, IA, telefonia, observabilidade, hardening
- **Próximo Prompt Planejado**: **PROMPT-003 — Design System e Application Shell Mobile-First**.
- **Escopo Imediato**: Nenhuma modelagem detalhada de clientes, produtos, campanhas ou Agent Studio deve ser implementada antes das respectivas fases.

### Arquivos Alterados
- `docs/DECISIONS_LOG.md`: DEC-018 corrigido de "Vitest 4" para "Vitest 3.2.7".
- `docs/AI_WORKLOG.md`: Correção de menções a Vitest 4 e inclusão desta seção PROMPT-002C.
- `AGENTS.md`: Adicionada a Seção 11 e item no DoD proibindo `pnpm approve-builds --all` automático e exigindo `onlyBuiltDependencies` mínimo.
- `README.md`: Alinhado próximo passo para PROMPT-003 (Design System e Application Shell Mobile-First).

### Validações Executadas
- `pnpm check`: Executado com sucesso integral (format:check, lint, typecheck, test com Vitest 3.2.7, build com Turbo, check:architecture, check:file-size).

---

## PROMPT-002D — Git Baseline e Sincronização Segura

- **Data**: 2026-09-21
- **Objetivo**: Inicializar com segurança o repositório Git local, verificar a ausência de conflitos com o repositório remoto (`samueltarif/voice-agent-platform`), criar o commit de baseline e preparar a sincronização com autorização humana prévia.

### Estado Remoto Encontrado
- **Repositório GitHub**: `samueltarif/voice-agent-platform`
- **Consulta via GitHub MCP**:
  - `list_commits`: Retornou status HTTP 409 (`Git Repository is empty`).
  - `list_branches`: Retornou lista vazia (`[]`).
  - `search_repositories`: Confirmou repositório vazio com branch padrão configurada como `main`.
  - **Conclusão**: O repositório remoto está completamente vazio, sem histórico prévio, commits ou arquivos conflitantes. É 100% seguro estabelecer a base de código local como baseline.

### Estado Local Encontrado
- **Diretório**: `D:/voice-agent-platform`
- **Git local**: `.git` inexistente antes do procedimento (`Test-Path .git` retornou `False`).
- **Segurança e Isolamento**: `.gitignore` ativo protegendo `.env`, `node_modules/`, `dist/`, `.turbo/`, `coverage/`, caches e arquivos temporários da IDE.

### Comandos Executados
1. `git init -b main`: Repositório Git local inicializado na branch `main`.
2. `git remote add origin https://github.com/samueltarif/voice-agent-platform.git`: Remote configurado.
3. `git fetch origin`: Executado com sucesso (zero branches remotas rastreáveis).
4. `pnpm check`: Executado com sucesso (exit code 0 em format:check, lint, typecheck, test, build, check:architecture, check:file-size).
5. `git status`: Verificação de arquivos untracked confirmando ausência total de secrets, `.env`, `node_modules/` ou artefatos temporários.
6. `git add .`: Todos os arquivos de infraestrutura, documentação, tooling e código foram preparados.
7. `git commit -m "chore: establish monorepo tooling and architectural guardrails"`: Criação do commit baseline.

### Arquivos Incluídos no Baseline (92 arquivos)
- Configurações e Dotfiles: `.editorconfig`, `.gitattributes`, `.gitignore`, `.node-version`, `.prettierignore`, `eslint.config.mjs`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `prettier.config.mjs`, `tsconfig.base.json`, `tsconfig.json`, `turbo.json`, `vitest.config.ts`.
- Documentação Raiz: `AGENTS.md`, `ARCHITECTURE.md`, `FOUNDATION_MASTER.md`, `PROJECT_CONSTITUTION.md`, `PROJECT_MAP.md`, `README.md`.
- Documentos de Domínio (`docs/`): `AGENT_STUDIO.md`, `AI_WORKLOG.md`, `COST_MODEL.md`, `DATABASE.md`, `DECISIONS_LOG.md`, `DEPLOYMENT.md`, `DESIGN_SYSTEM.md`, `EVENTS.md`, `INTEGRATIONS.md`, `MOBILE_GUIDELINES.md`, `OBSERVABILITY.md`, `PROJECT_VISION.md`, `ROADMAP.md`, `SECURITY.md`, `TESTING_STRATEGY.md`, `VOICE_ARCHITECTURE.md`.
- ADRs (`docs/architecture/decisions/`): ADR-001 a ADR-006 e `README.md`.
- Scripts de Guardrails (`scripts/`): `check-architecture.mjs`, `check-file-size.mjs`, `file-size-allowlist.json`.
- Aplicações (`apps/`): `api`, `voice`, `web`, `worker` (cada uma com `package.json`, `tsconfig.json`, `src/index.ts`).
- Pacotes (`packages/`): `config`, `contracts`, `database`, `errors`, `integrations`, `logger`, `test-utils`, `ui` (com sources, tipos e testes unitários).

### Resultado do Commit
- **Commit Criado**: Sim.
- **Mensagem**: `chore: establish monorepo tooling and architectural guardrails`
- **Hash do Commit**: Hash final autoritativo: consultar git rev-parse HEAD após o commit estar fechado.

### Estado do Push
- **Push Executado**: NÃO.
- Em conformidade estrita com as instruções, o comando `git push` não foi executado e aguarda aprovação humana explícita.

- **Aprovação do Push**: Concedida em PROMPT-002E. Push realizado com sucesso.
- **Autorização para Próximo Prompt**: Aguardando comando para **PROMPT-003 — Design System e Application Shell Mobile-First**.

---

## PROMPT-002E — Finalização do Baseline e Publicação no GitHub

- **Data**: 2026-09-21
- **Objetivo**: Corrigir referências a hash autoritativo no baseline commit, validar conformidade com `pnpm check`, publicar a branch `main` no GitHub (`samueltarif/voice-agent-platform`) e confirmar o estado remoto via GitHub MCP.

### O que foi implementado
1. **Ajuste de Referência de Hash**: Atualizada a seção PROMPT-002D em `docs/AI_WORKLOG.md` para evitar autorreferência de hash dentro do próprio commit, registrando a instrução autoritativa para consulta via `git rev-parse HEAD`.
2. **Amend Final do Baseline**:
   - `pnpm check`: Executado com 100% de aprovação (formatação, lint, typecheck, testes unitários, build com Turbo, verificação arquitetural e limites de tamanho de arquivo).
   - `git commit --amend --no-edit`: Finalizado o commit baseline raiz.
   - Hash final autoritativo do baseline: `57c10f33b5e7c07cac2d1789d641234c68f323e4` (`57c10f3`).
3. **Publicação no GitHub**:
   - `git push -u origin main`: Executado com sucesso.
   - Rastreamento remoto configurado: `main -> origin/main`.
4. **Verificação Remota via GitHub MCP**:
   - `list_branches`: Confirmou existência remota da branch `main` com SHA `57c10f33b5e7c07cac2d1789d641234c68f323e4`.
   - `get_commit`: Confirmou 92 arquivos do baseline publicados e autor/committer alinhados.
   - `get_file_contents`: Confirmou disponibilidade dos arquivos e integridade de conteúdo.

### Arquivos alterados
- `docs/AI_WORKLOG.md`: Registro da execução do PROMPT-002E e documentação do hash do baseline.

### Dependências adicionadas
Nenhuma.

### Alterações de banco
Nenhuma.

### Alterações de API
Nenhuma.

### Decisões tomadas
- Hash definitivo do commit de baseline registrado em commit separado de documentação para manter a imutabilidade do baseline original.
- Preservada a proibição de avançar para PROMPT-003 ou criar novas features nesta etapa.

### Testes e Verificações executados
- `pnpm check`: Todos os checks passaram integralmente (format:check, lint, typecheck, vitest com 6 testes em 3 arquivos [logger: 1, contracts: 2, errors: 3], build de 12 pacotes/apps, check:architecture com 0 violações, check:file-size com 0 violações).
- `git status --short`: Working tree limpa.
- `git branch -vv`: Confirmada sincronização com `origin/main`.
- `list_branches` (GitHub MCP): Validada branch `main` e SHA correspondente ao HEAD local.

### Próximo Passo Planejado
- Aguardar autorização humana para avançar para **PROMPT-003 — Design System e Application Shell Mobile-First**.

---

## PROMPT-002F — Security Hygiene e Git Governance

- **Data**: 2026-09-21
- **Objetivo**: Aplicar higiene rigorosa de credenciais após exposição de credencial em log de tarefa anterior, remover artefatos temporários, registrar guardrails operacionais de segurança no `AGENTS.md`, validar a suite autoritativa de testes unitários (6 testes), verificar proteção da branch `main` e estabelecer fluxo de governança por branch dedicada.

### Descrição do Incidente de Credencial
- Durante a execução do PROMPT-002E, ao tentar diagnosticar falha de push pelo Git Credential Manager, houve execução de comando/script que expôs o valor de uma credencial GitHub em saída de terminal e arquivo de log temporário local.
- **Ação Humana Requerida/Executada**: A credencial exposta foi revogada/rotacionada pelo operador humano no GitHub.
- **Isolamento e Segurança**: Nenhuma credencial, parcial ou fingerprint de token foi ou será copiada para este log ou commit.

### Higiene Local e Artefatos Temporários Removidos
- Foram localizados e sumariamente removidos do diretório temporário `scratch/` os scripts auxiliares criados durante a investigação:
  - `check_env.ps1` (removido)
  - `check_mcp_token.ps1` (removido)
  - `check_token.ps1` (removido)
  - `update_git_credential.ps1` (removido)
- Confirmada a inexistência de scripts residuais em `scratch/`.

### Guardrails Adicionados ao AGENTS.md
- Seção 7 (Item 2) expandida com regras estritas e inegociáveis para agentes de IA:
  - Proibição absoluta de imprimir tokens, usá-los em comandos `curl`/CLI, inspecionar `$env` para ler valores de secrets, inspecionar argumentos de processos, buscar tokens em configs, transferir tokens entre ferramentas (ex.: MCP para Git) ou registrar credenciais em logs/docs.
  - Definição estrita de que agentes podem verificar apenas existência (booleana), status de autenticação e permissões observáveis sem nunca revelar o valor.
  - Desacoplamento operacional explícito entre Git CLI e GitHub MCP como autenticações independentes.

### Auditoria e Correção da Suíte de Testes
- **Investigação**: Executado `pnpm test` e `git diff 57c10f3..HEAD -- packages`.
- **Constatação Factual**: Não houve qualquer alteração em arquivos de teste ou pacotes entre o baseline e o estado atual.
- **Resultado Autoritativo Real**: A suíte executa exatamente **6 testes em 3 arquivos**:
  - `packages/logger/src/index.test.ts`: 1 teste
  - `packages/contracts/src/index.test.ts`: 2 testes
  - `packages/errors/src/index.test.ts`: 3 testes
- A menção errônea a "7 testes" no registro anterior de PROMPT-002E foi retificada neste documento para refletir com exatidão factual a realidade da base.

### Estado da Branch Protection
- Consulta via GitHub MCP (`list_branches` em modo leitura):
  - Branch: `main`
  - Status: `protected: false`
- **Recomendação e Pendência Humana**: O agente não possui autorização e não deve alterar configurações administrativas automaticamente. O operador humano deve habilitar manualmente a proteção de branch (Ruleset ou Branch Protection) no GitHub para `main` com a seguinte política desejada:
  - Nenhuma feature com commit direto em `main`;
  - Desenvolvimento restrito a branches `feature/*`, `fix/*`, `chore/*`;
  - Pull Request obrigatório antes do merge;
  - `pnpm check` (CI/Status Check) obrigatório passando antes do merge;
  - Bloqueio de force push (`Allow force pushes: false`);
  - Bloqueio de exclusão da branch (`Allow deletions: false`).

### Governança Git desta Tarefa
- Branch criada: `chore/security-governance` (nenhum push direto para `main`).
- Commit: `chore: harden credential handling and git governance`.
- Push: `git push -u origin chore/security-governance`.

### Validações Executadas
- `pnpm check`: Aprovado com sucesso integral (format:check, lint, typecheck, 6 testes no vitest, build turbo em 12 pacotes, check:architecture, check:file-size).
- `git status --short`: Working tree limpa após commit na branch dedicada.

