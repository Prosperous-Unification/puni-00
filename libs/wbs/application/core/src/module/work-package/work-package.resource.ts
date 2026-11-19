import type { Permission } from '@wbs/domain';
import {
  canEditLegacyWorkPackage,
  isIsoDate,
  isTimezone,
  parseWorkPackageAbbreviation,
  PertWeights,
} from '@wbs/domain';
import { type } from '@wbs/validation';

import type { AccessDecisions } from '../../ports/access-decisions';
import type { Clock } from '../../ports/clock';
import {
  type ServiceDependencyContext,
  withDependencyContext,
} from '../../ports/dependency-context';
import type { BeforeWorkPackageUpdate } from '../../ports/fanout-capture-store';
import {
  findWorkPackageWithin,
  LEGACY_ACCESS as LEGACY,
  type ResourceAccess,
} from '../../ports/organization-access';
import type { OptimizerAvailability } from '../../ports/scheduler';
import type { Broadcaster } from '../../ports/work-package-event';
import type {
  WorkPackageWithSteps,
  ZonedWorkPackage,
  ZonedWorkPackageWithSteps,
} from '../../ports/work-package-read';
import type {
  WorkPackage,
  WorkPackagePatch,
  WorkPackageStore,
  WorkPackageWithAccess,
} from '../../ports/work-package-store';
import { authorize, authorizePackage, authorizePackageSettings } from '../../service/authorize';
import { prepareWorkPackageBirth } from './work-package-birth';

export type {
  WorkPackageWithSteps,
  ZonedWorkPackage,
  ZonedWorkPackageWithSteps,
} from '../../ports/work-package-read';
export { STARTING_STEPS } from './work-package-birth';

/** A PATCH's settings: the stored ones, and the zone kept beside them. */
export type WorkPackageSettingsPatch = WorkPackagePatch;

export type UpdateOutcome =
  | {
      readonly ok: false;
      readonly reason: 'not_overridable_here';
      readonly key: 'budgetFactor';
      readonly level: 'work_package';
    }
  | { ok: true; value: ZonedWorkPackage }
  | {
      ok: false;
      readonly permission?: Permission;
      reason:
        | 'invalid_abbreviation'
        | 'abbreviation_taken'
        | 'not_found'
        | 'forbidden'
        | 'bad_start_date'
        | 'bad_pert_weights'
        /** A budget factor that is not finite, above 0 and at most 1000 (design D38). */
        | 'bad_budget_factor'
        /** A zone the runtime does not support — `isTimezone` refuses it. */
        | 'invalid_timezone'
        /**
         * The write would have switched this work package **on** to an optimizer this
         * deployment has not got. A state of the deployment rather than a fault
         * in the request — `refusal-status.ts` answers it 409 for that reason,
         * and the same body will be accepted once TASK-220 wires the reader.
         */
        | 'optimizer_unavailable'
        /**
         * Under scoped access, another of the organization's work packages holds
         * the requested solution slug. Other organizations' slugs never
         * collide, so this reveals nothing beyond the caller's own
         * organization.
         */
        | 'solution_taken'
        /**
         * A `depReach` change that would move a dynamic legacy anchor into a
         * cycle with a typed dependency. Nothing is written.
         */
        | 'dependency_cycle';
    };

/** Scoped creation requires current organization.create_project; legacy access retains its existing admission. */
export type CreateOutcome =
  | { ok: true; value: WorkPackageWithSteps }
  | {
      ok: false;
      readonly permission?: Permission;
      reason:
        | 'forbidden'
        | 'invalid_abbreviation'
        | 'abbreviation_taken'
        | 'abbreviation_exhausted'
        | 'not_found';
    };

/** Whether the caller may write `workPackage`, found through the caller's access. */
export type EditAuthorization =
  | { ok: true; workPackage: WorkPackage }
  | { ok: false; reason: 'not_found' | 'forbidden'; readonly permission?: Permission };

export interface WorkPackageServiceOptions {
  readonly accessDecisions?: AccessDecisions;
  workPackages: Pick<WorkPackageStore,'create'|'createInOrganization'|'editInOrganization'|'findById'|'findInOrganization'|'findBySolutionSlug'|'findBySolutionSlugInOrganization'|'listFor'|'listForInOrganization'|'recordOpen'|'recordOpenInOrganization'|'stepsOf'|'timezoneOf'|'update'>;
  /** The instant every write is dated from and the ids it mints — see {@link Clock}. */
  clock: Clock;
  /**
   * Where `work_package_settings_changed` goes (tasks.md 3b.3).
   *
   * **Required, and sixteen call sites paid for it.** Optional-with-a-no-op-
   * default was the cheaper edit and it fails in exactly the way that matters:
   * a service constructed without one goes on answering `200` to every settings
   * PATCH while no client is ever told, and no test that does not specifically
   * look for the event can see the difference. Required makes the compiler ask
   * the question once, at every construction, including the production wiring
   * in `services.ts`. This is not the `NewWorkPackage` trade (3b.2): there the
   * twenty sites would each have restated a *value* that could drift from the
   * migration, and here they pass a collaborator that cannot drift from
   * anything.
   */
  broadcast: Broadcaster;
  /**
   * Whether this deployment can honour optimized scheduling — the `available`
   * half of {@link optimizerWiring}, whose other half is the reader
   * `WorkItemService` reads plans through.
   *
   * **Optional, and its default is the refusing one.** That is the opposite
   * trade from `broadcast` above and it is made for the opposite reason: a
   * service built without a broadcaster fails *silently*, while one built
   * without this fails *loudly*, at the settings panel, the first time anybody
   * tries to switch the optimizer on. Twenty-two construction sites — every one
   * of them a test with no optimizer in it — would otherwise each have to state
   * a fact about a deployment they do not model.
   *
   * Pass {@link OptimizerWiring.available} and never a hand-rolled predicate:
   * the whole point of the type is that it cannot disagree with the reader.
   */
  optimizerAvailable?: OptimizerAvailability;
  /**
   * The combined step-node graph a `depReach` change is checked against
   * before it is written. Required: a reach change can move every legacy
   * link's anchor at once, and a work package that accepted one without asking
   * would store a plan whose every later read throws.
   */
  dependencyContext: ServiceDependencyContext;
  /** Trusted admitted-route observation seam; direct service callers need no fan-out capture. */
  beforeUpdate?: BeforeWorkPackageUpdate;
}

export class WorkPackageService {
  private readonly clock: Clock;
  /**
   * Fail closed. A deployment with no optimizer wired in cannot honour
   * `optimized`, and a default of "available" would have made the absent
   * argument mean exactly the defect this gate exists to refuse.
   */
  private readonly optimizerAvailable: OptimizerAvailability;

  constructor(private readonly opts: WorkPackageServiceOptions) {
    this.clock = opts.clock;
    this.optimizerAvailable = opts.optimizerAvailable ?? (() => false);
  }

  /** Read only the work package header; History must not introduce a steps query. */
  readWorkPackage(workPackageId: string): Promise<WorkPackage | null> {
    return this.opts.workPackages.findById(workPackageId);
  }

  /**
   * Creates a work package in the caller's organization, or deployment-wide under
   * legacy access. The scoped path writes the ownership row in the work package's
   * own transaction: after activation no bridge trigger maps it.
   *
   * Proof: removing the viewer refusal failed `refuses a viewer every workPackage
   * write and lets the viewer read and open` in
   * `work-package-organization.controller.db.test.ts`; watched 2026-09-27.
   */
  async createWithin(
    name: string,
    projectId: string,
    actorId: string,
    access: ResourceAccess,
    abbreviation?: string,
  ): Promise<CreateOutcome> {
    if (access.kind === 'scoped') {
      // Proof: removing this invariant reached grant reads and accepted a different owner in the actual direct work-package-creation negative, 2026-11-09.
      // Proof: direct-work-package-owner fault failed 'direct work package creation names another owner' (command-permission.controller.db.test.ts); restored GREEN, 2026-11-09.
      if (access.principal.id !== actorId || access.scope.userId !== actorId)
        throw new Error('work package creation principal differs from its actor');
      // Proof: work-package-create-grant fault failed 'missing permission on the direct package creation route' (command-permission.controller.db.test.ts); restored GREEN, 2026-11-09.
      const decision = await authorize(
        this.opts.accessDecisions,
        access.principal,
        { kind: 'organization', organizationId: access.scope.organizationId },
        'organization.create_project',
      );
      if (!decision.ok) {
        if (decision.reason === 'not_found')
          throw new Error('organization creation authorization returned not_found');
        return decision;
      }
    }
    const parsed =
      abbreviation === undefined ? undefined : parseWorkPackageAbbreviation(abbreviation);
    if (parsed !== undefined && !parsed.ok) return parsed;
    const created = await this.createWorkPackage(
      name,
      projectId,
      actorId,
      access,
      parsed?.abbreviation,
    );
    return typeof created === 'string'
      ? { ok: false, reason: created }
      : { ok: true, value: created };
  }

  /** Unscoped legacy creation for callers outside the work package routes. */
  create(
    name: string,
    projectId: string,
    actorId: string,
  ): Promise<WorkPackageWithSteps | 'abbreviation_taken' | 'abbreviation_exhausted' | 'not_found'> {
    return this.createWorkPackage(name, projectId, actorId, LEGACY);
  }

  private async createWorkPackage(
    name: string,
    projectId: string,
    actorId: string,
    access: ResourceAccess,
    abbreviation?: string,
  ): Promise<WorkPackageWithSteps | 'abbreviation_taken' | 'abbreviation_exhausted' | 'not_found'> {
    // Built before the row, because the row's own `createdAt` is this act's
    // instant: the work package and the starting steps arriving in one transaction
    // are one beginning, and they are dated from one reading of the clock.
    const stamp = this.clock.stampFor(actorId);
    const { workPackage, steps } = prepareWorkPackageBirth(
      name,
      projectId,
      stamp,
      () => this.clock.newId(),
      abbreviation,
    );
    // The store's answer rather than the seed: `create` fills the three
    // settings from the column defaults, so the seed is a `NewWorkPackage` and only
    // what came back is a whole work package (tasks.md 3b.2).
    const written =
      access.kind === 'scoped'
        ? await this.opts.workPackages.createInOrganization(
            workPackage,
            steps,
            stamp,
            access.scope.organizationId,
            { id: this.clock.newId(), auditId: this.clock.newId() },
          )
        : await this.opts.workPackages.create(workPackage, steps, stamp);
    return typeof written === 'string' ? written : { workPackage: written, steps };
  }

  /**
   * The caller's list, in the caller's order.
   *
   * Takes the account id rather than answering one order for everybody: what
   * "most recently opened" means is a fact about who is asking, and computing
   * it anywhere but the query would mean reading every access row to sort a
   * list the database can already sort.
   */
  list(actorId: string): Promise<WorkPackageWithAccess[]> {
    return this.listWithin(actorId, LEGACY);
  }

  /** {@link list} through the caller's access: scoped access lists one organization. */
  listWithin(actorId: string, access: ResourceAccess): Promise<WorkPackageWithAccess[]> {
    return access.kind === 'scoped'
      ? this.opts.workPackages.listForInOrganization(actorId, access.scope.organizationId)
      : this.opts.workPackages.listFor(actorId);
  }

  /**
   * Records that `actorId` is now working in `id`.
   *
   * This raw navigation write is deliberately **not** gated by {@link canEditWorkPackage}.
   * Historical deployment-wide legacy reads admitted every authenticated account; current
   * ordinary HTTP LIST/GET have a separate grant-filtered observation owner. HTTP opening
   * uses the current readable writer; this raw helper retains its legacy/scoping policy.
   * Requiring plan edit authority here would leave a reader's own picker
   * permanently sorted by creation date — the exact thing this change exists to
   * fix. It is the caller's own navigation history and changes nothing anyone
   * else can see.
   */
  open(id: string, actorId: string): Promise<boolean> {
    return this.openWithin(id, actorId, LEGACY);
  }

  /** Raw {@link open} through organization scoping; current HTTP admission belongs to WorkPackageOpening. */
  async openWithin(id: string, actorId: string, access: ResourceAccess): Promise<boolean> {
    if (access.kind === 'scoped') {
      return this.opts.workPackages.recordOpenInOrganization(
        id,
        this.clock.stampFor(actorId),
        access.scope.organizationId,
      );
    }
    const workPackage = await this.opts.workPackages.findById(id);
    // A work package that is not there is not opened. Recording it anyway would
    // leave a row pointing at nothing, and the foreign key would refuse it in
    // production while the fixture happily accepted it.
    if (workPackage === null) return false;
    // The stamp is the whole of what this write says: who opened the work package and
    // when, which is what {@link WorkPackageStore.recordOpen} used to take as two
    // arguments of its own.
    await this.opts.workPackages.recordOpen(id, this.clock.stampFor(actorId));
    return true;
  }

  /**
   * {@link read} through the caller's access: under scoped access a foreign
   * work package is null exactly like an absent one, so the route answers one 404.
   */
  async readWithin(id: string, access: ResourceAccess): Promise<ZonedWorkPackageWithSteps | null> {
    const workPackage = await this.find(id, access);
    if (workPackage === null) return null;
    return {
      workPackage: await this.zoned(workPackage),
      steps: await this.opts.workPackages.stepsOf(id),
    };
  }

  /** Current package.write authority for dependent writes such as saved-plan capture; legacy ordinary edits admit only unrestricted packages. */
  async authorizeWrite(
    id: string,
    actorId: string,
    access: ResourceAccess,
  ): Promise<EditAuthorization> {
    const workPackage = await this.find(id, access);
    if (workPackage === null) return { ok: false, reason: 'not_found' };
    if (access.kind === 'legacy')
      // Proof: legacy-work-package-write; bypassed the legacy creator refusal.
      // 'retains the legacy restricted creator refusal at work-package-write' (admission.test.ts) failed; restored GREEN, 2026-11-10.
      return canEditLegacyWorkPackage(workPackage)
        ? { ok: true, workPackage }
        : { ok: false, reason: 'forbidden' };
    // Proof: saved-capture-service-grant fault failed 'borrowed saved-capture authorization' (command-permission.controller.db.test.ts); restored GREEN, 2026-11-09.
    const decision = await authorizePackage(
      this.opts.accessDecisions,
      access,
      workPackage,
      actorId,
      'package.write',
    );
    return decision.ok ? { ok: true, workPackage } : decision;
  }

  async authorizeRetry(
    id: string,
    actorId: string,
    access: ResourceAccess,
  ): Promise<EditAuthorization> {
    const workPackage = await this.find(id, access);
    if (workPackage === null) return { ok: false, reason: 'not_found' };
    if (access.kind === 'legacy')
      // Proof: legacy-work-package-retry; bypassed the legacy creator refusal.
      // 'retains the legacy restricted creator refusal at work-package-retry' (admission.test.ts) failed; restored GREEN, 2026-11-10.
      return canEditLegacyWorkPackage(workPackage)
        ? { ok: true, workPackage }
        : { ok: false, reason: 'forbidden' };
    // Proof: retry-service-grant fault failed 'contributor retry without' (command-permission.controller.db.test.ts); restored GREEN, 2026-11-09.
    const decision = await authorizePackage(
      this.opts.accessDecisions,
      access,
      workPackage,
      actorId,
      'package.manage_settings',
    );
    return decision.ok ? { ok: true, workPackage } : decision;
  }

  /**
   * Unscoped: reads any work package in the deployment. Kept for the boundaries
   * later slices scope (saved plans 3.6, export's tree 3.5);
   * raw callers read through {@link readWithin}. Ordinary HTTP LIST/GET and solution links use the
   * required WorkPackageObservation; this helper alone does not establish grant visibility.
   */
  async read(id: string): Promise<WorkPackageWithSteps | null> {
    const workPackage = await this.opts.workPackages.findById(id);
    if (workPackage === null) return null;
    return { workPackage, steps: await this.opts.workPackages.stepsOf(id) };
  }

  /** Raw legacy-column lookup; current HTTP solution admission belongs to WorkPackageObservation. */
  async readBySolutionSlug(slug: string): Promise<WorkPackageWithSteps | null> {
    const workPackage = await this.opts.workPackages.findBySolutionSlug(slug);
    if (workPackage === null) return null;
    return { workPackage, steps: await this.opts.workPackages.stepsOf(workPackage.id) };
  }

  /**
   * {@link readBySolutionSlug} through the caller's access: a slug held by a
   * work package the organization does not own is null, exactly as an absent one.
   * Organization scoping alone establishes no package.read authority. The HTTP binding uses
   * WorkPackageObservation.readSolution for current admission and projection in one snapshot.
   */
  async readBySolutionSlugWithin(
    slug: string,
    access: ResourceAccess,
  ): Promise<WorkPackageWithSteps | null> {
    const workPackage =
      access.kind === 'scoped'
        ? await this.opts.workPackages.findBySolutionSlugInOrganization(
            slug,
            access.scope.organizationId,
          )
        : await this.opts.workPackages.findBySolutionSlug(slug);
    if (workPackage === null) return null;
    return { workPackage, steps: await this.opts.workPackages.stepsOf(workPackage.id) };
  }

  update(id: string, actorId: string, patch: WorkPackageSettingsPatch): Promise<UpdateOutcome> {
    return this.updateWithin(id, actorId, patch, LEGACY);
  }

  /** {@link update} through the caller's access, authorized by {@link authorizeEdit}. */
  async updateWithin(
    id: string,
    actorId: string,
    settings: WorkPackageSettingsPatch,
    access: ResourceAccess,
  ): Promise<UpdateOutcome> {
    // Splitting timezone into setTimezone made the mounted combined patches
    // persist revision 2 while returning revision 1 (2026-10-22).
    const patch = { ...settings };
    const { timezone } = patch;
    // Checked against the runtime's own list, the one `GET /api/timezones`
    // serves, before anything is read: a zone `Intl` cannot format would throw
    // on every later read of the work package's days.
    // Proof: this check removed made `refuses Kyiv 422 invalid_timezone and
    // keeps the zone` in `work-package.controller.db.test.ts` store `Kyiv` and
    // answer 500 where 422 was owed; watched 2026-10-12.
    if (timezone !== undefined && !isTimezone(timezone)) {
      return { ok: false, reason: 'invalid_timezone' };
    }
    // `2026-02-31` matches the route's pattern and is not a day. Refused here
    // rather than stored: the column is text, and a date the scheduler cannot
    // parse would throw on every later read of this work package.
    if (patch.startDate != null && !isIsoDate(patch.startDate)) {
      return { ok: false, reason: 'bad_start_date' };
    }
    // The route's schema takes three numbers at or above zero, which three
    // zeroes satisfy — and no shape rule can say "not all of them". A triple
    // that sums to nothing has no divisor, so every PERT figure in the plan
    // would be `NaN`. Refused here rather than stored, for `bad_start_date`'s
    // reason exactly: the column would otherwise throw on every later read of
    // this work package.
    //
    // The other two unusable triples never reach this. A negative weight is
    // refused by `minimum: 0`, and `1e999` — the only non-finite number JSON
    // can express — by TypeBox's number being a finite one; both measured in
    // `work-package.controller.test.ts` rather than assumed, because a hand-written
    // `>= 0` accepts `Infinity` and this codebase has paid for that once.
    //
    // Proof: with this check deleted, `refuses weights that cannot average a
    // triple, and keeps the ones it had` failed on `Expected: 422 / Received:
    // 200`; watched 2026-08-30.
    if (patch.pertWeights !== undefined && PertWeights(patch.pertWeights) instanceof type.errors) {
      return { ok: false, reason: 'bad_pert_weights' };
    }
    // Refused before it is stored, for `bad_pert_weights`' reason: a factor of
    // 0 or below would derive budgets nothing could be spent under.
    // Proof: with this check removed, `refuses a budget factor of 0 and keeps
    // the one it had` (budget-command.test.ts) stored 0; watched 2026-10-23.
    // Historical package-factor validation above is superseded by the project-only setting boundary.
    let found = access.kind === 'legacy' ? await this.find(id, access) : null;
    if (access.kind === 'scoped') {
      const decisions = this.opts.accessDecisions;
      if (decisions === undefined)
        throw new Error('work package settings lack current access decisions');
      const target = await decisions.packageTargetOf(id, access.scope.organizationId);
      if (target === null) return { ok: false, reason: 'not_found' };
      // Proof: work-package-settings-grant fault failed 'borrowed work package settings before reaching' (command-permission.controller.db.test.ts); restored GREEN, 2026-11-09.
      const decision = await authorizePackageSettings(
        this.opts.accessDecisions,
        access.principal,
        target,
        patch,
      );
      if (!decision.ok) return decision;
      // Proof: legacy-work-package-settings; bypassed the legacy creator refusal.
      // 'retains the legacy restricted creator refusal at work-package-settings' (admission.test.ts) failed; restored GREEN, 2026-11-10.
    } else {
      if (found === null) return { ok: false, reason: 'not_found' };
      if (!canEditLegacyWorkPackage(found)) return { ok: false, reason: 'forbidden' };
    }
    if (patch.budgetFactor !== undefined)
      return {
        ok: false,
        reason: 'not_overridable_here',
        key: 'budgetFactor',
        level: 'work_package',
      };
    found ??= await this.find(id, access);
    if (found === null)
      throw new Error('admitted work package vanished before private settings projection');
    const admitted = found;
    return withDependencyContext(
      this.opts.dependencyContext,
      id,
      actorId,
      async (dependencyContext) => {
        // Proof: bypassing grammar made mounted `refuses invalid manual input without writes` accept an empty code with 200 instead of 422 (2026-10-22).
        if (patch.abbreviation !== undefined) {
          const parsed = parseWorkPackageAbbreviation(patch.abbreviation);
          if (!parsed.ok) return parsed;
          patch.abbreviation = parsed.abbreviation;
        }
        const workPackage = admitted;
        // After the authorization check, so a reader of a restricted work package still
        // learns `forbidden` rather than a fact about how this box is wired.
        if (turnsTheOptimizerOn(workPackage, patch) && !this.optimizerAvailable()) {
          return { ok: false, reason: 'optimizer_unavailable' };
        }
        // Asked of the state the patch would leave, before the write. The route
        // runs this whole method as one unit of work (`admitted-write.ts`), so no
        // other write lands between this read and the write below.
        // Proof: this check skipped made the mounted `refuses a depReach change
        // that closes a step-node cycle` fail on `Expected: 409, Received: 200`;
        // watched 2026-09-27.
        if (patch.depReach !== undefined && patch.depReach !== workPackage.depReach) {
          // Proof: bypassing this consumer failed `connected work-package-reach refuses an injected failed graph read`
          // at the actual SQLite refusal assertion; unchanged tables also checked (2026-10-22).
          const cycle = await dependencyContext.graph.findCycle(id, { reach: patch.depReach });
          if (cycle !== null) return { ok: false, reason: 'dependency_cycle' };
        }
        if (this.opts.beforeUpdate !== undefined) {
          const observed = await this.opts.beforeUpdate(id, actorId, access, patch);
          if (!observed.ok) return observed;
        }
        dependencyContext.assertUsable(id, actorId);
        const stamp = this.clock.stampFor(actorId);
        // Scoped writes are classified again inside the store's transaction, so a
        // restriction or membership change since the read above cannot turn a
        // recovery into an unaudited ordinary write.
        const written =
          access.kind === 'legacy'
            ? await this.opts.workPackages.update(id, patch, stamp)
            : await this.opts.workPackages.editInOrganization(
                id,
                patch,
                stamp,
                access.scope.organizationId,
                {
                  actorId,
                  auditId: this.clock.newId(),
                  principal: access.principal,
                },
              );
        // The in-transaction classification refused: demoted, or the work package
        // changed hands or restriction, since the request was read.
        if (written === 'forbidden') return { ok: false, reason: 'forbidden' };
        if (written === 'abbreviation_taken') return { ok: false, reason: written };
        if (written === 'solution_taken') return { ok: false, reason: 'solution_taken' };
        const updated = written;
        // Gone between the read and the write. Reporting success would tell the
        // caller their rename landed on a work package that no longer exists.
        if (updated === null) return { ok: false, reason: 'not_found' };
        // After the write and only on success, so nothing is announced that the
        // store refused or that landed on a work package that had gone. `forbidden` and
        // both `not_found` arms return above this line, which is what makes
        // tasks.md 3b.4's "refused and emits nothing" a property of the code rather
        // than of the test that checks it.
        if (settingsMoved(workPackage, updated)) {
          await this.opts.broadcast.publish(id, {
            type: 'work_package_settings_changed',
            optimizationEnabled: updated.optimizationEnabled,
            scheduleEngine: updated.scheduleEngine,
            scheduleObjective: updated.scheduleObjective,
          });
        }
        return { ok: true, value: await this.zoned(updated) };
      },
    );
  }

  /**
   * The work package with its stored zone.
   *
   * @throws when the work package has no zone row: it was just read, so a miss is
   * a store that lost it, never a work package to answer without one.
   */
  private async zoned(workPackage: WorkPackage): Promise<ZonedWorkPackage> {
    const timezone = await this.opts.workPackages.timezoneOf(workPackage.id);
    if (timezone === null) throw new Error(`work package ${workPackage.id} has no timezone`);
    return { ...workPackage, timezone };
  }

  private find(id: string, access: ResourceAccess): Promise<WorkPackage | null> {
    return findWorkPackageWithin(this.opts.workPackages, id, access);
  }
}

/**
 * Whether this patch would move **either** optimizer switch from off to on.
 *
 * Three things it deliberately is not, each of them a hole a reviewer found in
 * an earlier draft of this gate:
 *
 * - **Not "names one of the keys".** A settings panel with three controls
 *   resends all three every time one is touched, so refusing any PATCH carrying
 *   them would 409 a client for saying `{ scheduleEngine: 'fast',
 *   optimizationEnabled: false }` — a request that turns nothing on. The stored
 *   row is compared, exactly as {@link settingsMoved} compares it, so a resend
 *   of values the work package already holds is not an enabling.
 * - **Not "both together".** The plan read needs both
 *   (`publishedOptimized` reads the flag *and* the engine), but each column
 *   moves on its own and each is separately visible in
 *   `work_package_settings_changed` and in the settings panel. A gate that asked for
 *   both would let `optimizationEnabled: true` through on its own, and the
 *   work package would sit there reporting a half-enabled optimizer that is not
 *   there — the same lie, one field smaller.
 * - **Not a rule about the resulting row.** A work package already stored as
 *   `optimized` on a box that lost its optimizer is a migration's problem, not
 *   this caller's; refusing their rename would be punishing them for it. Only
 *   the movement this request asks for is judged.
 */
function turnsTheOptimizerOn(before: WorkPackage, patch: WorkPackagePatch): boolean {
  return (
    (patch.optimizationEnabled === true && !before.optimizationEnabled) ||
    (patch.scheduleEngine === 'optimized' && before.scheduleEngine !== 'optimized')
  );
}

/**
 * Whether the write moved any of the three settings.
 *
 * The **stored rows** are compared, before and after, rather than asking which
 * keys the patch named. A PATCH that re-sends the values a work package already has
 * — which is what a settings panel with three controls does every time one of
 * them is touched — named the keys and changed nothing, and announcing that
 * would wake every open client to repaint what it is already showing. The
 * inverse mistake is not available here: no other field can move these three,
 * so a row comparison cannot report a change nobody made.
 */
function settingsMoved(before: WorkPackage, after: WorkPackage): boolean {
  return (
    before.optimizationEnabled !== after.optimizationEnabled ||
    before.scheduleEngine !== after.scheduleEngine ||
    before.scheduleObjective !== after.scheduleObjective
  );
}
