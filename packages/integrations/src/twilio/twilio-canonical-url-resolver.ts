import { validatePublicVoiceBaseUrl } from '@voice-agent/config';
import { InvalidCanonicalUrlError } from '@voice-agent/errors';

export interface TwilioCanonicalUrlInput {
  readonly publicBaseUrl: string;
  readonly requestPath: string;
  readonly query?: Record<string, string | string[] | undefined> | undefined;
}

function appendQueryEntries(params: URLSearchParams, key: string, val: string | string[]): void {
  if (Array.isArray(val)) {
    for (const item of val) {
      params.append(key, item);
    }
  } else {
    params.append(key, val);
  }
}

function buildSortedQueryString(query: Record<string, string | string[] | undefined>): string {
  const searchParams = new URLSearchParams();
  const sortedKeys = Object.keys(query).sort();
  for (const key of sortedKeys) {
    const val = query[key];
    if (val !== undefined) {
      appendQueryEntries(searchParams, key, val);
    }
  }
  const queryString = searchParams.toString();
  return queryString.length > 0 ? `?${queryString}` : '';
}

export function resolveTwilioCanonicalUrl(input: TwilioCanonicalUrlInput): string {
  if (!input.publicBaseUrl) {
    throw new InvalidCanonicalUrlError('Public base URL is required to resolve canonical URL');
  }

  const normalizedBase = validatePublicVoiceBaseUrl(input.publicBaseUrl);
  const cleanPath = input.requestPath.startsWith('/') ? input.requestPath : `/${input.requestPath}`;
  const querySuffix = input.query ? buildSortedQueryString(input.query) : '';

  return `${normalizedBase}${cleanPath}${querySuffix}`;
}
