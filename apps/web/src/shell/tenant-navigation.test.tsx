import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DesktopSidebar } from './desktop-sidebar.js';
import { MobileMenuModules } from './mobile-menu-drawer.js';
import { MobileBottomNav } from './mobile-bottom-nav.js';
import type { NavOrgContext } from './org-nav-item.js';

/**
 * Navegação do shell: desktop e mobile mostram os mesmos módulos, com os mesmos
 * links ou o mesmo motivo de indisponibilidade; "Em breve" só para o que não
 * existe (Configurações); nada de "Workspace Demo" sem indicação.
 */
const pathname = { current: '/orgs/org-a/agents' };
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));
vi.mock('../preferences/ui-preferences-context', () => ({
  useUiPreferences: () => ({ sidebarCollapsed: false, toggleSidebar: () => undefined }),
}));

const ORG = { slug: 'org-a', name: 'Org A', role: 'ADMIN' } as const;
const MODULE_HREFS = ['campaigns', 'contacts', 'agents', 'knowledge'].map(
  (s) => `/orgs/org-a/${s}`,
);

function desktop(nav: NavOrgContext, currentOrg: typeof ORG | null | undefined = ORG): string {
  return renderToString(<DesktopSidebar currentOrg={currentOrg} nav={nav} />);
}

function mobile(nav: NavOrgContext): string {
  return renderToString(
    React.createElement(MobileMenuModules, {
      nav,
      pathname: pathname.current,
      onOpenChange: () => undefined,
    }),
  );
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)]
    .map((m) => m[1]!)
    .filter((h) => h.startsWith('/orgs/'));
}

describe('tenant navigation — real modules with an active organization', () => {
  it('desktop and mobile link the same four real module pages', () => {
    const nav = { state: 'RESOLVED' as const, slug: 'org-a' };
    expect(hrefs(desktop(nav))).toEqual(MODULE_HREFS);
    expect(hrefs(mobile(nav))).toEqual(MODULE_HREFS);
    for (const html of [desktop(nav), mobile(nav)]) {
      for (const label of ['Campanhas', 'Contatos', 'Agente IA', 'Base de Conhecimento']) {
        expect(html).toContain(label);
      }
      expect(html).not.toContain('Leads');
    }
  });

  it('marks the current module with aria-current and keeps only Settings as "Em breve"', () => {
    const nav = { state: 'RESOLVED' as const, slug: 'org-a' };
    for (const html of [desktop(nav), mobile(nav)]) {
      expect(html).toMatch(
        /href="\/orgs\/org-a\/agents"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/orgs\/org-a\/agents"/,
      );
      expect(html.match(/>Em breve</g)).toHaveLength(1);
      expect(html).toContain('Configurações');
    }
  });
});

describe('tenant navigation — context problems are shown, not masked', () => {
  it.each([
    ['LOADING', 'Carregando…'],
    ['UNAUTHENTICATED', 'Entre para acessar'],
    ['NO_ORGANIZATIONS', 'Sem organização'],
    ['UNAVAILABLE', 'Organização indisponível'],
  ] as const)('%s: modules disabled with "%s" on desktop and mobile', (state, reason) => {
    for (const html of [desktop({ state }, undefined), mobile({ state })]) {
      expect(hrefs(html)).toEqual([]);
      expect(html.split(`>${reason}<`).length - 1).toBe(4);
      expect(html.match(/>Em breve</g)).toHaveLength(1);
      expect(html).toContain('aria-disabled="true"');
    }
  });
});

describe('tenant navigation — demo and offline labelling', () => {
  it('sidebar footer states the offline environment instead of "Workspace Demo"', () => {
    const html = desktop({ state: 'RESOLVED', slug: 'org-a' });
    expect(html).toContain('Ambiente offline · sem discagem real');
    expect(html).not.toContain('Workspace Demo');
  });

  it('mobile bottom nav labels the platform page as a demo with fictitious data', () => {
    pathname.current = '/platform';
    const html = renderToString(
      React.createElement(MobileBottomNav, { onOpenMore: () => undefined }),
    );
    expect(html).toContain('aria-label="Plataforma — demonstração com dados fictícios"');
    expect(html).not.toContain('>Platform<');
    pathname.current = '/orgs/org-a/agents';
  });
});
