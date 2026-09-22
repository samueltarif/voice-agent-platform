'use client';

import * as React from 'react';
import { DesktopSidebar } from './desktop-sidebar';
import { AppTopbar } from './app-topbar';
import { MobileBottomNav } from './mobile-bottom-nav';
import { MobileMenuDrawer } from './mobile-menu-drawer';
import { CommandPaletteDialog } from '../features/command-palette/command-palette-dialog';
import { useCommandPaletteHotkey } from '../features/command-palette/use-command-palette-hotkey';

interface TenantShellProps {
  readonly title: string;
  readonly children: React.ReactNode;
}

export function TenantShell({ title, children }: TenantShellProps) {
  const [mobileDrawerOpen, setMobileDrawerOpen] = React.useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);

  const openCommandPalette = React.useCallback(() => {
    setCommandPaletteOpen(true);
  }, []);

  useCommandPaletteHotkey(openCommandPalette);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Persistent / Collapsible Desktop Sidebar */}
      <DesktopSidebar />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppTopbar title={title} onOpenCommandPalette={openCommandPalette} />

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
