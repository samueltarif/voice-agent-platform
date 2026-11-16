# Base de Conhecimento → Agentes: recuperação offline, versões e futura entrega à Millis

> DEC-055. Base: PR #156 (`53e8dbbbd9d310efdec47e486b82d24a602ad441`, sem merge). Nada aqui ativa
> chamadas, webhooks públicos, fornecedores ou tráfego. Classificação: `IMPLEMENTADO` (nesta PR),
> `EXISTENTE` (já na base), `PROPOSTO` (depende de decisão humana), `DOCUMENTADO` (fornecedor, consultado em 2026-11-12).

## 1. Arquitetura existente (mapeada)

| Etapa | Onde | Estado |
| :--- | :--- | :--- |
| Armazenamento | `knowledge_documents` (organização, status, `agent_id`, `agent_version_id`, coleção, identidade de conteúdo) e `knowledge_chunks` (texto, ordinal, identidade) | `EXISTENTE` |
| Segmentação | `chunkKnowledgeText` (padrão 2.000 caracteres, sobreposição 200; política gravada no documento) | `EXISTENTE` |
| Associação | `agent_id` nulo = todos os agentes da organização; `agent_id` = só aquele agente; `agent_version_id` = fixado a uma versão (só arquiva, DEC-054) | `EXISTENTE` |
| Recuperação | `DrizzleKnowledgeRetrievalService.retrieve(scope, query)`: organização obrigatória, só `READY`, filtro de agente/versão/coleção | `EXISTENTE`; **busca pt-BR melhorada nesta PR** |
| Envelope de voz | `apps/voice`: escopo resolvido no servidor (agente + versão publicada), trechos marcados `UNTRUSTED_DATA`, limites 500/4.000 caracteres | `EXISTENTE`, **não ligado a nenhuma composição** |
| Ferramentas do agente | `CANONICAL_TOOL_NAMES = agent.operating_hours, catalog.search, catalog.item_detail` (snapshot v1 rejeita campos de conhecimento) | `EXISTENTE` |
| Catálogo | `catalog.search`/`catalog.item_detail` leem `catalog_items` (dados estruturados) | `EXISTENTE`, fonte separada |
| Publicação | `AgentPublicationService` congela a configuração em `agent_versions.configuration`; não registra documentos | `EXISTENTE` |
| Millis | Mapeamento da #153 envia prompt/voz/idioma; **ferramentas e conhecimento não são enviados** | `EXISTENTE` (PR aberta) |

## 2. O que esta PR implementa (offline)

1. **Busca em português sem IA** (`knowledge-query-terms.ts`, `knowledge-retrieval-scoring.ts`):
   - minúsculas, sem acentos (no texto e no banco, via `translate`);
   - sem palavras vazias ("quais", "de", "a"…);
   - plural reduzido ("transmissores" → "transmissor", "pressões" → "pressao");
   - no máximo 16 termos;
   - termos frequentes em todos os trechos (ex.: o nome da empresa) pesam menos (peso tipo IDF);
   - teto de 2.000 trechos candidatos por consulta (`truncated` quando atingido).
2. **Título do documento** em cada resultado, além da citação existente (documento, trecho, tipo e localizador da fonte).
3. **Recorte do trecho** (`buildKnowledgeExcerpt`, em `contracts`): até 500 caracteres em volta do termo mais raro, com "…" nas pontas. Isso evita que o produto certo fique fora do recorte num trecho de 2.000 caracteres.
4. **Pré-visualização** `POST /v1/knowledge/retrieval-preview` (OWNER/ADMIN/MANAGER):
   - aplica o mesmo escopo de uma chamada: agente **ativo** da organização + versão **publicada**;
   - ou a visão administrativa de todos os documentos prontos;
   - responde com `trust: UNTRUSTED_DATA`, termos usados, trechos e indicação de truncamento.

   Na tela, o painel "Testar recuperação (sem IA)" deixa explícito que não há conversa, IA nem chamada.

Limitações conhecidas:
- É busca lexical, não semântica: sinônimos não ligados por grafia não casam ("medidor" ≠ "transmissor").
- Códigos como "TP-100" viram termos "100" (o prefixo de 2 letras é descartado).

## 3. Segurança

- **Organização**: sempre a da asserção do servidor; a consulta filtra trechos **e** documentos pela organização.
- **Agente**: inexistente, de outra organização ou arquivado recebem a mesma resposta (`KNOWLEDGE_AGENT_UNAVAILABLE`); sem versão publicada → `KNOWLEDGE_AGENT_NOT_PUBLISHED`.
- **Conteúdo não confiável**: o texto volta igual ao documento, marcado `UNTRUSTED_DATA`, e é exibido escapado. Na voz, o envelope já separa trechos de instruções. Texto como "ignore as instruções" é dado, nunca instrução.
- **Arquivados**: nunca retornados (`status = READY`).
- **Sem resultado**: lista vazia, nunca texto não relacionado. O agente deve dizer que não tem a informação em vez de inventar.

## 4. Versões publicadas — decisão pendente (D-KB-SNAPSHOT)

Hoje uma versão publicada consulta o **conteúdo atual** dos documentos da organização ou do agente. Só documentos fixados a uma versão ficam congelados (DEC-054). Editar um documento muda o que agentes publicados recebem. Como o fluxo de voz ainda não está ligado, o efeito em chamadas é nulo hoje, mas isso precisa ser decidido antes de ligar.

| Opção | Como funciona | Prós | Contras |
| :--- | :--- | :--- | :--- |
| **V1 — Conteúdo vivo** (atual) | A versão lê o que estiver `READY` no momento | Simples; correções valem na hora | Muda o comportamento de uma versão publicada sem republicar |
| **V2 — Manifesto na publicação** (recomendada) | Ao publicar, gravar `(documentId, contentIdentityValue)` dos documentos no escopo. A busca daquela versão só usa documentos cuja identidade atual for igual à do manifesto; documento editado fica **fora** até republicar, com aviso na edição | Nunca muda silenciosamente; não guarda cópia do conteúdo | Migration (tabela de manifesto) e mudança na publicação; editar exige republicar para valer |
| **V3 — Revisões imutáveis** | Cada edição cria uma revisão com seus trechos; o manifesto aponta a revisão | Reproduz exatamente o que a versão via | Mais armazenamento, migration maior, regras de retenção/exclusão (LGPD) |

**Proposta**: V2. Exige nova DEC e migration local; **não implementado**.

## 5. Base de Conhecimento × `catalog_items` — decisão pendente (D-KB-TOOL)

- São **fontes diferentes, sem duplicação**:
  - `catalog_items` = dados estruturados e autoritativos (item, preço, disponibilidade);
  - Base de Conhecimento = texto livre com citação (catálogos, manuais, FAQ).
- **Proposta**: uma ferramenta própria `knowledge.search` (consulta + citações), separada de `catalog.search`/`catalog.item_detail`.
  - Preço e disponibilidade só vêm do catálogo estruturado. Se vierem de um documento, a resposta cita o documento e a data.
  - Sem resultado, o agente diz que não tem a informação.
- Incluir `knowledge.search` em `CANONICAL_TOOL_NAMES` muda o schema v1 do snapshot (hoje rejeita campos de conhecimento). Isso exige decisão própria; **não implementado**.

## 6. Futura entrega à Millis (nada implementado)

Campos `DOCUMENTADOS` em `agent_config` (referência da API `start_outbound_call`, 2026-11-12):
- `tools[]` com `name`, `description`, `params`, `webhook`, `method`, `header`, `timeout`, `response_mode`, `messages`, `include_metadata`, `exclude_session_id`;
- `knowledge_base` com `files` e `messages`.

| Opção | Funcionamento | Bloqueios |
| :--- | :--- | :--- |
| **M-A — Ferramenta com webhook** | A Millis chama nosso `knowledge.search` a cada pergunta | Webhook **público** (proibido hoje); autenticação só por cabeçalho estático (`header`), sem assinatura documentada; vínculo seguro sessão→organização/agente a desenhar |
| **M-B — Contexto por chamada** (recomendada como 1º passo) | No `register_sip_call`, a plataforma recupera trechos ligados ao objetivo da campanha e os anexa ao `prompt` num bloco delimitado de dados não confiáveis, com teto (4.000 caracteres) | Sem endpoint público; não responde perguntas fora do contexto escolhido; aumenta o tamanho do prompt; requer D-KB-SNAPSHOT para a versão da chamada |
| **M-C — Base nativa da Millis** (`knowledge_base.files`) | Enviar os documentos à Millis | Duplica a fonte de verdade, envia dados a terceiro (DPA/LGPD pendentes), sem citação nem isolamento controlado por nós — **não recomendado** |

Perguntas à Millis (não enviadas):
- limite de tamanho do `prompt`;
- se as respostas de `tools` são tratadas como dados;
- autenticação de webhooks de ferramenta;
- retenção dos arquivos de `knowledge_base`.
