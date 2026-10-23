import { type ChildProcess, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

const root = resolve(import.meta.dir, '../../../..');
const success =
  '[solver-image-smoke] composed installed Python published improved Pri, durable ready evidence and recomposed read reuse';
const scenario = 'apps/wbs/be-01/scripts/connected-composed-image-scenario.ts';
interface Fault {
  name: string;
  path: string;
  replacements: readonly (readonly [string, string])[];
  assertion: string;
}
const faults: readonly Fault[] = [
  {
    name: 'source-binding',
    path: 'apps/wbs/be-01/src/services.ts',
    replacements: [
      [
        `          connected: {
            solverVersion: options.optimizer.solverVersion,
            budgetMs: options.optimizer.budgetMs,
            now: options.now ?? Date.now,
          },`,
        '',
      ],
    ],
    assertion: 'assert.deepEqual(terminals, [',
  },
  {
    name: 'owned-close',
    path: 'libs/wbs/adapters/store-sqlite/src/chain-snapshot.ts',
    replacements: [
      [
        `      // Proof: omitting close recorded zero against one required close in both mounted unreadable-row saves (mounted-save-refusal/owned-close.log).
      connection.close();`,
        '      // Fault: retain the owned observation reader.',
      ],
    ],
    assertion: 'assert.deepEqual(terminals, [',
  },
  {
    name: 'baseline-publication',
    path: 'libs/wbs/domain/domain/src/connected-publication.ts',
    replacements: [
      ['const worse = optimizedValues[primary] > baselineValues[primary];', 'const worse = true;'],
    ],
    assertion: "assert.equal(decoded.outcome.decision.chosen, 'optimized');",
  },
  {
    name: 'healthy-reuse',
    path: 'apps/wbs/be-01/src/repository/optimization.ts',
    replacements: [
      [
        "(objective) => captured.variants[objective].kind === 'miss',",
        "(objective) => captured.variants[objective].kind === 'miss' || captured.variants[objective].kind === 'ok',",
      ],
      [
        "return outcome.kind !== 'miss';",
        "return outcome.kind !== 'miss' && outcome.kind !== 'ok';",
      ],
    ],
    assertion: 'assert.deepEqual(ledger(), settled);',
  },
];

function requireProof(condition: unknown, diagnosis: string): asserts condition {
  if (!condition) throw new Error(diagnosis);
}

let active: ChildProcess | undefined;
let interrupted = false;

/** Each command has a hard bound, including descendant processes via GNU timeout. */
async function command(
  arguments_: string[],
  seconds = 120,
): Promise<{ status: number; stdout: string; stderr: string }> {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(
      'timeout',
      ['--signal=TERM', '--kill-after=60', String(seconds), ...arguments_],
      {
        cwd: root,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    active = child;
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once('error', reject);
    child.once('close', (status, signal) => {
      active = undefined;
      if (status === null) reject(new Error(`command terminated by ${String(signal)}`));
      else resolveCommand({ status, stdout, stderr });
    });
  });
}

async function checked(arguments_: string[], seconds = 120): Promise<string> {
  const completed = await command(arguments_, seconds);
  requireProof(
    // Proof: bypassed exit status let after-untag deletion failure pass cleanup acceptance.
    completed.status === 0,
    `${arguments_.join(' ')} exited ${String(completed.status)}: ${completed.stderr}`,
  );
  return completed.stdout.trim();
}

/** Exact checkout and host are checked; the documented outer canonical command owns locking. */
async function preflight(sha: string) {
  requireProof(/^[0-9a-f]{40}$/.test(sha), 'expected full reviewed SHA');
  // Proof: bypassed SHA equality failed the exact-SHA refusal test.
  requireProof((await checked(['git', 'rev-parse', 'HEAD'])) === sha, 'exact SHA mismatch');
  requireProof((await checked(['git', 'status', '--porcelain'])) === '', 'worktree must be clean');
  requireProof(
    (await checked(['git', 'rev-parse', '--git-dir'])) !== '.git',
    'isolated worktree required',
  );
  requireProof(root !== '/home/puni1/wbs-dev/src', 'poller tree forbidden');
  requireProof(hostname().split('.')[0] === 'h2puni', 'host must be h2puni');
  requireProof(
    (process.env['WBS_RUN_SOLVER_ORPHAN_PROC'] ?? '0') === '0',
    'orphan mode must be off',
  );
  for (const tool of ['docker', 'bun', 'curl', 'timeout', 'git']) await checked(['which', tool]);
}

/** Produce a fresh single-file mutant without editing checkout source or another mutant. */
function mutate(fault: (typeof faults)[number], context: string) {
  let source = readFileSync(resolve(root, fault.path), 'utf8');
  for (const replacement of fault.replacements) {
    const [before, after] = replacement;
    // Proof: bypassed site count let the unknown mutation site test accept unchanged source.
    requireProof(source.split(before).length === 2, `${fault.name}: mutation site changed`);
    source = source.replace(before, after);
  }
  writeFileSync(resolve(context, 'fault.ts'), source);
}

class Attempt {
  readonly token = randomUUID();
  readonly registry = `wbs-task7-registry-${this.token}`;
  registryOwned = false;
  readonly tags: string[] = [];
  readonly events: unknown[] = [];
  readonly deadline = Date.now() + 3600_000;
  constructor(readonly receipt: string) {}

  record(event: unknown) {
    this.events.push(event);
    writeFileSync(
      resolve(this.receipt, 'inventory.json'),
      JSON.stringify(
        {
          token: this.token,
          registry: this.registry,
          tags: this.tags,
          events: this.events,
        },
        null,
        2,
      ) + '\n',
    );
  }

  async runCommand(arguments_: string[], seconds = 120) {
    const remaining = Math.floor((this.deadline - Date.now()) / 1000);
    // Proof: bypassed work bound let the expired-work test reach fake Docker.
    requireProof(remaining > 0, 'attempt exceeded one-hour work bound');
    requireProof(!interrupted, 'attempt interrupted');
    const completed = await command(arguments_, Math.min(seconds, remaining));
    const log = resolve(this.receipt, `command-${String(this.events.length)}.log`);
    writeFileSync(log, completed.stdout + completed.stderr);
    this.record({ command: arguments_, status: completed.status, log });
    requireProof(completed.status === 0, `command exited ${String(completed.status)}; see ${log}`);
    return completed.stdout.trim();
  }

  async tag(reference: string) {
    // Proof: bypassed absence let tag ownership record and claim an existing tag.
    requireProof(await this.absent('image', reference), `tag already exists: ${reference}`);
    this.tags.push(reference);
    this.record({ ownedTag: reference }); // Inventory precedes creation, even on partial failure.
    return reference;
  }

  async absent(kind: 'image' | 'container', reference: string) {
    const inspected = await command(['docker', kind, 'inspect', reference], 30);
    if (inspected.status === 0) return false;
    const expected = kind === 'image' ? 'No such image' : 'No such container';
    // Proof: bypassed diagnosis let broken inspect pass as absence in the fake Docker test.
    requireProof(
      inspected.stderr.includes(expected),
      `cannot inspect ${reference}: ${inspected.stderr}`,
    );
    return true;
  }

  async cleanup() {
    const failures: string[] = [];
    const owned: ['image' | 'container', string][] = [
      ...(this.registryOwned ? [['container', this.registry] as ['container', string]] : []),
      ...this.tags.toReversed().map((tag): ['image', string] => ['image', tag]),
    ];
    for (const [kind, reference] of owned) {
      try {
        let missing = false;
        try {
          missing = await this.absent(kind, reference);
        } catch (failure) {
          failures.push(String(failure));
        }
        if (!missing) {
          const arguments_ =
            kind === 'container' ? ['rm', '--force', reference] : ['image', 'rm', reference];
          try {
            await checked(['docker', ...arguments_], 60);
          } catch (failure) {
            failures.push(String(failure));
          }
        }
        // Proof: bypassed readback let cleanup rejects ignored removal pass acceptance.
        requireProof(await this.absent(kind, reference), `owned resource survived: ${reference}`);
        this.record({ cleaned: kind, reference, absent: true });
      } catch (failure) {
        failures.push(String(failure));
      }
    }
    this.record({ cleanupFailures: failures });
    requireProof(failures.length === 0, 'cleanup failed: ' + failures.join('; '));
  }

  async smoke(name: string, image?: string, fault?: (typeof faults)[number]) {
    const remaining = Math.floor((this.deadline - Date.now()) / 1000);
    requireProof(remaining > 0, 'attempt exceeded one-hour work bound');
    requireProof(!interrupted, 'attempt interrupted');
    const arguments_ = ['bash', resolve(root, 'apps/wbs/be-01/scripts/solver-image-smoke.sh')];
    if (image) arguments_.push('--image=' + image);
    const completed = await command(arguments_, Math.min(1800, remaining));
    const contents = completed.stdout + completed.stderr;
    const log = resolve(this.receipt, name + '.log');
    writeFileSync(log, contents);
    this.record({ smoke: name, command: arguments_, image, status: completed.status, log });
    if (!fault) {
      requireProof(
        // Proof: bypassed status let success text with nonzero exit pass green acceptance.
        completed.status === 0 && contents.includes(success),
        `${name}: composed green missing; see ${log}`,
      );
      return;
    }
    const lines = readFileSync(resolve(root, scenario), 'utf8').split('\n');
    const sites = lines.flatMap((line, index) =>
      line.includes(fault.assertion) ? [index + 1] : [],
    );
    requireProof(sites.length > 0, `${name}: assertion site absent`);
    // Proof: bypassed composed stack matching accepted a generic Docker AssertionError.
    requireProof(
      ![0, 124, 137, 143].includes(completed.status) &&
        !contents.includes(success) &&
        contents.includes('AssertionError') &&
        sites.some((line) => contents.includes(`${scenario}:${String(line)}:`)),
      `${name}: intended composed assertion missing; see ${log}`,
    );
  }

  async publish(tag: string) {
    await this.runCommand(['docker', 'push', tag], 600);
    const prefix = tag.slice(0, tag.lastIndexOf(':')) + '@sha256:';
    const matching = (
      await this.runCommand([
        'docker',
        'image',
        'inspect',
        '--format',
        '{{range .RepoDigests}}{{println .}}{{end}}',
        tag,
      ])
    )
      .split('\n')
      .filter((digest) => digest.startsWith(prefix));
    const digest = matching[0];
    requireProof(
      matching.length === 1 && /^[0-9a-f]{64}$/.test(digest.slice(prefix.length)),
      'registry must produce one exact immutable digest',
    );
    this.record({ tag, digest });
    return digest;
  }

  async run() {
    requireProof(await this.absent('container', this.registry), 'registry name already exists');
    this.record({ started: true, sha: await checked(['git', 'rev-parse', 'HEAD']) });
    await this.smoke('built-green');
    const baseline = await this.tag(`wbs-be-01:task7-${this.token}`);
    await this.runCommand(
      [
        'docker',
        'build',
        '--file',
        resolve(root, 'apps/wbs/be-01/Dockerfile'),
        '--tag',
        baseline,
        root,
      ],
      1800,
    );
    requireProof(await this.absent('container', this.registry), 'registry name already exists');
    this.registryOwned = true;
    this.record({ ownedRegistry: this.registry });
    await this.runCommand([
      'docker',
      'run',
      '--detach',
      '--rm',
      '--publish',
      '127.0.0.1::5000',
      '--name',
      this.registry,
      'registry:2',
    ]);
    const port = await this.runCommand([
      'docker',
      'inspect',
      '--format',
      '{{(index (index .NetworkSettings.Ports "5000/tcp") 0).HostPort}}',
      this.registry,
    ]);
    requireProof(/^[0-9]+$/.test(port), 'registry port malformed');
    const registry = '127.0.0.1:' + port;
    for (let retry = 0; retry < 10; retry++) {
      const probe = await command([
        'curl',
        '--fail',
        '--silent',
        '--show-error',
        '--max-time',
        '2',
        `http://${registry}/v2/`,
      ]);
      if (probe.status === 0) break;
      requireProof(retry < 9, 'registry readiness did not converge');
      await checked(['sleep', '1']);
    }
    const baselineTag = await this.tag(`${registry}/wbs-be-01:baseline-${this.token}`);
    await this.runCommand(['docker', 'tag', baseline, baselineTag]);
    const digest = await this.publish(baselineTag);
    await this.smoke('supplied-green', digest);
    for (const fault of faults) {
      const context = resolve(this.receipt, fault.name);
      mkdirSync(context);
      mutate(fault, context);
      this.record({
        fault: fault.name,
        source: fault.path,
        replacementSha256: createHash('sha256')
          .update(readFileSync(resolve(context, 'fault.ts')))
          .digest('hex'),
      });
      writeFileSync(
        resolve(context, 'Dockerfile'),
        `FROM ${digest}\nCOPY fault.ts /app/${fault.path}\n`,
      );
      const tag = await this.tag(`${registry}/wbs-be-01:${fault.name}-${this.token}`);
      await this.runCommand(
        [
          'docker',
          'build',
          '--pull=false',
          '--file',
          resolve(context, 'Dockerfile'),
          '--tag',
          tag,
          context,
        ],
        600,
      );
      const mutant = await this.publish(tag);
      requireProof(mutant !== digest, 'derivative digest equals baseline');
      let faultFailure: Error | undefined;
      try {
        await this.smoke(fault.name, mutant, fault);
      } catch (failure) {
        faultFailure = failure instanceof Error ? failure : new Error(String(failure));
      }
      try {
        await this.smoke(`${fault.name}-restored`, digest);
      } catch (failure) {
        if (faultFailure) this.record({ restorationFailure: String(failure) });
        else throw failure;
      }
      if (faultFailure) throw faultFailure;
    }
    requireProof(
      (await checked(['git', 'status', '--porcelain'])) === '',
      'source checkout changed',
    );
  }
}

async function finish(attempt: Attempt) {
  let primaryFailure: Error | undefined;
  try {
    await attempt.run();
  } catch (failure) {
    primaryFailure = failure instanceof Error ? failure : new Error(String(failure));
    try {
      attempt.record({ primaryFailure: String(failure) });
    } catch (receiptFailure) {
      console.error('additional receipt failure:', receiptFailure);
    }
  }
  try {
    await attempt.cleanup();
  } catch (failure) {
    // Proof: overwriting this branch lost primary-client-87 in the dual-failure test.
    if (primaryFailure) console.error('additional cleanup failure:', failure);
    else primaryFailure = failure instanceof Error ? failure : new Error(String(failure));
  }
  if (primaryFailure) throw primaryFailure;
}

async function main() {
  const [sha, receipt] = process.argv.slice(2);
  requireProof(
    process.argv.length === 4,
    'usage: bun prove.ts FULL_REVIEWED_SHA ABSOLUTE_NEW_RECEIPT_DIRECTORY',
  );
  await preflight(sha);
  requireProof(
    isAbsolute(receipt) && !existsSync(receipt) && relative(root, receipt).startsWith('..'),
    'receipt must be a new absolute directory outside the worktree',
  );
  requireProof(existsSync(dirname(receipt)), 'receipt parent must exist');
  mkdirSync(receipt, { mode: 0o700 });
  const attempt = new Attempt(receipt);
  await finish(attempt);
  console.log(`task7 actual-image proof complete; receipt: ${receipt}`);
}

if (import.meta.main) {
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () => {
      interrupted = true;
      active?.kill('SIGTERM');
    });
  await main();
}
export { Attempt, command, faults, finish, mutate, preflight, requireProof };
