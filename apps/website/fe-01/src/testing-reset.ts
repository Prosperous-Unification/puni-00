interface ResetBrowser {
  location: { origin: string; hostname: string; hash: string; pathname: string; search: string };
  history: { replaceState(state: null, unused: string, url: string): void };
}

interface ResetWindow extends ResetBrowser {
  addEventListener(type: 'hashchange', listener: () => void): void;
  removeEventListener(type: 'hashchange', listener: () => void): void;
}

/**
 * Observes same-document reset URLs before analytics starts. Successful resets call `remount`
 * so callers discard cached exhausted state. Ordinary fragments do nothing; cleanup removes
 * the observer. Initial page startup still uses {@link consumeTestingReset} explicitly.
 */
export function bindTestingReset(
  browser: ResetWindow,
  reset: (secret: string) => Promise<void>,
  remount: () => void,
  fail: (error: unknown) => void,
): () => void {
  const consumeHash = (): void => {
    const pending = consumeTestingReset(browser, reset);
    // Proof: removing this guard raised a window error on ordinary hashes and failed the no-remount test.
    if (pending !== null) void pending.then(remount, fail);
  };
  // Proof: removing this registration left same-document reset tests without a request or remount.
  browser.addEventListener('hashchange', consumeHash);
  return () => {
    browser.removeEventListener('hashchange', consumeHash);
  };
}

/**
 * Consumes the operator-only preview fragment before analytics or app requests start. Ordinary
 * startup returns null synchronously and changes nothing. The secret is passed only to the
 * authenticated POST callback, never a request URL, storage, rendered message or transport error.
 */
export function consumeTestingReset(
  browser: ResetBrowser,
  reset: (secret: string) => Promise<void>,
): Promise<void> | null {
  const fragment = new URLSearchParams(browser.location.hash.slice(1));
  if (!fragment.has('test-reset')) return null;
  const secret = fragment.get('test-reset');
  // Proof: removing the scrub failed the test asserting a clean URL inside the reset callback.
  browser.history.replaceState(null, '', `${browser.location.pathname}${browser.location.search}`);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(browser.location.hostname);
  // Proof: bypassing this guard sent production tokens; prefix matching sent a hostile preview suffix in testing-reset.test.ts.
  if (
    !['https://dev.app.puni.dev', 'https://dev.request.puni.dev'].includes(
      browser.location.origin,
    ) &&
    !loopback
  )
    return Promise.reject(new Error('The testing reset is available only on preview.'));
  // Proof: bypassing this guard sent the malformed link in testing-reset.test.ts.
  if (secret === null || !/^[a-f0-9]{64}$/.test(secret))
    return Promise.reject(new Error('The testing reset link is malformed.'));
  return reset(secret).catch(() => {
    // Proof: rethrowing transport text exposed the fixture secret and failed the network-error test.
    throw new Error('The testing reset could not be completed. Check the link and try again.');
  });
}
