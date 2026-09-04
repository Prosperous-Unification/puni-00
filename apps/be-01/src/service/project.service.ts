import { DEFAULT_ESTIMATE_RULE, isIsoDate, PertWeights } from '@wbs/domain';
import { type } from '@wbs/validation';

import type {
  NewProject,
  Project,
  ProjectPatch,
  ProjectStore,
  ProjectWithAccess,
  Step,
} from '../repository';
import { STEP_POSITION_STEP } from '../repository';
import { type Clock, clockOf } from './clock';

/**
 * The steps a project starts with, **in step order**. Two sets of estimates is
 * the default the product asks for; a project that began with none would accept
 * no estimates at all until someone thought to add a step.
 */
export const STARTING_STEPS = ['Dev', 'QA'] as const;

export interface ProjectWithSteps {
  project: Project;
  steps: Step[];
}

export type UpdateOutcome =
  | { ok: true; value: Project }
  | { ok: false; reason: 'not_found' | 'forbidden' | 'bad_start_date' | 'bad_pert_weights' };

export interface ProjectServiceOptions {
  projects: ProjectStore;
  /** The instant every write is dated from and the ids it mints — see {@link Clock}. */
  clock?: Clock;
}

/**
 * Whether `actorId` may write to `project`.
 *
 * Exported because every later mutation asks the same question — work items,
 * estimates, freeze — and a second copy of this rule is how one of them ends up
 * enforcing a different one. Reading is deliberately not gated: an unrestricted
 * project is editable by any authenticated account, and a restricted one is
 * readable by all and writable only by its owner.
 */
export function canEdit(project: Project, actorId: string): boolean {
  return !project.restricted || project.ownerId === actorId;
}

export class ProjectService {
  private readonly clock: Clock;

  constructor(private readonly opts: ProjectServiceOptions) {
    this.clock = opts.clock ?? clockOf();
  }

  async create(name: string, ownerId: string): Promise<ProjectWithSteps> {
    // Built before the row, because the row's own `createdAt` is this act's
    // instant: the project and the starting steps arriving in one transaction
    // are one beginning, and they are dated from one reading of the clock.
    const stamp = this.clock.stampFor(ownerId);
    const project: NewProject = {
      id: this.clock.newId(),
      name,
      ownerId,
      restricted: false,
      // PERT is the default: it is the reason three points are collected, and
      // a project that had to choose before it had any estimates would be
      // choosing about risk it has not met yet.
      estimateMethod: 'pert',
      // A dependency means the predecessor is finished, which is what almost
      // everybody reading a chart takes an arrow to say. The `anchor-slice`
      // rule is a hand-off convention a project asks for; it is not what a new
      // project should have to opt out of. Same value as the column default,
      // so a row this writes and a row the migration reached read alike.
      depReach: 'whole-item',
      // The textbook 1/4/1 and whole days rounded up — `DEFAULT_ESTIMATE_RULE`
      // rather than three literals, so a new project and a project the
      // migration reached (the column defaults) are the same arithmetic, and
      // there is one place to read what a project gets when it says nothing.
      pertWeights: DEFAULT_ESTIMATE_RULE.pertWeights,
      estimateRounding: DEFAULT_ESTIMATE_RULE.rounding,
      // Not the day it was made: a plan with no start date is an ordinary
      // state, and inventing one would put dates on screen nobody chose.
      startDate: null,
      solutionRef: null,
      // Never written to since it came into being. Its starting steps arrive
      // in the same transaction, so they are part of that beginning rather
      // than a first change to it.
      revision: 0,
      createdAt: stamp.at,
    };
    // Positions written here rather than left to the store: `create` takes the
    // seed as it is, and `STARTING_STEPS` is already an order — Dev is done
    // before QA, which is the order the schedule runs a work item's slices in.
    const steps = STARTING_STEPS.map((stepName, place) => ({
      id: this.clock.newId(),
      projectId: project.id,
      name: stepName,
      position: (place + 1) * STEP_POSITION_STEP,
    }));
    // The store's answer rather than the seed: `create` fills the three
    // settings from the column defaults, so the seed is a `NewProject` and only
    // what came back is a whole project (tasks.md 3b.2).
    const written = await this.opts.projects.create(project, steps, stamp);
    return { project: written, steps };
  }

  /**
   * The caller's list, in the caller's order.
   *
   * Takes the account id rather than answering one order for everybody: what
   * "most recently opened" means is a fact about who is asking, and computing
   * it anywhere but the query would mean reading every access row to sort a
   * list the database can already sort.
   */
  list(actorId: string): Promise<ProjectWithAccess[]> {
    return this.opts.projects.listFor(actorId);
  }

  /**
   * Records that `actorId` is now working in `id`.
   *
   * Deliberately **not** gated by {@link canEdit}: every authenticated account
   * may read every project, so gating this would leave a reader's own picker
   * permanently sorted by creation date — the exact thing this change exists to
   * fix. It is the caller's own navigation history and changes nothing anyone
   * else can see.
   */
  async open(id: string, actorId: string): Promise<boolean> {
    const project = await this.opts.projects.findById(id);
    // A project that is not there is not opened. Recording it anyway would
    // leave a row pointing at nothing, and the foreign key would refuse it in
    // production while the fixture happily accepted it.
    if (project === null) return false;
    // The stamp is the whole of what this write says: who opened the project and
    // when, which is what {@link ProjectStore.recordOpen} used to take as two
    // arguments of its own.
    await this.opts.projects.recordOpen(id, this.clock.stampFor(actorId));
    return true;
  }

  async read(id: string): Promise<ProjectWithSteps | null> {
    const project = await this.opts.projects.findById(id);
    if (project === null) return null;
    return { project, steps: await this.opts.projects.stepsOf(id) };
  }

  async readBySolutionSlug(slug: string): Promise<ProjectWithSteps | null> {
    const project = await this.opts.projects.findBySolutionSlug(slug);
    if (project === null) return null;
    return { project, steps: await this.opts.projects.stepsOf(project.id) };
  }

  async update(id: string, actorId: string, patch: ProjectPatch): Promise<UpdateOutcome> {
    // `2026-02-31` matches the route's pattern and is not a day. Refused here
    // rather than stored: the column is text, and a date the scheduler cannot
    // parse would throw on every later read of this project.
    if (patch.startDate != null && !isIsoDate(patch.startDate)) {
      return { ok: false, reason: 'bad_start_date' };
    }
    // The route's schema takes three numbers at or above zero, which three
    // zeroes satisfy — and no shape rule can say "not all of them". A triple
    // that sums to nothing has no divisor, so every PERT figure in the plan
    // would be `NaN`. Refused here rather than stored, for `bad_start_date`'s
    // reason exactly: the column would otherwise throw on every later read of
    // this project.
    //
    // The other two unusable triples never reach this. A negative weight is
    // refused by `minimum: 0`, and `1e999` — the only non-finite number JSON
    // can express — by TypeBox's number being a finite one; both measured in
    // `project.controller.test.ts` rather than assumed, because a hand-written
    // `>= 0` accepts `Infinity` and this codebase has paid for that once.
    //
    // Proof: with this check deleted, `refuses weights that cannot average a
    // triple, and keeps the ones it had` failed on `Expected: 422 / Received:
    // 200`; watched 2026-08-30.
    if (patch.pertWeights !== undefined && PertWeights(patch.pertWeights) instanceof type.errors) {
      return { ok: false, reason: 'bad_pert_weights' };
    }
    const project = await this.opts.projects.findById(id);
    if (project === null) return { ok: false, reason: 'not_found' };
    if (!canEdit(project, actorId)) return { ok: false, reason: 'forbidden' };
    const updated = await this.opts.projects.update(id, patch, this.clock.stampFor(actorId));
    // Gone between the read and the write. Reporting success would tell the
    // caller their rename landed on a project that no longer exists.
    if (updated === null) return { ok: false, reason: 'not_found' };
    return { ok: true, value: updated };
  }
}
