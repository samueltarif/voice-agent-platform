import type { JWK } from 'jose';
import { BootstrapApiClient, type BootstrapApiClientConfig } from './bootstrap-api-client.js';
import { InternalApiClient, type InternalApiClientConfig } from './internal-api-client.js';

let cachedBootstrapClient: BootstrapApiClient | null = null;
let cachedInternalClient: InternalApiClient | null = null;

function resolveBaseUrl(customConfig?: Partial<BootstrapApiClientConfig>): string {
  if (customConfig?.baseUrl) {
    return customConfig.baseUrl;
  }
  if (process.env.INTERNAL_SERVICE_API_URL) {
    return process.env.INTERNAL_SERVICE_API_URL;
  }
  if (process.env.API_URL) {
    return process.env.API_URL;
  }
  return 'http://localhost:3001';
}

function resolvePrivateJwk(customConfig?: Partial<BootstrapApiClientConfig>): JWK {
  if (customConfig?.privateJwk) {
    return customConfig.privateJwk;
  }
  const raw = process.env.INTERNAL_SERVICE_PRIVATE_JWK;
  if (!raw) {
    throw new Error('INTERNAL_SERVICE_PRIVATE_JWK is required to initialize API clients');
  }
  try {
    return JSON.parse(raw) as JWK;
  } catch {
    throw new Error('INTERNAL_SERVICE_PRIVATE_JWK environment variable is not valid JSON');
  }
}

function resolveConfig(customConfig?: Partial<BootstrapApiClientConfig>): {
  baseUrl: string;
  privateJwk: JWK;
  kid: string;
} {
  const baseUrl = resolveBaseUrl(customConfig);
  const privateJwk = resolvePrivateJwk(customConfig);
  const kid = customConfig?.kid || privateJwk.kid || 'default-kid';

  return { baseUrl, privateJwk, kid };
}

export function getBootstrapApiClient(
  customConfig?: Partial<BootstrapApiClientConfig>,
): BootstrapApiClient {
  if (customConfig) {
    const { baseUrl, privateJwk, kid } = resolveConfig(customConfig);
    const config: BootstrapApiClientConfig = {
      baseUrl,
      privateJwk,
      kid,
      ...(customConfig.fetchFn !== undefined ? { fetchFn: customConfig.fetchFn } : {}),
      ...(customConfig.timeoutMs !== undefined ? { timeoutMs: customConfig.timeoutMs } : {}),
    };
    return new BootstrapApiClient(config);
  }

  if (!cachedBootstrapClient) {
    const { baseUrl, privateJwk, kid } = resolveConfig();
    cachedBootstrapClient = new BootstrapApiClient({ baseUrl, privateJwk, kid });
  }

  return cachedBootstrapClient;
}

export function getInternalApiClient(
  customConfig?: Partial<InternalApiClientConfig>,
): InternalApiClient {
  if (customConfig) {
    const { baseUrl, privateJwk, kid } = resolveConfig(customConfig);
    const config: InternalApiClientConfig = {
      baseUrl,
      privateJwk,
      kid,
      ...(customConfig.fetchFn !== undefined ? { fetchFn: customConfig.fetchFn } : {}),
      ...(customConfig.timeoutMs !== undefined ? { timeoutMs: customConfig.timeoutMs } : {}),
    };
    return new InternalApiClient(config);
  }

  if (!cachedInternalClient) {
    const { baseUrl, privateJwk, kid } = resolveConfig();
    cachedInternalClient = new InternalApiClient({ baseUrl, privateJwk, kid });
  }

  return cachedInternalClient;
}
