import * as React from 'react';
import { Badge } from '@voice-agent/ui';
import type { ContactListMember } from '../../lib/operations/operations-types';

export function ContactMembersTable({
  members,
}: {
  readonly members: readonly ContactListMember[] | null;
}) {
  if (members === null) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Não foi possível carregar os contatos desta lista.
      </p>
    );
  }
  if (members.length === 0) {
    return (
      <p data-testid="contact-members-empty" className="text-sm text-muted-foreground">
        Nenhum contato para exibir.
      </p>
    );
  }
  return (
    <ul
      role="list"
      data-testid="contact-members"
      className="divide-y divide-border rounded-md border border-border/60"
    >
      {members.map((m) => (
        <li key={m.contactId} className="flex items-center justify-between gap-2 p-3 text-sm">
          <span className="min-w-0 truncate">
            <span className="font-mono">{m.phoneE164}</span>
            {m.displayName && <span className="ml-2 text-muted-foreground">{m.displayName}</span>}
          </span>
          {m.suppressed ? (
            <Badge variant="outline" className="text-xs text-destructive border-destructive/30">
              Suprimido
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs">
              Elegível
            </Badge>
          )}
        </li>
      ))}
    </ul>
  );
}
