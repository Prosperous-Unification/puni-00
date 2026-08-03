// Provisions a fresh host end to end, in the order the pieces actually
// depend on each other. Before the cross-review fix that added this file's
// real body, `--execute` printed "not wired to a real SSH call" and every
// step below had only ever been run by hand — see
// docs/superpowers/plans/2026-08-02-compose-blue-green-HANDOVER.md's
// "configure.sh has never been executed as a script" note.
//
// Five steps, strictly ordered:
//   1. scp bootstrap.sh to the host, run it as root — installs docker/bun,
//      creates the /srv/wbs tree (tools/tool-bootstrap/src/bootstrap.sh).
//   2. scp deploy/compose/base.yml to $WBS_ROOT/base.yml — root, so it lands
//      before configure.sh's `chown -R` picks it up too.
//   3. Run configure.sh as root, piped over stdin (not written to a temp
//      file, not passed on the command line) together with WBS_USER,
//      REGISTRY_USER, and REGISTRY_PASS: writes Caddy/registry/per-tier
//      config, brings up the base compose stack, and (breaking the
//      login-before-registry-exists circularity — cross-review item 2) logs
//      the host in to the registry only AFTER that stack is up.
//   4. Installs the executor bundles (swap.js, smoke.js) by shelling out to
//      the already-committed `tool-remote-scripts:install --execute` — see
//      that project's install.ts. Requires a separate `--wbs-host`: steps
//      1-3 need a ROOT-authenticated SSH target, this step needs one
//      authenticated as $WBS_USER (e.g. the `h2puni` alias in an operator's
//      own ~/.ssh/config, which this repo does not and should not manage).
//      Skipped, with an explicit instruction printed instead, if --wbs-host
//      is not given.
//
// REGISTRY_PASS is read from this process's own environment (never a CLI
// flag — never wanted on a command line or in shell history) and reaches
// configure.sh only via the piped stdin payload of step 3, never as part of
// any argv this process spawns — argv is visible to any local user via `ps`,
// stdin content is not. Never printed in full by this file; --dry-run and
// the printed plan show its EXISTENCE (an env var name), never its value.
import { REGISTRY_PASS_ENV_VAR, requireRegistryPassword } from './lib/secrets';

export const WBS_ROOT = '/srv/wbs';

export interface PushArgs {
  /** Root-accessible address or ssh-config alias for steps 1-3. */
  host: string;
  /** ssh user for steps 1-3. Root is what a genuinely fresh cloud host offers before any hardening runs. */
  user: string;
  /** WBS_USER passed to configure.sh — the unprivileged account deploys run as afterward. */
  wbsUser: string;
  /** REGISTRY_USER passed to configure.sh — the registry login this host authenticates as. */
  registryUser: string;
  /**
   * ssh-config alias (or address) that authenticates as `wbsUser`, for step
   * 4 only. Not defaulted to `host`: `host` authenticates as `user` (root)
   * for steps 1-3, a different identity than step 4 needs, and there is no
   * way to derive one from the other — an operator's ~/.ssh/config decides
   * it, outside this repo's control. Omitted entirely, step 4 is skipped
   * with an explicit instruction printed instead of guessing.
   */
  wbsHost?: string;
  bootstrapPath: string;
  configurePath: string;
  baseComposePath: string;
  dryRun: boolean;
}

export function parsePushArgs(argv: string[], defaults?: Partial<PushArgs>): PushArgs {
  let host = defaults?.host ?? '';
  let user = defaults?.user ?? 'root';
  let wbsUser = defaults?.wbsUser ?? 'puni1';
  let registryUser = defaults?.registryUser ?? 'wbs';
  let wbsHost = defaults?.wbsHost;
  const bootstrapPath = defaults?.bootstrapPath ?? 'tools/tool-bootstrap/src/bootstrap.sh';
  const configurePath = defaults?.configurePath ?? 'tools/tool-bootstrap/src/configure.sh';
  const baseComposePath = defaults?.baseComposePath ?? 'deploy/compose/base.yml';
  let dryRun = defaults?.dryRun ?? true;

  for (const raw of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(raw);
    if (!m) continue;
    const key = m[1];
    const val = (m[2] as string | undefined) ?? '';
    if (key === 'host') host = val;
    else if (key === 'user') user = val;
    else if (key === 'wbs-user') wbsUser = val;
    else if (key === 'registry-user') registryUser = val;
    else if (key === 'wbs-host') wbsHost = val;
    else if (key === 'dry-run') dryRun = true;
    else if (key === 'execute') dryRun = false;
  }

  if (!host) throw new Error('--host=<hostname> required');
  return {
    host,
    user,
    wbsUser,
    registryUser,
    wbsHost,
    bootstrapPath,
    configurePath,
    baseComposePath,
    dryRun,
  };
}

export type PushStep =
  | { kind: 'run'; description: string; argv: string[] }
  | {
      kind: 'script-over-stdin';
      description: string;
      target: string;
      /** The remote command whose stdin the script is piped to — e.g. `'sh -s'` or `'sudo sh -s'`; decided once in buildPlan from `args.user`, not re-derived from `target`. */
      remoteCommand: string;
      scriptPath: string;
      /** Env var NAMES exported ahead of the script on stdin — never values (see module doc comment). */
      envKeys: string[];
    };

/**
 * The ordered plan, pure and secret-free — nothing here ever holds
 * `REGISTRY_PASS`'s value, only the fact that step 3 will need it (by name,
 * in `envKeys`). Testable without a real secret for exactly that reason.
 */
export function buildPlan(args: PushArgs): PushStep[] {
  const target = `${args.user}@${args.host}`;
  // A truly fresh minimal cloud image may not have `sudo` installed yet
  // (bootstrap.sh's own install_packages() is what installs it) — prefixing
  // `sudo` unconditionally, as this used to, would make a root SSH session
  // depend on a binary root itself is about to install. Only prefix it when
  // NOT already root.
  const sudo = args.user === 'root' ? '' : 'sudo ';

  const steps: PushStep[] = [
    {
      kind: 'run',
      description: `scp ${args.bootstrapPath} -> ${target}:/tmp/bootstrap.sh`,
      argv: ['scp', args.bootstrapPath, `${target}:/tmp/bootstrap.sh`],
    },
    {
      kind: 'run',
      description: `ssh ${target} '${sudo}sh /tmp/bootstrap.sh' (root: docker+bun install, /srv/wbs tree)`,
      argv: ['ssh', target, `${sudo}sh /tmp/bootstrap.sh`],
    },
    {
      kind: 'run',
      description: `scp ${args.baseComposePath} -> ${target}:${WBS_ROOT}/base.yml (before configure.sh's chown -R)`,
      argv: ['scp', args.baseComposePath, `${target}:${WBS_ROOT}/base.yml`],
    },
    {
      kind: 'script-over-stdin',
      description:
        `ssh ${target} '${sudo}sh -s' < ${args.configurePath} ` +
        '(root: writes Caddy/registry/per-tier config, brings up base.yml, then logs in — ' +
        'see configure.sh for why login is last)',
      target,
      remoteCommand: `${sudo}sh -s`,
      scriptPath: args.configurePath,
      envKeys: ['WBS_USER', 'REGISTRY_USER', REGISTRY_PASS_ENV_VAR],
    },
  ];

  if (args.wbsHost !== undefined) {
    steps.push({
      kind: 'run',
      description: `nx run tool-remote-scripts:install --host=${args.wbsHost} --execute (installs swap.js, smoke.js)`,
      argv: [
        'bunx',
        'nx',
        'run',
        'tool-remote-scripts:install',
        `--host=${args.wbsHost}`,
        '--execute',
      ],
    });
  }

  return steps;
}

/**
 * The stdin payload for a `script-over-stdin` step: `export KEY='value'`
 * lines (shell-quoted so a value containing `'` cannot break out — `'` itself
 * has no single-quote-safe representation, so it is closed, an escaped quote
 * spliced in, and reopened) followed by the script's own text verbatim. This
 * is the ONLY place `REGISTRY_PASS`'s value is ever assembled into a string
 * in this process — built fresh per call, never logged, never part of any
 * argv.
 */
export function buildStdinPayload(env: Record<string, string>, scriptText: string): string {
  const shQuote = (v: string): string => `'${v.replace(/'/g, `'\\''`)}'`;
  const exports = Object.entries(env)
    .map(([k, v]) => `export ${k}=${shQuote(v)}`)
    .join('\n');
  return `${exports}\n${scriptText}`;
}

async function runStep(step: PushStep, secretEnv: Record<string, string>): Promise<void> {
  if (step.kind === 'run') {
    const p = Bun.spawn(step.argv, { stdout: 'inherit', stderr: 'inherit' });
    const code = await p.exited;
    if (code !== 0) {
      throw new Error(`step failed (exit ${String(code)}): ${step.description}`);
    }
    return;
  }

  // script-over-stdin: pipe `export KEY=value` lines + the script itself to
  // `ssh <target> '<remoteCommand>'` — see buildStdinPayload's doc comment
  // for why this, rather than a temp file or command-line env vars, is how
  // the secret travels.
  const scriptText = await Bun.file(step.scriptPath).text();
  const payload = buildStdinPayload(secretEnv, scriptText);
  const p = Bun.spawn(['ssh', step.target, step.remoteCommand], {
    stdin: 'pipe',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  await p.stdin.write(payload);
  await p.stdin.end();
  const code = await p.exited;
  if (code !== 0) {
    throw new Error(`step failed (exit ${String(code)}): ${step.description}`);
  }
}

async function main(): Promise<void> {
  const args = parsePushArgs(process.argv.slice(2));
  const plan = buildPlan(args);

  console.log(
    `[tool-bootstrap] host=${args.host} user=${args.user} wbs-host=${args.wbsHost ?? '(not given — install step skipped)'} dry-run=${String(args.dryRun)}`,
  );
  for (const s of plan) console.log(`  ${s.description}`);

  if (args.dryRun) {
    console.log('[tool-bootstrap] dry-run only. re-run with --execute to provision for real.');
    return;
  }

  // Read once, up front, before any step runs — a missing REGISTRY_PASS
  // must abort before touching the host at all, the same "abort before
  // anything starts" shape tool-deploy and tool-dagger both already use.
  const registryPass = requireRegistryPassword(process.env);
  const secretEnv: Record<string, string> = {
    WBS_USER: args.wbsUser,
    REGISTRY_USER: args.registryUser,
    [REGISTRY_PASS_ENV_VAR]: registryPass,
  };

  for (const step of plan) {
    console.log(`[tool-bootstrap] $ ${step.description}`);
    await runStep(step, secretEnv);
  }

  if (args.wbsHost === undefined) {
    console.log(
      '[tool-bootstrap] --wbs-host was not given, so the executor-bundle install step was ' +
        'skipped. Run it by hand once an SSH alias authenticating as ' +
        `${args.wbsUser} exists for this host: ` +
        'nx run tool-remote-scripts:install --host=<alias> --execute',
    );
  }
  console.log('[tool-bootstrap] provisioning complete.');
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    console.error('[tool-bootstrap] failed:', e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
