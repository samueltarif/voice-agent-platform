# E2-V — prova de conceito do WebSocket nativo da Millis (offline até autorização)

Protótipo **isolado** (fora do workspace pnpm, sem dependência da VAP) para observar, com microfone e alto-falante do computador e **sem Twilio**, o que o motor nativo da Millis realmente emite (DEC-076). Raciocínio, STT, TTS, turnos, interrupção e reprodução são **do SDK oficial** `@millisai/web-sdk@1.0.12`; este código só monta a sessão, observa e registra.

> **Não conecte sem autorização expressa do operador.** Conectar consome créditos da Millis. Nesta etapa nada foi conectado.

## O que faz

- Inicializa por `agent_id` **ou** `agent_config` (exatamente um), com metadados **exclusivos por sessão** (`session_id` novo a cada conexão, `commercial_effects: "NONE"`).
- Microfone e reprodução pelo SDK (inclui `clear`, `pause` e `unpause`, tratados pelo próprio SDK).
- Escuta passiva do WebSocket (`src/ws-tap.mjs`): o SDK consome `clear`/`pause`/`unpause`/`start_answering`/`pong` sem emiti-los; a escuta copia cada quadro para o registro sem alterá-lo.
- Registro temporal (`src/event-log.mjs`) com origem: `PROVIDER` (recebido da Millis), `CLIENT` (enviado), `DERIVED` (estado calculado localmente, ex.: `sdk_agent_state`, latência, abertura/fechamento do socket) e `LOCAL` (ações na página). Áudio agregado em rajadas; método desconhecido é mantido e destacado. A chave pública nunca entra no registro nem é salva.
- Ferramenta experimental `e2v_registrar_interesse_teste` (só com `agent_config`): webhook em domínio `.invalid` (nunca resolve) — **sem efeito real**; serve para ver se/quando o motor decide chamá-la.
- `response_mode` e `execute_after_message`: campos opcionais da ferramenta, enviados **só se preenchidos**, para comparar variantes (ex.: `strict`; `true`/`false`). Nomes e efeitos são **PROVIDER-UNVERIFIED**.
- Exporta o registro em JSON (`e2v-<session_id>.json`).

## Testes (sem rede, sem credenciais)

```
npm install
npm test        # 16 testes: configuração, ferramenta, registro, escuta com socket simulado, contrato do SDK instalado, servidor local
npm run build
```

## Executar o experimento AUTORIZADO no Windows

1. Instalar Node.js 20+ e abrir o PowerShell nesta pasta.
2. `npm install` e `npm run build`.
3. `npm start` → abrir `http://127.0.0.1:5173` no **Chrome** (o SDK usa AudioWorklet no Chrome; fone de ouvido recomendado para evitar eco).
4. Colar a chave pública da Millis (não é salva) e informar o `agent_id` de um agente de teste **dedicado** (nunca o Qualitec v4) ou um `agent_config` (modelo em `examples/agent-config.example.json`, com limite de 180 s por sessão e 20 s de silêncio).
5. Marcar a confirmação de experimento autorizado → **Conectar**, permitir o microfone.
6. Seguir o roteiro abaixo; **Encerrar** e **Exportar registro** a cada cenário. Enviar os JSON para análise.

Roteiro sugerido (≈ 2–3 min cada): (1) conversa simples — transcrições parciais/finais e respostas; (2) interromper o agente no meio da fala — momento do `clear` em relação à transcrição; (3) observar se `pause`/`unpause` ocorrem e quando; (4) pedir "um contato de teste" com a ferramenta sem opções; (5) repetir com `response_mode` = `strict`; (6) com `execute_after_message` `true` e `false`; (7) silêncio até o encerramento por inatividade (`onsessionended`); (8) `agent_id` com metadados no prompt.

## Estimativa do experimento real

- **Duração:** 8 sessões × 2–3 min de conversa ≈ **20–25 min de áudio**; com preparação e exportação, **45–60 min** de operador.
- **Consumo:** referência observada (DEC-073): Millis ≈ US$ 0,07 por 64 s ⇒ ≈ US$ 0,066/min. Estimativa **≈ US$ 1,50–2,00**, teto prudente **US$ 5** (retentativas, voz/LLM mais caros). **Sem custo de Twilio** (não há telefonia).
- **Incertezas:** preço real por voz/LLM escolhidos no `agent_config`; se a chave pública aceita `agent_config` inline; comportamento e custo de uma ferramenta cujo webhook falha (pode prolongar a sessão); semântica real de `response_mode`/`execute_after_message`; se `session_timeout` é respeitado; latência da região `api-west` a partir do Brasil; franquias/cobrança mínima da conta.

## Limitações

- Não é o Media Bridge nem integração com Twilio; não mede telefonia (8 kHz, rede celular).
- O microfone do computador e o cancelamento de eco do navegador diferem de uma ligação real.
- A escuta depende de detalhes internos do SDK 1.0.12 (verificados por teste); outra versão pode exigir ajuste.
- A ferramenta não é executada de fato (sem endpoint público autorizado); observa-se a decisão do motor, não a resposta.
- Nenhuma conexão real foi feita: o comportamento do fornecedor continua **PROVIDER-UNVERIFIED** até o experimento.

---

# 2ª etapa — agente dinâmico e consulta de agenda FICTÍCIA via webhook

Resultado do 1º experimento real (27/11/2026, `agent_id`): recebidos `ontranscript` (parcial e final), `onresponsetext`, `start_answering`, `clear`, `pause`, `unpause` e `timestamp` (marcações por caractere — agora reconhecido no registro).

## O que foi acrescentado (offline)

- **Agente dinâmico** (só com `agent_config`; com `agent_id` vale o painel): LLM (`llm.model`), voz (provedor e `voice_id`), idioma e `first_message`, aplicados a uma cópia do JSON. O início da sessão registra o resumo (sem segredos).
- **Ferramenta `e2v_consultar_agenda`**: webhook nativo da Millis apontando para o servidor experimental, autenticado pelo cabeçalho `x-e2v-token` (campo `header` da ferramenta). `response_mode` e `execute_after_message` continuam opcionais e comuns às ferramentas.
- **Webhook experimental** (`webhook/`): só `127.0.0.1:8787`, uma rota (`POST /tool/e2v-agenda`), token comparado em tempo constante, corpo até 16 KB. **Não importa nada da VAP nem acessa banco.** Cenários: `success` (3 horários fictícios), `unavailable`, `error` (HTTP 500) e `timeout` (resposta após `E2V_TIMEOUT_MS`, padrão 30 s; desistência do cliente registrada como `aborted`). Troca de cenário em `127.0.0.1:8788` (nunca exposto).
- **Registro do webhook** em `logs/webhook-<data>.jsonl`: requisição (cabeçalhos permitidos, corpo), resposta (status, corpo, latência), rejeições e trocas de cenário — **sem credenciais** (nem o token errado).
- **Linha do tempo única**: `npm run timeline -- e2v-<sessão>.json logs/webhook-<data>.jsonl` junta os eventos da página e do webhook pelo horário.

Testes: `npm test` — **25 aprovados** (16 anteriores + 9 novos: ajustes do agente, ferramenta autenticada, webhook com token ausente/errado, rotas, cenários, timeout/desistência, corpo grande/não JSON e linha do tempo).

## Disponibilização HTTPS temporária — SOMENTE após autorização expressa

A Millis chama o webhook pela internet; por isso é preciso um túnel HTTPS **temporário** apontando **só** para a porta 8787.

1. Instalar uma vez: `winget install --id Cloudflare.cloudflared`.
2. Terminal 1 (nesta pasta): `npm run webhook` — anotar o token mostrado (ou definir antes `$env:E2V_WEBHOOK_TOKEN` com 32+ caracteres; aí ele não é mostrado).
3. Terminal 2: `cloudflared tunnel --url http://127.0.0.1:8787` — anotar a URL `https://….trycloudflare.com`.
4. Terminal 3: `npm start` e abrir `http://127.0.0.1:5173` no Chrome.
5. Na página: `agent_config` (modelo em `examples/`), ajustes desejados, marcar a consulta de agenda, colar a URL do túnel e o token.
6. Trocar cenário entre sessões: `Invoke-RestMethod -Method Post "http://127.0.0.1:8788/scenario?set=timeout"`.
7. **Ao terminar: Ctrl+C no túnel e no webhook.** Cada execução gera token novo; não reutilize URL nem token.

Restrições: nunca expor as portas 5173 e 8788; o túnel fica aberto só durante a sessão; qualquer requisição sem token é recusada e registrada; nenhum dado real é enviado ou recebido.

## Matriz sugerida (≈ 2 min por sessão)

| # | Cenário | response_mode | execute_after_message | Observar |
| :- | :- | :- | :- | :- |
| 1 | success | — | — | ordem: transcrição final → `ai_action`? → requisição → resposta → `onresponsetext`; o que é falado durante a espera |
| 2 | unavailable | — | — | como o motor comunica indisponibilidade |
| 3 | error | — | — | reação a HTTP 500; repetição da chamada? |
| 4 | timeout | — | — | tempo-limite do fornecedor (momento do `aborted`); fala durante a espera |
| 5 | success | `strict` | — | diferença no texto falado após a resposta |
| 6 | timeout | `strict` | — | idem, com falha |
| 7 | success | — | `true` | se a ferramenta é executada antes/depois da fala |
| 8 | success | — | `false` | comparação com o #7 |
| 9 | success | — | — | troca de LLM/voz (agente dinâmico) |

**Estimativa:** 9 sessões × ~2 min ≈ 18–25 min de conversa; 60–75 min de operador. Custo Millis ≈ US$ 1,20–2,00 (referência DEC-073 ≈ US$ 0,066/min), teto prudente **US$ 5**; túnel Cloudflare rápido sem custo; sem Twilio. Incertezas: preço do LLM/voz escolhidos; retentativas do fornecedor em erro/timeout (podem alongar sessões); tempo-limite real da Millis para webhooks; semântica de `response_mode`/`execute_after_message`; estabilidade do túnel rápido (sem garantia de disponibilidade).

## Limitações da 2ª etapa

- O formato exato do corpo enviado pela Millis ao webhook e o tratamento das respostas são **PROVIDER-UNVERIFIED**; o servidor aceita qualquer JSON e registra como veio.
- Se a Millis não enviar o cabeçalho `header` configurado, todas as chamadas serão recusadas (401) — isso também é um resultado do experimento.
- O relógio da página e o do webhook são da mesma máquina (mesma referência); o tempo do lado da Millis não é observável.
- Horários fictícios fixos; não há reserva, nem leitura da agenda real, nem efeito comercial.

---

# Descobertas do 2º experimento real (27/11/2026) e correções

**Observado** (sessões reais com o protótipo `f8e7295`):

- `agent_config` **inline aceito** com `llm.model = "gpt-4o"`.
- `llm.model = "azure_gpt-5.6-luna"` **rejeitado** na conexão (a sessão não iniciou).
- O webhook **foi alcançado**: a Millis chamou `/tool/e2v-agenda` **três vezes via GET** (a ferramenta não declarava método) e recebeu 404 — o servidor só aceitava POST.
- A sessão foi **encerrada ≈ 20 s após o último estado `idle`** — compatível com `session_timeout.max_idle = 20` do modelo de configuração (hipótese, não confirmada).
- A segunda conexão (após a recusa do modelo) registrou **só 32 eventos locais/derivados**: a captura do WebSocket se perdeu.

**Correções (offline):**

1. **Método explícito:** as ferramentas declaram `method: "POST"` (nome do campo **PROVIDER-UNVERIFIED** — o SDK 1.0.12 não o tipa; confirmar na próxima sessão real). O webhook, para o caminho certo e token válido, responde a outro método com **405** (`Allow: POST`) e **registra** método e parâmetros da query — sem credenciais. Contingência de diagnóstico: `E2V_ACCEPT_GET=1` aceita GET **autenticado** com os parâmetros da query (o token continua obrigatório).
2. **Captura após reconexão:** a 2ª instalação da escuta devolvia um no-op e o envoltório do `WebSocket` continuava ligado ao registro da sessão anterior. Agora o envoltório é único e o registro de destino é trocado a cada sessão; cada socket fica preso ao registro da sessão que o criou (quadros tardios do socket antigo não contaminam a nova). A página também cancela a exibição do registro anterior.

**Regressão:** `npm test` — **27 aprovados** (25 + 2 novos: GET autenticado ⇒ 405 registrado e a contingência GET). O teste de reconexão e o de método falhavam antes da correção. As asserções de `method: "POST"` nas duas ferramentas foram acrescentadas aos testes existentes.

**Limitações:** se a Millis ignorar `method`, as chamadas continuarão chegando via GET (agora visíveis como 405 no registro, ou atendidas com `E2V_ACCEPT_GET=1`); o formato exato dos parâmetros enviados pela Millis segue não verificado; a causa do encerramento por inatividade é inferida.

---

# 3ª rodada — consolidação (offline)

Evidências, implementação desta rodada, **proposta de simplificação da E2** e plano do próximo experimento: [`FINDINGS.md`](FINDINGS.md).

Novidades de uso:
- Página: política de **inatividade nativa** (padrão 7 s + 7 s), `response_mode` (`strict`/`flexible`), mensagens predefinidas e `timeout` da ferramenta; ajustes aplicados antes da validação final.
- Webhook: cenário novo `error_200` (falha técnica com HTTP 200); todos os cenários devolvem `result`.
- `npm run correlate -- e2v-<sessão>.json logs/webhook-<data>.jsonl` → pares `onfunction` × webhook e classificação do fim da sessão.
- Testes: **37 aprovados** (`npm test`).
