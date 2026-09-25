import * as React from 'react';
import { Building2 } from 'lucide-react';
import { cn } from '@voice-agent/ui';

export function EmptyOrgBadge({ className }: { readonly className?: string | undefined }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted/60 text-xs text-muted-foreground select-none',
        className,
      )}
    >
      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground/70" />
      <span className="truncate">Nenhuma organização ativa</span>
    </div>
  );
}

export function SingleOrgBadge({
  name,
  className,
}: {
  readonly name: string;
  readonly className?: string | undefined;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-card/60 border border-border/40 text-xs font-medium text-foreground select-none min-h-[36px]',
        className,
      )}
    >
      <Building2 className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="truncate max-w-[140px] sm:max-w-[200px]">{name}</span>
    </div>
  );
}
