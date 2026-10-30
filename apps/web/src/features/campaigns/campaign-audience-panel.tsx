'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@voice-agent/ui';
import type {
  CampaignAudienceView,
  ContactListSummary,
} from '../../lib/operations/operations-types';
import { FieldLabel, OPERATION_FIELD } from '../operations/operation-feedback';

interface CampaignAudiencePanelProps {
  readonly orgSlug: string;
  readonly audience: CampaignAudienceView | null;
  readonly lists: readonly ContactListSummary[];
  readonly editable: boolean;
  readonly pending: boolean;
  readonly onAssign: (contactListId: string) => void;
}

function listName(lists: readonly ContactListSummary[], id: string | undefined): string {
  return lists.find((l) => l.id === id)?.name ?? 'Lista indisponível';
}

function AudienceForm(props: {
  readonly lists: readonly ContactListSummary[];
  readonly initial: string;
  readonly pending: boolean;
  readonly onAssign: (contactListId: string) => void;
}) {
  const [selected, setSelected] = React.useState(props.initial);
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        props.onAssign(selected);
      }}
    >
      <div className="flex-1 space-y-1.5">
        <FieldLabel htmlFor="campaign-audience-list">Lista de contatos</FieldLabel>
        <select
          id="campaign-audience-list"
          className={`${OPERATION_FIELD} w-full`}
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {props.lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" variant="outline" disabled={props.pending} className="min-h-[44px]">
        Salvar audiência
      </Button>
    </form>
  );
}

function CurrentAudience(props: {
  readonly audience: CampaignAudienceView | null;
  readonly lists: readonly ContactListSummary[];
}) {
  return (
    <p data-testid="campaign-audience-current">
      {props.audience ? (
        <>
          Lista: <strong>{listName(props.lists, props.audience.contactListId)}</strong>
        </>
      ) : (
        'Nenhuma lista definida.'
      )}
    </p>
  );
}

function NoListsHint({ orgSlug }: { readonly orgSlug: string }) {
  return (
    <p className="text-xs">
      Nenhuma lista disponível.{' '}
      <Link className="underline" href={`/orgs/${orgSlug}/contacts`}>
        Importe contatos
      </Link>
      .
    </p>
  );
}

function AudienceEditor(props: CampaignAudiencePanelProps) {
  const { lists } = props;
  if (lists.length === 0) return <NoListsHint orgSlug={props.orgSlug} />;
  return (
    <AudienceForm
      lists={lists}
      initial={props.audience?.contactListId ?? lists[0]?.id ?? ''}
      pending={props.pending}
      onAssign={props.onAssign}
    />
  );
}

/**
 * Audiência = lista de contatos do mesmo tenant. Só pode mudar em RASCUNHO;
 * números suprimidos são excluídos no início (e bloqueados também no envio).
 */
export function CampaignAudiencePanel(props: CampaignAudiencePanelProps) {
  const { audience, lists, editable } = props;

  return (
    <Card className="border-border/60 shadow-xs" data-testid="campaign-audience">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Audiência</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <CurrentAudience audience={audience} lists={lists} />
        <p className="text-xs text-muted-foreground">
          Contatos com supressão registrada nunca são agendados nem discados.
        </p>
        {editable && <AudienceEditor {...props} />}
      </CardContent>
    </Card>
  );
}
