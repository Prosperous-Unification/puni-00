import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, it, setDefaultTimeout } from 'bun:test';

import { ROOT, tierEnvFiles, tierSecretsFile } from './lib/docker';
import { planSwap } from './lib/reconcile';
import { execute, type SwapExecutionIo } from './swap';

const BACKEND = join(import.meta.dir, '../../../apps/wbs/be-01');
const SERVER = 'https://wbs.example/mcp/oauth';
const IMAGE = `registry/wbs-be-01@sha256:${'b'.repeat(64)}`;
const OUTGOING = 'a'.repeat(64);
const SECRETS = [
  'INTERNAL_AUTH_SECRET=internal-auth-secret-for-the-swap-0123456789',
  'JWT_SIGNING_KEY_CURRENT=jwt-signing-key-for-the-swap-0123456789abc',
  'MCP_BE_INTERNAL_SECRET=mcp-be-internal-secret-for-the-swap-012345',
  'WBS_MACHINE_GRANT_SIGNING_KEY_CURRENT=machine-grant-key-for-the-swap-0123456789',
];
const roots: string[] = [];

// Migrating the real schema and spawning each CLI takes a few seconds apiece.
setDefaultTimeout(60_000);

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A migrated store under `<root>/data/plan.db`, as `/data/plan.db` inside the candidate. */
function store(): { root: string; dbPath: string } {
  const root = mkdtempSync(join(tmpdir(), 'swap-mcp-preflight-'));
  roots.push(root);
  mkdirSync(join(root, 'data'));
  const dbPath = join(root, 'data', 'plan.db');
  new Database(dbPath).close();
  const migrated = Bun.spawnSync([process.execPath, 'run', 'src/migrate-cli.ts'], {
    cwd: BACKEND,
    env: { ...process.env, DB_PATH: dbPath },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (migrated.exitCode !== 0) throw new Error(migrated.stderr.toString());
  return { root, dbPath };
}

function write(dbPath: string, statements: string[]): void {
  const sqlite = new Database(dbPath);
  try {
    for (const statement of statements) sqlite.run(statement);
    sqlite.run('PRAGMA wal_checkpoint(TRUNCATE)');
  } finally {
    sqlite.close();
  }
}

const LEGACY_REGISTRATION = [
  "INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'org-a', 1)",
  `INSERT INTO organization_trusted_issuer (id, organization_id, issuer, jwks_uri, default_audience, created_at)
   VALUES ('ti-legacy', 'org-a', 'https://ci.example', 'https://ci.example/jwks', 'wbs:org:org-a', 1)`,
];
const ACTIVATE =
  "UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1";

/**
 * Runs the swap's own `docker run … sh -c` command against the real be-01
 * source: env files by their swap paths, `/data` as the fixture's directory.
 */
function runCandidate(
  args: string[],
  root: string,
  envFiles: Map<string, string>,
  source: string,
): string {
  const env: Record<string, string> = { PATH: dirname(process.execPath) + ':/usr/bin:/bin' };
  let script: string | undefined;
  for (let at = 1; at < args.length; at++) {
    const argument = args[at];
    const next = args[at + 1] ?? '';
    if (argument === '--mount') {
      expect(next).toBe(`type=bind,source=${ROOT}/data,target=/data,bind-propagation=rprivate`);
      at++;
    } else if (argument === '--env-file') {
      const text = envFiles.get(next);
      if (text === undefined) throw new Error(`unexpected env file ${next}`);
      for (const line of text.split('\n').filter((entry) => entry.includes('='))) {
        const eq = line.indexOf('=');
        env[line.slice(0, eq)] = line.slice(eq + 1);
      }
      at++;
    } else if (argument === '-e') {
      const eq = next.indexOf('=');
      env[next.slice(0, eq)] = next.slice(eq + 1).replace(/^\/data\//, `${root}/data/`);
      at++;
    } else if (argument === '-c') {
      script = next;
      at++;
    }
  }
  expect(args.slice(args.indexOf('--entrypoint'), args.indexOf('--entrypoint') + 3)).toEqual([
    '--entrypoint',
    'sh',
    IMAGE,
  ]);
  if (script === undefined) throw new Error('candidate command has no script');
  const child = Bun.spawnSync(['sh', '-c', script], {
    cwd: source,
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (child.exitCode !== 0)
    throw new Error(`docker ${args.join(' ')} failed: ${child.stderr.toString()}`);
  return child.stdout.toString();
}

function attempt(
  root: string,
  beEnv: string,
  secrets: readonly string[] = SECRETS,
  source: string = BACKEND,
) {
  const appEnv = tierEnvFiles('be')[0];
  const secretsFile = tierSecretsFile('be');
  const envFiles = new Map<string, string>(
    tierEnvFiles('be').map((path) => [
      path,
      path === appEnv
        ? `DB_PATH=/data/plan.db\n${beEnv}`
        : path === secretsFile
          ? secrets.join('\n')
          : '',
    ]),
  );
  const commands: string[][] = [];
  const io: SwapExecutionIo = {
    namespaceProof: () => Promise.resolve(),
    barrierStateDir: root,
    captureStateDir: root,
    resolveMount: (path) => Promise.resolve(path),
    readPhase: () => Promise.resolve('committed'),
    writePhase: () => Promise.resolve(),
    writeAtomic: () => Promise.resolve(),
    prepareBackend: () =>
      Promise.resolve({
        databasePath: '/data/plan.db',
        databaseHostPath: `${ROOT}/data/plan.db`,
        start: () => Promise.resolve(),
        startMaintenance: () => Promise.resolve('m'.repeat(64)),
        verifyMaintenance: () => Promise.resolve(),
        imageId: `sha256:${'b'.repeat(64)}`,
        snapshots: {
          application: { path: '/application.json', sha256: 'c'.repeat(64) },
          maintenance: { path: '/maintenance.json', sha256: 'd'.repeat(64) },
        },
      }),
    sh: (args) => {
      commands.push(args);
      if (args[0] === 'run') return Promise.resolve(runCandidate(args, root, envFiles, source));
      if (args[0] === 'stop') return Promise.reject(new Error('reached the outgoing stop'));
      if (args[0] === 'image' && args[3] === '{{json .}}')
        return Promise.resolve(JSON.stringify({ Id: `sha256:${'b'.repeat(64)}` }));
      if (args[0] === 'image') return Promise.resolve(IMAGE);
      if (args[0] === 'ps') return Promise.resolve(OUTGOING);
      if (args[0] === 'inspect')
        return Promise.resolve(
          JSON.stringify([
            {
              Id: OUTGOING,
              Name: '/be-01-blue',
              Image: `sha256:${'b'.repeat(64)}`,
              Config: { Image: IMAGE, Env: ['DB_PATH=/data/plan.db'] },
              Mounts: [{ Type: 'bind', Source: `${ROOT}/data`, Destination: '/data', RW: true }],
            },
          ]),
        );
      return Promise.reject(new Error(`unexpected docker ${args.join(' ')}`));
    },
  };
  const plan = planSwap('be', {
    routedColor: 'blue',
    runningColors: ['blue'],
    recordedColor: 'blue',
    phase: 'committed',
  });
  return { io, plan, commands };
}

async function failure(operation: Promise<unknown>): Promise<string> {
  try {
    await operation;
    return 'resolved';
  } catch (error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe('the be swap MCP preflight', () => {
  it('refuses an unaccepted wbs:org registration before any writer stops', async () => {
    const { root, dbPath } = store();
    write(dbPath, LEGACY_REGISTRATION);
    const swap = attempt(root, `WBS_MCP_AUTHORIZATION_SERVER=${SERVER}\n`);
    const refusal = await failure(execute(swap.plan, IMAGE, 'deadbeef', swap.io));
    expect(refusal).toContain(
      'stored audience(s) break WBS_MCP_AUTHORIZATION_SERVER and are not accepted: registration ti-legacy',
    );
    expect(swap.commands.some((args) => args[0] === 'stop')).toBe(false);
    expect(existsSync(join(root, 'be-writer-stop.json'))).toBe(false);
    // Secrets travel in env files, never in the echoed command.
    for (const secret of SECRETS) expect(refusal).not.toContain(secret.split('=')[1]);
  });

  it('passes the registration --accept-breaking names, on to the writer stop', async () => {
    const { root, dbPath } = store();
    write(dbPath, LEGACY_REGISTRATION);
    const swap = attempt(root, `WBS_MCP_AUTHORIZATION_SERVER=${SERVER}\n`);
    const reached = await failure(
      execute(swap.plan, IMAGE, 'deadbeef', swap.io, false, ['ti-legacy']),
    );
    expect(reached).toContain('reached the outgoing stop');
    expect(swap.commands.filter((args) => args[0] === 'run')).toHaveLength(2);
  });

  it('refuses an activated store whose candidate env lacks a grant setting, before migration', async () => {
    const { root, dbPath } = store();
    write(dbPath, [ACTIVATE]);
    const swap = attempt(
      root,
      `WBS_MCP_AUTHORIZATION_SERVER=${SERVER}\n`,
      SECRETS.filter((line) => !line.startsWith('MCP_BE_INTERNAL_SECRET=')),
    );
    const refusal = await failure(execute(swap.plan, IMAGE, 'deadbeef', swap.io));
    expect(refusal).toContain('MCP_BE_INTERNAL_SECRET is missing');
    expect(swap.commands.some((args) => args[0] === 'stop')).toBe(false);
    expect(existsSync(join(root, 'be-writer-stop.json'))).toBe(false);
  });

  it('passes a pre-activation store without the settings, skipping the audiences', async () => {
    const { root, dbPath } = store();
    write(dbPath, LEGACY_REGISTRATION);
    const swap = attempt(
      root,
      '',
      SECRETS.filter((line) => line.startsWith('INTERNAL') || line.startsWith('JWT')),
    );
    const reached = await failure(execute(swap.plan, IMAGE, 'deadbeef', swap.io));
    expect(reached).toContain('reached the outgoing stop');
    expect(swap.commands.filter((args) => args[0] === 'run')).toHaveLength(1);
  });
});

describe('a candidate without the preflight CLIs', () => {
  it('refuses a candidate that ships no settings CLI', async () => {
    const { root } = store();
    // An image whose `src` lacks both CLIs: a release older than the check, or a packaging fault.
    const source = join(root, 'older-image');
    mkdirSync(join(source, 'src'), { recursive: true });
    const swap = attempt(root, `WBS_MCP_AUTHORIZATION_SERVER=${SERVER}\n`, SECRETS, source);
    const refusal = await failure(execute(swap.plan, IMAGE, 'deadbeef', swap.io));
    expect(refusal).toContain('candidate image lacks src/mcp-service-settings-check-cli.ts');
    expect(swap.commands.some((args) => args[0] === 'stop')).toBe(false);
    expect(existsSync(join(root, 'be-writer-stop.json'))).toBe(false);
  });
});

describe('the swap CLI accept list', () => {
  for (const [args, message] of [
    [['gw', '--accept-breaking=ti-legacy'], 'only a be swap checks'],
    [['be', '--accept-breaking=ti-a,,ti-b'], '--accept-breaking must be distinct ids'],
    [['be', '--accept-breaking=ti-a,ti-a'], '--accept-breaking must be distinct ids'],
  ] as const) {
    it(`refuses ${args.join(' ')}`, () => {
      const child = Bun.spawnSync([process.execPath, join(import.meta.dir, 'swap.ts'), ...args], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      expect(child.exitCode).toBe(1);
      expect(child.stderr.toString()).toContain(message);
    });
  }
});
