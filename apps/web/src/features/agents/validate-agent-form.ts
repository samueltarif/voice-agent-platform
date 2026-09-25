import { createAgentHttpBodySchema, type CreateAgentHttpBody } from '@voice-agent/contracts';

export interface FormValidationResult {
  readonly data?: CreateAgentHttpBody;
  readonly errors?: { readonly name?: string; readonly slug?: string };
}

export function validateAgentForm(name: string, slug: string): FormValidationResult {
  const parseResult = createAgentHttpBodySchema.safeParse({
    name: name.trim(),
    slug: slug.trim(),
  });

  if (parseResult.success) {
    return { data: parseResult.data };
  }

  const errors: { name?: string; slug?: string } = {};
  for (const issue of parseResult.error.issues) {
    if (issue.path[0] === 'name') errors.name = issue.message;
    if (issue.path[0] === 'slug') errors.slug = issue.message;
  }

  return { errors };
}
