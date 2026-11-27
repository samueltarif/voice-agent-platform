**Relatório Técnico: Millis AI (millis.ai) — Capacidades, Limitações e Integração com Twilio Media Streams para Voice Agent Platform (VAP)**

**Data de consulta das fontes oficiais:** 26 de novembro de 2026.  
Fontes prioritárias: `docs.millis.ai` (incluindo `/llms.txt`, agent config, functions, webhooks, inbound-call, pricing, native websocket, custom LLM, knowledge-base endpoints) e OpenAPI em `https://api-west.millis.ai/openapi.json` / `https://api-west.millis.ai:8080/openapi.json`.  
Classificação usada: **CONFIRMADO POR DOCUMENTAÇÃO OFICIAL**, **CONFIRMADO POR EXEMPLO OFICIAL**, **INFERÊNCIA TÉCNICA**, **NÃO DOCUMENTADO**, **REQUER TESTE**.

### 1. Resumo Executivo

A Millis AI é uma plataforma de voice agents de baixa latência (~600 ms reclamada) que combina STT, LLM e TTS com suporte nativo a interrupções (barge-in), function calling via webhooks HTTPS e integração direta com Twilio Media Streams via endpoint WebSocket específico. O fluxo testado pela equipe (`Twilio Calls → TwiML <Connect><Stream> → wss://api-west.millis.ai:8080/twilio_inbound/{PUBLIC_KEY}/{AGENT_ID}`) é o caminho oficial documentado para inbound Twilio.

A Millis pode ser usada como motor conversacional completo (STT + raciocínio + TTS + interrupções + tools). A VAP deve manter controle de multiempresa, autorização, dados canônicos (supressão, agendas, créditos), idempotência e auditoria. A integração Twilio WSS é um “pipe de áudio” em grande parte opaco: eventos granulares de turno/áudio/tool em tempo real **não estão documentados publicamente** para esse caminho (diferente do Web SDK, native WebSocket e Custom LLM). Controles determinísticos fortes (consentimento, opt-out, confirmação de agenda) **não existem nativamente com garantia técnica**; dependem de prompts + tools + lógica na VAP.

Arquitetura recomendada: agente permanente (ou pool) + metadata/session variables + tools autenticadas por sessão + webhooks de prefetch/end-of-call + lista de supressão e agenda canônicas na VAP. Evitar reconstruir motor conversacional; focar em orquestração segura e determinística na borda da VAP.

### 2. Capacidades Comprovadas da Millis

**Modelos de linguagem**  
- Default otimizado para latência.  
- Suporte a GPT-4o, GPT-4 Turbo, GPT-3.5 Turbo, Meta Llama-3 e custom via WebSocket.  
- Configurável por agente (`llm.model`, `temperature`, `history_settings`).  
**CONFIRMADO POR DOCUMENTAÇÃO OFICIAL** (agent.md, agent-config schema, pricing).

**Memória contextual**  
- Histórico de mensagens controlado por `llm.history_settings` (`history_message_limit`, `history_tool_result_limit`).  
- `memory.user_identifier_key` para memória cross-session (quando configurado).  
- Metadata e dynamic variables injetáveis no prompt.  
**CONFIRMADO**. Não há garantia de isolamento perfeito entre sessões além do que o histórico e metadata fornecem.

**Interrupções / barge-in**  
- `flow.interruption.allowed`, `keep_interruption_message`, `first_message`.  
- No native WebSocket: eventos `pause` / `unpause` / `clear`.  
- No Custom LLM: eventos `interrupt`, `partial_transcript`, `playback_finished`.  
**CONFIRMADO** para paths não-Twilio-WSS. No path Twilio WSS usado pela VAP: **NÃO DOCUMENTADO** (Millis recebe o stream e gerencia internamente).

**Tools / Function Calling**  
- Array `tools` no agent config. Cada tool: `name`, `description`, `webhook` (URL), `header` (objeto estático), `params` (array com `name`, `type` string/number/boolean, `description`, `required`), `method`, `timeout`, `run_after_call`, `messages`, `response_mode` (“strict”), `execute_after_message`, `exclude_session_id`.  
- Também `millis_functions` e `app_functions` (ex.: cal.com).  
**CONFIRMADO POR DOCUMENTAÇÃO OFICIAL e EXEMPLO OFICIAL** (functions.md, get-agent schema, tutorial NewsAPI).

Exemplo real de configuração (adaptado do tutorial oficial):

```json
{
  "name": "get_latest_news",
  "description": "Fetch the latest news based on a keyword.",
  "webhook": "https://newsapi.org/v2/everything?pageSize=1",
  "header": {
    "Authorization": "<key>"
  },
  "params": [
    {
      "name": "q",
      "type": "string",
      "description": "The keyword to search for news.",
      "required": true
    }
  ]
}
```

**Agendamento nativo**  
- App function com cal.com (slots + booking). Planos de integração futura com Calendly/Google Calendar mencionados em tutorial.  
**CONFIRMADO** (tutorial appointment scheduling). Substituição completa por API própria da VAP é possível via tools customizadas.

**Knowledge Base**  
- Campo `knowledge_base.files` + endpoints de upload (`generate-presigned-url`, `create-file`, `set-agent-files`, `list-files`, `delete-file`).  
- Suporte a mensagens de fallback.  
**CONFIRMADO**. Detalhes de RAG/semântica interna e isolamento multiempresa **não documentados em profundidade**.

**Privacidade / DNC**  
- `privacy_settings.opt_out_data_collection` e `do_not_call_detection`.  
**CONFIRMADO** no schema de agent config. Comportamento exato (interrupção imediata, tool automática, escopo Twilio vs nativo) **REQUER TESTE**.

**Idiomas**  
- Português listado explicitamente.  
**CONFIRMADO**.

**Regiões**  
- us-west (`api-west.millis.ai`) e eu-west.  
**CONFIRMADO**.

### 3. Matriz de Eventos Disponíveis

| Evento / Identificador                  | Nome Oficial / Path                  | Tempo Real? | Disponível no Twilio WSS? | Payload / Forma de Recebimento                  | Garantias Documentadas          | Classificação                  |
|-----------------------------------------|--------------------------------------|-------------|---------------------------|-------------------------------------------------|---------------------------------|--------------------------------|
| Session / Call ID                       | `session_id`, `call_id`             | Sim (start) | Parcial (via webhooks)   | Prefetch GET, End-of-Call POST, Call History   | Identidade por session_id      | CONFIRMADO                    |
| Início de fala do cliente               | VAD interno                         | Sim        | NÃO DOCUMENTADO          | —                                               | —                               | NÃO DOCUMENTADO               |
| Transcrição parcial / final             | `partial_transcript`, `ontranscript`| Sim        | NÃO DOCUMENTADO          | Custom LLM / Native WS / Web SDK                | is_final flag                   | CONFIRMADO (outros paths)     |
| Início / conclusão geração áudio agente | `start_answering`, `onresponsetext` | Sim        | NÃO DOCUMENTADO          | Native WS / Web SDK                             | —                               | CONFIRMADO (outros paths)     |
| Conclusão efetiva de reprodução         | `playback_finished`                 | Sim        | NÃO DOCUMENTADO          | Custom LLM                                      | —                               | CONFIRMADO (Custom LLM)       |
| Interrupção / clear                     | `interrupt`, `clear`, `pause`/`unpause` | Sim     | NÃO DOCUMENTADO          | Native WS / Custom LLM                          | —                               | CONFIRMADO (outros paths)     |
| Tool invocation / resultado             | function_calls no end-of-call       | Pós-chamada| Sim (pós)                | End-of-Call webhook + Call History              | Lista de calls                  | CONFIRMADO                    |
| Encerramento de sessão                  | `onsessionended`, call_status       | Sim / Pós  | Parcial                  | Webhooks + History                              | Vários status (user-ended etc.) | CONFIRMADO                    |

**Observação crítica sobre Twilio Media Streams:** Quando o WebSocket está conectado diretamente à Millis (`twilio_inbound/...`), a VAP **não recebe** os eventos mark/clear/media do Twilio no seu próprio socket (Twilio envia para a Millis). Para observar mark/clear a VAP precisaria de um proxy (ex.: Jambonz sample oficial ou proxy próprio). **CONFIRMADO** pelo modelo de integração e pelo repositório jambonz/millisai-audio-socket.  
Áudio gerado ≠ áudio enviado ≠ áudio efetivamente reproduzido ≠ áudio interrompido. Não há evento público de “ouvido completo” no path Twilio WSS.

### 4. Ferramentas Externas — Detalhes Técnicos

- **Configuração:** Estática no agent config (ou override).  
- **HTTP:** Método configurável (default aparentemente POST), headers estáticos, timeout configurável.  
- **Argumentos:** Modelo gera conforme schema simples (não JSON Schema completo documentado).  
- **Autenticação:** Headers estáticos ou via metadata/dynamic variables. Tokens por sessão possíveis se a VAP gerar e injetar via metadata/prefetch.  
- **Retorno:** Resultado volta ao contexto do modelo. `response_mode: "strict"` e `messages` ajudam a controlar fala. Não há garantia documentada de que o modelo espere a resposta antes de afirmar sucesso.  
- **Controle de conversa:** Tool pode retornar mensagem para fala; `agent_terminate_call` e Custom LLM permitem encerrar.  
- **Simultâneas / ordenação / retries / IDs de invocação:** **NÃO DOCUMENTADO** em detalhe.  
- **Impedir afirmação prematura:** Apenas via prompt + `strict` + design da tool (VAP deve validar). **INFERÊNCIA TÉCNICA + REQUER TESTE**.

Headers dinâmicos por chamada e passagem rica de metadados são suportados via metadata e variables (`{var}` syntax).

### 5. Limitações Específicas da Integração Twilio WSS

- Eventos granulares de turno/áudio/tool em tempo real **não documentados**.  
- Metadata e agent_config dinâmicos por chamada são mais limitados do que no Web SDK / native / SIP register (onde `agent_config` e metadata podem ser passados no initiate). No Twilio inbound clássico usa-se public_key + agent_id fixos; overrides via `set-agent-config-override` ou prefetch webhook.  
- Sem acesso direto aos eventos mark/clear do Twilio.  
- DNC nativo e opt-out dependem do comportamento interno do modelo + flag `do_not_call_detection`.  
**REQUER TESTE** para comportamento real sob carga e em português brasileiro.

### 6. Solução Recomendada para os Problemas A1–A7

| Problema | Mecanismo Nativo Millis | Garantia Técnica? | Funciona no Twilio WSS? | Controles que devem ficar na VAP | Solução mais simples e segura |
|----------|--------------------------|-------------------|--------------------------|----------------------------------|-------------------------------|
| A1 (sim autoriza reserva anterior) | Nenhum determinístico | Não (probabilístico) | Parcial | Estado de oferta + confirmação explícita | Tool `scheduling.confirm_offer` com ID de oferta temporária + validação transacional + prompt que obriga confirmação clara. Estado de “oferta pendente” na VAP. |
| A2 (tool de opt-out sem pedido) | `do_not_call_detection` | Fraca / não documentada | REQUER TESTE | Lista canônica + evidência | Tool de opt-out só chamada após confirmação explíc VAP registra apenas com evidência de transcrição + intent forte. |
| A3 (abordagem continua após opt-out) | Flag DNC + prompt | Não | REQUER TESTE | Máquina de estados de sessão | Após tool de opt-out bem-sucedida, VAP pode forçar término (via API terminate se disponível) ou prompt forte + tool que encerra. |
| A4 (fala interrompida considerada entregue) | Eventos clear/interrupt em outros paths | Não no WSS | Não documentado | Protocolo de entrega próprio se necessário | Não confiar em “gerado = ouvido”. Usar apenas eventos pós-chamada + gravação para auditoria. |
| A5 (nova consulta invalida autorização antiga) | Nenhum | Não | — | Idempotência + estado de oferta | Ofertas com TTL e ID único; confirm_offer valida estado atual. |
| A6 (anuncia reunião inexistente) | Tool + strict response | Parcial | Sim (tool) | Validação na VAP | Tool retorna apenas dados reais; prompt proíbe inventar; VAP é fonte da verdade. |
| A7 (registra desinteresse sem conversa) | Nenhum | Não | — | Evidência mínima | Tool de outcome só aceita com session_id válido + duração mínima + transcrição. |

Nenhuma solução nativa oferece garantia técnica forte para operações irreversíveis. **Não recomendar apenas prompts**.

### 7. Divisão de Responsabilidades e Arquitetura Recomendada

**DELEGAR À MILLIS**  
- STT, LLM (raciocínio conversacional), TTS, barge-in básico, condução de diálogo, function calling via webhook, knowledge base nativa (se útil), voicemail detection, call transfer básico, session timeout.

**MANTER NA VAP**  
- Multiempresa (isolamento, credenciais, dados), lista de supressão canônica, agendas/reservas transacionais, créditos financeiros, CRM, campanhas, autorização de tools (token por sessão), auditoria, gravações (se necessário além da Millis), classificadores determinísticos de opt-out/consentimento em português (como camada de segurança), máquina de estados de sessão de alto nível, validação de argumentos de tools.

**SIMPLIFICAR / ELIMINAR**  
- Motor conversacional próprio, segundo LLM completo para orquestração principal, gramáticas fechadas completas (usar apenas para intents críticos), protocolo de entrega de áudio complexo (se não houver necessidade de prova de “ouvido”), simulador determinístico pesado (manter apenas testes de contrato de tools).

**Arquitetura recomendada (enxuta)**  
1. **Agente permanente** (ou pool por empresa/versão) com tools apontando para endpoints da VAP autenticados por token de sessão.  
2. No início da chamada (prefetch webhook ou parâmetro de stream se suportado): VAP gera `session_token` de curta duração + metadata (empresa_id, attempt_id, agent_version, contact_id) e injeta.  
3. Tools (`knowledge.search`, `scheduling.find_slots`, `scheduling.confirm_offer`, `lead.record_outcome`, `lead.record_opt_out`) recebem o token e validam isolamento.  
4. End-of-call webhook + Call History API para auditoria e sincronização.  
5. Supressão e agenda sempre canônicas na PostgreSQL da VAP.  
6. Para maior isolamento: possibilidade de criar agente temporário por ligação via API (`Create Agent` + `Delete Agent`) com credencial restrita — viável mas com custo de latência/criação. **REQUER TESTE** de performance.

Comparação A (temporário) vs B (permanente + contexto dinâmico):  
- **A**: Maior isolamento, maior latência/custo/complexidade de lifecycle.  
- **B**: Mais simples, menor latência, risco de vazamento se metadata/token forem mal geridos. Preferível se tokens forem fortes e tools validarem rigorosamente.

### 8. Limites e Custos (documentados)

- Base: **$0,02 / minuto**.  
- STT: **$0,0043 / minuto**.  
- LLM: estimado por token (ex. GPT-4o ~$0,004/min; Llama-3 mais barato; custom LLM sem custo Millis).  
- TTS: depende do provider (ElevenLabs ~$0,05/min estimado, OpenAI/Deepgram mais baratos).  
- Volume discounts mencionados.  
- Limites de agentes simultâneos, rate limits de tools, retenção exata de gravações/transcrições: **NÃO DOCUMENTADO** publicamente em detalhe (consultar conta / suporte).  
**CONFIRMADO** em pricing.md.

### 9. Lacunas que Exigem Experimentos Controlados + Plano de Validação

1. Eventos reais trocados no WebSocket Twilio ↔ Millis (capturar com proxy).  
2. Comportamento de `do_not_call_detection` em português brasileiro (frases ambíguas, interrupção imediata, chamada automática de tool).  
3. Se tool result pode forçar fala exata e impedir afirmação prematura.  
4. Latência e confiabilidade de tools sob concorrência.  
5. Isolamento real de contexto entre sessões no mesmo agent_id.  
6. Suporte a headers dinâmicos / tokens rotativos sem recriar agente.  
7. Comportamento de `response_mode: strict` e `execute_after_message`.  
8. Se prefetch webhook funciona no path Twilio inbound puro.

**Plano de validação (sem executar agora):**  
- Instrumentar proxy WebSocket entre Twilio e Millis.  
- Scripts de teste com frases controladas de opt-out, confirmação, interrupção e agenda.  
- Medir timings de tool → fala e eventos de interrupção.  
- Testar criação/exclusão rápida de agentes.  
- Verificar Call History e webhooks pós-chamada.  
- Testes de isolamento multiempresa com tokens inválidos/cruzados.

### 10. Referências Oficiais (URLs diretas)

- Índice: https://docs.millis.ai/llms.txt  
- Inbound Twilio: https://docs.millis.ai/integration/inbound-call  
- Functions: https://docs.millis.ai/core-concepts/functions.md  
- Webhooks: https://docs.millis.ai/core-concepts/webhooks.md  
- Agent / Config: https://docs.millis.ai/core-concepts/agent.md + schema em Get Agent  
- Pricing: https://docs.millis.ai/pricing.md  
- Native WebSocket events: https://docs.millis.ai/integration/native-apps-with-websocket  
- Custom LLM events: https://docs.millis.ai/integration/custom-llm  
- Appointment (cal.com): https://docs.millis.ai/tutorials/create-voice-agent-for-appointment-scheduling.md  
- Metadata / Variables: https://docs.millis.ai/core-concepts/metadata.md + variables.md  
- OpenAPI: https://api-west.millis.ai/openapi.json  

**Conclusão arquitetural:** A Millis é adequada como motor conversacional de produção para a VAP no path Twilio já validado. Os riscos A1–A7 são reais e devem ser mitigados na VAP com estado determinístico, tokens de sessão, validação de tools e evidência de transcrição — nunca apenas com prompt. Experimentos controlados nos pontos listados são obrigatórios antes de produção multiempresa.