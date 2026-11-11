import { Activity, BookOpen, Bot, Users } from 'lucide-react';
import type { SidebarNavItem } from './sidebar-link-item';

/**
 * Navegação dos módulos escopados à organização — FONTE ÚNICA para desktop e
 * mobile. Sem organização resolvida o item fica desabilitado com o MOTIVO real
 * (carregando, sem sessão, sem organização, falha ao carregar); "Em breve" é
 * reservado a funcionalidade não implementada e nunca mascara problema de contexto.
 */
export interface OrgNavDefinition {
  readonly title: string;
  readonly segment: string;
  readonly icon: SidebarNavItem['icon'];
}

export const ORG_NAV_MODULES: readonly OrgNavDefinition[] = [
  { title: 'Campanhas', segment: 'campaigns', icon: Activity },
  { title: 'Contatos', segment: 'contacts', icon: Users },
  { title: 'Agente IA', segment: 'agents', icon: Bot },
  { title: 'Base de Conhecimento', segment: 'knowledge', icon: BookOpen },
];

/** Estado do contexto de organização visto pela navegação. */
export type NavOrgState =
  'LOADING' | 'RESOLVED' | 'NO_ORGANIZATIONS' | 'UNAUTHENTICATED' | 'UNAVAILABLE';

export interface NavOrgContext {
  readonly state: NavOrgState;
  readonly slug?: string | undefined;
}

export const NAV_CONTEXT_BADGES: Readonly<Record<Exclude<NavOrgState, 'RESOLVED'>, string>> = {
  LOADING: 'Carregando…',
  NO_ORGANIZATIONS: 'Sem organização',
  UNAUTHENTICATED: 'Entre para acessar',
  UNAVAILABLE: 'Organização indisponível',
};

/** Funcionalidade ainda não implementada (não é problema de contexto). */
export const NOT_IMPLEMENTED_BADGE = 'Em breve';

export function orgNavItem(
  def: OrgNavDefinition,
  nav: NavOrgContext,
  pathname: string,
): SidebarNavItem {
  if (nav.state !== 'RESOLVED' || !nav.slug) {
    const reason = nav.state === 'RESOLVED' ? 'UNAVAILABLE' : nav.state;
    return {
      title: def.title,
      href: '#',
      icon: def.icon,
      disabled: true,
      badge: NAV_CONTEXT_BADGES[reason],
    };
  }
  const href = `/orgs/${encodeURIComponent(nav.slug)}/${def.segment}`;
  return { title: def.title, href, icon: def.icon, active: pathname.startsWith(href) };
}

export function orgNavItems(nav: NavOrgContext, pathname: string): SidebarNavItem[] {
  return ORG_NAV_MODULES.map((def) => orgNavItem(def, nav, pathname));
}

/** Estado inicial a partir do que a página já resolveu no servidor. */
export function initialNavOrgState(currentOrg: { slug: string } | null | undefined): NavOrgState {
  if (currentOrg === undefined) return 'LOADING';
  return currentOrg ? 'RESOLVED' : 'NO_ORGANIZATIONS';
}

/** Resposta de `/api/organization/active` → estado da navegação (falha = indisponível). */
export function navOrgStateFromResponse(body: unknown): NavOrgState {
  const status = (body as { status?: unknown } | null)?.status;
  if (status === 'RESOLVED' && (body as { activeOrg?: unknown }).activeOrg) return 'RESOLVED';
  if (status === 'NO_ORGANIZATIONS') return 'NO_ORGANIZATIONS';
  if (status === 'UNAUTHENTICATED') return 'UNAUTHENTICATED';
  return 'UNAVAILABLE';
}
