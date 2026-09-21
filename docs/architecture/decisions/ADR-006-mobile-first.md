# ADR-006: Abordagem de Interface Mobile-First Unificada

- **Status**: Accepted
- **Data**: 2026-09-21

---

## Context (Contexto)

Gestores, supervisores de equipe e executivos B2B precisam acompanhar campanhas ativas, ouvir gravações de chamadas, verificar custos e calibrar agentes de voz com frequência através de seus smartphones, tanto quanto em estações de trabalho desktop no escritório.

A abordagem comum de desenvolver uma interface exclusivamente voltada para desktops widescreen e tentar adaptá-la tardiamente para mobile quase sempre resulta em:
1. Experiência móvel truncada, com tabelas quebradas e botões minúsculos;
2. Ou a criação prematura e custosa de dois projetos paralelos (ex.: "MobileApp" e "DesktopPortal"), duplicando o esforço de engenharia, lógica de validação e manutenção por agentes de IA.

---

## Decision (Decisão)

Adotar uma **Abordagem de Interface Mobile-First Unificada**.

A aplicação web (`apps/web`) será desenhada e estilizada prioritariamente para viewports móveis, utilizando design tokens universais de `packages/ui`, escalando progressivamente para tablets e telas desktop widescreen.

É expressamente proibido bifurcar o projeto em duas bases de código distintas para mobile e desktop. Toda responsividade deve ser obtida por meio de componentes adaptativos (ex.: tabelas que se convertem em cartões no mobile, menu inferior que vira sidebar lateral no desktop).

---

## Alternatives Considered (Alternativas Consideradas)

1. **Desenvolvimento Desktop-First com Ajustes Posteriores**:
   - *Descarte*: Gera débitos técnicos de usabilidade graves em telas pequenas, frustrando usuários em trânsito e exigindo refatorações complexas de layout.
2. **Duas Aplicações Separadas (Portal Web + WebApp Mobile)**:
   - *Descarte*: Dobra a superfície de código, duplica testes visuais e cria descompasso crônico de funcionalidades entre as plataformas.

---

## Consequences (Consequências)

### Positivas:
- Experiência fluida e ergonômica garantida em smartphones desde o primeiro dia;
- Base de código única, facilitando a governança, testes e intervenções de agentes de IA;
- Alta consistência visual garantida pelos tokens centralizados de design system.

### Negativas / Desafios:
- Exige atenção redobrada no design de tabelas densas e reprodutores de áudio para garantir que funcionem com naturalidade em telas estreitas.
