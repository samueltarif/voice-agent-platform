# Visão do Produto (PROJECT_VISION.md)

Este documento define a visão estratégica, os pilares de proposta de valor e o escopo de funcionalidades da plataforma SaaS B2B de agentes de voz com inteligência artificial.

---

## 1. Declaração de Visão

Oferecer às empresas uma plataforma robusta, segura e programável que permita criar, calibrar e escalar **agentes de voz com inteligência artificial**, capazes de realizar interações telefônicas ativas (e futuramente receptivas) indistinguíveis de uma conversa humana, com resposta instantânea, empatia e absoluta precisão operacional.

---

## 2. Problema de Negócio

Empresas B2B enfrentam desafios críticos em operações de contato por voz:
- **Altos Custos Operacionais**: Manter operações de call center ou equipes de SDR/pré-vendas ativas possui alto custo de escala e elevado turnover.
- **Inconsistência de Atendimento**: Variação na qualidade de abordagem, erros de preenchimento de CRM e desvios de conformidade regulatória.
- **URA e Robôs Tradicionais Ineficazes**: Árvores de decisão rígidas e robôs engessados geram frustração imediata no cliente e altas taxas de desligamento.
- **Falta de Integração e Precisão**: Robôs conversacionais genéricos frequentemente alucinam dados de preços, disponibilidades e condições comerciais.

---

## 3. Pilares da Solução

1. **Conversação com Hiper-Realismo e Baixa Latência**:
   - Objetivo de engenharia inicial de turno ponta a ponta abaixo de 800ms (meta a ser validada experimentalmente);
   - Suporte a interrupção natural do usuário (*barge-in*), cessando a fala da IA no momento exato em que o interlocutor fala;
   - Prosódia, respiração e ritmo adaptados ao contexto emocional da ligação.
2. **Execução Determinística e Confiabilidade de Domínio**:
   - A IA orquestra a conversação, mas regras de precificação, verificação de estoque, validação de regras fiscais e confirmação de agendamentos são executadas por código determinístico.
   - Zero tolerância para alucinações comerciais.
3. **Multi-Tenancy e Isolamento Rigoroso**:
   - Cada empresa cliente possui seus próprios agentes, base de contatos, catálogo de produtos, histórico de chamadas, credenciais e integrações isoladas de forma inviolável.
4. **Operação e Gestão Mobile-First**:
   - Gestores e operadores podem monitorar campanhas, ouvir gravações, ajustar parâmetros de agentes e auditar custos em tempo real pelo celular ou desktop com a mesma fluidez.

---

## 4. Escopo do Dashboard B2B

O dashboard administrativo centraliza os seguintes módulos:

| Módulo | Responsabilidade |
| :--- | :--- |
| **Organizações** | Gestão de dados cadastrais da empresa, planos contratados, limites de concorrência e faturamento. |
| **Usuários & Acesso** | Controle de membros da equipe, papéis e permissões (RBAC: Admin, Gerente, Operador, Auditor). |
| **Agent Studio** | Criação e configuração visual de agentes de voz sem editar código: identidade, personalidade, instruções, ferramentas, Knowledge Base, playbooks, voz e versionamento (DRAFT → TEST → PUBLISHED → ARCHIVED). |
| **Clientes / Contatos** | Cadastro e importação de listas de contatos com campos customizados, tags e status de relacionamento. |
| **Produtos & Serviços** | Catálogo com preços, especificações e regras de desconto consultáveis via tool calling determinístico. |
| **Campanhas Ativas** | Configuração e disparo de discagens outbound com regras de cadência, horários permitidos e retentativas. |
| **Chamadas & Logs** | Histórico detalhado de chamadas telefônicas realizadas e recebidas com métricas de duração, status e desfecho. |
| **Transcrições & Áudios** | Player com áudio sincronizado, transcrição com separação de canais (diarização) e análise de sentimento. |
| **Integrações** | Configuração de conexões com provedores de telefonia, CRMs, plataformas de calendário e webhooks. |
| **Analytics & BI** | Taxas de contato efetivo, tempo médio de conversa, motivos de encerramento e conversão de objetivos. |
| **Custos & Finanças** | Demonstração detalhada de custos por chamada (telefonia + modelo + síntese) e margens operacionais. |
| **Configurações Globais** | Definição de números telefônicos de saída (caller IDs), políticas de retenção e segurança. |

---

## 5. Evolução Funcional (Fases)

### Fase 1: Chamadas Ativas (Outbound)
- Disparo de chamadas a partir de campanhas ou gatilhos de API;
- Qualificação de leads, confirmação de agendamentos, cobrança preventiva e pesquisas de satisfação;
- Rastreamento completo de custos por minuto e desfechos de chamadas.

### Fase 2: Chamadas Receptivas (Inbound)
- Recepção de chamadas telefônicas via números dedicados (DIDs);
- Triagem inteligente, consulta dinâmica a sistemas internos e atendimento automatizado 24/7;
- Transbordo assistido para operadores humanos quando necessário.
