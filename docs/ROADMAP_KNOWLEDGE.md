# Roadmap — Base de Conhecimento (próximas PRs)

**Projeto:** Voice Agent Platform — 16/11/2026  
**Status:** plano proposto pelo operador; não implementado. Números de PR serão atribuídos quando abertas.

## Ponto de partida (situação em 16/11/2026)

- PRs #156 a #163 integradas na `main` (`2015da2628af5d6d2ddab8bc62746e26c4bda08e`), com merge commit.
- Gate Windows completo na `main`: 2.159 testes aprovados, zero falhas, Git limpo e nenhum banco `of2_test_*` restante.
- Validação funcional da #163 (SHA `1fe607c`, Windows): simulador do ASSISTENTE DE VENDAS da Qualitec (v4) na cópia de homologação `voice_agent_pr157_test`; consulta ao catálogo, ausência de evidência sobre helicóptero e ausência de invenção de preço validadas.
- Ponto em aberto que motiva a PR B: a FAQ geral de cotação aparece como "Evidência direta" e a resposta traz trechos de válvulas. Diagnóstico registrado no `AI_WORKLOG` (16/11): com a política de chunking padrão, um documento curto vira um único trecho que mistura válvula, transmissor e FAQ; como o trecho menciona "transmissor", ele é DIRECT pela regra da DEC-058. Não viola o contrato da #163; é granularidade do chunking.
- Ainda não implementados: revisões imutáveis, manifesto de publicação, revogação emergencial e a migration 0014 (adiada pelo operador). Ver `docs/architecture/KNOWLEDGE_SNAPSHOTS_AND_SEARCH_TOOL_DESIGN.md` (DEC-056).

## Sequência de entregas propostas

### PR A — Upload seguro e prévia de extração (alta prioridade)
- Upload de PDF com texto, DOCX, TXT e Markdown; limites claros de arquivos/tamanho.
- Extração de texto local/isolada; prévia do que foi extraído, título, tipo de origem, coleção, confirmação explícita antes de indexar.
- Validação de formato real, tamanho/expansão, codificação, conteúdo malformado e arquivos perigosos; nunca executar macros/scripts.
- Usar o pipeline de documentos existente e respeitar tenant/agente, idempotência, erros parciais e limpeza temporária.
- **Fora de escopo:** OCR, mídia e chamadas externas.
- **Aceite:** extração fiel, erro seguro sem cadastro parcial, isolamento e testes offline.

### PR B — Relevância, chunking por assunto e evidências (alta prioridade)
- Fragmentação por títulos, produtos, FAQ pergunta/resposta e tabelas, preservando origem.
- Recuperar apenas trechos relevantes e limitar texto exibido; separar evidência do produto, contexto geral de preço e ausência de evidência.
- Exibir respostas determinísticas curtas e citações rastreáveis, sem inventar dados nem prometer IA generativa.
- **Aceite Qualitec:** transmissores sem válvulas irrelevantes; pergunta de preço com política de cotação marcada como contexto, não preço direto; helicóptero sem evidência; testes de isolamento.

### PR C — Importação estruturada de FAQ/catálogo
- CSV com prévia e mapeamento de colunas; FAQ pergunta/resposta; produto por SKU/código, descrição, atributos.
- Preços somente quando explícitos, com moeda e validade/origem; não afirmar preço, estoque ou prazo ausentes/desatualizados.
- Tratar duplicatas, conflito de identificadores, erros linha a linha e exportação segura.
- XLSX em extensão pequena/separada conforme escopo.
- **Aceite:** cada produto consultável individualmente e nenhuma mistura de valores entre SKUs.

### PR D — Importação de URL pública (uma página)
- URL informada manualmente; extrair conteúdo textual, prévia, revisão e confirmação.
- Segurança SSRF: negar localhost/redes privadas/link-local/cloud metadata; validar DNS e IP após redirects; limites de redirects, portas, tempo, tamanho e tipos; sem cookies/credenciais.
- Testes usando servidor simulado local ou HTTP fake controlado, sem rede externa real.
- **Fora de escopo:** sitemap, crawling amplo e sincronização agendada.

### PR E — Metadados e governança de documentos
- Tags, categorias, revisão, validade, URL/código de origem, versão, substituição e histórico auditável.
- Vínculo a agentes, coleções e permissões; preservar isolamento entre tenants e documentos.
- Interface para testar perguntas e inspecionar os trechos citados.
- Reutilizar recursos existentes; evitar migrations desnecessárias.
- **Aceite:** conteúdo expirado/arquivado não é usado indevidamente; auditoria e autorização testadas.

### Futuro — Conectores e multimodal
- Conectores Google Drive/Docs, Notion, SharePoint etc. com consentimento, escopo mínimo, revogação, sincronização segura e auditoria.
- OCR de documentos escaneados, imagens, áudio/vídeo somente após análise de privacidade e custos.
- Crawling/sitemap e reindexação periódica somente após o importador de URL segura.
- Eventual resposta generativa opcional em PR independente, **desligada por padrão**, com autorização explícita para qualquer custo e guardrails de evidência.

## Evolução sugerida da interface

Botão **Adicionar conhecimento** oferece **Texto / FAQ**, **Enviar arquivo**, **Importar URL**, **Importar planilha**.

**Tipo de origem** separado da forma de importar: Cadastro manual, FAQ, Política, Procedimento, Manual de produto, Catálogo de produtos, Tabela de preços, Roteiro de vendas, Central de ajuda, Outro.

PDF/URL/Excel são formatos ou canais, não tipos semânticos de conteúdo. Documentos internos ou tickets resolvidos requerem controles especiais de acesso e proteção de dados pessoais.

## Regras obrigatórias de execução

1. **Não tocar** no banco original Qualitec `voice_agent_ui_0561f39`.
2. A cópia `voice_agent_pr157_test` só pode receber operações autorizadas da demonstração; nenhuma migration automática.
3. Testes PostgreSQL com DDL/migrations somente em bancos descartáveis `of2_test_*` locais, com proteção contra alvo errado.
4. Sem Twilio, Millis, OpenAI ou outros provedores pagos; nada de workers, telefonia ou redes externas nos testes.
5. Nenhum merge automático; PRs pequenas com evidências de gate, revisão de autorização/isolamento, plano de rollback e árvore Git limpa.
6. Não usar conteúdo recuperado como instruções do agente; sempre preservar evidências e origem das respostas.
7. Não alterar a PR #163 só para registrar este roadmap; inserir como `docs/ROADMAP_KNOWLEDGE.md` na primeira PR futura apropriada ou em PR específica de documentação, após estabilizar a #163.

## Próxima ação

A #163 está estabilizada e integrada. Próxima entrega: PR A (upload seguro e prévia de extração), mantendo as regras acima.

**Atualização em 17/11/2026:** a PR A foi entregue em duas partes.
- **A1** (#165, DEC-065): TXT, Markdown e DOCX; integrada na `main` em `7da5758`.
- **A2** (DEC-066): PDF com texto pesquisável, sem OCR. Todos os formatos passam a ser extraídos em processo filho com `--permission`.

A PR A **não está pronta para exposição pública** enquanto não forem atendidos os requisitos do `docs/SECURITY.md` §11 (isolamento de SO, rede negada, limites rígidos, limites por organização, auditoria). Próxima entrega planejada: PR B.

**Atualização em 17/11/2026 (PR B):** a PR A2 foi integrada (#166). A PR B foi dividida em B1, B2 e B3; só a **B1** está autorizada (DEC-067).
- **B1**: busca v2 por passagens, opt-in, usada apenas na comparação administrativa v1 × v2 (OWNER/ADMIN). Todos os agentes continuam na v1. Inclui o corpus de avaliação e os testes de caracterização da v1. Desenho: `docs/architecture/KNOWLEDGE_RETRIEVAL_V2_DESIGN.md`.
- **B2** (não autorizada): resposta de voz com passagens e filtro de conteúdo hostil (D-RB6, D-RB7) e decisão sobre ativar a v2 por agente (D-RB2).
- **B3** (não autorizada): D-RB11.

**Atualização em 18/11/2026 (B2):** a B1 foi integrada (#167). O plano da B2 (`claude/KNOWLEDGE_PR_B2_PLAN.md`, revisão 2) foi aprovado como diretriz.
- **B2b** (autorizada; DEC-069): proteção contra documentos hostis e autoridade comercial, **só** na busca v2 e na comparação administrativa.
- **B2a, B2c, B2d, B2e e B3:** não autorizadas.

**Atualização em 18/11/2026 (B2b concluída):** a B2b foi integrada pela PR #170 (head `62bc924`, merge `4806def`; DEC-069 e DEC-070), com gates Linux e Windows aprovados (2.579 PASS cada, 45 ignorados, 0 falhas).
- **B2b: CONCLUÍDA.** A proteção contra documentos hostis e a projeção sanitizada de fatos técnicos existem **só na busca v2**, disponível apenas na comparação administrativa (OWNER/ADMIN).
- **Próximas etapas, NÃO autorizadas:** B2a (perfil no snapshot, travas e falha controlada), B2c (compositor de voz) e B2d (seletor e simulação).
- **B2e:** opcional, não autorizada. **B3:** não autorizada.
- A v2 **não está ativa em nenhum agente**; o Qualitec v4 e os demais agentes seguem na v1, e `knowledge.search` não está ligado à telefonia real.
- Antes de qualquer ativação: recall@3 do corpus adversarial (0,917 dev e 0,909 holdout) abaixo da meta de 0,95; fato técnico falso sem instrução hostil depende de governança (etapa E); avaliação adversarial não totalmente independente; desempenho medido só com corpus sintético; v1 sem as proteções da B2b. Resultado de corpus não é garantia contra ataques.
