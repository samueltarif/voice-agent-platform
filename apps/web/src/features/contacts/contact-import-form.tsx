'use client';

import * as React from 'react';
import { Upload } from 'lucide-react';
import { Button, Input } from '@voice-agent/ui';
import { FieldLabel } from '../operations/operation-feedback';
import type { ImportCsvInput } from './use-contact-lists';

/** Mesmo teto do servidor; checado antes do envio para dar retorno imediato. */
export const CONTACT_CSV_MAX_BYTES = 2 * 1024 * 1024;

interface ContactImportFormProps {
  readonly pending: boolean;
  readonly onImport: (input: ImportCsvInput) => void;
  readonly onTooLarge: () => void;
}

export function ContactImportForm({ pending, onImport, onTooLarge }: ContactImportFormProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [phoneColumn, setPhoneColumn] = React.useState('Telefone');
  const [nameColumn, setNameColumn] = React.useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    if (file.size > CONTACT_CSV_MAX_BYTES) return onTooLarge();
    onImport({
      csv: await file.text(),
      phoneColumn: phoneColumn.trim(),
      nameColumn: nameColumn.trim(),
    });
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-3 sm:grid-cols-3 sm:items-end"
      aria-label="Importar CSV"
    >
      <div className="space-y-1.5 sm:col-span-3">
        <FieldLabel htmlFor="contact-import-file">Arquivo CSV (até 2 MB)</FieldLabel>
        <Input
          id="contact-import-file"
          type="file"
          accept=".csv,text/csv"
          required
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="h-11"
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel htmlFor="contact-import-phone">Coluna do telefone</FieldLabel>
        <Input
          id="contact-import-phone"
          required
          value={phoneColumn}
          onChange={(e) => setPhoneColumn(e.target.value)}
          className="h-11"
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel htmlFor="contact-import-name">Coluna do nome (opcional)</FieldLabel>
        <Input
          id="contact-import-name"
          value={nameColumn}
          onChange={(e) => setNameColumn(e.target.value)}
          className="h-11"
        />
      </div>
      <Button
        type="submit"
        disabled={pending || !file || !phoneColumn.trim()}
        className="min-h-[44px] gap-2"
      >
        <Upload className="h-4 w-4" /> Importar
      </Button>
    </form>
  );
}
