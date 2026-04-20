import type { Tier } from './state';

export interface CaddyFragment {
  tier: Tier | 'observability';
  content: string;
}

export function assembleCaddyfile(fragments: CaddyFragment[]): string {
  const order: (Tier | 'observability')[] = ['be', 'gw', 'fe', 'observability'];
  const ordered = [...fragments].sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier));
  return ordered.map((f) => `# --- ${f.tier} ---\n${f.content.trim()}\n`).join('\n');
}
