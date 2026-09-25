import * as React from 'react';
import Link from 'next/link';
import { Bot, Plus } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@voice-agent/ui';
import type { AgentMetadataResponse } from '@voice-agent/contracts';
import { AgentStatusBadge, AgentPublishedVersionBadge } from './agent-status-badge';
import { formatAgentDate } from './agent-date-formatter';

interface AgentListProps {
  readonly agents: readonly AgentMetadataResponse[];
  readonly canCreate: boolean;
  readonly orgSlug: string;
}

function AgentListEmptyState({
  canCreate,
  orgSlug,
}: {
  readonly canCreate: boolean;
  readonly orgSlug: string;
}) {
  return (
    <Card className="border-border/60 shadow-xs">
      <CardContent className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4 text-primary">
          <Bot className="h-6 w-6" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">Nenhum agente criado ainda</h3>
        <p className="text-xs sm:text-sm text-muted-foreground max-w-sm mb-6">
          {canCreate
            ? 'Crie seu primeiro agente de IA para começar a gerenciar fluxos de atendimento.'
            : 'Esta organização ainda não possui agentes de IA cadastrados.'}
        </p>
        {canCreate && (
          <Button asChild size="sm" className="gap-2 h-9 text-xs min-h-[44px]">
            <Link href={`/orgs/${orgSlug}/agents/new`}>
              <Plus className="h-4 w-4" />
              <span>Criar agente</span>
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function AgentMobileCard({ agent }: { readonly agent: AgentMetadataResponse }) {
  return (
    <div
      key={agent.id}
      data-testid={`agent-card-${agent.slug}`}
      className="p-4 rounded-lg border border-border/70 bg-card space-y-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5 min-w-0">
          <span className="font-semibold text-sm text-foreground truncate block">{agent.name}</span>
          <span className="font-mono text-xs text-muted-foreground truncate block">
            {agent.slug}
          </span>
        </div>
        <AgentStatusBadge status={agent.status} />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/40">
        <div className="flex items-center gap-1.5">
          <span>Versão:</span>
          <AgentPublishedVersionBadge versionNumber={agent.currentPublishedVersionNumber} />
        </div>
        <span>{formatAgentDate(agent.updatedAt)}</span>
      </div>
    </div>
  );
}

export function AgentList({ agents, canCreate, orgSlug }: AgentListProps) {
  if (agents.length === 0) {
    return <AgentListEmptyState canCreate={canCreate} orgSlug={orgSlug} />;
  }

  return (
    <div className="space-y-4">
      {/* Desktop Table View (>= 768px) */}
      <div className="hidden md:block rounded-lg border border-border/70 bg-card overflow-hidden shadow-xs">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border/60">
              <TableHead className="font-semibold text-xs text-foreground">Nome</TableHead>
              <TableHead className="font-semibold text-xs text-foreground">Slug</TableHead>
              <TableHead className="font-semibold text-xs text-foreground">Status</TableHead>
              <TableHead className="font-semibold text-xs text-foreground">
                Versão publicada
              </TableHead>
              <TableHead className="font-semibold text-xs text-foreground text-right">
                Atualização
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agents.map((agent) => (
              <TableRow
                key={agent.id}
                data-testid={`agent-row-${agent.slug}`}
                className="border-border/40 hover:bg-muted/40 transition-colors"
              >
                <TableCell className="font-medium text-sm text-foreground">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-primary shrink-0" />
                    <span>{agent.name}</span>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {agent.slug}
                </TableCell>
                <TableCell>
                  <AgentStatusBadge status={agent.status} />
                </TableCell>
                <TableCell>
                  <AgentPublishedVersionBadge versionNumber={agent.currentPublishedVersionNumber} />
                </TableCell>
                <TableCell className="text-right font-mono text-xs text-muted-foreground">
                  {formatAgentDate(agent.updatedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card View (< 768px) */}
      <div className="md:hidden space-y-3">
        {agents.map((agent) => (
          <AgentMobileCard key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  );
}
