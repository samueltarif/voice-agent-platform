'use client';

import * as React from 'react';
import { Filter, Search } from 'lucide-react';
import { Button, Input } from '@voice-agent/ui';

export function CallsFilterBar() {
  const [activeFilter, setActiveFilter] = React.useState('all');

  const filters = [
    { id: 'all', label: 'Todas as chamadas' },
    { id: 'qualified', label: 'Qualificadas' },
    { id: 'handoff', label: 'Prontas para handoff' },
    { id: 'callback', label: 'Retornos' },
  ];

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por contato, empresa ou intenção..."
          className="pl-9 h-9 text-xs"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground mr-1 hidden sm:inline flex items-center gap-1">
          <Filter className="h-3 w-3" /> Filtrar:
        </span>
        {filters.map((f) => (
          <Button
            key={f.id}
            variant={activeFilter === f.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveFilter(f.id)}
            className="h-8 text-xs px-2.5"
          >
            {f.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
