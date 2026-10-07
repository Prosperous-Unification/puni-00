import {
  dispositionOfExitCode,
  dispositionOfPreflightFailure,
} from '@wbs/contracts/solver/solver-failure-disposition';
import type { CommittedProjectEvent } from '@wbs/core/service/committed-fanout';
import type { Schedule, SolverObjectiveName } from '@wbs/domain';
import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';

import {
  evaluateSolverOutcome,
  type SolverProcessOutcome,
} from '../../service/solver-exit-outcome';
import { buildSolverRequestPair, type SolverRequestPair } from '../../service/solver-request-pair';
import type {
  OptimizationOutcomeWrite,
  OptimizationRepository,
  ReservedSolverChild,
  ReservedSpawner,
  ReservedSpawnRequest,
  ScheduleInputHasher,
} from './contract';
import {
  applyVariantLiveness,
  type OptimizationVariantState,
  type OptimizedScheduleReader,
} from './optimized-schedule-reader';
import {
  runSolverChildLifecycle,
  type SolverChildLifecycleOptions,
  type SolverChildLifecycleResult,
} from './solver-child-lifecycle';

export interface OptimizationCoordinatorOptions {
  readonly repository: OptimizationRepository;
  readonly contractVersion: string;
  readonly solverVersion: string;
  readonly budgetMs: number;
  /** Stable for this backend process; generated once at coordinator boot. */
  readonly ownerId: string;
  /** Read once per plan-read admission attempt. */
  readonly now: () => number;
  /** Fresh 128-bit token source; the production root supplies `randomUUID`. */
  readonly attemptToken: () => string;
  /** Rebuild the current canonical input for a durable queue entry after restart. */
  readonly inputOf: (projectId: string) => Promise<ScheduleInput | null>;
  /** Whether an edit-triggered read may spend solver capacity for this project. */
  readonly enabledOf: (projectId: string) => Promise<boolean>;
  /** One project-owned observation of shared input and enablement, closed before admission. */
  readonly captureOf?: (projectId: string) => Promise<
    | { readonly kind: 'scheduled'; readonly input: ScheduleInput; readonly enabled: boolean }
    | { readonly kind: 'not_found' }
    | {
        readonly kind: 'unavailable';
        readonly reason: 'engine_unavailable' | 'cycle' | 'calendar_range';
      }
  >;
  /** The cache-key port: the composition root supplies SQLite's SHA-256 of the canonical input. */
  readonly hashInput: ScheduleInputHasher;
  /**
   * The launcher boundary, called only after SQLite returned this attempt's
   * counted `starting` row. Slice 6.2b binds that row to the launcher PID.
   */
  readonly spawn: ReservedSpawner;
  readonly runChild?: (options: SolverChildLifecycleOptions) => Promise<SolverChildLifecycleResult>;
  readonly onChildError: (error: unknown) => void;
  readonly deliverCommitted: (events: readonly CommittedProjectEvent[]) => Promise<void>;
  readonly editDebounceMs?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly setInterval?: (callback: () => void, milliseconds: number) => unknown;
  readonly clearInterval?: (handle: unknown) => void;
}

/** A manual Retry decision, including current scoped-authority refusals. */
export type OptimizationRetryResult =
  | { readonly kind: 'forbidden' | 'not_found' }
  | { readonly kind: 'stale-input-hash'; readonly currentInputHash: string }
  | { readonly kind: 'not-retryable'; readonly state: OptimizationVariantState['state'] }
  | { readonly kind: 'already-running' }
  | {
      readonly kind: 'accepted';
      readonly state: 'retrying';
      readonly generation: number;
      readonly inputHash: string;
    };

export const OPTIMIZATION_EDIT_DEBOUNCE_MS = 250;
export const OPTIMIZATION_RECONCILE_INTERVAL_MS = 60_000;

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * The plan-read half of the optimizer coordinator (tasks.md 6.1).
 *
 * A cache hit returns after its source observation. A miss returns after
 * requesting admission for each absent objective; the child never sits on the
 * request path. Exact-key `failed` and `corrupt` rows remain terminal until an
 * explicit Retry because the repository pair read admits only misses.
 */
export class OptimizationCoordinator {
  private readonly inFlight = new Set<Promise<void>>();
  private pumpInFlight: Promise<void> | undefined;
  private pumpRequested = false;
  private readonly editEpoch = new Map<string, number>();
  private reconcileHandle: unknown = null;
  private reconcileInFlight: Promise<void> | undefined;
  private reconcileRequested = false;

  /** Register postcommit delivery before consuming any admission outcome. */
  private trackCommittedDelivery(envelopes: readonly CommittedProjectEvent[]): void {
    // Proof: omitting this guard called delivery four times for the real
    // adapter's empty envelopes instead of zero in the mounted read test.
    if (envelopes.length === 0) return;
    const tracked = Promise.resolve()
      // Proof: invoking delivery synchronously let a thrown transport error
      // replace an already committed accepted Retry decision. The outcome
      // invocation fault likewise replaced a durable preflight decision.
      .then(() => this.options.deliverCommitted(envelopes))
      .catch((error: unknown) => {
        // Proof: swallowing this error left the held/rejected Retry test's
        // error sink empty even though its durable event remained replayable.
        // Rethrowing it also made installed FIFO stop reject after B's
        // committed event and C's exact token had already persisted. The
        // outcome rejection fault failed after its durable event and slot release.
        this.options.onChildError(error);
      })
      .finally(() => this.inFlight.delete(tracked));
    // Proof: omitting tracking let stop settle while an empty-dequeue
    // envelope's postcommit transport promise was still held. The installed
    // FIFO test independently finished C's child while B's push stayed held;
    // omitting this registration then let stop settle early. The outcome
    // tracking omission also let stop settle during held outcome transport.
    this.inFlight.add(tracked);
  }

  constructor(private readonly options: OptimizationCoordinatorOptions) {}

  /** Await children already launched by this coordinator; used by shutdown and deterministic tests. */
  async drain(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.all([...this.inFlight]);
  }

  /** Start restart reconciliation after the composition root has wired the input reader. */
  start(): void {
    if (this.reconcileHandle !== null) return;
    // Proof: omitting this startup trigger left populated pending A in place
    // and lost B's event after an installed restart reconciliation.
    this.requestReconcile();
    const handle = (this.options.setInterval ?? setInterval)(() => {
      // Proof: omitting this interval trigger kept pending A after the
      // mounted periodic callback and lost B's durable recipient event.
      this.requestReconcile();
      this.requestPump();
    }, OPTIMIZATION_RECONCILE_INTERVAL_MS);
    (handle as { unref?: () => void }).unref?.();
    this.reconcileHandle = handle;
    this.requestPump();
  }

  /** Whether restart reconciliation is scheduled for this process. */
  isRunning(): boolean {
    return this.reconcileHandle !== null;
  }

  /** Stop periodic reconciliation, then await attempts already owned by this process. */
  async stop(): Promise<void> {
    if (this.reconcileHandle !== null) {
      (this.options.clearInterval ?? clearInterval)(
        this.reconcileHandle as ReturnType<typeof setInterval>,
      );
      this.reconcileHandle = null;
    }
    // Proof: omitting this await let stop settle while a held reconciliation
    // still owned the drain decision (coordinator stop-drain omission test).
    // Proof: omitting this await settled installed stop while the source
    // reconciliation still owned a held borrowed capture.
    await this.drain();
  }

  private requestReconcile(): void {
    // Proof: bypassing this guard let two timer ticks run concurrently with
    // a held source reconciliation instead of one coalesced follow-up.
    // Proof: bypassing this guard made two held timer ticks schedule two
    // additional reconciliations instead of one coalesced follow-up.
    if (this.reconcileInFlight !== undefined) {
      this.reconcileRequested = true;
      return;
    }
    this.reconcileRequested = false;
    const tracked = Promise.resolve()
      // Proof: dropping the returned reconciliation promise settled the
      // tracked work before its held source decision (reconcile omission test).
      .then(() => this.options.repository.reconcileDrains(this.options.now()))
      .then(() => undefined)
      .catch((error: unknown) => {
        this.options.onChildError(error);
      })
      .finally(() => {
        this.inFlight.delete(tracked);
        this.reconcileInFlight = undefined;
        if (this.reconcileRequested) this.requestReconcile();
      });
    this.reconcileInFlight = tracked;
    this.inFlight.add(tracked);
  }

  /** Coalesce project events, then admit both absent variants for the newest input. */
  inputChanged(projectId: string): void {
    const epoch = (this.editEpoch.get(projectId) ?? 0) + 1;
    this.editEpoch.set(projectId, epoch);
    const tracked = this.optimizeAfterEdit(projectId, epoch)
      .catch((error: unknown) => {
        this.options.onChildError(error);
      })
      .finally(() => this.inFlight.delete(tracked));
    this.inFlight.add(tracked);
  }

  private async optimizeAfterEdit(projectId: string, epoch: number): Promise<void> {
    await (this.options.sleep ?? sleep)(
      this.options.editDebounceMs ?? OPTIMIZATION_EDIT_DEBOUNCE_MS,
    );
    if (this.editEpoch.get(projectId) !== epoch) return;
    this.editEpoch.delete(projectId);
    if (this.options.captureOf !== undefined) {
      const captured = await this.options.captureOf(projectId);
      if (captured.kind !== 'scheduled' || !captured.enabled) return;
      // Proof: the mounted upstream-only edit test failed with no elsewhere
      // when this branch fell through to the local input reader.
      await this.readPlan({ projectId, objective: 'pri', input: captured.input, enabled: true });
      return;
    }
    if (!(await this.options.enabledOf(projectId))) return;
    const input = await this.options.inputOf(projectId);
    if (input === null) return;
    const enabled = await this.options.enabledOf(projectId);
    if (!enabled) return;
    await this.readPlan({ projectId, objective: 'pri', input, enabled });
  }

  private slotOf(request: ReservedSpawnRequest) {
    return {
      projectId: request.key.projectId,
      contractVersion: request.key.contractVersion,
      generation: request.generation,
      objective: request.objective,
      budgetMs: request.key.budgetMs,
      attemptToken: request.admission.attemptToken,
      admittedCancelEpoch: request.admission.admittedCancelEpoch,
    };
  }

  private async storeInternalFailure(request: ReservedSpawnRequest): Promise<void> {
    await this.storeOutcome({
      claim: { ...this.slotOf(request), ownerId: this.options.ownerId },
      inputHash: request.key.inputHash,
      admittedCancelEpoch: request.admission.admittedCancelEpoch,
      outcome: { kind: 'failed', reason: 'internal-error' },
      now: this.outcomeTimestamp(request),
    });
  }

  /** Never stamp a Retry replacement before the slot that authorized it. */
  private outcomeTimestamp(request: ReservedSpawnRequest): number {
    return Math.max(this.options.now(), request.admission.startedAt);
  }

  private async storeOutcome(
    write: OptimizationOutcomeWrite,
  ): Promise<'stored' | 'superseded' | 'already-recorded'> {
    const committed = await this.options.repository.recordOutcome(write);
    const { decision, envelopes } = committed;
    if (decision.kind === 'stored') {
      // Proof: dropping downstream envelopes left the terminal outcome's
      // recipient row absent from its delivered batch after exact-slot release.
      // Awaiting delivery here instead retained the exact slot while transport held.
      this.trackCommittedDelivery([
        { projectId: decision.event.projectId, event: decision.event, recorded: decision.recorded },
        ...envelopes,
      ]);
    }
    return decision.kind;
  }

  /**
   * The exit code is read through `dispositionOfExitCode` rather than collapsed
   * onto `internal-error`, because a later-stage `INFEASIBLE` leaves the solver
   * by exactly this path — non-zero, nothing on stdout — and spec.md requires
   * that run to be recorded `invalid-output`. Kill evidence still wins over the
   * code: a killed child's exit status is the signal's, not the entrypoint's.
   */
  private async processOutcome(
    child: ReservedSolverChild,
    exit: { readonly code: number; readonly stdout: string },
  ): Promise<SolverProcessOutcome> {
    if (child.terminal === undefined) {
      return exit.code === 0
        ? { kind: 'response', stdout: exit.stdout }
        : { kind: 'failed', reason: dispositionOfExitCode(exit.code) };
    }
    const terminal = await child.terminal;
    if (terminal.deadlineKilled) return { kind: 'failed', reason: 'timeout' };
    if (terminal.oomKilled) return { kind: 'failed', reason: 'oom' };
    return terminal.exitCode === 0
      ? { kind: 'response', stdout: exit.stdout }
      : { kind: 'failed', reason: dispositionOfExitCode(terminal.exitCode) };
  }

  private async runReserved(request: ReservedSpawnRequest): Promise<void> {
    const slot = this.slotOf(request);
    let child: ReservedSolverChild;
    try {
      child = await this.options.spawn(request);
    } catch (error) {
      // Without host terminal evidence, a process may still exist. Preserve
      // the counted seat until its admitted deadline rather than overbook.
      await this.storeInternalFailure(request);
      throw error;
    }

    // Proof: omitting this await sent bound verdicts while PID binding was
    // held and both durable seats remained starting in the coordinator test.
    const bound = await this.options.repository.bindSlot({
      ...slot,
      pid: child.pid,
    });
    if (!bound) {
      await child.verdict('abort');
      await child.exited;
      return;
    }

    try {
      await child.verdict('bound');
    } catch (error) {
      try {
        await child.kill();
      } catch {
        // The first transport failure is the useful error. Either way there is
        // no terminal evidence, so the reservation remains counted.
      }
      await this.storeInternalFailure(request);
      throw error;
    }

    const execute = this.options.runChild ?? runSolverChildLifecycle;
    try {
      await execute({
        slots: this.options.repository,
        slot,
        child,
        now: this.options.now,
        onExit: async (exit) => {
          const outcome = await this.processOutcome(child, exit);
          // Proof: dropping this await released the terminal child's seat
          // before its held outcome reached durable cache.
          await this.storeOutcome({
            claim: { ...slot, ownerId: this.options.ownerId },
            inputHash: request.key.inputHash,
            admittedCancelEpoch: request.admission.admittedCancelEpoch,
            outcome: evaluateSolverOutcome(request.input, request.request, outcome),
            now: this.outcomeTimestamp(request),
          });
        },
      });
    } catch (error) {
      // The lifecycle releases only after a proved terminal or cancellation.
      // A rejected terminal/EOF therefore leaves this exact slot present.
      await this.storeInternalFailure(request);
      throw error;
    }
  }

  private startReserved(request: ReservedSpawnRequest): void {
    const tracked = this.runReserved(request)
      .catch((error: unknown) => {
        this.options.onChildError(error);
      })
      .finally(() => {
        this.inFlight.delete(tracked);
        this.requestPump();
      });
    this.inFlight.add(tracked);
  }

  private requestPump(): void {
    if (this.pumpInFlight !== undefined) {
      this.pumpRequested = true;
      return;
    }
    this.pumpRequested = false;
    const tracked = this.pumpQueue()
      .catch((error: unknown) => {
        this.options.onChildError(error);
      })
      .finally(() => {
        this.inFlight.delete(tracked);
        this.pumpInFlight = undefined;
        if (this.pumpRequested) this.requestPump();
      });
    this.pumpInFlight = tracked;
    this.inFlight.add(tracked);
  }

  private async pumpQueue(): Promise<void> {
    for (;;) {
      // Proof: omitting this await advanced a held dequeue to its launch
      // decision and let stop settle before the durable queue changed.
      const committed = await this.options.repository.dequeueRequest({
        ownerId: this.options.ownerId,
        attemptToken: this.options.attemptToken(),
        now: this.options.now(),
      });
      // Proof: omitting this registration lost an empty-dequeue commit's
      // test-injected durable envelope before the pump's early return.
      // Awaiting the installed B victim push here withheld C's committed
      // token from its launcher until transport completed.
      this.trackCommittedDelivery(committed.envelopes);
      const next = committed.decision;
      if (next.kind === 'empty' || next.kind === 'capacity-full') return;

      const slot = {
        projectId: next.entry.projectId,
        contractVersion: next.entry.contractVersion,
        generation: next.entry.generation,
        objective: next.entry.objective,
        budgetMs: next.entry.budgetMs,
        attemptToken: next.admission.attemptToken,
      };
      let released = false;
      let handedOff = false;
      const releaseUnlaunched = async (): Promise<void> => {
        if (released) return;
        // Proof: omitting this inner await advanced later dequeues while the
        // unlaunched seat's durable release remained held in the queue test.
        await this.options.repository.releaseSlot(slot);
        released = true;
      };
      try {
        const captured =
          this.options.captureOf === undefined
            ? undefined
            : await this.options.captureOf(next.entry.projectId);
        // Proof: bypassing this typed refusal sent an unavailable capture to
        // the hash port and broke the queued pump before its next FIFO entry.
        if (captured !== undefined && captured.kind !== 'scheduled') continue;
        const input =
          captured === undefined
            ? await this.options.inputOf(next.entry.projectId)
            : captured.input;
        if (input === null) continue;
        // Proof: omitting this captured enablement guard launched PRI despite
        // a disabled queued observation; only the next TIME entry should run.
        if (captured?.kind === 'scheduled' && !captured.enabled) continue;
        if (this.options.hashInput(input) !== next.inputHash) {
          // Proof: dropping this await read replacement enablement while the
          // stale queued seat's durable release remained held.
          await releaseUnlaunched();
          const enabled =
            captured === undefined
              ? await this.options.enabledOf(next.entry.projectId)
              : captured.enabled;
          if (!enabled) continue;
          await this.readPlan({
            projectId: next.entry.projectId,
            objective: next.entry.objective,
            input,
            enabled,
          });
          continue;
        }

        const built = buildSolverRequestPair(
          input,
          this.options.solverVersion,
          next.entry.budgetMs,
        )[next.entry.objective];
        if (!built.ok) {
          // Proof: dropping this await released the queued seat while its held
          // preflight failure had not reached durable cache.
          await this.storeOutcome({
            claim: { ...slot, ownerId: this.options.ownerId },
            inputHash: next.inputHash,
            admittedCancelEpoch: next.admission.admittedCancelEpoch,
            outcome: { kind: 'failed', reason: dispositionOfPreflightFailure(built.failure) },
            now: Math.max(this.options.now(), next.admission.startedAt),
          });
          continue;
        }

        this.startReserved({
          key: {
            projectId: next.entry.projectId,
            inputHash: next.inputHash,
            contractVersion: next.entry.contractVersion,
            budgetMs: next.entry.budgetMs,
          },
          objective: next.entry.objective,
          generation: next.entry.generation,
          admission: next.admission,
          request: built.request,
          input,
        });
        handedOff = true;
      } finally {
        // Proof: a thrown shared capture left a counted `starting` slot; the
        // restart test saw it until this unlaunched cleanup released it.
        // A handed-off child keeps its seat until terminal evidence arrives.
        // Proof: omitting this await let the next queued project dequeue while
        // the first unlaunched starting slot's durable release was held.
        if (!handedOff) await releaseUnlaunched();
      }
    }
  }

  /**
   * Admit one manual Retry in the contract's stale → retryable → live → capacity order.
   * A scoped attempt reclassifies project authority and records recovery in the
   * same immediate write as its retry admission. The retained marker remains
   * the read authority until this attempt commits.
   */
  readonly retry = async (ask: {
    readonly projectId: string;
    readonly objective: SolverObjectiveName;
    readonly inputHash: string;
    readonly input: ScheduleInput;
    readonly scoped?: { readonly organizationId: string; readonly actorId: string };
  }): Promise<OptimizationRetryResult> => {
    const currentInputHash = this.options.hashInput(ask.input);
    if (ask.inputHash !== currentInputHash) {
      return { kind: 'stale-input-hash', currentInputHash };
    }
    const key = {
      projectId: ask.projectId,
      inputHash: currentInputHash,
      contractVersion: this.options.contractVersion,
      budgetMs: this.options.budgetMs,
    };
    const now = this.options.now();
    const committed = await this.options.repository.admitRetry({
      key,
      objective: ask.objective,
      ownerId: this.options.ownerId,
      now,
      attemptToken: this.options.attemptToken,
      ...(ask.scoped === undefined ? {} : { scoped: ask.scoped }),
    });
    // Proof: omitting this registration lost the real non-retryable Retry
    // decision's test-injected durable envelope before its early return.
    this.trackCommittedDelivery(committed.envelopes);
    const decision = committed.decision;

    if (decision.kind !== 'accepted') return decision;
    if (decision.admission !== null) {
      const built = buildSolverRequestPair(ask.input, this.options.solverVersion, key.budgetMs)[
        ask.objective
      ];
      const slot = {
        projectId: ask.projectId,
        contractVersion: key.contractVersion,
        generation: decision.generation,
        objective: ask.objective,
        budgetMs: key.budgetMs,
        attemptToken: decision.admission.attemptToken,
      };
      if (!built.ok) {
        try {
          // Proof: dropping this await released a Retry seat before its held
          // preflight failure reached durable cache in the coordinator test.
          await this.storeOutcome({
            claim: { ...slot, ownerId: this.options.ownerId },
            inputHash: currentInputHash,
            admittedCancelEpoch: decision.admission.admittedCancelEpoch,
            outcome: { kind: 'failed', reason: dispositionOfPreflightFailure(built.failure) },
            now: Math.max(now, decision.admission.startedAt),
          });
        } finally {
          // Proof: skipping preflight slot release failed all nine initial,
          // queued and manual Retry refusal cases (0 pass / 9 fail).
          // Proof: dropping this await began another queue dequeue while
          // the Retry preflight seat's durable release was still held.
          await this.options.repository.releaseSlot(slot);
          this.requestPump();
        }
      } else {
        this.startReserved({
          key,
          objective: ask.objective,
          generation: decision.generation,
          admission: decision.admission,
          request: built.request,
          input: ask.input,
        });
      }
    }
    return {
      kind: 'accepted',
      state: 'retrying',
      generation: decision.generation,
      inputHash: currentInputHash,
    };
  };

  /**
   * The reader wired into {@link WorkItemService}. It is an arrow so handing it
   * to the service cannot lose the coordinator instance as `this`.
   */
  readonly readPlan: OptimizedScheduleReader = async (ask) => {
    const inputHash = this.options.hashInput(ask.input);
    const key = {
      projectId: ask.projectId,
      inputHash,
      contractVersion: this.options.contractVersion,
      budgetMs: this.options.budgetMs,
    };
    if (
      !ask.enabled ||
      ask.input.slices.length === 0 ||
      ask.input.slices.every((slice) => slice.days === 0)
    ) {
      return {
        ...key,
        generation: null,
        variants: { pri: { state: 'idle' }, time: { state: 'idle' } },
        schedules: { pri: null, time: null },
      };
    }

    const now = this.options.now();
    const observed = await this.options.repository.observeForAdmission(key, now);
    if (observed.kind === 'idle') {
      return {
        ...key,
        generation: null,
        variants: { pri: { state: 'idle' }, time: { state: 'idle' } },
        schedules: { pri: null, time: null },
      };
    }
    // Proof: rereading after preflight changed the captured idle display to
    // failed while this read's failure markers were being persisted.
    const { generation, pair } = observed;
    let requests: SolverRequestPair | undefined;
    for (const request of observed.requests) {
      const committed = await this.options.repository.reserveSlot({
        projectId: request.key.projectId,
        contractVersion: request.key.contractVersion,
        generation,
        objective: request.objective,
        budgetMs: request.key.budgetMs,
        ownerId: this.options.ownerId,
        attemptToken: this.options.attemptToken(),
        now,
      });
      // Proof: omitting this registration lost the real project-full
      // reservation's test-injected durable envelopes; awaiting delivery
      // here instead withheld a committed reservation behind held transport.
      this.trackCommittedDelivery(committed.envelopes);
      const admission = committed.decision;
      if (admission.kind === 'project-full' || admission.kind === 'global-full') {
        await this.options.repository.enqueueRequest({
          projectId: request.key.projectId,
          contractVersion: request.key.contractVersion,
          generation,
          objective: request.objective,
          budgetMs: request.key.budgetMs,
          enqueuedAt: now,
        });
        continue;
      }
      if (admission.kind === 'reserved') {
        requests ??= buildSolverRequestPair(
          ask.input,
          this.options.solverVersion,
          this.options.budgetMs,
        );
        const built = requests[request.objective];
        const slot = {
          projectId: request.key.projectId,
          contractVersion: request.key.contractVersion,
          generation,
          objective: request.objective,
          budgetMs: request.key.budgetMs,
          attemptToken: admission.attemptToken,
        };
        if (!built.ok) {
          try {
            // Proof: dropping this await released the initial reserved seat
            // while its held preflight failure had not reached durable cache.
            await this.storeOutcome({
              claim: { ...slot, ownerId: this.options.ownerId },
              inputHash: request.key.inputHash,
              admittedCancelEpoch: admission.admittedCancelEpoch,
              outcome: {
                kind: 'failed',
                reason: dispositionOfPreflightFailure(built.failure),
              },
              now,
            });
          } finally {
            // Proof: skipping preflight slot release failed all nine initial,
            // queued and manual Retry refusal cases (0 pass / 9 fail).
            // Proof: dropping this await began another queue dequeue while
            // the initial preflight seat's durable release was still held.
            await this.options.repository.releaseSlot(slot);
            this.requestPump();
          }
          continue;
        }

        const launch = {
          ...request,
          generation,
          admission,
          request: built.request,
          input: ask.input,
        };
        this.startReserved(launch);
      }
    }
    const [priLive, timeLive] = await Promise.all([
      this.options.repository.isVariantLive(key, generation, 'pri', now),
      this.options.repository.isVariantLive(key, generation, 'time', now),
    ]);
    // Both, because `pair` already holds both decoded payloads and the plan
    // read compares every ready variant with Fast (tasks.md 8b.3). `ask.objective`
    // is still what *selects* the schedule to display; it no longer decides
    // which one is handed over.
    return {
      ...key,
      generation,
      variants: {
        pri: applyVariantLiveness(pair.pri.state, priLive),
        time: applyVariantLiveness(pair.time.state, timeLive),
      },
      schedules: { pri: pair.pri.schedule, time: pair.time.schedule },
    };
  };

  /** Compatibility seam for queue callbacks and tests that need only the selected schedule. */
  readonly read = (ask: {
    readonly projectId: string;
    readonly objective: SolverObjectiveName;
    readonly input: ScheduleInput;
  }): Promise<Schedule | null> =>
    this.readPlan({ ...ask, enabled: true }).then((read) => read.schedules[ask.objective]);
}
