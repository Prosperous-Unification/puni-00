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

/** The app name a tier is known by (`be-01`), independent of colour. */
export function appName(tier: Tier): string {
  return APP[tier];
}

/**
 * The port each tier's app listens on inside its container. Shared between
 * `swap.ts`'s health-gate (direct container-IP fetch) and `lib/site.ts`'s
 * rendered `reverse_proxy` targets, so the two can never drift apart.
 */
export const PORT: Record<Tier, number> = { be: 3100, gw: 3200, fe: 80 };

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
 * instead of restarting gw.
 *
 * `docker network connect --alias X net container` fails outright once a
 * container already has ANY endpoint on that network — verified live:
 * "Error response from daemon: endpoint with name be-01-blue already
 * exists in network wbs-net". `tier.compose.tmpl` always attaches every
 * colour to `wbs-net` (with its own name as an alias) the instant
 * `docker compose up` creates it, so that precondition is never true — the
 * naive one-shot connect used before this fix could never succeed, on a
 * first deploy or a real swap alike. The only Docker primitive for
 * changing an already-connected endpoint's alias set is disconnect (which
 * drops the endpoint, and every alias on it) then reconnect with the full
 * desired alias set.
 *
 * Split into two phases — `grantAliasCommands` (incoming colour, run
 * BEFORE render-route/reload) and `revokeAliasCommands` (outgoing colour,
 * run AFTER) — rather than one combined step, deliberately: at the point
 * the incoming colour is reconnected, Caddy has not been told about it yet
 * (its own `handle /api/*` route still targets the outgoing colour's own
 * name-alias), so a brief disconnect/reconnect of the incoming colour
 * disturbs nothing live. Doing the outgoing colour's disconnect/reconnect
 * at that same moment would NOT be safe — Caddy is still actively routing
 * real /api/* traffic to it by its own name-alias until reload runs later
 * in the plan, and disconnecting it (even briefly, to strip BE_ALIAS) would
 * make that in-flight traffic fail. Deferring the outgoing colour's cleanup
 * until after `reload` (once Caddy has already switched away from it)
 * avoids that window entirely.
 *
 * Residual limitation, inherent to Docker's alias model rather than fixable
 * here: BE_ALIAS briefly resolves to *neither* colour between
 * `revokeAliasCommands` clearing it off the old container and (on the next
 * `be` swap) `grantAliasCommands` granting it to the next one — there is no
 * atomic hand-off primitive across two live endpoints for a single alias.
 * This can only affect gw's internal be-01.internal forward path, never the
 * client-facing Caddy routes (site.caddy addresses be-01 by its own
 * name-alias, moved separately via render-route/reload, never by
 * BE_ALIAS) — and only in the narrow window between two `be` swaps, not
 * during this one.
 */
export function grantAliasCommands(to: Color): string[][] {
  const toName = containerName('be', to);
  return [
    ['network', 'disconnect', NETWORK, toName],
    ['network', 'connect', '--alias', toName, '--alias', BE_ALIAS, NETWORK, toName],
  ];
}

/** Phase 2 — see `grantAliasCommands`. Must run after `reload`. */
export function revokeAliasCommands(from: Color): string[][] {
  const fromName = containerName('be', from);
  return [
    ['network', 'disconnect', NETWORK, fromName],
    ['network', 'connect', '--alias', fromName, NETWORK, fromName],
  ];
}
