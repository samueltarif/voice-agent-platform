'use client';

import * as React from 'react';
import { DesktopSidebar } from './desktop-sidebar';
import { AppTopbar } from './app-topbar';
import { MobileBottomNav } from './mobile-bottom-nav';
import { MobileMenuDrawer } from './mobile-menu-drawer';
import { CommandPaletteDialog } from '../features/command-palette/command-palette-dialog';
import { useCommandPaletteHotkey } from '../features/command-palette/use-command-palette-hotkey';

import type { OrganizationSummary } from './organization-switcher';

interface TenantShellProps {
  readonly title: string;
  readonly children: React.ReactNode;
  readonly currentOrg?: OrganizationSummary | null | undefined;
  readonly organizations?: readonly OrganizationSummary[] | undefined;
  readonly onSwitchOrg?: ((slug: string) => Promise<void>) | undefined;
}

export function TenantShell({
  title,
  children,
  currentOrg: propCurrentOrg,
  organizations: propOrganizations,
  onSwitchOrg,
}: TenantShellProps) {
  const [currentOrg, setCurrentOrg] = React.useState<OrganizationSummary | null | undefined>(
    propCurrentOrg,
  );
  const [organizations, setOrganizations] = React.useState<
    readonly OrganizationSummary[] | undefined
  >(propOrganizations);
  const [mobileDrawerOpen, setMobileDrawerOpen] = React.useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);

  React.useEffect(() => {
    if (propCurrentOrg !== undefined) {
      setCurrentOrg(propCurrentOrg);
      setOrganizations(propOrganizations);
      return;
    }

    let isMounted = true;
    fetch('/api/organization/active')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        if (data.status === 'RESOLVED' && data.activeOrg) {
          setCurrentOrg(data.activeOrg);
          setOrganizations(data.availableOrgs || []);
        } else if (data.status === 'NO_ORGANIZATIONS') {
          setCurrentOrg(null);
          setOrganizations([]);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [propCurrentOrg, propOrganizations]);

  const openCommandPalette = React.useCallback(() => {
    setCommandPaletteOpen(true);
  }, []);

  useCommandPaletteHotkey(openCommandPalette);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Persistent / Collapsible Desktop Sidebar */}
      <DesktopSidebar currentOrg={currentOrg} />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppTopbar
          title={title}
          onOpenCommandPalette={openCommandPalette}
          currentOrg={currentOrg}
          organizations={organizations}
          onSwitchOrg={onSwitchOrg}
        />

        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-8 pb-20 md:pb-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>

      {/* Mobile Bottom Navigation (<768px) */}
      <MobileBottomNav onOpenMore={() => setMobileDrawerOpen(true)} />

      {/* Mobile Menu Drawer (Sheet) */}
      <MobileMenuDrawer open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen} />

      {/* Global Command Palette */}
      <CommandPaletteDialog open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
    </div>
  );
}
