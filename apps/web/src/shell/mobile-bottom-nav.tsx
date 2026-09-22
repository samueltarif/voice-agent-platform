'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Headphones, LayoutDashboard, Menu, Shield } from 'lucide-react';
import { cn } from '@voice-agent/ui';

interface MobileBottomNavProps {
  readonly onOpenMore: () => void;
}

export function MobileBottomNav({ onOpenMore }: MobileBottomNavProps) {
  const pathname = usePathname();

  const items = [
    {
      label: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      active: pathname === '/dashboard',
    },
    {
      label: 'Chamadas',
      href: '/calls',
      icon: Headphones,
      active: pathname === '/calls',
    },
    {
      label: 'Platform',
      href: '/platform',
      icon: Shield,
      active: pathname === '/platform',
    },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-border bg-card/95 backdrop-blur-md px-2 safe-area-bottom select-none"
      aria-label="Navegação móvel principal"
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.label}
            href={item.href}
            className={cn(
              'flex flex-col items-center justify-center min-h-[44px] min-w-[44px] flex-1 py-1 rounded-md text-xs font-medium transition-colors',
              item.active
                ? 'text-primary font-semibold'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-5 w-5 mb-1" />
            <span className="text-[11px] leading-tight">{item.label}</span>
          </Link>
        );
      })}

      <button
        type="button"
        onClick={onOpenMore}
        className="flex flex-col items-center justify-center min-h-[44px] min-w-[44px] flex-1 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        aria-label="Abrir menu de opções adicionais"
      >
        <Menu className="h-5 w-5 mb-1" />
        <span className="text-[11px] leading-tight">Mais</span>
      </button>
    </nav>
  );
}
