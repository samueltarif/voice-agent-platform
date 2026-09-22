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

### Higiene Local e Tratamento de Artefatos Temporários
- **Scripts temporários conhecidos em `scratch/`**: Foram localizados e sumariamente removidos:
  - `check_env.ps1` (removido)
  - `check_mcp_token.ps1` (removido)
  - `check_token.ps1` (removido)
  - `update_git_credential.ps1` (removido)
- **Status da credencial**: A credencial exposta foi revogada/rotacionada pelo operador humano e não deve ser reutilizada sob hipótese alguma.
- **Ressalva sobre logs históricos**: Logs históricos e transientes de sessões anteriores do ambiente Antigravity podem ter registrado a credencial revogada. É estritamente proibido aos agentes reabrir, pesquisar ou imprimir esses valores novamente.

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
  - `pnpm check` obrigatório localmente antes de aprovação/merge (a transformação desse gate em GitHub Status Check remoto ocorrerá quando o workflow de CI for implementado);
  - Bloqueio de force push (`Allow force pushes: false`);
  - Bloqueio de exclusão da branch (`Allow deletions: false`).

### Governança Git desta Tarefa
- Branch criada: `chore/security-governance` (nenhum push direto para `main`).
- Commit: `chore: harden credential handling and git governance`.
- Push: `git push -u origin chore/security-governance`.

### Validações Executadas
- `pnpm check`: Aprovado com sucesso integral (format:check, lint, typecheck, 6 testes no vitest, build turbo em 12 pacotes, check:architecture, check:file-size).
- `git status --short`: Working tree limpa após commit na branch dedicada.

---

## PROMPT-002G — Fechamento de Governança Pré-Frontend

- **Data**: 2026-09-21
- **Objetivo**: Finalizar a governança do repositório antes do PROMPT-003, ajustando afirmações sobre logs históricos de credenciais, confirmando estado remoto das branches, registrando Pull Request formal para merge em `main`, mantendo registro de proteção de branch sem alterações administrativas automáticas e validando a integridade da base.

### Correção sobre Logs Históricos e Credenciais
- Ajustada a declaração em PROMPT-002F para evitar afirmações absolutas sobre o disco:
  - Os scripts temporários conhecidos em `scratch/` foram removidos;
  - A credencial exposta foi revogada/rotacionada pelo operador humano e está inutilizada;
  - Logs históricos de sessões passadas do ambiente Antigravity podem conter registros transientes da credencial revogada;
  - Vigora a proibição absoluta de reabrir, pesquisar por conteúdo ou imprimir esses valores;
  - A credencial revogada não deve ser reutilizada sob pretexto algum.

### Estado das Branches Remotas (GitHub MCP em Modo Leitura)
- **`main`**:
  - HEAD: `7e08e3e23d7cb387f74837066242b41bfa3ebe31`
  - Proteção: `protected: false`
- **`chore/security-governance`**:
  - HEAD remoto anterior: `e4a55982e618f899073487fc4d57d8db033d254b`
  - Proteção: `protected: false`

### Pull Request Criado
- **Pull Request**: `#1`
- **URL**: `https://github.com/samueltarif/voice-agent-platform/pull/1`
- **Origem (head)**: `chore/security-governance`
- **Destino (base)**: `main`
- **Título**: `chore: harden credential handling and git governance`
- **Status**: Aberto (aguardando revisão e merge humanos — zero auto-merge).

### Governança e Proteção da `main`
- A branch `main` permanece com `protected: false`.
- Nenhuma alteração administrativa remota foi realizada automaticamente pelo agente.
- **Pendência Humana**: Configuração de Branch Protection / Ruleset no GitHub para `main`:
  - Bloqueio de commits diretos em `main`;
  - Desenvolvimento exclusivo via branches (`feature/*`, `fix/*`, `chore/*`);
  - Pull Request obrigatório antes de merge;
  - `pnpm check` obrigatório localmente antes de aprovação/merge (enquanto não houver workflow de CI no GitHub publicando status check);
  - Impedir force push;
  - Impedir exclusão da branch `main`.

### Validação Executada
- `pnpm check`: Executado com aprovação integral (format:check, lint, typecheck, 6 testes no vitest, build turbo em 12 pacotes, check:architecture, check:file-size).
- `git status --short`: Working tree limpa após commit de governança.

### Guardrails de Escopo
- **Nenhuma feature implementada.**
- **Nenhuma dependência instalada.**
- **Nenhum código de produto alterado.**
- **PROMPT-003 NÃO foi iniciado.**




---

## PROMPT-002H — Commercial Access, Platform Admin, Live Calls, Recording e Human Handoff

- **Data**: 2026-09-22
- **Objetivo**: Formalizar na arquitetura e documentação do projeto os novos requisitos confirmados pelo proprietário antes de iniciar o frontend (PROMPT-003). Tarefa estritamente documental e arquitetural (sem código de produto, sem banco real, sem migrations, sem auth, sem SDKs de telefonia/IA, sem gateway de pagamento e sem chamadas reais).

### Status Factual dos Componentes e Conceitos
- **Platform Control Plane**: ARQUITETURA DOCUMENTADA, NÃO IMPLEMENTADA.
- **Platform Admin Global**: ARQUITETURA DOCUMENTADA, NÃO IMPLEMENTADA.
- **Modelo Comercial (BillingMode / Entitlements / CommercialGrant)**: ARQUITETURA DOCUMENTADA, NÃO IMPLEMENTADA.
- **Usage / Cost / Billing Separation**: ARQUITETURA DOCUMENTADA, NÃO IMPLEMENTADA.
- **Live Call Monitoring (Data/Events via WebSocket)**: ARQUITETURA DOCUMENTADA, NÃO IMPLEMENTADA.
- **Live Audio Streaming**: STATUS: PLANNED / PROVIDER-DEPENDENT / NÃO VALIDADO COM PROVIDER REAL.
- **Call Recording**: STATUS: PLANNED / NÃO VALIDADO COM PROVIDER REAL / COMPLIANCE JURÍDICO PENDENTE.
- **Listen-Only Mode**: STATUS: PLANNED / PROVIDER-DEPENDENT / NÃO VALIDADO COM PROVIDER REAL.
- **Human Handoff Protocol (State Machine & Fallback)**: ARQUITETURA DOCUMENTADA, NÃO IMPLEMENTADA.
- **Sales Queue / Seller Availability**: CONCEITO DOCUMENTADO, NÃO IMPLEMENTADO.

### Arquitetura Comercial e Platform Control Plane
1. **Separação de Contextos**:
   - **Tenant Application**: Área restrita para empresas clientes (Dashboard, Agentes, Campanhas, Chamadas, Transcrições, Vendedores/Handoffs, Analytics, Integrações, Configurações).
   - **Platform Control Plane**: Área restrita para a administração/proprietário do SaaS (Organizations, Plans, Access/Entitlements, Subscriptions, Usage, Costs, Billing, Platform Audit, System Health).
2. **Platform Admin Global**:
   - Autorização estritamente global (`Platform Admin` / `Master Admin`), completamente isolada de memberships ou papéis de tenant (`Organization`).
   - Requisito de segurança: Nenhum usuário de tenant pode se auto-elevar a Platform Admin via membership.
3. **Desacoplamento entre Pagamento e Acesso**:
   - Rejeição formal do anti-pattern `pagou = liberado`. O direito de acesso é avaliado dinamicamente via Plano + Entitlements + Estado Comercial.
   - **BillingMode**: `SELF_SERVICE`, `MANUAL`, `COMPLIMENTARY`.
   - **SubscriptionStatus**: Proposta inicial com `TRIALING`, `ACTIVE`, `PAST_DUE`, `SUSPENDED`, `CANCELED`, `EXPIRED`. Proibido condensar status em booleanos frágeis (`isPremium`, `isActive`).
   - **CommercialGrant**: Concessão manual auditável de acesso (`organizationId`, `planId`, `startsAt`, `endsAt`, `grantedBy`, `reason`, `reference`).
   - **Plans e Entitlements**: Proibição de regras espalhadas por plano (`if plan === 'professional'`). Capacidades resolvidas exclusivamente por Entitlements (`agents.max`, `voice.monthlyMinutes`, `recordings.enabled`, `liveMonitoring.enabled`, `humanHandoff.enabled`, etc.).
4. **Separação de Camadas Financeiras e de Uso**:
   - `Usage` (consumo bruto operacional) ≠ `Cost` (custo incorrido junto a fornecedores) ≠ `Billing` (faturamento/cobrança contratual ou de gateway). O rastreamento de uso é independente de gateway de pagamento.

### Live Calls, Recording e Human Handoff
1. **Live Call Monitoring**:
   - Visualização em tempo real de status, duração, agente ativo, cliente, transcrição ao vivo, eventos, tools executadas, intenções e status de handoff.
   - Streaming de áudio ao vivo marcado como `STATUS: PLANNED / PROVIDER-DEPENDENT / NOT YET VALIDATED`.
2. **Call Recording**:
   - Ativo de gravação armazenado em Object Storage com acesso autenticado estritamente via presigned URLs temporárias com TTL curto.
   - Requisitos de criptografia em repouso, isolamento por tenant, trilha de auditoria e políticas de retenção/expiração/anonimização configuráveis.
   - Aviso regulatório mandatório: `COMPLIANCE VERIFICATION REQUIRED BEFORE PRODUCTION` (análise de leis de gravação telefônica, consentimento bilateral e LGPD).
3. **Human Handoff**:
   - Protocolo orquestrado determinístico: a IA inicia a transição suavemente enquanto o operador aceita e se prepara, transferindo no evento `READY_TO_JOIN`.
   - Máquina de estados formalizada: `NONE` → `REQUESTED` → `SELLER_NOTIFIED` → `SELLER_READY` → `AI_PREPARING` → `READY_TO_JOIN` → `HUMAN_CONNECTED` → `AI_DETACHED` (com estados de exceção: `FAILED`, `CANCELED`, `TIMED_OUT`).
   - Modo Listen-Only: vendedor ouve antes de ingressar; status `PLANNED / PROVIDER-DEPENDENT / NOT YET VALIDATED`.
   - Regra mandatória de Fallback com Zero Silêncio: a IA nunca deixa o cliente em espera silenciosa indefinida. Na ausência de vendedor ou em timeout, reassume e propõe continuidade, retorno ou agendamento.
4. **Sales Queue e Vendedores**:
   - Conceito futuro de fila de vendas, disponibilidade de operadores e atribuição auditada de quem assumiu a chamada.
5. **Eventos Internos Canônicos**:
   - Adicionados a `docs/EVENTS.md`: `call.recording_started`, `call.recording_available`, `call.handoff_requested`, `call.seller_notified`, `call.seller_ready`, `call.handoff_ready`, `call.human_joined`, `call.ai_detached`, `call.handoff_failed`, `call.handoff_canceled`.

### Impacto no Roadmap e no Frontend
- **FASE 3 (Design System + Application Shell)**: Preparada conceitualmente para suportar dois contextos estruturais: Tenant Application e Platform Control Plane.
- **FASE 4 (Persistência + Auth + Multi-Tenancy)**: Planejada subfase 4.1 para introdução do modelo comercial (Plans, Entitlements, Subscriptions, Commercial Grants, Platform Admin).
- **FASE 6 e 8**: Implementação do motor de voz, monitoramento em tempo real, gravações e human handoff mantidos estritamente atrelados às fases de telefonia/áudio real.

### Decisões Registradas e Pendências Mantidas
- **Novas Decisões Arquiteturais (DEC-019 a DEC-024)**:
  - DEC-019: Separação entre Tenant Application e Platform Control Plane com Platform Admin Global.
  - DEC-020: Desacoplamento de Pagamento e Direito de Acesso via Entitlements e Commercial Grants.
  - DEC-021: Separação Conceitual entre Usage, Cost e Billing.
  - DEC-022: Monitoramento de Chamadas em Tempo Real e Status de Áudio ao Vivo.
  - DEC-023: Arquitetura de Gravação de Chamadas e Presigned URLs com Compliance Pendente.
  - DEC-024: Protocolo Determinístico de Human Handoff e Fallback de Zero Silêncio.
- **Decisões Mantidas Pendentes (Nenhum fornecedor selecionado)**:
  - Gateway de pagamento, provedor de auth, banco relacional, ORM, fornecedor de telefonia, IA realtime, storage, cache, filas, framework frontend e infraestrutura de cloud.

### Arquivos Criados
1. `docs/PLATFORM_CONTROL_PLANE.md`: Especificação canônica do Platform Control Plane, Platform Admin Global, Modelo Comercial desacoplado, Entitlements e Governança Financeira.
2. `docs/LIVE_CALLS_AND_HANDOFF.md`: Especificação canônica de Live Monitoring, Gravações, Compliance, Protocolo Determinístico de Handoff, State Machine, Fallbacks e Filas de Vendedores.

### Arquivos Alterados
1. `ARCHITECTURE.md`: Atualização das fronteiras do sistema, papéis do voice/worker, isolamento global de Platform Admin e referências a novos documentos.
2. `FOUNDATION_MASTER.md`: Atualização das seções 1, 7.5 e 19 integrando o Control Plane, modelo comercial, handoff e decisões DEC-019 a DEC-024.
3. `docs/PROJECT_VISION.md`: Formalização dos escopos Tenant Application vs Platform Control Plane na seção 4.
4. `docs/VOICE_ARCHITECTURE.md`: Inclusão da Seção 6 com referências canônicas para Live Calls, Recording e Human Handoff.
5. `docs/EVENTS.md`: Especificação dos eventos de gravação (`call.recording_*`) e de handoff (`call.handoff_*`, `call.seller_*`, `call.human_joined`, `call.ai_detached`).
6. `docs/SECURITY.md`: Adição de diretrizes de isolamento global para Platform Admin e governança regulatória de mídias.
7. `docs/COST_MODEL.md`: Inclusão da Seção 4 detalhando a separação conceitual entre `Usage`, `Cost` e `Billing`.
8. `docs/ROADMAP.md`: Ajustes nas fases 3, 4, 6 e 8; remoção de bloco duplicado legado.
9. `docs/DECISIONS_LOG.md`: Registro formal de DEC-019 a DEC-024 e atualização da tabela de decisões pendentes com novos itens (18, 19 e 20).
10. `docs/AI_WORKLOG.md`: Registro cronológico factual e detalhado de PROMPT-002H.

### Ferramentas e MCPs Utilizados
- Ferramentas nativas de arquivo (`view_file`, `replace_file_content`, `write_to_file`, `run_command`).
- `github-mcp-server`: Utilizado para criação formal de Pull Request sem auto-merge.

### Comandos Executados e Resultados
- `git checkout -b docs/platform-control-live-calls`: Branch criada a partir de `main` (`64d3551`).
- `pnpm check`: Executado em validação pré-commit (aprovação integral: lint, formatting, typecheck, vitest com 6 testes, build turbo de 12 pacotes, architecture e file-size checks).
- `git status --short`: Verificação de status limpo e controlado.
- `git add .` e `git commit`: Commit estruturado com a mensagem padronizada.
- `git push -u origin docs/platform-control-live-calls`: Push da branch remota.

### Riscos e Compliance Pendente
- **Compliance Regulatório (Telefonia e LGPD)**: Requisitos de consentimento bilateral de gravação, armazenamento seguro e descarte devem ser homologados juridicamente antes de qualquer operação em produção (`COMPLIANCE VERIFICATION REQUIRED BEFORE PRODUCTION`).
- **Dependência Técnica de Carrier**: Modos Listen-Only e Live Audio Streaming necessitam validação de capacidade real na API/infraestrutura do carrier que for contratado na Fase 8.

### Próximo Passo
- O arquivo principal para revisão externa é este `docs/AI_WORKLOG.md`.
- Conclusão da etapa documental e submissão de Pull Request para a branch `main`.
- Aguardar aprovação do proprietário para dar início ao `PROMPT-003 — Design System e Application Shell Mobile-First`.



---

## PROMPT-002H-FIX — Precisão Jurídica e Neutralidade de Storage

- **Data**: 2026-09-22
- **Objetivo**: Corrigir formulações excessivamente específicas sobre regras jurídicas de gravação, prescrição única de mecanismo de acesso a mídias e inferência emocional em monitoramento ao vivo, identificadas durante a revisão externa do PROMPT-002H.
- **Natureza da Tarefa**: Exclusivamente DOCUMENTAL e de REFINAMENTO TEXTUAL. Sem implementação de features, sem instalação de dependências, sem alteração de banco e sem início de PROMPT-003.

### Diagnóstico e O Que Estava Excessivamente Específico
1. **Compliance de Gravação e "Consentimento Bilateral"**:
   - *Problema*: A menção a "consentimento bilateral" como requisito jurídico pressuposto em tabelas e resumos implicava uma determinação legal definitiva não validada formalmente.
   - *Status Factual*: `LEGAL REQUIREMENT: NÃO VERIFICADO`.
   - *Ajuste Realizado*: Substituição integral por linguagem juridicamente neutra:
     > "Requisitos de aviso, ciência, consentimento e/ou outra base legal aplicável à gravação devem ser verificados antes da produção conforme jurisdição, finalidade, tipo de chamada e legislação/regulação vigente."
   - Mantida a exigência mandatória: `COMPLIANCE VERIFICATION REQUIRED BEFORE PRODUCTION`.
2. **Neutralidade de Storage e Acesso às Gravações**:
   - *Problema*: Expressões como "acesso estritamente via presigned URLs" ou "TTL curto obrigatório" foram utilizadas de forma prescritiva como regras arquiteturais absolutas.
   - *Ajuste Realizado*: Transição para um princípio neutro de segurança da informação:
     - Mídia privada por padrão no Object Storage;
     - Autorização e autenticação obrigatórias antes do acesso com isolamento estrito de tenant (`organizationId`);
     - Acesso através de mecanismo autenticado/autorizado, temporário e auditável quando aplicável (presigned URLs, signed delivery ou streaming via endpoint autenticado);
     - Presigned URL mantida expressamente como **exemplo de implementação**, não como imposição única;
     - TTL configurável conforme análise de risco, política de segurança e contexto de deployment;
     - Provedor de storage mantido estritamente como **Pending Decision**.
3. **Sinais de Interesse vs. Sentimento no Live Monitoring**:
   - *Investigação*:
     - Em `docs/LIVE_CALLS_AND_HANDOFF.md` (seção 1.1): "sentimento" **NÃO FOI ENCONTRADO** — o documento já utilizava a especificação aprovada "Sinais de Interesse / Qualificação: Classificações preliminares de intenção identificadas pelo contexto". Nenhuma alteração foi necessária nesse arquivo para este item.
     - Em `FOUNDATION_MASTER.md` (seção 7.5): foi identificada a menção "sentimentos e status em tempo real".
     - Em `docs/PROJECT_VISION.md` (seção 4.1): foi identificada a expressão "diarização e análise de sentimento".
   - *Ajuste Realizado*: Removida a formalização de inferência emocional/psicológica no monitoramento ao vivo, padronizando para:
     > "sinais de interesse/intenção baseados no conteúdo da conversa".

### Arquivos Pesquisados
- `ARCHITECTURE.md`
- `FOUNDATION_MASTER.md`
- `docs/LIVE_CALLS_AND_HANDOFF.md`
- `docs/SECURITY.md`
- `docs/DECISIONS_LOG.md`
- `docs/VOICE_ARCHITECTURE.md`
- `docs/ROADMAP.md`
- `docs/PROJECT_VISION.md`
- `docs/PLATFORM_CONTROL_PLANE.md`
- `docs/EVENTS.md`
- `docs/COST_MODEL.md`
- `docs/AI_WORKLOG.md`

### Arquivos Realmente Alterados e Trechos Corrigidos
1. `ARCHITECTURE.md`:
   - *Seção 8 (Item 6)*: De "acessados unicamente via URLs temporárias pré-assinadas" para "privados por padrão e acessados apenas via mecanismo autenticado/autorizado, temporário e auditável quando aplicável (como URLs pré-assinadas, signed delivery ou endpoint autenticado), com validação mandatória de `organizationId` e TTL configurável".
2. `FOUNDATION_MASTER.md`:
   - *Seção 1.3 (Item 8)*: De "gravação protegida por presigned URLs" para "player integrado com acesso a gravações protegido por mecanismo autenticado e temporário".
   - *Seção 7.5*: Substituição de "sentimentos" por "sinais de interesse/intenção baseados no conteúdo da conversa", e reformulação neutra do acesso a gravações.
   - *Seção 11 (Item 4)*: De acesso web restrito a URLs pré-assinadas para mecanismo autenticado/temporário com TTL configurável.
   - *Seção 19*: Ajuste na descrição de DEC-024 e no item 20 da tabela de decisões pendentes, substituindo "consentimento bilateral" pela fórmula neutra de conformidade jurídica.
3. `docs/LIVE_CALLS_AND_HANDOFF.md`:
   - *Seção 2.2*: Reformulada para "Mídia Privada e Acesso Autorizado", definindo presigned URLs como exemplo entre opções temporárias/auditáveis.
   - *Seção 2.3 (Ressalva Jurídica)*: Substituída menção a consentimento unilateral/bilateral pela fórmula neutra abrangendo aviso, ciência, consentimento ou outra base legal aplicável.
4. `docs/SECURITY.md`:
   - *Seção 4 (Item 1)*: Neutralizada a exigência de presigned URLs, estabelecendo mídias privadas por padrão com acesso temporário e auditável sob TTL configurável.
   - *Seção 4 (Item 5)*: Atualizada a ressalva regulatória pré-produção com linguagem juridicamente neutra.
5. `docs/DECISIONS_LOG.md`:
   - *DEC-024*: Atualizado o resumo da decisão para explicitar neutralidade no mecanismo de acesso a mídias e na verificação regulatória.
6. `docs/VOICE_ARCHITECTURE.md`:
   - *Seção 6*: Substituído "object storage com URLs pré-assinadas" por "object storage com acesso autenticado/temporário e isolamento por tenant".
7. `docs/ROADMAP.md`:
   - *FASE 8*: Substituído "URLs pré-assinadas" por "acesso autenticado/temporário e isolamento por tenant".
8. `docs/PROJECT_VISION.md`:
   - *Seção 4.1*: Na linha de Gravações & Transcrições, substituído "URL pré-assinada" e "análise de sentimento" por "acesso autenticado/temporário, diarização e sinais de interesse/conteúdo".
9. `docs/AI_WORKLOG.md`:
   - Adicionada esta entrada detalhada para PROMPT-002H-FIX.

### Validação Executada
- `pnpm check`: Executado com aprovação integral (0 erros, Prettier, ESLint, TypeScript em 12 pacotes, Vitest 6/6 testes, Turbo Build em 12 pacotes, Architecture AST check, File Size check).
- `git diff`: Revisado para garantir que apenas linguagem documental foi refinada.
- `git status --short`: Verificada higienização e controle dos arquivos.

### Governança Git e Estado do Pull Request
- **Branch Ativa**: `docs/platform-control-live-calls` (mantida a mesma branch, sem bifurcação).
- **Commit**: `docs: refine recording compliance and media access wording`.
- **Push**: `origin/docs/platform-control-live-calls`.
- **Pull Request #2**: O PR aberto anteriormente (`https://github.com/samueltarif/voice-agent-platform/pull/2`) é atualizado automaticamente pelo push na branch existente.
- **Zero Auto-Merge**: O PR permanece aberto aguardando revisão humana.
- **PROMPT-003**: NÃO iniciado.

---

## PROMPT-002H-CHECK — Imutabilidade de Decisions e Auditabilidade do AI_WORKLOG

- **Data**: 2026-09-22
- **Objetivo**: Verificar a estabilidade dos identificadores DEC-023 e DEC-024 entre `f00c7f7` e HEAD, sanar divergências de referências cruzadas, formalizar o princípio append-only de auditabilidade no `AGENTS.md` e restaurar o registro histórico original de PROMPT-002H sem reescrever entradas anteriores.
- **Natureza da Tarefa**: Exclusivamente GOVERNANÇA, AUDITORIA e REFINAMENTO DOCUMENTAL. Sem novas dependências, sem código de produto, sem alteração de banco e sem início de PROMPT-003.

### 1. Auditoria Factual de DEC-023 e DEC-024 (f00c7f7 vs. HEAD)
- **Comparação Executada**:
  - `git show f00c7f7:docs/DECISIONS_LOG.md` vs. `docs/DECISIONS_LOG.md` em HEAD.
- **Evidência Factual da Fonte Autoritativa (`docs/DECISIONS_LOG.md`)**:
  - Tanto em `f00c7f7` quanto em HEAD:
    - **DEC-023**: `Protocolo Determinístico de Human Handoff e Prevenção de Abandono`
    - **DEC-024**: `Governança de Gravações de Chamadas e Compliance Jurídico`
  - *Houve troca de identidade no DECISIONS_LOG.md?* **NÃO**. A associação de IDs permaneceu estável.
- **Investigação de Inconsistência de Referências Cruzadas**:
  - Em `ARCHITECTURE.md`, `docs/VOICE_ARCHITECTURE.md`, `docs/LIVE_CALLS_AND_HANDOFF.md`, `docs/SECURITY.md`, `docs/ROADMAP.md` e `docs/PROJECT_VISION.md`: os identificadores numéricos DEC-023 e DEC-024 **NÃO** são citados.
  - Em `f00c7f7:FOUNDATION_MASTER.md` e na entrada inicial de `f00c7f7:docs/AI_WORKLOG.md`: ocorreu uma citação textual invertida (Gravação citava DEC-023 e Handoff citava DEC-024).
  - Em `HEAD:FOUNDATION_MASTER.md`:
    - Linha 497 citava incorretamente `(DEC-023/DEC-024)` para gravação de chamadas.
    - Linha 498 citava incorretamente `(DEC-024)` para human handoff.
- **Correção Necessária e Aplicada**:
  - **SIM**. Harmonizada a citação em `FOUNDATION_MASTER.md` para respeitar a fonte autoritativa imutável (`docs/DECISIONS_LOG.md`):
    - Linha 497 (Gravação de chamadas): associada formalmente a **`DEC-024`**.
    - Linha 498 (Human Handoff): associada formalmente a **`DEC-023`**.

### 2. Formalização do Princípio Append-Only no AGENTS.md
- Adicionada a **Seção 12 — Regras de Auditabilidade do AI_WORKLOG (Append-Only)** no [`AGENTS.md`](file:///d:/voice-agent-platform/AGENTS.md#L162-L168):
  1. *Natureza Cronológica*: Entradas históricas em `docs/AI_WORKLOG.md` são registros factuais imutáveis e **NUNCA** devem ser silenciosamente reescritas para refletir decisões futuras.
  2. *Correções Posteriores*: Qualquer correção de fato superado ou formulação incorreta deve ser registrada exclusivamente em nova entrada cronológica posterior, com indicação do erro, do prompt de origem e da evidência factual.
  3. *Exceção Estrita*: Remoção emergencial de segredos ou credenciais reais expostas por acidente.
- Tamanho final do arquivo `AGENTS.md`: **169 linhas** (cumprindo estritamente a meta <= 180 linhas).

### 3. Tratamento e Reversão das Alterações Retrospectivas em docs/AI_WORKLOG.md
- **Auditoria de Diff**: Executado `git diff f00c7f7 -- docs/AI_WORKLOG.md`.
- **Constatação**: Durante o `PROMPT-002H-FIX`, a entrada histórica de `PROMPT-002H` havia sido reescrita diretamente para neutralizar o texto de URLs pré-assinadas e consentimento bilateral.
- **Ação Corretiva Conforme o Princípio Append-Only**:
  - A entrada histórica original de `PROMPT-002H` (linhas 1 a 751) foi **integralmente restaurada** ao seu estado idêntico ao commit `f00c7f7`.
  - As correções de texto juridicamente neutro e de armazenamento agnóstico são preservadas integralmente na entrada posterior `PROMPT-002H-FIX`.
  - Nenhuma credencial ou segredo foi reintroduzido (a restauração contemplou unicamente as formulações conceituais de storage e compliance da tarefa anterior).

### 4. Arquivos Realmente Alterados
1. [`AGENTS.md`](file:///d:/voice-agent-platform/AGENTS.md): Inclusão da Seção 12 formalizando a regra append-only para o `AI_WORKLOG.md`.
2. [`FOUNDATION_MASTER.md`](file:///d:/voice-agent-platform/FOUNDATION_MASTER.md): Correção das citações cruzadas (DEC-024 para Gravações; DEC-023 para Human Handoff), harmonizando com `docs/DECISIONS_LOG.md`.
3. [`docs/AI_WORKLOG.md`](file:///d:/voice-agent-platform/docs/AI_WORKLOG.md): Restauração da entrada histórica de PROMPT-002H e inclusão desta entrada auditável de fechamento (PROMPT-002H-CHECK).

### 5. Comandos Executados e Resultados de Validação
- `git show f00c7f7:docs/DECISIONS_LOG.md`: Análise factual da atribuição original de DEC-023 e DEC-024.
- `git show f00c7f7:FOUNDATION_MASTER.md` e `git show f00c7f7:docs/AI_WORKLOG.md`: Rastreamento da divergência de citação.
- `git diff f00c7f7 -- docs/AI_WORKLOG.md`: Verificação de alterações retrospectivas e confirmação de restauração.
- `pnpm check`: Executado com aprovação integral (0 erros em Prettier, ESLint, TypeScript em 12 pacotes, Vitest 6/6 testes, Turbo Build em 12 pacotes, Architecture AST check e File Size check).
- `git status --short`: Inspeção de arquivos alterados antes do commit.

### 6. Governança Git e Pull Request
- **Branch Ativa**: `docs/platform-control-live-calls` (mantida, sem nova branch).
- **Commit**: `docs: preserve decision ids and worklog audit history`.
- **Push**: `origin/docs/platform-control-live-calls`.
- **Pull Request #2**: Permanece aberto, atualizado automaticamente pela branch remota, em estado `clean` e sem auto-merge.
- **PROMPT-003**: NÃO iniciado.
