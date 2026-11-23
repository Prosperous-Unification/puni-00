function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validate anonymous auth once; organization mode requires onboarding.
 * Proof: backend-probe-fault-{identity-boundary,anonymous-user,onboarding-boolean,
 * organizations-boolean,feature-dependency}-v123 each admitted its invalid loopback
 * response and failed the named refusal assertion; exact restoration passed.
 * The boundary omission covers the envelope, not every isRecord conjunct separately.
 */
function requireAnonymousIdentity(identity: unknown): void {
  if (
    !isRecord(identity) ||
    identity['user'] !== null ||
    !isRecord(identity['features']) ||
    typeof identity['features']['onboarding'] !== 'boolean' ||
    typeof identity['features']['organizations'] !== 'boolean' ||
    (identity['features']['organizations'] && !identity['features']['onboarding'])
  )
    throw new Error('backend probe: expected anonymous user and valid deployment features FAIL');
}

/**
 * Probe the mounted auth controller without credentials or redirect following.
 * The fifteen-second abort covers response headers and body consumption. Network,
 * HTTP, JSON and identity failures throw; callers print success only after settlement.
 */
export async function probeBackend(origin: string): Promise<void> {
  let response: Response;
  try {
    // Proof: backend-probe-fault-auth-route-v123 requested /wrong-auth-route and
    // failed the captured native request path assertion; restoration passed.
    response = await fetch(origin.replace(/\/$/u, '') + '/api/auth/me', {
      method: 'GET',
      credentials: 'omit',
      // Proof: backend-probe-fault-redirect-policy-v123 followed the real302 and
      // returned success, failing refusal; restoration made zero target requests.
      redirect: 'manual',
      // Proof: backend-probe-fault-request-timeout-v123 reached the fixture's20s
      // release and returned success; restored native abort refused after15s.
      signal: AbortSignal.timeout(15_000),
    });
  } catch (cause: unknown) {
    throw new Error('backend probe: anonymous auth request failed FAIL', { cause });
  }
  // Proof: backend-probe-fault-http-status-v123 admitted valid-body HTTP201;
  // its own refusal assertion failed, then passed after exact restoration.
  if (response.status !== 200) {
    await response.body?.cancel();
    throw new Error(
      'backend probe: expected HTTP 200; received HTTP ' + String(response.status) + ' FAIL',
    );
  }
  let identity: unknown;
  try {
    identity = await response.json();
  } catch (cause: unknown) {
    throw new Error('backend probe: anonymous auth response could not be read as JSON FAIL', {
      cause,
    });
  }
  requireAnonymousIdentity(identity);
}
