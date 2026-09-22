import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { discloseFault } from './fault-disclosure';
import { LifetimeFault } from './lifetime-fault';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

/** A refusal carrying exactly what must never reach a reader. */
const refusal = (): Error =>
  new Error('saving plan p-7 for alice@example.com failed', {
    cause: new Error('token sk-live-4419'),
  });

afterEach(() => {
  cleanup();
});

describe('the page that could not start', () => {
  itDom('shows the same reference it logged, and nothing of the refusal', () => {
    const fault = discloseFault(refusal());

    render(<LifetimeFault fault={fault} />);

    const page = document.querySelector('[data-lifetime-fault]')?.textContent ?? null;
    expect(page).toContain(fault.sentence);
    const reference = document.querySelector('[data-lifetime-fault-reference]');
    expect(reference, 'the page disclosed no reference to quote').not.toBeNull();
    expect(reference?.textContent).toContain(fault.occurrenceId);
    expect(page).not.toContain('alice@example.com');
    expect(page).not.toContain('sk-live-4419');
    expect(page).not.toContain('p-7');
  });

  /**
   * The same page is shown when a **retirement** fails, so it may not say the page
   * never started or that nothing was lost: a reader can have been working in it for
   * an hour. The assurance it does give is the root boundary's, which is true of both.
   */
  itDom('says nothing that a failed retirement would make false', () => {
    render(<LifetimeFault fault={discloseFault(refusal())} />);

    const page = document.querySelector('[data-lifetime-fault]')?.textContent ?? null;
    expect(page).toContain('Anything already saved is on the server');
    expect(page).not.toContain('could not start');
    expect(page).not.toContain('no plan was open');
    expect(page).not.toContain('Nothing was lost');
  });

  itDom('offers the one thing that works, a fresh document', () => {
    render(<LifetimeFault fault={discloseFault(refusal())} />);

    expect(screen.getByRole('button', { name: 'Reload' })).toBeDefined();
  });

  itDom('tells a screen reader at once rather than waiting for a quiet moment', () => {
    render(<LifetimeFault fault={discloseFault(refusal())} />);

    expect(document.querySelector('[data-lifetime-fault]')?.getAttribute('role')).toBe('alert');
  });
});
