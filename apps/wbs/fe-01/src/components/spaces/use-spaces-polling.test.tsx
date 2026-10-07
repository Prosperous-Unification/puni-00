import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SPACES_REFRESH_MS, useSpacesPolling } from './use-spaces-polling';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Probe({ read }: { read: () => Promise<void> }): null {
  useSpacesPolling(read);
  return null;
}

describe('useSpacesPolling', () => {
  it('reads on focus, on becoming visible and on the interval', async () => {
    vi.useFakeTimers();
    const read = vi.fn(() => Promise.resolve());
    render(<Probe read={read} />);
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(SPACES_REFRESH_MS);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('starts no second read while one is in flight', async () => {
    let finish: () => void = () => undefined;
    const read = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(<Probe read={read} />);
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(read).toHaveBeenCalledTimes(1);
    finish();
    await Promise.resolve();
    await Promise.resolve();
    window.dispatchEvent(new Event('focus'));
    expect(read).toHaveBeenCalledTimes(2);
  });
});
