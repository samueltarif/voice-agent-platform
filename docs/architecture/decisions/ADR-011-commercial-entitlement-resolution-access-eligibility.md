# ADR-011: Commercial Entitlement Resolution and Access Eligibility

## Status
Accepted

## Data
2026-09-23

## Motivo da Aceitação
Aprovação humana explícita recebida em 23 de Setembro de 2026, definindo a política formal de precedência de entitlements, elegibilidade de assinaturas, vigência de concessões manuais e governança de quotas para destravar a persistência do Agent Studio (Slice 005B).

## Contexto
O projeto estabeleceu desde a Fase 4 os princípios de desacoplamento entre pagamento e direito de acesso (DEC-020) e resolução de capacidades estritamente por Entitlements (DEC-021). No entanto, o esquema de persistência relacional comercial comporta múltiplas fontes de direitos:
1. `subscriptions` (assinaturas com ciclo de vida e planos associados);
2. `commercial_grants` (concessões manuais que podem associar um plano completo ou conceder overrides pontuais de features);
3. `entitlements` (catálogo de limites e permissões por plano).

Para viabilizar a implementação determinística e segura de quotas operacionais (`agents.max`) e a autorização de publicação de versões no Slice 005B, era indispensável definir formalmente:
- A precedência estrita entre as fontes de entitlements;
- As regras de resolução em caso de duplicidade ou concorrência de fontes;
- Quais status de assinatura e organização habilitam a expansão de capacidade;
- Como a política de publicação interage com o limite contratual de agentes.

## Decisão

### 1. Princípio de Desacoplamento Comercial
- **Payment != Access**: O processamento financeiro e a cobrança permanecem desacoplados dos direitos de acesso.
- O campo `billing_mode` (`SELF_SERVICE`, `MANUAL`, `COMPLIMENTARY`) representa exclusivamente a modalidade operacional de faturamento e **não concede nem revoga acesso por si só**.
- O acesso efetivo é resolvido dinamicamente pela tupla:
  `Organization.status + Subscription elegível + CommercialGrant vigente + Entitlements`.

### 2. Status da Organização e Operações Permitidas
- Para operações que criam, promovem ou expandem capacidade (`Create Agent`, `Reactivate Agent`, `Publish AgentVersion`), a organização deve possuir obrigatoriamente:
  `Organization.status = 'ACTIVE'`.
- Status `SUSPENDED` ou `ARCHIVED` falham fechados imediatamente com erro de domínio ou autorização.
- Operações de redução ou limpeza de estado (`Archive Agent` e `Discard Draft`) **não são bloqueadas** por irregularidade comercial, preservando a governança administrativa do tenant.

### 3. Elegibilidade de Assinatura (`Subscription`)
Uma assinatura é comercialmente elegível para novas operações se, e somente se:
1. `status IN ('TRIALING', 'ACTIVE')`;
2. Vigência temporal válida: `current_period_start <= at` E `at < current_period_end`.
- Assinaturas com status `PAST_DUE`, `SUSPENDED`, `CANCELED` ou `EXPIRED` **não autorizam** operações de criação, reativação ou publicação.
- Assinaturas com `cancel_at_period_end = true` **mantêm o acesso regular** enquanto `status = 'ACTIVE'` e `at < current_period_end`.

### 4. Vigência e Autonomia de Concessões Manuais (`CommercialGrant`)
Uma concessão comercial manual é considerada vigente quando:
1. `starts_at <= at`;
2. `ends_at IS NULL` OU `at < ends_at`.
- Concessões vigentes fornecem acesso autônomo, autorizando operações mesmo quando não existe assinatura ativa, atendendo vendas corporativas (`MANUAL`), cortesias (`COMPLIMENTARY`) e regimes de contingência.

### 5. Precedência Determinística de Entitlements
Para resolver o valor efetivo de uma capability/feature (como `agents.max`), aplica-se a seguinte ordem determinística de precedência:
```
1. Active Feature-Specific Commercial Grant Override (feature_key + override_value)
                          │ (se ausente)
                          ▼
2. Active Plan Commercial Grant (plan_id)
                          │ (se ausente)
                          ▼
3. Eligible Subscription Plan (plan_id da Subscription elegível)
                          │ (se ausente)
                          ▼
4. Deny / Entitlement Absent (Acesso Negado)
```
- **Proibição de Heurísticas Ambíguas**: É terminantemente proibido utilizar regras como *highest limit wins*, *latest grant wins*, *created_at wins* ou *updated_at wins*.

### 6. Tratamento de Conflitos — Fail-Closed
Caso a base de dados apresente inconsistências de configuração comercial com fontes concorrentes no mesmo nível hierárquico, a resolução falha fechada com `ConflictError`:
- Mais de 1 `CommercialGrant` vigente com `plan_id` para a mesma organização;
- Mais de 1 `CommercialGrant` vigente para a mesma `organizationId` + `featureKey`;
- Mais de 1 `Subscription` comercialmente elegível simultânea para a mesma organização.

### 7. Semântica de `agents.max`
- `agents.max` quantifica o teto máximo de agregados `Agent` com `status = 'ACTIVE'` no tenant.
- Operações de `Create Agent` e `Reactivate Agent` serializam a validação transacionalmente via lock na `Organization` (`FOR UPDATE`), resolvendo o entitlement efetivo e comparando contra `count(ACTIVE agents)`. Se `count >= limit`, aborta com `EntitlementExceededError`.
- `Create Draft` e descarte de draft não afetam nem consomem a cota.

### 8. Política Comercial de Publicação (`Publish AgentVersion`)
A promoção de uma versão para `PUBLISHED` exige:
1. `Organization.status = 'ACTIVE'`;
2. Entitlement `agents.max` concedido e resolvido;
3. `agents.max > 0`.
- **Ausência de Quota Adicional**: Publicar uma nova versão de um agente ativo já existente **não consome cota adicional** e **não executa** `count(ACTIVE agents) < agents.max`. Isso permite que organizações com downgrades comerciais continuem ajustando versões operacionais de agentes previamente contratados, desde que a funcionalidade permaneça habilitada.

### 9. Fonte de Tempo Determinística (Clock Port)
A resolução de vigência temporal de assinaturas e concessões aceita obrigatoriamente um parâmetro temporal explícito (`at: Date`, com default para o instante atual), permitindo testes de integração determinísticos sem dependência de sleeps.

## Consequências

### Positivas
- Eliminação total de decisões ad-hoc ou heurísticas no cálculo de cotas e acesso;
- Suporte nativo e auditável para planos manuais, contratos especiais e períodos de carência;
- Prevenção contra estouro de limites através de falha fechada em cenários de dados conflitantes;
- Imutabilidade do histórico e preservação das entidades operacionais existentes mesmo em caso de inadimplência (`PAST_DUE`).

### Trade-offs
- Configurações administrativas duplicadas bloqueiam o tenant até correção pelo Platform Control Plane;
- Overrides de feature em texto exigem parser determinístico estrito para tipos numéricos (rejeição de strings inválidas).

## Capacidades Diferidas (Deferred)
- **Suspensão de Chamadas em Runtime**: A política de interrupção ou bloqueio de chamadas telefônicas em tempo real para agentes já publicados em tenants que entram em `PAST_DUE` será definida nas Fases de Telefonia (Fase 8).
