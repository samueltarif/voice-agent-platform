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
