'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@voice-agent/ui';
import { useUiPreferences } from '../preferences/ui-preferences-context';

export function MobileMenuPreferences() {
  const { theme, setTheme, density, setDensity } = useUiPreferences();

  return (
    <div className="space-y-3 px-1">
      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        Preferências Visuais
      </span>
      <div className="flex items-center justify-between">
        <span className="text-sm text-foreground">Tema</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="gap-2 text-xs min-h-[44px]"
        >
          {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          {theme === 'dark' ? 'Escuro' : 'Claro'}
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-foreground">Densidade</span>
        <div className="flex gap-1">
          {(['compact', 'default', 'comfortable'] as const).map((d) => (
            <Button
              key={d}
              variant={density === d ? 'default' : 'outline'}
              size="sm"
              className="h-8 text-xs px-2"
              onClick={() => setDensity(d)}
            >
              {d === 'compact' ? 'C' : d === 'default' ? 'D' : 'E'}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
