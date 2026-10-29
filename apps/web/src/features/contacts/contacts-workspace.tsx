import * as React from 'react';
import type { TenantRole } from '@voice-agent/contracts';
import type {
  ContactListSummary,
  ContactSuppressionView,
} from '../../lib/operations/operations-types';
import { ContactListsPanel } from './contact-lists-panel';
import { canManageContacts, canSuppressContacts } from './contact-permissions';
import { ContactSuppressionsPanel } from './contact-suppressions-panel';

interface ContactsWorkspaceProps {
  readonly orgSlug: string;
  readonly role: TenantRole | string;
  readonly lists: readonly ContactListSummary[];
  readonly suppressions: readonly ContactSuppressionView[];
}

export function ContactsWorkspace({ orgSlug, role, lists, suppressions }: ContactsWorkspaceProps) {
  return (
    <div className="space-y-6">
      <ContactListsPanel
        orgSlug={orgSlug}
        canManage={canManageContacts(role)}
        initialLists={lists}
      />
      <ContactSuppressionsPanel
        orgSlug={orgSlug}
        canSuppress={canSuppressContacts(role)}
        initial={suppressions}
      />
    </div>
  );
}
