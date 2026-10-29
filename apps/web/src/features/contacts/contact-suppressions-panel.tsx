'use client';

import * as React from 'react';
import { Ban } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@voice-agent/ui';
import type { ContactSuppressionReason } from '@voice-agent/contracts';
import type { ContactSuppressionView } from '../../lib/operations/operations-types';
import { formatAgentDate } from '../agents/agent-date-formatter';
import { FieldLabel, OPERATION_FIELD, OperationFeedback } from '../operations/operation-feedback';
import { SUPPRESSION_REASONS, SUPPRESSION_REASON_LABELS } from './contact-labels';
import { useContactSuppressions } from './use-contact-suppressions';

interface ContactSuppressionsPanelProps {
  readonly orgSlug: string;
  readonly canSuppress: boolean;
  readonly initial: readonly ContactSuppressionView[];
}

function SuppressionForm({
  onAdd,
  pending,
}: {
  readonly onAdd: ReturnType<typeof useContactSuppressions>['add'];
  readonly pending: boolean;
}) {
  const [phone, setPhone] = React.useState('');
  const [reason, setReason] = React.useState<ContactSuppressionReason>('OPT_OUT');
  const [evidence, setEvidence] = React.useState('');
  return (
    <form
      aria-label="Registrar supressão"
      className="grid gap-3 sm:grid-cols-4 sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await onAdd({ phone: phone.trim(), reason, evidenceReference: evidence.trim() });
        if (ok) setPhone('');
      }}
    >
      <div className="space-y-1.5">
        <FieldLabel htmlFor="suppression-phone">Telefone</FieldLabel>
        <Input
          id="suppression-phone"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="h-11"
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel htmlFor="suppression-reason">Motivo</FieldLabel>
        <select
          id="suppression-reason"
          className={`${OPERATION_FIELD} w-full`}
          value={reason}
          onChange={(e) => setReason(e.target.value as ContactSuppressionReason)}
        >
          {SUPPRESSION_REASONS.map((r) => (
            <option key={r} value={r}>
              {SUPPRESSION_REASON_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <FieldLabel htmlFor="suppression-evidence">Referência (opcional)</FieldLabel>
        <Input
          id="suppression-evidence"
          maxLength={200}
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          className="h-11"
        />
      </div>
      <Button type="submit" disabled={pending || !phone.trim()} className="min-h-[44px] gap-2">
        <Ban className="h-4 w-4" /> Suprimir
      </Button>
    </form>
  );
}

/** Supressão é permanente nesta fase: não há ação de remoção na interface. */
export function ContactSuppressionsPanel({
  orgSlug,
  canSuppress,
  initial,
}: ContactSuppressionsPanelProps) {
  const { suppressions, pending, feedback, add } = useContactSuppressions(orgSlug, initial);
  return (
    <Card className="border-border/60 shadow-xs" data-testid="contact-suppressions-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Supressões</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Números suprimidos nunca são agendados nem discados. A remoção de supressões não está
          disponível.
        </p>
        {canSuppress && <SuppressionForm onAdd={add} pending={pending} />}
        <OperationFeedback state={feedback} testId="contact-suppressions-feedback" />
        {suppressions.length === 0 ? (
          <p data-testid="contact-suppressions-empty" className="text-sm text-muted-foreground">
            Nenhuma supressão registrada.
          </p>
        ) : (
          <ul
            role="list"
            data-testid="contact-suppressions"
            className="divide-y divide-border rounded-md border border-border/60"
          >
            {suppressions.map((s) => (
              <li
                key={s.phoneE164}
                className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
              >
                <span className="font-mono">{s.phoneE164}</span>
                <span className="text-xs text-muted-foreground">
                  {SUPPRESSION_REASON_LABELS[s.reason]}
                  {s.evidenceReference ? ` · ${s.evidenceReference}` : ''} ·{' '}
                  {formatAgentDate(s.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
