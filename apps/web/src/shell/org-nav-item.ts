import type { SidebarNavItem } from './sidebar-link-item';

export interface OrgNavDefinition {
  readonly title: string;
  readonly segment: string;
  readonly icon: SidebarNavItem['icon'];
}

/** Item de módulo escopado à organização ativa; sem organização fica desabilitado. */
export function orgNavItem(
  def: OrgNavDefinition,
  slug: string | undefined,
  pathname: string,
): SidebarNavItem {
  if (!slug) {
    return { title: def.title, href: '#', icon: def.icon, disabled: true, badge: 'Em breve' };
  }
  const href = `/orgs/${slug}/${def.segment}`;
  return { title: def.title, href, icon: def.icon, active: pathname.startsWith(href) };
}
