import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterAll, expect, test } from 'bun:test';
import fc from 'fast-check';

import { fakeCredential } from '../compute/testing/credential';
import type { JobTypeDescriptor } from './host-pool';
import {
  ampleHost,
  hostPoolFixture,
  insideLinuxNamespace,
  jobType,
} from './host-pool.test.fixture';
import {
  type ContainerEvidence,
  type HostJob,
  loadResourceConfiguration,
  ResourceRuntime,
} from './runtime';

/**
 * The host pool's admission queue and settlement against a model (`dash-host-jobs` J5, J6,
 * J2', J18), with `fc.asyncModelRun`. Seven contenders, each a real waiter process (`sleep`)
 * whose identity its ticket and job record, over two ledger connections, draw arrivals of five
 * job types (a gate holding a tree, a build, a whole-pool calibration, a type with declared
 * containers, and one larger than the host), polls, preparations, launches of real payload
 * processes, payload exits, container stops, cancellations, clock advances across wait
 * budgets, the reclaim minute and the launch grace, settlement sweeps, and a crash of the
 * waiter at every boundary: holding a ticket, admitted, prepared, launched. The model is the
 * design's rule written out independently of `chooseWaiter`:
 * - an envelope beyond `allocatable`, or naming an id with no units, is refused 73;
 * - other tickets whose waiter is gone, or whose budget ended over a minute ago, are removed;
 * - past its budget, or wait-zero with a live ticket ahead, a waiter is refused 75;
 * - otherwise the oldest live waiter that fits, looking no further than the oldest waiter
 *   overtaken three times, is admitted, and every older live waiter counts one overtake;
 * - a job's reservation returns only when its payload is gone and its containers are gone,
 *   or, never launched, its waiter is gone and the launch grace has passed.
 * Invariants after every command: reservations within `allocatable`, each tree held by at
 * most one job, and no release without that terminal evidence.
 *
 * The second test races six launcher processes against one ledger file and replays the
 * ledger's event history, which carries the reservation each transaction left.
 *
 * Proof: see verify.md Slice 2 for the fault-injection table: each sabotage below was watched
 * red against these tests on 2026-11-01 and restored.
 */
if (insideLinuxNamespace(import.meta.path)) {
  const ALLOCATABLE = { cpuCores: 8, memoryGib: 13, workspaceSlots: 8 };
  const TYPES: readonly JobTypeDescriptor[] = [
    // Three gates fit every dimension but trees, so the unit check alone holds the third.
    jobType('gate', 2, 4, ['gate_tree']),
    jobType('website-dev-build', 2, 2),
    jobType('calibration', 8, 13),
    { ...jobType('solver-image-publish', 1, 1), containers: { memoryGib: 1, cpuCores: 1 } },
    jobType('oversize', 4, 14),
  ];
  const WAITS = [0, 5, 600] as const;
  const reached = {
    admitted: 0,
    barrierHeld: 0,
    severalBarriers: 0,
    barrierFormed: 0,
    overtakes: 0,
    treeBound: 0,
    calibration: 0,
    reclaimed: 0,
    budgetRefused: 0,
    waitZeroRefused: 0,
    oversize: 0,
    surviving: 0,
    neverLaunched: 0,
    launchFailed: 0,
    released: 0,
  };

  interface ModelTicket {
    ticket: string;
    contender: number;
    type: number;
    wait: number;
    deadline: number;
    overtakes: number;
    owner: ChildProcess;
  }
  interface ModelJob {
    id: string;
    type: number;
    launcher: ChildProcess;
    prepared: boolean;
    payload: ChildProcess | null;
    containersGone: boolean;
    admittedAt: number;
    released: boolean;
  }
  interface Contender {
    owner: ChildProcess;
    ticket: ModelTicket | null;
    job: ModelJob | null;
  }
  interface Model {
    now: number;
    tickets: ModelTicket[];
    jobs: ModelJob[];
    contenders: Contender[];
  }
  interface Real {
    runtimes: [ResourceRuntime, ResourceRuntime];
    processes: ChildProcess[];
    evidence: ContainerEvidence;
  }
  const isAlive = (child: ChildProcess): boolean =>
    child.exitCode === null && child.signalCode === null;

  async function kill(child: ChildProcess): Promise<void> {
    if (!isAlive(child)) return;
    const exited = once(child, 'exit');
    child.kill('SIGKILL');
    await exited;
  }
  function waiter(real: Real): ChildProcess {
    const child = spawn('sleep', ['600'], { stdio: 'ignore' });
    real.processes.push(child);
    return child;
  }
  function pid(child: ChildProcess): number {
    if (child.pid === undefined) throw new Error('process did not start');
    return child.pid;
  }
  const runtimeFor = (real: Real, contender: number): ResourceRuntime =>
    real.runtimes[contender % 2] ?? real.runtimes[0];

  /** What the model holds: compute and slots per unreleased job, trees per unreleased gate. */
  function modelReserved(model: Model) {
    const reserved = { cpuCores: 0, memoryGib: 0, workspaceSlots: 0, trees: 0 };
    for (const job of model.jobs) {
      if (job.released) continue;
      const envelope = TYPES[job.type]?.envelope;
      reserved.cpuCores += envelope.cpuCores;
      reserved.memoryGib += envelope.memoryGib;
      reserved.workspaceSlots += 1;
      reserved.trees += envelope.exclusive.length;
    }
    return reserved;
  }
  function modelFits(model: Model, type: number): boolean {
    const envelope = TYPES[type]?.envelope;
    const reserved = modelReserved(model);
    return (
      reserved.cpuCores + envelope.cpuCores <= ALLOCATABLE.cpuCores &&
      reserved.memoryGib + envelope.memoryGib <= ALLOCATABLE.memoryGib &&
      reserved.workspaceSlots + 1 <= ALLOCATABLE.workspaceSlots &&
      reserved.trees + envelope.exclusive.length <= 2
    );
  }
  /** Terminal evidence for a job's whole reservation, as the model sees it. */
  function terminal(model: Model, job: ModelJob): boolean {
    if (!job.containersGone) return false;
    if (job.payload !== null) return !isAlive(job.payload);
    return !isAlive(job.launcher) && model.now >= job.admittedAt + 60000;
  }

  function checkInvariants(model: Model, real: Real): void {
    const status = real.runtimes[0].hostPoolStatus();
    expect(status.reserved.cpuCores).toBeLessThanOrEqual(ALLOCATABLE.cpuCores);
    expect(status.reserved.memoryGib).toBeLessThanOrEqual(ALLOCATABLE.memoryGib);
    expect(status.reserved.workspaceSlots).toBeLessThanOrEqual(ALLOCATABLE.workspaceSlots);
    const holders = new Map<string, number>();
    for (const job of real.runtimes[0].listHostJobs())
      for (const unit of job.units)
        if (unit.state !== 'released') holders.set(unit.path, (holders.get(unit.path) ?? 0) + 1);
    for (const count of holders.values()) expect(count).toBeLessThanOrEqual(1);
    for (const job of real.runtimes[0].listHostJobs()) {
      if (job.compute.state !== 'released') continue;
      const modelled = model.jobs.find((candidate) => candidate.id === job.id);
      if (modelled === undefined) throw new Error('real job unknown to the model');
      expect(terminal(model, modelled)).toBe(true);
    }
  }

  type Command = fc.AsyncCommand<Model, Real>;

  /** The `index`-th contender (modulo) satisfying `eligible`, so most draws apply. */
  function pick(
    model: Readonly<Model>,
    index: number,
    eligible: (contender: Contender) => boolean,
  ): number | undefined {
    const indices = model.contenders.flatMap((contender, at) => (eligible(contender) ? [at] : []));
    return indices[index % Math.max(indices.length, 1)];
  }
  const idle = (contender: Contender): boolean =>
    contender.ticket === null && contender.job === null;
  const ticketed = (contender: Contender): boolean => contender.ticket !== null;
  const unprepared = (contender: Contender): boolean =>
    contender.job !== null && !contender.job.prepared;
  const unlaunched = (contender: Contender): boolean =>
    contender.job !== null && contender.job.prepared && contender.job.payload === null;
  const busy = (contender: Contender): boolean =>
    contender.ticket !== null || contender.job !== null;

  /** A command acting on one contender chosen among those `eligible` when it runs. */
  abstract class ContenderCommand implements Command {
    abstract readonly name: string;
    abstract eligible(contender: Contender): boolean;
    constructor(readonly index: number) {}
    protected chosen(model: Readonly<Model>): number {
      const at = pick(model, this.index, (contender) => this.eligible(contender));
      if (at === undefined) throw new Error('model drift');
      return at;
    }
    check(model: Readonly<Model>): boolean {
      return pick(model, this.index, (contender) => this.eligible(contender)) !== undefined;
    }
    abstract run(model: Model, real: Real): Promise<void>;
    toString(): string {
      return `${this.name}(${String(this.index)})`;
    }
  }

  class Arrive extends ContenderCommand {
    readonly name = 'Arrive';
    constructor(
      index: number,
      readonly type: number,
      readonly wait: number,
    ) {
      super(index);
    }
    eligible(contender: Contender): boolean {
      return idle(contender);
    }
    run(model: Model, real: Real): Promise<void> {
      const at = this.chosen(model);
      const contender = model.contenders[at];
      const descriptor = TYPES[this.type];
      const outcome = runtimeFor(real, at).enqueueHostJob(
        { descriptor, label: `c${String(at)}`, waitSeconds: this.wait },
        pid(contender.owner),
      );
      if (descriptor.id === 'oversize') {
        reached.oversize += 1;
        expect(outcome.kind).toBe('refused');
      } else {
        if (outcome.kind !== 'queued') throw new Error(`unexpected refusal: ${outcome.reason}`);
        contender.ticket = {
          ticket: outcome.ticket,
          contender: at,
          type: this.type,
          wait: this.wait,
          deadline: model.now + this.wait * 1000,
          overtakes: 0,
          owner: contender.owner,
        };
        model.tickets.push(contender.ticket);
      }
      checkInvariants(model, real);
      return Promise.resolve();
    }
    override toString(): string {
      return `Arrive(${String(this.index)}, ${TYPES[this.type]?.id ?? '?'}, ${String(this.wait)})`;
    }
  }

  class Poll extends ContenderCommand {
    readonly name = 'Poll';
    eligible(contender: Contender): boolean {
      return ticketed(contender);
    }
    run(model: Model, real: Real): Promise<void> {
      const at = this.chosen(model);
      const contender = model.contenders[at];
      const mine = contender.ticket;
      if (mine === null) throw new Error('model drift');
      const before = model.tickets.length;
      model.tickets = model.tickets.filter(
        (ticket) =>
          ticket === mine || (isAlive(ticket.owner) && model.now - ticket.deadline <= 60000),
      );
      reached.reclaimed += before - model.tickets.length;
      const live = model.tickets.filter(
        (ticket) => ticket === mine || model.now <= ticket.deadline,
      );
      const ahead = live.slice(0, live.indexOf(mine));
      const barrier = live.findIndex((ticket) => ticket.overtakes >= 3);
      if (live.filter((ticket) => ticket.overtakes >= 3).length > 1) reached.severalBarriers += 1;
      const candidates = barrier < 0 ? live : live.slice(0, barrier + 1);
      let expected: 'admitted' | 'waiting' | 'refused';
      if (mine.wait > 0 && model.now > mine.deadline) {
        expected = 'refused';
        reached.budgetRefused += 1;
      } else if (mine.wait === 0 && ahead.length > 0) {
        expected = 'refused';
        reached.waitZeroRefused += 1;
      } else {
        const chosen = candidates.find((ticket) => modelFits(model, ticket.type));
        const envelope = TYPES[mine.type]?.envelope;
        const held = modelReserved(model);
        if (
          envelope.exclusive.length > 0 &&
          held.trees >= 2 &&
          held.cpuCores + envelope.cpuCores <= ALLOCATABLE.cpuCores &&
          held.memoryGib + envelope.memoryGib <= ALLOCATABLE.memoryGib
        )
          reached.treeBound += 1;
        if (chosen === mine) expected = 'admitted';
        else expected = model.now >= mine.deadline ? 'refused' : 'waiting';
        if (barrier >= 0 && barrier < live.indexOf(mine) && modelFits(model, mine.type))
          reached.barrierHeld += 1;
      }
      const outcome = runtimeFor(real, at).pollHostJob(mine.ticket, () => undefined);
      expect(outcome.kind).toBe(expected);
      if (outcome.kind !== 'waiting') {
        model.tickets = model.tickets.filter((ticket) => ticket !== mine);
        contender.ticket = null;
      }
      if (outcome.kind === 'admitted') {
        reached.admitted += 1;
        if (TYPES[mine.type]?.id === 'calibration') reached.calibration += 1;
        for (const older of ahead) {
          older.overtakes += 1;
          if (older.overtakes === 3) reached.barrierFormed += 1;
        }
        reached.overtakes += ahead.length;
        contender.job = {
          id: outcome.job.id,
          type: mine.type,
          launcher: contender.owner,
          prepared: false,
          payload: null,
          containersGone: TYPES[mine.type]?.containers === 'none',
          admittedAt: model.now,
          released: false,
        };
        model.jobs.push(contender.job);
      }
      checkInvariants(model, real);
      return Promise.resolve();
    }
  }

  class Cancel extends ContenderCommand {
    readonly name = 'Cancel';
    eligible(contender: Contender): boolean {
      return ticketed(contender);
    }
    run(model: Model, real: Real): Promise<void> {
      const at = this.chosen(model);
      const contender = model.contenders[at];
      const mine = contender.ticket;
      if (mine === null) throw new Error('model drift');
      runtimeFor(real, at).withdrawHostJob(mine.ticket);
      model.tickets = model.tickets.filter((ticket) => ticket !== mine);
      contender.ticket = null;
      checkInvariants(model, real);
      return Promise.resolve();
    }
  }

  class Prepare extends ContenderCommand {
    readonly name = 'Prepare';
    eligible(contender: Contender): boolean {
      return unprepared(contender);
    }
    run(model: Model, real: Real): Promise<void> {
      const at = this.chosen(model);
      const job = model.contenders[at]?.job;
      if (job == null) throw new Error('model drift');
      runtimeFor(real, at).prepareHostJob(job.id);
      job.prepared = true;
      checkInvariants(model, real);
      return Promise.resolve();
    }
  }

  class Launch extends ContenderCommand {
    readonly name = 'Launch';
    eligible(contender: Contender): boolean {
      return unlaunched(contender);
    }
    run(model: Model, real: Real): Promise<void> {
      const at = this.chosen(model);
      const job = model.contenders[at]?.job;
      if (job == null) throw new Error('model drift');
      const payload = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' });
      real.processes.push(payload);
      runtimeFor(real, at).recordHostJobLaunch(job.id, pid(payload));
      job.payload = payload;
      checkInvariants(model, real);
      return Promise.resolve();
    }
  }

  /** The payload of the n-th still-running launched job exits; its launcher is then free. */
  class PayloadExit implements Command {
    constructor(readonly index: number) {}
    private target(model: Readonly<Model>): ModelJob | undefined {
      const running = model.jobs.filter((job) => job.payload !== null && isAlive(job.payload));
      return running[this.index % Math.max(running.length, 1)];
    }
    check(model: Readonly<Model>): boolean {
      return this.target(model) !== undefined;
    }
    async run(model: Model, real: Real): Promise<void> {
      const job = this.target(model);
      if (job?.payload == null) throw new Error('model drift');
      await kill(job.payload);
      for (const contender of model.contenders) if (contender.job === job) contender.job = null;
      checkInvariants(model, real);
    }
    toString(): string {
      return `PayloadExit(${String(this.index)})`;
    }
  }

  /**
   * The n-th still-running launched job is refused at its gate (slice 3 review R4): the launch
   * failure is recorded, a payload exit is refused afterwards, and the gated leader ends without
   * running anything, so settlement treats it as an exited job.
   */
  class LaunchFailure implements Command {
    constructor(readonly index: number) {}
    private target(model: Readonly<Model>): ModelJob | undefined {
      const running = model.jobs.filter((job) => job.payload !== null && isAlive(job.payload));
      return running[this.index % Math.max(running.length, 1)];
    }
    check(model: Readonly<Model>): boolean {
      return this.target(model) !== undefined;
    }
    async run(model: Model, real: Real): Promise<void> {
      const job = this.target(model);
      if (job?.payload == null) throw new Error('model drift');
      const runtime = runtimeFor(real, this.index);
      runtime.recordHostJobLaunchFailure(job.id, 'payload did not run: refused at the gate');
      expect(() => runtime.recordHostJobExit(job.id, 1)).toThrow(
        'host job has no running payload to record',
      );
      expect(runtime.inspectHostJob(job.id).exitCode).toBeNull();
      reached.launchFailed += 1;
      await kill(job.payload);
      for (const contender of model.contenders) if (contender.job === job) contender.job = null;
      checkInvariants(model, real);
    }
    toString(): string {
      return `LaunchFailure(${String(this.index)})`;
    }
  }

  class ContainersStop implements Command {
    constructor(readonly index: number) {}
    private target(model: Readonly<Model>): ModelJob | undefined {
      const bounded = model.jobs.filter((job) => !job.containersGone);
      return bounded[this.index % Math.max(bounded.length, 1)];
    }
    check(model: Readonly<Model>): boolean {
      return this.target(model) !== undefined;
    }
    run(model: Model, real: Real): Promise<void> {
      const job = this.target(model);
      if (job === undefined) throw new Error('model drift');
      job.containersGone = true;
      checkInvariants(model, real);
      return Promise.resolve();
    }
    toString(): string {
      return `ContainersStop(${String(this.index)})`;
    }
  }

  /** The contender's waiter dies wherever it is; a fresh waiter process replaces it. */
  class Crash extends ContenderCommand {
    readonly name = 'Crash';
    eligible(contender: Contender): boolean {
      return busy(contender);
    }
    async run(model: Model, real: Real): Promise<void> {
      const contender = model.contenders[this.chosen(model)];
      if (contender.job?.payload != null && isAlive(contender.job.payload)) reached.surviving += 1;
      if (contender.job?.payload === null) reached.neverLaunched += 1;
      await kill(contender.owner);
      contender.owner = waiter(real);
      contender.ticket = null;
      contender.job = null;
      checkInvariants(model, real);
    }
  }

  class Advance implements Command {
    constructor(readonly milliseconds: number) {}
    check(): boolean {
      return true;
    }
    run(model: Model, real: Real): Promise<void> {
      model.now += this.milliseconds;
      checkInvariants(model, real);
      return Promise.resolve();
    }
    toString(): string {
      return `Advance(${String(this.milliseconds)})`;
    }
  }

  class Settle implements Command {
    check(): boolean {
      return true;
    }
    run(model: Model, real: Real): Promise<void> {
      for (const job of model.jobs) {
        if (job.released) continue;
        const settled = real.runtimes[0].settleHostJob(job.id, real.evidence);
        const done = terminal(model, job);
        const expected = done
          ? 'released'
          : !isAlive(job.launcher)
            ? 'unknown'
            : job.payload === null
              ? 'starting'
              : 'held';
        expect(`${job.id} ${settled.state}`).toBe(`${job.id} ${expected}`);
        if (done) {
          job.released = true;
          reached.released += 1;
        }
      }
      checkInvariants(model, real);
      return Promise.resolve();
    }
    toString(): string {
      return 'Settle';
    }
  }

  const index = fc.nat({ max: 6 });
  const commands = [
    fc
      .tuple(index, fc.nat({ max: 9 }), fc.constantFrom(...WAITS))
      .map(
        ([who, draw, wait]) =>
          new Arrive(who, draw < 4 ? 0 : draw < 8 ? 1 : draw === 8 ? 2 + (wait % 2) : 4, wait),
      ),
    index.map((who) => new Arrive(who, 1, 600)),
    index.map((who) => new Arrive(who, 2, 600)),
    // Long-waiting gates and calibrations, and frequent polls, build barriers at random.
    index.map((who) => new Arrive(who, 0, 600)),
    index.map((who) => new Arrive(who, 0, 600)),
    index.map((who) => new Arrive(who, 1, 600)),
    index.map((who) => new Poll(who)),
    index.map((who) => new Poll(who)),
    index.map((who) => new Poll(who)),
    index.map((who) => new Poll(who)),
    index.map((who) => new Poll(who)),
    index.map((who) => new Cancel(who)),
    index.map((who) => new Prepare(who)),
    index.map((who) => new Launch(who)),
    index.map((index_) => new PayloadExit(index_)),
    index.map((index_) => new LaunchFailure(index_)),
    index.map((index_) => new ContainersStop(index_)),
    index.map((who) => new Crash(who)),
    fc.constantFrom(1000, 6000, 61000).map((milliseconds) => new Advance(milliseconds)),
    fc.constant(new Settle()),
  ];

  // Half the random runs start with a build held, a calibration waiting behind it and two
  // builds past it, so one more random admission makes it a barrier: random draws then build
  // and test barriers too, not only the examples.
  const barrierSeed = (): Command[] => [
    new Arrive(0, 1, 600),
    new Poll(0),
    new Arrive(0, 2, 600),
    new Poll(0),
    new Arrive(0, 1, 600),
    new Poll(1),
    new Arrive(0, 1, 600),
    new Poll(1),
  ];
  const drawRun = fc
    .tuple(fc.boolean(), fc.commands(commands, { maxCommands: 80, size: 'max' }))
    .map(([seeded, tail]): Iterable<Command> => (seeded ? [...barrierSeed(), ...tail] : tail));

  test('the admission queue and settlement follow the model under every interleaving', async () => {
    await fc.assert(
      fc.asyncProperty(drawRun, async (drawn) => {
        const fixture = hostPoolFixture({
          cpuCores: 8,
          memoryGib: 15,
          headroom: { cpuCores: 0, memoryGib: 2 },
          gateTrees: 2,
          workspaceSlots: 8,
          credential: fakeCredential(),
        });
        const model: Model = { now: 1800000000000, tickets: [], jobs: [], contenders: [] };
        const clock = { read: () => model.now };
        const first = ResourceRuntime.initialize(
          loadResourceConfiguration(fixture.config),
          clock,
          ampleHost,
        );
        const second = ResourceRuntime.open(loadResourceConfiguration(fixture.config), clock);
        const real: Real = {
          runtimes: [first, second],
          processes: [],
          evidence: {
            containersGone: (job: HostJob) => {
              const modelled = model.jobs.find((candidate) => candidate.id === job.id);
              if (modelled === undefined) throw new Error('container evidence for an unknown job');
              return modelled.containersGone;
            },
          },
        };
        model.contenders = Array.from({ length: 7 }, () => ({
          owner: waiter(real),
          ticket: null,
          job: null,
        }));
        try {
          await fc.asyncModelRun(() => ({ model, real }), drawn);
        } finally {
          await Promise.all(real.processes.map((child) => kill(child)));
          first.close();
          second.close();
          fixture.remove();
        }
      }),
      {
        numRuns: 60,
        // Two calibrations overtaken three times each: the oldest barrier holds a fitting build
        // and then the younger barrier, and admits first (the walk is in verify.md Slice 2).
        examples: [
          [
            [
              new Arrive(0, 1, 600),
              new Poll(0),
              new Arrive(0, 2, 600),
              new Poll(0),
              new Arrive(0, 2, 600),
              new Poll(1),
              new Arrive(0, 1, 600),
              new Poll(2),
              new Arrive(0, 1, 600),
              new Poll(2),
              new Prepare(0),
              new Launch(0),
              new PayloadExit(0),
              new Arrive(0, 1, 600),
              new Poll(0),
              new Prepare(0),
              new Launch(0),
              new LaunchFailure(0),
              new Settle(),
              new Arrive(0, 1, 600),
              new Poll(0),
              new Poll(1),
              new Prepare(0),
              new Launch(0),
              new Prepare(0),
              new Launch(0),
              new PayloadExit(0),
              new PayloadExit(0),
              new Settle(),
              new Poll(2),
              new Poll(1),
            ],
          ],
          // Every refusal, a reclaim, a crash with a surviving payload and one before launch.
          [
            [
              new Arrive(0, 4, 600),
              new Arrive(0, 2, 600),
              new Poll(0),
              new Arrive(0, 1, 600),
              new Poll(0),
              new Arrive(0, 1, 0),
              new Poll(1),
              new Arrive(0, 1, 5),
              new Poll(1),
              new Advance(6000),
              new Poll(1),
              new Crash(1),
              new Arrive(0, 1, 600),
              new Poll(0),
              new Prepare(0),
              new Launch(0),
              new Crash(0),
              new Settle(),
              new PayloadExit(0),
              new Settle(),
              new Poll(0),
              new Crash(0),
              new Settle(),
              new Advance(61000),
              new Settle(),
            ],
          ],
          // A third gate finds both trees held while cores and memory would fit.
          [
            [
              new Arrive(0, 0, 600),
              new Poll(0),
              new Arrive(0, 0, 600),
              new Poll(0),
              new Arrive(0, 0, 600),
              new Poll(0),
              new Settle(),
            ],
          ],
        ],
      },
    );
    // The draw reached every behaviour the model claims to cover.
    // The three examples form two barriers; random runs must form more.
    expect(reached.barrierFormed).toBeGreaterThan(2);
    for (const [name, count] of Object.entries(reached))
      expect(`${name} ${String(count > 0)}`).toBe(`${name} true`);
  }, 120000);

  test('launcher processes racing one ledger file never overcommit', async () => {
    const fixture = hostPoolFixture({
      cpuCores: 3,
      memoryGib: 4,
      headroom: { cpuCores: 0, memoryGib: 1 },
      gateTrees: 1,
      credential: fakeCredential(),
    });
    try {
      ResourceRuntime.initialize(
        loadResourceConfiguration(fixture.config),
        { read: () => 1 },
        ampleHost,
      ).close();
      const go = join(fixture.base, 'go');
      const release = join(fixture.base, 'release');
      const launchers = Array.from({ length: 6 }, (_, index) =>
        Bun.spawn(
          [
            process.execPath,
            join(import.meta.dir, 'host-job-launcher.test.fixture.ts'),
            'race',
            fixture.config,
            JSON.stringify(
              index % 2 === 0 ? jobType('gate', 1, 1, ['gate_tree']) : jobType('build', 1, 1),
            ),
            go,
            '6',
            release,
          ],
          { stdout: 'pipe', stderr: 'pipe' },
        ),
      );
      await Bun.sleep(300);
      writeFileSync(go, 'go');
      // Each launcher holds its first admission until `release`: with 3 cores and six 1-core
      // jobs, three are admitted and held together while three wait, whatever the timing.
      // Proof: without this barrier the launchers did not collide in time on CI's 4-vCPU runner
      // and `peak` was 2 (puni-00 run 41332780726, 2026-11-01).
      const observer = ResourceRuntime.open(loadResourceConfiguration(fixture.config), {
        read: () => 1,
      });
      let full = observer.hostPoolStatus();
      try {
        for (
          let attempt = 0;
          attempt < 3000 && !(full.reserved.cpuCores === 3 && full.waiters.length === 3);
          attempt++
        ) {
          await Bun.sleep(10);
          full = observer.hostPoolStatus();
        }
      } finally {
        observer.close();
      }
      expect({ reserved: full.reserved.cpuCores, waiting: full.waiters.length }).toEqual({
        reserved: 3,
        waiting: 3,
      });
      writeFileSync(release, 'release');
      const outputs = await Promise.all(
        launchers.map(async (launcher) => ({
          code: await launcher.exited,
          stdout: await new Response(launcher.stdout).text(),
          stderr: await new Response(launcher.stderr).text(),
        })),
      );
      for (const output of outputs)
        expect(`${String(output.code)} ${output.stdout} ${output.stderr}`).toBe('0 done\n ');
      const db = new Database(join(fixture.root, '.dash', 'resources.sqlite'), { readonly: true });
      const events = db
        .query<{ event: string }, []>('SELECT event FROM host_job_events ORDER BY sequence')
        .all()
        .map(
          (row) =>
            JSON.parse(row.event) as {
              jobId: string;
              kind: string;
              reserved: { cpuCores: number; memoryGib: number };
              units: { state: string }[];
            },
        );
      db.close();
      expect(events.filter((event) => event.kind === 'admitted')).toHaveLength(36);
      const treeHolders = new Set<string>();
      let peak = 0;
      for (const event of events) {
        expect(event.reserved.cpuCores).toBeLessThanOrEqual(3);
        expect(event.reserved.memoryGib).toBeLessThanOrEqual(3);
        peak = Math.max(peak, event.reserved.cpuCores);
        if (event.units.some((unit) => unit.state !== 'released')) treeHolders.add(event.jobId);
        else treeHolders.delete(event.jobId);
        expect(treeHolders.size).toBeLessThanOrEqual(1);
      }
      // The pool was full at some instant, as the release barrier guarantees.
      expect(peak).toBe(3);
    } finally {
      fixture.remove();
    }
  }, 120000);

  afterAll(() => {
    process.stderr.write(`host-jobs model reached ${JSON.stringify(reached)}\n`);
  });
}
