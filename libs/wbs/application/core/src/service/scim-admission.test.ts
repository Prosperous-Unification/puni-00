import { describe, expect, it } from 'bun:test';

import { SCIM_REQUESTS_PER_WINDOW, SCIM_WINDOW_MS, ScimAdmission } from './scim-admission';

describe('ScimAdmission', () => {
  it('admits 300 requests in a rolling minute and refuses the 301st with Retry-After', () => {
    let at = 1_000_000;
    const admission = new ScimAdmission(() => at);
    for (let request = 0; request < SCIM_REQUESTS_PER_WINDOW; request++) {
      expect(admission.admit('t1')).toEqual({ admitted: true });
      at += 100;
    }
    // The first request was at 1_000_000 and leaves the window at 1_060_000;
    // now is 1_030_000, so 30 whole seconds remain.
    expect(admission.admit('t1')).toEqual({ admitted: false, retryAfterSeconds: 30 });
    expect(admission.admit('t2')).toEqual({ admitted: true });
  });

  it('frees a slot exactly when the oldest request leaves the window', () => {
    let at = 0;
    const admission = new ScimAdmission(() => at, 2, SCIM_WINDOW_MS);
    expect(admission.admit('t')).toEqual({ admitted: true });
    at = 500;
    expect(admission.admit('t')).toEqual({ admitted: true });
    at = SCIM_WINDOW_MS - 1;
    expect(admission.admit('t')).toEqual({ admitted: false, retryAfterSeconds: 1 });
    at = SCIM_WINDOW_MS;
    expect(admission.admit('t')).toEqual({ admitted: true });
    expect(admission.admit('t')).toEqual({ admitted: false, retryAfterSeconds: 1 });
  });

  it('counts no refused request', () => {
    let at = 0;
    const admission = new ScimAdmission(() => at, 1, 1_000);
    expect(admission.admit('t')).toEqual({ admitted: true });
    for (let refused = 0; refused < 5; refused++) {
      at += 100;
      expect(admission.admit('t').admitted).toBe(false);
    }
    at = 1_000;
    expect(admission.admit('t')).toEqual({ admitted: true });
  });
});
