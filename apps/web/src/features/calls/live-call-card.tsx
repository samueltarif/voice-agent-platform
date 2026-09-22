'use client';

import * as React from 'react';
import { AlertTriangle, Calendar, Clock, Sparkles, Volume2 } from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Separator,
} from '@voice-agent/ui';
import { MOCK_CALL_DISCLAIMER, type MockDetailedCall } from '../../mocks/calls-mock-data';
import { formatCurrencyBrl } from '../dashboard/dashboard-view-model';
import { CallTranscriptView } from './call-transcript-view';
import { CallAudioWaveform } from './call-audio-waveform';

function CallHeaderSection({ call }: { readonly call: MockDetailedCall }) {
  return (
    <CardHeader className="space-y-4 pb-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12 border-2 border-primary/20">
            <AvatarFallback className="bg-primary/10 text-primary font-bold">
              {call.contactName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg font-bold text-foreground">
                {call.contactName}
              </CardTitle>
              <Badge variant="success" className="text-xs">
                Qualificado
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
              <span>{call.companyName}</span>
              <span>•</span>
              <span className="font-mono">{call.phoneMasked}</span>
              <span>•</span>
              <span>Agente: {call.agentName}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1.5">
            <Clock className="h-4 w-4 text-emerald-600 animate-pulse" />
            <span className="font-mono text-sm font-bold text-foreground">{call.duration}</span>
          </div>
          <Badge variant="handoff" className="text-xs px-2.5 py-1">
            Pronto para Handoff
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border border-border bg-muted/20 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 font-bold text-lg">
            {call.qualificationScore}
          </div>
          <div className="text-xs">
            <span className="font-semibold text-foreground block">Score Comercial</span>
            <span className="text-muted-foreground">{call.qualificationLabel}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="text-xs">
            <span className="font-semibold text-foreground block">Áudio da Chamada</span>
            <span className="text-muted-foreground">Gravação disponível pós-chamada</span>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end text-xs">
          <span className="text-muted-foreground sm:hidden">Custo estimado:</span>
          <div className="text-right">
            <span className="font-semibold text-foreground block">
              {formatCurrencyBrl(call.costCents)}
            </span>
            <span className="text-[10px] text-muted-foreground">Custo ilustrativo</span>
          </div>
        </div>
      </div>
    </CardHeader>
  );
}

function CallAiSummarySection({ call }: { readonly call: MockDetailedCall }) {
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
          <Sparkles className="h-4 w-4" />
          <span>Resumo Inteligente da IA</span>
        </div>
        <Badge variant="success" className="text-[10px]">
          Confiança alta
        </Badge>
      </div>
      <p className="text-xs text-foreground/90 leading-relaxed">{call.lastAiSummary}</p>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {call.intentTags.map((tag) => (
          <Badge key={tag} variant="secondary" className="text-[10px] font-medium">
            {tag}
          </Badge>
        ))}
      </div>
    </div>
  );
}

export function LiveCallCard({ call }: { readonly call: MockDetailedCall }) {
  return (
    <Card className="border-primary/20 shadow-md">
      <div className="flex items-center justify-between bg-amber-500/10 px-4 py-2 border-b border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 font-semibold">
        <span className="flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          {MOCK_CALL_DISCLAIMER}
        </span>
        <Badge variant="outline" className="text-[10px] bg-background">
          Ambiente Simulado
        </Badge>
      </div>

      <CallHeaderSection call={call} />

      <CardContent className="space-y-5">
        <CallAiSummarySection call={call} />
        <CallAudioWaveform />
        <CallTranscriptView transcript={call.transcript} />

        <Separator />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground block">Próxima Ação:</span>
            <span>{call.nextRecommendedAction}</span>
          </div>
          <Button size="sm" className="gap-2 shrink-0">
            <Calendar className="h-4 w-4" />
            <span>Abrir tarefa de retorno</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
