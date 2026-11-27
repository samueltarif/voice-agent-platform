# **Relatório técnico — Millis AI + Twilio + Voice Agent Platform (VAP)**

**Data da pesquisa:** 26 de novembro de 2026\
**Escopo:** arquitetura conversacional, ferramentas externas, segurança multiempresa, agendamento, opt-out, eventos telefônicos e simplificação da VAP.\
**Metodologia:** documentação oficial da Millis AI, referências de API, SDKs, exemplos de integração e documentação técnica da Twilio.

## **1. Resumo executivo**

A pesquisa confirma a premissa central do nosso projeto: **a Millis AI foi desenvolvida para assumir o papel de motor conversacional completo, e não apenas de reconhecimento e síntese de voz.**

Ela oferece mecanismos próprios para condução de conversas, interpretação de linguagem natural, interrupções, memória contextual, chamadas de ferramentas externas, personalização de sessões e integração com sistemas empresariais.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.millis.ai\&sz=32)

Millis AI+2



Portanto, não precisamos construir uma segunda inteligência conversacional dentro da VAP. Entretanto, existe uma diferença fundamental entre interpretar uma intenção e autorizar uma operação comercial.

**Millis AI**

Motor de inteligência conversacional

- Reconhecimento de voz
- Raciocínio
- Interpretação de intenções
- Condução do diálogo
- Síntese de voz
- Seleção de ferramentas

**VAP**

Autoridade sobre operações empresariais

- Segurança multiempresa
- Agendamentos
- CRM e campanhas
- Base de conhecimento
- Supressão de contatos
- Créditos e faturamento

**Twilio**

Infraestrutura de telefonia e transporte de áudio.

### **Principais descobertas**

| Descoberta                                                 | Resultado                |
| ---------------------------------------------------------- | ------------------------ |
| Millis possui motor conversacional próprio                 | Confirmado               |
| Function calling para APIs externas                        | Confirmado               |
| Headers personalizados nas ferramentas                     | Confirmado               |
| Personalização por sessão                                  | Confirmado               |
| Detecção nativa de DNC/opt-out                             | Configuração documentada |
| Criação dinâmica de agentes                                | Confirmado               |
| Agendamento por integração externa                         | Confirmado               |
| Controle de interrupções                                   | Confirmado               |
| Webhooks de início e fim de sessão                         | Confirmado               |
| Eventos detalhados durante a ligação via Twilio WSS direto | Ainda não comprovado     |
| Garantia determinística de consentimento                   | Não comprovada           |
| Garantia de que uma frase foi integralmente ouvida         | Não comprovada           |

**Minha recomendação arquitetural inicial é simplificar substancialmente o motor conversacional da VAP, mas preservar os mecanismos de autorização, segurança e integridade transacional.**

O principal ponto de atenção é a observabilidade da integração direta entre Twilio e Millis. Se a VAP não recebe evidências confiáveis do que aconteceu durante a conversa, ela não consegue assegurar determinados controles apenas por meio de código interno.

## **2. Classificação das evidências**

Para evitar decisões arquiteturais baseadas em funcionalidades presumidas, utilizarei as seguintes classificações:

| Código | Classificação                          |
| ------ | -------------------------------------- |
| DOC    | Confirmado por documentação oficial    |
| EX     | Confirmado por exemplo oficial         |
| INF    | Inferência técnica                     |
| ND     | Não documentado nas fontes consultadas |
| TESTE  | Requer validação experimental          |

Uma configuração presente na API não significa necessariamente que seu comportamento operacional esteja suficientemente documentado.

## **3. Motor conversacional da Millis AI**

### **3.1. Modelos de linguagem**

A documentação oficial apresenta os seguintes modelos e alternativas:

| Modelo                         | Evidência                  |
| ------------------------------ | -------------------------- |
| GPT-4o                         | DOC                        |
| GPT-4 Turbo                    | DOC                        |
| GPT-3.5 Turbo                  | DOC                        |
| Meta Llama 3                   | DOC                        |
| Seleção automática pela Millis | DOC                        |
| LLM externo personalizado      | DOC                        |
| Mistral                        | Mencionado no site oficial |

A Millis também permite configurar temperatura e limites de histórico de mensagens e resultados das ferramentas. Existe uma divergência entre o exemplo mais antigo, que representa `llm` como string, e a referência da API, que o representa como objeto contendo `model`, `temperature` e `history_settings`.

Não encontrei uma matriz exaustiva e datada dos modelos efetivamente disponíveis em novembro de 2026. Por isso, não considero essa relação necessariamente completa.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.millis.ai\&sz=32)

Millis AI+3



### **3.2. Capacidades conversacionais**

| Capacidade                                            | Classificação | Observação                             |
| ----------------------------------------------------- | ------------- | -------------------------------------- |
| Conversação em português brasileiro                   | DOC           | `pt-BR`                                |
| Interpretação de objeções                             | INF           | Raciocínio do LLM                      |
| Interpretação de consentimento                        | INF           | Não constitui autorização independente |
| Reconhecimento de retratações                         | INF           | Depende do contexto interpretado       |
| Detecção de atividade vocal                           | DOC           | `vad_threshold`                        |
| Barge-in                                              | DOC           | Interrupção configurável               |
| Histórico contextual                                  | DOC           | Limites configuráveis                  |
| Continuação de conversas anteriores                   | DOC           | Session Continuation                   |
| Instruções comerciais por agente                      | DOC           | System prompt                          |
| Function calling                                      | DOC           | Ferramentas externas                   |
| Máquina de estados comercial determinística           | ND            | Não comprovada                         |
| Validação semântica independente do LLM               | ND            | Não comprovada                         |
| Structured output arbitrário com JSON Schema completo | ND            | Não comprovado                         |

Fontes: [Agent Config](https://docs.millis.ai/core-concepts/agent-config?utm_source=chatgpt.com), [Session Continuation](https://docs.millis.ai/core-concepts/session-continuation?utm_source=chatgpt.com) e [Functions](https://docs.millis.ai/core-concepts/functions?utm_source=chatgpt.com).

### **3.3. Controle nativo de interrupções**

A configuração oficial contém:

```
{
  "flow": {
    "interruption": {
      "allowed": true,
      "keep_interruption_message": true,
      "first_messsage": true
    }
  }
}
```

O campo `first_messsage` está escrito dessa maneira na documentação oficial.

Outros recursos incluem atraso de resposta, mensagens para preencher períodos de silêncio, tratamento de inatividade, detecção de caixa postal e encerramento de chamadas pelo agente.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.millis.ai\&sz=32)

Millis AI



**Implicação para a VAP:** não precisamos desenvolver um mecanismo paralelo para administrar toda a dinâmica de fala, interrupções e silêncio. Precisamos apenas observar os eventos relevantes quando eles afetam uma operação comercial crítica.

## **4. Function calling e ferramentas externas**

Este é um dos recursos que mais justificam a simplificação da nossa arquitetura.

A Millis consegue selecionar uma função durante a conversa, coletar seus argumentos e acionar uma API externa para consultar informações ou executar operações.

### **4.1. Campos disponíveis**

| Campo oficial           | Finalidade ou evidência                                 |
| ----------------------- | ------------------------------------------------------- |
| `name`                  | Nome da ferramenta                                      |
| `description`           | Instrução de utilização                                 |
| `webhook`               | URL da API                                              |
| `header`                | Headers personalizados                                  |
| `params`                | Definição dos argumentos                                |
| `method`                | Método HTTP                                             |
| `timeout`               | Configuração de timeout                                 |
| `run_after_call`        | Configuração de execução pós-chamada                    |
| `messages`              | Mensagens associadas à ferramenta                       |
| `execute_after_message` | Campo de controle de execução                           |
| `exclude_session_id`    | Campo para exclusão do identificador da sessão          |
| `include_metadata`      | Campo para inclusão de metadados                        |
| `response_mode`         | Modo de resposta; valor `strict` presente na referência |

A existência desses campos está confirmada. Entretanto, suas garantias detalhadas de execução não estão igualmente especificadas.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.millis.ai\&sz=32)

Millis AI+2



### **4.2. Exemplo oficial de configuração**

A documentação apresenta uma ferramenta para consultar informações de um usuário. A estrutura abaixo é uma adaptação reduzida do exemplo oficial:

```
{
  "name": "getUserInfo",
  "description": "Retrieve user data",
  "webhook": "https://api.example.com/user",
  "header": {
    "Content-Type": "application/json",
    "Authorization": "Bearer TOKEN"
  },
  "params": [
    {
      "name": "email",
      "type": "string",
      "description": "User email",
      "required": true
    }
  ]
}
```

**Fonte:** [Functions for Agents](https://docs.millis.ai/core-concepts/functions?utm_source=chatgpt.com).

### **4.3. Ferramentas propostas para a VAP**

Existe uma pequena alteração recomendada nos nomes das ferramentas. A documentação estabelece identificadores sem espaços, utilizando camelCase ou underscores. Portanto, não devemos pressupor que nomes contendo pontos sejam aceitos.

| Nome interno da VAP        | Nome exposto à Millis      |
| -------------------------- | -------------------------- |
| `knowledge.search`         | `knowledge_search`         |
| `scheduling.find_slots`    | `scheduling_find_slots`    |
| `scheduling.confirm_offer` | `scheduling_confirm_offer` |
| `lead.record_outcome`      | `lead_record_outcome`      |
| `lead.record_opt_out`      | `lead_record_opt_out`      |

Podemos manter a nomenclatura interna atual e realizar a tradução no adaptador de integração.

### **4.4. Exemplo adaptado para agendamento**

Configuração proposta, baseada nos campos oficiais — ainda não executada:

```
{
  "name": "scheduling_find_slots",
  "description": "Consulta horários reais disponíveis na agenda.",
  "webhook": "https://vap.example.com/tools/find-slots",
  "method": "POST",
  "header": {
    "Authorization": "Bearer SESSION_TOKEN"
  },
  "exclude_session_id": false,
  "include_metadata": true,
  "run_after_call": false,
  "params": [
    {
      "name": "preferred_date",
      "type": "string",
      "description": "Data solicitada pelo interlocutor.",
      "required": true
    }
  ]
}
```

A resposta seria definida pela própria VAP, por exemplo:

```
{
  "status": "available",
  "offers": [
    {
      "offer_id": "offer_001",
      "starts_at": "2026-11-27T14:00:00-03:00"
    },
    {
      "offer_id": "offer_002",
      "starts_at": "2026-11-27T16:00:00-03:00"
    }
  ]
}
```

Esse último JSON representa o nosso contrato de negócio proposto, não um formato de resposta obrigatório documentado pela Millis.

### **4.5. O que está comprovado e o que permanece em aberto**

| Requisito                                        | Resultado |
| ------------------------------------------------ | --------- |
| Headers estáticos personalizados                 | DOC       |
| Autenticação Bearer personalizada                | EX        |
| Argumentos obrigatórios e tipos básicos          | DOC       |
| Métodos HTTP configuráveis                       | DOC       |
| Enumeração completa dos métodos aceitos          | ND        |
| Timeout configurável                             | DOC       |
| Unidade, máximo e comportamento do timeout       | TESTE     |
| Retries automáticos                              | ND        |
| Invocações concorrentes                          | TESTE     |
| Identificador único de invocação                 | ND        |
| Ordenação entre ferramentas                      | ND        |
| Headers dinâmicos por sessão                     | TESTE     |
| Inclusão de metadados                            | DOC       |
| Formato exato do payload HTTPS                   | TESTE     |
| Validação de JSON Schema complexo                | ND        |
| Tratamento de HTTP 400, 401, 409 e 500           | TESTE     |
| Utilização da resposta da ferramenta pelo agente | DOC       |
| Proibição absoluta de sucesso antes do retorno   | ND        |

Consequentemente, a VAP precisa continuar validando todos os argumentos recebidos, inclusive quando a Millis declara um argumento obrigatório.

### **4.6. Descoberta importante:&#x20;**`response_mode: "strict"`

A referência da API de criação de agentes apresenta:

```
{
  "response_mode": "strict"
}
```

O campo aparece tanto nas ferramentas externas quanto nas funções específicas da Millis.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.millis.ai\&sz=32)

Millis AI



Essa funcionalidade merece prioridade nos experimentos porque pode permitir um controle mais rígido das respostas do agente.

Entretanto, não encontrei documentação suficiente que garanta que esse modo:

- Reproduza literalmente o texto retornado pela VAP.
- Impeça o agente de acrescentar frases.
- Impeça uma confirmação antes do resultado transacional.
- Bloqueie novas respostas durante uma operação crítica.
- Funcione com as mesmas garantias na integração Twilio WSS.

**Se os experimentos confirmarem essas propriedades, poderemos simplificar consideravelmente o mecanismo desenvolvido para impedir confirmações de reuniões inexistentes.**

## **5. Eventos da Millis AI: a descoberta mais relevante**

A Millis possui pelo menos três superfícies de integração distintas:

**1. Twilio WSS direto**

Integração atualmente utilizada pela VAP.

`twilio_inbound`

**2. WebSocket nativo / Web SDK**

Integração de áudio e eventos em tempo real, com a aplicação como cliente.

`millis`

**3. Custom LLM WebSocket**

Millis conecta-se a um servidor responsável pelo raciocínio personalizado.

`custom_llm_websocket`

Essas interfaces não devem ser tratadas como equivalentes.

### **5.1. Matriz de eventos em tempo real**

| Evento oficial         | Informação                       | Interface documentada | Acessível à VAP no WSS direto?                 |
| ---------------------- | -------------------------------- | --------------------- | ---------------------------------------------- |
| `onopen`               | Conexão estabelecida             | Web SDK               | Não comprovado                                 |
| `onready`              | Cliente pronto                   | Web SDK               | Não comprovado                                 |
| `ontranscript`         | Transcrição do usuário           | SDK / WSS nativo      | Não comprovado                                 |
| `onresponsetext`       | Texto do agente                  | SDK / WSS nativo      | Não comprovado                                 |
| `onaudio`              | Dados de áudio                   | Web SDK               | Não comprovado                                 |
| `onfunction`           | Função invocada                  | Web SDK               | Não como evento documentado                    |
| `start_answering`      | Agente começa a responder        | WSS nativo            | Não comprovado                                 |
| `pause`                | Pausa de reprodução              | WSS nativo            | Não comprovado                                 |
| `unpause`              | Retomada de reprodução           | WSS nativo            | Não comprovado                                 |
| `clear`                | Interrupção e limpeza de buffer  | WSS nativo            | Não comprovado                                 |
| `ai_action`            | Ação interna para depuração      | WSS nativo            | Não comprovado                                 |
| `start_call`           | Dados identificadores da chamada | Custom LLM            | Somente nessa interface, conforme documentação |
| `stream_request`       | Histórico da conversa            | Custom LLM            | Somente nessa interface, conforme documentação |
| `playback_finished`    | Fim da reprodução                | Custom LLM            | Somente nessa interface, conforme documentação |
| `interrupt`            | Interrupção do fluxo             | Custom LLM            | Somente nessa interface, conforme documentação |
| `onsessionended`       | Sessão encerrada                 | SDK / WSS nativo      | Não comprovado                                 |
| `session_data_webhook` | Informações consolidadas         | HTTPS                 | Disponibilidade no fluxo atual requer teste    |

Fontes oficiais: [Web SDK](https://docs.millis.ai/integration/web-sdk?utm_source=chatgpt.com), [Native WebSocket](https://docs.millis.ai/integration/native-apps-with-websocket?utm_source=chatgpt.com), [Custom LLM](https://docs.millis.ai/integration/custom-llm?utm_source=chatgpt.com) e [Webhooks](https://docs.millis.ai/core-concepts/webhooks?utm_source=chatgpt.com).

### **5.2. Transcrições parciais e finais**

O Web SDK documenta as seguintes assinaturas:

```
ontranscript: (
  text: string,
  payload: { is_final?: boolean }
) => void;
```

```
onresponsetext: (
  text: string,
  payload: { is_final?: boolean }
) => void;
```

Isso confirma que existe um mecanismo nativo de identificação de transcrições finais.

Porém, o atributo é opcional e essas assinaturas não incluem identificadores explícitos de turnos, timestamps de reprodução ou garantias de deduplicação.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.millis.ai\&sz=32)

Millis AI



### **5.3. Evento de reprodução concluída**

A interface Custom LLM documenta um evento muito semelhante ao que estamos tentando implementar:

```
{
  "type": "playback_finished",
  "data": {
    "session_id": "string",
    "stream_id": "integer"
  }
}
```

Também existe o evento:

```
{
  "type": "interrupt",
  "stream_id": "integer"
}
```

Ambos são documentados na integração de LLM personalizado.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.millis.ai\&sz=32)

Millis AI



Essa é uma descoberta relevante para a E2. Entretanto, existem duas limitações:

1. Não está documentado que possamos receber esses eventos sem habilitar a interface de LLM personalizado.
2. A documentação não esclarece suficientemente o tratamento de eventos atrasados, cancelamentos concorrentes e interrupções imediatamente anteriores ao fim da reprodução.

Não recomendo substituir o motor de raciocínio da Millis apenas para obter esses eventos.

## **6. Twilio Media Streams: o que realmente conseguimos observar**

A integração que já testamos corresponde ao exemplo oficial da Millis:

```
<Response>
  <Connect>
    <Stream url="wss://api-west.millis.ai:8080/twilio_inbound/{public_key}/{agent_id}" />
  </Connect>
</Response>
```

Embora o exemplo oficial seja apresentado como inbound, o nosso teste de chamada outbound originada pela API da Twilio demonstrou que esse transporte também funcionou no cenário testado. Isso é uma evidência experimental do projeto, não uma garantia geral publicada pela Millis.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.millis.ai\&sz=32)

Millis AI



### **6.1. Arquitetura atual**

A VAP controla a criação da chamada e recebe callbacks, mas não participa diretamente do transporte de áudio.

### **6.2. Eventos oficiais da Twilio**

| Evento      | Payload relevante                                            | Direção         |
| ----------- | ------------------------------------------------------------ | --------------- |
| `connected` | `protocol`, `version`                                        | Twilio → Millis |
| `start`     | `callSid`, `streamSid`, `customParameters`, `sequenceNumber` | Twilio → Millis |
| `media`     | `payload`, `timestamp`, `chunk`, `track`                     | Twilio → Millis |
| `media`     | `streamSid`, `media.payload`                                 | Millis → Twilio |
| `dtmf`      | Dígito pressionado                                           | Twilio → Millis |
| `mark`      | `streamSid`, `mark.name`                                     | Ambas           |
| `clear`     | `streamSid`                                                  | Millis → Twilio |
| `stop`      | Dados de encerramento do stream                              | Twilio → Millis |

O servidor conectado ao WebSocket deve validar a assinatura da Twilio durante o estabelecimento da conexão. A documentação também define números sequenciais para acompanhar a ordem das mensagens enviadas pela Twilio.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.twilio.com\&sz=32)

Twilio+1



### **6.3. O problema do&#x20;**`mark`**&#x20;e do&#x20;**`clear`

Quando um servidor envia áudio para a Twilio, pode associar uma marca ao conteúdo enviado.

A Twilio devolve essa marca quando termina de reproduzir o áudio. Entretanto, também devolve marcas pendentes quando o buffer é esvaziado por um comando `clear`.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.twilio.com\&sz=32)

Twilio



Cenário 1 — Reprodução normal

Cenário 2 — Interrupção

Portanto, **receber um&#x20;**`mark`**&#x20;não significa automaticamente que a mensagem foi integralmente reproduzida.**

Também devemos distinguir:

| Etapa                       | O que comprova                                     |
| --------------------------- | -------------------------------------------------- |
| Texto gerado                | O LLM produziu conteúdo                            |
| Áudio gerado                | O TTS sintetizou conteúdo                          |
| Áudio enviado               | O conteúdo foi encaminhado à telefonia             |
| Áudio reproduzido           | A infraestrutura executou sua reprodução           |
| Áudio ouvido e compreendido | Não pode ser garantido apenas por eventos técnicos |

Na arquitetura atual, a conexão WSS ocorre diretamente com a Millis. A VAP não recebe as mensagens `mark` e `clear` dessa conexão.

Um callback de status do stream pode informar início, encerramento e erro, mas não substitui os eventos de reprodução.

**Essa descoberta confirma que a preocupação A4 da auditoria é tecnicamente válida.** Ao mesmo tempo, um protocolo determinístico na VAP não resolverá A4 se não receber os eventos reais de transporte.

## **7. Webhooks, metadados e identificação de sessões**

### **7.1. Prefetch Data Webhook**

A Millis possui um webhook executado antes do início da conversa.

Campo oficial:

```
{
  "extra_prompt_webhook": {
    "url": "https://vap.example.com/session/prefetch",
    "headers": {
      "Authorization": "Bearer TOKEN"
    }
  }
}
```

A requisição é realizada utilizando GET e pode incluir:

| Parâmetro            | Descrição                            |
| -------------------- | ------------------------------------ |
| `session_id`         | Identificador da sessão              |
| `agent_id`           | Identificador do agente              |
| `from`               | Número de origem, quando disponível  |
| `to`                 | Número de destino, quando disponível |
| Metadados adicionais | Quando disponíveis                   |

A VAP pode responder com novos metadados e instruções adicionais. Exemplo adaptado:

```
{
  "metadata": {
    "attempt_id": "attempt_001",
    "customer_name": "Cliente"
  },
  "extra_prompt": "Apresente os serviços da empresa."
}
```

**Classificação: DOC quanto ao mecanismo; TESTE quanto à correlação segura na integração atual.**

Fonte: [Millis Webhooks — Prefetch Data](https://docs.millis.ai/core-concepts/webhooks?utm_source=chatgpt.com).

### **7.2. End-of-Call Webhook**

O segundo webhook é executado após o encerramento da sessão:

```
{
  "session_data_webhook": {
    "url": "https://vap.example.com/session/completed",
    "headers": {
      "Authorization": "Bearer TOKEN"
    }
  }
}
```

A documentação apresenta, entre outros, os seguintes campos:

| Campo            | Conteúdo                           |
| ---------------- | ---------------------------------- |
| `session_id`     | Sessão da Millis                   |
| `call_id`        | Identificador da chamada na Millis |
| `agent_id`       | Agente utilizado                   |
| `chat`           | Histórico serializado da conversa  |
| `function_calls` | Ferramentas acionadas              |
| `duration`       | Duração da sessão                  |
| `metadata`       | Metadados finais                   |
| `cost_breakdown` | Componentes do custo               |
| `voip`           | Dados telefônicos                  |
| `recording`      | Informações da gravação            |
| `call_status`    | Motivo de encerramento             |
| `error_message`  | Informações de erro                |
| `agent_config`   | Configuração do agente             |

Os motivos documentados de encerramento incluem `user-ended`, `agent-ended`, `api-ended`, `timeout`, `error` e motivos relacionados à caixa postal.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.millis.ai\&sz=32)

Millis AI+1



Esse recurso pode ser utilizado para reconciliação financeira, processamento de resultados comerciais, auditoria e atualização do CRM.

**Atenção:** o campo `agent_config` pode potencialmente conter configurações sensíveis. Recomendo sanitizar os dados recebidos antes de armazená-los em logs.

### **7.3. Garantias de entrega**

| Requisito                                | Millis          |
| ---------------------------------------- | --------------- |
| Identificador único da sessão            | Documentado     |
| Headers de autenticação                  | Documentado     |
| Assinatura HMAC específica do fornecedor | Não localizada  |
| Proteção nativa contra replay            | Não localizada  |
| Retries de webhook                       | Não localizados |
| Entrega exatamente uma vez               | Não comprovada  |
| Ordenação entre webhooks e tools         | Não comprovada  |
| Identificador único por evento           | Não comprovado  |

Por isso, devemos preservar os mecanismos de idempotência e reconciliação da VAP.

## **8. Segurança multiempresa**

Esta é uma área em que não devemos delegar autoridade ao motor conversacional.

Independentemente da qualidade do LLM, os argumentos gerados por ele devem ser considerados dados não confiáveis.

### **8.1. O que nunca deve autorizar uma operação**

```
{
  "tenant_id": "empresa_123",
  "agent_id": "agent_456",
  "lead_id": "lead_789",
  "confirmed": true
}
```

Mesmo que todos os valores sejam sintaticamente válidos, um modelo pode gerar identificadores incorretos ou interpretar uma confirmação inexistente.

A autoridade precisa ser derivada de uma credencial validada pelo servidor, vinculada a uma sessão previamente autorizada pela VAP.

### **8.2. Arquitetura A — Agente temporário por ligação**

A Millis documenta APIs para criação e exclusão de agentes:

| Operação          | Endpoint                    |
| ----------------- | --------------------------- |
| Criar agente      | `POST /agents`              |
| Excluir agente    | `DELETE /agents/{agent_id}` |
| Registrar chamada | `POST /register_call`       |

Host documentado: `https://api-west.millis.ai`.

A API de criação recebe o nome e a configuração do agente. A API de registro de chamadas aceita configuração, metadados e retorna `call_id` e `session_id`.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.millis.ai\&sz=32)

Millis AI+2



### **Fluxo proposto**

1. VAP cria uma tentativa de chamada.
2. Gera uma credencial opaca, temporária e exclusiva.
3. Cria um agente Millis com essa credencial nos headers das ferramentas.
4. Inicia a chamada pela Twilio utilizando o ID do agente criado.
5. Millis aciona ferramentas HTTPS da VAP.
6. VAP valida a credencial e identifica a sessão autorizada.
7. Após a finalização e reconciliação, revoga a credencial e exclui o agente.

**Vantagens:** forte isolamento por tentativa, credenciais independentes e menor dependência de interpolação dinâmica de headers.

**Desvantagens:** criação e limpeza adicionais, possibilidade de agentes órfãos, consumo de API, latência extra e limites operacionais ainda não confirmados.

A criação dinâmica de agentes é documentada. A utilização dessa estratégia em campanhas concorrentes pela integração direta precisa de validação experimental.

### **8.3. Arquitetura B — Agente permanente com contexto dinâmico**

A Millis permite metadados e variáveis dinâmicas em sessões. A documentação estabelece que essas variáveis podem ser utilizadas em prompts, mensagens e parâmetros de ferramentas.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.millis.ai\&sz=32)

Millis AI+1



A arquitetura proposta seria:

### **Fluxo proposto**

1. VAP mantém um agente permanente por empresa e versão.
2. Cria uma tentativa de chamada com identidade própria.
3. Associa a tentativa ao `CallSid` da Twilio.
4. Millis inicia a sessão e fornece seu identificador.
5. VAP realiza a associação segura entre as duas identidades.
6. Todas as ferramentas validam a sessão, empresa, permissões e estado da tentativa.

Existe, entretanto, uma lacuna importante.

A Twilio documenta parâmetros personalizados:

```
<Connect>
  <Stream url="wss://example.com/media">
    <Parameter
      name="attempt_id"
      value="attempt_001"
    />
  </Stream>
</Connect>
```

Esses parâmetros são encaminhados dentro de `start.customParameters` ao servidor WSS.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.twilio.com\&sz=32)

Twilio+1



Mas não encontrei confirmação de que o endpoint `twilio_inbound` da Millis converta automaticamente esses parâmetros em metadados internos de sessão.

Também não encontrei documentação suficiente demonstrando como o resultado de `POST /register_call` pode ser consumido pelo endpoint `twilio_inbound`.

Não devemos inventar essa associação.

### **8.4. Comparação**

| Critério                        | Agente temporário    | Agente permanente               |
| ------------------------------- | -------------------- | ------------------------------- |
| Isolamento de credenciais       | Mais simples         | Depende da vinculação da sessão |
| Latência de inicialização       | Potencialmente maior | Potencialmente menor            |
| Quantidade de chamadas à API    | Maior                | Menor                           |
| Limpeza de agentes              | Necessária           | Reduzida                        |
| Escalabilidade operacional      | Requer testes        | Potencialmente superior         |
| Custo adicional                 | Desconhecido         | Desconhecido                    |
| Risco de contexto compartilhado | Menor por desenho    | Requer testes                   |
| Maturidade para produção        | Condicional          | Condicional                     |

**Recomendação:** testar primeiro a arquitetura B. Caso não exista uma vinculação segura da sessão, utilizar a arquitetura A como alternativa inicial, desde que seus limites operacionais sejam aceitáveis.

Nunca atualizar a configuração compartilhada de um agente permanente para inserir credenciais de uma chamada específica enquanto outras chamadas estiverem utilizando o mesmo agente.

## **9. Agendamento de reuniões**

### **9.1. Integração nativa**

A Millis possui um tutorial oficial de agendamento utilizando o Cal.com, com funções separadas para consultar disponibilidade e reservar horários.

O tutorial também menciona Calendly e Google Calendar como integrações planejadas. Não encontrei confirmação suficiente de que essas duas integrações estejam atualmente disponíveis como recursos nativos.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.millis.ai\&sz=32)

Millis AI



Isso comprova que o fluxo que estamos desenvolvendo é compatível com o propósito da Millis.

Não precisamos substituir nossa agenda PostgreSQL por Cal.com.

### **9.2. Fluxo ideal da VAP**

Quero marcar uma apresentação amanhã.

**Millis interpreta a intenção**

Aciona `scheduling_find_slots`.

**VAP consulta PostgreSQL**

Retorna duas ofertas temporárias: 14h e 16h.

Temos disponibilidade às 14h ou às 16h. Qual horário prefere?

Às 14h.

Confirma a reunião amanhã às 14h?

Sim, pode marcar.

**VAP valida e registra**

Autorização, evidência, oferta, expiração, concorrência e transação.

Sua reunião foi confirmada para amanhã às 14h.

Esse é o fluxo desejado, condicionado à disponibilidade de evidências e controles adequados.

### **9.3. O que a Millis deve assumir**

- Interpretar quando o cliente deseja agendar.
- Entender datas relativas e preferências.
- Apresentar os horários retornados.
- Formular perguntas naturalmente.
- Interpretar objeções.
- Acionar a ferramenta apropriada.
- Comunicar o resultado retornado pela VAP.

### **9.4. O que deve permanecer na VAP**

- Identidade da empresa e do interlocutor.
- Disponibilidade real da agenda.
- Fuso horário canônico.
- Geração e expiração de ofertas.
- Invalidação de autorizações anteriores.
- Evidência de consentimento, conforme a política adotada.
- Controle de concorrência.
- Reserva transacional.
- Idempotência.
- Registro definitivo da reunião.

A Millis não deve ter permissão para criar uma reunião apenas porque o LLM produziu `confirmed: true`.

### **9.5. Simplificação possível**

Em vez de uma máquina de estados que represente toda a conversa comercial, podemos manter uma máquina de estados restrita à operação de agendamento.

A VAP controla estados da operação comercial, não todos os estados possíveis do diálogo.

Essa distinção pode reduzir significativamente a complexidade sem sacrificar a integridade dos agendamentos.

## **10. Opt-out e descadastramento**

### **10.1. Recurso nativo de DNC**

A referência oficial contém:

```
{
  "privacy_settings": {
    "do_not_call_detection": true
  }
}
```

**Classificação: DOC quanto à existência da configuração.**

Porém, não encontrei especificação suficiente demonstrando o algoritmo empregado, se a detecção é independente do LLM, qual evento é emitido, quando a abordagem é interrompida ou como a informação é persistida.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.millis.ai\&sz=32)

Millis AI



Também não há comprovação de que essa configuração impeça chamadas futuras originadas diretamente pela API da Twilio.

A supressão canônica da VAP continua obrigatória.

### **10.2. Tratamento das intenções**

| Manifestação do interlocutor           | Tratamento recomendado                                   |
| -------------------------------------- | -------------------------------------------------------- |
| Não me ligue mais                      | Interromper abordagem e processar supressão              |
| Retire meu número da lista             | Processar supressão                                      |
| Quero me descadastrar                  | Processar supressão                                      |
| Não tenho interesse                    | Registrar desinteresse, sem presumir DNC permanente      |
| Me descadastre, só que não             | Suspender abordagem e esclarecer                         |
| Tire meu número se eu confirmar amanhã | Suspender abordagem; não presumir confirmação definitiva |

A VAP pode manter uma supressão preventiva ou quarentena durante situações ambíguas. Assim, o contato não volta automaticamente à campanha enquanto o pedido estiver pendente.

### **10.3. Encerramento da abordagem**

A Millis documenta um mecanismo de encerramento pelo agente e uma API para terminar sessões. A Twilio também disponibiliza o gerenciamento de chamadas em andamento.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.millis.ai\&sz=32)

Millis AI+1



Minha recomendação é que, uma vez identificada uma solicitação inequívoca de descadastramento, a VAP possa aplicar o bloqueio e controlar o encerramento da chamada por uma via independente.

Não é necessário implementar um segundo LLM para isso. Mas uma chamada de ferramenta, isoladamente, não é evidência suficiente de que o interlocutor fez a solicitação.

## **11. Base de conhecimento empresarial**

A Millis disponibiliza uma base de conhecimento nativa com APIs de gerenciamento e associação de arquivos aos agentes.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.millis.ai\&sz=32)

Millis AI+1



| Recurso                                                   | Resultado                        |
| --------------------------------------------------------- | -------------------------------- |
| Base de conhecimento por agente                           | DOC                              |
| Cadastro de arquivos                                      | DOC                              |
| Associação de arquivos                                    | DOC                              |
| Atualização sem recriar o agente                          | API de associação disponível     |
| Busca semântica e detalhes do ranking                     | Não suficientemente documentados |
| Lista completa dos formatos aceitos                       | ND                               |
| Busca externa por webhook                                 | DOC                              |
| Proteção comprovada contra prompt injection em documentos | ND                               |
| Garantia absoluta contra alucinações                      | ND                               |

### **Arquitetura que recomendo**

Manteria o PostgreSQL como fonte canônica das informações empresariais.

A Millis pode realizar uma pesquisa utilizando `knowledge_search`, receber informações autorizadas e formular uma resposta natural.

Isso elimina a necessidade de duplicar todo o catálogo, documentos e informações comerciais na infraestrutura da Millis.

Para segurança, a VAP deve filtrar os documentos por empresa, controlar versões, retornar apenas os trechos relevantes e tratar o conteúdo recuperado como dados não confiáveis, nunca como novas instruções de autoridade.

## **12. Análise dos problemas A1–A7 da auditoria**

Esta é a seção mais importante para decidir como continuar o desenvolvimento da E2.

A1

**Um “sim” relacionado a outra pergunta autoriza uma reserva anterior.**

A interpretação contextual da Millis ajuda, mas não oferece garantia determinística comprovada.

**Solução:** manter autorização vinculada à oferta ativa e ao contexto específico da confirmação. Invalidar essa autorização quando a pergunta mudar ou ocorrer uma interrupção relevante.

Dependência: eventos confiáveis de turno ou um canal alternativo de confirmação.

A2

**O agente solicita descadastramento sem pedido real.**

A existência de `do_not_call_detection` não comprova a validade independente do pedido.

**Solução:** tratar a ferramenta como solicitação de supressão, registrar evidência confiável e adotar bloqueio preventivo quando houver incerteza.

Dependência: transcrição confiável ou confirmação posterior.

A3

**A abordagem comercial continua durante ou após um pedido de opt-out.**

Um prompt pode orientar a interrupção, mas não constitui bloqueio obrigatório.

**Solução:** impedir novas ações comerciais na VAP, cancelar tarefas pendentes e controlar o encerramento da chamada quando necessário.

Dependência: capacidade de interromper efetivamente a fala ou finalizar a chamada.

A4

**Uma fala interrompida é considerada entregue por causa de um evento atrasado.**

Existem mecanismos nativos de reprodução e interrupção, mas sua observabilidade no fluxo atual não foi comprovada.

**Solução:** se os eventos estiverem disponíveis, correlacionar geração, interrupção e reprodução. Eventos atrasados não podem restaurar uma autorização invalidada.

Dependência: fonte real dos eventos. Sem ela, não afirmar que a mensagem foi entregue.

A5

**Uma consulta sem disponibilidade deixa válida uma autorização anterior.**

Trata-se essencialmente de um problema de estado da operação comercial, não de inteligência conversacional.

**Solução:** cada nova consulta deve invalidar as ofertas anteriores quando aplicável, inclusive quando não retornar vagas.

Pode ser resolvido integralmente pela VAP.

A6

**O agente anuncia uma reunião inexistente ou em horário divergente.**

O modo `strict` da Millis é uma possibilidade de simplificação, ainda não comprovada.

**Solução:** gerar uma confirmação canônica somente após o commit da transação. Validar experimentalmente se a Millis consegue reproduzi-la sem alterar o conteúdo.

Dependência: controle da resposta falada ou comunicação de confirmação por canal independente.

A7

**O agente registra desinteresse sem conversar com o cliente.**

O status de chamada atendida não comprova diálogo humano: pode existir caixa postal ou ausência de interação.

**Solução:** diferenciar tentativa telefônica, interação humana e classificação comercial. Sem evidência suficiente, manter o resultado indeterminado.

A classificação comercial pode ocorrer após a chamada.

### **Resultado consolidado**

| Problema | Pode ser delegado integralmente à Millis? | Controle principal      |
| -------- | ----------------------------------------- | ----------------------- |
| A1       | Não                                       | Autorização e evidência |
| A2       | Não comprovado                            | Supressão e evidência   |
| A3       | Parcialmente                              | Bloqueio e encerramento |
| A4       | Depende da interface                      | Eventos de reprodução   |
| A5       | Não                                       | Estado transacional     |
| A6       | Depende do modo strict                    | Resultado canônico      |
| A7       | Parcialmente                              | Evidência de interação  |

A auditoria não está necessariamente exigindo controles desnecessários. O que precisa ser reavaliado é **a implementação desses controles e a disponibilidade dos sinais externos necessários para que funcionem.**

## **13. Componentes que podemos simplificar ou eliminar**

Considerando o escopo apresentado para a VAP, esta é a divisão de responsabilidades que recomendo:

| Componente                                       | Decisão arquitetural                       |
| ------------------------------------------------ | ------------------------------------------ |
| Reconhecimento de voz                            | Delegar à Millis                           |
| Síntese de voz                                   | Delegar à Millis                           |
| Raciocínio conversacional                        | Delegar à Millis                           |
| Interpretação geral de intenções                 | Delegar à Millis                           |
| Tratamento de objeções                           | Delegar à Millis                           |
| Seleção de ferramentas                           | Delegar à Millis                           |
| Gerenciamento geral do diálogo                   | Delegar à Millis                           |
| Memória durante a conversa                       | Delegar à Millis                           |
| Barge-in                                         | Delegar à Millis                           |
| Classificadores abrangentes de português         | Simplificar                                |
| Gramáticas fechadas de consentimento             | Simplificar ou substituir condicionalmente |
| Máquina de estados da conversa completa          | Simplificar                                |
| Máquina de estados da reserva                    | Manter na VAP                              |
| Máquina de estados do opt-out                    | Manter na VAP                              |
| Protocolo de entrega de áudio                    | Validação experimental                     |
| Filtros lexicais de todas as respostas           | Reavaliar                                  |
| Simulador determinístico                         | Manter para testes de invariantes          |
| Orquestrador próprio de decisões conversacionais | Eliminar por duplicidade, se existente     |
| Gateway seguro de ferramentas                    | Manter na VAP                              |
| Segundo LLM para raciocínio geral                | Eliminar por duplicidade                   |
| Base de conhecimento empresarial                 | Manter na VAP                              |
| Isolamento multiempresa                          | Manter na VAP                              |
| Idempotência                                     | Manter na VAP                              |
| Supressão canônica                               | Manter na VAP                              |
| Controle financeiro                              | Manter na VAP                              |

### **Sobre os classificadores determinísticos**

Não considero necessário manter um mecanismo extenso que tente compreender todas as variações possíveis da língua portuguesa.

Isso duplicaria parte da responsabilidade do LLM e criaria dificuldades para lidar com regionalismos, linguagem informal, contradições e frases inesperadas.

Porém, classificadores específicos podem continuar úteis quando trabalham sobre evidência confiável e possuem escopo limitado a uma operação crítica.

Não devemos removê-los antes de comprovar um mecanismo substituto.

## **14. Arquitetura recomendada para a VAP**

A estrutura ideal é baseada em quatro camadas.

**Camada 1 — Twilio**

Telefonia, chamadas e transporte de áudio

**Camada 2 — Millis AI**

STT, LLM, TTS, diálogo e seleção de ferramentas

Agendamento

Conhecimento

Qualificação

Opt-out

HTTPS / eventos validados

**Camada 3 — Gateway VAP**

Autenticação

Autorização

Identidade da sessão

Validação de argumentos

Idempotência

Políticas de negócio

**Camada 4 — Serviços empresariais**

CRM

Campanhas

Agendas

Conhecimento

Supressão

Financeiro

Auditoria

Empresas

PostgreSQL

O princípio central é:

**A Millis decide o que tentar fazer. A VAP decide o que é permitido fazer.**

### **14.1. Alternativa quando os eventos não estiverem disponíveis**

Caso a Millis não exponha os eventos necessários na integração atual, temos três possibilidades.

| Alternativa                           | Benefício                                                         | Limitação                                                                  |
| ------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Manter WSS direto                     | Menor complexidade                                                | Observabilidade limitada                                                   |
| Criar proxy WSS entre Twilio e Millis | Observar mensagens do transporte, inclusive marcas e interrupções | Não fornece automaticamente transcrição ou identidade semântica dos turnos |
| Integrar com WSS nativo da Millis     | Acesso a eventos conversacionais documentados                     | Exige adaptação do transporte de áudio                                     |

O proxy WSS seria uma alternativa de infraestrutura, não um segundo motor de inteligência.

**Twilio Media Streams**

**Adaptador WSS da VAP**

Correlação de sessão, observabilidade e controle de transporte

**Millis AI — motor conversacional**

O protocolo nativo da Millis documenta PCM de 16 kHz, enquanto a Twilio Media Streams utiliza μ-law de 8 kHz. Uma integração com o protocolo nativo exigiria conversão de áudio, gerenciamento de buffers e tratamento de interrupções.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.millis.ai\&sz=32)

Millis AI+1



Por isso, não recomendo iniciar essa implementação antes de validar as possibilidades da arquitetura direta. A introdução de um proxy ou adaptador também precisa ser avaliada quanto à latência, autenticação e compatibilidade.

## **15. Custos e limites operacionais**

### **15.1. Preços publicados pela Millis**

Tarifa-base publicada

# **US$ 0,02/min**

Não inclui necessariamente os custos de LLM, STT, TTS e telefonia.

A documentação apresenta as seguintes estimativas adicionais.

LLM — estimativas por minuto publicadas

GPT-4 Turbo

US$ 0,008

GPT-4o

US$ 0,004

GPT-3.5 Turbo

US$ 0,0004

Meta Llama 3

US$ 0,00018

TTS — estimativas por minuto publicadas

PlayHT

US$ 0,125

ElevenLabs

US$ 0,05

Rime

US$ 0,0375

Cartesia

US$ 0,0196

OpenAI

US$ 0,0075

Deepgram

US$ 0,0075

Neets

US$ 0,0005

Fonte: [Millis AI Pricing Overview](https://docs.millis.ai/pricing?utm_source=chatgpt.com).&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.millis.ai\&sz=32)

Millis AI



Esses são valores publicados na documentação disponível, não tarifas contratuais verificadas no painel da conta. A página ainda utiliza modelos mais antigos em suas estimativas, portanto não é possível garantir que todos esses preços permaneçam comercialmente vigentes.

### **15.2. Simulador preliminar de custos**

### **Estimativa de custo operacional**

Minutos mensais

Modelo LLMGPT-4o

Síntese de voz (TTS)

STT efetivo por minuto de chamada (USD)

Telefonia e transporte Twilio por minuto (USD)

Câmbio USD/BRL — hipótese editável

Custo por minuto

# **US$ 0,0336**

Custo mensal em dólares

# **$33.65**

Custo mensal estimado em reais

# **R$ 185,08**

Millis base

US$ 0.0200

LLM

US$ 0.0040

TTS

US$ 0.0075

STT

US$ 0.0022

Twilio

US$ 0.0000

Modelo ilustrativo. A telefonia começa em zero por não termos a tarifa contratual. O STT inicial considera atividade vocal em 50% da chamada, conforme a hipótese do exemplo oficial. O câmbio não representa cotação atual.

### **15.3. Limites ainda não confirmados**

| Limite                                   | Situação |
| ---------------------------------------- | -------- |
| Número máximo de agentes                 | ND       |
| Chamadas simultâneas                     | ND       |
| Ferramentas por agente                   | ND       |
| Invocações por sessão                    | ND       |
| Rate limit da API                        | ND       |
| Limite de criação de agentes temporários | ND       |
| Preço adicional por criação de agente    | ND       |
| SLA de latência das ferramentas          | ND       |
| Retenção padrão de transcrições          | ND       |
| Retenção padrão de gravações             | ND       |
| SLA de disponibilidade                   | ND       |

Não encontrei documentação oficial suficiente para fornecer números confiáveis nesses itens.

### **15.4. Regiões e privacidade**

A Millis documenta endpoints para `us-west` e `eu-west`. A documentação de regiões não comprova uma infraestrutura específica no Brasil.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.millis.ai\&sz=32)

Millis AI



Também existe uma configuração de não retenção de dados. Segundo a documentação, a continuação de sessões anteriores deixa de funcionar quando o Data Opt-Out está ativado.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.millis.ai\&sz=32)

Millis AI



A API disponibiliza gerenciamento de históricos e exclusão de gravações, mas esses recursos não estabelecem por si só conformidade integral com a LGPD.

Para produção comercial, será necessário confirmar diretamente com o fornecedor as políticas de retenção, subprocessadores, tratamento internacional de dados, exclusão e condições contratuais.

## **16. Plano de validação experimental**

Não recomendo continuar construindo componentes que dependem de capacidades ainda não comprovadas.

Os experimentos abaixo devem ser realizados posteriormente em ambiente isolado, com números autorizados e dados fictícios.

### **Checklist de experimentos**

0 de 10

#### **P0 — Bloqueadores arquiteturais**

**P0.1 — Correlação segura da sessão**

Validar CallSid, session_id, agent_id, attempt_id e customParameters.

Aceitação: Chamadas simultâneas não compartilham identidade nem credenciais.

**P0.2 — Contrato das ferramentas HTTPS**

Capturar headers, método, corpo, metadata, session_id e comportamento em timeout.

Aceitação: Identidade independente dos argumentos do LLM e nenhuma execução duplicada.

**P0.3 — Response mode strict**

Retornar mensagens canônicas, erros e conflitos de agendamento.

Aceitação: Nenhuma confirmação prematura ou alteração de informações críticas.

**P0.4 — Eventos em tempo real**

Identificar transcrições finais, interrupções, IDs e eventos de reprodução no WSS atual.

Aceitação: Evidências correlacionáveis e suficientes para operações críticas.

**P0.5 — Isolamento e concorrência**

Executar chamadas paralelas de empresas distintas e testar replay e tokens expirados.

Aceitação: Zero acesso cruzado e zero operação não autorizada.

**P0.6 — DNC e opt-out**

Testar pedidos inequívocos, ambíguos, condicionais e retratações.

Aceitação: Abordagem interrompida e supressão tratada pela política canônica.

#### **P1 — Validação operacional**

**P1.1 — Agentes temporários**

Medir criação, disponibilidade, exclusão, latência e falhas.

Aceitação: Ciclo de vida previsível e compatível com a escala desejada.

**P1.2 — Webhooks e reconciliação**

Testar falhas de entrega, duplicação e divergências entre custos e duração.

Aceitação: Reconciliação idempotente sem cobranças duplicadas.

**P1.3 — Base de conhecimento**

Consultar dados autorizados, inexistentes e pertencentes a outra empresa.

Aceitação: Sem acesso cruzado, com comportamento adequado quando não houver informação.

**P1.4 — Qualidade comercial em português**

Testar ruídos, fala simultânea, datas relativas, negações e regionalismos.

Aceitação: Qualidade aceitável conforme métricas definidas antes da execução.

Os testes P0 são mais importantes do que ampliar o número de casos simulados internamente sem comprovar o contrato real do fornecedor.

## **17. Impacto sobre o desenvolvimento atual da E2**

Considerando os trabalhos das PRs #180, #182 e #183 e a auditoria consolidada antes da E3, eu não recomendaria simplesmente apagar tudo que foi desenvolvido até agora.

A pesquisa não constitui uma auditoria do código-fonte dessas PRs. Portanto, a classificação abaixo refere-se às responsabilidades arquiteturais, não à comprovação de que arquivos específicos devam ser removidos.

### **O que faria agora**

| Ordem | Ação                                                                              |
| ----- | --------------------------------------------------------------------------------- |
| 1     | Preservar o trabalho atual da E2 e seu histórico Git                              |
| 2     | Concluir a avaliação dos controles transacionais e de autorização                 |
| 3     | Suspender a expansão do motor conversacional próprio                              |
| 4     | Executar os experimentos P0 da Millis antes de assumir novos contratos de eventos |
| 5     | Identificar componentes redundantes com base nos resultados reais                 |
| 6     | Refatorar apenas os componentes cuja substituição tenha sido comprovada           |
| 7     | Retomar a E3 com os contratos de integração definidos                             |

### **Critérios para avançar**

A E2 não deve ser considerada pronta para operações comerciais autônomas de alto impacto enquanto não houver uma solução comprovada para:

- Identidade e autenticação das sessões.
- Evidência suficiente para consentimento.
- Comportamento seguro do opt-out.
- Confirmação de resultados transacionais.
- Tratamento das interrupções relevantes.

Caso a interface direta não ofereça todas essas capacidades, devemos limitar as operações permitidas ou modificar a integração, em vez de criar eventos fictícios que apenas funcionem nos simuladores.

## **18. Referências oficiais**

Todas as referências abaixo foram consultadas em **26/11/2026**.

| Documentação              | Link oficial                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Índice completo da Millis | [llms.txt](https://docs.millis.ai/llms.txt?utm_source=chatgpt.com)                                                              |
| Introdução                | [Introduction](https://docs.millis.ai/introduction?utm_source=chatgpt.com)                                                      |
| Configuração dos agentes  | [Agent Config](https://docs.millis.ai/core-concepts/agent-config?utm_source=chatgpt.com)                                        |
| Function calling          | [Functions for Agents](https://docs.millis.ai/core-concepts/functions?utm_source=chatgpt.com)                                   |
| Webhooks                  | [Webhooks](https://docs.millis.ai/core-concepts/webhooks?utm_source=chatgpt.com)                                                |
| Metadados                 | [Attach Metadata](https://docs.millis.ai/core-concepts/metadata?utm_source=chatgpt.com)                                         |
| Variáveis dinâmicas       | [Dynamic Variables](https://docs.millis.ai/core-concepts/variables?utm_source=chatgpt.com)                                      |
| Continuação de sessões    | [Session Continuation](https://docs.millis.ai/core-concepts/session-continuation?utm_source=chatgpt.com)                        |
| SDK                       | [Web SDK](https://docs.millis.ai/integration/web-sdk?utm_source=chatgpt.com)                                                    |
| WSS nativo                | [Native WebSocket](https://docs.millis.ai/integration/native-apps-with-websocket?utm_source=chatgpt.com)                        |
| LLM personalizado         | [Custom LLM](https://docs.millis.ai/integration/custom-llm?utm_source=chatgpt.com)                                              |
| Integração Twilio         | [Inbound Call](https://docs.millis.ai/integration/inbound-call?utm_source=chatgpt.com)                                          |
| Outbound Millis           | [Outbound Call](https://docs.millis.ai/integration/outbound-call?utm_source=chatgpt.com)                                        |
| Registro de chamadas      | [Register Call](https://docs.millis.ai/api-reference/call-management/register-call?utm_source=chatgpt.com)                      |
| Criação de agentes        | [Create Agent](https://docs.millis.ai/api-reference/agents/create-agent?utm_source=chatgpt.com)                                 |
| Exclusão de agentes       | [Delete Agent](https://docs.millis.ai/api-reference/agents/delete-agent?utm_source=chatgpt.com)                                 |
| Encerramento              | [Terminate Session](https://docs.millis.ai/api-reference/call-management/terminate-call-session?utm_source=chatgpt.com)         |
| Agendamento               | [Appointment Scheduling](https://docs.millis.ai/tutorials/create-voice-agent-for-appointment-scheduling?utm_source=chatgpt.com) |
| Base de conhecimento      | [Set Agent Files](https://docs.millis.ai/api-reference/knowledge-base/set-agent-files?utm_source=chatgpt.com)                   |
| Preços                    | [Pricing](https://docs.millis.ai/pricing?utm_source=chatgpt.com)                                                                |
| Regiões                   | [Regions](https://docs.millis.ai/core-concepts/regions?utm_source=chatgpt.com)                                                  |
| Privacidade               | [Privacy Policy](https://www.millis.ai/privacy?utm_source=chatgpt.com)                                                          |
| Twilio Media Streams      | [Overview](https://www.twilio.com/docs/voice/media-streams?utm_source=chatgpt.com)                                              |
| Eventos WSS da Twilio     | [WebSocket Messages](https://www.twilio.com/docs/voice/media-streams/websocket-messages?utm_source=chatgpt.com)                 |
| TwiML Stream              | [Stream Reference](https://www.twilio.com/docs/voice/twiml/stream?utm_source=chatgpt.com)                                       |
| Controle telefônico       | [Calls API](https://www.twilio.com/docs/voice/api/call-resource?utm_source=chatgpt.com)                                         |

### **Limitações da pesquisa**

Não foram utilizados tokens privados, criados agentes, realizadas ligações ou consumidos créditos.

A especificação OpenAPI bruta não pôde ser recuperada pela ferramenta de pesquisa, embora as páginas oficiais de referência da API tenham sido acessadas. Também não localizei um changelog oficial suficientemente completo para estabelecer a data de introdução de cada funcionalidade.

As lacunas assinaladas como ND ou TESTE não significam que a Millis necessariamente não possua esses recursos, mas que não obtivemos evidência suficiente para utilizá-los como garantias arquiteturais.

## **19. Conclusão e recomendação final**

A pesquisa reforça sua preocupação original: **existe um risco real de estarmos desenvolvendo uma complexidade conversacional maior do que a necessária para a VAP.**

A Millis já oferece boa parte dos recursos fundamentais de uma plataforma de voz com inteligência artificial.

## **Delegar**

Conversação, interpretação, raciocínio, voz e escolha de ferramentas.

## **Preservar**

Segurança, autorização, operações comerciais e integridade dos dados.

## **Simplificar**

Classificadores, máquinas de estados conversacionais e orquestração redundante.

## **Validar**

Modo strict, identidade por sessão, DNC e eventos em tempo real.

Minha recomendação é introduzir uma pequena etapa intermediária de validação, que poderíamos chamar de **E2-V — Millis Integration Validation**, antes da E3.

Não seria uma nova etapa extensa de desenvolvimento. Seria uma etapa de comprovação dos contratos reais de integração, utilizada para decidir quais mecanismos atuais precisam permanecer e quais podem ser simplificados.

O objetivo deve continuar sendo construir um SaaS de agentes telefônicos empresariais, e não desenvolver uma concorrente da Millis AI dentro da própria VAP.