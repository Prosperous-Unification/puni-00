#!/usr/bin/env bun
/**
 * The dev deploy. Runs on h2puni, not on the machine that triggers it.
 *
 * Dev serves from a bind-mounted checkout whose tiers already watch their own
 * source -- be-01 and gw-01 under `bun --watch`, fe-01 under Vite HMR. So for
 * ordinary code the deploy is a write into that checkout: fetch, reset, done.
 * Nothing is built and nothing restarts.
 *
 * Some changes cannot reach a running process that way, and those are the
 * whole reason this file exists rather than being one `git reset` in a shell
 * script. See RESTART_PATHS.
 *
 * Run via: `bun tools/tool-devsync/src/sync.ts <sha>`.
 *
 * THIS FILE'S IMPORT GRAPH MAY NOT REACH A THIRD-PARTY PACKAGE (TASK-376).
 * Relative imports, `@wbs/*` aliases and Bun/Node builtins only. The poller
 * extracts this file from the target commit and runs it BEFORE anything has
 * installed that commit's dependencies -- an install can only arrive through a
 * deploy, and the deploy is this file. `bin/dev-poll-sync.sh` enforces the rule
 * by bundling the extracted candidate with no `node_modules` in scope, so
 * adding a dependency here does not fail mysteriously in production: the tick
 * refuses, by name, before it deploys anything.
 *
 * If a dependency here ever becomes genuinely necessary, the shape that works
 * is to vendor it into the archived tree (`tools/`, `libs/`) so the extraction
 * carries it -- not to reintroduce a borrowed install from the pinned checkout.
 */
import { realpathSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  SOLVER_SUPERVISOR_BUN,
  SOLVER_SUPERVISOR_BUNDLE,
  SOLVER_SUPERVISOR_CONFIG,
  SOLVER_SUPERVISOR_SERVICE,
  SOLVER_SUPERVISOR_SOCKET,
} from '@tools/deploy-contract';
import { $ } from 'bun';

import { prepareTargetSolverBinding } from './solver-binding-host';
import { createTargetSolverBindingRuntime } from './solver-binding-runtime';
import {
  SOLVER_COMPATIBILITY_PATHS,
  type SolverBindingTarget,
  solverCompatibilityIdentityAt,
} from './solver-preparation';

export { SOLVER_COMPATIBILITY_PATHS };

export const LIVE_DEV_SOURCE = '/home/puni1/wbs-dev/src';
export const LIVE_DEV_CONTAINER = 'wbs-dev-src';
export const LIVE_DEV_STATE = '/home/puni1/wbs-dev/state';
const SRC = LIVE_DEV_SOURCE;
const CONFIG_MAX_BYTES = 256 * 1024;
const PREPARATION_STATE_MAX_BYTES = 64 * 1024;
const DIGEST_PINNED_IMAGE = /^[^\s@]+@sha256:[0-9a-f]{64}$/;
const TARGET_ROOT = resolve(import.meta.dir, '../../..');
export const LOCK_BUSY_EXIT_CODE = 75;

export interface DevSyncPaths {
  sourcePath: string;
  containerName: string;
  statePath: string;
  rehearsal: boolean;
}

function canonicalPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/** Resolves deploy inputs and fences every rehearsal away from live dev. */
export function devSyncPathsOf(options: Partial<DevSyncPaths> = {}): DevSyncPaths {
  const rehearsal = options.rehearsal ?? false;
  const supplied = [options.sourcePath, options.containerName, options.statePath].filter(
    (value) => value !== undefined,
  ).length;
  if (supplied !== 0 && supplied !== 3) {
    throw new Error('custom dev sync inputs require source, container and state together');
  }
  const sourcePath = canonicalPath(options.sourcePath ?? LIVE_DEV_SOURCE);
  const statePath = canonicalPath(options.statePath ?? LIVE_DEV_STATE);
  const containerName = options.containerName ?? LIVE_DEV_CONTAINER;
  const suppliedLiveTuple =
    supplied === 3 &&
    sourcePath === canonicalPath(LIVE_DEV_SOURCE) &&
    containerName === LIVE_DEV_CONTAINER &&
    statePath === canonicalPath(LIVE_DEV_STATE);
  if (supplied === 3 && !rehearsal && !suppliedLiveTuple) {
    throw new Error('custom dev sync inputs require rehearsal mode');
  }
  if (!sourcePath.startsWith('/') || !statePath.startsWith('/') || containerName === '') {
    throw new Error(
      'dev sync source, container and state inputs must be non-empty absolute values',
    );
  }
  if (
    rehearsal &&
    (sourcePath === canonicalPath(LIVE_DEV_SOURCE) ||
      statePath === canonicalPath(LIVE_DEV_STATE) ||
      containerName === LIVE_DEV_CONTAINER)
  ) {
    throw new Error('rehearsal inputs must not resolve to live dev source, container or state');
  }
  return { sourcePath, containerName, statePath, rehearsal };
}

export interface DevSolverMapping {
  sourceSha: string;
  image: string;
}

/** Reads only the independent compatibility identity; the supervisor decodes the whole file. */
export function devSolverMappingOf(text: string): DevSolverMapping {
  const value = JSON.parse(text) as unknown;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('solver supervisor config root is not an object');
  }
  const config = value as Record<string, unknown>;
  const sourceSha = config['devSourceSha'];
  if (typeof sourceSha !== 'string' || !/^[0-9a-f]{40}$/.test(sourceSha)) {
    throw new Error('solver supervisor config has no valid devSourceSha');
  }
  const images = config['images'];
  if (!Array.isArray(images)) throw new Error('solver supervisor config images is not an array');
  const devRules = images.filter(
    (rule) =>
      typeof rule === 'object' &&
      rule !== null &&
      !Array.isArray(rule) &&
      (rule as Record<string, unknown>)['callerName'] === 'wbs-dev-src',
  );
  if (devRules.length !== 1) throw new Error('solver supervisor config needs one dev image rule');
  const image = (devRules[0] as Record<string, unknown>)['solverImage'];
  if (typeof image !== 'string' || !DIGEST_PINNED_IMAGE.test(image)) {
    throw new Error('solver supervisor config dev image is not digest-pinned');
  }
  return { sourceSha, image };
}

export function assertDevSolverSourceCompatible(changedPaths: readonly string[]): void {
  if (changedPaths.length === 0) return;
  throw new Error(
    `dev solver mapping is stale for ${changedPaths.join(', ')}; publish the backend image and materialize a new supervisor config before deploying`,
  );
}

export interface SolverPreflightDependencies {
  currentSha(): Promise<string>;
  changedPaths(from: string, to: string): Promise<readonly string[]>;
  readConfig(): Promise<Uint8Array | undefined>;
  requireHost(image: string): Promise<void>;
}

export interface SolverImageHostDependencies {
  inspect(image: string): Promise<boolean>;
  pull(image: string): Promise<void>;
}

export interface SolverHostPreflightDependencies {
  requireImage(image: string): Promise<void>;
  requireService(): Promise<void>;
  requireSocket(): Promise<void>;
  requireMapping(image: string, configPath: string): Promise<void>;
}

const SOLVER_IMAGE_HOST_DEPENDENCIES: SolverImageHostDependencies = {
  inspect: async (image) => {
    const inspection = await $`docker image inspect --format={{.Id}} ${image}`.quiet().nothrow();
    return inspection.exitCode === 0;
  },
  pull: async (image) => {
    await $`docker pull ${image}`;
  },
};

/** Repairs one absent digest, then proves the supervisor's Docker daemon can resolve it. */
export async function requireSolverImageInHost(
  image: string,
  dependencies: SolverImageHostDependencies = SOLVER_IMAGE_HOST_DEPENDENCIES,
): Promise<void> {
  // Proof: sync.test.ts injects a mutable tag and observes refusal before
  // either Docker inspection or pull can begin.
  if (!DIGEST_PINNED_IMAGE.test(image)) {
    throw new Error('solver host image must be digest-pinned');
  }
  if (await dependencies.inspect(image)) return;
  await dependencies.pull(image);
  // Proof: sync.test.ts makes a pull return without installing the digest and
  // observes refusal before the injected host preflight can continue.
  if (!(await dependencies.inspect(image))) {
    throw new Error(`solver host image is unavailable after pull: ${image}`);
  }
}

const SOLVER_HOST_PREFLIGHT_DEPENDENCIES: SolverHostPreflightDependencies = {
  requireImage: (image) => requireSolverImageInHost(image),
  requireService: async () => {
    await $`systemctl --user is-active --quiet ${SOLVER_SUPERVISOR_SERVICE}`;
  },
  requireSocket: async () => {
    await $`test -S ${SOLVER_SUPERVISOR_SOCKET}`;
  },
  requireMapping: async (image, configPath) => {
    await $`${SOLVER_SUPERVISOR_BUN} ${SOLVER_SUPERVISOR_BUNDLE.remote} --preflight=dev --config=${configPath} --solver-image=${image}`;
  },
};

/** Lists compatibility inputs changed between two revisions in their owning repository. */
async function changedSolverPathsIn(
  repository: string,
  from: string,
  to: string,
): Promise<readonly string[]> {
  return (
    await $`git -C ${repository} diff --name-only ${from} ${to} -- ${SOLVER_COMPATIBILITY_PATHS}`.text()
  )
    .split('\n')
    .filter((path) => path !== '');
}

export function solverPreflightDependencies(
  repository: string,
  configPath: string,
  host: SolverHostPreflightDependencies = SOLVER_HOST_PREFLIGHT_DEPENDENCIES,
): SolverPreflightDependencies {
  return {
    currentSha: async () => (await $`git -C ${repository} rev-parse HEAD`.text()).trim(),
    changedPaths: (from, to) => changedSolverPathsIn(repository, from, to),
    readConfig: async () => {
      const file = Bun.file(configPath);
      if (!(await file.exists())) return undefined;
      return new Uint8Array(await file.slice(0, CONFIG_MAX_BYTES + 1).arrayBuffer());
    },
    requireHost: async (image) => {
      // A registry publish does not load the host daemon. Repairing the exact
      // digest makes an absent image self-healing; a pull or final inspection
      // refusal is emitted by the poller instead of remaining in the user
      // service journal until the next optimization request.
      await host.requireImage(image);
      await host.requireService();
      await host.requireSocket();
      await host.requireMapping(image, configPath);
    },
  };
}

const SOLVER_PREFLIGHT_DEPENDENCIES = solverPreflightDependencies(SRC, SOLVER_SUPERVISOR_CONFIG);

/** Skips an unconfigured steady-state host; once configured, verifies host state on every deploy. */
export async function preflightSolver(
  sha: string,
  dependencies: SolverPreflightDependencies = SOLVER_PREFLIGHT_DEPENDENCIES,
  configPath = SOLVER_SUPERVISOR_CONFIG,
): Promise<void> {
  const deployedSha = await dependencies.currentSha();
  const targetChanges = await dependencies.changedPaths(deployedSha, sha);
  const bytes = await dependencies.readConfig();
  if (bytes === undefined) {
    if (targetChanges.length === 0) return;
    throw new Error(
      `solver compatibility inputs changed (${targetChanges.join(', ')}), but ${configPath} is missing; run materialize-solver-supervisor-config and install-solver-supervisor before deploying`,
    );
  }
  if (bytes.byteLength === 0 || bytes.byteLength > CONFIG_MAX_BYTES) {
    throw new Error(
      `solver supervisor config must contain 1 through ${String(CONFIG_MAX_BYTES)} bytes`,
    );
  }
  const mapping = devSolverMappingOf(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const changed = await dependencies.changedPaths(mapping.sourceSha, sha);
  assertDevSolverSourceCompatible(changed);
  // Proof: sync.test.ts stages a future mapping before an unrelated target and
  // observes refusal before its injected host preflight can run. A compatible
  // mapping is checked even for an unrelated target so the next deploy
  // repairs or reports an image pruned after preparation.
  await dependencies.requireHost(mapping.image);
}

/** Reads one compatibility object id and names its repository on lookup failure. */
async function solverCompatibilityObjectIdAt(
  repository: string,
  sourceSha: string,
  path: string,
): Promise<string> {
  try {
    return (await $`git -C ${repository} rev-parse ${`${sourceSha}:${path}`}`.text()).trim();
  } catch (error) {
    // Proof: sync.test.ts points this production wiring at a missing repository
    // and observes both the repository and compatibility object in the rejection.
    throw new Error(
      `cannot read solver compatibility object ${sourceSha}:${path} from git repository ${repository}: ${String(error)}`,
      { cause: error },
    );
  }
}

export interface RehearsalTargetDependencies {
  currentSha(): Promise<string>;
  changedPaths(from: string, to: string): Promise<readonly string[]>;
  reset(sourceSha: string): Promise<void>;
}

/** Keeps rehearsals off every live solver host/state seam. */
export async function deployRehearsalTarget(
  sourceSha: string,
  dependencies: RehearsalTargetDependencies,
): Promise<void> {
  const deployedSha = await dependencies.currentSha();
  const changed = await dependencies.changedPaths(deployedSha, sourceSha);
  if (changed.length > 0) {
    throw new Error(
      `rehearsal refuses solver compatibility changes (${changed.join(', ')}); use the live attended deploy path`,
    );
  }
  await dependencies.reset(sourceSha);
}

export interface SolverTargetDependencies {
  currentSha(): Promise<string>;
  changedPaths(from: string, to: string): Promise<readonly string[]>;
  compatibilityIdentity(sourceSha: string): Promise<string>;
  readState(target: SolverBindingTarget): Promise<Uint8Array | undefined>;
  prepare(target: SolverBindingTarget, stateBytes: Uint8Array | undefined): Promise<void>;
  preflight(sourceSha: string): Promise<void>;
  reset(sourceSha: string): Promise<void>;
}

/** Chooses automatic preparation only for a changed solver compatibility tree. */
export async function deploySolverTarget(
  sourceSha: string,
  dependencies: SolverTargetDependencies,
): Promise<void> {
  const deployedSha = await dependencies.currentSha();
  const changed = await dependencies.changedPaths(deployedSha, sourceSha);
  if (changed.length === 0) {
    await dependencies.preflight(sourceSha);
    await dependencies.reset(sourceSha);
    return;
  }
  const target = {
    sourceSha,
    compatibilityIdentity: await dependencies.compatibilityIdentity(sourceSha),
  };
  await dependencies.prepare(target, await dependencies.readState(target));
}

export interface SolverTargetDependencyOptions {
  /** The git repository containing the target source SHA and compatibility paths. */
  sourceRepository?: string;
  /** The exported deployer tree used only to resolve preparation runtime files. */
  runtimeRoot?: string;
  /** Solver mapping path; injectable so repository wiring can be tested without host state. */
  solverConfigPath?: string;
}

/** Wires deploy decisions to the repository that owns every target revision. */
export function solverTargetDependencies(
  options: SolverTargetDependencyOptions = {},
): SolverTargetDependencies {
  const sourceRepository = options.sourceRepository ?? SRC;
  const runtimeRoot = options.runtimeRoot ?? TARGET_ROOT;
  const solverConfigPath = options.solverConfigPath ?? SOLVER_SUPERVISOR_CONFIG;
  for (const [label, path] of [
    ['source repository', sourceRepository],
    ['runtime root', runtimeRoot],
    ['solver config', solverConfigPath],
  ] as const) {
    if (!path.startsWith('/') || resolve(path) !== path) {
      throw new Error(`solver ${label} path must be absolute and normalized: ${path}`);
    }
  }
  const runtimeFor = (target: SolverBindingTarget) =>
    createTargetSolverBindingRuntime({
      root: runtimeRoot,
      bunPath: process.execPath,
      sourceRepository,
      ...target,
    });
  return {
    currentSha: async () => (await $`git -C ${sourceRepository} rev-parse HEAD`.text()).trim(),
    changedPaths: (from, to) => changedSolverPathsIn(sourceRepository, from, to),
    compatibilityIdentity: (sourceSha) =>
      solverCompatibilityIdentityAt(sourceSha, {
        repository: sourceRepository,
        objectIdAt: (sha, path) => solverCompatibilityObjectIdAt(sourceRepository, sha, path),
      }),
    readState: async (target) => {
      const file = Bun.file(runtimeFor(target).statePath);
      if (!(await file.exists())) return undefined;
      return new Uint8Array(await file.slice(0, PREPARATION_STATE_MAX_BYTES + 1).arrayBuffer());
    },
    prepare: (target, stateBytes) => {
      const runtime = runtimeFor(target);
      return prepareTargetSolverBinding(target, stateBytes, runtime.dependencies);
    },
    preflight: (sha) =>
      preflightSolver(
        sha,
        solverPreflightDependencies(sourceRepository, solverConfigPath),
        solverConfigPath,
      ),
    reset: async (sha) => {
      await $`git -C ${sourceRepository} reset --hard --quiet ${sha}`;
    },
  };
}

export function devSyncFailureMessage(exitCode: number): string {
  return exitCode === LOCK_BUSY_EXIT_CODE
    ? '[dev-sync] skipped: another deploy holds the lock'
    : `[dev-sync] failed (exit ${String(exitCode)}); see the error above`;
}

export interface DevSyncLockOptions {
  bunPath?: string;
  flockPath?: string;
  lockPath?: string;
  scriptPath?: string;
  paths?: DevSyncPaths;
}

/** Runs the production child invocation under the deploy lock. */
export async function runDevSyncLock(
  sha: string,
  options: DevSyncLockOptions = {},
): Promise<number> {
  // `process.execPath`, never a bare `bun`. The child is the process that
  // resets, installs, restarts and runs the solver preflight -- the parent
  // only waits on it -- so the child is the run whose interpreter matters.
  // `bin/dev-poll-sync.sh` refuses to start this tool unless the managed
  // interpreter matches `.bun-version`, and a default of `'bun'` handed that
  // decision back to PATH one process later. Measured on h2puni 2026-09-07:
  // the poller's own binary was 1.4.2, `.bun-version` and CI pin 1.3.14, and
  // every logged deploy footer said `Bun v1.2.20` -- the root-owned
  // /usr/local/bin/bun the child resolved to.
  const bunPath = options.bunPath ?? process.execPath;
  const flockPath = options.flockPath ?? 'flock';
  const paths = options.paths ?? devSyncPathsOf();
  const lockPath = options.lockPath ?? join(paths.statePath, 'devsync.lock');
  const scriptPath = options.scriptPath ?? import.meta.path;
  const pathArgs = paths.rehearsal
    ? [
        '--source',
        paths.sourcePath,
        '--container',
        paths.containerName,
        '--state',
        paths.statePath,
        '--rehearsal',
      ]
    : [];
  // Proof: removing `-E 75` failed the production-invocation test's exact argv
  // assertion: Expected began "-E", "75"; Received began "-n", devsync.lock.
  const run =
    await $`${flockPath} -E ${LOCK_BUSY_EXIT_CODE} -n ${lockPath} ${bunPath} ${scriptPath} --locked ${sha} ${pathArgs}`.nothrow();
  return run.exitCode;
}

/**
 * Paths whose change a running dev environment cannot pick up by itself.
 *
 * - `bun.lock` -- `bun install` cannot run inside a live watcher.
 * - `apps/wbs/be-01/drizzle` -- migrations are not imported by any watched module,
 *   so `bun --watch` never sees them. be-01 migrates at boot in dev
 *   (MIGRATE_ON_STARTUP=true) and reports migrationsApplied=true either way,
 *   so a missed restart means new code on an old schema, reported healthy.
 * - `package.json`, `nx.json`, `apps/wbs/<tier>/project.json` -- the Nx supervisor
 *   reads the serve targets once, at startup. A changed port, command or
 *   project list leaves the old topology running while HEAD moves on.
 * - `apps/wbs/fe-01/vite.config.ts` -- Vite reloads app code, not its own config.
 *
 * Not covered, deliberately, because they need more than a restart: the
 * Dockerfile and compose.yml (rebuild/recreate), and the gitignored per-tier
 * .env files (not in git at all). Both are called out in LLM_README.md.
 */
export const RESTART_PATHS: readonly string[] = [
  'bun.lock',
  'package.json',
  'nx.json',
  'apps/wbs/be-01/drizzle',
  'apps/wbs/be-01/project.json',
  'apps/wbs/gw-01/project.json',
  'apps/wbs/fe-01/project.json',
  'apps/wbs/mcp-01/project.json',
  // The wiki CLI has no serve target, but it is an app on disk and `sync.test.ts`
  // walks apps rather than trusting this list; a manifest the supervisor's project
  // graph reads at startup belongs here either way.
  // Proof: omitting it failed `names every app project.json, which the supervisor
  // reads once at startup` on `Expected to contain: "apps/wiki/cli/project.json"`
  // (2026-09-16).
  'apps/wiki/cli/project.json',
  'apps/wbs/fe-01/vite.config.ts',
  // TypeScript config is read once, at process start. A moved path alias
  // resolves against the old mapping in three already-running processes while
  // HEAD says otherwise, which presents as an import that exists in the editor
  // and not at runtime.
  'tsconfig.base.json',
  'apps/wbs/be-01/tsconfig.json',
  'apps/wbs/gw-01/tsconfig.json',
  'apps/wbs/fe-01/tsconfig.json',
  'apps/wbs/mcp-01/tsconfig.json',
  // Proof: omitting this entry failed `names every app tsconfig, which is read once at
  // process start` on `Expected to contain: "apps/wiki/cli/tsconfig.json"` (2026-09-16).
  'apps/wiki/cli/tsconfig.json',
  // A library's project.json can change what its serve-time build resolves to,
  // and the Nx supervisor read the project graph at startup like the rest.
  // Listed per library rather than as `libs`, which would restart on every
  // source edit and defeat the watchers. `sync.test.ts` fails if a library on
  // disk is missing from this list, so adding one cannot silently skip it.
  'libs/wbs/adapters/auth/project.json',
  'libs/wbs/adapters/config/project.json',
  'libs/wbs/application/conformance/project.json',
  'libs/wbs/domain/contracts/project.json',
  // Proof: restoring the pre-move nested path failed `names every library project.json`
  // on the namespaced solver-supervisor-protocol manifest.
  'libs/wbs/adapters/solver-supervisor-protocol/project.json',
  'libs/wbs/application/core/project.json',
  'libs/wbs/domain/domain/project.json',
  'libs/wbs/adapters/observability/project.json',
  'libs/wbs/adapters/realtime/project.json',
  // Proof: restoring the pre-move entry failed `names every library project.json that exists on disk`
  // on the namespaced runtime-portable manifest.
  'libs/wbs/adapters/runtime-portable/project.json',
  'libs/wbs/adapters/store-memory/project.json',
  // Proof: recursive project discovery first failed the restart coverage test
  // on conformance, then store-memory, then store-sqlite as each preceding
  // omission was restored. Watched 2026-09-10.
  'libs/wbs/adapters/store-sqlite/project.json',
  'libs/wbs/domain/validation/project.json',
  'libs/wbs/adapters/solver-py/project.json',
  // Proof: omitting this entry after creating the project failed `names every
  // library project.json that exists on disk` with `Expected to contain:
  // "libs/shared/domain/validation/project.json"` (2026-09-15).
  // Proof: omitting the failures manifest failed `names every library project.json that exists
  // on disk` with `Expected to contain: "libs/shared/domain/failures/project.json"` (2026-09-20).
  'libs/shared/domain/failures/project.json',
  'libs/shared/domain/validation/project.json',
];

/**
 * Paths a restart cannot apply: they define the container itself. The running
 * container was created from the old file, so `docker restart` reuses the old
 * mounts, user, limits and image — the deploy would report success for a
 * change that is not in effect anywhere.
 *
 * These fail the deploy instead of being silently ignored. The checkout has
 * already moved by then, which is correct: dev is running the new source, and
 * the operator is told the one thing still outstanding.
 */
export const RECREATE_PATHS: readonly string[] = [
  'deploy/dev-src/compose.yml',
  'deploy/dev-src/Dockerfile',
];

export type Fingerprint = Record<string, string>;

/**
 * Whether the container must be restarted after a pull.
 *
 * Any difference across the manifest counts, including a path that appeared,
 * disappeared, or could not be hashed. Inferring "nothing to do" from missing
 * evidence is how dev ends up serving against a stale schema with no symptom
 * other than behaviour that does not match the code.
 */
export function needsRestart(before: Fingerprint, after: Fingerprint): boolean {
  const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const p of paths) {
    const b = before[p];
    const a = after[p];
    if (!b || !a) return true;
    if (b !== a) return true;
  }
  return false;
}

// Proof: restoring the pre-move default made sync.test.ts resolve MCP_ENV to
// the removed app root while the real deploy preflight remained namespaced.
export const MCP_ENV = `${SRC}/apps/wbs/mcp-01/.env`;
const MCP_REQUIRED_ENV = [
  'PORT',
  'MCP_AUTH_MODE',
  'WBS_API_URL',
  'MCP_PUBLIC_URL',
  'MCP_SIGNING_KEY_CURRENT',
  'MCP_STORE_KEY_CURRENT',
  'MCP_STORE_PATH',
  'MCP_ACCESS_TOKEN_TTL',
] as const;

/** Enforces the same private, complete MCP deployment environment as the manual preflight. */
export async function assertMcpEnv(path = MCP_ENV): Promise<void> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`missing ${path}; seed the gitignored mcp-01 environment before deploying`);
  }
  if ((statSync(path).mode & 0o777) !== 0o600) {
    throw new Error(`MCP environment must have mode 600: ${path}`);
  }
  const lines = (await file.text()).split(/\r?\n/);
  for (const key of MCP_REQUIRED_ENV) {
    const assignments = lines.filter((line) =>
      new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`).test(line),
    );
    if (assignments.length !== 1 || !new RegExp(`^${key}=.+$`).test(assignments[0] ?? '')) {
      throw new Error(`${path} must contain exactly one non-empty ${key}=... assignment`);
    }
  }
  if (!lines.includes('MCP_STORE_PATH=/data/mcp-session.sqlite')) {
    throw new Error(`${path} must contain MCP_STORE_PATH=/data/mcp-session.sqlite before deploying`);
  }
}

export async function mcpExposureExpected(statePath: string): Promise<'0' | '1'> {
  const path = join(statePath, 'mcp-exposure');
  let state: ReturnType<typeof statSync>;
  try {
    state = statSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '0';
    throw new Error(`unreadable MCP exposure state: ${path}`, { cause: error });
  }
  if (!state.isFile()) throw new Error(`unreadable MCP exposure state: ${path}`);
  try {
    if ((await Bun.file(path).text()) !== 'enabled\n') {
      throw new Error(`malformed MCP exposure state: ${path}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('malformed MCP exposure state:')) {
      throw error;
    }
    throw new Error(`unreadable MCP exposure state: ${path}`, { cause: error });
  }
  return '1';
}

/** sha256 of a file, or of a directory's recursive listing plus contents. */
async function hashPath(sourcePath: string, path: string): Promise<string> {
  try {
    const out =
      await $`sh -c ${`cd ${sourcePath} && find ${path} -type f -print0 2>/dev/null | sort -z | xargs -0 sha256sum 2>/dev/null | sha256sum`}`.text();
    return out.split(' ')[0] ?? '';
  } catch {
    return '';
  }
}

async function fingerprint(
  sourcePath: string,
  paths: readonly string[] = RESTART_PATHS,
): Promise<Fingerprint> {
  const entries = await Promise.all(
    paths.map(async (path) => [path, await hashPath(sourcePath, path)] as const),
  );
  return Object.fromEntries(entries);
}

export interface DevSyncOptions extends Partial<DevSyncPaths> {
  mcpEnvPath?: string;
}

export async function sync(sha: string, options: DevSyncOptions = {}): Promise<void> {
  const paths = devSyncPathsOf(options);
  await assertMcpEnv(options.mcpEnvPath ?? `${paths.sourcePath}/apps/wbs/mcp-01/.env`);
  const before = await fingerprint(paths.sourcePath);
  const containerBefore = await fingerprint(paths.sourcePath, RECREATE_PATHS);

  await $`git -C ${paths.sourcePath} fetch --quiet origin`;
  const targetDependencies = solverTargetDependencies({ sourceRepository: paths.sourcePath });
  if (paths.rehearsal) {
    await deployRehearsalTarget(sha, targetDependencies);
  } else {
    await deploySolverTarget(sha, targetDependencies);
  }

  // The reset is only believed once HEAD says so. `git reset` on a SHA the
  // fetch did not deliver fails, but a partially applied reset would otherwise
  // be reported as the requested deploy.
  const head = (await $`git -C ${paths.sourcePath} rev-parse HEAD`.text()).trim();
  if (!head.startsWith(sha) && !sha.startsWith(head)) {
    throw new Error(`reset did not land: asked for ${sha}, HEAD is ${head}`);
  }

  const after = await fingerprint(paths.sourcePath);

  if (needsRestart(before, after)) {
    const moved = RESTART_PATHS.filter((p) => before[p] !== after[p]);
    console.log(`[dev-sync] restart required, changed: ${moved.join(', ') || 'unknown'}`);
    await $`docker exec ${paths.containerName} bun install --frozen-lockfile`;
    await $`docker restart ${paths.containerName}`;
  } else {
    console.log('[dev-sync] code only: watchers pick it up, nothing restarted');
  }

  const containerAfter = await fingerprint(paths.sourcePath, RECREATE_PATHS);
  const containerMoved = RECREATE_PATHS.filter((p) => containerBefore[p] !== containerAfter[p]);
  if (containerMoved.length > 0) {
    throw new Error(
      `${containerMoved.join(', ')} changed, and a restart cannot apply it.\n` +
        '  The running container was created from the previous file, so its mounts,\n' +
        '  user, limits and image are still the old ones. Dev is serving the new\n' +
        '  source with the old container definition.\n' +
        '  Apply it: ssh h2puni "cd /home/puni1/wbs-dev/src/deploy/dev-src && docker compose up -d"',
    );
  }

  if (!paths.rehearsal) {
    const exposureExpected = await mcpExposureExpected(paths.statePath);
    const probe = join(paths.sourcePath, 'bin/dev-mcp-probe.sh');
    await $`env MCP_EXPOSURE_EXPECTED=${exposureExpected} BUN=${process.execPath} bash ${probe} https://dev.wbs.bulletpoints.club`;
  }

  console.log(`[dev-sync] dev now at ${head}`);
}

export interface DevSyncInvocation {
  sha: string;
  locked: boolean;
  paths: DevSyncPaths;
}

/** Parses the production default or one fully explicit fenced rehearsal. */
export function parseDevSyncInvocation(args: readonly string[]): DevSyncInvocation {
  const remaining = [...args];
  const locked = remaining[0] === '--locked';
  if (locked) remaining.shift();
  const sha = remaining.shift();
  if (!sha) throw new Error('missing target SHA');

  let sourcePath: string | undefined;
  let containerName: string | undefined;
  let statePath: string | undefined;
  let rehearsal = false;
  while (remaining.length > 0) {
    const flag = remaining.shift();
    if (flag === '--rehearsal') {
      rehearsal = true;
      continue;
    }
    const value = remaining.shift();
    if (!value) throw new Error(`missing value for ${String(flag)}`);
    if (flag === '--source') sourcePath = value;
    else if (flag === '--container') containerName = value;
    else if (flag === '--state') statePath = value;
    else throw new Error(`unknown dev sync option: ${String(flag)}`);
  }
  const supplied = [sourcePath, containerName, statePath].filter(
    (value): value is string => value !== undefined,
  );
  if (supplied.length !== 0 && supplied.length !== 3) {
    throw new Error('rehearsal requires source, container and state together');
  }
  if (supplied.length === 3 && !rehearsal) {
    throw new Error('custom dev sync inputs require --rehearsal');
  }
  return {
    sha,
    locked,
    paths: devSyncPathsOf({
      ...(sourcePath === undefined ? {} : { sourcePath }),
      ...(containerName === undefined ? {} : { containerName }),
      ...(statePath === undefined ? {} : { statePath }),
      rehearsal,
    }),
  };
}

if (import.meta.main) {
  let invocation: DevSyncInvocation;
  try {
    invocation = parseDevSyncInvocation(process.argv.slice(2));
  } catch (error) {
    console.error(
      `usage: bun sync.ts <sha> [--source PATH --container NAME --state PATH --rehearsal]\n${String(error)}`,
    );
    process.exit(1);
  }

  if (invocation.locked) {
    // Already inside flock: this is the real run.
    await sync(invocation.sha, invocation.paths);
  } else {
    // Two overlapping runs can interleave their fetch, reset, install and
    // restart, leaving dev on one SHA with another SHA's dependencies. flock
    // makes the whole sequence exclusive; -n fails fast rather than queueing a
    // deploy whose operator has stopped watching. The dedicated conflict exit
    // keeps a child failure from being mislabeled as lock contention.
    const exitCode = await runDevSyncLock(invocation.sha, { paths: invocation.paths });
    if (exitCode !== 0) {
      console.error(devSyncFailureMessage(exitCode));
    }
    process.exit(exitCode);
  }
}
