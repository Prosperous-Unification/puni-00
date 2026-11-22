/**
 * Enables the operator's secret-fragment reset only on fixed preview or loopback pairs.
 * The optional feature is disabled when unset; a configured malformed value refuses startup.
 * The returned secret is never included in errors or logging.
 */
export function readTestingResetSecret(
  value: string | undefined,
  publicOrigin: string,
  appOrigin: string,
): string | undefined {
  if (value === undefined) return undefined;
  // Proof: bypassing the token-shape check failed testing-reset.test.ts's malformed configuration refusals.
  if (!/^[a-f0-9]{64}$/.test(value))
    throw new Error('WEBSITE_TEST_RESET_SECRET must be 32 random bytes encoded as lowercase hex');
  const loopback = (origin: string) =>
    ['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname);
  // Proof: bypassing this check allowed production enablement; prefix matching admitted a hostile preview suffix in testing-reset.test.ts.
  if (!(
    (publicOrigin === 'https://dev.puni.dev' &&
      ['https://dev.app.puni.dev', 'https://dev.request.puni.dev'].includes(appOrigin)) ||
    (loopback(publicOrigin) && loopback(appOrigin))
  ))
    throw new Error('Testing reset is permitted only on preview or loopback origins');
  return value;
}
