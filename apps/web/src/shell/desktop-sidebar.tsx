'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Bot,
  ChevronLeft,
  ChevronRight,
  Headphones,
  LayoutDashboard,
  Radio,
  Settings,
  ShieldAlert,
  Users,
} from 'lucide-react';
import {
  Button,
  cn,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@voice-agent/ui';
import { useUiPreferences } from '../preferences/ui-preferences-context';
import { SidebarLinkItem, type SidebarNavItem } from './sidebar-link-item';
import type { OrganizationSummary } from './organization-switcher';

function SidebarBrandHeader({
  collapsed,
  onToggle,
  currentOrg,
}: {
  readonly collapsed: boolean;
  readonly onToggle: () => void;
  readonly currentOrg?: OrganizationSummary | null | undefined;
}) {
  return (
    <div className="flex h-16 items-center justify-between px-4 border-b border-border">
      {!collapsed ? (
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold shrink-0">
            <Radio className="h-4 w-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-foreground truncate">
              {currentOrg?.name ?? 'Voice Agent'}
            </span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">
              {currentOrg?.slug ?? 'Multi-Tenant'}
            </span>
          </div>
        </div>
      ) : (
        <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
          <Radio className="h-4 w-4" />
        </div>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground"
        onClick={onToggle}
        aria-label={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </Button>
    </div>
  );
}

function SidebarFooterStatus({ collapsed }: { readonly collapsed: boolean }) {
  if (collapsed) {
    return (
      <div className="p-3 border-t border-border flex justify-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="p-1">
              <ShieldAlert className="h-4 w-4 text-amber-500" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">Telefonia: Provider não conectado</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="p-3 border-t border-border space-y-2">
      <div className="flex items-center gap-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
        <div className="flex flex-col min-w-0">
          <span className="font-medium text-foreground truncate">Telefonia</span>
          <span className="text-[10px] truncate">Provider não conectado</span>
        </div>
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
        <span className="truncate">Workspace Demo</span>
        <span className="text-[10px] text-primary">v0.1</span>
      </div>
    </div>
  );
}

export interface DesktopSidebarProps {
  readonly currentOrg?: OrganizationSummary | null | undefined;
}

export function DesktopSidebar({ currentOrg }: DesktopSidebarProps = {}) {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUiPreferences();

  const navItems: readonly SidebarNavItem[] = React.useMemo(
    () => [
      {
        title: 'Dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
        active: pathname === '/dashboard',
      },
      { title: 'Chamadas', href: '/calls', icon: Headphones, active: pathname === '/calls' },
      { title: 'Campanhas', href: '#', icon: Activity, badge: 'Preview', disabled: true },
      { title: 'Leads', href: '#', icon: Users, badge: 'Em breve', disabled: true },
      { title: 'Agente IA', href: '#', icon: Bot, badge: 'Em breve', disabled: true },
      { title: 'Configurações', href: '#', icon: Settings, badge: 'Em breve', disabled: true },
    ],
    [pathname],
  );

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col border-r border-border bg-card transition-all duration-300 ease-in-out shrink-0 select-none',
        sidebarCollapsed ? 'w-16' : 'w-64',
      )}
    >
      <SidebarBrandHeader
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
        currentOrg={currentOrg}
      />
      <TooltipProvider delayDuration={150}>
        <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
          {navItems.map((item) => (
            <SidebarLinkItem key={item.title} item={item} collapsed={sidebarCollapsed} />
          ))}
        </nav>
        <SidebarFooterStatus collapsed={sidebarCollapsed} />
      </TooltipProvider>
    </aside>
  );
}
