'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, Loader2, Sparkles } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@voice-agent/ui';
import { deriveAgentSlug } from './derive-agent-slug.js';
import { validateAgentForm } from './validate-agent-form.js';
import { AgentFormFields } from './agent-form-fields.js';
import { submitCreateAgent } from './submit-create-agent.js';

interface AgentCreateFormProps {
  readonly orgSlug: string;
}

function AgentFormAlert({ message }: { readonly message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      data-testid="create-agent-error"
      className="mb-6 flex items-start gap-2.5 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs"
    >
      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
      <span className="font-medium">{message}</span>
    </div>
  );
}

function AgentFormActions({
  orgSlug,
  submitting,
}: {
  readonly orgSlug: string;
  readonly submitting: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/50">
      <Button
        asChild
        type="button"
        variant="outline"
        size="sm"
        disabled={submitting}
        className="min-h-[44px] text-xs"
      >
        <Link href={`/orgs/${orgSlug}/agents`}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
          Cancelar
        </Link>
      </Button>
      <Button
        type="submit"
        size="sm"
        data-testid="btn-submit-agent"
        disabled={submitting}
        className="min-h-[44px] text-xs min-w-[120px]"
      >
        {submitting ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            Criando...
          </>
        ) : (
          'Salvar e criar'
        )}
      </Button>
    </div>
  );
}

function AgentCreateCardHeader() {
  return (
    <CardHeader className="border-b border-border/50 pb-4">
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <CardTitle className="text-sm font-semibold text-foreground">
            Identificação do Agente
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            O nome e o slug identificam este agente nas chamadas e relatórios.
          </p>
        </div>
      </div>
    </CardHeader>
  );
}

export function AgentCreateForm({ orgSlug }: AgentCreateFormProps) {
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [slugEdited, setSlugEdited] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    if (!slugEdited) setSlug(deriveAgentSlug(e.target.value));
    if (fieldErrors.name) {
      setFieldErrors((prev) => {
        const { name: _, ...rest } = prev;
        return rest;
      });
    }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSlug(e.target.value);
    setSlugEdited(true);
    if (fieldErrors.slug) {
      setFieldErrors((prev) => {
        const { slug: _, ...rest } = prev;
        return rest;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const validation = validateAgentForm(name, slug);
    if (validation.errors) {
      setFieldErrors(validation.errors);
      return;
    }

    setSubmitting(true);
    const error = await submitCreateAgent(validation.data!, orgSlug, router);
    if (error) {
      setErrorMessage(error);
      setSubmitting(false);
    }
  };

  return (
    <Card className="border border-border/80 shadow-xs">
      <AgentCreateCardHeader />
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <AgentFormAlert message={errorMessage} />
          <AgentFormFields
            name={name}
            slug={slug}
            submitting={submitting}
            fieldErrors={fieldErrors}
            onNameChange={handleNameChange}
            onSlugChange={handleSlugChange}
          />
          <AgentFormActions orgSlug={orgSlug} submitting={submitting} />
        </form>
      </CardContent>
    </Card>
  );
}
