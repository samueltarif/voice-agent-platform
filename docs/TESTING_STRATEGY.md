# Estratégia de Testes Automatizados (TESTING_STRATEGY.md)

Este documento define a pirâmide de testes, as regras de reprodução de bugs, a política de isolamento financeiro e as diretrizes de cobertura automatizada da plataforma.

---

## 1. Status de Tecnologias de Teste

- **Test Runner e Asserções Unitárias / Integração**: **Status: Pending Decision** (Candidato prioritário: Vitest / Node Test Runner).
- **Framework de Testes End-to-End (E2E)**: **Status: Pending Decision** (Candidato prioritário: Playwright).

Nenhum agente de IA deve instalar bibliotecas ou configurar scripts de teste antes da definição oficial do ecossistema.

---

## 2. Pirâmide e Tipos de Testes

```
                  ┌──────────────────────┐
                  │      Testes E2E      │  Poucos, críticos, fluxos completos de UI
                  ├──────────────────────┤
                  │ Testes de Integração │  Casos de uso, repositories, contratos
                  ├──────────────────────┤
                  │   Testes Unitários   │  Regras determinísticas, domínios, cálculos
                  └──────────────────────┘
```

### 2.1. Testes Unitários
- **Foco**: Funções isoladas, entidades de domínio, cálculos financeiros de chamada, validação de tokens e regras de transição de estado da chamada.
- **Velocidade**: Execução em milissegundos, 100% em memória, zero dependências externas ou de rede.

### 2.2. Testes de Integração
- **Foco**: Interação entre casos de uso, repositories de banco de dados (usando bancos de teste locais efêmeros ou transacionais), despacho de eventos e adaptadores emulados.
- **Contratos**: Validação de schemas e endpoints da API contra as definições em `packages/contracts`.

### 2.3. Testes End-to-End (E2E)
- **Foco**: Fluxos essenciais do usuário no dashboard web (login, criação de agente, upload de catálogo, verificação de relatório de chamadas).
- **Ambiente**: Executados em ambiente de staging ou contêineres de CI sem tocar em redes de telefonia pagas.

---

## 3. Regra Inviolável de Isolamento de Custos

- **Zero Chamadas a APIs Pagas Reais**:
  - Testes unitários e de integração **NUNCA** devem fazer requisições HTTP reais a provedores pagos (Twilio, OpenAI, ElevenLabs, etc.).
  - Todo teste deve utilizar **Fakes**, **Stubs** ou **Mocks** fornecidos pelo pacote `packages/test-utils` implementando as portas abstratas de `packages/integrations`.
  - A execução de testes não deve requerer conexão com a internet nem consumir saldo de contas corporativas.

---

## 4. Ciclo Obrigatório para Correção de Bugs (Bugfix TDD)

Quando um agente de IA ou desenvolvedor for acionado para resolver um bug:

1. **Passo 1: Escrever Teste de Reprodução**:
   Criar um teste unitário ou de integração que reproduza exatamente o cenário de falha relatado. O teste **deve falhar** na primeira execução, comprovando o bug.
2. **Passo 2: Investigar Causa Raiz**:
   Identificar o motivo real do comportamento inesperado em vez de aplicar correções cosméticas que apenas mascarem a exceção.
3. **Passo 3: Aplicar Correção Mínima**:
   Alterar o código estritamente necessário para corrigir a causa raiz sem introduzir complexidade colateral.
4. **Passo 4: Executar e Verificar Regressão**:
   O teste anteriormente com falha deve passar com sucesso, e toda a suíte de testes do módulo afetado deve ser executada para certificar ausência de regressões.

---

## 5. Regras para Novas Funcionalidades (Features)

1. Toda nova regra de negócio, condição de desconto, cálculo de tarifação ou validação de entrada deve nascer acompanhada de seus respectivos testes automatizados.
2. Casos de borda (*edge cases*) devem ser explicitamente cobertos: números de telefone inválidos, interrupção de áudio inesperada, falha de rede no adaptador, tentativa de acesso cross-tenant.
