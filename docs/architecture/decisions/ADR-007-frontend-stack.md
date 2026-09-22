# ADR-007: Stack Frontend Web, Design System Compartilhado e Application Shell Mobile-First

## Status
Accepted

## Data
2026-09-22

## Contexto
O projeto Voice Agent Platform necessita de sua primeira implementação real de frontend, contemplando:
1. Aplicação web com navegação e roteamento estruturado (`apps/web`);
2. Pacote compartilhado de interface (`packages/ui`) com componentes e tokens visuais reutilizáveis;
3. Shell responsivo com suporte nativo mobile-first (`< 768px` bottom navigation + drawer) e desktop (`>= 768px` sidebar colapsável);
4. Tema claro (Light Mode) como padrão comercial corporativo B2B e tema escuro (Dark Mode) como opção secundária selecionável;
5. Persistência de preferências de interface (tema, densidade compact/default/comfortable, estado colapsado da sidebar) sem causar falhas de hidratação (hydration mismatch) no Next.js;
6. Rota técnica de desenvolvimento (`/ui-preview`) que não permaneça exposta em ambiente de produção;
7. Valores monetários modelados internamente em centavos inteiros (integer cents), mantendo a formatação restrita à camada de apresentação/view-model.

## Decisão

1. **Framework e Runtime**:
   - `apps/web`: Next.js 15 (App Router), TypeScript strict, Tailwind CSS v4.
   - `packages/ui`: Pacote agnóstico de componentes de interface, declarando `react` e `react-dom` como `peerDependencies` para evitar múltiplas cópias do runtime do React no monorepo.

2. **Single Source of Truth para Design Tokens**:
   - As variáveis CSS (`globals.css`) são a fonte primária e factual de verdade de todos os valores visuais de cores, raios, espaçamentos e sombras em runtime.
   - O TypeScript (`token-contracts.ts`) define estritamente contratos, tipos (`UiThemeMode`, `UiDensityMode`), chaves semânticas e defaults, sem duplicar valores hexadecimais ou medidas visuais brutas.
   - O tema padrão (Default) é o **Light Mode**, em linha com o padrão de templates corporativos B2B de alto nível.

3. **Tailwind CSS v4 no Monorepo**:
   - O scanner de utilitários do Tailwind v4 inclui explicitamente os arquivos de `packages/ui` através da diretiva `@source "../../../../packages/ui/src"` no `globals.css`.
   - Transpilação via `transpilePackages: ['@voice-agent/ui']` no `next.config.mjs`.

4. **Persistência de Preferências e Hidratação Segura**:
   - Funções puras de validação, parsing, default e serialização isoladas em módulo puro (`ui-preferences-storage.ts`), permitindo cobertura de testes unitários sem dependência de React.
   - Aplicação de classes no elemento raiz via script/contexto com proteção contra hydration mismatch (`suppressHydrationWarning` no elemento `<html>`).

5. **Proteção da Rota de Preview**:
   - `/ui-preview` implementa verificação determinística de ambiente: se `process.env.NODE_ENV === 'production'`, invoca imediatamente `notFound()` do Next.js.

6. **Radix Primitives**:
   - Instalação estrita dos primitives necessários para a fase: `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-tooltip`, `@radix-ui/react-avatar`, `@radix-ui/react-separator`, `@radix-ui/react-progress`, `cmdk`.
   - Todos os componentes utilizam `displayName` literais estáticos para garantir estabilidade na compilação e SSG.

## Consequências

- **Positivas**:
  - Código limpo, testável e sem duplicações de valores visuais;
  - Zero hydration mismatch entre servidor e cliente;
  - Experiência mobile nativa com bottom nav e drawer sem comprometer a densidade e ergonomia de telas desktop e ultrawide;
  - 100% de conformidade com os limites arquiteturais de tamanho de arquivo e funções da governança monorepo.
- **Compromissos**:
  - Toda nova classe usada em `packages/ui` deve estar coberta pelo scanner do Tailwind na aplicação consumidora.
