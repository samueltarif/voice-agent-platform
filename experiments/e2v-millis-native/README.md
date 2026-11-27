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
