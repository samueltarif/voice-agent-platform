import { describe, expect, it } from 'vitest';
import { AppError, NotFoundError, UnauthorizedError } from './index.js';

describe('Errors Package', () => {
  it('should instantiate AppError with defaults', () => {
    const err = new AppError('Something broke');
    expect(err.message).toBe('Something broke');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.name).toBe('AppError');
  });

  it('should instantiate NotFoundError with 404', () => {
    const err = new NotFoundError('Agent not found');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.name).toBe('NotFoundError');
  });

  it('should instantiate UnauthorizedError with 401', () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });
});
