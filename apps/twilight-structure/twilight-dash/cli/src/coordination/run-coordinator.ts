import type { DagWorkTicket } from 'configurable-tree-traversal';

import { permitsRetry } from '../runs/plan-admission';
import { decodeAdmission, decodeRunGuard } from '../runs/record-codecs';
import type { Admission, Attempt, RunId, RunSnapshot } from '../runs/records';
import type { RunGuard, RunStore, StoreReply } from '../runs/run-store';
import {
  captureActivities,
  type CoordinationDag,
  readCoordinationFacts,
  type WbsCoordinationFacts,
} from './run-facts';

/** Owns one process-local external-completion session; never claims or launches remote work.
 * Initial accepted WBS progress seeds the session. Subsequent done facts require an issued
 * completion report or a new coordinator; readiness may remain blocked until that report.
 * Catalog changes or undone accepted progress require reconstruction. Old tickets never move
 * to the new coordinator. Operations serialize their reads and session mutations; summary
 * is callback-free inspection of the last accepted local state, not a fresh WBS observation.
 */
export async function createRunCoordinator(options: {
  readonly dag: CoordinationDag;
  readonly runs: RunStore;
  readonly runId: RunId;
  readonly readWbs: () => Promise<WbsCoordinationFacts>;
}) {
  const { dag, runs, runId, readWbs } = options;
  const activities = captureActivities(dag);
  async function readCurrent() {
    // Proof: removing response capture let a later eligibility-array mutation reserve
    // capacity in `captures returned WBS eligibility before awaiting the current store snapshot`.
    const observed = structuredClone(await readWbs());
    // Proof: reading the store before WBS hid concurrent exact/changed/stale replays
    // behind state_conflict in `pending WBS read preserves ... admission authority`.
    const snapshot = await runs.readRun(runId);
    const facts = readCoordinationFacts(observed, snapshot, activities);
    return { snapshot, ...facts };
  }
  const initial = await readCurrent();
  // Proof: seeding every activity hid unfinished work in `accepted predecessors
  // seed only fresh sessions and new done requires explicit completion`.
  const accepted = new Set(initial.completed);
  const session = dag.createWorkSession({ completedWork: accepted });
  const issued = new WeakMap<DagWorkTicket<string>, string>();
  let pending = Promise.resolve();
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    // Proof: starting operations concurrently exposed a successor after progress
    // undo in `concurrent completion and readiness serialize` across a finite read barrier.
    const next = pending.then(operation);
    // A rejected operation is delivered to its caller; the queue remains usable for a fresh read.
    pending = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
  async function refresh() {
    const current = await readCurrent();
    // Proof: independently bypassing catalog and accepted-progress comparisons
    // exposed a changed-position ticket and reserved an undone predecessor's successor
    // in `changed step positions require` and `undo of accepted progress requires`.
    if (
      current.catalog !== initial.catalog ||
      [...accepted].some((id) => !current.completed.has(id))
    )
      throw new Error('coordination rebuild required: accepted progress or catalog changed');
    return current;
  }
  function requireTicket(ticket: DagWorkTicket<string>): string {
    // Proof: accepting foreign objects by vertex ID reserved a slot in
    // `foreign admission tickets cannot reserve capacity even for the same ready activity`.
    const occurrence = issued.get(ticket);
    if (occurrence === undefined || ticket.vertexId !== occurrence)
      throw new Error('coordination ticket is foreign or retargeted');
    return occurrence;
  }
  function advanceTickets(): readonly DagWorkTicket<string>[] {
    const boundary = session.advance();
    if (boundary.kind === 'paused') throw new Error('coordination session unexpectedly paused');
    if (boundary.kind === 'finished') return [];
    for (const ticket of boundary.workTickets) issued.set(ticket, ticket.vertexId);
    return boundary.workTickets;
  }
  function excludesAttempt(
    snapshot: RunSnapshot,
    occurrence: string,
  ): 'attempt_active' | 'retry_exhausted' | undefined {
    const history = snapshot.attempts.filter(
      (attempt) => attempt.identity.occurrenceId === occurrence,
    );
    const latest = history.reduce<Attempt | undefined>(
      (previous, attempt) =>
        previous === undefined || previous.ordinal < attempt.ordinal ? attempt : previous,
      undefined,
    );
    if (latest === undefined) return undefined;
    // Proof: bypassing the budget exposed a ready ticket in `exhausted retries stay hidden`.
    if (latest.ordinal >= snapshot.run.maxAttempts) return 'retry_exhausted';
    // Proof: bypassing the shared retry predicate exposed failed/unknown work in
    // `durable failed interruption` and `durable unknown interruption`.
    if (!permitsRetry(latest)) return 'attempt_active';
    return undefined;
  }
  function isEligible(occurrence: string, current: Awaited<ReturnType<typeof refresh>>): boolean {
    const node = activities.get(occurrence);
    if (node === undefined) throw new Error('coordination ticket activity missing');
    // Proof: bypassing eligibility reserved a slot in `current eligibility and exact
    // ticket occurrence prevent unwanted reservation`.
    return current.eligible.has(node.stepId) && !current.completed.has(occurrence);
  }
  return {
    async ready(): Promise<readonly DagWorkTicket<string>[]> {
      return await serialize(async () => {
        const current = await refresh();
        // Proof: removing the durable-state filter exposed tickets for unfinished,
        // waiting, reconciling, pending-outcome and terminal attempts in reconstruction tests.
        return advanceTickets().filter(
          (ticket) =>
            isEligible(ticket.vertexId, current) &&
            excludesAttempt(current.snapshot, ticket.vertexId) === undefined,
        );
      });
    },
    async admit(
      ticket: DagWorkTicket<string>,
      inputGuard: RunGuard,
      inputAdmission: Admission,
    ): Promise<StoreReply<Attempt>> {
      // Proof: retaining caller objects instead of invocation snapshots changed the
      // admission in `captures admission and guard before a finite WBS read barrier`.
      const guard = decodeRunGuard(structuredClone(inputGuard));
      const admission = decodeAdmission(structuredClone(inputAdmission));
      return await serialize(async () => {
        const occurrence = requireTicket(ticket);
        const current = await refresh();
        // Proof: bypassing ticket/occurrence matching admitted the wrong activity in
        // `current eligibility and exact ticket occurrence prevent unwanted reservation`.
        if (
          guard.runId !== runId ||
          admission.identity.runId !== runId ||
          admission.identity.occurrenceId !== occurrence
        )
          return { kind: 'refused', reason: 'identity_conflict' };
        // Existing attempt identities always reach the store's owner fence and immutable comparison.
        // Proof: returning a cached duplicate acknowledged a changed immutable identity
        // in `admission preserves keys and cannot implicitly complete; replay precedes eligibility and capacity`.
        if (current.snapshot.attempts.some((attempt) => attempt.attemptId === admission.attemptId))
          return await runs.admitAttempt(guard, admission);
        if (!isEligible(occurrence, current)) return { kind: 'refused', reason: 'state_conflict' };
        const exclusion = excludesAttempt(current.snapshot, occurrence);
        if (exclusion !== undefined) return { kind: 'refused', reason: exclusion };
        // Proof: substituting the observed revision admitted a stale guarded request
        // in `two kernel-ready runs race through actual atomic capacity and revision checks`.
        return await runs.admitAttempt(guard, admission);
      });
    },
    async complete(ticket: DagWorkTicket<string>) {
      return await serialize(async () => {
        const occurrence = requireTicket(ticket);
        const current = await refresh();
        // Proof: bypassing accepted progress acknowledged unfinished work in
        // `unaccepted completion never releases a successor; accepted duplicate is explicit`.
        if (!current.completed.has(occurrence))
          throw new Error('coordination completion lacks accepted WBS progress');
        const receipt = session.completeWork(ticket);
        accepted.add(occurrence);
        return receipt;
      });
    },
    summary() {
      return session.summary();
    },
  };
}
