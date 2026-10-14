import * as React from 'react';

export interface ListFocusTarget {
  readonly ref: React.RefObject<HTMLDivElement | null>;
  readonly restoreFocus: () => void;
}

/** Contêiner estável da lista: recebe o foco quando o gatilho da ação deixa de existir. */
export function useListFocusTarget(): ListFocusTarget {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const restoreFocus = React.useCallback(() => ref.current?.focus(), []);
  return { ref, restoreFocus };
}

/** Impede o retorno de foco ao gatilho (que pode ter sido removido) e foca a lista. */
export function handleDialogCloseAutoFocus(
  event: { preventDefault: () => void },
  restoreFocus: () => void,
): void {
  event.preventDefault();
  restoreFocus();
}
