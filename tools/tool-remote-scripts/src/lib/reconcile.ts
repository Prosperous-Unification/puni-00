import { type Color, flipColor, type Phase, type Tier } from './state';

export interface Observed {
  /** Colour the live Caddy config actually routes to. The source of truth. */
  routedColor: Color | null;
  /** Colours with a running container, from `docker compose ps`. */
  runningColors: Color[];
  /** Colour the state file claims. A cache, and possibly stale. */
  recordedColor: Color | null;
  phase: Phase | null;
}

export type SwapStep =
  | 'start-green'
  | 'migrate'
  | 'health-gate'
  | 'move-alias'
  | 'render-route'
  | 'reload'
  | 'drain'
  | 'stop-blue'
  | 'commit';

export interface SwapPlan {
  tier: Tier;
  from: Color | null;
  to: Color;
  steps: SwapStep[];
}

/**
 * Routing wins over the state file, always.
 *
 * A deploy killed between `caddy reload` and the state write leaves Caddy
 * serving green while the file still says blue. Believing the file would make
 * the next deploy tear down the container serving production traffic.
 */
export function resolveLiveColor(o: Observed): Color | null {
  if (o.routedColor !== null) return o.routedColor;
  if (o.recordedColor !== null && o.runningColors.includes(o.recordedColor)) {
    return o.recordedColor;
  }
  return null;
}

export function planSwap(tier: Tier, observed: Observed): SwapPlan {
  const from = resolveLiveColor(observed);
  const to = from === null ? 'blue' : flipColor(from);

  const steps: SwapStep[] = ['start-green'];
  // Migrations run as a discrete step before green takes traffic, so a failure
  // aborts with the old colour untouched and un-migrated.
  if (tier === 'be') steps.push('migrate');
  steps.push('health-gate');
  // gw-01 reads BE_URL once at startup, so a be swap moves a stable network
  // alias rather than reconfiguring gw.
  if (tier === 'be') steps.push('move-alias');
  steps.push('render-route', 'reload');
  if (tier === 'gw') steps.push('drain');
  if (from !== null) steps.push('stop-blue');
  steps.push('commit');
  return { tier, from, to, steps };
}
