# Modelo de Custos e Rastreamento Financeiro (COST_MODEL.md)

Este documento define a metodologia de apropriação de custos, precificação unitária de chamadas de voz com IA e controle de consumo por organização cliente.

---

## 1. Estrutura de Custo Unitário por Chamada

O custo operacional de uma chamada telefônica executada pelo agente de voz é composto por múltiplas variáveis de fornecedores externos:

$$\text{Custo Total da Chamada} = C_{\text{telefonia}} + C_{\text{ia\_audio}} + C_{\text{storage}} + C_{\text{infra}}$$

### 1.1. Custo de Telefonia ($C_{\text{telefonia}}$)
- **Origem**: Provedor de telefonia (PSTN/VoIP).
- **Métrica**: Minutos ou frações de segundos trafegados, diferenciando chamadas locais, móveis ou longa distância internacional.
- **Cálculo**: $\text{Duração (minutos)} \times \text{Tarifa por Minuto do Carrier}$.

### 1.2. Custo de Inteligência Artificial e Processamento de Áudio ($C_{\text{ia\_audio}}$)
Dependendo da arquitetura adotada pelo provedor de IA:
- **Cenário A (Pipeline Realtime Integrado)**:
  - Tarifa por minuto de sessão de áudio bidirecional (ex.: taxa por minuto de conexão de streaming multimodal).
- **Cenário B (Pipeline em Cascata)**:
  - $C_{\text{STT}}$: Minutos de fala do usuário transcritos;
  - $C_{\text{LLM}}$: Quantidade de tokens de entrada (prompt/contexto) e tokens gerados de saída;
  - $C_{\text{TTS}}$: Quantidade de caracteres sintetizados ou segundos de áudio de voz gerados.

### 1.3. Custo de Armazenamento ($C_{\text{storage}}$)
- **Origem**: Object storage para gravações de áudio (`.wav`/`.mp3`/`.opus`) e transcrições completas.
- **Métrica**: Gigabytes armazenados por mês conforme política de retenção do tenant.

---

## 2. Rastreamento e Registro de Custos na Chamada

1. **Apropriação Determinística ao Encerrar a Ligação**:
   - Ao finalizar a sessão, o serviço de voz (`apps/voice`) consolida os consumos brutos (duração de áudio em segundos, caracteres de TTS, tokens de LLM e tarifação de telefonia).
   - O worker assíncrono (`apps/worker`) ou o serviço de faturamento calcula os custos em moeda corrente (`DECIMAL(12, 4)`).
2. **Discriminação de Metadados**:
   Cada registro de chamada na tabela `calls` armazena:
   - `telephony_cost`: Custo cobrado pelo provedor telefônico;
   - `ai_compute_cost`: Custo computacional dos modelos de IA;
   - `total_cost`: Custo de base consolidado;
   - `billed_amount`: Valor cobrado do cliente conforme margem do plano.

---

## 3. Governança e Limites Orçamentários por Tenant

1. **Modelos de Cobrança Suportados**:
   - **Créditos Pré-pagos**: A organização adquire saldo antecipadamente. Cada chamada consome o saldo em tempo real.
   - **Pós-pago com Limite (Hard Cap)**: A organização possui um limite máximo mensal de gastos configurável.
2. **Prevenção contra Estouro de Orçamento (Runaway Prevention)**:
   - Antes de iniciar uma nova chamada ativa (`call.created`), o sistema valida se a organização possui saldo suficiente ou limite disponível.
   - Se o saldo atingir zero durante uma chamada longa, o agente pode encerrar o diálogo de forma educada ou seguir a regra de corte configurada pelo administrador.
3. **Dashboard de Transparência Financeira**:
   - O módulo financeiro do dashboard web expõe gráficos diários de consumo por agente, por campanha e por minuto, permitindo aos gestores auditar os custos com precisão centesimal.

---

## 4. Separação Conceitual: Usage, Cost e Billing

A plataforma formaliza a distinção entre três domínios que não devem ser acoplados:

1. **Usage (Consumo Factual)**:
   - Medição física e volumétrica dos recursos consumidos (duração de chamada, segundos de áudio IA, tokens gerados/ingeridos, gigabytes armazenados e execuções de tools).
   - O rastreamento de Usage é estritamente independente do gateway de pagamento ou forma de liquidação comercial.
2. **Cost (Custo dos Provedores)**:
   - Apuração do montante financeiro devido aos carriers e provedores externos com base em tabelas de custos vigentes.
3. **Billing (Faturamento Comercial)**:
   - Resolução de cobrança ao cliente conforme plano, entitlements, saldo de créditos ou concessão manual (`CommercialGrant`).
   - Para a especificação completa do modelo comercial e Platform Control Plane, consulte `docs/PLATFORM_CONTROL_PLANE.md`.

