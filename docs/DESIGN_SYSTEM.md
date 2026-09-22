# Diretrizes do Design System e Tokens (DESIGN_SYSTEM.md)

Este documento especifica a arquitetura do sistema de design compartilhado (`packages/ui`) da plataforma, assegurando coerência visual, acessibilidade, suporte mobile-first e prevenção a estilos arbitrários.

> **Revisado em**: 21 de Setembro de 2026 (PROMPT-001B)
> As escolhas tipográficas e os valores de breakpoint listados neste documento possuem **Status: Proposed Default** — são referências iniciais recomendadas, não decisões definitivas aprovadas. Os princípios de mobile-first, responsividade, design tokens, componentes compartilhados e acessibilidade são confirmados e inegociáveis.

---

## 1. Princípios do Design System

1. **Tokens Universais como Fonte Única da Verdade**:
   - É estritamente proibido inventar valores visuais soltos (ex.: `padding: 17px`, `color: #4a5b6c`, `border-radius: 9px`).
   - Todo componente deve consumir exclusivamente tokens padronizados.
2. **Componentes Adaptativos e Responsivos**:
   - É proibido criar bases de código bifurcadas como "MobileApp" e "DesktopApp".
   - Um mesmo componente deve se adaptar elegantemente a qualquer densidade e tamanho de viewport (mobile, tablet, desktop e ultrawide).
3. **Alto Padrão Estético e Funcional**:
   - Interface limpa, moderna e orientada a dados B2B (alta legibilidade em tabelas, gráficos de latência, reprodutores de áudio e listas operacionais).
   - Suporte nativo e automático a modo claro e modo escuro (*Dark Mode*) através de variáveis semânticas.

---

## 2. Categorias Obrigatórias de Design Tokens

O pacote `packages/ui` deve centralizar e exportar os seguintes grupos de tokens:

### 2.1. Cores e Temas (Color Tokens)
- **Base Primitiva**: Escalas neutras (cinzas/slate), primárias (brand), sucesso, aviso, erro e informação.
- **Camada Semântica**:
  - `surface-primary`, `surface-secondary`, `surface-elevated`
  - `text-primary`, `text-secondary`, `text-muted`
  - `border-subtle`, `border-strong`
  - `accent-brand`, `accent-interactive`

### 2.2. Tipografia (Typography Tokens)
- **Família Tipográfica** *(Status: Proposed Default)*: Fontes de alta legibilidade para UI e dados (ex.: Inter / Geist Sans) e monoespaçada para logs e transcrições (ex.: JetBrains Mono). Essas escolhas são recomendadas como ponto de partida — a decisão final requer aprovação humana explícita antes da implementação.
- **Escala de Tamanhos**: `text-xs` (12px), `text-sm` (14px), `text-base` (16px), `text-lg` (18px), `text-xl` (20px), `text-2xl` (24px), `text-3xl` (30px).
- **Pesos**: `regular` (400), `medium` (500), `semibold` (600), `bold` (700).

### 2.3. Espaçamento (Spacing Tokens)
Base harmônica de 4px:
- `space-1` (4px), `space-2` (8px), `space-3` (12px), `space-4` (16px), `space-5` (20px), `space-6` (24px), `space-8` (32px), `space-12` (48px), `space-16` (64px).

### 2.4. Raios de Borda (Radius Tokens)
- `radius-none` (0px), `radius-sm` (4px), `radius-md` (8px), `radius-lg` (12px), `radius-xl` (16px), `radius-full` (9999px).

### 2.5. Sombras e Elevação (Shadow Tokens)
- `shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-xl`, `shadow-glow`.

### 2.6. Movimento e Animações (Motion Tokens)
- **Durações**: `duration-fast` (150ms), `duration-normal` (250ms), `duration-slow` (400ms).
- **Curvas de Transição**: `ease-standard`, `ease-enter`, `ease-exit`.

### 2.7. Camadas de Sobreposição (Z-Index Tokens)
- `z-base` (0), `z-dropdown` (1000), `z-sticky` (1100), `z-modal` (1200), `z-popover` (1300), `z-toast` (1400), `z-tooltip` (1500).

### 2.8. Breakpoints de Responsividade *(Status: Proposed Default)*
Os valores abaixo são referência recomendada, não decisão definitiva aprovada:
- `sm`: 640px (smartphones em modo paisagem)
- `md`: 768px (tablets em modo retrato)
- `lg`: 1024px (laptops e tablets em modo paisagem)
- `xl`: 1280px (desktops padrão)
- `2xl`: 1536px (telas largas e monitores ultrawide)

---

## 3. Diretrizes de Construção de Componentes

1. **Acessibilidade Nativa (a11y)**: Navegabilidade completa via teclado, atributos ARIA adequados e contraste cromático mínimo em conformidade com WCAG 2.1 AA.
2. **Isolamento e Reusabilidade**: Componentes visuais em `packages/ui` são agnósticos de regra de negócio e de rotas específicas da aplicação.
3. **Áreas de Toque Adequadas**: Elementos interativos (botões, switches, itens de menu) devem respeitar a área mínima de toque de 44x44px em viewports móveis.

---

## 4. Arquitetura de Implementação em Runtime (Fase 1 — PROMPT-003)

1. **Fonte Única da Verdade (SSOT)**:
   - **Variáveis CSS (`globals.css`)**: Fonte factual única dos valores visuais em runtime (`--background`, `--foreground`, `--primary`, `--border`, etc.).
   - **TypeScript (`token-contracts.ts`)**: Define apenas os contratos tipados (`UiThemeMode`, `UiDensityMode`, `SemanticColorKey`), sem duplicar valores hexadecimais ou medidas brutas.
2. **Tema Corporativo Padrão**:
   - **Light Mode como Padrão**: A interface é carregada inicialmente em tema claro corporativo de alto contraste, com suporte a Dark Mode selecionável.
3. **Controle de Densidade**:
   - Suporte a 3 modos de densidade via atributo `data-density="compact | default | comfortable"` no elemento raiz, ajustando a escala dimensional harmônica de padding e tipografia.
4. **Primitivos Radix UI**:
   - Primitives integrados com exportação de displayNames literais estáticos e transição responsiva de drawer/modal para mobile.
