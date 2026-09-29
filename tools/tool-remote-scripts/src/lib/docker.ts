import { APP_NAME, IMAGE_NAME, PORT } from './deploy-contract';
import type { Color, Tier } from './state';

/**
 * Pure command builders and output parsers for the Docker/Compose side of a
 * swap. Everything here is a string in, string(s) out — no subprocess, no
 * filesystem. `swap.ts` is the thin IO shell that actually runs these.
 */

// The environment seam lives in ./env so that tool-deploy, on the other side
// of the SSH boundary, can import the same table rather than keeping a second
// copy of these paths. Re-exported here because this module was where callers
// have always found ROOT and NETWORK.
export {
  CURRENT_ENV,
  EDGE_CONTAINER,
  ENV_NAMES,
  type EnvLayout,
  envLayout,
  type EnvName,
} from './env';

import { CURRENT_ENV, type EnvLayout } from './env';

export const NETWORK = CURRENT_ENV.network;

export const ROOT = CURRENT_ENV.root;

export const BE_ALIAS = 'be-01.internal';

/**
 * The supervisor owns this host runtime directory. Backend containers receive
 * a read-only bind of the directory, never the socket inode itself: systemd
 * may atomically replace `supervisor.sock` when the service restarts, and a
 * file bind would pin the stale inode inside an otherwise healthy backend.
 */
export const SOLVER_SUPERVISOR_HOST_DIRECTORY = '/run/user/1000/wbs-solver';
export const SOLVER_SUPERVISOR_CONTAINER_DIRECTORY = '/run/wbs-solver';

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;

export function isDigest(v: string): boolean {
  return DIGEST_RE.test(v);
}

/**
 * The container name for a tier's colour in THIS environment. The prefix is
 * empty for prod, so prod names (`be-01-blue`) are exactly what they were
 * before environments existed; dev's are `dev-be-01-blue`. Two environments
 * cannot collide here, which matters because container names are unique per
 * daemon, not per network.
 */
export function containerName(tier: Tier, color: Color, layout: EnvLayout = CURRENT_ENV): string {
  return `${layout.containerPrefix}${APP_NAME[tier]}-${color}`;
}

/** The app name a tier is known by (`be-01`), independent of colour. */
export function appName(tier: Tier): string {
  return APP_NAME[tier];
}

// Re-exported because `lib/site.ts` and `swap.ts` read it from here, and
// because where the numbers live is the contract's business — see
// `deploy-contract.ts`.
export { PORT };

/** Where the per-colour compose override for this tier is rendered to. */
export function tierComposeFile(tier: Tier, color: Color): string {
  return `${ROOT}/compose/${containerName(tier, color)}.yml`;
}

const DIGEST_PINNED_REF_RE =
  /^(?<registry>[^/\s]+)\/(?<name>[^@\s]+)@(?<digest>sha256:[0-9a-f]{64})$/;

/**
 * Validates the image ref this swap was handed, and returns it unchanged.
 *
 * This process deliberately does NOT know the registry address. It used to:
 * there was a `REGISTRY` default here and a second one in `tool-dagger`, each
 * rebuilding the ref from its own copy, with `tool-deploy` passing only the
 * bare digest between them and no `ssh` env passthrough to reconcile the two.
 * The addresses were free to diverge, and did — every live swap so far only
 * worked because a human exported `REGISTRY=127.0.0.1:5000` in the shell that
 * ran it. The publish address now travels with the digest as one string
 * (`ReleaseEntry.image`, rendered by `tool-dagger`), so there is exactly one
 * place the address is decided.
 *
 * What is checked here is what a receiver can check without owning the
 * address: that the ref is pinned by digest rather than by a movable tag
 * (design decision 4), and that its image name is the one this tier expects —
 * which catches a mis-wired `--image` handing `be` the gateway's image, the
 * one mistake this indirection newly makes possible.
 */
export function assertDigestPinnedRef(ref: string, tier: Tier): string {
  const m = DIGEST_PINNED_REF_RE.exec(ref);
  if (!m?.groups) {
    throw new Error(
      `--image must be a digest-pinned ref (<registry>/<name>@sha256:<64 hex>), got: ${ref || '(missing)'}`,
    );
  }
  const name = m.groups['name'] ?? '';
  if (name !== IMAGE_NAME[tier]) {
    throw new Error(
      `--image names "${name}" but tier "${tier}" deploys "${IMAGE_NAME[tier]}": ${ref}`,
    );
  }
  return ref;
}

/**
 * Least privilege for the secret material each tier's process actually
 * reads — see the authoritative list in each app's `src/config.ts`, not
 * guessed:
 *
 * - fe-01 (`apps/wbs/fe-01`) is a static `caddy:2-alpine` server with no
 *   `config.ts` at all. It needs, and gets, zero secrets.
 * - be-01 (`apps/wbs/be-01/src/config.ts`) reads `INTERNAL_AUTH_SECRET` plus the
 *   JWT signing key it uses to mint `/ws` tokens.
 * - gw-01 (`apps/wbs/gw-01/src/config.ts`) reads `INTERNAL_AUTH_SECRET` plus the
 *   JWT signing key(s) it verifies `/ws` tokens against.
 *
 * `REGISTRY_PASS` is deliberately absent from every list: it belongs to the
 * host's docker daemon (configure.sh's `docker login`) and the local build
 * client, never an app container. Before this, every tier loaded the whole
 * shared `/srv/wbs/.env` (which does carry it) — a compromise of even the
 * fully-static fe-01 meant push+delete access to an internet-facing
 * registry. See `deriveTierSecrets`.
 */
const SECRET_KEYS: Record<Tier, readonly string[]> = {
  be: ['INTERNAL_AUTH_SECRET', 'JWT_SIGNING_KEY_CURRENT'],
  gw: ['INTERNAL_AUTH_SECRET', 'JWT_SIGNING_KEY_CURRENT', 'JWT_SIGNING_KEY_PREVIOUS'],
  fe: [],
};

/**
 * Whether this tier is allowed any secret keys at all — independent of what
 * `deriveTierSecrets` happens to compute for a given `/srv/wbs/.env` snapshot.
 *
 * Exists so `swap.ts` can decide whether the derived secrets file must be
 * (re)written even when the computed content is `''` (item 3(b)): if every
 * key `SECRET_KEYS[tier]` allows has disappeared from the shared `.env`
 * (typo, accidental deletion, a bad edit), `deriveTierSecrets` correctly
 * returns `''` — but a caller that only writes when the result is non-empty
 * (the previous behaviour) then SKIPS the write, leaving whatever secrets
 * file was on disk from the last successful swap active indefinitely. A
 * secret-bearing tier's derived file must always be replaced to match the
 * current source of truth, even when that means replacing it with nothing.
 */
export function tierHasSecrets(tier: Tier): boolean {
  return SECRET_KEYS[tier].length > 0;
}

/** The single human/`configure.sh`-maintained source of truth this tier's secrets file is derived from. */
export const SHARED_ENV_PATH = `${ROOT}/.env`;

/** Where a tier's derived, filtered secrets file lives. Only referenced by `tierEnvFiles` for a tier with a non-empty `SECRET_KEYS` entry. */
export function tierSecretsFile(tier: Tier, layout: EnvLayout = CURRENT_ENV): string {
  return `${layout.root}/${APP_NAME[tier]}.secrets.env`;
}

/**
 * Filters the shared `/srv/wbs/.env` down to only the `KEY=VALUE` lines this
 * tier is allowed to see (`SECRET_KEYS`). Comments and blank lines are
 * dropped; anything that isn't `KEY=...` is ignored rather than carried
 * through blind. Pure and re-run on every `start-green` (see `swap.ts`), so
 * the derived file can never drift from `/srv/wbs/.env` by staying stale —
 * there is no hand-maintained intermediate state to go stale.
 */
export function deriveTierSecrets(tier: Tier, sharedEnvText: string): string {
  const allowed = SECRET_KEYS[tier];
  if (allowed.length === 0) return '';
  const allowedSet = new Set(allowed);
  const kept: string[] = [];
  for (const rawLine of sharedEnvText.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    if (allowedSet.has(line.slice(0, eq))) kept.push(line);
  }
  return kept.length > 0 ? kept.join('\n') + '\n' : '';
}

/**
 * `env_file` paths for a tier's rendered compose service, in the order
 * `docker compose` applies them — LATER files win on a key collision. The
 * tier's own app-config file (`PORT`, `LOG_LEVEL`, ...) goes first and the
 * derived secrets file goes last, deliberately: a same-named key
 * accidentally added to the app-config file must never be able to silently
 * shadow the real secret for just one tier — see
 * `tools/tool-smoke/src/health.ts`'s `checkInternalForward` doc comment for
 * the real, weeks-long incident this ordering guards against. A tier with no
 * `SECRET_KEYS` entry (fe-01) gets no secrets file at all, not an empty one.
 */
export function tierEnvFiles(tier: Tier, layout: EnvLayout = CURRENT_ENV): string[] {
  const files = [`${layout.root}/${APP_NAME[tier]}.env`];
  if (layout.oidcEnvPath !== null && (tier === 'be' || tier === 'gw')) {
    files.push(layout.oidcEnvPath);
  }
  if (SECRET_KEYS[tier].length > 0) files.push(tierSecretsFile(tier, layout));
  return files;
}

/**
 * Strict per-tier allowlist for `/srv/wbs/<app>.env` — the FIRST file
 * `envFilesBlock` lists (see `tierEnvFiles`'s ordering comment), and,
 * unlike the derived secrets file, one this process never writes: an
 * operator or a provisioning script (`tools/tool-bootstrap/src/configure.sh`)
 * authors it directly. Nothing before this stopped a disallowed key —
 * most dangerously `REGISTRY_PASS` — from being added straight to that file,
 * which bypasses `SECRET_KEYS`'s scoping entirely: the whole point of
 * deriving `fe-01`/`gw-01`/`be-01` secrets files from an allowlist is moot if
 * a key can just be handed to a tier through its OTHER env_file instead.
 * Matches each tier's real `apps/<app>/src/config.ts` required keys, minus
 * the ones `SECRET_KEYS` already covers (those belong ONLY in the derived
 * file — see `tierEnvFiles`'s doc comment on why the derived file is listed
 * last, so a same-named key here could never win a collision even before
 * this check existed).
 */
const APP_ENV_ALLOWED_KEYS: Record<Tier, readonly string[]> = {
  // Proof: removing APP_ORIGIN made startGreen admits in swap.test.ts throw
  // outside-tier-allowlist before writing Compose or invoking Docker.
  be: [
    'PORT',
    'LOG_LEVEL',
    'GW_URL',
    'DB_PATH',
    'AUTH_MODE',
    'APP_ORIGIN',
    // Proof: deleting these three entries made the production startGreen test
    // fail before Docker: outside the allowlist were SOLVER_BUDGET_MS,
    // SOLVER_SEARCH_WORKERS, SOLVER_MEMORY_LIMIT_MB; 0 passed, 1 failed.
    'SOLVER_BUDGET_MS',
    'SOLVER_SEARCH_WORKERS',
    'SOLVER_MEMORY_LIMIT_MB',
  ],
  gw: ['PORT', 'LOG_LEVEL', 'BE_URL', 'AUTH_MODE'],
  fe: [],
};

const OIDC_ENV_ALLOWED_KEYS = [
  'AUTH_AUDIENCE',
  'AUTH_CLIENT_ID',
  'AUTH_CLIENT_SECRET',
  'AUTH_ISSUER_DISCOVERY_URL',
  'AUTH_REDIRECT_URI',
] as const;

/** Parses `KEY=VALUE` lines (same shape/skip rules as `deriveTierSecrets`) into just the key names, in file order. */
export function envKeysOf(envText: string): string[] {
  const keys: string[] = [];
  for (const rawLine of envText.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    keys.push(line.slice(0, eq));
  }
  return keys;
}

/**
 * The dev OIDC carrier is operator-authored and is merged after app config for
 * both be and gw. Keep it provider-only: otherwise a stray app key can
 * override tier config and an unrelated secret is widened into both apps.
 */
export function assertOidcEnvAllowed(envText: string): void {
  const allowed = new Set<string>(OIDC_ENV_ALLOWED_KEYS);
  const bad = envKeysOf(envText).filter((key) => !allowed.has(key));
  if (bad.length > 0) {
    throw new Error(
      `OIDC env carries key(s) outside its provider allowlist: ${bad.join(', ')}. ` +
        `Only ${OIDC_ENV_ALLOWED_KEYS.join(', ')} may appear in this file.`,
    );
  }
}

/**
 * Throws — naming every disallowed key found, never a value — if a tier's
 * `/srv/wbs/<app>.env` carries anything outside `APP_ENV_ALLOWED_KEYS`.
 * `swap.ts` calls this as the first action of every `start-green` step, so a
 * bad file fails the swap loudly before anything else happens, rather than
 * quietly riding along into the container via `env_file` merge.
 */
export function assertTierEnvAllowed(tier: Tier, envText: string): void {
  const allowed = new Set(APP_ENV_ALLOWED_KEYS[tier]);
  const bad = envKeysOf(envText).filter((k) => !allowed.has(k));
  if (bad.length > 0) {
    const allowedList = APP_ENV_ALLOWED_KEYS[tier];
    throw new Error(
      `${ROOT}/${APP_NAME[tier]}.env carries key(s) outside tier "${tier}"'s allowlist: ${bad.join(', ')}. ` +
        `Only ${allowedList.length > 0 ? allowedList.join(', ') : '(no keys — fe-01 needs none)'} ` +
        'may appear in this file — secrets belong in /srv/wbs/.env (and its per-tier derived ' +
        'files), never here.',
    );
  }
}

/**
 * Keys each tier's release refuses to boot without, in the tier's own env
 * file. Mirrors the required keys of `apps/wbs/be-01/src/config.ts` and
 * `apps/wbs/gw-01/src/config.ts`. `APP_ORIGIN` is absent because the rendered
 * Compose `environment:` supplies it (`tierComposeContext`); solver and
 * delegation keys are absent because the release defaults or disables them.
 */
const APP_ENV_REQUIRED_KEYS: Record<Tier, readonly string[]> = {
  // Proof: dropping GW_URL here made `refuses a be env file without GW_URL`
  // and `demands only keys the be release refuses to boot without` fail
  // (164 pass, 2 fail, 2026-09-29).
  be: ['PORT', 'LOG_LEVEL', 'GW_URL', 'DB_PATH', 'AUTH_MODE'],
  gw: ['PORT', 'LOG_LEVEL', 'BE_URL', 'AUTH_MODE'],
  fe: [],
};

/** Shared-file secrets each tier needs; gw's `JWT_SIGNING_KEY_PREVIOUS` is optional. */
const SECRET_REQUIRED_KEYS: Record<Tier, readonly string[]> = {
  be: ['INTERNAL_AUTH_SECRET', 'JWT_SIGNING_KEY_CURRENT'],
  gw: ['INTERNAL_AUTH_SECRET', 'JWT_SIGNING_KEY_CURRENT'],
  fe: [],
};

/**
 * Provider keys `AUTH_MODE=oidc` needs in be (`oidcRouteOptionsFromEnv`) and
 * gw (`oidcTokenVerifierFromEnv`); `AUTH_SCOPE` and `AUTH_GROUPS_CLAIM` default.
 */
const OIDC_REQUIRED_KEYS: readonly string[] = [
  'AUTH_ISSUER_DISCOVERY_URL',
  'AUTH_CLIENT_ID',
  'AUTH_CLIENT_SECRET',
  'AUTH_REDIRECT_URI',
  'AUTH_AUDIENCE',
];

/** The operator-authored env text one tier's start-green reads, by source file. */
export interface TierEnvSources {
  readonly appEnvText: string;
  /** The shared `.env`; null only for a tier with no secrets (fe). */
  readonly sharedEnvText: string | null;
  /** The OIDC carrier; null when the layout names none or the tier takes none. */
  readonly oidcEnvText: string | null;
}

/** `KEY=VALUE` lines keyed by name, with `envKeysOf`'s skip rules; a later line wins, as in `env_file`. */
function envValuesOf(envText: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const rawLine of envText.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    values.set(line.slice(0, eq), line.slice(eq + 1));
  }
  return values;
}

const LOG_LEVELS: ReadonlySet<string> = new Set([
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
]);

const atLeast32 = (value: string): string | null =>
  value.length >= 32 ? null : 'must be at least 32 characters';
/**
 * ArkType's `string.integer.parse` refuses leading zeros, so `0100` is not an
 * integer to the loaders even though `Number` reads it as 100.
 */
const INTEGER = /^(?:0|[1-9]\d*)$/;
const positiveInteger = (value: string): string | null =>
  INTEGER.test(value) && Number(value) > 0 ? null : 'must be a positive integer';

/**
 * The value shapes the be-01 and gw-01 loaders enforce, as a reason or null.
 * Written out here rather than imported: the swap bundle runs on the host and
 * a tool may not import an app (`apps/wbs/<app>/src/config.ts` has no library
 * alias). `assertTierEnvComplete against the release configuration` in
 * docker.test.ts holds each rule to the real loaders: a value refused here is
 * refused there, and a set admitted here boots there.
 */
const VALUE_RULES: Readonly<Partial<Record<string, (value: string) => string | null>>> = {
  // Proof: restoring `/^\d+$/` as INTEGER made both release-coherence shape
  // cases (PORT=0100, SOLVER_BUDGET_MS=007) and `refuses a PORT with a
  // leading zero` fail (173 pass, 3 fail, 2026-09-29).
  PORT: (value) => (INTEGER.test(value) ? null : 'must be an integer without leading zeros'),
  LOG_LEVEL: (value) =>
    LOG_LEVELS.has(value) ? null : `must be one of ${[...LOG_LEVELS].join('|')}`,
  INTERNAL_AUTH_SECRET: atLeast32,
  JWT_SIGNING_KEY_CURRENT: atLeast32,
  JWT_SIGNING_KEY_PREVIOUS: atLeast32,
  SOLVER_BUDGET_MS: positiveInteger,
  SOLVER_SEARCH_WORKERS: positiveInteger,
  SOLVER_MEMORY_LIMIT_MB: positiveInteger,
  AUTH_REDIRECT_URI: (value) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return 'must be an absolute URL';
    }
    const ok =
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.username === '' &&
      url.password === '' &&
      url.pathname === '/api/auth/okta/callback' &&
      url.search === '' &&
      url.hash === '';
    return ok ? null : 'must be an HTTP URL ending in /api/auth/okta/callback';
  },
};

/**
 * Why Compose would not hand a value to the container byte for byte, or null.
 * Compose strips surrounding quotes and an unquoted ` #` comment, and neither
 * the swap nor its preflight parses either, so `KEY=""` would look nonempty
 * here and arrive empty. Such values are refused rather than reinterpreted.
 */
function composeRewriteOf(value: string): string | null {
  if (value.startsWith('"') || value.startsWith("'")) {
    return 'is quoted; write it bare, because Compose strips the quotes';
  }
  if (/\s#/.test(value)) return 'contains " #", which Compose strips as a comment';
  return null;
}

/**
 * Throws, naming every missing key and the file that must carry it (never a
 * value), when a tier's env files lack a key its release requires or name an
 * auth mode it cannot boot in. `startGreen` runs this before any phase,
 * Compose or Docker side effect, so an env file written for an older release
 * refuses the swap instead of failing the health gate after migrating.
 *
 * An empty value counts as missing: `defineConfig`, `authModeOf` and
 * `oidcRouteOptionsFromEnv` each reject `KEY=` as they reject an absent key.
 * A present value must also have the shape its loader demands
 * ({@link VALUE_RULES}) and reach the container unchanged by Compose
 * ({@link composeRewriteOf}); each such refusal names key, file and rule.
 * `AUTH_MODE=local` is refused because the be-01 and gw-01 images set
 * `NODE_ENV=production`, no env file may override it (`APP_ENV_ALLOWED_KEYS`),
 * and `authModeOf` refuses local mode in production.
 *
 * @throws When a required key is missing or empty, when the mode is not oidc,
 * or when oidc is named and the layout has no carrier or it was not read.
 */
export function assertTierEnvComplete(
  tier: Tier,
  sources: TierEnvSources,
  layout: EnvLayout = CURRENT_ENV,
): void {
  const appPath = `${layout.root}/${APP_NAME[tier]}.env`;
  const app = envValuesOf(sources.appEnvText);
  const missing: string[] = [];
  const malformed: string[] = [];
  const collectMissing = (keys: readonly string[], text: string, path: string): void => {
    const values = envValuesOf(text);
    for (const key of keys) {
      const value = values.get(key);
      if (value === undefined || value === '') missing.push(`${key} (${path})`);
    }
    for (const [key, value] of values) {
      // An empty optional key still reaches the loader, which refuses it
      // (`JWT_SIGNING_KEY_PREVIOUS=` fails gw's `string>=32`), so only keys
      // without a rule may be empty here.
      // Proof: skipping every empty value again made `refuses an empty
      // optional signing key` and both release-coherence shape cases fail
      // (173 pass, 3 fail, 2026-09-29).
      if (value === '' && VALUE_RULES[key] === undefined) continue;
      // Proof: skipping this line's rules made five cases fail (169 pass,
      // 5 fail, 2026-09-29): the 20-character signing key, the quoted `""`,
      // PORT=32o0, LOG_LEVEL=verbose and both release-coherence shape cases.
      const reason = composeRewriteOf(value) ?? VALUE_RULES[key]?.(value) ?? null;
      if (reason !== null) malformed.push(`${key} (${path}) ${reason}`);
    }
  };
  collectMissing(APP_ENV_REQUIRED_KEYS[tier], sources.appEnvText, appPath);
  if (SECRET_REQUIRED_KEYS[tier].length > 0) {
    if (sources.sharedEnvText === null) {
      throw new Error(`tier "${tier}" needs ${layout.sharedEnvPath}, which was not read`);
    }
    collectMissing(SECRET_REQUIRED_KEYS[tier], sources.sharedEnvText, layout.sharedEnvPath);
  }
  const mode = app.get('AUTH_MODE');
  // Proof: narrowing this to fe made both `refuses AUTH_MODE=local` suites
  // fail on the missing NODE_ENV=production reason (163 pass, 3 fail, 2026-09-29).
  if (mode === 'local') {
    throw new Error(
      `${appPath} sets AUTH_MODE=local, which the ${APP_NAME[tier]} image refuses at startup: ` +
        'the image sets NODE_ENV=production and no env file may override it. Use ' +
        'AUTH_MODE=oidc with the OIDC carrier (docs/runbook-prod-deploy.md#first-product-deploy).',
    );
  }
  if (mode === 'oidc') {
    if (layout.oidcEnvPath === null) {
      throw new Error(
        `${appPath} sets AUTH_MODE=oidc but the ${layout.env} layout names no OIDC carrier, ` +
          `so ${OIDC_REQUIRED_KEYS.join(', ')} cannot reach the container.`,
      );
    }
    if (sources.oidcEnvText === null) {
      throw new Error(`tier "${tier}" needs ${layout.oidcEnvPath}, which was not read`);
    }
    collectMissing(OIDC_REQUIRED_KEYS, sources.oidcEnvText, layout.oidcEnvPath);
  } else if (mode !== undefined && mode !== '') {
    throw new Error(`${appPath} sets AUTH_MODE=${mode}; the release accepts only oidc`);
  }
  if (missing.length > 0 || malformed.length > 0) {
    const parts = [
      missing.length > 0 ? `missing key(s) its release requires: ${missing.join(', ')}` : '',
      malformed.length > 0 ? `malformed value(s): ${malformed.join('; ')}` : '',
    ].filter((part) => part !== '');
    throw new Error(
      `tier "${tier}" has ${parts.join('; and ')}. Fix them before deploying; the release ` +
        'would otherwise fail its health gate after migrating.',
    );
  }
}

function envFilesBlock(tier: Tier, layout: EnvLayout = CURRENT_ENV): string {
  const lines = tierEnvFiles(tier, layout).map((f) => `      - ${f}`);
  return `    env_file:\n${lines.join('\n')}\n`;
}

function volumesBlock(tier: Tier, layout: EnvLayout = CURRENT_ENV): string {
  if (tier !== 'be') return '';
  return (
    `    volumes:\n` +
    `      - ${layout.root}/data:/data\n` +
    // Proof: deleting only this mount made the production startGreen test fail
    // at swap.test.ts:681: expected the directory mount, received undefined;
    // 0 passed, 1 failed.
    `      - ${SOLVER_SUPERVISOR_HOST_DIRECTORY}:${SOLVER_SUPERVISOR_CONTAINER_DIRECTORY}:ro\n`
  );
}

/**
 * The public Caddy address as one browser origin. Bare hosts use Caddy's
 * automatic HTTPS; an explicit HTTP/HTTPS scheme is retained. This is trusted
 * deployment configuration, never an arriving request's Host or Origin.
 * @throws if siteAddress includes credentials, whitespace, a path, query, fragment,
 * or a non-HTTP scheme, since none denotes the one allowed browser origin.
 */
function browserOrigin(siteAddress: string): string {
  // Proof: deleting whitespace refusal let a newline-bearing address render
  // instead of throwing in docker.test.ts (URL would normalize it away).
  if (/\s/.test(siteAddress)) throw new Error('siteAddress must name one HTTP origin');
  let origin: URL;
  try {
    origin = new URL(siteAddress.includes('://') ? siteAddress : `https://${siteAddress}`);
  } catch (cause) {
    throw new Error('siteAddress must name one HTTP origin', { cause });
  }
  // Proof: deleting this origin check rendered a credential-bearing layout
  // instead of throwing in docker.test.ts.
  if (
    (origin.protocol !== 'https:' && origin.protocol !== 'http:') ||
    origin.username !== '' ||
    origin.password !== '' ||
    origin.pathname !== '/' ||
    origin.search !== '' ||
    origin.hash !== '' ||
    origin.hostname.includes('*')
  ) {
    throw new Error('siteAddress must name one HTTP origin');
  }
  return origin.origin;
}

/**
 * Substitution context for `tier.compose.tmpl`. `{{TIER}}` is deliberately
 * the app name (`be-01`), not the short tier code (`be`): that's what makes
 * the rendered service/container name equal `containerName()`, and what
 * makes the rendered `env_file` paths (`/srv/wbs/be-01.env`, ...) line up
 * with the per-app env file naming deploy.sh already uses.
 *
 * `image` is passed straight through from `release.json` rather than
 * assembled here — see `assertDigestPinnedRef`.
 *
 * `ENV_FILES` and `VOLUMES` are whole rendered blocks (own indentation,
 * trailing newline) rather than bare values, the same pattern
 * `lib/site.ts`'s `routeBlock` uses for `site.caddy.tmpl` — that's what lets
 * a tier that needs no `volumes:` key at all (gw-01, fe-01) omit it
 * entirely, rather than the naive string-replace template having to fake
 * one with an empty list.
 */
export function tierComposeContext(
  tier: Tier,
  color: Color,
  image: string,
  layout: EnvLayout = CURRENT_ENV,
): Record<string, string> {
  return {
    // CONTAINER and NETWORK replaced the template's old {{TIER}}-{{COLOR}} and
    // its hardcoded `wbs-net`. Rendered under dev, that pair produced prod's
    // container name on prod's network — the exact collision the
    // per-environment network exists to prevent, written into the compose
    // file itself.
    CONTAINER: containerName(tier, color, layout),
    NETWORK: layout.network,
    IMAGE: assertDigestPinnedRef(image, tier),
    ENV_FILES: envFilesBlock(tier, layout),
    // Proof: omitting the template carrier made the rendered-environment backend
    // startup probe exit1 instead of0 (docker.test.ts).
    ENVIRONMENT:
      tier === 'be'
        ? `    environment:\n      APP_ORIGIN: ${JSON.stringify(browserOrigin(layout.siteAddress))}\n`
        : '',
    VOLUMES: volumesBlock(tier, layout),
  };
}

/**
 * Design decision 10: "SSH, registry, or registry auth unavailable at start —
 * abort before anything starts. Nothing changed."
 *
 * `docker manifest inspect` is the cheapest thing that exercises the whole
 * chain the swap depends on — DNS for the registry host, TLS, the credentials
 * in the host daemon's `~/.docker/config.json`, and the existence of this
 * exact digest — without downloading a single layer. Without it, the first
 * sign of a registry problem is `docker compose up --pull always` failing
 * partway through `start-green`, which is precisely the "surfaces mid-swap"
 * behaviour decision 10 exists to forbid.
 */
export function manifestInspectArgs(image: string): string[] {
  return ['manifest', 'inspect', image];
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
 * removes the CLIENT-FACING half of that risk — the traffic Caddy itself
 * routes by the outgoing colour's own name-alias.
 *
 * It does NOT avoid the window entirely, and an earlier revision of this
 * comment claimed it did. `caddy reload` is graceful for HTTP: a request
 * already in flight when reload runs keeps being served by whatever
 * upstream Caddy had already picked for it, which can still be the outgoing
 * colour for up to however long that one request takes to finish. `be` has
 * no drain step (only `gw` does — see `swap.ts`'s `'drain'` case), so
 * without something between `reload` and `revoke-alias`, the outgoing
 * colour's `network disconnect` can cut a request that reload's own
 * graceful handling was still trying to let finish. `swap.ts` now holds a
 * short bounded settle before `be`'s `revoke-alias` for exactly this reason
 * — see its own comment for the residual window that remains even with the
 * settle (a fixed pause bounds it, it does not close it to zero).
 *
 * Residual property, inherent to Docker's alias model rather than fixable
 * here — and the opposite of what an even earlier revision of this comment
 * used to claim about BE_ALIAS itself (not the settle window above). An earlier
 * revision said BE_ALIAS "briefly resolves to *neither* colour" during the
 * hand-off. That is false. Reproduced on a throwaway user-defined bridge
 * network: Docker's embedded DNS permits two containers to hold the same
 * alias at once and **round-robins between them**. So between
 * `grantAliasCommands(to)` and `revokeAliasCommands(from)` — the whole
 * grant -> render-route -> reload -> (drain) -> revoke window —
 * `be-01.internal` resolves to BOTH colours, both of them running, and gw's
 * forwards are split across two releases at roughly 50/50.
 *
 * There is no blackout, so nothing here needs retry logic (and
 * apps/wbs/gw-01/src/service/forward-client.ts has none). What there IS, and what
 * the old comment hid by describing a failure mode that does not exist, is a
 * window where two be-01 releases serve gw concurrently against one shared,
 * already-migrated SQLite database, with no version negotiation between them.
 * Decision 8's "migrations must be backward-compatible with the previous
 * release" is what makes that safe; it is not incidental. See decision 7 of
 * docs/superpowers/specs/2026-08-02-compose-blue-green-deploy-design.md, which
 * records this as a property of every `be` deploy.
 *
 * Either way this touches only gw's internal be-01.internal forward path,
 * never the client-facing Caddy routes: site.caddy addresses be-01 by its own
 * colour-specific name-alias, moved separately via render-route/reload, never
 * by BE_ALIAS.
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

/**
 * Where the `backup-db` step writes its snapshot, as the incoming container
 * sees the data volume (`volumesBlock` mounts `<root>/data` at `/data`). The
 * stamp keeps a rerun of the same release from colliding with an earlier
 * backup, which `snapshotDatabase` would refuse to overwrite.
 */
export function backupSnapshotPath(sha: string, now: Date): string {
  const stamp = now.toISOString().replaceAll(/[-:.]/g, '');
  return `/data/backups/wbs-pre-${sha}-${stamp}.db`;
}

/** Takes the pre-migration backup from inside the incoming container. */
export function backupDbCommand(container: string, snapshotPath: string): string[] {
  return ['exec', container, 'bun', 'run', 'src/backup-db-cli.ts', snapshotPath];
}

/**
 * Reads which migrations are already applied, from inside the container that
 * is about to apply more. Run immediately before the migrate step: its output
 * is the only thing that tells an abort how far back to unwind.
 */
export function migrateStatusCommand(container: string): string[] {
  return ['exec', container, 'bun', 'run', 'src/migrate-status-cli.ts'];
}

/**
 * Reads incoming types. Only an absent CLI under a readable source directory means FS-only.
 * Proof: replacing the directory check with an unconditional FS fallback made
 * `does not treat a missing source directory as an older release` fail on
 * `Expected: 74, Received: 0`.
 */
export function relationshipTypesCommand(container: string): string[] {
  return [
    'exec',
    container,
    'sh',
    '-c',
    'if test -f src/relationship-types-cli.ts; then bun run src/relationship-types-cli.ts; elif test -e src/relationship-types-cli.ts; then exit 73; elif test -d src && test -r src && test -x src; then printf \'["FS"]\\n\'; else exit 74; fi',
  ];
}

/** Reads distinct stored types through the shared DB_PATH without importing release code. */
export function storedRelationshipTypesCommand(container: string): string[] {
  return [
    'exec',
    container,
    'bun',
    '-e',
    `import { Database } from 'bun:sqlite';
const path = process.env.DB_PATH;
if (!path) throw new Error('DB_PATH must be set');
const db = new Database(path, { readonly: true });
try {
  const exists = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='typed_dependency'").get();
  const rows = exists === null ? [] : db.query('SELECT type, count(*) AS count FROM typed_dependency GROUP BY type').all();
  console.log(JSON.stringify(rows));
} finally { db.close(); }`,
  ];
}

/** The two work item statement columns, each with the CLI that names its vocabulary. */
type StatementColumn = 'hold' | 'readiness';

const KINDS_CLI: Readonly<Record<StatementColumn, string>> = {
  hold: 'src/hold-kinds-cli.ts',
  readiness: 'src/readiness-kinds-cli.ts',
};

/**
 * Reads the values of one statement column the incoming release can read. A
 * release older than the column ships no CLI for it, and only that absence
 * under a readable source directory reads as `[]`: nothing understood, so any
 * stored value refuses the swap. A missing or unreadable `src` exits 74 and a
 * nonregular CLI path 73, exactly as {@link relationshipTypesCommand} does.
 *
 * Proof: the directory check replaced by an unconditional `[]` made `does not
 * treat a missing source directory as an older release` (hold kind commands)
 * fail on `Expected: 74, Received: 0`; watched 2026-09-28.
 */
function statementKindsCommand(container: string, column: StatementColumn): string[] {
  const cli = KINDS_CLI[column];
  return [
    'exec',
    container,
    'sh',
    '-c',
    `if test -f ${cli}; then bun run ${cli}; elif test -e ${cli}; then exit 73; elif test -d src && test -r src && test -x src; then printf '[]\\n'; else exit 74; fi`,
  ];
}

/**
 * Reads each stored value of one statement column and its count through the
 * shared DB_PATH without importing release code. Empty before `work_item` or
 * the column exists, which is every database the status facts migration has
 * not reached.
 */
function storedStatementsCommand(container: string, column: StatementColumn): string[] {
  return [
    'exec',
    container,
    'bun',
    '-e',
    `import { Database } from 'bun:sqlite';
const path = process.env.DB_PATH;
if (!path) throw new Error('DB_PATH must be set');
const db = new Database(path, { readonly: true });
try {
  const column = db.query("SELECT name FROM pragma_table_info('work_item') WHERE name = '${column}'").get();
  const rows = column === null ? [] : db.query('SELECT ${column} AS kind, count(*) AS count FROM work_item WHERE ${column} IS NOT NULL GROUP BY ${column} ORDER BY ${column}').all();
  console.log(JSON.stringify(rows));
} finally { db.close(); }`,
  ];
}

/** The hold kinds the incoming release reads; see {@link statementKindsCommand}. */
export function holdKindsCommand(container: string): string[] {
  return statementKindsCommand(container, 'hold');
}

/** Every stored hold kind and its count; see {@link storedStatementsCommand}. */
export function storedHoldsCommand(container: string): string[] {
  return storedStatementsCommand(container, 'hold');
}

/** The readinesses the incoming release reads; see {@link statementKindsCommand}. */
export function readinessKindsCommand(container: string): string[] {
  return statementKindsCommand(container, 'readiness');
}

/** Every stored readiness and its count; see {@link storedStatementsCommand}. */
export function storedReadinessesCommand(container: string): string[] {
  return storedStatementsCommand(container, 'readiness');
}

/** Applies pending migrations through the path shipped in the backend image. */
export function migrateCommand(container: string): string[] {
  return ['exec', container, 'bun', 'run', 'src/migrate-cli.ts'];
}

/**
 * Reverses every migration applied after `baseline`, using the down script
 * shipped alongside each one.
 *
 * `baseline` is passed as `--to=` rather than a count: a count means "undo two
 * migrations" and is right only if the caller and the database agree on what
 * was applied, while a name means "get back to this state" and refuses when
 * they do not. The CLI rejects an empty value for the same reason.
 */
export function migrateDownCommand(container: string, baseline: string): string[] {
  if (baseline === '') {
    throw new Error('migrateDownCommand needs a baseline migration name, or "none"');
  }
  return ['exec', container, 'bun', 'run', 'src/migrate-down-cli.ts', `--to=${baseline}`];
}
