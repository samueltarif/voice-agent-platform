import { describe, expect, it } from 'vitest';
import { cn } from './class-names';

describe('class-names (cn utility)', () => {
  it('combines multiple string class names', () => {
    expect(cn('btn', 'btn-primary')).toBe('btn btn-primary');
  });

  it('handles conditional class names with falsy values', () => {
    const isPrimary = true;
    const isOutline = false;
    expect(cn('btn', isPrimary && 'btn-primary', isOutline && 'btn-outline', null, undefined)).toBe(
      'btn btn-primary',
    );
  });

  it('merges overlapping Tailwind utility classes properly', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });
});
