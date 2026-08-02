// The deploy orchestrator. It answers two questions before anything touches
// the server: which tiers should move, and is it safe to blue/green them —
// then, for --execute, drives the real per-tier swap over SSH.
//
// It does not build or publish images itself: `nx run tool-dagger:publish-all`
// (Task 4) is a separate, explicit step that writes `release.json`. This CLI
// only reads that file, so a stale or missing release entry fails loudly
// rather than silently deploying an old image.
import { materialize, parseDeployArgs, type Tier } from './affected';
import { assertMigrationFlag, hasNewMigrations, migrationsAtSha } from './migrations';
import { readRemoteState, type RemoteTierState } from './remote-state';

export const DEFAULT_HOST = 'h2puni';
export const DEFAULT_RELEASE_PATH = 'dist/tool-dagger/release.json';

export interface ReleaseEntry {
  sha: string;
  digest: string;
  /** The tagged ref the image was pushed to. Traceability only. */
  ref: string;
  /**
   * The digest-pinned ref, registry address included, exactly as
   * `tool-dagger` recorded it. Passed through to `swap.js` verbatim — this
   * CLI is the only thing that talks to both sides, so it is the one place
   * the address could have been lost, and it used to be: only `--digest` and
   * `--sha` crossed the SSH boundary, with no env passthrough, leaving the
   * server to rebuild the ref from its own `REGISTRY` default. See
   * tools/tool-dagger/src/lib/publish.ts's ReleaseEntry.image.
   */
  image: string;
}
export type ReleaseRecord = Partial<Record<Tier, ReleaseEntry>>;

export interface DeployPlan {
  tiers: Tier[];
  steps: string[];
  /** One real remote command per tier, in the same order as `tiers`. */
  commands: string[];
  /**
   * Read-only registry checks, one per tier, run to completion before ANY
   * command above executes (design decision 10: "SSH, registry, or registry
   * auth unavailable at start — abort before anything starts"). Running them
   * all up front is the point: a per-tier check inside each swap would still
   * let tier 1 deploy and tier 2 fail, which is a half-deployed stack.
   */
  preflightCommands: string[];
  dryRun: boolean;
  host: string;
}

export interface DeployPlanDeps {
  readRemoteState: (host: string) => Promise<Partial<Record<Tier, RemoteTierState>>>;
  /** Migration folder names present under apps/be-01/drizzle at `sha`. */
  listMigrations: (sha: string) => string[];
  readRelease: (path: string) => Promise<ReleaseRecord>;
}

async function defaultReadRelease(path: string): Promise<ReleaseRecord> {
  const text = await Bun.file(path)
    .text()
    .catch(() => null);
  if (text === null) {
    throw new Error(
      `release manifest not found at ${path} — run "nx run tool-dagger:publish-all" first`,
    );
  }
  return JSON.parse(text) as ReleaseRecord;
}

export const defaultDeployPlanDeps: DeployPlanDeps = {
  readRemoteState,
  listMigrations: migrationsAtSha,
  readRelease: defaultReadRelease,
};

/**
 * Builds the deploy plan: which tiers move, what each one's remote swap
 * command will be, and — the safety-critical part — refuses to proceed if a
 * tier carries a migration the operator hasn't explicitly acknowledged via
 * `--with-migrations` or `--stop-the-world`. `deps` defaults to the real SSH
 * + git + filesystem implementations; tests inject fakes.
 */
export async function buildDeployPlan(
  argv: string[],
  affected: Tier[],
  headSha: string,
  deps: DeployPlanDeps = defaultDeployPlanDeps,
): Promise<DeployPlan> {
  const args = parseDeployArgs(argv);
  const tiers = materialize(args, affected);
  const host = args.host ?? DEFAULT_HOST;
  const steps: string[] = [];
  const commands: string[] = [];
  const preflightCommands: string[] = [];

  const remote = await deps.readRemoteState(host);
  const release = await deps.readRelease(args.bundle ?? DEFAULT_RELEASE_PATH);
  const headMigrations = deps.listMigrations(headSha);

  for (const t of tiers) {
    const state = remote[t];
    const deployedSha = state?.lastDeployedSha ?? null;
    steps.push(
      `[plan] ${t}: last=${deployedSha ?? '(none)'} active=${state?.activeColor ?? '(never deployed)'}`,
    );

    const deployedMigrations = deployedSha === null ? null : deps.listMigrations(deployedSha);
    const newMigrations = hasNewMigrations(deployedMigrations, headMigrations);
    // Throws (and aborts the whole plan, before any tier touches the
    // network) if this tier has new migrations and neither override flag
    // was given — see migrations.ts for why this must fail closed.
    assertMigrationFlag(newMigrations, args.withMigrations, args.stopTheWorld);
    if (newMigrations) {
      steps.push(
        `[plan] ${t}: new migrations present — proceeding under ` +
          (args.stopTheWorld ? '--stop-the-world' : '--with-migrations'),
      );
    }

    const entry = release[t];
    if (entry === undefined) {
      throw new Error(
        `no release entry for tier "${t}" in ${args.bundle ?? DEFAULT_RELEASE_PATH} — ` +
          'run "nx run tool-dagger:publish-all" first',
      );
    }

    // The gate above compares migrations *at git shas*, which only describes
    // what is inside the image if the image was built from a commit. That is
    // enforced at build time by tool-dagger's assertCleanTree(), and enforced
    // here by refusing a release that was not built from the commit this
    // deploy is deploying — otherwise `entry` could carry an image built from
    // an entirely different tree while the gate happily diffs HEAD.
    if (entry.sha !== headSha) {
      throw new Error(
        `release entry for tier "${t}" was built at ${entry.sha} but HEAD is ${headSha}.\n` +
          '  The migration gate compares migrations in git at HEAD, so it only describes\n' +
          '  this image if the two agree. Re-run "nx run tool-dagger:publish-all" at HEAD,\n' +
          '  or check out the commit the release was built from.',
      );
    }

    // Verified against the live host: swap.js is invoked as `ssh h2puni
    // 'cd /srv/wbs && bun bin/swap.js ...'` — no explicit user (the ssh
    // config alias already carries it) and no absolute bun path.
    //
    // `--image` carries the whole publish address; nothing on the far side
    // reconstructs it (see ReleaseEntry.image).
    const base = `cd /srv/wbs && bun bin/swap.js ${t} --image=${entry.image} --sha=${entry.sha}`;
    const remoteCmd = base + (args.dryRun ? '' : ' --execute');
    steps.push(`[plan] ${t}: ssh ${host} ${JSON.stringify(remoteCmd)}`);
    commands.push(remoteCmd);
    preflightCommands.push(`${base} --preflight`);
  }

  return { tiers, steps, commands, preflightCommands, dryRun: args.dryRun, host };
}

async function runRemote(host: string, cmd: string): Promise<void> {
  const p = Bun.spawn(['ssh', host, cmd], { stdout: 'inherit', stderr: 'inherit' });
  const code = await p.exited;
  if (code !== 0) {
    throw new Error(`remote command failed (exit ${String(code)}) on ${host}: ${cmd}`);
  }
}

function currentHeadSha(): string {
  const p = Bun.spawnSync(['git', 'rev-parse', 'HEAD']);
  if (p.exitCode !== 0) {
    throw new Error(`git rev-parse HEAD failed: ${p.stderr.toString('utf8').trim()}`);
  }
  return p.stdout.toString('utf8').trim();
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const headSha = currentHeadSha();
  const plan = await buildDeployPlan(argv, ['be', 'gw', 'fe'], headSha);

  console.log(
    `[tool-deploy] tiers=${plan.tiers.join(',') || '(none)'} host=${plan.host} dry-run=${String(plan.dryRun)}`,
  );
  for (const s of plan.steps) console.log(s);

  if (plan.dryRun) {
    console.log('[tool-deploy] dry-run only. re-run with --execute to perform a live deploy.');
    return;
  }

  // Every tier's registry check first, then every tier's swap. Decision 10
  // requires a registry/auth problem to abort "before anything starts", which
  // for a multi-tier deploy means before the FIRST tier starts, not before
  // each one.
  for (const cmd of plan.preflightCommands) {
    console.log(`[tool-deploy] $ ssh ${plan.host} ${cmd}`);
    await runRemote(plan.host, cmd);
  }

  // Sequential, one tier at a time: each swap already health-gates its own
  // colour before touching routing, and running tiers concurrently would
  // make a failed swap's console output impossible to attribute.
  for (const cmd of plan.commands) {
    console.log(`[tool-deploy] $ ssh ${plan.host} ${cmd}`);
    await runRemote(plan.host, cmd);
  }
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    console.error('[tool-deploy] failed:', e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
