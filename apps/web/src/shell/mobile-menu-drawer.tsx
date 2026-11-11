'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Radio, Settings, Shield } from 'lucide-react';
import {
  Badge,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@voice-agent/ui';
import { NOT_IMPLEMENTED_BADGE, orgNavItems, type NavOrgContext } from './org-nav-item';
import type { SidebarNavItem } from './sidebar-link-item';
import { MobileMenuPreferences } from './mobile-menu-preferences';

interface MobileMenuDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly nav: NavOrgContext;
}

function UnavailableModule({ item }: { readonly item: SidebarNavItem }) {
  const Icon = item.icon;
  return (
    <div
      aria-disabled="true"
      className="flex items-center justify-between p-2 rounded-md text-sm text-muted-foreground"
    >
      <span className="flex items-center gap-2">
        <Icon className="h-4 w-4" aria-hidden /> {item.title}
      </span>
      <Badge variant="outline" className="text-[10px]">
        {item.badge}
      </Badge>
    </div>
  );
}

function ModuleLink({
  item,
  onOpenChange,
}: {
  readonly item: SidebarNavItem;
  readonly onOpenChange: (open: boolean) => void;
}) {
  if (item.disabled) return <UnavailableModule item={item} />;
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={() => onOpenChange(false)}
      aria-current={item.active ? 'page' : undefined}
      className="flex items-center justify-between p-2 rounded-md hover:bg-accent text-sm text-foreground"
    >
      <span className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" aria-hidden /> {item.title}
      </span>
    </Link>
  );
}

/** Mesmos módulos, rótulos e motivos do menu desktop (fonte única: `org-nav-item`). */
export function MobileMenuModules({
  nav,
  pathname,
  onOpenChange,
}: {
  readonly nav: NavOrgContext;
  readonly pathname: string;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const settings: SidebarNavItem = {
    title: 'Configurações',
    href: '#',
    icon: Settings,
    disabled: true,
    badge: NOT_IMPLEMENTED_BADGE,
  };
  return (
    <div className="space-y-1">
      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2">
        Módulos
      </span>
      {[...orgNavItems(nav, pathname), settings].map((item) => (
        <ModuleLink key={item.title} item={item} onOpenChange={onOpenChange} />
      ))}
    </div>
  );
}

export function MobileMenuDrawer({ open, onOpenChange, nav }: MobileMenuDrawerProps) {
  const pathname = usePathname();
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
          <MobileMenuModules nav={nav} pathname={pathname} onOpenChange={onOpenChange} />
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
                Demonstração
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
          <div className="text-[11px]">Ambiente offline · sem discagem real</div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
