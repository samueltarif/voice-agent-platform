'use client';

import * as React from 'react';
import { Bot, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@voice-agent/ui';

interface AgentItem {
  readonly id: string;
  readonly name: string;
  readonly status?: string | undefined;
}

interface AgentsResponse {
  readonly organization?: { readonly slug: string; readonly name: string } | undefined;
  readonly agents?: readonly AgentItem[] | undefined;
  readonly error?: string | undefined;
}

export function OrganizationAgentsCard() {
  const [data, setData] = React.useState<AgentsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let isMounted = true;
    fetch('/api/agents')
      .then((res) => (res.ok ? res.json() : null))
      .then((resData) => {
        if (!isMounted) return;
        setData(resData);
        setLoading(false);
      })
      .catch(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const agents = data?.agents ?? [];

  return (
    <Card className="border-border/60 shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-semibold">Agentes de IA da Organização</CardTitle>
        </div>
        {data?.organization && (
          <Badge variant="outline" className="text-xs">
            {data.organization.name}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-muted-foreground">Carregando agentes...</p>
        ) : agents.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhum agente cadastrado para a organização ativa.
          </p>
        ) : (
          <div className="space-y-2">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center justify-between p-2 rounded-md bg-muted/40 text-xs"
                data-testid={`agent-item-${agent.name.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="font-medium text-foreground">{agent.name}</span>
                </div>
                <Badge variant="secondary" className="text-[10px]">
                  {agent.status ?? 'Ativo'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
