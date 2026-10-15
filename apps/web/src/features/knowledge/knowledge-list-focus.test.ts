import { describe, it, expect, vi } from 'vitest';
import { handleDialogCloseAutoFocus } from './knowledge-list-focus';

describe('focus after archive dialog closes (F-A2)', () => {
  it('prevents focus returning to a removed trigger and focuses the list instead', () => {
    const preventDefault = vi.fn();
    const restoreFocus = vi.fn();
    handleDialogCloseAutoFocus({ preventDefault }, restoreFocus);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(restoreFocus).toHaveBeenCalledTimes(1);
  });
});
