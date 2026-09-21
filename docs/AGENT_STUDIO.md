# Agent Studio — Conceito, Componentes e Versionamento (AGENT_STUDIO.md)

> **Status**: Requisito Arquitetural Formal — Documentação Conceitual
> **Fase de Implementação**: FASE 5 (Domínios base) e FASE 6 (Motor de Voz) e posteriores
> **Data de Incorporação**: 21 de Setembro de 2026

Este documento formaliza o conceito de **Agent Studio** como requisito fundamental de produto da plataforma, definindo os componentes configuráveis de um agente de voz, o modelo de versionamento e os requisitos para avaliação e feedback supervisionado.

> [!IMPORTANT]
> Este documento é conceitual e arquitetural. Nenhum schema de banco, código ou interface deve ser implementado com base neste documento até aprovação explícita das fases correspondentes do roadmap.

---

## 1. Visão do Agent Studio

O **Agent Studio** é o ambiente de configuração e evolução de agentes de voz disponibilizado às empresas clientes da plataforma. Seu princípio central é:

> **Empresas devem poder criar, configurar, testar, publicar e evoluir seus agentes de voz sem editar código.**

O Agent Studio não se baseia em fine-tuning obrigatório de modelos de linguagem. A configuração do agente é realizada por composição de componentes declarativos e dados estruturados.

---

## 2. Componentes Configuráveis de um Agente

Um agente de voz é modelado como a composição dos seguintes componentes independentes:

### 2.1. Identidade e Persona
- **Nome do Agente**: Nome pelo qual o agente se apresenta ao interlocutor.
- **Função / Papel**: Ex.: Consultor de vendas, Agente de cobrança, Atendente de suporte.
- **Objetivos**: O que o agente deve alcançar ao final de cada chamada.

### 2.2. Personalidade e Estilo Conversacional
- **Personalidade**: Traços de comportamento do agente (ex.: empático, direto, formal, descontraído).
- **Tom de Voz**: Tom emocional predominante da conversa (ex.: calmo, entusiasta, profissional).
- **Estilo de Fala**: Vocabulário preferencial, nível de formalidade, uso de pausas e marcadores conversacionais.

### 2.3. Instruções e Regras
- **Instruções Gerais**: Diretrizes de comportamento conversacional.
- **Regras**: Restrições operacionais a seguir (ex.: nunca prometer prazo que não tenha confirmação determinística).
- **Limites**: O que o agente não pode fazer ou prometer.
- **Comportamento Proibido**: Lista explícita de ações vedadas ao agente.

### 2.4. Ferramentas Autorizadas (Toolset)
- Conjunto de ferramentas determinísticas que o agente pode invocar durante a chamada.
- Exemplos: `checkProductPrice`, `checkAvailability`, `scheduleAppointment`, `lookupCustomer`.
- Cada ferramenta tem escopo restrito ao `organizationId` do tenant.
- O agente só pode invocar ferramentas explicitamente habilitadas em sua configuração publicada.

### 2.5. Dados de Negócio e Catálogo
- **Produtos e Serviços**: Referência ao catálogo determinístico consultável via tool calling.
- **Regras Comerciais**: Políticas de desconto, condições especiais e limites.

### 2.6. Base de Conhecimento (Knowledge Base)

A base de conhecimento do agente é separada conceitualmente em duas camadas:

#### Dados Estruturados (Consulta Determinística)
Informações que devem ser consultadas por código determinístico, nunca dependendo de RAG para precisão:
- Produtos, preços e especificações;
- Estoque e disponibilidade;
- Clientes e histórico de relacionamento;
- Regras comerciais e políticas de desconto;
- Agendamentos e disponibilidade de calendário.

> [!IMPORTANT]
> Dados determinísticos **nunca** devem depender exclusivamente de RAG (Retrieval-Augmented Generation). Eles são acessados via tool calling com código testável.

#### Conhecimento Não Estruturado (Referência Contextual)
Documentos que o agente pode consultar como contexto conversacional:
- PDFs de manuais e catálogos;
- FAQs e políticas internas;
- Documentação de produtos e serviços;
- Scripts e roteiros de vendas;
- Perguntas e respostas frequentes.

### 2.7. Playbooks e Fluxos Conversacionais
- **Playbooks**: Roteiros estruturados para situações específicas (abertura da chamada, tratamento de objeções, encerramento).
- **Objeções**: Respostas pré-configuradas para objeções comerciais comuns.
- **Exemplos de Conversa**: Exemplos de diálogos ideais para calibração de tom e abordagem.

### 2.8. Voz e Síntese
- **VoiceConfig**: Configuração de voz sintética (timbre, velocidade, idioma, sotaque).
- Selecionável a partir de catálogo de vozes do provider configurado (Pending Decision).

### 2.9. Transferência para Humano (Human Handoff)
- Condições configuráveis que disparam transferência para operador humano.
- Resumo de contexto a ser disponibilizado ao operador no momento da transferência.
- Consulte a seção 6 deste documento para o requisito completo de Human Handoff.

### 2.10. Configurações de Atendimento
- Horários de operação permitidos;
- Número máximo de tentativas por contato;
- Tempo máximo de chamada;
- Comportamento em caso de não atendimento ou caixa postal.

### 2.11. Avaliações, Testes e Métricas
- Cenários de avaliação vinculados ao agente;
- Métricas de performance (taxa de sucesso de objetivo, tempo médio de chamada, taxa de transferência).

### 2.12. Versões
- Histórico completo de versões publicadas com data, autor e diff conceitual.
- Capacidade de comparar versões lado a lado.

---

## 3. Versionamento de Agentes

### 3.1. Ciclo de Vida de uma Versão

```
DRAFT ──► TEST ──► PUBLISHED ──► ARCHIVED
  │                    │
  │◄── revisão ────────┘
```

- **DRAFT**: Versão em edição. Não afeta chamadas em produção.
- **TEST**: Versão em avaliação controlada. Usada em Agent Evals e testes manuais.
- **PUBLISHED**: Versão ativa em produção. Apenas uma versão pode estar publicada por vez por agente.
- **ARCHIVED**: Versão histórica. Preservada para auditoria, comparação e rollback.

**Princípio crítico**: Alterar a configuração de um agente **não altera imediatamente** o comportamento em produção. Uma nova versão deve ser criada, testada e publicada explicitamente.

### 3.2. Componentes Versionados Independentemente

Os seguintes componentes possuem histórico de versão rastreável:

| Componente | Propósito do Versionamento |
|:---|:---|
| **AgentConfig** | Configurações gerais e de atendimento |
| **Instructions** | Instruções, regras e limites de comportamento |
| **Prompt** | System prompt e template do diálogo |
| **Playbook** | Roteiros de abordagem e tratamento de objeções |
| **Knowledge Base** | Documentos de referência e FAQs |
| **Toolset** | Ferramentas autorizadas e seus parâmetros |
| **VoiceConfig** | Configuração de voz sintética e idioma |

### 3.3. Rastreabilidade por Chamada

Cada chamada realizada deve futuramente registrar as versões efetivamente utilizadas:
- `agentConfigVersion`, `instructionsVersion`, `promptVersion`, `playbookVersion`, `knowledgeBaseVersion`, `toolsetVersion`, `voiceConfigVersion`.

Isso permitirá:
- **Reprodução**: Reproduzir exatamente uma chamada passada com a configuração que estava ativa.
- **Auditoria**: Verificar qual versão do agente realizou cada interação.
- **Comparação**: Comparar o desempenho de diferentes versões em condições equivalentes.
- **Rollback**: Reverter rapidamente para versão anterior aprovada.
- **Avaliações Históricas**: Executar evals sobre versões anteriores.

---

## 4. Agent Evals (Avaliações de Agente)

### 4.1. Propósito

O subsistema de avaliações permite que, antes de publicar uma nova versão de agente em produção, sejam executados cenários de teste controlados e comparações entre versões.

### 4.2. Cenários de Avaliação (Exemplos)

Os cenários de avaliação cobrem situações que o agente deve saber lidar:

| Cenário | Comportamento Esperado |
|:---|:---|
| Cliente solicita preço de produto | Invocar tool determinística; não inventar preço |
| Produto inexistente | Comunicar ausência; não alucinar produto |
| Tool indisponível (timeout/erro) | Tratar erro graciosamente; não travar |
| Cliente interrompe (barge-in) | Parar imediatamente; ouvir e responder |
| Cliente solicita falar com humano | Identificar intenção; iniciar handoff com contexto |
| Tentativa de obter desconto proibido | Recusar com elegância; não ceder fora da política |
| Informação desconhecida | Admitir desconhecimento; não alucinar |
| Objeção comercial | Aplicar playbook de objeções configurado |
| Silêncio prolongado | Tratar conforme política de silêncio configurada |
| Encerramento da ligação | Encerrar de forma educada; registrar desfecho |

### 4.3. Comparação entre Versões

As avaliações devem permitir:
- Executar o mesmo conjunto de cenários em duas ou mais versões do agente.
- Comparar resultados quantitativos (taxa de acerto, tempo de resposta, taxa de handoff).
- Gerar relatório de diferenças para suportar decisão de publicação.

### 4.4. Requisito de Isolamento

- Avaliações nunca chamam provedores de telefonia pagos reais.
- Avaliações usam fakes de áudio e simuladores de conversação.
- O framework de eval será definido futuramente (Status: Pending Decision).

---

## 5. Feedback Supervisionado

O sistema deve prever futuramente um fluxo de melhoria contínua de agentes baseado em feedback humano:

```
Chamada encerrada
       │
       ▼
Supervisor revisa transcrição + áudio
       │
       ├── Feedback positivo: marca como exemplo positivo
       ├── Feedback negativo: identifica falha
       │       │
       │       ▼
       │   Sugestão de melhoria (resposta esperada)
       │       │
       │       ▼
       │   Revisão humana da sugestão
       │       │
       │       ▼
       │   Geração de nova versão DRAFT
       │       │
       │       ▼
       │   Testes (Agent Evals)
       │       │
       │       ▼
       │   Publicação aprovada pelo humano
       │
       └── Ciclo continua
```

> [!CAUTION]
> **Regra inviolável**: Nenhuma avaliação negativa ou feedback automático pode alterar diretamente um agente em produção (PUBLISHED) sem revisão humana e publicação de nova versão.

---

## 6. Human Handoff (Transferência para Humano)

A transferência para operador humano é uma capacidade fundamental do produto, não um caso de exceção.

### 6.1. Requisito Conceitual

O agente de voz deve ser capaz de:
1. **Identificar a necessidade de transferência**: Seja por solicitação explícita do cliente, por limite de competência do agente, por regra de negócio ou por falha técnica.
2. **Comunicar a transição**: Informar o cliente de forma natural que será transferido.
3. **Preservar o contexto**: Gerar resumo estruturado da conversa até o ponto de transferência.
4. **Executar a transferência**: Acionar o mecanismo de transferência de chamada via `TelephonyProvider`.
5. **Disponibilizar resumo ao operador**: O operador humano recebe, antes de atender, um briefing com o contexto da conversa.

### 6.2. Condições de Transferência Configuráveis
- Solicitação explícita do cliente ("quero falar com uma pessoa");
- Tópico fora do escopo do agente;
- Número máximo de tentativas frustradas;
- Escalada por regra de negócio (ex.: reclamação formal);
- Falha técnica persistente (tool unavailable).

### 6.3. Status de Implementação
**Status: Requisito Documentado — Não implementado.**
A implementação ocorrerá nas fases de Motor de Voz (FASE 6) e Telefonia Real (FASE 8) do roadmap.

---

## 7. Decisões Pendentes Relacionadas ao Agent Studio

| Tópico | Status |
|:---|:---|
| Framework de Agent Evals | **Pending Decision** |
| Estratégia de RAG para Knowledge Base não estruturada | **Pending Decision** |
| Formato de armazenamento de versões de agentes | **Pending Decision** (definir na fase de persistência) |
| Provider de síntese de voz (VoiceConfig) | **Pending Decision** |
| Interface do Agent Studio no dashboard | **Pending Decision** (definir na fase de Design System) |
