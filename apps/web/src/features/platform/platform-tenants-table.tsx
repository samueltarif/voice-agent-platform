'use client';

import * as React from 'react';
import { Building2 } from 'lucide-react';
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
import type { MockPlatformTenant } from '../../mocks/platform-mock-data';
import { formatCurrencyBrl } from '../dashboard/dashboard-view-model';

function TenantsDesktopTable({ tenants }: { readonly tenants: readonly MockPlatformTenant[] }) {
  return (
    <div className="hidden md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Organização</TableHead>
            <TableHead>Plano Contratado</TableHead>
            <TableHead>Status Operacional</TableHead>
            <TableHead className="text-right">Minutos Utilizados</TableHead>
            <TableHead className="text-right">Faturamento Previsto</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tenants.map((tenant) => (
            <TableRow key={tenant.id}>
              <TableCell className="font-semibold text-foreground">{tenant.name}</TableCell>
              <TableCell>
                <Badge variant="secondary" className="text-xs">
                  {tenant.plan}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge
                  variant={tenant.status === 'ACTIVE' ? 'success' : 'warning'}
                  className="text-[11px]"
                >
                  {tenant.status === 'ACTIVE' ? 'Ativo' : 'Trial'}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-mono text-xs">
                {tenant.minutesUsed.toLocaleString('pt-BR')} min
              </TableCell>
              <TableCell className="text-right font-mono text-xs font-semibold text-foreground">
                {formatCurrencyBrl(tenant.monthlySpendCents)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function TenantsMobileList({ tenants }: { readonly tenants: readonly MockPlatformTenant[] }) {
  return (
    <div className="md:hidden divide-y divide-border p-4 space-y-3 pt-0">
      {tenants.map((tenant) => (
        <div key={tenant.id} className="pt-3 first:pt-0 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">{tenant.name}</span>
            <Badge
              variant={tenant.status === 'ACTIVE' ? 'success' : 'warning'}
              className="text-[10px]"
            >
              {tenant.status === 'ACTIVE' ? 'Ativo' : 'Trial'}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Plano: {tenant.plan}</span>
            <span className="font-mono">
              {tenant.minutesUsed} min • {formatCurrencyBrl(tenant.monthlySpendCents)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PlatformTenantsTable({
  tenants,
}: {
  readonly tenants: readonly MockPlatformTenant[];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <CardTitle className="text-base font-semibold">Organizações Ativas (Preview)</CardTitle>
        </div>
        <Badge variant="outline" className="text-xs">
          {tenants.length} tenants
        </Badge>
      </CardHeader>
      <CardContent className="p-0">
        <TenantsDesktopTable tenants={tenants} />
        <TenantsMobileList tenants={tenants} />
      </CardContent>
    </Card>
  );
}
