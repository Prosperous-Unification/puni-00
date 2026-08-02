export type Tier = 'be' | 'gw' | 'fe';

export interface TierState {
  tier: Tier;
  lastDeployedSha: string | null;
  activeColor: Color;
}

export type Color = 'blue' | 'green';

export function flipColor(c: Color): Color {
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

/**
 * Where a deploy got to. Written before each transition so a killed deploy can
 * be classified without guessing.
 */
export type Phase = 'preparing' | 'routed' | 'old-stopped' | 'committed';

export const PHASES: readonly Phase[] = ['preparing', 'routed', 'old-stopped', 'committed'];

export function isPhase(v: string): v is Phase {
  return (PHASES as readonly string[]).includes(v);
}
