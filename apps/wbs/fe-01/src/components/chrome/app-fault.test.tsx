import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GanttFaultBoundary } from '@/components/wbs/gantt-fault';
import { GanttDataError } from '@/components/wbs/gantt-geometry';

import { AppFaultBoundary } from './app-fault';
import { FaultBoundary } from './fault-boundary';
import { ROOT_FAULT_OPTIONS } from './root-fault-options';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

/** A component that throws the moment it renders, the way a bad union does. */
function Throwing({ words }: { words: string }): never {
  throw new Error(words);
}

/**
 * A component that throws the panel's own modelled fault.
 *
 * The distinction the disclosure rests on: `GanttDataError`'s sentences are written by
 * `gantt-geometry.ts` over identifiers the payload already carried, so the chart's boundary
 * selects them deliberately. A plain `Error` reaching the same boundary does not get that
 * treatment, which is the case below.
 */
function ThrowingGanttData({ words }: { words: string }): never {
  throw new GanttDataError(words);
}

/** A component that throws a value the case built, rather than one it described. */
function ThrowingValue({ thrown }: { thrown: unknown }): never {
  throw thrown;
}

/** What the app-level fallback put on screen, or null while it did not. */
const appFaultWords = (): string | null =>
  document.querySelector('[data-app-fault]')?.textContent ?? null;

/** What the chart's own fallback put on screen, or null while it did not. */
const chartFaultWords = (): string | null =>
  document.querySelector('[data-gantt-fault]')?.textContent ?? null;

/**
 * React writes the caught error to `console.error` whatever a boundary does,
 * and so does {@link AppFaultBoundary.componentDidCatch} deliberately. Left
 * alone, five expected faults print five stack traces over a passing suite.
 */
const muteConsoleError = () => vi.spyOn(console, 'error').mockImplementation(() => undefined);

let logged: ReturnType<typeof muteConsoleError>;

beforeEach(() => {
  logged = muteConsoleError();
});

afterEach(() => {
  cleanup();
  logged.mockRestore();
});

describe('the app’s last boundary', () => {
  itDom('renders its children while nothing throws', () => {
    render(
      <AppFaultBoundary>
        <p>the editor</p>
      </AppFaultBoundary>,
    );

    expect(screen.getByText('the editor')).toBeDefined();
    expect(appFaultWords()).toBeNull();
  });

  itDom('discloses a generic sentence and a reference, offers a reload, and leaves a page', () => {
    // F7, observed live 2026-08-09: a throw in the editor unmounted the tree
    // and left `document.body.innerHTML` empty, with React's "Consider adding
    // an error boundary" the only trace of it anywhere.
    //
    // Proof: `<AppFaultBoundary>` struck from this render and `<Throwing>`
    // rendered bare. This test failed with the render itself throwing —
    // `Error: the plan is in a state it cannot be in`, out of `render` rather
    // than as a failed expectation — which is the white screen, in a test.
    // Watched 2026-08-09.
    render(
      <AppFaultBoundary>
        <Throwing words="the plan is in a state it cannot be in" />
      </AppFaultBoundary>,
    );

    // 1. The public report's own generic message, and **not** the thrown
    //    error's words: the root catches what nothing modelled, so what it
    //    caught is raw by definition and the page is a disclosure boundary.
    expect(appFaultWords()).toContain('The app stopped');
    expect(appFaultWords()).toContain('Something went wrong');
    expect(appFaultWords()).not.toContain('the plan is in a state it cannot be in');
    // 2. The handle, which is the one fault-specific thing on the page and the
    //    only way a reader and an operator can be talking about the same event.
    expect(document.querySelector('[data-app-fault-reference]')?.textContent).toMatch(
      /^Reference AE_[0-9A-Z]+$/,
    );
    // 3. Spoken, so a screen reader is told the page has gone rather than
    //    finding it silently replaced.
    expect(screen.getByRole('alert')).toBeDefined();
    // 4. And a way out, which is the only one there is at the root.
    expect(screen.getByRole('button', { name: 'Reload' })).toBeDefined();
    // 5. The failure this is here to stop, stated as itself.
    expect(document.body.innerHTML).not.toBe('');
  });

  itDom('reloads the document when the reader asks', () => {
    const reload = vi.fn();
    const original = window.location;
    // The boundary that makes this safe: jsdom refuses to navigate and prints
    // "Not implemented: navigation", so `window.location` is a stub with the
    // one member the fallback touches for the length of this test, and the real
    // one is put back below. The production call is the one line in the handler.
    Object.defineProperty(window, 'location', { configurable: true, value: { reload } });
    try {
      render(
        <AppFaultBoundary>
          <Throwing words="gone" />
        </AppFaultBoundary>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Reload' }));

      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });

  itDom('discloses nothing of a thrown value that was not an error at all', () => {
    // `throw 'nope'` is legal JavaScript and a dependency can do it. It is the case where
    // "just print the message" has no message to print, and the public report answers for a
    // primitive exactly as it does for an `Error`.
    function ThrowingAString(): never {
      // The fault being modelled is precisely a dependency that throws a
      // non-Error, so the rule is off for this one line.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'nope';
    }
    render(
      <AppFaultBoundary>
        <ThrowingAString />
      </AppFaultBoundary>,
    );

    expect(appFaultWords()).toContain('Something went wrong');
    expect(appFaultWords()).not.toContain('nope');
    expect(appFaultWords()).not.toContain('undefined');
    expect(document.querySelector('[data-app-fault-reference]')?.textContent).toMatch(
      /^Reference AE_[0-9A-Z]+$/,
    );
  });
});

describe('the nearest boundary is the one that catches', () => {
  itDom('costs a chart rather than a page when the chart is what threw', () => {
    // The split this change deliberately does not widen: the chart is the
    // optional feature that may degrade (AGENTS.md, R5), the editor beside it
    // is not. `GanttFaultBoundary` is the real one from `gantt-fault.tsx` —
    // unchanged by this change — so what is asserted here is React's own
    // nearest-wins rule over the two boundaries the app actually ships.
    //
    // Proof: `<GanttFaultBoundary>` struck from this render, leaving the throw
    // to the app boundary. This test failed on
    // `expect(chartFaultWords()).toContain('The chart cannot be drawn')` —
    // `AssertionError: the given combination of arguments (null and string) is
    // invalid for this assertion`, chai's words for a chart fallback that was
    // never rendered because the whole page's had replaced it. Watched
    // 2026-08-09.
    render(
      <AppFaultBoundary>
        <p>the editor</p>
        <GanttFaultBoundary generation={1}>
          <ThrowingGanttData words="slice sanding names a predecessor this payload has not got" />
        </GanttFaultBoundary>
      </AppFaultBoundary>,
    );

    expect(chartFaultWords()).toContain('The chart cannot be drawn');
    expect(chartFaultWords()).toContain('slice sanding names a predecessor');
    // The app boundary did not fire, and the page around the chart is still on
    // screen — which is the whole point of the inner one.
    expect(appFaultWords()).toBeNull();
    expect(screen.getByText('the editor')).toBeDefined();
  });

  itDom('catches what the chart’s boundary is not under', () => {
    // The other half of the same rule: a throw beside the chart rather than
    // inside it has nothing nearer than the root, and reaches it.
    render(
      <AppFaultBoundary>
        <GanttFaultBoundary generation={1}>
          <p>a chart</p>
        </GanttFaultBoundary>
        <Throwing words="the table cannot render this row" />
      </AppFaultBoundary>,
    );

    expect(appFaultWords()).toContain('Something went wrong');
    expect(appFaultWords()).not.toContain('the table cannot render this row');
    expect(chartFaultWords()).toBeNull();
  });
});

describe('what a caught fault discloses', () => {
  /** A failure carrying everything a diagnostic report would want and a page may not have. */
  const secretBearing = (): Error =>
    new Error('saving plan p-7 for alice@example.com failed', {
      cause: { authorization: 'Bearer live-token', detail: 'row 42 of plan_steps' },
    });

  itDom('puts neither the message, the cause nor a stack into the DOM', () => {
    render(
      <AppFaultBoundary>
        <ThrowingValue thrown={secretBearing()} />
      </AppFaultBoundary>,
    );

    const page = document.body.innerHTML;
    for (const raw of ['alice@example.com', 'Bearer live-token', 'row 42 of plan_steps', 'p-7']) {
      expect(page, raw).not.toContain(raw);
    }
    expect(appFaultWords()).toContain('Something went wrong');
  });

  itDom('logs the boundary, the disclosed sentence and the reference, and nothing else', () => {
    render(
      <AppFaultBoundary>
        <ThrowingValue thrown={secretBearing()} />
      </AppFaultBoundary>,
    );

    const ours = logged.mock.calls.filter((call) => call[0] === 'the app could not render');
    expect(ours).toHaveLength(1);
    expect(ours[0]).toEqual([
      'the app could not render',
      'Something went wrong',
      expect.any(String),
      'nothing',
    ]);
    expect(String(ours[0][2])).toMatch(/^AE_[0-9A-Z]+$/);
  });

  itDom('shows the same reference on the page as it logged', () => {
    render(
      <AppFaultBoundary>
        <ThrowingValue thrown={secretBearing()} />
      </AppFaultBoundary>,
    );

    const logLine = logged.mock.calls.find((call) => call[0] === 'the app could not render');
    expect(appFaultWords()).toContain(String(logLine?.[2]));
  });

  itDom('discloses the chart’s own modelled sentence and no other error’s', () => {
    render(
      <GanttFaultBoundary generation={1}>
        <ThrowingValue thrown={secretBearing()} />
      </GanttFaultBoundary>,
    );

    expect(chartFaultWords()).toContain('Something went wrong');
    expect(chartFaultWords()).not.toContain('alice@example.com');
  });
});

/** What a bare {@link FaultBoundary} put on screen, or null while it did not. */
const bareFaultWords = (): string | null =>
  document.querySelector('[data-bare-fault]')?.textContent ?? null;

/**
 * Render the production {@link FaultBoundary} over a throwing child with one selector.
 *
 * @param thrown The value the child throws.
 * @param discloses The selector under test.
 */
function renderBareBoundary(thrown: unknown, discloses: (thrown: unknown) => string | null): void {
  render(
    <FaultBoundary
      logAs="the bare boundary could not render"
      discloses={discloses}
      resetKey="one"
      fallback={(fault) => (
        <p data-bare-fault>
          {fault.sentence} / {fault.occurrenceId} / {fault.lost}
        </p>
      )}
    >
      <ThrowingValue thrown={thrown} />
    </FaultBoundary>,
  );
}

/** The one console line a bare boundary case wrote. */
const bareLogLine = (): unknown[] => {
  const ours = logged.mock.calls.filter((call) => call[0] === 'the bare boundary could not render');
  expect(ours).toHaveLength(1);
  return ours[0];
};

describe('a caught value that cannot be inspected', () => {
  /**
   * A `GanttDataError` whose `message` is an own accessor that counts its own reads.
   *
   * @param onRead Called whenever the accessor runs.
   * @returns The hostile value, ready to throw.
   */
  const withAMessageAccessor = (onRead: () => void): GanttDataError => {
    const hostile = new GanttDataError('never read');
    Object.defineProperty(hostile, 'message', {
      get: () => {
        onRead();
        throw new Error('selector accessor ran');
      },
      configurable: true,
    });
    return hostile;
  };

  itDom('never invokes an accessor to read the chart’s sentence', () => {
    const read = vi.fn();
    render(
      <AppFaultBoundary>
        <p>the editor</p>
        <GanttFaultBoundary generation={1}>
          <ThrowingValue thrown={withAMessageAccessor(read)} />
        </GanttFaultBoundary>
      </AppFaultBoundary>,
    );

    expect(read).not.toHaveBeenCalled();
    expect(chartFaultWords()).toContain('Something went wrong');
    expect(chartFaultWords()).not.toContain('selector accessor ran');
    expect(appFaultWords()).toBeNull();
    expect(screen.getByText('the editor')).toBeDefined();
    const ours = logged.mock.calls.filter(
      (call) => call[0] === 'the Gantt panel could not draw this plan',
    );
    expect(ours).toHaveLength(1);
    expect(ours[0][3]).toBe('nothing');
  });

  itDom('never discloses a chart message that is not a string', () => {
    const hostile = new GanttDataError('never read');
    Object.defineProperty(hostile, 'message', {
      value: { toString: () => 'coerced' },
      configurable: true,
    });
    render(
      <AppFaultBoundary>
        <p>the editor</p>
        <GanttFaultBoundary generation={1}>
          <ThrowingValue thrown={hostile} />
        </GanttFaultBoundary>
      </AppFaultBoundary>,
    );

    // Asserted on the console line and not only on the DOM: an object reaching
    // `fault.sentence` is a value React may render as nothing at all, so the rendered
    // text alone cannot tell a string apart from an object (watched 2026-09-21).
    const ours = logged.mock.calls.filter(
      (call) => call[0] === 'the Gantt panel could not draw this plan',
    );
    expect(ours).toHaveLength(1);
    expect(ours[0][1]).toBe('Something went wrong');
    expect(chartFaultWords()).not.toContain('coerced');
    expect(appFaultWords()).toBeNull();
    expect(screen.getByText('the editor')).toBeDefined();
  });

  itDom('never offers an unreportable value to a disclosure selector', () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    const select = vi.fn(() => 'the selector ran');

    renderBareBoundary(new Error('boom', { cause: proxy }), select);

    expect(select).not.toHaveBeenCalled();
    expect(bareFaultWords()).toContain('the failure could not be described');
    expect(bareLogLine()[3]).toBe('the report');
  });

  itDom('survives a disclosure selector that throws', () => {
    renderBareBoundary(new Error('alice@example.com'), () => {
      throw new Error('the selector could not read it');
    });

    expect(bareFaultWords()).toContain('Something went wrong');
    expect(bareFaultWords()).not.toContain('the selector could not read it');
    expect(bareLogLine()[3]).toBe('the selector');
  });

  itDom('names the reporting loss in the console and gives it a handle', () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    render(
      <GanttFaultBoundary generation={1}>
        <ThrowingValue thrown={new Error('boom', { cause: proxy })} />
      </GanttFaultBoundary>,
    );

    const ours = logged.mock.calls.filter(
      (call) => call[0] === 'the Gantt panel could not draw this plan',
    );
    expect(ours).toHaveLength(1);
    expect(ours[0]).toEqual([
      'the Gantt panel could not draw this plan',
      'the failure could not be described',
      expect.any(String),
      'the report',
    ]);
    expect(String(ours[0][2])).toMatch(/^UNREPORTED_\d+$/);
    expect(chartFaultWords()).toContain(String(ours[0][2]));
  });

  itDom('shows the chart’s own reference, matching what it logged', () => {
    render(
      <GanttFaultBoundary generation={1}>
        <ThrowingGanttData words="slice sanding names a predecessor this payload has not got" />
      </GanttFaultBoundary>,
    );

    const logLine = logged.mock.calls.find(
      (call) => call[0] === 'the Gantt panel could not draw this plan',
    );
    expect(document.querySelector('[data-gantt-fault-reference]')?.textContent).toBe(
      `Reference ${String(logLine?.[2])}`,
    );
  });
});

describe('what React itself is allowed to say', () => {
  itDom('says nothing of its own about a fault a boundary already reported', () => {
    const { onCaughtError } = ROOT_FAULT_OPTIONS;
    expect(onCaughtError).toBeTypeOf('function');

    expect(onCaughtError?.(new Error('alice@example.com'), {})).toBeUndefined();
    expect(logged.mock.calls).toHaveLength(0);
  });

  itDom('discloses a public report for a fault no boundary caught', () => {
    const { onUncaughtError } = ROOT_FAULT_OPTIONS;
    expect(onUncaughtError).toBeTypeOf('function');

    onUncaughtError?.(new Error('alice@example.com'), {});

    expect(logged.mock.calls).toHaveLength(1);
    expect(logged.mock.calls[0]).toEqual([
      'no boundary caught this',
      'Something went wrong',
      expect.any(String),
      'nothing',
    ]);
    expect(String(logged.mock.calls[0][2])).toMatch(/^AE_[0-9A-Z]+$/);
  });

  itDom('discloses a public report for a fault React recovered from', () => {
    const { onRecoverableError } = ROOT_FAULT_OPTIONS;
    expect(onRecoverableError).toBeTypeOf('function');

    onRecoverableError?.(new Error('alice@example.com'), {});

    expect(logged.mock.calls).toHaveLength(1);
    expect(logged.mock.calls[0]).toEqual([
      'React recovered from this',
      'Something went wrong',
      expect.any(String),
      'nothing',
    ]);
    expect(String(logged.mock.calls[0][2])).toMatch(/^AE_[0-9A-Z]+$/);
  });
});
