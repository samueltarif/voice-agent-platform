import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { ContactsWorkspace } from './contacts-workspace';
import { ContactImportReportView } from './contact-import-report';
import { ContactMembersTable } from './contact-members-table';

const lists = [{ id: 'l1', name: 'Base' }];
const suppressions = [
  {
    phoneE164: '+5511988880000',
    reason: 'OPT_OUT' as const,
    evidenceReference: 'ticket-42',
    createdAt: '2026-10-01T00:00:00Z',
  },
];

const render = (role: string) =>
  renderToString(
    <ContactsWorkspace orgSlug="org-a" role={role} lists={lists} suppressions={suppressions} />,
  );

describe('ContactsWorkspace', () => {
  it('lets a MANAGER create lists, import and suppress', () => {
    const html = render('MANAGER');
    expect(html).toContain('Criar lista');
    expect(html).toContain('Importar CSV');
    expect(html).toContain('Registrar supressão');
  });

  it('lets an OPERATOR suppress but not import', () => {
    const html = render('OPERATOR');
    expect(html).not.toContain('Importar CSV');
    expect(html).not.toContain('Criar lista');
    expect(html).toContain('Registrar supressão');
  });

  it('is read-only for a VIEWER', () => {
    const html = render('VIEWER');
    expect(html).not.toContain('Importar CSV');
    expect(html).not.toContain('Registrar supressão');
    expect(html).toContain('+5511988880000');
    expect(html).toContain('ticket-42');
  });

  it('never offers removing a suppression', () => {
    const html = render('OWNER');
    expect(html).not.toMatch(/Remover|Excluir|Desfazer/);
    expect(html).toContain('A remoção de supressões não está disponível');
  });
});

describe('contact presentation', () => {
  it('summarizes an import with readable rejection reasons and the CSV download', () => {
    const html = renderToString(
      <ContactImportReportView
        report={{
          created: 2,
          existing: 1,
          addedToList: 3,
          suppressed: 1,
          rejected: [{ rowNumber: 4, reason: 'NON_GEOGRAPHIC_NUMBER' }],
          rejectedRowsCsv: 'linha,motivo\n4,NON_GEOGRAPHIC_NUMBER\n',
        }}
      />,
    );
    expect(html).toContain('Número não geográfico');
    expect(html).toContain('Baixar linhas recusadas (CSV)');
    expect(html).toContain('nunca são agendados nem discados');
  });

  it('marks suppressed members and reports load failures explicitly', () => {
    const html = renderToString(
      <ContactMembersTable
        members={[
          { contactId: 'c1', phoneE164: '+5511911110001', displayName: 'Ana', suppressed: true },
        ]}
      />,
    );
    expect(html).toContain('Suprimido');
    expect(renderToString(<ContactMembersTable members={null} />)).toContain('role="alert"');
  });
});
