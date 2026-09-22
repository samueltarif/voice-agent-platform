'use client';

import * as React from 'react';
import { PhoneForwarded, Radio } from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@voice-agent/ui';
import type { MockLiveCall } from '../../mocks/dashboard-mock-data';
import { getCallStatusBadgeVariant, getCallStatusLabel } from './dashboard-view-model';

export function LiveCallsPanel({ calls }: { readonly calls: readonly MockLiveCall[] }) {
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-emerald-600 animate-pulse" />
          <CardTitle className="text-base font-semibold">Chamadas ao vivo</CardTitle>
        </div>
        <Badge variant="success" className="text-xs">
          {calls.length} ativas
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {calls.map((call) => (
          <div
            key={call.id}
            className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {call.contactName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-foreground truncate">
                  {call.contactName}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  {call.companyName} •{' '}
                  <span className="font-medium text-foreground/80">{call.intent}</span>
                </span>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
              <span className="font-mono text-xs font-semibold text-foreground">
                {call.duration}
              </span>
              <Badge
                variant={getCallStatusBadgeVariant(call.status)}
                className="text-[10px] px-1.5 py-0"
              >
                {getCallStatusLabel(call.status)}
              </Badge>
            </div>
          </div>
        ))}

        <div className="pt-2 text-center text-[11px] text-muted-foreground flex items-center justify-center gap-1.5">
          <PhoneForwarded className="h-3 w-3 text-muted-foreground" />
          <span>Monitoramento mock • Sem áudio ou telefonia real conectada</span>
        </div>
      </CardContent>
    </Card>
  );
}
