import * as React from 'react';
import type { AgentVersionMetadataResponse } from '@voice-agent/contracts';
import { Card, CardHeader, CardTitle, CardContent } from '@voice-agent/ui';
import { History } from 'lucide-react';
import { AgentVersionStatusBadge } from './agent-version-status-badge.js';
import { formatAgentDate } from './agent-date-formatter.js';

interface AgentVersionHistoryProps {
  readonly versions: readonly AgentVersionMetadataResponse[];
  readonly selectedVersionId: string | null;
  readonly onSelectVersion: (versionId: string) => void;
  readonly disabled?: boolean;
}

function resolveVersionDate(version: AgentVersionMetadataResponse): string {
  if (version.publishedAt) {
    return `Publicado em ${formatAgentDate(version.publishedAt)}`;
  }
  return `Atualizado em ${formatAgentDate(version.updatedAt)}`;
}

export function AgentVersionHistory({
  versions,
  selectedVersionId,
  onSelectVersion,
  disabled = false,
}: AgentVersionHistoryProps) {
  const sortedVersions = React.useMemo(() => {
    return [...versions].sort((a, b) => b.versionNumber - a.versionNumber);
  }, [versions]);

  return (
    <Card className="border-border/80 shadow-xs" data-testid="agent-version-history">
      <CardHeader className="py-3 px-4 border-b border-border/60">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold text-foreground">
            Histórico de Versões
          </CardTitle>
          <span className="text-xs text-muted-foreground ml-auto font-mono">
            {sortedVersions.length}
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-2 space-y-1">
        {sortedVersions.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Nenhuma versão registrada.
          </p>
        ) : (
          <div className="space-y-1" role="listbox" aria-label="Versões do agente">
            {sortedVersions.map((v) => {
              const isSelected = v.id === selectedVersionId;
              return (
                <button
                  key={v.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={disabled}
                  onClick={() => onSelectVersion(v.id)}
                  data-testid={`version-item-${v.versionNumber}`}
                  className={`w-full text-left p-3 rounded-md transition-colors min-h-[44px] flex flex-col gap-1 border ${
                    isSelected
                      ? 'bg-primary/10 border-primary/30 text-foreground'
                      : 'border-transparent hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-bold text-foreground">
                      {`v${v.versionNumber}`}
                    </span>
                    <AgentVersionStatusBadge status={v.status} />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{resolveVersionDate(v)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
