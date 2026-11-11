'use client';

import * as React from 'react';
import type { OrganizationSummary } from './organization-switcher';
import {
  initialNavOrgState,
  navOrgStateFromResponse,
  type NavOrgContext,
  type NavOrgState,
} from './org-nav-item';

interface ActiveOrganizationState {
  readonly currentOrg: OrganizationSummary | null | undefined;
  readonly organizations: readonly OrganizationSummary[] | undefined;
  readonly nav: NavOrgContext;
}

interface ActiveOrganizationBody {
  readonly activeOrg?: OrganizationSummary;
  readonly availableOrgs?: readonly OrganizationSummary[];
}

/**
 * Organização ativa do shell. Se a página já resolveu no servidor, usa esse
 * resultado; senão consulta `/api/organization/active`. Qualquer falha vira o
 * estado UNAVAILABLE (nunca "Em breve"), para que o problema fique visível.
 */
export function useActiveOrganization(
  propCurrentOrg: OrganizationSummary | null | undefined,
  propOrganizations: readonly OrganizationSummary[] | undefined,
): ActiveOrganizationState {
  const [currentOrg, setCurrentOrg] = React.useState(propCurrentOrg);
  const [organizations, setOrganizations] = React.useState(propOrganizations);
  const [state, setState] = React.useState<NavOrgState>(initialNavOrgState(propCurrentOrg));

  React.useEffect(() => {
    if (propCurrentOrg !== undefined) {
      setCurrentOrg(propCurrentOrg);
      setOrganizations(propOrganizations);
      setState(initialNavOrgState(propCurrentOrg));
      return;
    }
    let isMounted = true;
    fetch('/api/organization/active')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: unknown) => {
        if (!isMounted) return;
        const next = navOrgStateFromResponse(data);
        const body = (data ?? {}) as ActiveOrganizationBody;
        setState(next);
        setCurrentOrg(
          next === 'RESOLVED' ? body.activeOrg : next === 'NO_ORGANIZATIONS' ? null : undefined,
        );
        setOrganizations(body.availableOrgs ?? []);
      })
      .catch(() => {
        if (isMounted) setState('UNAVAILABLE');
      });
    return () => {
      isMounted = false;
    };
  }, [propCurrentOrg, propOrganizations]);

  return { currentOrg, organizations, nav: { state, slug: currentOrg?.slug } };
}
