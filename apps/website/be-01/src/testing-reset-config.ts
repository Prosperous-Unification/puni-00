/**
 * Enables the operator's secret-fragment reset only on the fixed preview or loopback pair.
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
  // Proof: bypassing the origin-pair check allowed production enablement in testing-reset.test.ts.
  if (!(
    (publicOrigin === 'https://dev.puni.dev' && appOrigin === 'https://dev.app.puni.dev') ||
    (loopback(publicOrigin) && loopback(appOrigin))
  ))
    throw new Error('Testing reset is permitted only on preview or loopback origins');
  return value;
}
