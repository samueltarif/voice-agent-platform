import { describe, it, expect } from 'vitest';
import {
  ACTIVE_ORGANIZATION_COOKIE_NAME,
  ACTIVE_ORGANIZATION_COOKIE_OPTIONS,
  extractActiveOrgSlugFromCookieString,
  getActiveOrgSlugCookie,
  setActiveOrgSlugCookie,
  clearActiveOrgSlugCookie,
} from './active-organization-cookie.js';

describe('Active Organization Cookie Helpers', () => {
  it('defines secure, HttpOnly, sameSite lax cookie options', () => {
    expect(ACTIVE_ORGANIZATION_COOKIE_NAME).toBe('active_organization_slug');
    expect(ACTIVE_ORGANIZATION_COOKIE_OPTIONS.httpOnly).toBe(true);
    expect(ACTIVE_ORGANIZATION_COOKIE_OPTIONS.sameSite).toBe('lax');
    expect(ACTIVE_ORGANIZATION_COOKIE_OPTIONS.path).toBe('/');
  });

  it('extracts slug from raw Cookie header string correctly', () => {
    const header = 'theme=dark; active_organization_slug=acme-corp; session=xyz123';
    expect(extractActiveOrgSlugFromCookieString(header)).toBe('acme-corp');
  });

  it('returns null when raw Cookie header is null, empty, or does not contain active org slug', () => {
    expect(extractActiveOrgSlugFromCookieString(null)).toBeNull();
    expect(extractActiveOrgSlugFromCookieString('')).toBeNull();
    expect(extractActiveOrgSlugFromCookieString('theme=dark; session=xyz')).toBeNull();
    expect(extractActiveOrgSlugFromCookieString('active_organization_slug=')).toBeNull();
  });

  it('reads slug via CookieReader interface', () => {
    const store = new Map<string, { value: string }>();
    store.set('active_organization_slug', { value: 'globex' });

    const reader = {
      get: (name: string) => store.get(name),
    };
    expect(getActiveOrgSlugCookie(reader)).toBe('globex');
  });

  it('sets slug via CookieWriter with expected options', () => {
    let capturedName = '';
    let capturedValue = '';
    let capturedOptions: unknown = null;

    const writer = {
      set: (name: string, value: string, options: typeof ACTIVE_ORGANIZATION_COOKIE_OPTIONS) => {
        capturedName = name;
        capturedValue = value;
        capturedOptions = options;
      },
    };

    setActiveOrgSlugCookie(writer, 'initech');
    expect(capturedName).toBe(ACTIVE_ORGANIZATION_COOKIE_NAME);
    expect(capturedValue).toBe('initech');
    expect(capturedOptions).toEqual(ACTIVE_ORGANIZATION_COOKIE_OPTIONS);
  });

  it('rejects empty slug when setting cookie', () => {
    const writer = {
      set: () => {},
    };
    expect(() => setActiveOrgSlugCookie(writer, '   ')).toThrow(
      'Organization slug cannot be empty',
    );
  });

  it('clears active organization cookie via CookieDeleter', () => {
    let deletedName = '';
    const deleter = {
      delete: (name: string) => {
        deletedName = name;
      },
    };

    clearActiveOrgSlugCookie(deleter);
    expect(deletedName).toBe(ACTIVE_ORGANIZATION_COOKIE_NAME);
  });
});
