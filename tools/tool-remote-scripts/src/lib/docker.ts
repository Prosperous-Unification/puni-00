import type { Color, Tier } from './state';

/**
 * Pure command builders and output parsers for the Docker/Compose side of a
 * swap. Everything here is a string in, string(s) out — no subprocess, no
 * filesystem. `swap.ts` is the thin IO shell that actually runs these.
 */

// deploy/compose/base.yml pins `networks.wbs-net.name: wbs-net`, so the
// network is literally `wbs-net` — verified live with `ssh h2puni 'docker
// network ls'` (Task 6's plan draft used `wbs_wbs-net`, which is wrong).
export const NETWORK = 'wbs-net';

export const ROOT = '/srv/wbs';

export const BE_ALIAS = 'be-01.internal';

const APP: Record<Tier, string> = { be: 'be-01', gw: 'gw-01', fe: 'fe-01' };

const IMAGE_NAME: Record<Tier, string> = {
  be: 'wbs-be-01',
  gw: 'wbs-gw-01',
  fe: 'wbs-fe-01',
};

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;

export function isDigest(v: string): boolean {
  return DIGEST_RE.test(v);
}

export function containerName(tier: Tier, color: Color): string {
  return `${APP[tier]}-${color}`;
}

/** Where the per-colour compose override for this tier is rendered to. */
export function tierComposeFile(tier: Tier, color: Color): string {
  return `${ROOT}/compose/${containerName(tier, color)}.yml`;
}

/**
 * Ref pinned by digest, never by tag — a rebuild on a different build host
 * can move a tag but cannot move a digest (design decision 4).
 */
export function digestRef(registry: string, tier: Tier, digest: string): string {
  if (!isDigest(digest)) {
    throw new Error(`not a well-formed sha256 digest: ${digest}`);
  }
  return `${registry}/${IMAGE_NAME[tier]}@${digest}`;
}

/**
 * Substitution context for `tier.compose.tmpl`. `{{TIER}}` is deliberately
 * the app name (`be-01`), not the short tier code (`be`): that's what makes
 * the rendered service/container name equal `containerName()`, and what
 * makes the rendered `env_file` path (`/srv/wbs/be-01.env`) line up with the
 * per-app env file naming deploy.sh already uses.
 */
export function tierComposeContext(
  tier: Tier,
  color: Color,
  registry: string,
  digest: string,
): Record<string, string> {
  return {
    TIER: APP[tier],
    COLOR: color,
    IMAGE: digestRef(registry, tier, digest),
  };
}

/**
 * `docker compose up -d <container>`, merging `base.yml` (network, volumes)
 * with the already-rendered per-colour file so both share one Compose
 * project. The digest lives in that rendered file's `image:` field, not on
 * this command line — `docker compose up` has no CLI flag to override a
 * service's image, so pinning happens at render time (`tierComposeContext`),
 * not here.
 */
export function composeUpArgs(tier: Tier, color: Color): string[] {
  return [
    'compose',
    '-f',
    `${ROOT}/base.yml`,
    '-f',
    tierComposeFile(tier, color),
    'up',
    '-d',
    '--pull',
    'always',
    containerName(tier, color),
  ];
}

/**
 * Extracts which colours of a tier have a running container, from
 * `docker ps --format {{.Names}}` output (one name per line). Matches by
 * exact line equality, never substring, so e.g. a differently-prefixed
 * container never false-positives.
 */
export function psColorsFrom(psOutput: string, tier: Tier): Color[] {
  const names = new Set(
    psOutput
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0),
  );
  return (['blue', 'green'] as const).filter((color) => names.has(containerName(tier, color)));
}

/**
 * gw-01 resolves BE_URL once at startup, so a be swap moves this alias
 * instead of restarting gw. Docker allows only one container per alias per
 * network, so the old colour must be disconnected first.
 *
 * Returns `[disconnect, connect]`. `disconnect` is `null` on a first-ever
 * deploy (nothing was live before), and the caller must skip running it
 * rather than treating it as a real command.
 */
export function moveAliasArgs(from: Color | null, to: Color): [string[] | null, string[]] {
  const disconnect =
    from === null ? null : ['network', 'disconnect', NETWORK, containerName('be', from)];
  const connect = ['network', 'connect', '--alias', BE_ALIAS, NETWORK, containerName('be', to)];
  return [disconnect, connect];
}
