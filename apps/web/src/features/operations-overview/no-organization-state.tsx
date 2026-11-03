import * as React from 'react';
import { Card, CardContent } from '@voice-agent/ui';

/** Sem organização ativa: estado explícito (sem dados de exemplo). */
export function NoOrganizationState() {
  return (
    <Card className="border-border/60 shadow-xs" data-testid="no-organization">
      <CardContent className="py-10 text-center">
        <h2 className="text-base font-semibold">Nenhuma organização ativa</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Você ainda não participa de uma organização ativa. Os dados operacionais aparecem aqui
          assim que uma organização estiver disponível.
        </p>
      </CardContent>
    </Card>
  );
}
