'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@voice-agent/ui';
import type { OutboundCampaignResponse } from '@voice-agent/contracts';
import { operationsRequest } from '../../lib/operations/operations-client';
import { FieldLabel, OPERATION_FIELD, OperationFeedback } from '../operations/operation-feedback';
import { useOperation } from '../operations/use-operation';

export interface CampaignAgentOption {
  readonly id: string;
  readonly name: string;
}

interface CampaignCreateFormProps {
  readonly orgSlug: string;
  readonly agents: readonly CampaignAgentOption[];
}

function NoPublishedAgents() {
  return (
    <p data-testid="campaign-create-no-agents" className="text-sm text-muted-foreground">
      Publique uma versão de um agente ativo antes de criar campanhas.
    </p>
  );
}

/** Cria a campanha em RASCUNHO; a versão publicada do agente é fixada no servidor. */
export function CampaignCreateForm({ orgSlug, agents }: CampaignCreateFormProps) {
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [agentId, setAgentId] = React.useState(agents[0]?.id ?? '');
  const { pending, feedback, run } = useOperation();
  const disabled = pending || agents.length === 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const created = await run(
      () =>
        operationsRequest<OutboundCampaignResponse>(orgSlug, '/api/campaigns', {
          method: 'POST',
          body: { name: name.trim(), agentId },
        }),
      () => 'Rascunho criado. Abrindo a campanha…',
    );
    if (created) router.push(`/orgs/${orgSlug}/campaigns/${created.id}`);
  }

  return (
    <Card className="border-border/60 shadow-xs">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Nova campanha</CardTitle>
      </CardHeader>
      <CardContent>
        {agents.length === 0 ? (
          <NoPublishedAgents />
        ) : (
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <FieldLabel htmlFor="campaign-name">Nome</FieldLabel>
              <Input
                id="campaign-name"
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel htmlFor="campaign-agent">Agente</FieldLabel>
              <select
                id="campaign-agent"
                className={`${OPERATION_FIELD} w-full`}
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="submit"
              disabled={disabled || !name.trim()}
              className="min-h-[44px] gap-2"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Criar rascunho
            </Button>
          </form>
        )}
        <div className="mt-3">
          <OperationFeedback state={feedback} testId="campaign-create-feedback" />
        </div>
      </CardContent>
    </Card>
  );
}
