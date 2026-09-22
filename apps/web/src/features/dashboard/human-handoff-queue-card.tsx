'use client';

import * as React from 'react';
import { AlertCircle, Headphones } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@voice-agent/ui';
import type { MockHandoffItem } from '../../mocks/dashboard-mock-data';

export function HumanHandoffQueueCard({ queue }: { readonly queue: readonly MockHandoffItem[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <Headphones className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          <CardTitle className="text-base font-semibold">Fila de handoff humano</CardTitle>
        </div>
        <Badge variant="handoff" className="text-xs">
          {queue.length} em espera
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {queue.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between p-3 rounded-lg border border-violet-200/60 bg-violet-50/40 dark:border-violet-900/40 dark:bg-violet-950/20"
          >
            <div className="flex flex-col min-w-0 pr-2">
              <span className="text-sm font-semibold text-foreground truncate">
                {item.contactName}
              </span>
              <span className="text-xs text-muted-foreground truncate">
                {item.note} • <span className="font-medium text-foreground">{item.sellerName}</span>
              </span>
            </div>
            <Badge variant="handoff" className="text-xs shrink-0">
              Pronto
            </Badge>
          </div>
        ))}

        <div className="flex items-start gap-2 rounded-md bg-muted/30 p-2.5 text-xs text-muted-foreground">
          <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <span>
            Transferência assistida simulada • Conexão de voz real depende de integração do
            provider.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
