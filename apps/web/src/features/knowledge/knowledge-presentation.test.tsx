import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { KnowledgeStatusBadge } from './knowledge-status-badge';
import { SOURCE_TYPE_LABELS, STATUS_LABELS } from './knowledge-labels';
import { formatKnowledgeDate } from './knowledge-date-formatter';

describe('knowledge status labels and badges', () => {
  it('maps MANUAL_UPLOAD to Cadastro manual without implying file upload', () => {
    expect(SOURCE_TYPE_LABELS.MANUAL_UPLOAD).toBe('Cadastro manual');
  });

  it('covers every document status with a Portuguese label', () => {
    for (const status of ['PENDING', 'PROCESSING', 'READY', 'FAILED', 'ARCHIVED'] as const) {
      expect(STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it('renders badge text alongside color (never color-only)', () => {
    const html = renderToString(React.createElement(KnowledgeStatusBadge, { status: 'READY' }));
    expect(html).toContain('Pronto');
    expect(html).toContain('kb-status-ready');
  });

  it('formats dates in UTC dd/MM/yyyy HH:mm', () => {
    expect(formatKnowledgeDate('2026-10-13T14:02:00.000Z')).toBe('13/10/2026 14:02');
    expect(formatKnowledgeDate(null)).toBe('-');
  });
});
