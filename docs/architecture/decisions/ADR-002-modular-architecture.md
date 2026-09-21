# ADR-002: Arquitetura Modular e Vertical Slices

- **Status**: Accepted
- **Data**: 2026-09-21

---

## Context (Contexto)

Sistemas em fase inicial frequentemente cometem dois erros arquiteturais opostos:
1. Fragmentar o sistema prematuramente em dezenas de microserviços de rede distribuídos, gerando sobrecarga operacional desmedida, transações distribuídas, latência e complexidade de orquestração;
2. Organizar o código em camadas horizontais puras e genéricas (camada de todos os controllers, camada de todos os services, camada de todos os repositórios), espalhando a lógica de um mesmo caso de uso por múltiplos diretórios distantes, dificultando a contextualização por agentes de IA.

Precisamos de uma organização de código que favoreça coesão alta, limites claros de domínio e manutenção eficiente por agentes de IA sem complexidade distribuída prematura.

---

## Decision (Decisão)

Adotar uma **Arquitetura Modular baseada em Vertical Slices** sempre que fizer sentido no domínio, **rejeitando explicitamente microserviços prematuros**.

O código de cada funcionalidade/domínio (ex.: gerenciamento de agentes, catálogo de produtos, orquestração de campanhas) agrupa seus próprios schemas, casos de uso, repositórios específicos e rotas em fatias verticais coesas. A comunicação entre domínios distintos ocorre via contratos explícitos ou eventos internos versionados.

---

## Alternatives Considered (Alternativas Consideradas)

1. **Microserviços Distribuídos Prematuros**:
   - *Descarte*: O overhead de manter clusters de orquestração independentes, service mesh, consistência eventual prematura e tracing distribuído em rede atrasaria o ciclo de validação do produto e encareceria a infraestrutura inicial.
2. **Arquitetura Tradicional em Camadas Horizontais (N-Tier Layers)**:
   - *Descarte*: Obriga o agente de IA a pular entre diretórios globais distantes (`/controllers`, `/services`, `/models`) para alterar uma única funcionalidade, aumentando a probabilidade de erros de contexto e código espaguete.

---

## Consequences (Consequências)

### Positivas:
- Alta coesão: todo o contexto de um caso de uso reside próximo, reduzindo o esforço cognitivo e a janela de contexto necessária para agentes de IA;
- Limites bem definidos: se um módulo crescer a ponto de necessitar de deploy independente no futuro, ele já possui fronteiras naturais bem estabelecidas;
- Menor complexidade operacional: execução e depuração locais simples, rápidas e determinísticas.

### Negativas / Desafios:
- Requer governança para evitar que uma vertical slice acesse dados ou estruturas internas privadas de outra fatia sem passar por contratos públicos.
