import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EndAttemptDialog } from './end-attempt-dialog';

const ENDING = { rowId: 'w1', stepId: 'step-dev', attemptNumber: 2, label: '010.dev' };

describe('the End attempt dialog (step-node-attempts D7)', () => {
  it('holds End back until an outcome is chosen', () => {
    const onEnd = vi.fn();
    render(<EndAttemptDialog ending={ENDING} onEnd={onEnd} onOpenChange={() => undefined} />);
    const dialog = screen.getByRole('dialog', { name: 'End attempt 2 of 010.dev' });
    expect(within(dialog).getByRole('button', { name: 'End attempt' })).toBeDisabled();
    // A forced submit — Enter in the reference box — sends nothing either.
    const form = within(dialog).getByLabelText('Reference').closest('form');
    if (form === null) throw new Error('the dialog has no form');
    fireEvent.submit(form);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('offers the three outcomes and sends the chosen one with the trimmed reference', () => {
    const onEnd = vi.fn();
    render(<EndAttemptDialog ending={ENDING} onEnd={onEnd} onOpenChange={() => undefined} />);
    const dialog = screen.getByRole('dialog', { name: 'End attempt 2 of 010.dev' });
    expect(
      within(dialog)
        .getAllByRole('radio')
        .map((each) => each.getAttribute('value')),
    ).toEqual(['succeeded', 'failed', 'cancelled']);
    fireEvent.click(within(dialog).getByRole('radio', { name: /Failed/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'End attempt' }));
    expect(onEnd).toHaveBeenCalledWith('failed', undefined);
  });
});
