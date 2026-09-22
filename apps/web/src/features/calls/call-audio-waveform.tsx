'use client';

import * as React from 'react';
import { Headphones } from 'lucide-react';

const WAVEFORM_HEIGHTS = [
  4, 12, 20, 8, 24, 16, 28, 14, 22, 10, 18, 6, 26, 15, 9, 21, 13, 27, 11, 7,
] as const;

export function CallAudioWaveform() {
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-muted-foreground flex items-center gap-1.5">
          <Headphones className="h-3.5 w-3.5 text-primary" />
          Monitoramento em tempo real (Mock Visual)
        </span>
        <span className="text-[11px] text-muted-foreground">Sem áudio broadcast</span>
      </div>
      <div className="flex items-center justify-between h-8 px-2 rounded-md bg-muted/40 gap-1 opacity-70">
        {WAVEFORM_HEIGHTS.map((height, i) => (
          <div
            key={i}
            className="w-1.5 bg-primary/60 rounded-full"
            style={{ height: `${height}px` }}
          />
        ))}
      </div>
    </div>
  );
}
