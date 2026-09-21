# Diretrizes de Desenvolvimento Mobile-First (MOBILE_GUIDELINES.md)

Este documento estabelece as regras de engenharia de interface e experiência de usuário (UX) para assegurar que a plataforma opere com perfeição em dispositivos móveis e escale progressivamente para grandes resoluções.

---

## 1. O Princípio Mobile-First na Prática

1. **Estilos Base São Móveis**:
   - Todo layout e componente deve ser estilizado primeiro para a menor viewport suportada (mínimo de 320px de largura).
   - Regras de CSS com `@media (min-width: ...)` são utilizadas exclusivamente para expansão progressiva em telas maiores. O inverso (`max-width`) deve ser evitado.
2. **Proibição de Código Paralelo**:
   - É proibido criar componentes ou páginas duplicadas como `CallListMobile.tsx` e `CallListDesktop.tsx`.
   - Utilizar componentes adaptativos únicos que reagem ao container e viewport via CSS e design tokens.

---

## 2. Padrões de Navegação Adaptativa

- **Dispositivos Móveis (`< 768px`)**:
  - Navegação principal através de **Bottom Navigation Bar** fixa ou **Drawer/Off-canvas Menu** acionado por ícone acessível.
  - Ações primárias fixadas em barra de ações na parte inferior (*thumb zone*), facilitando o alcance com uma mão.
- **Tablets e Desktops (`>= 768px`)**:
  - A barra inferior se transforma automaticamente em **Sidebar lateral retrátil ou fixa**.
  - Ações contextuais movem-se para o topo ou cabeçalho da página.

---

## 3. Diretrizes de Layout e Apresentação de Dados

### 3.1. Tabelas de Dados em Telas Pequenas
Listagens complexas (histórico de chamadas, listas de contatos, catálogo de produtos):
- **No Desktop**: Exibidas em formato tabular clássico com múltiplas colunas e ordenação.
- **No Mobile**: A mesma lista deve se transformar de forma fluida em **Cartões Informativos (Cards)** verticais ou tabela com rolagem horizontal suave mantendo coluna identificadora congelada (*sticky*).

### 3.2. Áreas de Toque e Ergonomia (Touch Targets)
- Qualquer elemento clicável ou acionável (botões, links de menu, checkboxes, controles de áudio) deve possuir dimensões mínimas de **44x44px** de área física de clique.
- Espaçamento adequado entre botões para prevenir toques acidentais em ações destrutivas (ex.: botão de encerrar chamada ou excluir contato).

### 3.3. Inputs e Formulários Móveis
- Inputs numéricos e de telefone devem utilizar os atributos HTML corretos (`type="tel"`, `inputmode="numeric"`, `autocomplete`) para disparar o teclado virtual adequado no dispositivo.
- Prevenir zoom indesejado no iOS garantindo tamanho de fonte mínimo de 16px (`1rem`) em campos de entrada.

---

## 4. Reprodutor de Áudio e Transcrição em Mobile

O reprodutor de chamadas é peça central do produto:
- No mobile, o player de áudio deve ser compacto, fixável no rodapé durante a leitura da transcrição.
- A transcrição deve apresentar bolhas de diálogo verticais distinguindo claramente o agente e o interlocutor com cores e alinhamentos contextuais.
- Suporte a rolagem sincronizada (*auto-scroll*) que acompanha a reprodução do áudio sem desorientar o usuário em telas compactas.
