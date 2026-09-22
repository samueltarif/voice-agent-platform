'use client';

import * as React from 'react';
import { Bot, User } from 'lucide-react';
import type { MockTranscriptTurn } from '../../mocks/calls-mock-data';

interface CallTranscriptViewProps {
  readonly transcript: readonly MockTranscriptTurn[];
}

export function CallTranscriptView({ transcript }: CallTranscriptViewProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
          Transcrição da conversa
        </span>
        <span className="text-[11px] text-muted-foreground font-mono">Gravação 03:12</span>
      </div>

      <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
        {transcript.map((turn, idx) => (
          <div
            key={idx}
            className={`flex gap-3 text-xs p-2.5 rounded-lg ${
              turn.speaker === 'AI'
                ? 'bg-primary/10 border border-primary/20'
                : 'bg-muted/40 border border-border'
            }`}
          >
            <div className="flex items-center gap-1 font-semibold shrink-0">
              {turn.speaker === 'AI' ? (
                <span className="flex items-center gap-1 text-primary">
                  <Bot className="h-3.5 w-3.5" /> IA
                </span>
              ) : (
                <span className="flex items-center gap-1 text-foreground">
                  <User className="h-3.5 w-3.5" /> Lead
                </span>
              )}
              <span className="text-[10px] text-muted-foreground font-mono">{turn.timestamp}</span>
            </div>
            <p className="flex-1 text-foreground leading-relaxed">{turn.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
