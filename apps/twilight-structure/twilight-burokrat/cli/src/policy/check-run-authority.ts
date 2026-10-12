import type { CheckRunAuthority } from './check-runs';

/**
 * The one recorder whose check runs both preparers accept: Twilight Dash's
 * `run-activation-checks`. It lives outside `check-runs.ts` because the judge facade's modules may
 * not name Dash; the golden ledgers under `fixtures/check-runs/` pin that Dash writes exactly this value.
 */
export const dashCheckRunAuthority: CheckRunAuthority = {
  product: 'twilight-dash',
  command: 'run-activation-checks',
};
