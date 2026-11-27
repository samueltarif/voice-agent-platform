
Procurar na web
 Realize uma investigação técnica aprofundada na internet sobre implementações reais utilizando Millis AI e Twilio para agentes telefônicos de inteligência artificial.


Já pesquisamos a documentação oficial. Agora quero investigar principalmente experiências práticas de desenvolvedores que conseguiram implementar essas integrações.


Pesquisar:

YouTube: vídeos, tutoriais, demonstrações, transcrições e descrições.
GitHub: repositórios, exemplos de código, issues e pull requests.
Reddit.
Fóruns de desenvolvedores.
Comunidades de automação.
Artigos técnicos.
Integrações com n8n e Make, quando revelarem o funcionamento das APIs.
Pesquisar em inglês, português e espanhol, sem limitar a pesquisa aos vídeos oficiais da Millis.

Contexto
Estamos desenvolvendo uma plataforma SaaS multiempresa chamada Voice Agent Platform (VAP), utilizando TypeScript, Node.js, PostgreSQL e Next.js.


A Millis será o cérebro conversacional dos agentes. A Twilio será responsável pela telefonia. Nossa plataforma será responsável pelo CRM, agenda, campanhas, base de conhecimento, ferramentas, segurança e financeiro.


Já realizamos com sucesso uma ligação para um celular brasileiro utilizando:


Twilio Calls API → TwiML Connect/Stream → Millis AI.


Endpoint utilizado:


wss://api-west.millis.ai:8080/twilio_inbound/{PUBLIC_KEY}/{AGENT_ID}


Não queremos reconstruir o motor conversacional da Millis.

O que precisamos descobrir
Como outros desenvolvedores realizaram chamadas outbound e inbound utilizando Millis e Twilio.
Como configuraram ferramentas externas e webhooks.
Como realizaram agendamentos durante a conversa.
Como integraram CRM e bases de conhecimento externas.
Como obtiveram transcrições durante e após a chamada.
Como identificaram e autenticaram cada sessão.
Como utilizaram agentes permanentes ou temporários.
Como transmitiram variáveis dinâmicas e metadados.
Como trataram interrupções, encerramentos e opt-out.
Como utilizaram response_mode: strict e execute_after_message.
Como controlaram respostas do agente após o retorno de ferramentas.
Como integraram múltiplos clientes ou empresas.
Priorizar implementações que utilizem o próprio motor de raciocínio da Millis.


Investigar também soluções que utilizem um proxy WebSocket ou o WebSocket nativo da Millis sem substituir seu LLM.

Análise dos vídeos
Não apenas encontre os vídeos. Sempre que possível, analise suas transcrições, legendas, descrições, códigos apresentados, configurações demonstradas e repositórios associados.


Para cada vídeo relevante, apresentar:

Título.
Canal.
Data de publicação.
URL direta.
Minutagem dos trechos relevantes, quando verificável.
Arquitetura utilizada.
Configurações demonstradas.
Código disponibilizado.
Funcionalidades efetivamente demonstradas.
Limitações.
O que podemos aproveitar na VAP.
Se não conseguir acessar a transcrição ou o conteúdo visual, informar explicitamente. Não inventar o conteúdo do vídeo com base no título.

Entrega
Produzir um relatório técnico em português brasileiro.


Separar:

Funcionalidades comprovadas em demonstrações reais.
Funcionalidades apenas mencionadas.
Código disponível para investigação.
Inferências técnicas.
Lacunas que permanecem sem resposta.
Ao final, selecionar as cinco implementações mais relevantes para nossa arquitetura e recomendar o caminho mais simples para integrar Millis e Twilio à VAP, preservando segurança multiempresa, autorização e integridade dos dados.


Não repetir extensamente a documentação oficial. O foco desta investigação é descobrir como outros desenvolvedores resolveram esses problemas na prática.


Não realizar chamadas, criar contas, utilizar credenciais ou consumir créditos de fornecedores.

…
Procurar na web
 continue, travou

Continuação do relatório — Millis AI + Twilio para a VAP
Retomando da seção 4, encontrei mais duas referências particularmente importantes: um tutorial independente de agendamento com Millis e n8n e o código distribuído do SDK da própria Millis, que expõe interfaces TypeScript relacionadas a agentes temporários, metadados e transcrições finais.

4. Implementações adicionais de agendamento e automação
4.1. Ibrahim Rana — Millis AI + n8n + Google Calendar
Build a No-Code Voice AI Receptionist with n8n (Books Appointments)

Canal: Ibrahim Rana · 13 de outubro de 2025 · Inglês
Assistir ao vídeo no YouTube

Alta relevância para a E2
Esse tutorial é especialmente interessante porque aborda problemas semelhantes aos que estamos tentando resolver com o protocolo de agendamento da VAP.

A descrição apresenta os seguintes componentes:

Funcionalidade

Evidência encontrada

Coleta do nome do cliente

Descrição

Coleta do motivo do atendimento

Descrição

Identificação do horário desejado

Descrição

Webhook entre Millis e n8n

Descrição

Validação dos parâmetros

Descrição

Normalização de fusos horários

Descrição

Consulta de disponibilidade

Descrição

Prevenção de conflitos de agenda

Descrição

Criação de agendamento

Descrição

Confirmação verbal ao cliente

Descrição

Envio de confirmação por SMS ou e-mail

Descrição


YouTube
Arquitetura descrita:

Cliente por telefone

Millis AI

Conversação e interpretação da solicitação
n8n — Webhook

Validação e lógica de negócio
Google Calendar

Disponibilidade e criação do compromisso
Na VAP, o n8n e o Google Calendar poderiam ser substituídos pela nossa API de ferramentas e pelo nosso serviço de agendamento em PostgreSQL.

Limitações da investigação:

Não consegui recuperar a transcrição, as configurações visuais, as minutagens ou o código do fluxo. O acesso direto à página do vídeo foi limitado pelo YouTube. Também não consegui confirmar qual operadora telefônica foi utilizada.

Portanto, não existe evidência suficiente de que o autor tenha resolvido os seguintes problemas:

Confirmação vinculada ao turno correto do interlocutor.

Cancelamento de uma operação após interrupção.

Concorrência entre agendamentos.

Autorização multiempresa.

Idempotência de ferramentas.

Respostas incorretas do LLM depois do retorno de um webhook.

Mesmo assim, recomendo colocar esse vídeo entre os três tutoriais prioritários.

5. Reddit e comunidades de desenvolvedores
5.1. Publicação original sobre a Millis
Data: 5 de abril de 2024
Comunidade: r/SideProject
Consultar discussão original

O responsável pelo projeto apresentou a Millis como uma plataforma capaz de lidar com interrupções e identificar o momento adequado para responder ao interlocutor.

Dois comentários são particularmente relevantes:

Em setembro de 2024, um desenvolvedor perguntou como a plataforma identifica o final de uma frase, uma vez que o frontend transmite continuamente os dados pelo WebSocket.

Em outubro de 2024, outro usuário relatou ter conseguido realizar prompt injection, fazendo o agente responder a perguntas fora de sua finalidade original.


Reddit
O relato de prompt injection não é uma vulnerabilidade atual confirmada. É uma observação histórica de um usuário, sem reprodução independente.

Entretanto, reforça uma decisão arquitetural da VAP: o prompt da Millis não pode ser considerado uma fronteira de segurança ou autorização. Mesmo que o agente receba instruções para não realizar determinada operação, o backend precisa impedir essa operação independentemente do comportamento do LLM.

5.2. Discussões comparando Millis, Vapi e Bland
Data: 18 de julho de 2024, com comentários posteriores.
Consultar discussão no Reddit

Encontrei opiniões divergentes sobre a maturidade técnica da Millis em comparação com outros provedores. Alguns desenvolvedores preferiram plataformas com APIs mais completas; outros discordaram dessa avaliação.


which voice ai you are using?
Não encontrei código, logs ou configurações de integração nessa discussão. Ela serve como contexto sobre a experiência dos desenvolvedores, não como evidência de funcionamento.

Também encontrei uma discussão de julho de 2025 na qual um usuário selecionou a Millis e a Vapi como possíveis soluções comerciais e demonstrou interesse em conversar com a equipe da Millis. 

Reddit

5.3. Make Community
Título: Integrating D-ID and Millis AI
Data: 10 de janeiro de 2025
Consultar discussão

Um usuário tentou descobrir como integrar um avatar D-ID com o motor conversacional e a voz da Millis.

A discussão pública acessível contém a solicitação, mas não uma solução técnica implementada. 

Make Community

5.4. Resultado geral da pesquisa comunitária
A quantidade de conteúdo público tecnicamente detalhado sobre a Millis é limitada.

Fonte pesquisada

Resultado

YouTube

Tutoriais independentes relevantes

GitHub

Repositório Jambonz e referências complementares

Reddit

Experiências e opiniões, sem implementação completa

Make Community

Dúvidas de integração

n8n Community

Nenhuma solução completa específica localizada

Conteúdo brasileiro

Tutorial Trilha AI

Conteúdo em espanhol

Nenhum tutorial técnico aprofundado verificável localizado

Issues e pull requests

Nenhuma solução específica para os problemas da VAP localizada

Isso não significa que outras implementações não existam. Parte dos materiais de automação está distribuída em comunidades privadas, cursos e grupos de Discord.

6. Descoberta adicional: código distribuído do SDK da Millis
Esta é, juntamente com o projeto Jambonz, a descoberta técnica mais importante da investigação.

Encontrei o pacote JavaScript da Millis disponibilizado publicamente pelo npm, incluindo suas declarações TypeScript e sua implementação compilada.

@millisai/web-sdk

Versão inspecionada: 1.0.12
Código inspecionado
Declarações TypeScript — index.d.mts

Implementação JavaScript — index.mjs

Embora seja código do próprio fornecedor, não se trata apenas de documentação. É a implementação distribuída aos desenvolvedores que utilizam o SDK.

6.1. Agentes permanentes e agentes temporários
O SDK aceita duas formas de inicialização:

Um identificador de agente previamente cadastrado.

Um objeto contendo a configuração de um agente temporário.

A assinatura TypeScript encontrada é:

start(
  idOrConfig: AgentConfig | string,
  metadata?: object,
  includeMetadataInPrompt?: boolean
): Promise<void>

A implementação diferencia esses dois tipos e constrói a mensagem de inicialização do WebSocket de acordo com o argumento recebido. 

UNPKG
+1

Característica

Permanente

Temporário

Inicialização

agent_id

agent_config

Configuração

Persistida na Millis

Enviada na abertura da sessão

Personalização individual

Metadados

Configuração dinâmica

Complexidade operacional

Menor

Maior

Adequação inicial à VAP

Alta

Depende dos requisitos

Minha recomendação: utilizar agentes permanentes por configuração de empresa ou agente lógico da VAP, com personalização por sessão. Não criar e excluir agentes persistentes a cada ligação.

Agentes temporários podem ser úteis futuramente, principalmente se precisarmos de cabeçalhos de autenticação exclusivos por sessão ou configurações dinâmicas mais avançadas.

6.2. Transcrições finais e parciais
Encontrei uma informação particularmente importante nas declarações TypeScript:

interface TranscriptPayload {
  is_final?: boolean;
}

Esse campo aparece tanto na interface do evento ontranscript quanto no evento onresponsetext. 

UNPKG

Isso indica que o SDK prevê a diferenciação entre texto parcial e final.

Porém, o campo é opcional. Ainda não temos confirmação independente de que:

Ele sempre seja enviado.

Seja enviado da mesma maneira em chamadas telefônicas.

Represente uma unidade conversacional completa.

Possua um identificador de turno.

Permita identificar inequivocamente a pergunta que o interlocutor está respondendo.

Essa distinção é especialmente importante para a E2: uma transcrição final não deve ser confundida automaticamente com uma autorização de agendamento.

6.3. Comandos e eventos adicionais encontrados
Evento ou mecanismo

Comportamento no SDK

start_answering

Altera o estado do agente para preparação da resposta

clear

Limpa os buffers locais de áudio

pause

Suspende a reprodução

unpause

Retoma a reprodução

pong

Permite calcular latência

Áudio binário recebido

Enviado para reprodução

onagentstate

Notifica mudanças no estado local

playback_finished

Evento interno do sistema de reprodução


UNPKG
Os estados locais do SDK são:


Atenção: onagentstate e playback_finished são mecanismos implementados localmente no SDK. Não devemos presumir que sejam eventos enviados pelo servidor da Millis.

6.4. Formato de áudio: a principal dificuldade do proxy nativo
O SDK utiliza áudio PCM de 16 bits em 16 kHz. A Twilio Media Streams utiliza áudio μ-law de 8 kHz, codificado em Base64 nas mensagens JSON. 

UNPKG
+2

Característica

Twilio

Millis nativa

Frequência

8.000 Hz

16.000 Hz

Codificação

G.711 μ-law

PCM de 16 bits

Canais

Mono

Mono

Transporte de áudio

JSON + Base64

Binário

Consequentemente, um proxy que conecte a Twilio diretamente ao endpoint nativo /millis precisará converter o áudio nos dois sentidos.

Twilio — μ-law 8 kHz

Adaptador de áudio VAP

Base64 · codificação · decodificação · resampling
Millis — PCM 16 kHz

Isso não significa reconstruir o motor conversacional. Significa implementar uma camada de transporte de áudio. Ainda assim, adiciona processamento, infraestrutura, possibilidades de falhas e latência.

7. Outro projeto relevante — Hotato
attenlabs/hotato

Ferramenta open source de análise e testes de regressão de agentes telefônicos
Repositório GitHub
Referência de integrações

Este projeto não é um agente telefônico. É uma ferramenta de investigação de falhas conversacionais que declara possuir um adaptador para a Millis.

O aspecto mais interessante é que seus autores tratam explicitamente de um problema semelhante ao que estamos enfrentando na VAP: o interlocutor interrompe para cancelar uma operação, o agente afirma que cancelou, mas a ferramenta de agendamento é executada mesmo assim.

O projeto propõe correlacionar registros temporais do áudio com eventos de execução das ferramentas e transformar falhas identificadas em testes de regressão. 

GitHub

O que podemos aproveitar
Análise de divergência entre aquilo que o agente afirma e aquilo que o backend executa.

Investigação de interrupções.

Identificação de atrasos e silêncios.

Testes de regressão associados a conversações.

Correlação entre eventos de áudio e rastreamento de operações.

Análise offline de gravações existentes.

O adaptador também identifica o campo recording.recording_url no endpoint de histórico de chamadas da Millis. Os autores apontam a ausência de uma opção documentada de gravação separada por interlocutor. 

Hotato

Limitação: examinei o README e a descrição técnica das integrações, mas não auditei integralmente o código do adaptador. Não executei o programa.

Eu utilizaria esse projeto como referência para a estratégia de QA e auditoria da VAP, não como dependência obrigatória do sistema de produção.

8. As três arquiteturas possíveis para a VAP
Após analisar as implementações públicas e o SDK, identifiquei três arquiteturas que merecem consideração. Todas preservam o motor conversacional da Millis.

Alternativa A — Integração direta atual
Menor complexidade operacional

Vantagens: já funcionou em uma chamada para um número brasileiro, não exige conversão de áudio, possui menos infraestrutura e mantém a telefonia sob controle da Twilio.

Problema: a VAP pode ficar dependente dos webhooks da Millis e não receber os eventos conversacionais necessários durante a chamada.

É a arquitetura que devemos preservar como referência funcional.

Alternativa B — Proxy transparente do protocolo Twilio
Complexidade intermediária

Nessa arquitetura, o proxy encaminharia as mensagens da Twilio para o endpoint atual da Millis.

A VAP poderia observar:

CallSid e StreamSid.

Pacotes de áudio.

Eventos mark, clear, start e stop.

Abertura e encerramento das conexões.

Metadados do Media Stream.

Limitação importante: isso não garante acesso às transcrições ou aos eventos internos da Millis. O endpoint específico da Twilio pode expor somente mensagens compatíveis com o protocolo telefônico.

Também não encontrei uma implementação pública completa comprovando que a Millis aceita esse intermediário sem restrições.

Portanto, essa arquitetura é uma hipótese técnica, não uma integração validada.

Alternativa C — Proxy nativo Millis
Maior observabilidade conversacional

É a arquitetura inspirada na implementação da Jambonz.

O gateway seria responsável pelo transporte de áudio, observação dos eventos e correlação das sessões. A Millis continuaria responsável pelo reconhecimento de voz, raciocínio, seleção de ferramentas e síntese de áudio.

É a alternativa mais promissora caso a integração direta não consiga satisfazer os requisitos de observabilidade da E2.

Comparação consolidada
Critério

Direta

Proxy transparente

Proxy nativo

Preserva LLM Millis

Sim

Sim

Sim

Conversão de áudio

Não

Não

Sim

Complexidade

Baixa

Média

Alta

Controle sobre transporte

Baixo

Alto

Alto

Transcrição em tempo real

Não verificada

Não verificada

Interface encontrada

Agentes temporários

Não verificado nessa rota

Não verificado

Suporte no SDK

Metadados dinâmicos

Depende da integração

Depende da integração

Suporte no SDK

Controle de interrupções

Delegado à Millis

Parcialmente observável

Eventos disponíveis

Evidência prática

Chamada da VAP

Hipótese

Jambonz + SDK

Recomendação

Manter

Investigar

Prototipar se necessário

9. Ferramentas externas e webhooks
Os tutoriais independentes seguem, em geral, uma arquitetura em que a Millis invoca sistemas externos para consultar informações ou realizar operações.

Não encontrei motivo técnico para substituir o LLM da Millis por outro apenas para implementar ferramentas.

Na VAP, recomendo que as ferramentas sejam divididas em três categorias.

Categoria

Exemplos

Risco

Consulta

Buscar informações na KB, consultar disponibilidade

Menor

Preparação

Selecionar horário, preparar agendamento, coletar dados

Intermediário

Mutação

Confirmar reserva, alterar CRM, cancelar compromisso

Maior

A Millis interpreta a linguagem natural e solicita a ferramenta. A VAP determina se a operação é autorizada.

9.1. Contrato de retorno recomendado
Exemplo conceitual de uma resposta de ferramenta da VAP:

{
  "status": "requires_confirmation",
  "committed": false,
  "operation_id": "operation_123",
  "data": {
    "date": "2026-12-01",
    "time": "14:00"
  },
  "message": "O horário está disponível. Solicite a confirmação."
}

Após a confirmação e a execução transacional:

{
  "status": "success",
  "committed": true,
  "operation_id": "operation_123",
  "appointment_id": "appointment_456",
  "message": "Agendamento confirmado."
}

Esses são exemplos de contrato proposto para a VAP, não campos nativos confirmados da Millis.

A VAP não deve confiar que a Millis interpretará corretamente todos os campos apenas porque recebeu um JSON estruturado.

9.2. CRM e base de conhecimento externa
Não encontrei uma implementação independente com código público que integre a Millis a uma base de conhecimento PostgreSQL multiempresa com isolamento equivalente ao exigido pela VAP.

Porém, o mecanismo de ferramentas externas permite propor uma arquitetura simples:

Ferramenta

Responsabilidade da VAP

search_knowledge

Consultar informações autorizadas da empresa

get_customer

Consultar o CRM

list_services

Identificar serviços disponíveis

get_availability

Consultar horários

prepare_appointment

Preparar uma reserva

confirm_appointment

Efetivar operação autorizada

register_opt_out

Bloquear contatos futuros

Esses nomes são ilustrativos. O protocolo existente da VAP deve prevalecer sobre a nomenclatura proposta aqui.

10. Investigação de response_mode: strict e execute_after_message
Esses são dois dos pontos mais sensíveis desta investigação.

10.1. execute_after_message
Encontrei esse parâmetro nos exemplos de configuração e no esquema da API Register Call da Millis.

{
  "messages": [
    "Vou verificar essa informação."
  ],
  "execute_after_message": true
}

O campo está presente na documentação pública. 

Millis AI
+1

Entretanto, não encontrei código independente ou demonstração verificável que esclareça:

Se a ferramenta começa somente depois da reprodução completa da mensagem.

Se começa após a geração do texto.

Se aguarda a síntese completa do áudio.

Se é cancelada quando o interlocutor interrompe.

Se uma mensagem interrompida pode disparar a ferramenta mesmo assim.

Se existem diferenças entre ferramentas de consulta e mutação.

Conclusão: não utilizar execute_after_message como mecanismo de autorização ou garantia transacional.

Ele pode controlar o comportamento conversacional, mas a semântica exata permanece sem validação.

10.2. response_mode: strict
Pesquisei especificamente pelas combinações:

"millis.ai" "response_mode"
"millis.ai" "response_mode" "strict"
"millis.ai" "execute_after_message"
Também examinei as interfaces do SDK e os esquemas públicos de configuração de agentes.

Não encontrei implementação independente verificável de response_mode: strict, nem esse campo nos exemplos públicos de Agent Config que consegui consultar. 

Millis AI

Isso não prova que a funcionalidade seja inexistente. Pode estar disponível em uma versão diferente, em uma configuração não indexada ou em um contrato específico da plataforma.

Questão

Resultado

Existência de execute_after_message

Confirmada no esquema

Semântica em caso de interrupção

Não confirmada

Existência pública de response_mode: strict

Não confirmada

Garantia de resposta verbal literal

Não confirmada

Bloqueio de respostas inventadas

Não confirmado

Cancelamento automático de ferramentas

Não confirmado

10.3. O problema fundamental do controle de respostas
Considere este cenário:

Quero agendar para terça-feira às 14h.
Vou verificar a disponibilidade.
Retorno da ferramenta VAP
Horário indisponível — nenhuma reserva criada.

Seu agendamento está confirmado!
Falha de integridade conversacional

Mesmo que o banco de dados esteja protegido, o agente ainda pode comunicar uma informação incorreta.

Existem duas garantias diferentes:

Integridade transacional: a VAP impede que uma operação não autorizada seja registrada.

Integridade conversacional: o agente não afirma verbalmente que uma operação ocorreu quando ela não ocorreu.

A primeira pode ser garantida pelo backend da VAP. A segunda depende das capacidades reais de controle de resposta oferecidas pela Millis.

O proxy nativo melhora a observabilidade, mas não comprova que conseguimos impedir antecipadamente a síntese de uma frase incorreta. Essa capacidade precisa ser investigada separadamente.

11. Agentes permanentes, sessões e autenticação
11.1. Register Call
Como verificação complementar, encontrei o endpoint:

POST https://api-west.millis.ai/register_call
Seu contrato público aceita informações como agent_id, agent_config, metadados e números telefônicos. A resposta contém dois identificadores:

{
  "call_id": "...",
  "session_id": "..."
}


Millis AI
Essa API pode ser relevante para a VAP porque permite investigar uma associação antecipada entre uma operação interna e uma sessão da Millis.

Contudo, não encontrei uma implementação independente que mostre exatamente como conectar essa sessão previamente registrada ao endpoint /twilio_inbound que vocês utilizam.

Não recomendaria alterar a integração atual supondo que os identificadores sejam intercambiáveis.

11.2. Modelo de identificação recomendado
Identificador

Autoridade

tenant_id

VAP

vap_session_id

VAP

agent_id interno

VAP

lead_id

VAP

twilio_call_sid

Twilio

twilio_stream_sid

Twilio

millis_session_id

Millis

millis_call_id

Millis

millis_agent_id

Millis

Cada sessão precisa possuir uma associação confiável e persistente entre esses identificadores.

O session_id da Millis identifica uma sessão, mas não deve ser considerado, por si só, uma credencial de autenticação.

11.3. Metadados dinâmicos
O SDK comprova que os metadados podem ser enviados na inicialização de uma sessão nativa.

{
  "metadata": {
    "reference": "opaque-session-reference",
    "customer_name": "Cliente"
  },
  "include_metadata_in_prompt": false
}

O exemplo acima é uma proposta de utilização.

Não recomendo incluir credenciais, tokens privilegiados ou informações sensíveis desnecessárias nos metadados conversacionais. O vínculo entre empresa, cliente e sessão precisa permanecer no backend.

12. Segurança multiempresa — referência complementar
Encontrei outro repositório público que não utiliza especificamente a Millis, mas trata diretamente da segurança do transporte WebSocket da Twilio.

bbTwilio/twilio-websocket-security

A implementação de referência aborda validação de assinatura da Twilio, tokens de curta duração, proteção contra reutilização e associação com o CallSid.

O README relata testes automatizados, mas informa que não foi realizado um teste telefônico completo em produção. 

GitHub

Também encontrei o repositório fastify-twilio, voltado à validação de webhooks e handshakes WebSocket da Twilio. 

GitHub

Esses projetos merecem investigação caso seja necessário desenvolver o Media Gateway da VAP.

Fluxo de autorização recomendado
1

Receber requisição

Webhook da Millis ou conexão da Twilio
2

Autenticar origem

Validar assinatura ou credencial aplicável
3

Resolver sessão

Consultar associação persistida no backend
4

Derivar empresa e permissões

Nunca aceitar autoridade informada pelo LLM
5

Validar estado conversacional

Confirmação, turno, interrupções e validade
6

Executar transação

Idempotência, concorrência e isolamento
7

Registrar resultado

Auditoria e resposta à Millis
Para um SaaS multiempresa, eu manteria estas regras obrigatórias:

Nenhuma autoridade derivada de argumentos gerados pelo LLM.

Nenhuma consulta ao CRM sem escopo de empresa.

Nenhuma mutação sem sessão autenticada e estado válido.

Nenhum agendamento duplicado por reenvio de webhook.

Nenhuma chave privada da Millis exposta ao frontend.

Nenhum processamento financeiro baseado exclusivamente no relato do agente.

Nenhum novo contato de campanha após opt-out confirmado.

Essas são recomendações arquiteturais, não funcionalidades demonstradas pelos tutoriais encontrados.

13. Transcrições e processamento pós-chamada
A combinação do SDK com a implementação da Jambonz indica que existe uma interface para receber textos em tempo real.

Já o webhook pós-chamada da Millis documenta o fornecimento de informações como histórico da conversa, ferramentas invocadas, duração, identificadores de sessão, custos, gravação e motivo de encerramento. 

Millis AI

Informação

Durante a sessão

Após a sessão

Texto do cliente

WebSocket nativo

Histórico

Texto do agente

WebSocket nativo

Histórico

Interrupções

Eventos de transporte

Reconstrução parcial

Ferramentas executadas

Backend VAP

Relatório da Millis

Duração

Controle próprio

Webhooks dos fornecedores

Gravação

Depende da configuração

URL da gravação

Custos

Estimativa

Reconciliação

A recomendação é separar três tipos de registro:

Eventos observados: tudo o que foi recebido dos fornecedores.

Estado oficial da operação: aquilo que a VAP autorizou e executou.

Relatório conversacional: resumo, transcrição e avaliação da chamada.

O relatório pós-chamada não deve ser usado para autorizar retroativamente uma operação que precisava de autorização durante a conversa.

14. Encerramentos, interrupções e opt-out
Não encontrei uma implementação independente completa que resolva esses três mecanismos de forma transacional na Millis.

A configuração pública inclui opções de interrupção, encerramento pelo agente e detecção de solicitações para não receber contatos. 

Millis AI

Porém, a VAP deve manter sua própria política de supressão de campanhas.

Por exemplo, quando o cliente diz:

Não tenho interesse. Não me ligue novamente.

O fluxo desejado seria:

Millis identifica intenção de opt-out

VAP autentica a sessão e identifica o contato

VAP registra bloqueio de novos contatos

VAP cancela tarefas pendentes aplicáveis

Agente encerra a conversa

Se a ferramenta falhar, o agente não deve informar que a exclusão foi realizada. Deve existir um mecanismo operacional de recuperação e reconciliação.

Também é necessário impedir que uma campanha previamente enfileirada ignore o bloqueio registrado posteriormente.

15. Matriz consolidada das 12 perguntas da investigação
Requisito

Evidência encontrada

Situação

1. Outbound e inbound

VAP, Jambonz e tutoriais

Parcialmente comprovado

2. Ferramentas externas

SDK e tutoriais

Interface identificada

3. Agendamento

Três tutoriais relevantes

Descrito, não reproduzido

4. CRM e KB externa

Tutorial GoHighLevel e webhooks

Parcial

5. Transcrições

Jambonz, SDK e webhook final

Código encontrado

6. Identificação de sessões

Register Call e SDK

Contrato identificado

7. Agentes temporários

Implementação do SDK

Código encontrado

8. Metadados

Implementação do SDK

Código encontrado

9. Interrupções e opt-out

Jambonz e configurações

Parcial

10. Strict e execute_after_message

Esquemas públicos

Semântica não comprovada

11. Controle de respostas

Nenhuma solução completa localizada

Em aberto

12. Multiempresa

Referências genéricas de segurança

Em aberto

Funcionalidades efetivamente comprovadas
A ligação outbound para um número brasileiro foi comprovada pela experiência informada da própria VAP.

O transporte nativo, a inicialização dinâmica, os metadados e o processamento de eventos foram comprovados por leitura de código público, mas não por execução nesta investigação.

Nenhum vídeo teve seu conteúdo audiovisual integralmente verificado. Portanto, não seria correto afirmar que todos os recursos anunciados foram efetivamente demonstrados.

16. As cinco implementações mais relevantes
Estas são as cinco referências que eu priorizaria para investigação e aproveitamento no projeto.

1. Jambonz — Millis AI Audio Socket

Prioridade máxima · Código disponível

Transporte nativo, áudio bidirecional, eventos e interrupções.
Abrir GitHub

2. Millis Web SDK

Prioridade máxima · Código disponível

Inicialização de sessões, agentes temporários, metadados, transcrições e estados conversacionais.
Inspecionar implementação

3. Trilha AI — Millis + Twilio + n8n

Prioridade alta · Mesmo conjunto de fornecedores

Telefonia outbound, automação comercial e ferramentas externas.
Assistir ao tutorial

4. Mani Kanasani — Millis AI Masterclass

Prioridade alta · Maior abrangência funcional

CRM, outbound, agenda e processamento pós-chamada.
Assistir ao tutorial

5. Ibrahim Rana — Millis + n8n + Agenda

Prioridade alta · Agendamento

Disponibilidade, conflitos, fusos horários e validação de parâmetros.
Assistir ao tutorial

Como referências complementares, manteria Hotato para auditoria conversacional, Twilio WebSocket Security para autenticação e twilio/media-streams para a implementação do transporte telefônico.

17. Próximas etapas recomendadas para a VAP
Considerando as decisões DEC-074, DEC-075 e o trabalho de auditoria da E2, não recomendaria iniciar uma refatoração geral do sistema por causa dessas descobertas. Elas devem ser utilizadas para avaliar as capacidades do fornecedor sem enfraquecer as garantias existentes.

1
Investigação estática

Analisar o código Jambonz, o SDK Millis e o protocolo Twilio. Mapear os eventos e comparar com os contratos já existentes na VAP.

Sem chamadas, credenciais ou consumo de créditos.
2
Análise dos contratos existentes

Verificar se a integração direta consegue fornecer os eventos necessários para vincular perguntas, respostas, ferramentas e interrupções.

3
Protótipo isolado do transporte nativo

Caso necessário, criar um adaptador experimental com servidores WebSocket simulados, sem modificar o fluxo de produção.

4
Testes de regressão e segurança

Simular interrupções, eventos fora de ordem, falhas de autenticação, chamadas concorrentes e webhooks duplicados.

5
Validação futura com o fornecedor

Somente mediante autorização, realizar testes controlados para confirmar as garantias que não puderam ser verificadas estaticamente.

Checklist de validação técnica
Validação pendente
0 de 18

Transcrição parcial e final

Identificação inequívoca do turno do cliente

Identificação do início da fala do cliente

Identificação da pergunta efetivamente reproduzida

Interrupção antes da execução de uma ferramenta

Interrupção durante a execução de uma ferramenta

Comportamento de execute_after_message

Comportamento de response_mode: strict

Retorno de ferramenta com erro

Retorno de ferramenta com timeout

Webhook duplicado

Duas sessões concorrentes da mesma empresa

Duas sessões concorrentes de empresas diferentes

Tentativa de acesso ao CRM de outra empresa

Opt-out com campanhas pendentes

Encerramento inesperado do WebSocket

Reconciliação financeira Twilio e Millis

Correlação entre CallSid e millis_session_id
Os testes simulados podem verificar o comportamento da VAP, mas não substituem a validação do comportamento real da Millis.

18. Prompt para o Antigravity ou Codex investigar as descobertas
Eu encaminharia o seguinte prompt à IA que possui acesso ao repositório da VAP. O objetivo é aproveitar os resultados desta pesquisa sem autorizar alterações prematuras.

VAP — INVESTIGAÇÃO TÉCNICA DO TRANSPORTE NATIVO MILLIS AI
Atue como arquiteto de software sênior, especialista em telefonia programável, sistemas distribuídos, segurança multi-tenant, WebSockets e agentes conversacionais.

Realize uma investigação técnica independente, inicialmente em modo READ-ONLY.

Contexto
A VAP utiliza TypeScript, Node.js, Next.js e PostgreSQL.

A Millis AI deve permanecer responsável pelo STT, LLM, raciocínio conversacional, seleção de ferramentas e TTS.

A Twilio deve permanecer responsável pela telefonia.

A VAP deve permanecer como autoridade sobre sessões, autorização, CRM, agenda, campanhas, base de conhecimento, opt-out e financeiro.

Já realizamos uma chamada outbound bem-sucedida para um celular brasileiro utilizando Twilio Calls API, TwiML Connect/Stream e o endpoint:

wss://api-west.millis.ai:8080/twilio_inbound/PUBLIC_KEY/AGENT_ID

Referências obrigatórias
Investigue os seguintes códigos e recursos públicos:

https://github.com/jambonz/millisai-audio-socket

https://raw.githubusercontent.com/jambonz/millisai-audio-socket/main/lib/utils/ws.js

https://app.unpkg.com/@millisai/web-sdk@1.0.12/files/dist/index.mjs

https://app.unpkg.com/@millisai/web-sdk@1.0.12/files/dist/index.d.mts

https://github.com/twilio/media-streams

https://github.com/bbTwilio/twilio-websocket-security

https://github.com/attenlabs/hotato

https://docs.millis.ai/integration/native-apps-with-websocket

https://docs.millis.ai/api-reference/endpoint/call-management/register-call

Objetivos
Comparar a integração direta existente com um proxy transparente Twilio e um proxy nativo Millis.

Investigar o endpoint wss://api-west.millis.ai:8080/millis sem substituir o LLM da Millis.

Identificar o contrato real de inicialização de agentes permanentes e temporários, metadados, autenticação e associação de sessões.

Investigar os eventos onready, ontranscript, onresponsetext, start_answering, clear, pause, unpause, ai_action e onsessionended.

Determinar quais eventos são emitidos pelo servidor e quais são apenas estados derivados localmente pelo SDK.

Investigar a presença e semântica do campo payload.is_final, sem assumir que representa um turno confiável.

Investigar como correlacionar início da fala, transcrição final, geração da pergunta, reprodução e confirmação do interlocutor.

Investigar o comportamento de response_mode: strict e execute_after_message. Não assumir suporte ou garantias sem evidências.

Determinar se existe uma forma de impedir respostas incorretas após o retorno de ferramentas sem substituir o motor conversacional.

Avaliar a conversão entre G.711 μ-law 8 kHz da Twilio e PCM 16-bit 16 kHz da Millis.

Avaliar riscos de latência, perda de áudio, backpressure, interrupções, buffer, encerramentos, reconexões e eventos fora de ordem.

Comparar as descobertas com DEC-074, DEC-075 e docs/architecture/E2_AGENT_SCHEDULING_PROTOCOL.md.

Identificar se os requisitos da E2 podem ser atendidos pela integração atual ou se exigem um novo transporte.

Investigar se o Register Call pode ser associado à rota Twilio existente. Não inventar contratos de integração.

Restrições obrigatórias
Não modificar arquivos de produção.

Não realizar chamadas telefônicas.

Não utilizar credenciais ou consumir créditos.

Não substituir o LLM da Millis.

Não reconstruir STT, TTS ou o motor conversacional.

Não enfraquecer os protocolos de autorização, confirmação, idempotência e isolamento multiempresa.

Não aceitar autoridade derivada de argumentos gerados pelo LLM.

Não reabrir componentes auditados sem evidência concreta.

Diferenciar código observado, documentação, inferências e hipóteses.

Utilizar os MCPs disponíveis, especialmente Context7, Fetch, GitHub e Supabase quando aplicável. Utilizar shadcn UI quando houver necessidade de interface.

Nenhum arquivo de lógica poderá ultrapassar 200 linhas de código. Outros arquivos não poderão ultrapassar 500 linhas, exceto arquivos de auditoria.

Entrega
Produzir um relatório técnico contendo:

Evidências com URL, arquivo, linha e trecho relevante.

Comparação das três arquiteturas.

Matriz de capacidades reais da Millis.

Lacunas do contrato do fornecedor.

Impacto sobre a E2 e as próximas etapas da VAP.

Riscos de segurança e integridade transacional.

Proposta de testes exclusivamente offline com mocks e fixtures sintéticas.

Recomendação arquitetural fundamentada.

Não implementar nenhuma mudança antes de apresentar o relatório e obter aprovação explícita.

19. Parecer técnico final
Esta investigação não revelou uma plataforma SaaS completa de terceiros, baseada em Millis e Twilio, que possua todas as garantias exigidas pela VAP.

Mas revelou algo importante: existe um caminho técnico para obter maior controle sobre o transporte e os eventos conversacionais sem necessariamente substituir o LLM da Millis.

O código da Jambonz, combinado com a implementação distribuída do SDK, fornece uma base concreta para investigar esse caminho.

Minha decisão recomendada seria:

Decisão

Recomendação

Abandonar a Millis agora

Não

Substituir seu LLM

Não

Recriar o motor conversacional

Não

Preservar a chamada direta funcional

Sim

Investigar o WebSocket nativo

Sim

Prototipar um Media Gateway isolado

Se necessário

Refatorar toda a VAP

Não

Reduzir as garantias da E2

Não

Depender exclusivamente do suporte da Millis

Não

Liberar produção sem validar os contratos críticos

Não

Principal limitação da pesquisa: ainda não foi possível confirmar se a Millis fornece eventos suficientemente precisos para estabelecer uma relação confiável entre a pergunta efetivamente reproduzida, a resposta do interlocutor e a autorização de uma ferramenta. Também não foi possível comprovar as garantias de response_mode: strict ou o comportamento de execute_after_message diante de interrupções.

É justamente nessa lacuna que eu concentraria a próxima investigação técnica do Antigravity ou Codex, antes de modificar qualquer componente já auditado da VAP.



 

⋮⋮⋮⋮