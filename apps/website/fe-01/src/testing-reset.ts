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

/** Consumes only the explicit chat reset fragment before the authenticated command starts. */
export function consumeChatReset<T>(
  browser: ResetBrowser,
  reset: () => Promise<T>,
): Promise<T> | null {
  if (browser.location.hash !== '#reset-chat') return null;
  // Proof: removing this scrub left the reset fragment visible inside the command test.
  browser.history.replaceState(null, '', `${browser.location.pathname}${browser.location.search}`);
  return reset();
}

/** Clears this tab's old chat recovery and editor state while preserving other preferences. */
export function clearChatState(storage: Storage): void {
  storage.removeItem('puni_pending_proposal');
  // Proof: omitting removal left the previous proposal key in the chat storage test.
  storage.removeItem('puni_proposal_key');
  for (const key of Object.keys(storage)) {
    if (key.startsWith('puni_editor:')) storage.removeItem(key);
  }
}

interface ChatResetBrowser {
  confirm(message: string): boolean;
  sessionStorage: Storage;
  location: { assign(url: URL): void };
}

/** Checks operator intent before sending the reset and returns to the ordinary public intake. */
export async function executeChatReset(
  browser: ChatResetBrowser,
  siteOrigin: string,
  readCsrf: () => Promise<string>,
  command: (csrfToken: string) => Promise<void>,
): Promise<boolean> {
  const csrfToken = await readCsrf();
  // Proof: omitting confirmation let a cancelled reset issue the command.
  // A cross-site link can open the fragment in an already signed-in browser.
  if (!browser.confirm('Reset this browser’s chat and start again from the PUNI site?'))
    return false;
  const storage = browser.sessionStorage;
  await command(csrfToken);
  clearChatState(storage);
  browser.location.assign(new URL('/', siteOrigin));
  return true;
}
