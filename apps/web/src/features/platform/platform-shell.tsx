'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Cpu,
  CreditCard,
  FileText,
  KeyRound,
  LayoutDashboard,
  Shield,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { Badge, Button, cn } from '@voice-agent/ui';
import { PLATFORM_ADMIN_DISCLAIMER } from '../../mocks/platform-mock-data';

interface PlatformShellProps {
  readonly children: React.ReactNode;
}

interface PlatformNavItem {
  readonly title: string;
  readonly href: string;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly active?: boolean;
  readonly disabled?: boolean;
  readonly badge?: string;
}

function PlatformSidebarNav({ items }: { readonly items: readonly PlatformNavItem[] }) {
  return (
    <aside className="hidden md:flex flex-col w-64 border-r border-border bg-card shrink-0 select-none">
      <div className="flex h-16 items-center gap-2 px-4 border-b border-border bg-muted/20">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold shrink-0">
          <Shield className="h-4 w-4" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-semibold text-foreground truncate">Control Plane</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Platform Admin
          </span>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.title}
              href={item.disabled ? '#' : item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                item.active
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                item.disabled && 'opacity-60 cursor-not-allowed',
              )}
              onClick={(e) => {
                if (item.disabled) e.preventDefault();
              }}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate flex-1">{item.title}</span>
              {item.badge && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {item.badge}
                </Badge>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border">
        <Link href="/dashboard">
          <Button variant="outline" size="sm" className="w-full gap-2 text-xs">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Voltar ao Tenant</span>
          </Button>
        </Link>
      </div>
    </aside>
  );
}

function PlatformDisclaimerBar() {
  return (
    <div className="flex items-center justify-between bg-violet-500/10 px-4 sm:px-6 py-2 border-b border-violet-500/20 text-xs text-violet-800 dark:text-violet-300">
      <span className="flex items-center gap-1.5 font-medium truncate">
        <AlertTriangle className="h-3.5 w-3.5 text-violet-600 shrink-0" />
        <span className="truncate">{PLATFORM_ADMIN_DISCLAIMER}</span>
      </span>
      <Link href="/dashboard" className="md:hidden shrink-0 ml-2">
        <Button variant="ghost" size="sm" className="text-xs h-7 px-2">
          Voltar
        </Button>
      </Link>
    </div>
  );
}

export function PlatformShell({ children }: PlatformShellProps) {
  const pathname = usePathname();

  const navItems: readonly PlatformNavItem[] = [
    {
      title: 'Visão Geral',
      href: '/platform',
      icon: LayoutDashboard,
      active: pathname === '/platform',
    },
    { title: 'Empresas', href: '#', icon: Building2, disabled: true, badge: 'Em breve' },
    {
      title: 'Planos & Entitlements',
      href: '#',
      icon: SlidersHorizontal,
      disabled: true,
      badge: 'Em breve',
    },
    { title: 'Acessos & Roles', href: '#', icon: KeyRound, disabled: true, badge: 'Em breve' },
    { title: 'Assinaturas', href: '#', icon: CreditCard, disabled: true, badge: 'Em breve' },
    { title: 'Uso & Telefonia', href: '#', icon: Cpu, disabled: true, badge: 'Em breve' },
    { title: 'Custos de Providers', href: '#', icon: Users, disabled: true, badge: 'Em breve' },
    { title: 'Auditoria & Logs', href: '#', icon: FileText, disabled: true, badge: 'Em breve' },
  ];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <PlatformSidebarNav items={navItems} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <PlatformDisclaimerBar />
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-8 pb-12">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
