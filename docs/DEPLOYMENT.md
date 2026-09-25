# Estratégia de Ambientes e Implantação (DEPLOYMENT.md)

Este documento define a separação dos ambientes de desenvolvimento, homologação e produção, as barreiras de segurança para integração contínua (CI/CD) e a política de proteção contra alterações autônomas destrutivas.

---

## 1. Status de Infraestrutura e Hospedagem

- **Provedor de Cloud / Hospedagem**: **Status: Pending Decision** (Candidatos: AWS, Google Cloud, Fly.io, Cloudflare).
- **Orquestrador de Contêineres / Runtime**: **Status: Pending Decision** (Candidatos: Docker / ECS / Kubernetes).
- **Pipeline de CI/CD**: **Status: Pending Decision** (Candidatos: GitHub Actions, GitLab CI).
- **Banco de Dados Relacional**:
  - **Seleção de Provedor**: **DECIDED — Neon Serverless Postgres principal** (Alternativa: Supabase Postgres) conforme DEC-026 / ADR-008.
  - **Ambiente de Homologação (`staging`)**: Neon Managed PostgreSQL 16 (`aws-sa-east-1` / São Paulo) — **PROVISIONED & VALIDATED** (Foundation 0000 e Agent Domain 0001 aplicadas e validadas via testes de integração; **005C: IMPLEMENTED / LOCAL + NEON STAGING INTEGRATION VALIDATED**; **005D-B0: STAGING CRYPTOGRAPHIC + DATA/AUTHZ BOUNDARY VALIDATED** — Tenant Bootstrap Auth: STAGING CRYPTOGRAPHIC + DATA/AUTHZ BOUNDARY VALIDATED; Neon: DATA/AUTHZ INTEGRATION VALIDATED; API Deployment: NOT DEPLOYED; Production: NOT PROVISIONED / UNTOUCHED; Browser Auth E2E: NOT VALIDATED; 005D-B1: NOT STARTED).
  - **Ambiente de Produção (`production`)**: **NOT PROVISIONED** (Recurso de banco não provisionado; topologia de produção, capacidade, alta disponibilidade, failover e procedimentos de backup pendentes de desenho de produção).

Nenhuma configuração proprietária de cloud deve ser fixada antes da decisão técnica formal.

---

## 2. Segregação de Ambientes

O sistema adota três ambientes estritamente segregados, com bancos de dados, credenciais e configurações isoladas:

| Ambiente | Propósito | Acesso a Provedores Externos | Permissão de IA | Banco de Dados Relacional |
| :--- | :--- | :--- | :--- | :--- |
| **Desenvolvimento (`dev`)** | Desenvolvimento local de engenheiros e agentes de IA. | Fakes e emuladores locais (sem custo). | Leitura e escrita em código local. Sem acesso a secrets reais. | Docker Compose `postgres:16-alpine` local. |
| **Homologação (`staging`)** | Validação integrada de deploys, testes E2E e testes de carga. | Contas de sandbox de telefonia/IA com limites financeiros rígidos. | Execução de testes automatizados via pipeline de CI. | Neon Managed PostgreSQL 16 (`aws-sa-east-1` / São Paulo). |
| **Produção (`production`)** | Operação real com tráfego telefônico de clientes corporativos. | Provedores oficiais de produção com SLA e alta disponibilidade. | **Acesso direto bloqueado.** Nenhuma ação autônoma destrutiva. | **Provedor Decidido: Neon principal** (ADR-008 / DEC-026).<br>**Recurso de Banco:** Não provisionado (`NOT PROVISIONED`).<br>**Topologia / Capacidade / HA / Backup:** Não validados (`PENDING PRODUCTION DESIGN`). |


---

## 3. Política de Proteção Estrita de Produção

1. **Gate Humano Obrigatório para Produção**:
   - Todo deploy para o ambiente de produção exige aprovação humana explícita (*Human-in-the-Loop*).
   - Nenhuma ferramenta automatizada ou agente de IA pode disparar deploy autônomo para produção.
2. **Impossibilidade de Execução Autônoma de DDLs**:
   - Agentes de IA não possuem permissões de execução direta no banco de dados de produção.
   - Migrações são aplicadas exclusivamente através do pipeline de CI/CD autenticado e auditado.
3. **Bloqueio de Migrações Destrutivas**:
   - Comandos como `DROP TABLE`, `DROP COLUMN`, `TRUNCATE` ou remoção de chaves primárias são abortados pelo pipeline de CI se não acompanhados de flag explícita de exceção humana.

---

## 4. Fluxo Conceitual do Pipeline de CI/CD

```
Commit / PR ──► 1. Linter & Static Analysis (Limites de complexidade e linhas)
                 │
                 ▼
                2. Testes Unitários & Integração (100% isolados, sem custos de API)
                 │
                 ▼
                3. Verificação de Migrations (Validação de sintaxe e reversibilidade)
                 │
                 ▼
                4. Build dos Pacotes e Aplicações (apps/web, apps/api, apps/voice, apps/worker)
                 │
                 ▼
                5. Deploy Automatizado para Staging
                 │
                 ▼
                [ Gate de Aprovação Humana ]
                 │
                 ▼
                6. Deploy Controlado para Produção
```

---

## 5. Estratégia de Deploy sem Indisponibilidade (Zero-Downtime)

1. **Sessões de Voz em Andamento**:
   - O serviço `apps/voice` gerencia conexões ativas de longa duração (chamadas telefônicas em curso).
   - O processo de encerramento gracioso (*graceful shutdown*) deve aguardar o término das chamadas ativas ou permitir que novas chamadas sejam direcionadas à nova versão enquanto as antigas finalizam.
2. **Compatibilidade de Banco de Dados**:
   - As migrações devem ser compatíveis com a versão de código em execução no momento (compatibilidade N e N-1 via *Expand and Contract*).
