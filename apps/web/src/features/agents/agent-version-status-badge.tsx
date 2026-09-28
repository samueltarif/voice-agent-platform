import * as React from 'react';
import { Badge } from '@voice-agent/ui';
import type { AgentVersionStatus } from '@voice-agent/contracts';

interface AgentVersionStatusBadgeProps {
  readonly status: AgentVersionStatus | string;
  readonly className?: string;
}

export function AgentVersionStatusBadge({ status, className }: AgentVersionStatusBadgeProps) {
  if (status === 'PUBLISHED') {
    return (
      <Badge
        variant="secondary"
        data-testid="badge-version-published"
        className={`bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs font-medium ${className ?? ''}`}
      >
        Publicado
      </Badge>
    );
  }

  if (status === 'DRAFT') {
    return (
      <Badge
        variant="secondary"
        data-testid="badge-version-draft"
        className={`bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-xs font-medium ${className ?? ''}`}
      >
        Rascunho
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      data-testid="badge-version-archived"
      className={`text-muted-foreground text-xs font-normal border-border/60 ${className ?? ''}`}
    >
      Arquivado
    </Badge>
  );
}
