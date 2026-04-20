export interface ImageSpec {
  tier: 'be' | 'gw' | 'fe';
  baseImage: string;
  entrypoint: string[];
  workdir: string;
}

export const DEFAULT_IMAGES: Record<ImageSpec['tier'], ImageSpec> = {
  be: {
    tier: 'be',
    baseImage: 'oven/bun:1.2-debian',
    entrypoint: ['bun', 'run', 'apps/be-01/src/main.ts'],
    workdir: '/app',
  },
  gw: {
    tier: 'gw',
    baseImage: 'oven/bun:1.2-debian',
    entrypoint: ['bun', 'run', 'apps/gw-01/src/main.ts'],
    workdir: '/app',
  },
  fe: {
    tier: 'fe',
    baseImage: 'caddy:2-alpine',
    entrypoint: ['caddy', 'run', '--config', '/etc/caddy/Caddyfile'],
    workdir: '/srv',
  },
};
