# ADR-001: Adoção de Monorepo Modular

- **Status**: Accepted
- **Data**: 2026-09-21

---

## Context (Contexto)

A plataforma SaaS B2B de agentes de voz com IA é composta por múltiplos processos especializados: um dashboard administrativo web, uma API de orquestração HTTP, um motor de voz em tempo real para chamadas telefônicas e workers assíncronos para processamento de áudio e dados. Além disso, a governança do projeto foi desenhada para ser operada e mantida intensivamente por agentes autônomos de IA e engenheiros de software.

Precisamos de uma estrutura de repositório que:
1. Permita o compartilhamento transparente de contratos, schemas de validação e interfaces de domínio tipadas;
2. Ofereça visão global imediata para que agentes de IA compreendam o sistema sem fragmentação de contexto;
3. Viabilize commits atômicos envolvendo mudanças de contratos e implementações consumidoras.

---

## Decision (Decisão)

Adotar a estrutura de **Monorepo Modular**.

As aplicações executáveis residirão no diretório `apps/` (`web`, `api`, `voice`, `worker`), e os módulos compartilhados residirão no diretório `packages/` (`ui`, `database`, `contracts`, `config`, `logger`, `errors`, `integrations`, `test-utils`).

Não serão adotados múltiplos repositórios separados (polyrepo) nem monólitos planos desprovidos de separação em pacotes.

---

## Alternatives Considered (Alternativas Consideradas)

1. **Polyrepo (Múltiplos Repositórios Independentes)**:
   - *Descarte*: Criaria fricção severa de sincronização de tipos, dependência de publicação contínua de pacotes privados (npm/registry), dificuldade de coordenação para agentes de IA e quebras frequentes de contrato entre frontend, backend e motor de voz.
2. **Monólito Plano (Single App Monolith)**:
   - *Descarte*: Dificultaria a separação de responsabilidades e escalabilidade independente dos processos (especialmente o motor de voz em tempo real vs. API HTTP tradicional).

---

## Consequences (Consequências)

### Positivas:
- Contratos de API, schemas e eventos centralizados em `packages/contracts`, consumíveis por todos os serviços com tipagem estrita de ponta a ponta;
- Facilidade de navegação e inspeção de código para agentes de IA;
- Refatorações e ajustes contratuais atômicos e auditáveis em um único PR.

### Negativas / Desafios:
- Exige ferramentas de workspace eficientes para controle de dependências internas e build incremental;
- Requer disciplina contínua e checagens automatizadas para evitar acoplamento indevido ou importações diretas entre aplicações irmãs.
