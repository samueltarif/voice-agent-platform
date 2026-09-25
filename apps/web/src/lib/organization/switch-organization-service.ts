import type { BootstrapApiClient } from '../api/bootstrap-api-client.js';
import {
  parseSwitchOrganizationInput,
  type SwitchOrganizationResponse,
} from './active-organization-context.js';

export interface SwitchOrganizationServiceInput {
  readonly userId?: string | null | undefined;
  readonly slug: unknown;
  readonly bootstrapClient: BootstrapApiClient;
  readonly requestId?: string | undefined;
}

export class SwitchOrganizationService {
  async switchOrganization(
    input: SwitchOrganizationServiceInput,
  ): Promise<SwitchOrganizationResponse> {
    const trimmedUserId = input.userId?.trim();
    if (!trimmedUserId) {
      return {
        success: false,
        error: 'Sessão de usuário não autenticada.',
      };
    }

    const parseResult = parseSwitchOrganizationInput({ slug: input.slug });
    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error,
      };
    }

    const { slug } = parseResult.data;

    try {
      const org = await input.bootstrapClient.getOrganizationBySlug(
        trimmedUserId,
        slug,
        input.requestId,
      );

      return {
        success: true,
        organization: {
          slug: org.slug,
          name: org.name,
        },
      };
    } catch {
      return {
        success: false,
        error: 'Organização não encontrada ou acesso não autorizado.',
      };
    }
  }
}

export const switchOrganizationService = new SwitchOrganizationService();
