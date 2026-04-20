import { flipColor, type Tier, type TierState } from './lib/state';

export interface SwapPlan {
  tier: Tier;
  fromColor: TierState['activeColor'];
  toColor: TierState['activeColor'];
  dryRun: boolean;
}

export function planSwap(current: TierState, dryRun = true): SwapPlan {
  return {
    tier: current.tier,
    fromColor: current.activeColor,
    toColor: flipColor(current.activeColor),
    dryRun,
  };
}

export function describePlan(p: SwapPlan): string {
  return `[swap-${p.tier}] ${p.fromColor} -> ${p.toColor}${p.dryRun ? ' (dry-run)' : ''}`;
}

function main(): void {
  const tierArg = process.argv[2];
  if (tierArg !== 'be' && tierArg !== 'gw' && tierArg !== 'fe' && tierArg !== 'all') {
    throw new Error('usage: swap <be|gw|fe|all>');
  }
  const tiers: Tier[] = tierArg === 'all' ? ['be', 'gw', 'fe'] : [tierArg];
  for (const t of tiers) {
    const plan = planSwap({ tier: t, activeColor: 'blue', lastDeployedSha: null }, true);
    console.log(describePlan(plan));
  }
  console.log('[swap] running in dry-run mode — no live Docker or Caddy operations performed.');
}

if (import.meta.main) {
  main();
}
