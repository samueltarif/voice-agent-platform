'use client';

import * as React from 'react';
import Link from 'next/link';
import { Activity, BookOpen, Bot, Radio, Settings, Shield, Users } from 'lucide-react';
import {
  Badge,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@voice-agent/ui';
import type { OrganizationSummary } from './organization-switcher';
import { MobileMenuPreferences } from './mobile-menu-preferences';

interface MobileMenuDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly currentOrg?: OrganizationSummary | null | undefined;
}

function OrgModuleLink({
  slug,
  segment,
  label,
  icon,
  onOpenChange,
}: {
  readonly slug?: string | undefined;
  readonly segment: string;
  readonly label: string;
  readonly icon: React.ReactNode;
  readonly onOpenChange: (open: boolean) => void;
}) {
  if (!slug) {
    return (
      <div className="flex items-center justify-between p-2 rounded-md hover:bg-accent text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          {icon} {label}
        </span>
        <Badge variant="outline" className="text-[10px]">
          Em breve
        </Badge>
      </div>
    );
  }
  return (
    <Link
      href={`/orgs/${slug}/${segment}`}
      onClick={() => onOpenChange(false)}
      className="flex items-center justify-between p-2 rounded-md hover:bg-accent text-sm text-foreground"
    >
      <span className="flex items-center gap-2">
        <span className="text-primary flex items-center">{icon}</span> {label}
      </span>
    </Link>
  );
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
      <OrgModuleLink
        slug={currentOrg?.slug}
        segment="campaigns"
        label="Campanhas"
        icon={<Activity className="h-4 w-4" />}
        onOpenChange={onOpenChange}
      />
      <OrgModuleLink
        slug={currentOrg?.slug}
        segment="contacts"
        label="Contatos"
        icon={<Users className="h-4 w-4" />}
        onOpenChange={onOpenChange}
      />
      <OrgModuleLink
        slug={currentOrg?.slug}
        segment="agents"
        label="Agente IA"
        icon={<Bot className="h-4 w-4" />}
        onOpenChange={onOpenChange}
      />
      <OrgModuleLink
        slug={currentOrg?.slug}
        segment="knowledge"
        label="Base de Conhecimento"
        icon={<BookOpen className="h-4 w-4" />}
        onOpenChange={onOpenChange}
      />
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
