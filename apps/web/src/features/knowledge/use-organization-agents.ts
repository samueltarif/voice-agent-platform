import * as React from 'react';
import {
  fetchOrganizationAgents,
  type OrganizationAgentOption,
} from '../../lib/knowledge/knowledge-document-management-client';

/** Agentes da organização ativa, para mostrar nomes e oferecer a associação. */
export function useOrganizationAgents(enabled: boolean) {
  const [agents, setAgents] = React.useState<readonly OrganizationAgentOption[]>([]);
  const [unavailable, setUnavailable] = React.useState(false);
  React.useEffect(() => {
    if (!enabled) return;
    let active = true;
    fetchOrganizationAgents()
      .then((list) => {
        if (active) setAgents(list);
      })
      .catch(() => {
        if (active) setUnavailable(true);
      });
    return () => {
      active = false;
    };
  }, [enabled]);
  const names = React.useMemo(() => new Map(agents.map((a) => [a.id, a.name])), [agents]);
  return { agents, unavailable, names };
}
