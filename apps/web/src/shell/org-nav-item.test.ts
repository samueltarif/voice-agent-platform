import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { Users } from 'lucide-react';
import {
  initialNavOrgState,
  NAV_CONTEXT_BADGES,
  NOT_IMPLEMENTED_BADGE,
  ORG_NAV_MODULES,
  navOrgStateFromResponse,
  orgNavItem,
  orgNavItems,
  type NavOrgState,
} from './org-nav-item';

/**
 * TEST_CHANGE_REASON = NAV_CONTEXT_STATES, ASSERTION_STRONGER: a assinatura passou
 * de `slug` para `{ state, slug }`. As duas asserções originais (link + item ativo;
 * desabilitado sem organização) continuam, e agora também se exige o MOTIVO.
 */
const def = { title: 'Contatos', segment: 'contacts', icon: Users };
const resolved = { state: 'RESOLVED' as const, slug: 'org-a' };
const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'app');

describe('orgNavItem', () => {
  it('links to the active organization module and marks it active', () => {
    expect(orgNavItem(def, resolved, '/orgs/org-a/contacts')).toMatchObject({
      href: '/orgs/org-a/contacts',
      active: true,
    });
    expect(orgNavItem(def, resolved, '/orgs/org-a/campaigns')).toMatchObject({ active: false });
  });

  it('is disabled without an active organization, with the real reason', () => {
    expect(orgNavItem(def, { state: 'NO_ORGANIZATIONS' }, '/dashboard')).toMatchObject({
      href: '#',
      disabled: true,
      badge: 'Sem organização',
    });
  });

  it.each<[NavOrgState, string]>([
    ['LOADING', 'Carregando…'],
    ['UNAUTHENTICATED', 'Entre para acessar'],
    ['NO_ORGANIZATIONS', 'Sem organização'],
    ['UNAVAILABLE', 'Organização indisponível'],
  ])('context %s never shows "Em breve" (badge %s)', (state, badge) => {
    for (const item of orgNavItems({ state }, '/dashboard')) {
      expect(item).toMatchObject({ href: '#', disabled: true, badge });
      expect(item.badge).not.toBe(NOT_IMPLEMENTED_BADGE);
    }
  });

  it('RESOLVED without slug is treated as unavailable, never as a broken link', () => {
    expect(orgNavItem(def, { state: 'RESOLVED' }, '/')).toMatchObject({
      href: '#',
      badge: NAV_CONTEXT_BADGES.UNAVAILABLE,
    });
  });

  it('encodes the slug and keeps the module path fixed', () => {
    const item = orgNavItem(def, { state: 'RESOLVED', slug: 'a/../b' }, '/');
    expect(item.href).toBe('/orgs/a%2F..%2Fb/contacts');
  });
});

describe('org navigation modules', () => {
  it('lists the four implemented modules in a fixed order', () => {
    expect(ORG_NAV_MODULES.map((m) => `${m.title}:${m.segment}`)).toEqual([
      'Campanhas:campaigns',
      'Contatos:contacts',
      'Agente IA:agents',
      'Base de Conhecimento:knowledge',
    ]);
  });

  it('every module points to an existing page route', () => {
    for (const module of ORG_NAV_MODULES) {
      expect(
        existsSync(join(APP_DIR, 'orgs', '[orgSlug]', module.segment, 'page.tsx')),
        module.segment,
      ).toBe(true);
    }
  });
});

describe('navigation state from server data', () => {
  it('derives the initial state from what the page resolved', () => {
    expect(initialNavOrgState(undefined)).toBe('LOADING');
    expect(initialNavOrgState(null)).toBe('NO_ORGANIZATIONS');
    expect(initialNavOrgState({ slug: 'org-a' })).toBe('RESOLVED');
  });

  it.each([
    [{ status: 'RESOLVED', activeOrg: { slug: 'org-a' } }, 'RESOLVED'],
    [{ status: 'RESOLVED' }, 'UNAVAILABLE'],
    [{ status: 'NO_ORGANIZATIONS' }, 'NO_ORGANIZATIONS'],
    [{ status: 'UNAUTHENTICATED' }, 'UNAUTHENTICATED'],
    [null, 'UNAVAILABLE'],
    [{ status: 'SOMETHING_ELSE' }, 'UNAVAILABLE'],
  ] as const)('maps %j to %s', (body, state) => {
    expect(navOrgStateFromResponse(body)).toBe(state);
  });
});
