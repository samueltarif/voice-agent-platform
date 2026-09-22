'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Headphones, LayoutDashboard, Moon, Shield, Sliders, Sun } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@voice-agent/ui';
import { useUiPreferences } from '../../preferences/ui-preferences-context';

interface CommandPaletteDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function CommandPaletteDialog({ open, onOpenChange }: CommandPaletteDialogProps) {
  const router = useRouter();
  const { theme, setTheme, density, setDensity } = useUiPreferences();

  const handleSelect = (action: () => void) => {
    action();
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Digite um comando ou busque uma rota..." />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>

        <CommandGroup heading="Navegação">
          <CommandItem onSelect={() => handleSelect(() => router.push('/dashboard'))}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            <span>Central de Operações (Dashboard)</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => router.push('/calls'))}>
            <Headphones className="mr-2 h-4 w-4" />
            <span>Chamadas ao Vivo &amp; Transcrições</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => router.push('/platform'))}>
            <Shield className="mr-2 h-4 w-4" />
            <span>Platform Control Plane (Preview)</span>
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading="Preferências Visuais">
          <CommandItem
            onSelect={() => handleSelect(() => setTheme(theme === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? (
              <Sun className="mr-2 h-4 w-4 text-amber-500" />
            ) : (
              <Moon className="mr-2 h-4 w-4 text-primary" />
            )}
            <span>Alternar para tema {theme === 'dark' ? 'Claro' : 'Escuro'}</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => setDensity('compact'))}>
            <Sliders className="mr-2 h-4 w-4" />
            <span>Densidade: Compacta {density === 'compact' && '✓'}</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => setDensity('default'))}>
            <Sliders className="mr-2 h-4 w-4" />
            <span>Densidade: Padrão {density === 'default' && '✓'}</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => setDensity('comfortable'))}>
            <Sliders className="mr-2 h-4 w-4" />
            <span>Densidade: Espaçosa (Confortável) {density === 'comfortable' && '✓'}</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
