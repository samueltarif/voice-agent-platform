import * as React from 'react';
import { Check, Loader2 } from 'lucide-react';
import { DropdownMenuItem, cn } from '@voice-agent/ui';
import type { OrganizationSummary } from './organization-switcher';

export interface OrgDropdownItemsProps {
  readonly organizations: readonly OrganizationSummary[];
  readonly currentSlug: string;
  readonly switchingSlug: string | null;
  readonly isPending: boolean;
  readonly onSelect: (slug: string) => void;
}

export function OrgDropdownItems({
  organizations,
  currentSlug,
  switchingSlug,
  isPending,
  onSelect,
}: OrgDropdownItemsProps) {
  return (
    <>
      {organizations.map((org) => {
        const isActive = org.slug === currentSlug;
        const isItemLoading = isPending && switchingSlug === org.slug;
        return (
          <DropdownMenuItem
            key={org.slug}
            onClick={() => onSelect(org.slug)}
            className={cn(
              'flex items-center justify-between gap-2 px-2 py-2 text-xs cursor-pointer rounded-sm min-h-[40px]',
              isActive && 'bg-accent/60 font-semibold text-foreground',
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="truncate">{org.name}</span>
              {org.role && (
                <span className="text-[10px] text-muted-foreground font-normal shrink-0">
                  ({org.role.toLowerCase()})
                </span>
              )}
            </div>
            {isItemLoading ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
            ) : isActive ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-primary ml-auto" />
            ) : null}
          </DropdownMenuItem>
        );
      })}
    </>
  );
}
