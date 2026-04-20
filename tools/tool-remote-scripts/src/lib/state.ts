export type Tier = 'be' | 'gw' | 'fe';

export interface TierState {
  tier: Tier;
  lastDeployedSha: string | null;
  activeColor: 'blue' | 'green';
}

export function flipColor(c: TierState['activeColor']): TierState['activeColor'] {
  return c === 'blue' ? 'green' : 'blue';
}

export function parseStateJson(raw: string): TierState {
  const v = JSON.parse(raw) as Partial<TierState>;
  if (v.tier !== 'be' && v.tier !== 'gw' && v.tier !== 'fe') {
    throw new Error(`invalid tier: ${String(v.tier)}`);
  }
  if (v.activeColor !== 'blue' && v.activeColor !== 'green') {
    throw new Error(`invalid activeColor: ${String(v.activeColor)}`);
  }
  return {
    tier: v.tier,
    lastDeployedSha: typeof v.lastDeployedSha === 'string' ? v.lastDeployedSha : null,
    activeColor: v.activeColor,
  };
}

export function renderStateJson(state: TierState): string {
  return JSON.stringify(state, null, 2) + '\n';
}
