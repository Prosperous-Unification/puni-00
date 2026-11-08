import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from 'node:fs';
import { resolve } from 'node:path';

import {
  buildInstalledControllerAdmission,
  retainUnknownControllerObservation,
} from '@tools/deploy-contract';

import { REGISTRY_PASS_ENV_VAR, requireRegistryPassword } from './lib/secrets';

export const WBS_ROOT = '/home/puni1/wbs';

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
      sha256: string;
      byteLength: number;
      /** Env var NAMES exported ahead of the script on stdin — never values (see module doc comment). */
      envKeys: string[];
      /** Non-secret per-invocation settings delivered with the script. */
      env: Record<string, string>;
    };

/** Captures bounded regular input bytes and refuses source identity or metadata drift. */
function capturePushFile(path: string): { bytes: Buffer; sha256: string; byteLength: number } {
  const canonical = resolve(path);
  if (realpathSync(canonical) !== canonical)
    throw new Error('provisioning input must be canonical');
  const descriptor = openSync(
    canonical,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    if (!opened.isFile() || opened.size < 1n || opened.size > 1048576n)
      throw new Error('invalid bounded provisioning input');
    const bytes = Buffer.alloc(Number(opened.size) + 1);
    let length = 0;
    while (length < bytes.length) {
      const read = readSync(descriptor, bytes, length, bytes.length - length, length);
      if (read === 0) break;
      length += read;
    }
    for (const closing of [
      fstatSync(descriptor, { bigint: true }),
      lstatSync(canonical, { bigint: true }),
    ]) {
      if (
        opened.dev !== closing.dev ||
        opened.ino !== closing.ino ||
        opened.mode !== closing.mode ||
        opened.uid !== closing.uid ||
        opened.gid !== closing.gid ||
        opened.size !== closing.size ||
        opened.mtimeNs !== closing.mtimeNs ||
        opened.ctimeNs !== closing.ctimeNs ||
        BigInt(length) !== opened.size
      )
        throw new Error('provisioning input changed while capturing selected bytes');
    }
    const selected = bytes.subarray(0, length);
    return {
      bytes: selected,
      sha256: createHash('sha256').update(selected).digest('hex'),
      byteLength: length,
    };
  } finally {
    closeSync(descriptor);
  }
}

function quotePushShell(value: string): string {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

/** Obtains actual installed-reader authority before interpreting either staged script or stdin. */
function buildPushAdmission(staging: string): string {
  const state = '/home/puni1/wbs/state';
  const quote = quotePushShell;
  return `set -eu
WBS_EDGE_STATE=${quote(state)}; export WBS_EDGE_STATE
test -d ${quote(state)}
test ! -L ${quote(state)}
controller_state_path=$(realpath -- ${quote(state)}) || exit 1
test "$controller_state_path" = ${quote(state)} || exit 1
test -f ${quote(`${state}/edge.lock`)}
test ! -L ${quote(`${state}/edge.lock`)}
exec 8<${quote(`${state}/edge.lock`)}
flock -n 8
${buildInstalledControllerAdmission('required', 8)}
test -d ${quote(staging)}
test ! -L ${quote(staging)}
controller_stage_path=$(realpath -- ${quote(staging)}) || exit 1
test "$controller_stage_path" = ${quote(staging)} || exit 1
controller_stage_mode=$(stat -c %a -- ${quote(staging)}) || exit 1
test "$controller_stage_mode" = 700 || exit 1
controller_stage_uid=$(stat -c %u -- ${quote(staging)}) || exit 1
controller_actor_uid=$(id -u) || exit 1
test -n "$controller_actor_uid" || exit 1
test "$controller_stage_uid" = "$controller_actor_uid" || exit 1`;
}

/** Captures input pins and builds an ordered, secret-free plan; private staging grants no execution authority. */
export function buildPlan(args: PushArgs, stageId: string): PushStep[] {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(stageId))
    throw new Error('invalid provisioning invocation identity');
  const parent = '/home/puni1/.cache/wbs-solver';
  const staging = `${parent}/provision-${stageId}`;
  const bootstrap = `${staging}/bootstrap.sh`;
  const stagedBase = `${staging}/base.yml`;
  const bootstrapPin = capturePushFile(args.bootstrapPath);
  const basePin = capturePushFile(args.baseComposePath);
  const configurePin = capturePushFile(args.configurePath);
  const target = `${args.user}@${args.host}`;
  const sudo = args.user === 'root' ? '' : 'sudo -C 9 ';
  const quote = quotePushShell;
  const shell = (script: string) => `sh -c ${quote(script)}`;
  const verify = (
    path: string,
    pin: { sha256: string; byteLength: number },
  ) => `test -f ${quote(path)}
test ! -L ${quote(path)}
controller_input_path=$(realpath -- ${quote(path)}) || exit 1
test "$controller_input_path" = ${quote(path)} || exit 1
controller_input_bytes=$(stat -c %s -- ${quote(path)}) || exit 1
test "$controller_input_bytes" = ${String(pin.byteLength)} || exit 1
printf '%s  %s\\n' ${quote(pin.sha256)} ${quote(path)} | sha256sum -c - || exit 1`;
  const steps: PushStep[] = [
    {
      kind: 'run',
      description: `create exclusive private inert provisioning staging ${staging}`,
      argv: [
        'ssh',
        target,
        shell(
          `set -eu; test -d ${quote(parent)}; test ! -L ${quote(parent)}; controller_parent_path=$(realpath -- ${quote(parent)}) || exit 1; test "$controller_parent_path" = ${quote(parent)} || exit 1; controller_parent_mode=$(stat -c %a -- ${quote(parent)}) || exit 1; test "$controller_parent_mode" = 700 || exit 1; controller_parent_uid=$(stat -c %u -- ${quote(parent)}) || exit 1; test "$controller_parent_uid" = 1000 || exit 1; mkdir -m 0700 -- ${quote(staging)} || exit 1`,
        ),
      ],
    },
    {
      kind: 'run',
      description: `scp ${args.bootstrapPath} -> ${target}:${bootstrap}`,
      argv: ['scp', args.bootstrapPath, `${target}:${bootstrap}`],
    },
    {
      kind: 'run',
      description: 'admit through fixed installed reader before executing staged bootstrap.sh',
      argv: [
        'ssh',
        target,
        shell(
          `${buildPushAdmission(staging)}\n${verify(bootstrap, bootstrapPin)}\nexec ${sudo}sh ${quote(bootstrap)}`,
        ),
      ],
    },
    {
      kind: 'run',
      description: `scp ${args.baseComposePath} -> ${target}:${stagedBase} (inert until configure admission)`,
      argv: ['scp', args.baseComposePath, `${target}:${stagedBase}`],
    },
    {
      kind: 'script-over-stdin',
      description:
        'admit through fixed installed reader before interpreting configure.sh stdin and committing base.yml',
      target,
      remoteCommand: shell(
        `${buildPushAdmission(staging)}\n${verify(stagedBase, basePin)}\nexec ${sudo}sh -s`,
      ),
      scriptPath: args.configurePath,
      sha256: configurePin.sha256,
      byteLength: configurePin.byteLength,
      envKeys: ['WBS_USER', 'REGISTRY_USER', REGISTRY_PASS_ENV_VAR, 'WBS_BASE_COMPOSE_STAGE'],
      env: { WBS_BASE_COMPOSE_STAGE: stagedBase },
    },
  ];
  if (args.wbsHost !== undefined)
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

/** Executes one provisioning transport step, preserving ordered failure. */
export async function runStep(step: PushStep, secretEnv: Record<string, string>): Promise<void> {
  if (step.kind === 'run') {
    const p = Bun.spawn(step.argv, { stdout: 'inherit', stderr: 'inherit' });
    let code;
    try {
      code = await p.exited;
    } catch {
      return retainUnknownControllerObservation();
    }
    if (code !== 0) {
      throw new Error(`step failed (exit ${String(code)}): ${step.description}`);
    }
    return;
  }

  // script-over-stdin: pipe `export KEY=value` lines + the script itself to
  // `ssh <target> '<remoteCommand>'` — see buildStdinPayload's doc comment
  // for why this, rather than a temp file or command-line env vars, is how
  // the secret travels.
  const selected = capturePushFile(step.scriptPath);
  if (selected.sha256 !== step.sha256 || selected.byteLength !== step.byteLength)
    throw new Error('selected configure input bytes changed before stdin transport');
  const scriptText = new TextDecoder('utf-8', { fatal: true }).decode(selected.bytes);
  const payload = buildStdinPayload({ ...secretEnv, ...step.env }, scriptText);
  const p = Bun.spawn(['ssh', step.target, step.remoteCommand], {
    stdin: new Blob([payload]),
    stdout: 'inherit',
    stderr: 'inherit',
  });
  let code;
  try {
    code = await p.exited;
  } catch {
    return retainUnknownControllerObservation();
  }
  if (code !== 0) {
    throw new Error(`step failed (exit ${String(code)}): ${step.description}`);
  }
}

async function main(): Promise<void> {
  const args = parsePushArgs(process.argv.slice(2));
  const plan = buildPlan(args, randomUUID());

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
