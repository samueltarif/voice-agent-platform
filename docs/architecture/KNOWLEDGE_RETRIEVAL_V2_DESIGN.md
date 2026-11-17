# Busca de conhecimento v2 por passagens (DEC-067)

**Status:** PR B1 implementada como busca **opt-in** usada só pela comparação administrativa. Todos os agentes continuam na v1 (DEC-055/058/059). B2 e B3 não estão autorizadas.

## 1. Objetivo e limites da B1

- Medir, com um corpus fixo, se a busca por passagens melhora precisão e recall sem mudar o que os agentes usam.
- A v1 não muda: 79 testes de caracterização fixam as respostas exatas (busca, pré-visualização e conversa simulada) e foram escritos antes de qualquer mudança no fluxo compartilhado.
- Fora da B1: respostas de voz, publicação de versões, chunking de gravação, documentos existentes, migrations.

## 2. Como ativar

`KnowledgeRetrievalQuery.retrievalProfile?: 'v1' | 'v2'`. Ausente ou `'v1'` executa exatamente a v1. Só `DrizzleKnowledgeRetrievalComparisonService` envia `'v2'`. O campo não existe nos corpos HTTP (`.strict()` recusa) e nenhum agente, ferramenta ou envelope de voz o repassa.

## 3. Fluxo da v2 (sem gravação)

1. **Análise da pergunta** (`knowledge-query-analysis-v2.ts`): extrai códigos (`QT-310`, `QT 310`, `qt310` viram `qt310`; prefixo de até 4 letras seguido de número, exceto artigos e preposições), palavras como a v1 (com radical de infinitivos longos: `calibrar` vira `calibr`), aspectos comerciais pedidos. Com código na pergunta, palavras vazias nunca viram termos.
2. **Pré-filtro SQL** (`knowledge-retrieval-v2-queries.ts`): SUPERCONJUNTO do casamento em memória. Palavras por `ILIKE` sem acento; códigos comparados com o texto reduzido a letras e números, de modo que nenhuma grafia é descartada no SQL. `QT-3100` também passa aqui e é recusado depois. Mesmo escopo da v1 (organização, documentos prontos, agente, versão, coleção, filtros). Limite de 2.000 candidatos; acima dele, trechos com o código pedido vêm primeiro.
3. **Vizinhos e costura** (`knowledge-chunk-stitcher.ts`): carrega os trechos ordinal ±1 no mesmo escopo e reconstrói o texto contínuo detectando a sobreposição entre trechos. Uma seção cortada entre dois trechos v1 vira uma passagem inteira.
4. **Passagens** (`knowledge-passage-segmenter.ts`): títulos (`#`, caixa alta, numeração curta, linha terminada em `:`) e legendas viram contexto; FAQ junta pergunta e resposta; cada linha de tabela é uma passagem com legenda e cabeçalho como contexto; parágrafo longo é cortado em frases até 700 caracteres.
5. **Casamento** (`knowledge-term-matcher-v2.ts`): início de palavra (`transmissor` casa `transmissores`, não `retransmissor`), número inteiro (`310` não casa `3100`), código com separador opcional.
6. **Classificação** (`knowledge-evidence-classifier-v2.ts`), hipóteses iniciais da D-RB4:
   - CENTRAL: código ou palavra não genérica, não ubíqua e fora do nome da empresa;
   - ÂNCORAS: todos os códigos encontrados; sem código, a central de maior IDF;
   - DIRECT: todas as âncoras na passagem (texto ou título da seção), cobertura ≥ 0,5 do peso das centrais encontradas e algum termo da pergunta no próprio texto;
   - CONTEXT: sem central, mas com o aspecto comercial pedido; no máximo 1 e só se houver DIRECT.
7. **Ranking** (`knowledge-passage-ranking.ts`): estilo BM25 com IDF do escopo, termos genéricos com meio peso, reforço de título (só reforço: o título nunca torna DIRECT), bônus de proximidade. Corte de ruído em 0,35 da melhor passagem.
8. **Aspectos comerciais** (`knowledge-commercial-evidence.ts`): preço, prazo, estoque, pagamento e garantia só contam como informados com o termo do aspecto e um valor explícito numa evidência DIRECT; senão vão em `aspectsNotFound`.

## 4. Comparação administrativa

- API: `POST /v1/knowledge/retrieval-comparison`, permissão `knowledge.compare` (OWNER/ADMIN). A organização vem sempre da asserção. O agente é resolvido como na pré-visualização (ativo + versão publicada), com os mesmos erros estáveis.
- BFF: `/api/knowledge/retrieval-comparison`, papéis OWNER/ADMIN.
- Tela: painel "Comparar busca atual × nova busca", só para OWNER/ADMIN, com as duas colunas lado a lado, a seção da passagem e os aspectos não informados. Todo texto é dado não confiável, exibido escapado.

## 5. Corpus de avaliação

- `packages/database/src/test-support/fixtures/knowledge-evaluation-*.ts`: 7 documentos (catálogo, FAQ, tabela de preços, calibração, instalação com seção cruzando o limite do trecho, memorando hostil, outra organização com código parecido) e 39 perguntas: positivas, códigos parecidos, comerciais ausentes, negativas, isolamento e instruções hostis, divididas em dev e holdout.
- Métricas sobre o que a pré-visualização mostra: precisão, recall@3, acerto em negativas, acerto de aspectos, violações de isolamento (asserção dura = 0).
- Ajustes feitos só com perguntas dev; o holdout não foi usado para ajuste.

## 6. Desenho da B2 (somente desenho; sem implementação na B1)

### D-RB6 — resposta de voz com passagens
- O envelope de voz passaria a receber passagens DIRECT (até 500 caracteres cada) e, no máximo, 1 CONTEXT rotulado como "informação geral".
- `aspectsNotFound` viraria uma frase fixa ("não tenho essa informação nos documentos"), nunca um valor inventado.
- A troca v1 → v2 por agente exigiria decisão explícita (D-RB2) e testes de caracterização da resposta de voz equivalentes aos da B1.

### D-RB7 — filtros de conteúdo hostil
- Passagens com padrões de instrução ao assistente ("ignore as instruções", "a partir de agora", papel "Assistente:") seriam marcadas e excluídas de DIRECT, com aviso na comparação.
- O filtro seria determinístico, com corpus próprio de falsos positivos (manuais que usam "ignore" em sentido técnico).

## 7. Limitações conhecidas

- Documento hostil ainda aparece como evidência para perguntas sobre o mesmo código (filtro na B2).
- Negativas com casamento parcial de palavra ("vazão", "bomba", "sensor") precisam de semântica.
- Em escopo pequeno, a regra de ubiquidade pode tornar não centrais palavras do assunto (ex.: "transmissor"), o que deixa produtos da mesma família como DIRECT.
- Código pedido inexistente ("VE-2000") ainda mostra produtos da família ("válvula").
- Custo: em escopo de 2.916 trechos, mediana v2 cerca de 4 vezes a da v1 (medição da PR).
