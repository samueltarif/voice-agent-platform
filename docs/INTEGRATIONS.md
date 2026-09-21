# Arquitetura de Integrações e Provedores Externos (INTEGRATIONS.md)

Este documento especifica a estratégia de abstração de serviços externos do sistema, aplicando o padrão **Provider/Adapter (Ports and Adapters)** para garantir que a plataforma seja agnóstica a qualquer fornecedor de infraestrutura ou IA.

---

## 1. Princípio Fundamental de Isolamento

- **Regra de Ouro**: O núcleo do negócio (`apps/api`, `apps/voice`, `apps/worker` e regras de domínio) **é estritamente proibido de importar SDKs ou bibliotecas proprietárias de fornecedores** (ex.: `twilio`, `openai`, `@aws-sdk/client-s3`, `hubspot`, `google-api`).
- Todo consumo de tecnologia externa é mediado por uma **Porta** (interface abstrata em TypeScript com tipos universais de domínio).
- A implementação real é encapsulada em um **Adaptador** (classe ou módulo que traduz tipos do domínio para a API externa e vice-versa).
- O código do produto reside em `packages/integrations` ou em subpacotes específicos de adaptadores.

---

## 2. Catálogo de Portas (Interfaces Abstratas de Domínio)

### 2.1. `TelephonyProvider`
Responsável pelo ciclo de vida das chamadas telefônicas na rede pública (PSTN/VoIP).
- **Operações**: Iniciar chamada ativa (`makeCall`), encerrar chamada (`hangupCall`), transferir chamada (`transferCall`), obter status, gerar stream de áudio bidirecional (WebSockets/SIP).
- **Implementações Futuras Candidatas**: `TwilioTelephonyProvider`, `TelnyxTelephonyProvider`, `PlivoTelephonyProvider`.
- **Status do Fornecedor**: **Status: Pending Decision**.

### 2.2. `RealtimeAIProvider`
Responsável pela sessão interativa de inteligência artificial de voz em tempo real.
- **Operações**: Estabelecer sessão de streaming, enviar chunks de áudio/texto, receber fluxos de áudio de resposta com suporte a interrupção (*barge-in*), registrar ferramentas (*tools/functions*) e processar gatilhos de invocação.
- **Implementações Futuras Candidatas**: `OpenAIRealtimeProvider`, `DeepgramLiveKitProvider`, `ElevenLabsConversationalProvider`.
- **Status do Fornecedor**: **Status: Pending Decision**.

### 2.3. `StorageProvider`
Responsável pela persistência e recuperação segura de artefatos de mídia (gravações de áudio, metadados e arquivos exportados).
- **Operações**: Obter URL pré-assinada para upload/download (`getSignedUploadUrl`, `getSignedDownloadUrl`), upload direto de stream (`uploadStream`), excluir objeto (`deleteObject`).
- **Implementações Futuras Candidatas**: `CloudflareR2StorageProvider`, `S3StorageProvider`, `GCSStorageProvider`.
- **Status do Fornecedor**: **Status: Pending Decision**.

### 2.4. `CRMProvider`
Responsável pela sincronização bidirecional de contatos, negócios e registros de atividades decorrentes de chamadas de voz.
- **Operações**: Buscar contato por telefone (`findContactByPhone`), registrar nota/atividade de chamada (`logCallActivity`), atualizar status de oportunidade (`updateLeadStatus`).
- **Implementações Futuras Candidatas**: `HubSpotCRMProvider`, `SalesforceCRMProvider`, `PipedriveCRMProvider`.
- **Status do Fornecedor**: **Status: Pending Decision**.

### 2.5. `CalendarProvider`
Responsável pela verificação de disponibilidade e agendamento de reuniões/consultas acionadas durante a ligação pelo agente de voz.
- **Operações**: Consultar horários livres (`getAvailableSlots`), criar agendamento (`createAppointment`), cancelar agendamento (`cancelAppointment`).
- **Implementações Futuras Candidatas**: `GoogleCalendarProvider`, `OutlookCalendarProvider`, `CalComProvider`.
- **Status do Fornecedor**: **Status: Pending Decision**.

---

## 3. Padrão de Configuração e Injeção

```
┌──────────────────────────────────────┐
│  Domínio / Caso de Uso               │
│  Ex: InitiateOutboundCallUseCase     │
└──────────────────┬───────────────────┘
                   │ Depende apenas de
                   ▼
┌──────────────────────────────────────┐
│  Interface: TelephonyProvider        │
└──────────────────┬───────────────────┘
                   │ Implementada por
         ┌─────────┴─────────┐
         ▼                   ▼
┌──────────────────┐ ┌──────────────────┐
│ TwilioAdapter    │ │ TelnyxAdapter    │  (Selecionado em runtime por config)
└──────────────────┘ └──────────────────┘
```

1. **Seleção em Runtime**: A fábrica de provedores instancia o adaptador correto com base nas credenciais e configurações da organização ou variáveis globais.
2. **Fallback e Multi-Provider**: Caso um fornecedor de telefonia apresente instabilidade, a arquitetura permite alternar dinamicamente para o provedor secundário sem alterar nenhuma linha de regra de negócio.
3. **Mocks e Fakes em Testes**: Durante testes unitários e de integração, o sistema injeta fakes em memória (`InMemoryTelephonyProvider`, `MockRealtimeAIProvider`), garantindo execução instantânea e custo zero.
