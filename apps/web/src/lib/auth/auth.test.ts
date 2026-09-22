import { describe, it, expect } from 'vitest';
import { auth } from './auth.js';

describe('Better Auth Server Flow (Integration)', () => {
  it('initializes Better Auth instance with correct context and options', () => {
    expect(auth).toBeDefined();
    expect(auth.options.emailAndPassword?.enabled).toBe(true);
    expect('plugins' in auth.options).toBe(false);
  });

  it('registers new user and creates session via auth api', async () => {
    const testSuffix = Math.random().toString(36).substring(2, 8);
    const email = `testuser_${testSuffix}@example.com`;
    const password = 'Password123!Secure';
    const name = `Test User ${testSuffix}`;

    const signUpResponse = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
      },
    });

    expect(signUpResponse).toBeDefined();
    expect(signUpResponse.user).toBeDefined();
    expect(signUpResponse.user.email).toBe(email);
    expect(signUpResponse.user.name).toBe(name);
    expect(signUpResponse.token).toBeDefined();
  });
});
