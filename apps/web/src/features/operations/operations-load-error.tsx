import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@voice-agent/ui';

export function OperationsLoadError({ message }: { readonly message: string }) {
  return (
    <Card className="border-destructive/30 bg-destructive/5" data-testid="operations-load-error">
      <CardContent className="flex items-center gap-3 px-4 py-6 text-sm text-destructive">
        <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
        <span role="alert">{message}</span>
      </CardContent>
    </Card>
  );
}
