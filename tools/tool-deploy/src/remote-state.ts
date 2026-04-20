import type { Tier } from './affected';

export interface RemoteState {
  tier: Tier;
  lastDeployedSha: string | null;
  activeColor: 'blue' | 'green';
  updatedAt: string;
}

export function stateFilePath(tier: Tier): string {
  return `/srv/wbs/state/${tier}.last-deployed.json`;
}

export function mockRemoteState(tier: Tier): RemoteState {
  return {
    tier,
    lastDeployedSha: null,
    activeColor: 'blue',
    updatedAt: new Date(0).toISOString(),
  };
}
