import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@voice-agent/ui';
import type { AgentVoiceV1 } from '@voice-agent/contracts';

interface AgentVoiceSectionProps {
  readonly voice: AgentVoiceV1;
  readonly onChange: (voice: AgentVoiceV1) => void;
  readonly disabled?: boolean | undefined;
}

const LANGUAGES: readonly { label: string; value: AgentVoiceV1['languageCode'] }[] = [
  { label: 'Português (Brasil) — pt-BR', value: 'pt-BR' },
  { label: 'Inglês (Estados Unidos) — en-US', value: 'en-US' },
  { label: 'Espanhol (Espanha) — es-ES', value: 'es-ES' },
];

export function AgentVoiceSection({ voice, onChange, disabled }: AgentVoiceSectionProps) {
  return (
    <Card className="border-border/70 shadow-xs">
      <CardHeader className="border-b border-border/50 pb-3">
        <CardTitle className="text-sm font-semibold text-foreground">
          Idioma e Síntese de Voz
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Configuração de idioma para o reconhecimento de fala e geração de áudio.
        </p>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="max-w-md space-y-1">
          <label htmlFor="voice-language" className="text-xs font-medium text-foreground">
            Idioma de Atendimento <span className="text-destructive">*</span>
          </label>
          <select
            id="voice-language"
            data-testid="select-voice-language"
            value={voice.languageCode}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...voice, languageCode: e.target.value as AgentVoiceV1['languageCode'] })
            }
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            {LANGUAGES.map((lang) => (
              <option
                key={lang.value}
                value={lang.value}
                className="bg-popover text-popover-foreground"
              >
                {lang.label}
              </option>
            ))}
          </select>
        </div>
      </CardContent>
    </Card>
  );
}
