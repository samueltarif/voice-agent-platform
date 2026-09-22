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

## 4. Escopo da Aplicação Web e Painéis

A interface da plataforma é construída sob abordagem **mobile-first** e atende a dois contextos conceituais complementares:

### 4.1. Tenant Application (Operação B2B da Empresa Cliente)
| Módulo | Responsabilidade |
| :--- | :--- |
| **Dashboard** | Visão geral de métricas do dia, chamadas ativas, conversão e saldo de minutos. |
| **Agent Studio** | Configuração visual de agentes de voz sem código: identidade, persona, tools, Knowledge Base, playbooks e versionamento. Consulte `docs/AGENT_STUDIO.md`. |
| **Campanhas Ativas** | Disparo de discagens outbound com regras de cadência, horários permitidos e retentativas. |
| **Chamadas & Ao Vivo** | Monitoramento de chamadas em tempo real (telemetria e transcrição ao vivo) e histórico de desfechos. Consulte `docs/LIVE_CALLS_AND_HANDOFF.md`. |
| **Gravações & Transcrições** | Player com áudio sincronizado via acesso autenticado/temporário, diarização e sinais de interesse/conteúdo. |
| **Vendedores & Handoff** | Fila de atendimento comercial, disponibilidade e protocolo de transbordo humano assistido. |
| **Clientes / Contatos** | Cadastro e importação de listas de contatos com campos customizados, tags e histórico. |
| **Produtos & Serviços** | Catálogo determinístico de itens e regras de desconto consultáveis via tool calling. |
| **Analytics & BI** | Contato efetivo, tempo médio de conversa, conversão e taxas de sucesso de handoff. |
| **Custos & Consumo** | Demonstração detalhada de consumo em minutos e custos por chamada. Consulte `docs/COST_MODEL.md`. |
| **Integrações & Configurações**| DIDs telefônicos, CRMs, calendários, webhooks e políticas de retenção da organização. |

### 4.2. Platform Control Plane (Administração Global do SaaS)
| Módulo | Responsabilidade |
| :--- | :--- |
| **Organizations** | Gestão do ciclo de vida das empresas clientes (criação, suspensão, arquivamento). |
| **Plans & Entitlements** | Catálogo mestre de planos comerciais e matriz de capacidades/limites efetivos. |
| **Subscriptions & Grants** | Ciclo de vida de assinaturas e concessões manuais de acesso auditáveis (`CommercialGrant`). |
| **Usage & Costs** | Rastreamento consolidado de minutos, tokens, storage e custos reais de providers externos. |
| **Billing** | Modelos de faturamento (`SELF_SERVICE`, `MANUAL`, `COMPLIMENTARY`) e conciliação financeira. |
| **Platform Audit & Health** | Trilha global de auditoria imutável e monitoramento de saúde operacional do sistema. |

*Para detalhes aprofundados, consulte [docs/PLATFORM_CONTROL_PLANE.md](file:///d:/voice-agent-platform/docs/PLATFORM_CONTROL_PLANE.md) e [docs/LIVE_CALLS_AND_HANDOFF.md](file:///d:/voice-agent-platform/docs/LIVE_CALLS_AND_HANDOFF.md).*

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
