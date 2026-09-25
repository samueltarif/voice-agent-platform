'use client';

import * as React from 'react';
import { Building2, ChevronsUpDown, Loader2 } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from '@voice-agent/ui';
import { EmptyOrgBadge, SingleOrgBadge } from './organization-switcher-badge';
import { OrgDropdownItems } from './organization-dropdown-items';

export interface OrganizationSummary {
  readonly slug: string;
  readonly name: string;
  readonly role?: string | undefined;
}

export interface OrganizationSwitcherProps {
  readonly currentOrg?: OrganizationSummary | null | undefined;
  readonly organizations?: readonly OrganizationSummary[] | undefined;
  readonly onSwitch?: ((slug: string) => Promise<void>) | undefined;
  readonly disabled?: boolean | undefined;
  readonly className?: string | undefined;
}

function OrgDropdownTrigger({
  name,
  disabled,
  isPending,
  className,
}: {
  readonly name: string;
  readonly disabled?: boolean | undefined;
  readonly isPending: boolean;
  readonly className?: string | undefined;
}) {
  return (
    <DropdownMenuTrigger asChild>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || isPending}
        className={cn(
          'flex items-center justify-between gap-2 text-xs font-medium h-9 min-h-[36px] px-2.5 bg-card/80 border-border/70 hover:bg-accent/80 hover:text-foreground text-foreground max-w-[180px] sm:max-w-[220px]',
          className,
        )}
        aria-label={`Organização ativa: ${name}. Clique para trocar.`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
          ) : (
            <Building2 className="h-3.5 w-3.5 shrink-0 text-primary" />
          )}
          <span className="truncate">{name}</span>
        </div>
        <ChevronsUpDown className="h-3 w-3 shrink-0 text-muted-foreground ml-1" />
      </Button>
    </DropdownMenuTrigger>
  );
}

function navigateAfterSwitch(currentSlug?: string, targetSlug?: string): void {
  const currentPath = window.location.pathname;
  if (currentSlug && currentPath.startsWith(`/orgs/${currentSlug}/`)) {
    window.location.href = currentPath.replace(`/orgs/${currentSlug}/`, `/orgs/${targetSlug}/`);
    return;
  }
  if (currentSlug && currentPath === `/orgs/${currentSlug}`) {
    window.location.href = `/orgs/${targetSlug}`;
    return;
  }
  window.location.reload();
}

export function OrganizationSwitcher({
  currentOrg,
  organizations = [],
  onSwitch,
  disabled = false,
  className,
}: OrganizationSwitcherProps) {
  const [isPending, startTransition] = React.useTransition();
  const [switchingSlug, setSwitchingSlug] = React.useState<string | null>(null);

  const handleSelect = React.useCallback(
    (slug: string) => {
      if (slug === currentOrg?.slug || isPending) return;
      setSwitchingSlug(slug);
      startTransition(async () => {
        try {
          if (onSwitch) {
            await onSwitch(slug);
            return;
          }
          const res = await fetch('/api/organization/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug }),
          });
          if (res.ok) {
            navigateAfterSwitch(currentOrg?.slug, slug);
          }
        } finally {
          setSwitchingSlug(null);
        }
      });
    },
    [currentOrg?.slug, isPending, onSwitch],
  );

  if (!currentOrg) return <EmptyOrgBadge className={className} />;
  if (organizations.length <= 1) {
    return <SingleOrgBadge name={currentOrg.name} className={className} />;
  }

  return (
    <DropdownMenu>
      <OrgDropdownTrigger
        name={currentOrg.name}
        disabled={disabled}
        isPending={isPending}
        className={className}
      />
      <DropdownMenuContent align="start" className="w-56 p-1">
        <DropdownMenuLabel className="text-[11px] text-muted-foreground uppercase tracking-wider px-2 py-1">
          Minhas Organizações
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <OrgDropdownItems
          organizations={organizations}
          currentSlug={currentOrg.slug}
          switchingSlug={switchingSlug}
          isPending={isPending}
          onSelect={handleSelect}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
