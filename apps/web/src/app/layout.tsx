import type { Metadata, Viewport } from 'next';
import './globals.css';
import { TooltipProvider } from '@voice-agent/ui';
import { UiPreferencesProvider } from '../preferences/ui-preferences-context';

export const metadata: Metadata = {
  title: 'Voice Agent Platform',
  description: 'Plataforma B2B para agentes de voz, chamadas ativas e handoff humano.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

const themeInitializerScript = `(function() {
  try {
    var raw = localStorage.getItem('voice-agent:ui:v1');
    if (raw) {
      var p = JSON.parse(raw);
      if (p && p.theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      if (p && (p.density === 'compact' || p.density === 'comfortable' || p.density === 'default')) {
        document.documentElement.setAttribute('data-density', p.density);
      }
    }
  } catch (e) {}
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitializerScript }} />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased overflow-x-hidden">
        <UiPreferencesProvider>
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        </UiPreferencesProvider>
      </body>
    </html>
  );
}
