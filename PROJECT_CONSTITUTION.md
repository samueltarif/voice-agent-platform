# Constituição do Projeto (PROJECT_CONSTITUTION.md)

Este documento estabelece as leis fundamentais e imutáveis da arquitetura e operação do software. Nenhum agente de IA, desenvolvedor ou processo automatizado tem permissão para violar estes princípios silenciosamente. Qualquer desvio requer aprovação humana explícita e atualização formal de ADR.

---

## Artigo I — Multi-Tenancy Nativo e Inegociável
1. Toda e qualquer entidade pertencente a um cliente corporativo deve obrigatoriamente referenciar seu escopo organizacional através de `organizationId` (ou equivalente canônico estabelecido).
2. O isolamento de dados entre organizações deve ser garantido em nível de aplicação e persistência. Nenhum fluxo pode consultar, alterar ou excluir dados sem restringir explicitamente a organização contextual.
3. Vazamento de dados cross-tenant é considerado falha de severidade crítica.

---

## Artigo II — Baixo Acoplamento e Vertical Slices
1. A arquitetura favorece módulos altamente coesos e desacoplados organizados por domínio (vertical slices).
2. As fronteiras entre módulos e serviços devem ser limpas, comunicando-se por meio de interfaces explícitas ou barramento de eventos versionados, evitando referências circulares e acoplamento direto a modelos internos de outros módulos.

---

## Artigo III — Providers e Adapters Substituíveis
1. O core de negócio e o motor de orquestração de chamadas nunca devem depender diretamente de SDKs proprietários ou bibliotecas fechadas de fornecedores (telefonia, IA, transcrição, síntese, storage, CRM, mensageria).
2. Toda integração externa deve ser modelada como uma Porta (Interface abstrata de domínio) e um Adaptador (implementação concreta).
3. A substituição de um fornecedor de infraestrutura ou IA não pode exigir refatoração na lógica de negócio central.

---

## Artigo IV — Determinismo: LLM Nunca é Fonte da Verdade
1. Modelos de Linguagem (LLMs) orientam o comportamento conversacional, interpretação de intenção, geração de diálogo humanizado e orquestração de diálogos.
2. LLMs **nunca** serão a fonte da verdade para:
   - Preços de produtos e serviços;
   - Saldo de estoque;
   - Permissões de acesso e controle de autorização;
   - Dados financeiros, transações e cobranças;
   - Regras fiscais e contratuais.
3. Todas as regras de negócio críticas devem ser validadas e executadas por código determinístico testável antes de qualquer confirmação de ação.

---

## Artigo V — Proteção Incondicional de Produção
1. O ambiente de produção é estritamente protegido contra ações autônomas destrutivas de agentes de IA.
2. Agentes automatizados não possuem permissão para executar comandos DDL manuais, exclusão em massa de dados, alteração de segredos ou deployments diretos sem gate humano.
3. Ambientes de Desenvolvimento (`dev`), Homologação (`staging`) e Produção (`production`) são conceitualmente e fisicamente segregados.

---

## Artigo VI — Migrations Versionadas Obrigatórias
1. Nenhuma alteração estrutural em banco de dados ocorre de forma manual ou improvisada.
2. Toda alteração de schema deve ser expressa em arquivos de migration versionados, rastreáveis e idempotentes.
3. Migrações com alterações incompatíveis devem seguir o padrão *Expand and Contract*, garantindo compatibilidade reversa durante atualizações e rollout seguro. Migrações triviais e compatíveis não exigem obrigatoriamente esse padrão.

---

## Artigo VII — Observabilidade e Rastreabilidade Integral
1. Nenhuma operação crítica ocorre sem contexto rastreável. Toda requisição, chamada telefônica, tarefa assíncrona ou execução de ferramenta deve carregar identificadores (`correlationId`, `requestId`, `callId`, `organizationId`).
2. Logs devem ser estruturados e tipados. Mensagens de texto livre não estruturadas e `console.log` são proibidos como ferramenta primária em produção.

---

## Artigo VIII — Auditoria, Rastreabilidade e Políticas de Retenção
1. Ações críticas realizadas por usuários ou por agentes de voz (como alterações de configurações, disparo de campanhas, transações ou execução de tools) devem gerar registros imutáveis de auditoria.
2. Os seguintes tipos de dados são conceitualmente distintos e devem ser gerenciados por políticas separadas:
   - **Audit trail**: Imútável, rastreabilidade permanente de ações críticas.
   - **Operational logs**: Logs operacionais com retenção configurável.
   - **Gravações e transcrições**: Dados de chamadas com política de retenção, expiração e exclusão configurável.
   - **Dados pessoais (PII)**: Sujeitos a políticas de anonimização, pseudonimização e direito ao esquecimento.
3. A plataforma deve permitir futuramente a configuração de políticas de retenção, expiração, exclusão e *legal hold*. Períodos legais e regras regulatórias específicas não serão definidos sem pesquisa jurídica atualizada.

---

## Artigo IX — Segurança e Princípio do Menor Privilégio
1. Zero secrets em código-fonte: credenciais, chaves de API e certificados nunca são versionados no repositório.
2. Ferramentas disponibilizadas para invocação por agentes de IA (tool calling) devem operar com o mínimo de privilégio necessário para a intenção autorizada.
3. Nenhuma integração sensível pode ser disparada sem validação prévia de autorização do tenant.

---

## Artigo X — Testabilidade como Pré-Requisito
1. O software deve ser desenhado para ser testável. Código sem testes é considerado código incompleto.
2. Nenhuma regra de negócio pode ser introduzida sem testes unitários ou de integração que validem seu comportamento esperado e casos de falha.
3. Testes unitários e de integração não devem depender de APIs externas pagas nem de serviços terceiros reais.

---

## Artigo XI — Mobile-First e Responsividade Universal
1. A interface de gerenciamento (dashboard) é desenhada e desenvolvida primordialmente para dispositivos móveis (`mobile-first`), escalando harmoniosamente para tablets, desktops e telas ultrawide.
2. Não serão mantidas bases de código paralelas para mobile e desktop; a responsividade e adaptabilidade devem residir nos componentes compartilhados e nos design tokens universais.

---

## Artigo XII — Arquitetura Amigável para Agentes de IA
1. A base de código deve ser intencionalmente mantida legível para modelos de IA: arquivos concisos (alvo de 80 a 150 linhas, máximo 180), responsabilidades atômicas, tipagem forte e nomes autoexplicativos.
2. Arquivos utilitários genéricos e aglomeradores (`utils`, `helpers`, `common`, `manager`) são expressamente proibidos.
3. Contratos devem ser auto-documentados e explícitos.

---

## Artigo XIII — Rejeição à Complexidade Prematura
1. Não adotar microserviços prematuros. O monorepo modular oferece o equilíbrio ideal entre velocidade de desenvolvimento, coesão e independência de implantação.
2. Adicionar abstrações e camadas adicionais apenas quando houver um problema real e mensurável a ser resolvido, respeitando as decisões documentadas nos ADRs.
