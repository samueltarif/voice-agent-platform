# Busca de conhecimento v2 por passagens (DEC-067, revisada na DEC-068)

**Status:** PR B1 implementada como busca **opt-in**, usada só pela comparação administrativa. Todos os agentes continuam na v1 (DEC-055/058/059). B2 e B3 não estão autorizadas. A revisão de qualidade da #167 (DEC-068) mudou as regras de âncora, cobertura e desempenho descritas abaixo.

> **Bloqueio de ativação:** a v2 **não pode** ser ativada em nenhum agente enquanto não existir o filtro de instruções hostis (D-RB7, B2). No corpus, todas as falhas restantes vêm de um documento com instruções hostis.

## 1. Objetivo e limites da B1

- Medir, com um corpus fixo, se a busca por passagens melhora precisão e recall sem mudar o que os agentes usam.
- A v1 não muda: 79 testes de caracterização fixam as respostas exatas (busca, pré-visualização e conversa simulada) e foram escritos antes de qualquer mudança no fluxo compartilhado.
- Fora da B1: respostas de voz, publicação de versões, chunking de gravação, documentos existentes, migrations.

## 2. Como ativar

`KnowledgeRetrievalQuery.retrievalProfile?: 'v1' | 'v2'`. Ausente ou `'v1'` executa exatamente a v1. Só `DrizzleKnowledgeRetrievalComparisonService` envia `'v2'`. O campo não existe nos corpos HTTP (`.strict()` recusa) e nenhum agente, ferramenta ou envelope de voz o repassa.

**Atualização da B2a (DEC-071):** além da comparação, `DrizzleKnowledgeAgentProjectionService` também pede `'v2'`, mas devolve **só** a projeção sanitizada da B2b (§8). A ferramenta e a voz continuam sem repassar o campo; um teste de guarda fixa quem chama a v2 detalhada.

## 3. Fluxo da v2 (sem gravação)

1. **Análise da pergunta** (`knowledge-query-analysis-v2.ts`): extrai códigos (`QT-310`, `QT 310`, `qt310` viram `qt310`; prefixo de até 4 letras seguido de número, exceto artigos e preposições), palavras como a v1 (com radical de infinitivos longos: `calibrar` vira `calibr`), aspectos comerciais pedidos. Com código na pergunta, palavras vazias nunca viram termos.
2. **Pré-filtro SQL** (`knowledge-retrieval-v2-queries.ts`): SUPERCONJUNTO do casamento em memória, para que nenhuma grafia seja descartada no SQL.
   - Palavras por `ILIKE` sem acento.
   - Códigos por TODOS os seus grupos de letras e números (`qt` e `310`), sem expressão regular. `QT-3100` também passa aqui e é recusado depois.
   - A consulta traz só id, documento, ordinal e texto.
   - Mesmo escopo da v1: organização, documentos prontos, agente, versão, coleção e filtros.
   - Limite de 2.000 candidatos. Com código, uma consulta paralela só dos trechos com o código vem primeiro.
3. **Casamento exato e pré-seleção** (`knowledge-chunk-preselection-v2.ts`):
   - confere os termos exatamente, em memória;
   - calcula a frequência de cada termo entre os trechos (IDF), sem nova varredura;
   - mantém os 50 melhores trechos.
   Só esses trechos e seus vizinhos (ordinal ±1) são carregados por inteiro, no mesmo escopo. A costura (`knowledge-chunk-stitcher.ts`) reconstrói o texto contínuo, de modo que uma seção cortada entre dois trechos v1 vira uma passagem inteira.
4. **Passagens** (`knowledge-passage-segmenter.ts`): títulos (`#`, caixa alta, numeração curta, linha terminada em `:`) e legendas viram contexto; FAQ junta pergunta e resposta; cada linha de tabela é uma passagem com legenda e cabeçalho como contexto; parágrafo longo é cortado em frases até 700 caracteres.
5. **Casamento** (`knowledge-term-matcher-v2.ts`): início de palavra (`transmissor` casa `transmissores`, não `retransmissor`), número inteiro (`310` não casa `3100`), código com separador opcional.
6. **Classificação** (`knowledge-evidence-classifier-v2.ts`; hipóteses da D-RB4 revistas na DEC-068):
   - CENTRAL: código ou palavra não genérica e fora do nome da empresa. Sem regra de ubiquidade na v2.
   - COM CÓDIGO: só há evidência se algum código pedido existe no escopo. Código inexistente bloqueia e nunca vira produto parecido. Âncoras = códigos encontrados. A cobertura considera só as centrais encontradas.
   - SEM CÓDIGO: âncora = a PRIMEIRA palavra central da pergunta (núcleo do sintagma: "transmissores de pressão", "motor a diesel"). Núcleo ausente de todo o escopo bloqueia. A cobertura inclui no peso as centrais ausentes de todo o escopo.
   - DIRECT: todas as âncoras na passagem (texto ou título da seção), algum termo da pergunta no próprio texto e cobertura **maior que 0,5** do peso (maioria estrita).
   - CONTEXT: sem central, mas com o aspecto comercial pedido; no máximo 1 e só se houver DIRECT.
7. **Ranking** (`knowledge-passage-ranking.ts`): estilo BM25 com IDF do escopo, termos genéricos com meio peso, reforço de título (só reforço: o título nunca torna DIRECT), bônus de proximidade. Corte de ruído em 0,35 da melhor passagem.
8. **Aspectos comerciais** (`knowledge-commercial-evidence.ts`): preço, prazo, estoque, pagamento e garantia só contam como informados com o termo do aspecto e um valor explícito numa evidência DIRECT; senão vão em `aspectsNotFound`.

## 4. Comparação administrativa

- API: `POST /v1/knowledge/retrieval-comparison`, permissão `knowledge.compare` (OWNER/ADMIN). A organização vem sempre da asserção. O agente é resolvido como na pré-visualização (ativo + versão publicada), com os mesmos erros estáveis.
- BFF: `/api/knowledge/retrieval-comparison`, papéis OWNER/ADMIN.
- Tela: painel "Comparar busca atual × nova busca", só para OWNER/ADMIN, com as duas colunas lado a lado, a seção da passagem e os aspectos não informados. Todo texto é dado não confiável, exibido escapado.

## 5. Corpus de avaliação

- Corpus original: `packages/database/src/test-support/fixtures/knowledge-evaluation-{documents,questions}.ts`.
  - 7 documentos: catálogo, FAQ, tabela de preços, calibração, instalação com seção que cruza o limite do trecho, memorando hostil e outra organização com código parecido.
  - 39 perguntas, divididas em dev e holdout.
- Casos novos de desenvolvimento (DEC-068): `knowledge-evaluation-extension.ts`.
  - Organização C, material elétrico, 16 perguntas.
  - Escritos antes das correções da revisão.
  - Reproduziram os mesmos defeitos em outro ramo: família de produto, código inexistente ou parecido, negativa com palavra parcial, duas palavras com uma ausente.
- Métricas sobre o que a pré-visualização mostra: precisão, recall@3, acerto em negativas, acerto de aspectos e violações de isolamento (asserção dura = 0).
- As regras foram ajustadas só com perguntas dev e casos novos. O holdout original foi medido depois.
## 6. B2b — proteção contra documentos hostis e autoridade comercial (DEC-069, só na v2 e na comparação administrativa)

Plano aprovado: `claude/KNOWLEDGE_PR_B2_PLAN.md` (revisão 2; D-B2-1 a D-B2-5, D-B2-7 e D-B2-8). Só a B2b foi implementada. B2a, B2c, B2d, B2e e B3 continuam não autorizadas.

**Premissas.**
- Documentos recuperados são **dados não confiáveis**, nunca instruções.
- Nenhum texto controla ferramentas, perfil, organização, regras ou comportamento.
- O detector **não identifica todos os ataques**, e 100% no corpus **não é garantia** contra *prompt injection*.

**Camadas implementadas:**
1. **Detector auxiliar** (`knowledge-hostile-content-detector.ts`, versão `b2b-1`).
   - Reconhece três tipos de sinal: ordem ao assistente, marcador de papel ou prompt, e alegação de autoridade sobre regras.
   - Antes de comparar, normaliza caracteres invisíveis, acentos, caixa e quebras de linha.
   - Os padrões exigem verbo + alvo, para não marcar texto técnico legítimo.
2. **Exclusão total** (`knowledge-passage-trust-v2.ts`). A passagem marcada sai da estatística, do ranking, da evidência, dos aspectos e da projeção. Só volta em `suspiciousPassages`, que aparece apenas na comparação administrativa (OWNER/ADMIN).
3. **Projeção do agente por fatos** (`knowledge-agent-projection-v2.ts`, contrato `knowledge-agent-projection-contracts.ts`).
   - Contém só fatos técnicos estruturados, cada um com sua fonte (`citationId`, documento, trecho, tipo de fonte, código do item).
   - Os valores são **remontados** a partir de gramáticas fechadas: número + unidade permitida, material de lista, grau IP, rosca.
   - Não leva texto livre nem trecho bruto. O schema é estrito e é validado na saída.
4. **Autoridade comercial.**
   - Frases com contexto comercial (preço, desconto, estoque, prazo, pagamento, garantia) não geram fato nenhum.
   - Aspectos comerciais pedidos vão em `aspectsRequiringAuthorizedSource`.
   - Trechos de evidência com valor comercial são só **contados** (`withheldCommercialValues`).
   - Porcentagem só vira fato com palavra de exatidão ("precisão de 0,5%"); "10% de desconto" nunca vira.
5. **Auditoria.** A rota registra `knowledge.retrieval_comparison` só com metadados e contagens. A pergunta e o texto dos documentos nunca entram no log.

**Ainda não feito (fora da B2b):** perfil no snapshot, travas, falha controlada (B2a); compositor de voz (B2c); seletor e simulação (B2d). Envenenamento técnico (fato falso sem instrução) não é detectável: depende de governança (PR E).

### 6.1 Revisão da B2b (DEC-070)

- **Corpus congelado** (`knowledge-adversarial-corpus.ts`, hash verificado por teste): 20 ataques conhecidos, 20 desconhecidos pelo detector (holdout), 22 perguntas técnicas de vários setores, 10 variações comerciais e 20 parágrafos legítimos com palavras-gatilho. A medição "antes" foi commitada antes de qualquer ajuste.
- **Métricas separadas**: sucesso do ataque, reconhecimento pelo detector, vazamento de texto bruto, vazamento de valor comercial, falsos positivos, perda de fatos técnicos e aspectos comerciais listados, cada uma com dev e holdout.
- **Detector `b2b-2`**: papel atribuído ("você é o diretor…"); marcador de papel só seguido de vocabulário de instrução ("Sistema: hidráulico fechado" é técnico); "prompt" só como alvo de revelação ("Prompt de configuração do inversor" é técnico).
- **Intenção comercial em pt-BR** (`knowledge-commercial-intent.ts`): famílias de formas verbais e coloquiais ("parcelam", "como eu pago", "quanto cobram", "em quantos dias chega", "pronta entrega"). Serve só para `aspectsRequiringAuthorizedSource`; não muda ranking nem evidência. Formas com sentido técnico exigem contexto ("entrega sinal de 4-20 mA" e "chega a 16 bar" não contam).
- **Vocabulário por setor** (`knowledge-technical-vocabulary-contracts.ts`, `b2b-vocab-2`): cada setor declara atributos e unidades; um setor novo exige mudança de código revisada, nunca configuração de cliente ou texto de documento.
- **Defesa em profundidade**: API e BFF repassam a projeção só se ela passar pelo contrato estrito; senão ela é descartada inteira. A ferramenta `knowledge.search` e a simulação (v1) nunca carregam campos da v2.

### Desenho original das D-RB6/D-RB7 (B1; mantido como histórico)

### D-RB6 — resposta de voz com passagens
- O envelope de voz passaria a receber passagens DIRECT (até 500 caracteres cada) e, no máximo, 1 CONTEXT rotulado como "informação geral".
- `aspectsNotFound` viraria uma frase fixa ("não tenho essa informação nos documentos"), nunca um valor inventado.
- A troca v1 → v2 por agente exigiria decisão explícita (D-RB2) e testes de caracterização da resposta de voz equivalentes aos da B1.

### D-RB7 — filtros de conteúdo hostil
- Passagens com padrões de instrução ao assistente ("ignore as instruções", "a partir de agora", papel "Assistente:") seriam marcadas e excluídas de DIRECT, com aviso na comparação.
- O filtro seria determinístico, com corpus próprio de falsos positivos (manuais que usam "ignore" em sentido técnico).

## 7. Limitações conhecidas

- **Bloqueio de ativação (atualizado pela B2b):** os padrões **conhecidos** de instrução hostil agora são excluídos da v2, e nenhuma informação comercial vinda de documento chega à projeção do agente. Ataques **não reconhecidos** pelo detector (paráfrase, outra língua, homóglifo) continuam podendo aparecer como evidência na tela administrativa, mas a projeção do agente só leva fatos técnicos remontados. A ativação da v2 em agentes continua bloqueada até a B2a–B2d e nova autorização.
- **A v1, usada hoje por todos os agentes, não tem as proteções da B2b:** ela ainda devolve trechos com instruções hostis e valores comerciais de documentos (comportamento preservado de propósito).
- O núcleo da pergunta é a primeira palavra central. Perguntas que começam por um verbo não genérico usam o verbo como núcleo.
- Acima de 2.000 candidatos, a frequência dos termos é calculada sobre os candidatos (limite inferior). Os trechos com o código pedido nunca são cortados.
- Só os 50 melhores trechos viram passagens. É bem mais que o topK máximo (10).
- O desempenho foi medido em escopo sintético (2.916 trechos) com 3 perguntas; não há medição com dados reais.

## 8. B2a — perfil de busca na versão publicada (DEC-071; bloqueado por padrão)

**A B2a não ativa a v2 em nenhum agente.** Plano: `claude/KNOWLEDGE_PR_B2A_PLAN.md`.

- **Campo** `knowledge.retrievalProfile: 'v1' | 'v2'` no snapshot (opcional e estrito; ausente = `v1`). Sem migration: chave opcional no JSONB de `agent_versions.configuration`; `configurationSchemaVersion` continua 1. Nenhuma versão publicada é lida para reescrita ou republicada.
- **Regras puras** (`packages/contracts/src/agents/agent-knowledge-profile.ts`):
  - perfil resolvido só pelo snapshot carregado no servidor;
  - rascunho: manter o campo é sempre permitido; mudar exige OWNER/ADMIN, com o papel lido do banco pela rota (nunca do corpo) e comparação com o rascunho **persistido**; gravar exige organização liberada;
  - publicação: campo presente exige organização liberada; `v2` exige também a chave;
  - execução `v2`: as duas travas, sempre.
- **Travas da plataforma** (`apps/api/src/auth/knowledge-v2-agent-policy.ts`):
  - `KNOWLEDGE_V2_AGENT_ORGANIZATIONS`: constante versionada e **vazia**, com teste de guarda. Incluir uma organização exige PR revisada, DEC e autorização do operador;
  - `KNOWLEDGE_V2_AGENT_RUNTIME`: só o valor exato `enabled` liga. É lida **uma vez na inicialização**;
  - o padrão de qualquer composição sem a política real é **fechado** (`CLOSED_KNOWLEDGE_PROFILE_POLICY`).
- **Ramo v2 de `knowledge.search`** (`packages/agent-tools/src/knowledge-search-tool-v2.ts`):
  - consome **só** `KnowledgeAgentProjectionPort` (`DrizzleKnowledgeAgentProjectionService`), que descarta `hits` e `suspicious`;
  - **nunca** chama o `retrieve()` tradicional (trechos brutos);
  - a saída v2 não tem campo de trecho nem de título; a saída v1 não ganhou campos;
  - a identidade (organização, agente, versão) é conferida por **ids** do carregador do servidor, não pela referência do objeto.
- **Falha controlada** (`KNOWLEDGE_PROFILE_UNAVAILABLE`, turno `PROFILE_UNAVAILABLE`) quando:
  - a chave está desligada ou a organização fora da lista;
  - a identidade diverge;
  - há erro ou tempo esgotado (2 s, só no turno simulado v2);
  - a projeção é inválida;
  - as vagas estão ocupadas.

  Nunca há fallback para a v1. A consulta pode continuar depois do tempo limite, por isso a vaga só é liberada quando ela termina, e com as vagas cheias (4 por processo) a nova consulta falha na hora, sem fila.
- **Turno simulado v2:** frases fixas + fatos estruturados; `evidence` sempre vazio. A resposta natural (B2c) e o seletor (B2d) não fazem parte da B2a.
- **Logs sem conteúdo:**
  - `knowledge.v2_agent_runtime`, na partida: estado da chave e tamanho da lista;
  - `knowledge.profile_rejected` e `knowledge.profile_unavailable`: ids, ação e motivo;
  - auditoria `agent.version_published` com `knowledgeRetrievalProfile`.
- **Rollback:**
  1. Desligar a chave: remover `KNOWLEDGE_V2_AGENT_RUNTIME` ou deixá-la diferente de `enabled`.
  2. **Reiniciar ou reimplantar TODAS as instâncias da API.** A chave é lida só na partida, então processos em execução não mudam sozinhos.
  3. Conferir em cada instância o log `knowledge.v2_agent_runtime` com `off`.

  Desligar a chave **corta** a consulta das versões v2, sem levá-las à v1. O retorno à v1 é uma nova publicação sem o campo. Reverter o código da B2a é seguro enquanto a lista estiver vazia, porque nenhum snapshot pode ter o campo.
- **Pré-requisitos ainda abertos para qualquer ativação:**
  - recall@3 adversarial ≥ 0,95 (hoje 0,917 no dev e 0,909 no holdout);
  - avaliação adversarial independente;
  - desempenho em corpus representativo;
  - governança de fatos falsos;
  - B2c e B2d;
  - DEC e autorização.

  O coordenador de voz (`apps/voice/src/voice-knowledge-retrieval-coordinator.ts`, sem chamador) ainda devolve trechos brutos. Antes de qualquer ligação real (B2e/telefonia), ele precisa resolver o perfil pela concessão e usar a mesma projeção.
