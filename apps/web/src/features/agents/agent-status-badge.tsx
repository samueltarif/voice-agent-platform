import * as React from 'react';
import { Badge } from '@voice-agent/ui';
import type { AgentStatus } from '@voice-agent/contracts';

interface AgentStatusBadgeProps {
  readonly status: AgentStatus | string;
  readonly className?: string;
}

export function AgentStatusBadge({ status, className }: AgentStatusBadgeProps) {
  if (status === 'ACTIVE') {
    return (
      <Badge
        variant="secondary"
        className={`bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs font-medium ${className ?? ''}`}
      >
        Ativo
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className={`text-muted-foreground text-xs ${className ?? ''}`}>
      Arquivado
    </Badge>
  );
}

interface AgentPublishedVersionBadgeProps {
  readonly versionNumber: number | null | undefined;
  readonly className?: string;
}

export function AgentPublishedVersionBadge({
  versionNumber,
  className,
}: AgentPublishedVersionBadgeProps) {
  if (typeof versionNumber === 'number' && versionNumber > 0) {
    return (
      <Badge
        variant="outline"
        className={`font-mono text-xs border-primary/30 text-primary font-medium ${className ?? ''}`}
      >
        {`v${versionNumber}`}
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={`text-muted-foreground text-xs font-normal border-dashed ${className ?? ''}`}
    >
      Não publicado
    </Badge>
  );
}
