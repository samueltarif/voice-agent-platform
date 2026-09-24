import { randomUUID } from 'node:crypto';
import type { JWK } from 'jose';
import type { ApiErrorResponse } from '@voice-agent/contracts';
import { internalServiceSigner } from '../auth/internal-service-signer.js';

export interface InternalApiClientConfig {
  baseUrl: string;
  privateJwk: JWK;
  kid: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

export interface InternalApiRequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  userId: string;
  organizationId: string;
  body?: unknown;
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

export class InternalApiClient {
  private readonly baseUrl: string;
  private readonly privateJwk: JWK;
  private readonly kid: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(config: InternalApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.privateJwk = config.privateJwk;
    this.kid = config.kid;
    this.fetchFn = config.fetchFn ?? fetch;
    this.timeoutMs = config.timeoutMs ?? 10000;
  }

  async request<T>(options: InternalApiRequestOptions): Promise<T> {
    const assertion = await internalServiceSigner.createAssertion({
      userId: options.userId,
      organizationId: options.organizationId,
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

    const requestInit: RequestInit = {
      method: options.method,
      headers,
    };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      requestInit.body = JSON.stringify(options.body);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    requestInit.signal = controller.signal;

    try {
      const response = await this.fetchFn(url, requestInit);
      if (!response.ok) {
        await handleApiError(response, requestId);
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}
