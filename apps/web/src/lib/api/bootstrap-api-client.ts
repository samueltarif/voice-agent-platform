import { randomUUID } from 'node:crypto';
import type { JWK } from 'jose';
import type { ApiErrorResponse, OrganizationContextResponse } from '@voice-agent/contracts';
import { internalBootstrapSigner } from '../auth/internal-bootstrap-signer.js';

export interface BootstrapApiClientConfig {
  baseUrl: string;
  privateJwk: JWK;
  kid: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

export interface BootstrapApiRequestOptions {
  path: string;
  userId: string;
  requestId?: string;
}

function buildApiUrl(baseUrl: string, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

async function handleApiError(response: Response, requestId: string): Promise<never> {
  let errorData: ApiErrorResponse | null = null;
  try {
    errorData = (await response.json()) as ApiErrorResponse;
  } catch {
    // Non-JSON response
  }
  const message = errorData?.error?.message ?? `API request failed with HTTP ${response.status}`;
  const error = new Error(message);
  Object.assign(error, { status: response.status, data: errorData, requestId });
  throw error;
}

export class BootstrapApiClient {
  private readonly baseUrl: string;
  private readonly privateJwk: JWK;
  private readonly kid: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(config: BootstrapApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.privateJwk = config.privateJwk;
    this.kid = config.kid;
    this.fetchFn = config.fetchFn ?? fetch;
    this.timeoutMs = config.timeoutMs ?? 10000;
  }

  private async request<T>(options: BootstrapApiRequestOptions): Promise<T> {
    const assertion = await internalBootstrapSigner.signBootstrapAssertion({
      userId: options.userId,
      privateJwk: this.privateJwk,
      kid: this.kid,
    });

    const requestId = options.requestId ?? randomUUID();
    const url = buildApiUrl(this.baseUrl, options.path);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${assertion}`,
      'x-request-id': requestId,
      Accept: 'application/json',
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      if (!response.ok) {
        await handleApiError(response, requestId);
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  async listOrganizationsForUser(
    userId: string,
    requestId?: string,
  ): Promise<OrganizationContextResponse[]> {
    return this.request<OrganizationContextResponse[]>({
      path: '/v1/me/organizations',
      userId,
      ...(requestId !== undefined ? { requestId } : {}),
    });
  }

  async getOrganizationBySlug(
    userId: string,
    orgSlug: string,
    requestId?: string,
  ): Promise<OrganizationContextResponse> {
    return this.request<OrganizationContextResponse>({
      path: `/v1/me/organizations/${encodeURIComponent(orgSlug)}`,
      userId,
      ...(requestId !== undefined ? { requestId } : {}),
    });
  }
}
