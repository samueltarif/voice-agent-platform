'use client';

import * as React from 'react';
import Link from 'next/link';
import { Activity, Bot, Moon, Radio, Settings, Shield, Sun, Users } from 'lucide-react';
import {
  Badge,
  Button,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@voice-agent/ui';
import { useUiPreferences } from '../preferences/ui-preferences-context';
import type { OrganizationSummary } from './organization-switcher';

interface MobileMenuDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly currentOrg?: OrganizationSummary | null | undefined;
}

function MobileMenuModules({
  currentOrg,
  onOpenChange,
}: {
  readonly currentOrg?: OrganizationSummary | null | undefined;
  readonly onOpenChange: (open: boolean) => void;
}) {
  return (
    <div className="space-y-1">
      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2">
        Módulos
      </span>
      <div className="flex items-center justify-between p-2 rounded-md hover:bg-accent text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <Activity className="h-4 w-4" /> Campanhas
        </span>
        <Badge variant="outline" className="text-[10px]">
          Preview
        </Badge>
      </div>
      <div className="flex items-center justify-between p-2 rounded-md hover:bg-accent text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <Users className="h-4 w-4" /> Leads
        </span>
        <Badge variant="outline" className="text-[10px]">
          Em breve
        </Badge>
      </div>
      {currentOrg?.slug ? (
        <Link
          href={`/orgs/${currentOrg.slug}/agents`}
          onClick={() => onOpenChange(false)}
          className="flex items-center justify-between p-2 rounded-md hover:bg-accent text-sm text-foreground"
        >
          <span className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" /> Agente IA
          </span>
        </Link>
      ) : (
        <div className="flex items-center justify-between p-2 rounded-md hover:bg-accent text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <Bot className="h-4 w-4" /> Agente IA
          </span>
          <Badge variant="outline" className="text-[10px]">
            Em breve
          </Badge>
        </div>
      )}
      <div className="flex items-center justify-between p-2 rounded-md hover:bg-accent text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <Settings className="h-4 w-4" /> Configurações
        </span>
        <Badge variant="outline" className="text-[10px]">
          Em breve
        </Badge>
      </div>
    </div>
  );
}

function MobileMenuPreferences() {
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

export function MobileMenuDrawer({ open, onOpenChange, currentOrg }: MobileMenuDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[85vw] max-w-sm flex flex-col p-6 overflow-y-auto">
        <SheetHeader className="text-left pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold shrink-0">
              <Radio className="h-4 w-4" />
            </div>
            <SheetTitle className="text-base font-semibold">Voice Agent Platform</SheetTitle>
          </div>
          <SheetDescription className="text-xs text-muted-foreground">
            Menu e preferências de navegação móvel
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 py-4 space-y-4">
          <MobileMenuModules currentOrg={currentOrg} onOpenChange={onOpenChange} />
          <Separator />
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2">
              Ambientes
            </span>
            <Link
              href="/platform"
              onClick={() => onOpenChange(false)}
              className="flex items-center justify-between p-2 rounded-md hover:bg-accent text-sm font-medium text-foreground"
            >
              <span className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" /> Platform Control Plane
              </span>
              <Badge variant="outline" className="text-[10px]">
                Preview
              </Badge>
            </Link>
          </div>
          <Separator />
          <MobileMenuPreferences />
        </div>

        <div className="pt-4 border-t border-border space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
            <span>Telefonia: Provider não conectado</span>
          </div>
          <div className="text-[11px]">Multi-tenant • Workspace Demo</div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
