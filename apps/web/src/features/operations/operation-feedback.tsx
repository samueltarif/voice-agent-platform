import * as React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export const OPERATION_FIELD =
  'h-11 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';

export interface OperationFeedbackState {
  readonly kind: 'idle' | 'success' | 'error';
  readonly message?: string | undefined;
}

export const IDLE_FEEDBACK: OperationFeedbackState = { kind: 'idle' };

/** Região viva educada para sucesso; `role="alert"` para erro. */
export function OperationFeedback({
  state,
  testId,
}: {
  readonly state: OperationFeedbackState;
  readonly testId: string;
}) {
  return (
    <div aria-live="polite" data-testid={testId}>
      {state.kind === 'error' && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          <span>{state.message}</span>
        </p>
      )}
      {state.kind === 'success' && (
        <p className="flex items-start gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          <span>{state.message}</span>
        </p>
      )}
    </div>
  );
}

export function FieldLabel({
  htmlFor,
  children,
}: {
  readonly htmlFor: string;
  readonly children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="text-xs font-semibold text-foreground">
      {children}
    </label>
  );
}
