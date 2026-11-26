# Voice Agent Platform — Estado vivo do projeto

> **Última verificação no repositório:** 26/11/2026 (merge da #180, E2 PR 1: `origin/main` `210014539c0f1bb5c2a7535548f6a8852015f35a`, árvore idêntica à do HEAD auditado `5b1c1c3`; gate Linux pós-merge 3.017 / 45 / 0); antes, 26/11/2026 (merge da #179, registro da E0/E1: `origin/main` `05d0252f2c0d56ac45abdc5d80338f4f3b75db18`, só `docs/` em relação a `e0cded7`; início da E2 PR 1); antes, 26/11/2026 (integração da E0/E1; `origin/main` `e0cded7d1279104e07928a896b495e0c2da1ff36`); antes, 26/11/2026 (autorização condicionada de merge; `origin/main` `755aa37` antes da integração); 25/11/2026 (registro da E0/E1, `origin/main` `755aa37`); antes, 23/11/2026, por volta das 11h45 (horário de Brasília), contra a `origin/main` `ccfa46f5d96321f78c5193de9f8acf93f333704f` (merge da #173, B2c) e a API de PRs do GitHub. Verificações anteriores: 18/11/2026 às 12h30 (`4806def`) e 08h05 (`e36e65a`); 17/11/2026 às 14h10, 14h35 e 17h00.
> Este é um documento de acompanhamento e **não prova o estado em tempo real**. Antes de afirmar status atual, confira Git, PRs e decisões. Em caso de divergência, Git, código, testes observados e `docs/DECISIONS_LOG.md` prevalecem.
> **Regra de leitura:** distinga sempre INTEGRADO, TESTADO, AUTORIZADO, PLANEJADO, PENDENTE e NÃO VALIDADO. Um plano não é código entregue, e um gate verde não é produto pronto.

## Legenda de status

| Status | Significado |
| :--- | :--- |
| **INTEGRADO** | Mergeado na `main`, com SHA do merge conferido. |
| **TESTADO** | Gate ou testes automatizados executados e aprovados no SHA indicado. A plataforma (Linux ou Windows) é informada. |
| **EM REVISÃO** | PR aberta, testada, aguardando revisão e merge do operador. |
| **AUTORIZADO** | O operador autorizou a implementação, mas a entrega ainda não foi integrada. |
| **PLANEJADO** | Existe plano ou desenho, sem autorização de implementação. |
| **BACKLOG** | Ideia registrada, sem plano aprovado. |
| **NÃO VALIDADO** | Sem prova no ambiente real exigido (por exemplo, ligação telefônica real). |
| **NÃO VERIFICADO** | Git ou GitHub não puderam ser consultados nesta resposta; o último estado registrado não é apresentado como atual. |

## 1. Objetivo e visão do MVP

SaaS multiempresa de agentes de voz:
- a empresa cria e configura um agente, define ferramentas e fontes de informação, conecta telefonia e atende clientes;
- o agente consulta dados autorizados;
- os atendimentos são registrados, e uso e resultados podem ser acompanhados;
- tudo com segregação entre organizações.

**Escopo aprovado das integrações empresariais (decisão vigente):**
- Inicialmente **somente consultas**: catálogo, preço, estoque, disponibilidade, pedido existente e informação autorizada de CRM.
- **Criar pedidos, agendar serviços, atualizar CRM e abrir chamados só DEPOIS dos testes reais de ligações e mediante nova autorização.**
- A arquitetura pode prever essas ações, mas não deve implementá-las nem ativá-las ainda.

## 2. Entregas integradas (verificadas em 17/11/2026; atualizadas em 23/11/2026 e 26/11/2026)

- **Base existente:** implementação e testes de:
  - multi-tenant, autenticação e permissões;
  - Agent Studio, rascunho e publicação;
  - simulador e ferramentas de conhecimento e catálogo;
  - campanhas, contatos e relatórios;
  - componentes de voz e telefonia.

  **Código e testes não comprovam operação telefônica ponta a ponta em produção.** Ver §6.

- **E1 — leads, agendas e reserva de reuniões, OFFLINE (26/11/2026):** PR #177, head `7f18423db6e84c2921bc12d2284e47be5bd3849c`, merge `1f30bc4d69ffbf900e00ef56fefcd22839c4ebaa` (árvore idêntica à do head aprovado, `b511489`). **E0 — registro e decisões:** PR #178, head `1510b493ac21103c9fa14cca2687765e8536cb82`, merge `e0cded7d1279104e07928a896b495e0c2da1ff36` (só documentação). Sem ferramentas do agente, telas, ligações ou endpoint público. *Registro histórico, no encerramento da E1: E2–E6 não estavam autorizadas. Estado atual: E2 PR 1 integrada (item seguinte); E2 PR 2/PR 3 e E3–E6 ainda não autorizadas.*
- **E2 PR 1 — contexto de sessão de agendamento e protocolo de reserva, OFFLINE (26/11/2026; DEC-075):** PR #180, HEAD `5b1c1c3a3d8c9885dc4a9751924e57f8b9e28950`, merge `210014539c0f1bb5c2a7535548f6a8852015f35a` (pais `05d0252` e `5b1c1c3`; árvore `c518985` idêntica à do HEAD auditado, `git diff` vazio). Entrega: contexto de sessão fixado (migration 0015), política D1 de concorrência, autorização de reserva vinculada à concessão publicada, máquina de estados pura do protocolo e classificador determinístico das respostas do lead (aceite, recusa, escolha, opt-out). **Sem ferramentas operacionais do agente, rotas, telas, ligações ou endpoint público.** Auditorias independentes: Codex (1ª a 4ª) e Antigravity (5ª, bloqueada só por N1; revalidação final: **APROVADA PARA GATE WINDOWS**); todos os achados bloqueantes resolvidos (8 originais, N1, interrogação isolada e o defeito dos ordinais). Gates no HEAD `5b1c1c3`: Linux (Claude) e Windows (operador, `VITEST_MAX_WORKERS=1`, 406 arquivos de teste, typecheck/build 14/14, banco descartável `of2_test_f1eeeb616be8` removido) — **3.017 aprovados / 45 ignorados / 0 falhas**, exit 0. Gate Linux pós-merge na main `2100145`: **3.017 / 45 / 0**, exit 0, banco descartável removido. **E2 PR 2 e PR 3 não iniciadas; E3–E6 não autorizadas.**
  - **Limitações conhecidas (gramática fechada; referência normativa: `docs/architecture/E2_AGENT_SCHEDULING_PROTOCOL.md` §5 e §8):** só formas explícitas do vocabulário (`lead-reply-lexicon.ts`) produzem aceite ou opt-out. No opt-out, a fala inteira é avaliada: além do pedido, só valem cortesias, aceite/recusa/escolha inteiros antes do primeiro pedido e as cláusulas independentes expressamente permitidas — inclusive uma condição com ação própria do falante ("Se eu precisar, ligo para vocês."). Qualquer outra cláusula (condição ou ressalva fora da lista, retratação, citação), aspa sem par, palavra fora do alfabeto do português, acento trocado ou acrescentado, e interrogação isolada ou de abertura (que a segmentação preserva como cláusula própria) levam a esclarecimento (falso negativo seguro). Exemplos que pedem esclarecimento mesmo sendo inofensivos: "Não, não me ligue mais.", "Me descadastre. Ok.", "Me descadastre. Nunca mais.", "¿Me descadastre?". Símbolos sem palavra não bloqueiam o opt-out (viés de cumprir a supressão). Não há cobertura semântica universal do português.
  - **Requisito obrigatório da PR 3 (desenho §7):** um possível pedido de opt-out não reconhecido deve **interromper a abordagem comercial** enquanto o agente esclarece o pedido; validar com eventos reais de voz antes de qualquer prospecção real. Não implementado.

### PRs da Base de Conhecimento (estado conferido na API do GitHub em 17/11/2026 e 23/11/2026)

| PR | Estado | Head | Merge na `main` | Assunto |
| :--- | :--- | :--- | :--- | :--- |
| #156 | INTEGRADA | `53e8dbb` | `191b146` | Gestão completa de documentos (DEC-054) |
| #157 | INTEGRADA | `a410172` | `2017443` | Recuperação offline pt-BR e pré-visualização (DEC-055) |
| #158 | FECHADA sem merge | `c20f85b` | — | Desenho de snapshots; conteúdo recuperado na #164 (DEC-056) |
| #159 | FECHADA sem merge | `d38b2a9` | — | `knowledge.search` offline; trabalho recuperado na #161 |
| #160 | INTEGRADA | `9a286db` | `035bf3d` | Termo genérico não é evidência de produto (DEC-058) |
| #161 | INTEGRADA | `6bd5998` | `72085b8` | `knowledge.search` com DIRECT/CONTEXT e `unmatchedTerms` |
| #162 | INTEGRADA | `804d72d` | `c7c660c` | Turno simulado offline com `knowledge.search` |
| #163 | INTEGRADA | `d1d6c79` | `2015da2` | Conversa simulada no Agent Studio com `knowledge.search` |
| #164 | INTEGRADA | `9615780` | `78b4b3b` | Desenho de snapshots e roadmap da Base de Conhecimento |
| #165 (A1) | INTEGRADA | `4fc76c6` | `7da5758` | Upload TXT, MD e DOCX: extrair → prévia → confirmar → ingestão (DEC-065) |
| #166 (A2) | INTEGRADA | `317a976` | `c31cd4a` | PDF com texto pesquisável, sem OCR; extração em processo filho (DEC-066) |
| #167 (B1) | **INTEGRADA e TESTADA** | `5c8b164` | `e36e65a` | Busca v2 por passagens opt-in + comparação administrativa v1 × v2 (DEC-067, DEC-068). v2 **não ativável em agentes**. Ver §4. |
| #168 (docs) | INTEGRADA | `2239356` | `9870cc8` | Este painel (`docs/PROJECT_STATUS.md`) e `CLAUDE.md` |
| #170 (B2b) | **INTEGRADA e TESTADA** | `62bc924` | `4806def` | Proteção contra documentos hostis e projeção sanitizada de fatos técnicos, **só na busca v2** e na comparação administrativa (DEC-069, DEC-070). v2 **não ativada em agentes**. Ver §4. |
| #172 (B2a) | **INTEGRADA** | `c4534e4` | `8118a91` | Perfil `knowledge.retrievalProfile` na versão, travas da plataforma (lista **vazia** + chave `KNOWLEDGE_V2_AGENT_RUNTIME` desligada) e falha controlada (DEC-071). v2 **bloqueada para todos os agentes**. |
| #174 (teste) | **INTEGRADA e TESTADA** | `2367bfe` | `76dff68` | `auth.integration.test.ts` em banco descartável, na fase serial (antes dependia do banco fixo `voice_agent_dev`) |
| #175 (teste) | **INTEGRADA e TESTADA** | `62a367d` | `32a2ef3` | Teste de fronteira de importação da voz com varredura assíncrona e concorrência limitada (timeout no Windows) |
| #173 (B2c) | **INTEGRADA e TESTADA** | `25b7f01` | `ccfa46f` | Compositor determinístico da fala só no **turno simulado v2** (DEC-072); rótulos M2/M3 congelados em `a95a1e1`. v2 **bloqueada para todos os agentes**. Ver §4. |

**Detalhes conferidos:**
- **#165:** a árvore do merge `7da5758` é igual à do head `4fc76c6` (`68431416b270…`, conferido com `git rev-parse`).
  - Gates Linux e Windows informados pelo operador: **2.210 testes PASS, 0 falhas**.
- **#166:** SHA final `317a9769ba5c9707b30191cbbe96df2e2eac9611`, merge `c31cd4a`. As árvores são iguais: `930ee4b3df9d583f33d41009e3b0d2a728d31703` (conferido com `git rev-parse`).
  - Inclui a correção do caminho dos cMaps do pdf.js no Windows.
  - Gates Linux e Windows informados pelo operador: **2.241 PASS** (1.870 sem integração + 371 de integração), 45 ignorados, 0 falhas, build 14/14, extração compilada DOCX/PDF e 0 tentativas de rede no smoke test.
  - Esses números vêm do operador e não estão no `AI_WORKLOG`. O worklog registra só os testes direcionados.
- **#168:** aberta em 17/11/2026 com head `78c79046418f703ff18252217318b97e061ddb5c`, ajustada na mesma branch até `2239356b9a8fde0d423a8f631507bd8c1dee7480`. Merge na `main`: `9870cc846339315bdf7da74acd536475d370986a`. As árvores do head e do merge são iguais: `1d80923d56023536fbe71514c2c53050048802a7` (conferido com `git rev-parse` em 18/11/2026).
- **#167 (B1):** SHA final da branch `5c8b1644a4ff1e9fd7e013dfef2878d4bced4256`; merge na `main` `e36e65a273bdef2c46eb0b5243bba7c2400cd06b`. As árvores da branch e da `main` são iguais: `bf78de557615e45184d475d689c6af2d20021b14` (conferido com `git rev-parse` em 18/11/2026).
  - O `5c8b164` é o merge da `main` (#168) na branch para resolver um conflito só em `docs/AI_WORKLOG.md`. Seu código funcional é idêntico ao `87331ab`, onde os gates foram executados: zero arquivos fora de `docs/` e `CLAUDE.md` diferem, e as árvores de `apps`, `packages`, `scripts` e dos arquivos do pnpm são as mesmas.
  - Resultados confirmados pelo operador na integração: Linux **2.414 PASS**, Windows **2.414 PASS**, 45 ignorados e 0 falhas em cada; Git limpo após o gate; 0 bancos descartáveis restantes.
- **#170 (B2b):** head aprovado `62bc9240da8e17e8a0e141c0be13de7fcecfd702`; merge na `main` `4806defb33e1736249e6fba8f2ee931c0d961565`. As árvores do head e da `main` são iguais: `d624082138d94271fcc1ac927720a8e9190309d0` (conferido com `git rev-parse` em 18/11/2026).
  - Gates confirmados pelo operador: Linux **2.579 PASS** (2.102 sem integração + 477 de integração) e Windows **2.579 PASS**, 45 de staging ignorados e 0 falhas em cada.
  - Banco descartável do gate Windows removido (nenhum `of2_test_*` restante); Git do worktree de validação limpo.
- **#172 (B2a):** head `c4534e439bd67ac1f46fb8d0e6538fda449c975b`; merge na `main` `8118a91965a0cc9569ab82636184bf907ef5c88a` (18/11/2026, 15h59). As árvores do head e da `main` são iguais: `38a54e27a30b690a90f08dc4cd459ca0655187ee` (conferido com `git rev-parse` em 23/11/2026).
  - Inclui a correção de caminhos portáveis nos dois testes de guarda (gate Windows).
  - **Não registrado aqui:** os números dos gates Linux e Windows da #172 não constam da PR nem do `AI_WORKLOG`; o merge foi feito pelo operador.
- **#174, #175 e #173 (23/11/2026):** integradas pelo agente, com autorização formal do operador (11h13), nesta ordem e com **merge commit** (sem squash nem rebase). A árvore da `main` foi conferida depois de cada merge:

  | Passo | PR | Head | Merge | Árvore da `main` (esperada = obtida) |
  | :--- | :--- | :--- | :--- | :--- |
  | 1 | #174 | `2367bfe9a35638f899e5e39019a0137da9e2a289` | `76dff68b8445472121195ed6a7c194cf15a9b391` | `c4a96bf3bc79707379af3d09bf39fbb0596c0be7` |
  | 2 | #175 | `62a367d7a67cf62141e56fe3d997f4c66c77f4a8` | `32a2ef3a49dfb2433eeeedefa8abfe61f059f67f` | `100dccac51c0c19febf7566c7ee1ece5fc4f57dc` |
  | 3 | #173 | `25b7f0127267f983c5ff0cac539360eb700ec830` | `ccfa46f5d96321f78c5193de9f8acf93f333704f` | `9efc53b45b4c1eb830a82b5fd664f2b6f4d2302b` |

  - Commit congelado dos rótulos `a95a1e1` preservado e ancestral da `main`; é o único commit do arquivo de rótulos.
  - **Gates antes do merge:**
    - #174 sozinha: Linux exit 0 e Windows exit 0 (operador), 2.671 PASS e 0 falhas em cada.
    - #173 + #174 + #175 (árvore `9efc53b4…`): Linux exit 0 (2.307 + 505 PASS, 45 ignorados, 0 falhas) e Windows `GATE_EXIT=0` (operador; 311 + 62 arquivos de teste).
  - **Gate Linux pós-merge na `main` `ccfa46f`** (mesma árvore): `pnpm check:disposable` exit 0.
    - Fase 1: 2.307 PASS, 45 ignorados. Fase 2: 505 PASS. 0 falhas.
    - Build 14/14, `api-dist` (0 tentativas de rede), arquitetura e tamanho de arquivo OK.
    - Banco descartável removido; Git limpo.
  - Gate Windows pós-merge: **não executado** (mesma árvore do gate Windows da combinação).
  - Bancos descartáveis antigos remanescentes, mantidos por instrução do operador: `of2_test_868defd0d04e` (ambiente Linux do agente) e `of2_test_c80c316bc08a` (Docker do operador).
- **`origin/main` na verificação:** `ccfa46f` (23/11/2026, por volta das 11h45; em 18/11/2026 às 12h30 era `4806def`, e às 08h05, `e36e65a`). **Não presumir que continue sendo a mais recente.**
- **Fase B2b da Base de Conhecimento:** INTEGRADA e TESTADA (#170). A proteção contra documentos hostis e a projeção sanitizada de fatos técnicos existem **só na busca `v2`**, que continua disponível apenas na comparação administrativa (OWNER/ADMIN). Nenhum agente publicado usa a `v2`.
- **Fase B1 da Base de Conhecimento:** INTEGRADA e TESTADA (#167). A busca `v2` existe só na comparação administrativa e **não pode ser ativada em agentes** antes das proteções da B2 e de nova autorização (ver §4).
- **Fase A da Base de Conhecimento:** INTEGRADA e TESTADA. O upload de arquivos **não está autorizado para exposição pública** (ver §7 e `docs/SECURITY.md` §11).

## 3. Ambientes críticos protegidos (não alterar sem aprovação expressa)

- **Banco original da Qualitec:** `voice_agent_ui_0561f39`. Preservar.
- **Banco de homologação:** `voice_agent_pr157_test`. Preservar.
- **Agente Qualitec v4 publicado:** não modificar nem republicar.
- **Referências locais do operador (Windows):**
  - `D:\vap-main-ui-0561f39`: original;
  - `D:\vap-pr163`: homologação;
  - `D:\voice-agent-platform-git`: repositório principal de operações Git.
- **Gates de integração exclusivamente com `pnpm check:disposable`:**
  - `TEST_DATABASE_URL` aponta para o `postgres` administrativo no container Docker local (`127.0.0.1`);
  - `DATABASE_URL` e `PGDATABASE` ausentes;
  - sem `.env` de aplicação no worktree do gate;
  - os bancos efêmeros `of2_test_*` são removidos ao final.
- **Proibido sem aprovação expressa:**
  - migration em banco existente;
  - alteração de dados da Qualitec;
  - chamadas pagas de IA ou telefonia;
  - merge.
- **Outras regras:**
  - Não registrar segredos.
  - Após merge, conferir Git limpo, SHA exato e árvore.
  - Usar *Create a merge commit* enquanto essa política vigorar.

## 4. Base de Conhecimento — desenvolvimento restante

### B1 — INTEGRADA e TESTADA (PR #167, merge `e36e65a` em 18/11/2026; DEC-067 e DEC-068)

**Resumo da integração (verificado em 18/11/2026):**
- Branch `5c8b1644a4ff1e9fd7e013dfef2878d4bced4256` → merge `e36e65a273bdef2c46eb0b5243bba7c2400cd06b`; árvores iguais (`bf78de55…`).
- Gates: Linux 2.414 PASS e Windows 2.414 PASS, 45 ignorados e 0 falhas em cada; build Windows 14/14; Git limpo; 0 bancos descartáveis.
- **Métricas finais da `v2`:** precisão DIRECT 94,4%, recall@3 96,6%, negativas 100%, aspectos comerciais 71,4%; desempenho de 0,92× a 1,17× da `v1`.
- **Bloqueio vigente:** a `v2` continua **exclusiva da comparação administrativa** (OWNER/ADMIN). **Não pode ser ativada em agentes** antes das proteções da B2 (instruções hostis, D-RB7; resposta de voz, D-RB6) e de **nova autorização**. Todos os agentes, inclusive o Qualitec v4, seguem na `v1`.

O histórico abaixo é preservado como registrado em 17/11/2026.

**Objetivo:** busca `v2` por passagens, com comparação administrativa `v1` × `v2`, **sem mudar o algoritmo dos agentes publicados**.

**Diagnóstico que motivou a B1:**
- o chunk padrão de 2.000 caracteres pode tratar um catálogo inteiro como DIRECT;
- `QT-310` pode perder o prefixo e coincidir com `QT-3100`;
- uma FAQ genérica pode parecer preço específico.

**Condições aprovadas pelo operador (17/11/2026, 13:24):**
- Testes de caracterização das respostas da `v1` **antes** de qualquer mudança. A `v1` fica intacta.
- `v2` opt-in **somente na comparação administrativa** (OWNER/ADMIN) durante a B1. Não ativar em agentes nem em versões publicadas.
- **Agentes novos continuam na `v1`** até aprovação posterior na B2. Isso inverte a proposta inicial de D-RB2.
- Passagens montadas na hora da consulta.
- Códigos de produto como tokens inteiros, com pré-filtro SQL compatível com `QT-310`, `QT 310` e `qt310`, sem aceitar `QT-3100`.
- Ranking, âncoras DIRECT, CONTEXT limitado e aspectos comerciais não comprovados.
- Corpus offline (~40 perguntas) e medição de desempenho.
- Nenhuma migration, reindexação automática, alteração de documentos ou de resposta de voz.

**Decisões do operador (17/11/2026):**
- **Às 14h10:** não fazer merge da #167 nem rodar de novo o gate Windows antes da conclusão da revisão de qualidade e da definição do SHA final. Essas duas condições foram cumpridas: a revisão foi concluída no SHA `87331ab`, e o operador rodou o gate Windows nele (ver abaixo).
- **Situação às 17h00:** a #167 continua **aberta e sem merge**. O merge depende de decisão expressa do operador.
- **18/11/2026:** o operador integrou a #167 (merge `e36e65a`) e confirmou os gates. Ver o resumo no início desta seção.
- **Vigente:** a busca `v2` continua **exclusiva da comparação administrativa** (OWNER/ADMIN), **sem ativação em agentes**, até a B2 e nova autorização.

**Metas de aceitação definidas pelo operador:**
- precisão DIRECT 1,00;
- recall@3 ≥ 0,95;
- perguntas negativas 1,00;
- aspectos comerciais corretos;
- latência da `v2` ≤ 2× a da `v1`.

**Primeira entrega — head `c29ee6a` (avaliação do operador em 17/11/2026: metas NÃO atingidas):**
- 79 testes de caracterização da `v1` (commit `79c9d15`, anterior às mudanças) e corpus de 39 perguntas (dev/holdout).
- Gate Linux passou (`check:disposable`, `GATE_EXIT=0`): fase 1 com 1.933 PASS e 45 skips de staging já existentes; fase 2 com 469 PASS.
- **Gate Linux aprovado não significou qualidade aprovada:**

  | Métrica `v2` | Resultado | Meta |
  | :--- | :--- | :--- |
  | Precisão DIRECT | 0,73 | 1,00 |
  | Recall@3 | 0,966 | ≥ 0,95 (atingida) |
  | Perguntas negativas | 0,60 | 1,00 |
  | Aspectos comerciais | 0,714 | — |
  | Latência | ~385 ms × ~105 ms da `v1` (~3,7×) | ≤ 2× |

  Restavam falsos positivos em consultas negativas e evidências com instruções hostis.

**Revisão de qualidade — head `87331ab` (DEC-068), CONCLUÍDA em 17/11/2026. SHA final da B1: `87331abf26d6f8bf5cd407afa1babfca61de9300`.**

| Métrica `v2` | Resultado | Meta |
| :--- | :--- | :--- |
| Precisão DIRECT | 0,944 (dev 0,923; holdout 0,964) | 1,00 — **ainda não atingida** |
| Recall@3 | 0,966 | ≥ 0,95 |
| Perguntas negativas | 1,00 | 1,00 |
| Aspectos comerciais | 0,714 | — **ainda com 2 erros** |
| Latência | 0,92× a 1,17× da `v1` (2.916 trechos; mediana de 7 execuções) | ≤ 2× |

- Os 16 casos novos de desenvolvimento (organização C) ficaram em 1,00 em todas as métricas. Isolamento 0.
- **Falhas residuais:** todas (M01, H01 e H02, inclusive os 2 erros de aspecto) vêm de um **documento com instruções hostis**. O filtro é da B2 (D-RB7), não autorizada.
  - Por isso a precisão DIRECT (94,4%) e os aspectos (71,4%) ficam abaixo das metas.
  - Isso **impede a ativação da `v2` em agentes**: ela continua exclusiva da comparação administrativa até a B2 e nova autorização.

**Gates no SHA final `87331ab`:**

| Gate | Resultado | Quem executou e quando |
| :--- | :--- | :--- |
| Linux (`check:disposable`) | **2.414 PASS** (fase 1: 1.945; fase 2: 469), 45 ignorados (staging já existentes), 0 falhas, `GATE_EXIT=0` | Claude, 17/11/2026 |
| Windows | **2.414 PASS**, 45 ignorados, 0 falhas; build 14/14 | Operador, confirmado em 17/11/2026 (16h58) |
| Pós-gate Windows | Git do worktree `D:\vap-pr167` limpo; 0 bancos `of2_test_*` restantes | Operador, 17/11/2026 |

A DEC-067, a DEC-068 e `docs/architecture/KNOWLEDGE_RETRIEVAL_V2_DESIGN.md` estão na `main` desde o merge `e36e65a` (18/11/2026); até então existiam só na branch da #167.

**Riscos residuais da B1 (vigentes após a integração):**
- **instruções hostis** nos documentos (bloqueio de ativação da `v2`);
- o núcleo da pergunta é a primeira palavra central, então uma pergunta que começa por verbo específico usa o verbo;
- acima de 2.000 candidatos, a frequência dos termos é estimada só sobre os candidatos;
- desempenho e corpus medidos só com dados sintéticos;
- a precisão DIRECT (94,4%) e os aspectos (71,4%) não atingiram as metas; todas as falhas residuais vêm do documento com instruções hostis.

### B2 — plano aprovado como diretriz (18/11/2026); **B2b, B2a e B2c INTEGRADAS**; B2d, B2e e B3 NÃO autorizadas

**Atualização de 18/11/2026 (~12h30):** a B2b foi integrada pela PR #170 (head `62bc924`, merge `4806def`, árvores iguais `d6240821…`), com gates Linux e Windows de 2.579 PASS cada, 45 ignorados e 0 falhas. As duas linhas abaixo, de quando a PR estava em revisão, ficam como histórico.

- **B2b** (DEC-069): proteção contra documentos hostis e autoridade comercial, **só** na busca v2 e na comparação administrativa (OWNER/ADMIN). ~~Está em PR aberta da branch `feat/knowledge-b2b-hostile-protection`, sem merge.~~ Integrada (#170).
- **Revisão da B2b** (DEC-070, 18/11/2026): corpus adversarial congelado com holdout, intenção comercial em pt-BR, vocabulário técnico por setor e verificação de todos os campos da projeção. ~~Na mesma PR #170, sem merge; gate Windows pendente (operador).~~ Integrada na mesma PR #170; gate Windows aprovado pelo operador.

**O que a B2b entregou (só na `v2`, só na comparação administrativa):**
- detector auxiliar de conteúdo hostil e exclusão total das passagens marcadas;
- projeção destinada ao agente com fatos técnicos estruturados, cada um com sua fonte, valores remontados por gramática fechada e vocabulário técnico por setor;
- autoridade comercial: preço, estoque, prazo, desconto, pagamento e garantia nunca saem de documentos; quando pedidos, aparecem como aspectos que exigem fonte autorizada;
- API e BFF repassam a projeção só se ela passar pelo contrato estrito.

**Pendências e riscos que continuam valendo:**
- A `v2` **não está ativa em nenhum agente publicado**. O Qualitec v4 e os demais agentes continuam na `v1`, sem republicação.
- `knowledge.search` **não está ligado ao runtime de telefonia real**.
- No corpus adversarial da B2b, o recall@3 foi **0,917 no desenvolvimento e 0,909 no holdout**, abaixo da meta de **0,95** para uma futura ativação.
- Um documento com **fato técnico falso, sem instrução hostil**, ainda pode contaminar a informação. Isso depende de governança documental (etapa E).
- A avaliação adversarial **não foi totalmente independente**: o mesmo autor escreveu o corpus e as regras.
- As medições de desempenho ainda dependem de **corpus sintético**.
- A **`v1` continua sem as proteções da B2b**, para preservar a compatibilidade.
- **Resultado de corpus não é garantia** contra ataques: o detector reconheceu só 1 de 20 ataques desconhecidos, contidos pelas outras camadas.

- **B2a, B2c e B2d:** próximas etapas, **NÃO autorizadas**. **B2e:** opcional, NÃO autorizada. **B3:** NÃO autorizada. A `v2` continua exclusiva da comparação administrativa, e nenhum agente a usa.
- **Atualização de 18/11/2026 (~13h15): B2a AUTORIZADA e EM REVISÃO** (DEC-071). Perfil `knowledge.retrievalProfile` na versão, travas da plataforma (lista versionada **vazia** + chave `KNOWLEDGE_V2_AGENT_RUNTIME` desligada) e falha controlada. Está em PR aberta da branch `feat/knowledge-b2a-retrieval-profile`, sem merge; gate Windows pendente (operador). **Mesmo integrada, a B2a deixa a v2 bloqueada para todos os agentes.** B2c, B2d, B2e e B3 continuam NÃO autorizadas.
- **Atualização de 18/11/2026 (~17h): B2c — ETAPA 1 publicada e conferida; ETAPA 2 AUTORIZADA e EM REVISÃO** (DEC-072). Rótulos M2/M3 congelados no commit `a95a1e1` (SHA-256 `4c65699ee81064bf5db60e2b7513f6a37199c18e74b8fb40948c07dd50775dbe`), conferidos pelo operador antes de qualquer código. Compositor determinístico da fala só para o **turno simulado v2**, em PR aberta da branch `test/knowledge-b2c-truth-labels`, sem merge; gate Windows e auditoria independente pendentes. **A v2 continua bloqueada para todos os agentes** (lista vazia, chave desligada). B2d, B2e, B3, telefonia e ativação continuam NÃO autorizadas.
- **Atualização de 23/11/2026: B2a INTEGRADA** (#172, merge `8118a91`, 18/11/2026) **e B2c INTEGRADA e TESTADA** (#173, merge `ccfa46f`; DEC-072).
  - A resposta falada do turno simulado v2 vem de um compositor determinístico, sem IA. Ela é verificada por remontagem e cai em falha controlada, nunca em v1.
  - **A v2 continua bloqueada para todos os agentes:** a lista `KNOWLEDGE_V2_AGENT_ORGANIZATIONS` está vazia e a chave `KNOWLEDGE_V2_AGENT_RUNTIME` está desligada. Voz e telefonia não usam o compositor.
  - Métricas no corpus congelado (dev/holdout):
    - M0 = 0;
    - M3: 22/22 e 24/25 verdadeiros (o falso é o D24 isolado, risco declarado);
    - atributo perguntado falado: 10/14 e 5/13.
  - **Pendências de ativação acrescentadas pela B2c:** D24 isolado (etapa E), associação dentro da passagem (D-B2c-10), escolha do atributo perguntado, PARTIAL dominante nas perguntas comerciais e avaliação independente dos rótulos.
  - **B2d, B2e e B3 continuam NÃO autorizadas.**
- **Planejamento original (17/11/2026), mantido como histórico:**

- Perfil `knowledge.retrievalProfile` opcional na versão publicada. **Ausente = `v1`**, preservando o Qualitec v4.
- `v2` só após nova publicação, com aprovação.
- Resposta curta e natural para voz: até 2 frases e 300 caracteres, sem citações faladas.
- Tratamento da ausência de preço, prazo e estoque.
- Defesa em camadas contra instruções hostis nos documentos. Uma lista de palavras perigosas não é garantia de segurança.
- A decisão de tornar a `v2` padrão para agentes novos está **adiada**.

### B3 — OPCIONAL, NÃO AUTORIZADA

- Chunker estrutural na ingestão, por produto, seção e FAQ.
- Reprocessamento **explícito** e auditado, documento a documento.
- Sem reprocessamento geral e sem trocar a política padrão `v1`.
- Os parâmetros do plano aguardam decisão (D-RB11 só na B3).

### Outras etapas da Base de Conhecimento — BACKLOG

- **C:** importar CSV, FAQ e catálogo.
- **D:** importar URL, com mitigação de SSRF.
- **E:** governança, versões e validade.
- Snapshots imutáveis da Base de Conhecimento e migration `0014` estão **adiados** (DEC-056).
  - **Risco atual:** editar o conhecimento pode mudar as respostas de uma versão publicada, mesmo com o algoritmo `v1` preservado.
- OCR fica fora do escopo da A2.

**Plano detalhado:** projeto `claude/KNOWLEDGE_PR_B_RETRIEVAL_QUALITY_PLAN.md`. Decisões em `docs/DECISIONS_LOG.md`. Roadmap em `docs/ROADMAP_KNOWLEDGE.md`.

## 5. Integrações empresariais — ROADMAP PROPOSTO, NÃO IMPLEMENTADO

Conectores universais para sistemas heterogêneos:
- REST/OpenAPI, ERP/CRM, sincronização e webhook;
- quando imprescindível, agente local de banco com consultas pré-aprovadas.

O agente pede uma **capacidade padronizada**, e o conector adaptador consulta a fonte autorizada daquela organização. **O modelo nunca gera SQL livre nem recebe credenciais.**

| Etapa | Escopo | Status |
| :--- | :--- | :--- |
| **I1** | Arquitetura universal: contratos, autenticação, escopos por organização, catálogo de capacidades, timeouts, auditoria e erros | PLANEJADO (plano ainda não confirmado) |
| **I2** | Conector REST genérico **somente leitura**, primeiro com API simulada e testes offline | PLANEJADO |
| **I3** | Consultas autorizadas de produto, estoque, preço, disponibilidade e informações de sistemas reais | PLANEJADO |
| **I4/I5** | Sincronização/webhooks, conectores prontos, legado e arquivos | BACKLOG |
| **Ações com escrita** | Criar pedidos, agendar serviços, atualizar CRM, abrir chamados | **BLOQUEADO** até testes reais de ligações e nova autorização. Prever confirmação, permissões, idempotência e trilha de auditoria. |

## 6. Ligações reais — NÃO VALIDADAS DE PONTA A PONTA

Falta comprovar um atendimento real autorizado, cobrindo:
- áudio, entendimento, interrupções e latência;
- consulta a ferramentas e dados, e falhas de API;
- transferência, fechamento e logs;
- custo e consumo;
- isolamento entre empresas;
- comportamento quando não há evidência.

É preciso estabelecer critérios mensuráveis. Não fazer chamadas nem usar provedores pagos sem autorização.

**Atualização de 25/11/2026 — primeira ligação real (DEC-073):**
- Uma ligação supervisionada, feita **fora da plataforma** pelo operador: Twilio (conta paga, número americano) → `<Connect><Stream>` por WSS → Millis, para o celular verificado do operador.
- 64 s, `user-ended` (`OBSERVED`); custo US$ 0,2113 = Millis US$ 0,0699 (exibido pela Millis) + Twilio US$ 0,1414 (**calculado por diferença de saldo**, não é fatura); qualidade aprovada pelo operador, com possíveis erros pontuais de reconhecimento e um silêncio de causa não comprovada.
- **Status: OBSERVED (relato do operador), NÃO VALIDADO de ponta a ponta.** SIP não foi usado nem validado. Nenhuma ferramenta, dado, registro ou cobrança da plataforma participou.
- Próximo marco planejado: ligação comercial simulada iniciada **pela plataforma**, com qualificação e agendamento de reunião (E1–E6). A direção arquitetural das ferramentas foi aprovada, mas, *no registro histórico de 25/11/2026*, **a autorização em vigor cobria só a E0 e a E1 (com as correções da auditoria); a E2 não estava autorizada**. *(Atualização de 26/11/2026: a E2 PR 1 foi autorizada e integrada — #180, merge `2100145`, offline; E2 PR 2/PR 3 e E3–E6 seguem não autorizadas.)*

**Verificação em 17/11/2026 (`c31cd4a`), inferência por busca no código:**
- `createKnowledgeSearchToolDefinition` só é instanciada na conversa simulada da API (`apps/api/src/simulation/knowledge-simulated-turn-service.ts`).
- `apps/voice` apenas reexporta a função.
- Ou seja, **`knowledge.search` continua sem ligação no runtime de voz de produção**. Revalidar antes de afirmar o contrário.

## 7. Segurança e produção — BLOQUEADORES

**Upload público** (`docs/SECURITY.md` §11, requisitos D-B9):
- extrator isolado no sistema operacional, com saída de rede negada;
- limites rígidos de CPU, memória e processos;
- limite de concorrência no BFF ou proxy;
- quotas por organização e usuário;
- auditoria só de metadados;
- decisão sobre antivírus;
- monitoramento e possível streaming.

O `--permission` do Node e a guarda de rede **não são sandbox completo**.

**APIs empresariais:**
- credenciais isoladas, cofre e rotação;
- capacidade autorizada;
- TLS, validação e allowlist de destinos, proteção contra SSRF;
- timeouts, rate limit e resiliência;
- acesso limitado a dados pessoais;
- auditoria.

**SaaS:**
- observabilidade, backups e restore, alertas;
- operações, LGPD e plano de incidentes;
- limites e confiabilidade.

**Um gate de testes aprovado não equivale a produção pública liberada.**

## 8. MVP comercial — NÃO CONCLUÍDO

**Critério de conclusão:** uma empresa consegue, sem vazamento entre empresas:
1. criar conta e organização;
2. configurar o agente;
3. conectar uma fonte autorizada;
4. conectar o telefone;
5. receber uma ligação real;
6. obter uma resposta fundamentada;
7. registrar o atendimento;
8. ver resultado e uso;
9. receber cobrança e suporte adequados.

**Pendências:**
- telefonia e atendimentos reais comprovados;
- integrações somente leitura com sistema real;
- hardening de produção;
- onboarding, planos e cobrança, limites;
- observabilidade, backups e suporte;
- piloto controlado.

Componentes de campanha e billing existem no código, mas a operação comercial completa deles **não foi atestada**.

## 9. Prioridades acordadas

1. ~~Integrar a **B1** (#167)~~ — **concluído em 18/11/2026** (merge `e36e65a`). A `v2` segue só na comparação administrativa.
2. ~~Revisar a **B2b** (DEC-069)~~ — **integrada em 18/11/2026** (#170, merge `4806def`; DEC-069 e DEC-070). ~~B2a~~ integrada em 18/11/2026 (#172, `8118a91`; DEC-071) e ~~B2c~~ integrada em 23/11/2026 (#173, `ccfa46f`; DEC-072). **B2d, B2e e B3 não estão autorizadas.** Só depois delas, e das pendências de ativação da §4, se discute ativar a `v2` em agentes, com nova autorização.
3. Planejar a **I1** e fazer I2/I3 **somente leitura**.
4. Executar **testes reais de ligações** em ambiente controlado e autorizado.
5. Concluir segurança, infraestrutura de produção e ciclo comercial, e fazer um piloto.
6. **Só após testes reais e nova aprovação:** ações com escrita em sistemas externos.

### Piloto comercial com agendamento (25/11/2026)

| Etapa | Conteúdo | Status |
| :--- | :--- | :--- |
| **E0** | Registro da ligação WSS, decisões, lacunas da Millis, estratégia de segurança e diagnóstico financeiro (DEC-073) | **INTEGRADA em 26/11/2026** (PR #178, merge `e0cded7`; só documentação) |
| **E1** | Leads, agendas, disponibilidade, ofertas e reserva transacional de reuniões, offline (DEC-074) | **INTEGRADA e TESTADA em 26/11/2026** (PR #177, HEAD `7f18423`, merge `1f30bc4`; gate Linux pós-merge na main `e0cded7`: 2.917 aprovados / 45 ignorados / 0 falhas; 1ª auditoria: BLOQUEADA, 10 achados corrigidos; 2ª: 4 bloqueantes corrigidos; 3ª: aprovada; gates Linux e Windows: 2.917 aprovados / 45 ignorados / 0 falhas no mesmo SHA — Windows com `VITEST_MAX_WORKERS=1` após 1ª execução com 7 timeouts fora da E1) |
| **E2** | Ferramentas do agente (consultar e oferecer horários, marcar com confirmação, resultado do lead, opt-out), em 3 PRs (DEC-075) | **PR 1 INTEGRADA e TESTADA em 26/11/2026** (PR #180, HEAD `5b1c1c3`, merge `2100145`, árvore idêntica; contexto, política D1, autorização, máquina de estados e classificador; sem ferramentas operacionais; auditorias Codex 1ª–4ª e Antigravity 5ª + revalidação final aprovada; gates Linux e Windows 3.017 / 45 / 0; Linux pós-merge 3.017 / 45 / 0); **PR 2 AUTORIZADA e EM REVISÃO** (26/11/2026: `find_slots`/`confirm_offer` offline, estado do protocolo persistido na migration 0016, consumo da autorização e reserva na mesma transação; sem composição de produção); **PR 3 AUTORIZADA e EM REVISÃO** (26/11/2026: PR empilhada sobre a #182 — opt-out gravado pelo servidor, esclarecimento de possível opt-out, `CALL_OUTCOME` (migration 0017), `lead.record_outcome`/`lead.record_opt_out`, simulação comercial offline integrada); #182 e PR 3 sem merge até a auditoria consolidada da E2; **auditoria consolidada Codex (26/11/2026): BLOQUEADA (A1–A7 + integridade da 0017) — correções aplicadas na branch da #183, aguardando revalidação independente consolidada**; validação com voz real obrigatória antes de prospecção |
| E3 | Telas (agenda, reuniões, lead, ligação de teste) | NÃO autorizada |
| E4 | Adaptadores Twilio WSS e Millis (agente temporário, webhooks) | NÃO autorizada |
| E5 | Montagem supervisionada e gateway HTTPS mínimo | NÃO autorizada |
| E6 | Ligação real pela plataforma | NÃO autorizada |

**Financeiro (requisito futuro, não autorizado):** mensalidade + créditos pré-pagos (Pix/cartão). Reserva de custo de fornecedores implementada; obrigatoriedade de reserva válida no disparo real ainda pendente. Hoje existem tetos de gasto de fornecedor por empresa e global, reservas por tentativa e limites de simultaneidade (008-OF3), sem controle financeiro de ponta a ponta; não existem carteira de créditos, pagamentos, tarifas de venda, câmbio, margem nem monitoramento de saldo de fornecedores. Diagnóstico em `docs/research/PHASE_8_FIRST_LIVE_CALL_WSS_AND_SCHEDULING_DECISIONS.md` §5.

### Metodologia de validação proporcional ao risco (26/11/2026)

Acordada pelo operador ao encerrar a E2 PR 1 (atualizada na E2 PR 3: validação agrupada por fase):
- **Claude:** implementação, autorrevisão adversarial do próprio diff e testes (direcionados e gate Linux completo). A autorrevisão **não substitui** a auditoria independente.
- **Antigravity:** auditorias direcionadas a achados específicos e revalidações enxutas do diff corrigido.
- **Codex:** preferencialmente componentes críticos e auditorias consolidadas.
- **Auditoria consolidada da E2** (PR 1 a PR 3) antes de iniciar a E3.
- **Não repetir auditorias** de componentes inalterados sem evidência concreta de regressão.
- ~~Gate Windows executado pelo operador no HEAD aprovado antes de cada merge de código~~ — **substituído em 26/11/2026 (E2 PR 3) pela validação agrupada por fase**, sem enfraquecer controles:
  - cada PR de código entrega gate **Linux completo** (`pnpm check:disposable`) na sua versão final, autorrevisão adversarial e testes direcionados;
  - PRs de uma fase podem ser **empilhadas** e ficam sem merge até a **auditoria independente consolidada** da fase, sobre o diff acumulado desde a main;
  - o **gate Windows** é executado **uma vez**, pelo operador, no HEAD final do conjunto integrado e auditado, antes do merge da fase; achado ou correção depois disso exige novo gate Linux e Windows no novo HEAD;
  - merge só com autorização expressa; mudança só de documentação não repete o gate completo (§10).

## 10. Como consultar e manter este documento

### Ao iniciar uma tarefa

1. Ler `CLAUDE.md`, `AGENTS.md`, `docs/AI_EXECUTION_RULES.md` e **este documento**.
2. Ler, conforme a relevância: `docs/ROADMAP_KNOWLEDGE.md`, `docs/DECISIONS_LOG.md`, `docs/AI_WORKLOG.md`, `docs/SECURITY.md` e `docs/AI_CONTEXT.md`.
   - Na verificação de 17/11/2026, o cabeçalho do `AI_CONTEXT.md` estava **defasado**: `LAST_REFRESHED_AT: 2026-11-11`, base `0561f39`. Para estado atual, este documento e o Git prevalecem.
3. Conferir `git fetch origin`, `git status`, a `origin/main` e as PRs abertas.
4. Não apresentar informação antiga como atual. Se Git ou GitHub não puderem ser consultados, marcar o status como **NÃO VERIFICADO** e indicar a data do último registro.

### Ao responder “o que já fizemos?”, “o que falta para concluir o SaaS?” ou “qual a próxima etapa?”

Consultar este documento e o Git, e responder nesta estrutura, com a data da conferência:
- **Integrado e testado:** PR, merge, SHA e gates;
- **Autorizado ou em andamento / em revisão;**
- **Planejado;**
- **Pendências e bloqueios;**
- **Próximo passo.**

### Após cada PR integrada e verificada

Atualizar este documento, preferencialmente em PR documental separada, registrando:
- data da verificação;
- número da PR, SHA do head, SHA do merge e conferência de árvore;
- resultados dos gates (Linux e Windows, contagens, falhas e skips) e quem executou;
- decisões novas (DEC-xxx) e mudanças de status (por exemplo, AUTORIZADO → INTEGRADO);
- pendências, riscos residuais e próximo passo.

**Regras de edição:**
- Não reescrever silenciosamente decisões ou fatos antigos. Para correções, indicar o que mudou, o motivo e a data.
- O histórico detalhado continua append-only no `AI_WORKLOG.md`.
- Mudança **só de documentação**: rodar `git diff --check` e revisar links e estado. Não repetir o gate completo sem necessidade.

---
*Criado em 17/11/2026 a partir do rascunho do operador (`PROJECT_STATUS_2026-11-17.md`), conferido contra o Git e a API do GitHub nessa data.*
