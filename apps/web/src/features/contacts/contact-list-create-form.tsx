'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { Button, Input } from '@voice-agent/ui';
import { FieldLabel } from '../operations/operation-feedback';

export function ContactListCreateForm({
  pending,
  onCreate,
}: {
  readonly pending: boolean;
  readonly onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = React.useState('');
  return (
    <form
      aria-label="Criar lista"
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        await onCreate(name.trim());
        setName('');
      }}
    >
      <div className="flex-1 space-y-1.5">
        <FieldLabel htmlFor="contact-list-name">Nova lista</FieldLabel>
        <Input
          id="contact-list-name"
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-11"
        />
      </div>
      <Button
        type="submit"
        variant="outline"
        disabled={pending || !name.trim()}
        className="min-h-[44px] gap-2"
      >
        <Plus className="h-4 w-4" /> Criar lista
      </Button>
    </form>
  );
}
