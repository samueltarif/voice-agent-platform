export const ACTIVE_ORGANIZATION_COOKIE_NAME = 'active_organization_slug' as const;

export interface ActiveOrganizationCookieOptions {
  readonly httpOnly: boolean;
  readonly sameSite: 'lax';
  readonly path: string;
  readonly secure: boolean;
  readonly maxAge: number;
}

export const ACTIVE_ORGANIZATION_COOKIE_OPTIONS: ActiveOrganizationCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 60 * 60 * 24 * 30, // 30 days
};

export interface CookieReader {
  get(name: string): { value: string } | undefined;
}

export interface CookieWriter {
  set(name: string, value: string, options: ActiveOrganizationCookieOptions): void;
}

export interface CookieDeleter {
  delete(name: string): void;
}

export function extractActiveOrgSlugFromCookieString(
  cookieHeader: string | null | undefined,
): string | null {
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [rawName, ...rest] = cookie.trim().split('=');
    if (rawName === ACTIVE_ORGANIZATION_COOKIE_NAME) {
      const value = rest.join('=').trim();
      return value.length > 0 ? decodeURIComponent(value) : null;
    }
  }

  return null;
}

export function getActiveOrgSlugCookie(reader: CookieReader): string | null {
  const cookie = reader.get(ACTIVE_ORGANIZATION_COOKIE_NAME);
  if (!cookie?.value) {
    return null;
  }
  const trimmed = cookie.value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function setActiveOrgSlugCookie(writer: CookieWriter, slug: string): void {
  const trimmed = slug.trim();
  if (!trimmed) {
    throw new Error('Organization slug cannot be empty');
  }
  writer.set(ACTIVE_ORGANIZATION_COOKIE_NAME, trimmed, ACTIVE_ORGANIZATION_COOKIE_OPTIONS);
}

export function clearActiveOrgSlugCookie(deleter: CookieDeleter): void {
  deleter.delete(ACTIVE_ORGANIZATION_COOKIE_NAME);
}
