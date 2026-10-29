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
  | 'preflight-green'
  | 'mcp-preflight'
  | 'record-writer-stop'
  | 'verify-blue-stopped'
  | 'stored-vocabularies-before-start'
  | 'start-maintenance'
  | 'stop-maintenance'
  | 'record-writer-exposure'
  | 'start-green'
  | 'stored-vocabularies'
  | 'backup-db'
  | 'migrate'
  | 'health-gate'
  | 'grant-alias'
  | 'render-route'
  | 'reload'
  | 'drain'
  | 'revoke-alias'
  | 'stop-blue'
  | 'stored-vocabularies-after-stop'
  | 'backfill-step-codes'
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

  if (tier === 'be') {
    // Proof: the old start-first planner failed the stopped-writer ordering test.
    // Every backend transition has an outage: a binary that predates a new fact
    // can still corrupt its ownership with structural writes during overlap.
    return {
      tier,
      from,
      to,
      steps: [
        'preflight-green',
        // Proof: with this step left out, `refuses an unaccepted wbs:org
        // registration before any writer stops` (swap-mcp-preflight.db.test.ts)
        // saw the swap reach the outgoing stop; watched 2026-10-28.
        'mcp-preflight',
        'record-writer-stop',
        'stop-blue',
        'verify-blue-stopped',
        'stored-vocabularies-before-start',
        'start-maintenance',
        'backup-db',
        'migrate',
        'stop-maintenance',
        'record-writer-exposure',
        'start-green',
        'stored-vocabularies',
        'health-gate',
        'stored-vocabularies-after-stop',
        'backfill-step-codes',
        'grant-alias',
        'render-route',
        'reload',
        'commit',
      ],
    };
  }
  const steps: SwapStep[] = ['start-green', 'health-gate', 'render-route', 'reload'];
  if (tier === 'gw') steps.push('drain');
  if (from !== null) steps.push('stop-blue');
  steps.push('commit');
  return { tier, from, to, steps };
}
