import * as React from 'react';

export interface IngestFieldProps {
  readonly id: string;
  readonly label: string;
  readonly required?: boolean;
  readonly error?: string | undefined;
  readonly hint?: string;
  readonly children: React.ReactNode;
}

export function IngestField({ id, label, required, error, hint, children }: IngestFieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-foreground">
        {label}{' '}
        {required ? (
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        ) : (
          <span className="font-normal text-muted-foreground">(opcional)</span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-[11px] text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
