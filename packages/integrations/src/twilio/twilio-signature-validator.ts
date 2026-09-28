import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TwilioSignatureValidationInput {
  readonly url: string;
  readonly params?: Readonly<Record<string, string>> | undefined;
  readonly signature?: string | null | undefined;
  readonly authToken?: string | null | undefined;
}

export function buildTwilioSignaturePayload(
  url: string,
  params?: Readonly<Record<string, string>>,
): string {
  if (!params) {
    return url;
  }
  const sortedKeys = Object.keys(params).sort();
  let result = url;
  for (const key of sortedKeys) {
    const value = params[key];
    if (value !== undefined) {
      result += `${key}${value}`;
    }
  }
  return result;
}

export function validateTwilioSignature(input: TwilioSignatureValidationInput): boolean {
  if (!input.signature || !input.authToken || !input.url) {
    return false;
  }

  const payload = buildTwilioSignaturePayload(input.url, input.params);
  const expectedHash = createHmac('sha1', input.authToken).update(payload, 'utf8').digest('base64');

  const expectedBuffer = Buffer.from(expectedHash, 'utf8');
  const actualBuffer = Buffer.from(input.signature, 'utf8');

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}
