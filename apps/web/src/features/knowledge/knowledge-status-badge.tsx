import * as React from 'react';
import { Badge } from '@voice-agent/ui';
import type { KnowledgeDocumentStatus } from '@voice-agent/contracts';
import { STATUS_LABELS } from './knowledge-labels';

const VARIANT: Record<
  KnowledgeDocumentStatus,
  'success' | 'warning' | 'danger' | 'outline' | 'secondary'
> = {
  READY: 'success',
  PENDING: 'secondary',
  PROCESSING: 'warning',
  FAILED: 'danger',
  ARCHIVED: 'outline',
};

// Texto sempre presente: cor nunca é o único indicador (WCAG).
export function KnowledgeStatusBadge({ status }: { readonly status: KnowledgeDocumentStatus }) {
  return (
    <Badge variant={VARIANT[status]} data-testid={`kb-status-${status.toLowerCase()}`}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
