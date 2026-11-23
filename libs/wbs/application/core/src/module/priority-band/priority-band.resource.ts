import type { PriorityBand } from '@wbs/domain';

import type { Clock } from '../../ports/clock';
import type { EditAdmission } from '../../ports/edit-admission';
import type { PriorityBandStore } from '../../ports/priority-band-store';
import type { Broadcaster } from '../../ports/work-package-event';
import type { WorkPackageStore } from '../../ports/work-package-store';

export interface PriorityBandServiceOptions {
  workPackages: Pick<WorkPackageStore, 'findById'>;
  bands: PriorityBandStore;
  broadcast: Broadcaster;
  /**
   * Ordinary legacy edits use `LEGACY_EDIT_ADMISSION`
   * outside a batch that established wider authority. See {@link EditAdmission}.
   */
  admission: EditAdmission;
  /** The instant every write is dated from and the ids it mints — see {@link Clock}. */
  clock: Clock;
}

/** Why a ladder write did not happen. */
export type PriorityBandRefusal = 'not_found' | 'forbidden';

export type PriorityBandOutcome =
  { ok: true; value: PriorityBand[] } | { ok: false; reason: PriorityBandRefusal };

/**
 * What one work package calls its priority numbers.
 *
 * `CapacityService`'s shape, and the two things it shares with it are the two
 * that matter: the fact is a **work package's**, so the write is gated by
 * {@link PriorityBandServiceOptions.admission} rather than being open to every authenticated account the way
 * the global directory is; and the announcement goes to the work package named and to
 * no other.
 *
 * Where it differs is what the write moves. A capacity moves one plan's dates; a
 * ladder moves **nothing** — it renames what that plan's existing numbers are
 * called. The event is still published, because every face draws the labels and a
 * plan open on a second screen would otherwise keep painting `High` over a rung
 * that now says `Blocker`.
 *
 * **Not journalled, and therefore not undoable**, joining `estimateMethod`,
 * `startDate` and a team's capacity: it is a work package fact, and there is no work
 * item whose revision an undo entry could hang on.
 */
export class PriorityBandService {
  private readonly clock: Clock;

  constructor(private readonly opts: PriorityBandServiceOptions) {
    this.clock = opts.clock;
  }

  listFor(workPackageId: string): Promise<PriorityBand[]> {
    return this.opts.bands.listFor(workPackageId);
  }

  /**
   * Replaces this work package's ladder, and tells the work package it named.
   *
   * The ladder is validated at the controller, which is the only place a set of
   * bands can enter — `priorityLadderProblem` in `libs/wbs/domain/domain` is the one guard
   * and there is one caller of it.
   *
   * Answers the work package's whole ladder rather than an acknowledgement, so a
   * client redraws from one response: the trimmed labels the store wrote are what
   * comes back, not the untrimmed ones a box sent.
   */
  async set(
    workPackageId: string,
    actorId: string,
    bands: readonly PriorityBand[],
  ): Promise<PriorityBandOutcome> {
    const workPackage = await this.opts.workPackages.findById(workPackageId);
    if (workPackage === null) return { ok: false, reason: 'not_found' };
    if (!this.opts.admission.admits(workPackage, actorId))
      return { ok: false, reason: 'forbidden' };
    // One stamp for a replacement the store makes as one transaction: every rung
    // it writes is the same act, so no two rungs of one ladder can disagree
    // about when they were named.
    const written = await this.opts.bands.replace(
      workPackageId,
      bands,
      this.clock.stampFor(actorId),
    );
    // The store read the work package inside its own transaction, so this is the
    // work package having gone between the read above and that write. `not_found`
    // either way.
    if (!written.ok) return { ok: false, reason: 'not_found' };
    await this.opts.broadcast.publish(workPackageId, { type: 'priority_bands_changed' });
    return { ok: true, value: await this.opts.bands.listFor(workPackageId) };
  }
}
