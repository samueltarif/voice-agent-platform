'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, History } from 'lucide-react';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@voice-agent/ui';
import type { MockRecentCall } from '../../mocks/dashboard-mock-data';
import { formatCurrencyBrl, getOutcomeBadgeVariant, getOutcomeLabel } from './dashboard-view-model';

function RecentCallsDesktopTable({ calls }: { readonly calls: readonly MockRecentCall[] }) {
  return (
    <div className="hidden md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Lead</TableHead>
            <TableHead>Campanha</TableHead>
            <TableHead>Duração</TableHead>
            <TableHead>Resultado</TableHead>
            <TableHead className="w-1/3">Resumo da IA</TableHead>
            <TableHead className="text-right">Custo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {calls.map((call) => (
            <TableRow key={call.id}>
              <TableCell className="font-medium text-foreground">{call.contactName}</TableCell>
              <TableCell className="text-muted-foreground text-xs">{call.campaignName}</TableCell>
              <TableCell className="font-mono text-xs">{call.duration}</TableCell>
              <TableCell>
                <Badge variant={getOutcomeBadgeVariant(call.outcome)} className="text-[11px]">
                  {getOutcomeLabel(call.outcome)}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground truncate max-w-xs">
                {call.aiSummary}
              </TableCell>
              <TableCell className="text-right font-mono text-xs font-semibold text-foreground">
                {formatCurrencyBrl(call.costCents)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function RecentCallsMobileList({ calls }: { readonly calls: readonly MockRecentCall[] }) {
  return (
    <div className="md:hidden divide-y divide-border p-4 space-y-3 pt-0">
      {calls.map((call) => (
        <div key={call.id} className="pt-3 first:pt-0 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">{call.contactName}</span>
            <Badge variant={getOutcomeBadgeVariant(call.outcome)} className="text-[10px]">
              {getOutcomeLabel(call.outcome)}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{call.campaignName}</span>
            <span className="font-mono">
              {call.duration} • {formatCurrencyBrl(call.costCents)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground/90 bg-muted/30 p-2 rounded-md">
            {call.aiSummary}
          </p>
        </div>
      ))}
    </div>
  );
}

export function RecentCallsView({ calls }: { readonly calls: readonly MockRecentCall[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <CardTitle className="text-base font-semibold">Chamadas recentes</CardTitle>
        </div>
        <Link
          href="/calls"
          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <span>Ver histórico completo</span>
          <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        <RecentCallsDesktopTable calls={calls} />
        <RecentCallsMobileList calls={calls} />
      </CardContent>
    </Card>
  );
}
