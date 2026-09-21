# ADR-003: Multi-Tenancy Nativo com Isolamento Lógico

- **Status**: Accepted
- **Data**: 2026-09-21

---

## Context (Contexto)

A plataforma é um SaaS B2B direcionado a múltiplas empresas clientes. Cada organização opera agentes de voz, campanhas de contato, dados confidenciais de clientes, catálogo de produtos, transcrições e métricas de faturamento de forma concorrente.

Precisamos de uma estratégia de multi-tenancy que:
1. Garanta isolamento inegociável de dados e previna vazamento de informações entre concorrentes;
2. Permita escalabilidade sustentável e provisionamento instantâneo de novas contas sem sobrecarga de infraestrutura;
3. Seja simples de manter e migrar de forma unificada.

---

## Decision (Decisão)

Adotar **Multi-Tenancy Nativo com Isolamento Lógico compartilhado**, ancorado na coluna obrigatória **`organizationId`** (ou `organization_id`) em todas as tabelas e entidades com escopo de cliente.

Toda consulta, inserção, atualização ou deleção na camada de persistência (`packages/database`) deve obrigatoriamente exigir e validar o contexto de organização ativa. Os índices de banco de dados devem incluir `organization_id` como prefixo principal.

---

## Alternatives Considered (Alternativas Consideradas)

1. **Banco de Dados Isolado por Tenant (Database-per-Tenant)**:
   - *Descarte*: Inviabiliza a gestão simples de migrations em dezenas ou centenas de clientes, multiplica exponencialmente o custo fixo de banco de dados em fase inicial e dificulta métricas consolidadas globais.
2. **Schema Separado por Tenant no Mesmo Banco (Schema-per-Tenant)**:
   - *Descarte*: Aumenta o tempo de execução de migrations proporcionais ao número de schemas e introduz complexidade excessiva de connection pooling e suporte de ORMs.
3. **Deploy de Instância Única por Cliente (Single-Tenant Silo)**:
   - *Descarte*: Incompatível com o modelo de negócio SaaS self-service escalável.

---

## Consequences (Consequências)

### Positivas:
- Provisionamento imediato de novas contas de clientes corporativos;
- Migrações de banco de dados unificadas e consistentes;
- Otimização máxima do uso de conexões e recursos computacionais.

### Negativas / Desafios:
- Risco permanente de vazamento de dados caso uma query esqueça de filtrar por `organizationId`. Mitigado pela obrigatoriedade de Repositories tipados e testes automatizados de segurança cross-tenant.
