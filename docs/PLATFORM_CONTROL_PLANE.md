# Arquitetura do Platform Control Plane e Modelo Comercial (PLATFORM_CONTROL_PLANE.md)

> **Status**: Requisito Arquitetural Formal — Documentação Conceitual
> **Fase de Planejamento**: FASE 3 (Design System / Shell) e FASE 4 (Persistência / Auth)
> **Data de Formalização**: 22 de Setembro de 2026 (PROMPT-002H)

Este documento define a separação arquitetural entre a aplicação de tenant e o plano de controle global da plataforma, bem como o modelo comercial desacoplado, catálogo de planos, entitlements, concessões manuais e governança de custos.

---

## 1. Separação de Contextos: Tenant Application vs. Platform Control Plane

A plataforma estabelece uma divisão conceitual e operacional estrita entre dois ambientes administrativos:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PLATFORM CONTROL PLANE                          │
│               Área Interna da Administração Global do SaaS             │
│   (Organizations, Plans, Subscriptions, Entitlements, Platform Audit)  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    │ Governança / Concessões / Planos
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          TENANT APPLICATION                            │
│                  Área Utilizada pelas Empresas Clientes                │
│       (Agentes, Campanhas, Chamadas, Contatos, Analytics, Equipe)      │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.1. Tenant Application
- Área operacional isolada utilizada pelas empresas clientes contratantes.
- Escopo rigorosamente restrito ao `organizationId` contextual.
- Funcionalidades: Agent Studio, campanhas de discagem, histórico de chamadas, contatos, catálogo de produtos/serviços, relatórios de equipe e integrações próprias.

### 1.2. Platform Control Plane
- Área interna reservada exclusivamente ao proprietário e administradores globais da plataforma.
- Escopo cross-tenant e infraestrutural.
- Funcionalidades gerenciadas:
  - Gestão do ciclo de vida de **Organizations** (criação, suspensão, arquivamento);
  - Catálogo mestre de **Plans** e definição de limites padrão;
  - Gestão de **Subscriptions** e estados comerciais;
  - Configuração de **Entitlements** específicos por organização;
  - Rastreamento consolidado de **Usage** (minutos, tokens, storage, chamadas);
  - Governança de **Billing** e apropriação de margens financeiras;
  - Concessão de **Commercial Grants** manuais e auditáveis;
  - Gestão de **Platform Users** (operadores internos com credenciais de master admin);
  - **Audit Trail Global** de ações administrativas;
  - Monitoramento de **Custos de Fornecedores** e saúde operacional dos clusters.

---

## 2. Requisito de Segurança: Platform Admin como Autorização Global

1. **Separação Estrutural de Autorização**:
   - `Platform Admin` (Master Admin) é uma autorização **GLOBAL**, externa à hierarquia de tenants.
   - Não deve ser modelado como um papel de usuário (role) dentro de uma `Organization` (ex.: não é um `Owner` ou `Admin` de organização).
2. **Impossibilidade de Auto-Elevação**:
   - Um usuário de tenant está estritamente impossibilitado de elevar seu privilégio para `Platform Admin` mediante alteração de papel, membership ou parâmetro de organização.
   - A autorização de `Platform Admin` reside em tabela/entidade técnica de governança da plataforma sem escopo de tenant, protegida por credenciais e políticas independentes.

---

## 3. Modelo Comercial Desacoplado (Pagamento vs. Direito de Acesso)

A plataforma adota o princípio de que **PAGAMENTO** e **DIREITO DE ACESSO** são conceitos desacoplados. A aplicação nunca depende da premissa ingênua `pagou = liberado`.

O direito efetivo de uso dos recursos é sempre resolvido por:
$$\text{Direito de Acesso} = f(\text{Plano}, \text{Entitlements}, \text{Estado Comercial})$$

### 3.1. Modos de Faturamento (`BillingMode` Conceitual)

A relação comercial de cada organização pode ser operada sob os seguintes modos iniciais:

| Modo | Descrição | Fluxo de Ativação |
| :--- | :--- | :--- |
| **`SELF_SERVICE`** | Cliente realiza contratação e pagamento via gateway integrado (cartão, assinatura digital). | Ativação automatizada via webhook de gateway após confirmação de pagamento. |
| **`MANUAL`** | Cliente opera sob contrato corporativo B2B, PIX manual, boleto faturado ou transferência bancária. | Ativação realizada manualmente por um `Platform Admin` através de `CommercialGrant`. |
| **`COMPLIMENTARY`** | Acesso concedido sem cobrança comercial (piloto, parceria estratégica, contas internas ou testes). | Ativação concedida por `Platform Admin` com prazo e limites explicitamente delimitados. |

*Nota: Esta classificação é conceitual e orienta a arquitetura documental; nenhum enum de código de produção é instanciado nesta fase.*

---

## 4. Ciclo de Vida de Assinatura (`SubscriptionStatus` Conceitual)

O estado da assinatura comercial de uma organização é expresso através da seguinte máquina de estados inicial proposta:

- **`TRIALING`**: Período de avaliação com limites e período de expiração configurados.
- **`ACTIVE`**: Assinatura em vigor com direitos de acesso regulares liberados.
- **`PAST_DUE`**: Pagamento pendente ou falha na renovação; período de tolerância configurável antes da suspensão.
- **`SUSPENDED`**: Suspensão temporária do serviço (ex.: inadimplência prolongada, estouro de risco ou solicitação administrativa). Discagens ativas são bloqueadas.
- **`CANCELED`**: Cancelamento formal da assinatura pelo cliente ou pela administração.
- **`EXPIRED`**: Término do período de vigência sem renovação ou concessão ativa.

> [!CAUTION]
> **Proibição de Modelagem Frágil**:
> É expressamente proibido condensar o estado comercial, status financeiro, direitos de acesso e limites operacionais em um único campo booleano (ex.: `isPremium`, `isPaid`, `isActive`). Cada dimensão possui ciclo de vida e regras próprias.

---

## 5. Concessões Manuais de Acesso (`CommercialGrant` Conceitual)

Para suportar vendas corporativas assistidas (`MANUAL`) e acessos de cortesia (`COMPLIMENTARY`), a arquitetura prevê a entidade conceitual de concessão:

### 5.1. Estrutura Conceitual
- **`organizationId`**: Identificador da organização beneficiária.
- **`planId`**: Plano associado à concessão.
- **`startsAt`**: Data/hora de início da vigência.
- **`endsAt`**: Data/hora de término da vigência.
- **`grantedBy`**: Identificador do `Platform Admin` que autorizou a concessão.
- **`reason`**: Justificativa comercial auditável da concessão.
- **`reference`**: Identificador do contrato comercial, proposta assinada ou fatura externa.

### 5.2. Regra de Governança
- Toda e qualquer concessão manual de acesso deve produzir um registro imutável na trilha de auditoria global da plataforma. Nenhuma concessão "invisível" é permitida.

---

## 6. Sistema de Planos e Entitlements

A plataforma veda a pulverização de regras comerciais em código através de condicionais pelo nome do plano (ex.: `if (plan === 'professional')`).

O sistema resolverá capacidades exclusivamente por meio de **Entitlements**:
- **Plan**: Define o pacote comercial comercializado (composição de marketing/vendas).
- **Entitlements**: Definem as capacidades e limites operacionais efetivos atribuídos à organização.

### 6.1. Exemplos Conceituais de Entitlements
- `agents.max`: Número máximo de agentes de voz que podem ser criados.
- `users.max`: Número máximo de membros da organização permitidos.
- `voice.monthlyMinutes`: Minutos de conversação telefônica incluídos no ciclo.
- `campaigns.enabled`: Permissão para criar e disparar campanhas ativas.
- `analytics.advanced`: Acesso a métricas aprofundadas e relatórios analíticos.
- `integrations.crm`: Habilitação de sincronização com CRMs externos.
- `agentStudio.enabled`: Acesso ao ambiente visual de calibração de agentes.
- `recordings.enabled`: Permissão para gravar e armazenar chamadas telefônicas.
- `liveMonitoring.enabled`: Acesso ao painel de acompanhamento de chamadas em tempo real.
- `humanHandoff.enabled`: Capacidade de transbordo assistido para operadores humanos.

### 6.2. Flexibilidade Comercial
A arquitetura de entitlements viabiliza:
- Planos padrão pré-definidos (ex.: Starter, Professional, Enterprise);
- Limites personalizados negociados em contrato;
- Pacotes customizados para grandes contas corporativas;
- Adição avulsa de créditos de minutos;
- Overrides comerciais temporários auditáveis concedidos pela administração.

*Nota: Nenhum valor de preço, cota ou limite numérico é definitivo nesta etapa.*

---

## 7. Rastreamento e Separação: Usage, Cost e Billing

A plataforma reforça a separação conceitual estrita entre três domínios correlacionados:

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│     USAGE       │       │      COST       │       │     BILLING     │
│ Consumo Factual ├──────►│ Custo Providers ├──────►│ Cobrança Cliente│
│(segundos/tokens)│       │  (tarifas brutas)│       │ (fatura/crédito)│
└─────────────────┘       └─────────────────┘       └─────────────────┘
```

1. **`Usage` (Consumo Factual)**:
   - Registro volumétrico bruto de recursos utilizados por organização e por chamada:
     - Duração de telefonia (minutos/segundos);
     - Duração de áudio do modelo de IA;
     - Tokens de entrada e saída (quando aplicável);
     - Quantidade de chamadas disparadas e atendidas;
     - Armazenamento de áudios e transcrições em bytes;
     - Execuções de tools e conectores.
   - **Independência**: O rastreamento de Usage opera de forma agnóstica ao gateway de pagamento.
2. **`Cost` (Custo Operacional dos Provedores)**:
   - Apuração do custo real cobrado pelos fornecedores externos de infraestrutura (telefonia, provedores de IA, storage).
   - Detalhado em `docs/COST_MODEL.md`.
3. **`Billing` (Faturamento Comercial)**:
   - Cobrança efetiva do cliente conforme o modelo de contrato (pré-pago, pós-pago, fatura mensal, overage de minutos).
   - Operado via gateway automatizado ou conciliação manual.

---

## 8. Status de Implementação e Decisões Pendentes

- **Status Geral**: **Requisito Arquitetural Documentado — Não Implementado**.
- **Fornecedor de Gateway de Pagamento**: *Status: Pending Decision* (Candidatos: Stripe, Asaas, Pagar.me).
- **Provedor de Autenticação / Identidade**: *Status: Pending Decision*.
- **Modelagem de Tabelas de Billing/Admin**: Planejada para a FASE 4 (Persistência e Multi-Tenancy) do roadmap.
