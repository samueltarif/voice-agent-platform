'use client';

import * as React from 'react';
import Link from 'next/link';
import { Badge, cn, Tooltip, TooltipContent, TooltipTrigger } from '@voice-agent/ui';

export interface SidebarNavItem {
  readonly title: string;
  readonly href: string;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly active?: boolean;
  readonly badge?: string;
  readonly disabled?: boolean;
}

function getSidebarItemClass(active?: boolean, disabled?: boolean, collapsed?: boolean): string {
  const base = 'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors';
  const state = active
    ? 'bg-primary/10 text-primary font-semibold'
    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground';
  return cn(
    base,
    state,
    disabled && 'opacity-60 cursor-not-allowed',
    collapsed && 'justify-center px-2',
  );
}

function SidebarLinkContent({
  title,
  badge,
}: {
  readonly title: string;
  readonly badge?: string | undefined;
}) {
  return (
    <>
      <span className="truncate flex-1 text-left">{title}</span>
      {badge ? (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          {badge}
        </Badge>
      ) : null}
    </>
  );
}

export function SidebarLinkItem({
  item,
  collapsed,
}: {
  readonly item: SidebarNavItem;
  readonly collapsed: boolean;
}) {
  const Icon = item.icon;
  const link = (
    <Link
      href={item.disabled ? '#' : item.href}
      className={getSidebarItemClass(item.active, item.disabled, collapsed)}
      onClick={(e) => {
        if (item.disabled) e.preventDefault();
      }}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {collapsed ? null : <SidebarLinkContent title={item.title} badge={item.badge} />}
    </Link>
  );

  if (!collapsed) return link;

  const tooltipLabel = item.badge ? `${item.title} (${item.badge})` : item.title;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{tooltipLabel}</TooltipContent>
    </Tooltip>
  );
}
