'use client';

import * as React from 'react';
import { Command, Moon, Sun } from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@voice-agent/ui';
import { useUiPreferences } from '../preferences/ui-preferences-context';

interface AppTopbarProps {
  readonly title: string;
  readonly onOpenCommandPalette: () => void;
}

function TopbarCommandButton({ onOpen }: { readonly onOpen: () => void }) {
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={onOpen}
        className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground h-9 px-3"
        aria-label="Abrir Command Palette"
      >
        <Command className="h-3.5 w-3.5" />
        <span>Buscar comandos...</span>
        <kbd className="pointer-events-none rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          Ctrl+K
        </kbd>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onOpen}
        className="sm:hidden h-9 w-9 text-muted-foreground hover:text-foreground"
        aria-label="Abrir Command Palette"
      >
        <Command className="h-4 w-4" />
      </Button>
    </>
  );
}

function TopbarDensityMenu() {
  const { density, setDensity } = useUiPreferences();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="hidden lg:flex text-xs h-9 text-muted-foreground hover:text-foreground px-2"
        >
          Densidade: <span className="font-semibold ml-1 capitalize">{density}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuLabel>Densidade da UI</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setDensity('compact')}>
          Compacto {density === 'compact' && '✓'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setDensity('default')}>
          Padrão {density === 'default' && '✓'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setDensity('comfortable')}>
          Espaçoso {density === 'comfortable' && '✓'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppTopbar({ title, onOpenCommandPalette }: AppTopbarProps) {
  const { theme, setTheme } = useUiPreferences();

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-border bg-card/80 backdrop-blur-md px-4 sm:px-6 select-none">
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-base sm:text-lg font-semibold text-foreground truncate">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <TopbarCommandButton onOpen={onOpenCommandPalette} />
        <TopbarDensityMenu />

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
          aria-label={theme === 'dark' ? 'Alternar para tema claro' : 'Alternar para tema escuro'}
        >
          {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>

        <Avatar className="h-8 w-8 ml-1 border border-border">
          <AvatarFallback className="bg-primary/10 text-primary font-medium text-xs">
            OP
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
