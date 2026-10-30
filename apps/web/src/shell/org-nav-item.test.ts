import { describe, it, expect } from 'vitest';
import { Users } from 'lucide-react';
import { orgNavItem } from './org-nav-item';

const def = { title: 'Contatos', segment: 'contacts', icon: Users };

describe('orgNavItem', () => {
  it('links to the active organization module and marks it active', () => {
    expect(orgNavItem(def, 'org-a', '/orgs/org-a/contacts')).toMatchObject({
      href: '/orgs/org-a/contacts',
      active: true,
    });
    expect(orgNavItem(def, 'org-a', '/orgs/org-a/campaigns')).toMatchObject({ active: false });
  });

  it('is disabled without an active organization', () => {
    expect(orgNavItem(def, undefined, '/dashboard')).toMatchObject({ href: '#', disabled: true });
  });
});
