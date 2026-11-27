# Evidências E2-V — 27/11/2026

Cinco relatórios originais recuperados dos arquivos enviados nesta conversa (cópias byte a byte, sem reescrita). Os nomes foram atribuídos conforme a autoria indicada no contexto da pesquisa. As alegações dos relatórios não foram verificadas independentemente aqui.

## Inventário
- `GROK_MILLIS_NATIVE_RESEARCH.md` — arquivo original `Texto colado(20261126-200328).txt`; SHA-256 `8d94ba9a0ced0bb0e988779197ef7e73793eb9a3887c01fdd1207b4a63f96292`.
- `GROK_MILLIS_PRACTICAL_RESEARCH.md` — arquivo original `Texto colado(20261127-104901).txt`; SHA-256 `c0520673db25171f9431025b8528837174c0ba8e25999a39f1bd2ed980440ccd`.
- `CHATGPT_MILLIS_NATIVE_RESEARCH.md` — arquivo original `Texto colado (2)(5).txt`; SHA-256 `dae02840806330759f935e348da54d6b796a21cb8f166677f5490f3086008189`.
- `CHATGPT_MILLIS_PRACTICAL_RESEARCH.md` — arquivo original `Texto colado(20261127-113413).txt`; SHA-256 `33a38514d19c924e4bbd2f446839a3a1b3f2e2c919e1fb02c68af6962191fe49`.
- `ANTIGRAVITY_MILLIS_NATIVE_RESEARCH.md` — arquivo original `Texto colado (2)(6).txt`; SHA-256 `8db616aa57669092c7f486603a5b4f9f7ed585158848871545eb06676c0e5dca`.

## Evidência experimental

`E2V_SESSION_REPORT_SAMPLE.anonymized.json` é o objeto `body` do registro `kind: session_report` apresentado pelo operador no PowerShell após o experimento 5, transcrito do texto da conversa e anonimizado. Não é uma exportação direta do arquivo JSONL local. Conserva o formato observado, inclusive campos nulos, strings JSON dentro de `chat` e `function_calls`, status `timeout`, e valores de créditos; IDs da sessão e das tools substituídos, URL temporária substituída. Campos `prompt_tokens` e `completion_tokens` já estavam redigidos no registro. Não presumir autenticação por assinatura ou por cabeçalho do relatório: configuração experimental usou token na query da URL; o corpo não prova o mecanismo recebido.

`E2V_TIMELINES/` contém exportações do navegador (não são timelines combinadas com logs do servidor). IDs de sessão substituídos de forma consistente, URLs temporárias e credenciais redigidas. EXP02 tem apenas 32 eventos locais/derivados, conforme falha de captura conhecida. EXP04 tem três sessões A/B/C. EXP01 tem duas cópias equivalentes de origem; apenas uma incluída.

Ainda faltam os JSONL originais do webhook no computador do operador e timelines/correlações combinadas, caso necessárias. Não confundir essa ausência com ausência de evidência: o log do experimento 5 foi apresentado na conversa, e o corpo do relatório está neste pacote.

## Correções a considerar no documento central
- A ordenação observada em `execute_after_message` não prova quando o provedor iniciou a execução nem entrega integral do áudio.
- Media Bridge / mark não provam compreensão humana, nem todo mark é confirmação de reprodução (clear pode devolver marks pendentes).
- A amostra de relatório é de sessão WebSocket no navegador; falta validar via telefonia direta, entrega, retry e autenticação de produção.
- O relatório não traz timestamps por mensagem nem indicador de reprodução; `call_id` e `agent_id` nulos. Não inferir vínculo de tentativa a partir de metadata isoladamente. `chat` contém mensagens parciais/interrompidas e tool results; preservar distinção.
- O default do método sem `method` foi GET observado no exp. 2, não POST. O erro 404 ocorreu no exp. 2, e não deve ser atribuído ao exp. 3 sem evidência.
- Duração e créditos não demonstram conversão monetária. Confirmar pelo painel.
