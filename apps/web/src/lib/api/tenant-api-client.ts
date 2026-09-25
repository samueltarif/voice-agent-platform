import type { InternalApiClient, InternalApiRequestOptions } from './internal-api-client.js';
import type { ActiveOrganizationContext } from '../organization/active-organization-context.js';

export type TenantApiMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface TenantRequestOptions {
  readonly method: TenantApiMethod;
  readonly path: string;
  readonly body?: unknown;
  readonly requestId?: string;
}

export class TenantApiClient {
  constructor(
    private readonly internalApiClient: InternalApiClient,
    private readonly context: ActiveOrganizationContext,
    private readonly userId: string,
  ) {
    if (!this.userId?.trim()) {
      throw new Error('TenantApiClient requires an authenticated userId');
    }
    if (!this.context?.organizationId?.trim()) {
      throw new Error(
        'TenantApiClient requires a valid ActiveOrganizationContext with organizationId',
      );
    }
  }

  get organizationId(): string {
    return this.context.organizationId;
  }

  get orgSlug(): string {
    return this.context.slug;
  }

  async request<T>(options: TenantRequestOptions): Promise<T> {
    const internalOptions: InternalApiRequestOptions = {
      method: options.method,
      path: options.path,
      userId: this.userId,
      organizationId: this.context.organizationId,
      ...(options.body !== undefined ? { body: options.body } : {}),
      ...(options.requestId !== undefined ? { requestId: options.requestId } : {}),
    };

    return this.internalApiClient.request<T>(internalOptions);
  }
}
