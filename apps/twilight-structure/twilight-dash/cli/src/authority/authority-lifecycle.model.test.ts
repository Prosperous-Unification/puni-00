import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, expect, test } from 'bun:test';
import fc from 'fast-check';

import {
  AuthorityOpenError,
  bootstrapAuthority,
  openAuthority,
  resolveAuthorityDatabasePath,
} from './authority-store';
import { acquireClaims } from './claims';

/**
 * Reference model for the authority's lifecycle across processes (design: "Authority lifecycle
 * concurrency model" in the dash-authority-relocation change). States: absent, present with
 * `nextGeneration` and the working sessions' write paths. Invariants checked by every command:
 *
 * - I1 one creator: while absent, exactly one bootstrap reports `bootstrapped`; every other
 *   bootstrap, concurrent or later, reports `exists`.
 * - I2 absence is refused: open, inspect and acquire on an absent store report `absent` and leave
 *   no `module-wiki` directory.
 * - I3 inspection is read-only: the database bytes are identical before and after inspect.
 * - I4 identity continuity: acquisitions receive consecutive generations from the model's
 *   `nextGeneration`; no bootstrap resets it.
 * - I5 fencing: of concurrent acquisitions on overlapping paths, at most one succeeds and the
 *   others report the overlap.
 * - I6 typed outcomes only: no `corrupt` or untyped failure appears in any run.
 */
interface Model {
  present: boolean;
  nextGeneration: number;
  readonly sessions: Map<string, string>;
}

interface Real {
  readonly root: string;
}

type Outcome =
  | { readonly kind: 'bootstrapped' }
  | { readonly kind: 'opened'; readonly nextGeneration: number; readonly sessions: number }
  | { readonly kind: 'acquired'; readonly generation: number }
  | { readonly kind: 'refused'; readonly failure: string };

const FIXED_CLOCK = { read: () => 1_000_000 };
const PATHS = ['src', 'src/a', 'src/b', 'docs'] as const;
const STORE_MODULE = pathToFileURL(join(import.meta.dir, 'authority-store.ts')).href;
const CLAIMS_MODULE = pathToFileURL(join(import.meta.dir, 'claims.ts')).href;
const scratch: string[] = [];

afterAll(() => {
  for (const path of scratch) rmSync(path, { force: true, recursive: true });
});

/** The same classification in-process and in a child: typed failure kind or exact message. */
function classify(error: unknown): Outcome {
  if (error instanceof AuthorityOpenError) return { failure: error.failure, kind: 'refused' };
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith('path claim overlaps session ')) {
    return { failure: 'overlap', kind: 'refused' };
  }
  if (message.startsWith('session already exists: ')) {
    return { failure: 'session-exists', kind: 'refused' };
  }
  return { failure: `untyped: ${message}`, kind: 'refused' };
}

function overlaps(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function modelAcquire(model: Model, session: string, path: string): Outcome {
  if (!model.present) return { failure: 'absent', kind: 'refused' };
  if (model.sessions.has(session)) return { failure: 'session-exists', kind: 'refused' };
  if ([...model.sessions.values()].some((held) => overlaps(held, path))) {
    return { failure: 'overlap', kind: 'refused' };
  }
  model.sessions.set(session, path);
  const generation = model.nextGeneration;
  model.nextGeneration += 1;
  return { generation, kind: 'acquired' };
}

function databaseDigest(root: string): string | undefined {
  const path = resolveAuthorityDatabasePath(root);
  if (!existsSync(path)) return undefined;
  return new Bun.CryptoHasher('sha256').update(readFileSync(path)).digest('hex');
}

function runBootstrap(root: string): Outcome {
  try {
    bootstrapAuthority(root, { clock: FIXED_CLOCK }).close();
    return { kind: 'bootstrapped' };
  } catch (error) {
    return classify(error);
  }
}

function runInspect(root: string): Outcome {
  try {
    const store = openAuthority(root, { clock: FIXED_CLOCK });
    try {
      const state = store.inspect();
      return {
        kind: 'opened',
        nextGeneration: state.nextGeneration,
        sessions: state.generations.length,
      };
    } finally {
      store.close();
    }
  } catch (error) {
    return classify(error);
  }
}

function runAcquire(root: string, session: string, path: string): Outcome {
  try {
    const store = openAuthority(root, { clock: FIXED_CLOCK });
    try {
      const token = acquireClaims(store, {
        conflictGroups: [],
        owner: { sessionId: session, worktreePath: root },
        paths: [{ access: 'write', path }],
      });
      return { generation: token.generation, kind: 'acquired' };
    } finally {
      store.close();
    }
  } catch (error) {
    return classify(error);
  }
}

function assertAbsentLeavesNothing(model: Model, real: Real): void {
  if (!model.present) {
    expect(
      existsSync(join(real.root, '.git', 'module-wiki')),
      'I2 absent store left a directory',
    ).toBe(false);
  }
}

class Bootstrap implements fc.AsyncCommand<Model, Real> {
  check(): boolean {
    return true;
  }

  async run(model: Model, real: Real): Promise<void> {
    const outcome = runBootstrap(real.root);
    expect(outcome, 'I1 one creator').toEqual(
      model.present ? { failure: 'exists', kind: 'refused' } : { kind: 'bootstrapped' },
    );
    model.present = true;
    await Promise.resolve();
  }

  toString(): string {
    return 'Bootstrap';
  }
}

class Inspect implements fc.AsyncCommand<Model, Real> {
  check(): boolean {
    return true;
  }

  async run(model: Model, real: Real): Promise<void> {
    const before = databaseDigest(real.root);
    const outcome = runInspect(real.root);
    expect(outcome, 'I2/I4 inspect').toEqual(
      model.present
        ? { kind: 'opened', nextGeneration: model.nextGeneration, sessions: model.sessions.size }
        : { failure: 'absent', kind: 'refused' },
    );
    expect(databaseDigest(real.root), 'I3 inspect changed the database').toBe(before);
    assertAbsentLeavesNothing(model, real);
    await Promise.resolve();
  }

  toString(): string {
    return 'Inspect';
  }
}

class Acquire implements fc.AsyncCommand<Model, Real> {
  constructor(
    readonly session: string,
    readonly path: string,
  ) {}

  check(): boolean {
    return true;
  }

  async run(model: Model, real: Real): Promise<void> {
    const outcome = runAcquire(real.root, this.session, this.path);
    expect(outcome, 'I4/I5 acquire').toEqual(modelAcquire(model, this.session, this.path));
    assertAbsentLeavesNothing(model, real);
    await Promise.resolve();
  }

  toString(): string {
    return `Acquire(${this.session}, ${this.path})`;
  }
}

const WORKER = `
const [{ AuthorityOpenError, bootstrapAuthority, openAuthority }, { acquireClaims }] =
  await Promise.all([import(process.argv[2]), import(process.argv[3])]);
const job = JSON.parse(process.argv[4]);
await Bun.write(job.ready, 'ready');
while (!(await Bun.file(job.start).exists())) Bun.sleepSync(1);
const clock = { read: () => 1_000_000 };
function classify(error) {
  if (error instanceof AuthorityOpenError) return { failure: error.failure, kind: 'refused' };
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith('path claim overlaps session ')) return { failure: 'overlap', kind: 'refused' };
  if (message.startsWith('session already exists: ')) return { failure: 'session-exists', kind: 'refused' };
  return { failure: 'untyped: ' + message, kind: 'refused' };
}
let outcome;
try {
  if (job.op === 'bootstrap') {
    bootstrapAuthority(job.root, { clock, busyDelayMilliseconds: 5 }).close();
    outcome = { kind: 'bootstrapped' };
  } else {
    const store = openAuthority(job.root, { clock, busyDelayMilliseconds: 5 });
    try {
      const token = acquireClaims(store, {
        conflictGroups: [],
        owner: { sessionId: job.session, worktreePath: job.root },
        paths: [{ access: 'write', path: job.path }],
      });
      outcome = { generation: token.generation, kind: 'acquired' };
    } finally {
      store.close();
    }
  }
} catch (error) {
  outcome = classify(error);
}
console.log(JSON.stringify(outcome));
`;

type Job =
  | { readonly op: 'bootstrap' }
  | { readonly op: 'acquire'; readonly session: string; readonly path: string };

/** Starts each job as a child, lets the scheduler order the launches, then releases them all. */
async function runConcurrently(
  real: Real,
  scheduler: fc.Scheduler,
  jobs: readonly Job[],
): Promise<Outcome[]> {
  const worker = join(real.root, '..', `${real.root.split('/').at(-1) ?? 'root'}-worker.ts`);
  if (!existsSync(worker)) writeFileSync(worker, WORKER);
  const start = join(real.root, `.start-${String(Math.random()).slice(2)}`);
  const launched = jobs.map((job, index) =>
    scheduler.schedule(Promise.resolve(index), `launch ${job.op} #${String(index)}`).then(() => {
      const ready = join(real.root, `.ready-${String(Math.random()).slice(2)}`);
      const child = Bun.spawn(
        [
          process.execPath,
          worker,
          STORE_MODULE,
          CLAIMS_MODULE,
          JSON.stringify({ ...job, ready, root: real.root, start }),
        ],
        { stderr: 'pipe', stdout: 'pipe' },
      );
      return { child, ready };
    }),
  );
  await scheduler.waitIdle();
  const children = await Promise.all(launched);
  while (!children.every(({ ready }) => existsSync(ready))) Bun.sleepSync(1);
  writeFileSync(start, 'go');
  const outcomes = await Promise.all(
    children.map(async ({ child }) => {
      const [stdout, stderr] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect(await child.exited, stderr).toBe(0);
      return JSON.parse(stdout) as Outcome;
    }),
  );
  rmSync(start, { force: true });
  for (const { ready } of children) rmSync(ready, { force: true });
  return outcomes;
}

class ConcurrentBootstraps implements fc.AsyncCommand<Model, Real> {
  constructor(
    readonly scheduler: fc.Scheduler,
    readonly count: number,
  ) {}

  check(): boolean {
    return true;
  }

  async run(model: Model, real: Real): Promise<void> {
    const outcomes = await runConcurrently(
      real,
      this.scheduler,
      Array.from({ length: this.count }, () => ({ op: 'bootstrap' }) as const),
    );
    const created = outcomes.filter((outcome) => outcome.kind === 'bootstrapped').length;
    expect(
      outcomes.filter((outcome) => outcome.kind !== 'bootstrapped'),
      'I1/I6 losers report exists',
    ).toEqual(
      Array.from({ length: this.count - created }, () => ({ failure: 'exists', kind: 'refused' })),
    );
    expect(created, 'I1 one creator').toBe(model.present ? 0 : 1);
    model.present = true;
  }

  toString(): string {
    return `ConcurrentBootstraps(${String(this.count)})`;
  }
}

class ConcurrentAcquires implements fc.AsyncCommand<Model, Real> {
  constructor(
    readonly scheduler: fc.Scheduler,
    readonly requests: readonly { readonly session: string; readonly path: string }[],
  ) {}

  check(): boolean {
    return true;
  }

  async run(model: Model, real: Real): Promise<void> {
    const outcomes = await runConcurrently(
      real,
      this.scheduler,
      this.requests.map(({ path, session }) => ({ op: 'acquire', path, session }) as const),
    );
    // Linearizable: some serial order of the requests yields exactly these outcomes.
    const winners = outcomes
      .map((outcome, index) => ({ index, outcome }))
      .filter(({ outcome }) => outcome.kind === 'acquired')
      .sort(
        (left, right) =>
          (left.outcome.kind === 'acquired' ? left.outcome.generation : 0) -
          (right.outcome.kind === 'acquired' ? right.outcome.generation : 0),
      )
      .map(({ index }) => index);
    const losers = outcomes.map((_, index) => index).filter((index) => !winners.includes(index));
    const expected: Outcome[] = [...outcomes];
    for (const index of [...winners, ...losers]) {
      const request = this.requests[index];
      expected[index] = modelAcquire(model, request.session, request.path);
    }
    expect(outcomes, 'I4/I5/I6 concurrent acquisitions linearize').toEqual(expected);
  }

  toString(): string {
    return `ConcurrentAcquires(${this.requests.map(({ path, session }) => `${session}:${path}`).join(', ')})`;
  }
}

function repository(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'dash-authority-model-')));
  scratch.push(root, `${root}-worker.ts`);
  const init = Bun.spawnSync(['git', 'init', '--quiet', root], { stderr: 'pipe' });
  if (init.exitCode !== 0) throw new Error(init.stderr.toString('utf8'));
  return root;
}

const session = fc.constantFrom('session-a', 'session-b', 'session-c', 'session-d');
const path = fc.constantFrom(...PATHS);

test('authority lifecycle matches its model across concurrent processes', async () => {
  // Proof (sabotages, each restored; every one failed this property, seed 20261012, with the
  // shrunk plan shown; `boot` is concurrent bootstraps, 2026-10-12):
  // - under-lock `exists` refusal dropped: `[Bootstrap, boot n=2, Acquire(a, src)]` I1 received
  //   `corrupt` from a loser;
  // - post-wait `exists` refusal dropped: `[boot n=2, Inspect]` I1 received
  //   `untyped: authority initialization ended without a database`;
  // - `openAuthority` creating on absence: `[Acquire(a, src)]` I2/I4 received `acquired` 1;
  // - `inspect()` rewriting rows through `transact`: `[boot n=2, Acquire(a, src), Inspect]` I3
  //   digest changed;
  // - overlap refusal removed from `acquireClaims`: `[boot n=2, Acquire(d, src), Acquire(a, src)]`
  //   I5 received `acquired` 2.
  await fc.assert(
    fc.asyncProperty(
      fc.scheduler(),
      fc.array(
        fc.oneof(
          { arbitrary: fc.constant(new Bootstrap()), weight: 2 },
          { arbitrary: fc.constant(new Inspect()), weight: 2 },
          { arbitrary: fc.tuple(session, path).map(([s, p]) => new Acquire(s, p)), weight: 3 },
          {
            arbitrary: fc.integer({ max: 3, min: 2 }).map((n) => ({ kind: 'boot' as const, n })),
            weight: 2,
          },
          {
            arbitrary: fc
              .uniqueArray(fc.tuple(session, path), {
                maxLength: 3,
                minLength: 2,
                selector: ([s]) => s,
              })
              .map((pairs) => ({ kind: 'acq' as const, pairs })),
            weight: 2,
          },
        ),
        { maxLength: 7, minLength: 1 },
      ),
      async (scheduler, plan) => {
        const commands = plan.map((step): fc.AsyncCommand<Model, Real> => {
          if (step instanceof Bootstrap || step instanceof Inspect || step instanceof Acquire) {
            return step;
          }
          return step.kind === 'boot'
            ? new ConcurrentBootstraps(scheduler, step.n)
            : new ConcurrentAcquires(
                scheduler,
                step.pairs.map(([s, p]) => ({ path: p, session: s })),
              );
        });
        const root = repository();
        await fc.asyncModelRun(
          () => ({
            model: { nextGeneration: 1, present: false, sessions: new Map<string, string>() },
            real: { root },
          }),
          commands,
        );
      },
    ),
    { numRuns: 12, seed: 20261012 },
  );
}, 300_000);
