import type { WriteStamp } from '@wbs/core';
import type { Space } from '@wbs/core';
import type {
  Step,
  UserStore,
  WorkPackage,
  WorkPackageStore,
  WorkPackageWithAccess,
} from '@wbs/core';
import { retainWorkPackageCreation } from '@wbs/core';
import { resolveSetting } from '@wbs/domain';
import { DEFAULT_ESTIMATE_RULE, suggestWorkPackageAbbreviationCandidates } from '@wbs/domain';

import { inMemoryUsers } from './auth-fixture';
import {
  type MemoryCalendarMarkerTable,
  memoryCalendarMarkerTable,
} from './calendar-marker-fixture';
import {
  emptyPackageCreationContext,
  type MemoryPackageCreationContext,
  type MemoryPackageCreationTables,
  memoryPackageCreationTables,
  readMemoryOrganizationActivation,
  writePackageCreatorGrantIn,
} from './package-creation-fixture';
import {
  inMemorySettings,
  type MemorySettingTables,
  memorySettingTables,
} from './settings-fixture';

/**
 * A `WorkPackage` row carrying every field the schema requires.
 *
 * Twenty-one suites wrote this literal by hand — the same "Rewire the shed",
 * copied — and fifteen of the copies were missing `depReach` and `solutionRef`,
 * added to {@link WorkPackage} long after the copies were made. Nothing said so: no
 * `typecheck` target in this repository compiled a test file until 2026-09-02.
 *
 * The defaults are {@link WorkPackageService.create}'s own, `DEFAULT_ESTIMATE_RULE`
 * included, so a fixture row and a row production writes are the same
 * arithmetic — a fixture that chose its own weights would let an estimate test
 * pass against a work package no `create` can produce.
 */
export function workPackageRow(
  overrides: Partial<WorkPackage> & Pick<WorkPackage, 'projectId'>,
): WorkPackage {
  const id = overrides.id ?? crypto.randomUUID();
  return {
    id,
    name: 'Rewire the shed',
    abbreviation: `P${id
      .replaceAll(/[^A-Za-z0-9]/g, '')
      .slice(0, 19)
      .toUpperCase()}`,
    restricted: false,
    estimateMethod: 'pert',
    depReach: 'whole-item',
    pertWeights: DEFAULT_ESTIMATE_RULE.pertWeights,
    estimateRounding: DEFAULT_ESTIMATE_RULE.rounding,
    startDate: null,
    solutionRef: null,
    revision: 0,
    createdAt: 1,
    // The three settings the migration defaults, stated for the same reason the
    // estimate rule is: a fixture that left them out would be a `WorkPackage` no
    // read can produce (tasks.md 3b.2).
    optimizationEnabled: false,
    scheduleEngine: 'fast',
    scheduleObjective: 'pri',
    budgetFactor: 1,
    ...overrides,
  };
}

/**
 * A WorkPackageStore backed by Maps, for controller and service tests that do not
 * need SQLite.
 *
 * It keeps the guarantees the real schema enforces, because a fixture that is
 * laxer than production lets a test pass against behaviour that does not exist:
 * step names are unique within a work package, `list` returns newest first, and
 * `update` refuses an id it does not hold rather than inventing a row.
 *
 * `users` resolves each package's persisted creation-actor name,
 * and it has to be **the same one the test registers its accounts in** — pass
 * `inMemoryUsers()`'s value to both this and `testAuthService`. Left to its own
 * empty default, `listFor` throws on the first work package it lists, which is
 * production's behaviour for a creation actor naming no account and not an accident
 * to work around.
 */
export interface MemoryWorkPackageTables {
  readonly creation: MemoryPackageCreationTables;
  readonly settings: MemorySettingTables;
  readonly spaces: Map<string, Space>;
  readonly markers: MemoryCalendarMarkerTable;
  readonly workPackages: Map<string, WorkPackage>;
  readonly steps: Map<string, Step[]>;
  readonly opened: Map<string, number>;
  /** Each step's allowance revision; a step never written is at 0, as the column default. */
  readonly allowanceRevisions: Map<string, number>;
  /** Which organization owns each work package, as `work_package_organization` holds it. */
  readonly owning: Map<string, string>;
}

export function memoryWorkPackageTables(): MemoryWorkPackageTables {
  return {
    creation: memoryPackageCreationTables(),
    settings: memorySettingTables(),
    spaces: new Map(),
    markers: memoryCalendarMarkerTable(),
    workPackages: new Map(),
    steps: new Map(),
    opened: new Map(),
    allowanceRevisions: new Map(),
    owning: new Map(),
  };
}

/** Borrows actual staged rows and context; this operation never clones, publishes or acquires an owner. */
export function createMemoryWorkPackageIn(
  workPackage: Parameters<WorkPackageStore['create']>[0],
  starting: readonly Step[],
  organizationId: string | null,
  target: MemoryWorkPackageTables,
  creation: MemoryPackageCreationContext,
): WorkPackage | 'abbreviation_taken' | 'abbreviation_exhausted' | 'not_found' {
  const { workPackages, steps, owning } = target;
  if (typeof workPackage.projectId !== 'string' || workPackage.projectId.trim() === '')
    throw new Error('package creation parent is missing');
  const mode = readMemoryOrganizationActivation(target.creation.activation);
  if (organizationId === null && mode !== 'pre_activation')
    throw new Error('legacy package creation is inactive');
  let parentOrganizationId = organizationId;
  if (parentOrganizationId === null) {
    const legacy = [...creation.organizations].filter(([, row]) => row.legacy);
    const legacyOrganization = legacy.at(0);
    if (legacy.length !== 1 || legacyOrganization === undefined)
      throw new Error('legacy package creation organization is absent or malformed');
    parentOrganizationId = legacyOrganization[0];
  }
  const parent = target.creation.projects.get(workPackage.projectId);
  if (parent?.organizationId !== parentOrganizationId) return 'not_found';
  const names = new Set(starting.map((r) => r.name));
  if (names.size !== starting.length) {
    throw new Error(`duplicate step name in ${workPackage.id}`);
  }
  // The settings the caller left out, filled the way `WorkPackageRepository`
  // fills them from the column defaults. A fixture that stored the input
  // whole would answer `undefined` where production answers `false`.
  const namespace = parentOrganizationId;
  const occupied = new Set(
    [...workPackages.values()]
      .filter((row) => (owning.get(row.id) ?? null) === namespace)
      .map((row) => row.abbreviation),
  );
  const abbreviation =
    workPackage.abbreviation ??
    suggestWorkPackageAbbreviationCandidates(workPackage.name).find((code) => !occupied.has(code));
  if (abbreviation === undefined) return 'abbreviation_exhausted';
  if (occupied.has(abbreviation)) return 'abbreviation_taken';
  const written = {
    ...workPackage,
    abbreviation,
    optimizationEnabled: workPackage.optimizationEnabled ?? false,
    scheduleEngine: workPackage.scheduleEngine ?? 'fast',
    scheduleObjective: workPackage.scheduleObjective ?? 'pri',
    pertWeights: workPackage.pertWeights ?? DEFAULT_ESTIMATE_RULE.pertWeights,
    budgetFactor: 1,
  } satisfies WorkPackage;
  workPackages.set(written.id, written);
  owning.set(written.id, parentOrganizationId);
  steps.set(written.id, [...starting]);
  return written;
}

/** Legacy table fixture deliberately excludes the current package-unit capability; current Source composes its real implementation. */
export type LegacyWorkPackageStore=Omit<WorkPackageStore,'setStepUnit'>;

export function inMemoryWorkPackages(
  users: UserStore = inMemoryUsers(),
  tables: MemoryWorkPackageTables = memoryWorkPackageTables(),
  creation: MemoryPackageCreationContext = emptyPackageCreationContext(),
): LegacyWorkPackageStore {
  const { workPackages, steps, opened, allowanceRevisions, owning } = tables;
  const settings = inMemorySettings(tables.settings, {
    organizationExists: (id) => creation.organizations.has(id),
    readSpace: (id) => tables.spaces.get(id) ?? null,
    readProject: (id) => tables.creation.projects.get(id) ?? null,
    readPackage: (id) => {
      const row = workPackages.get(id);
      return row === undefined
        ? null
        : {
            projectId: row.projectId,
            restricted: row.restricted,
            organizationId: owning.get(id) ?? null,
          };
    },
    packageIds: () => [...workPackages.keys()],
    readMarkers: () =>
      [...tables.markers.held.values()].map(({ scope, ...marker }) => ({ scope, marker })),
    touchPackage: (id) => {
      const row = workPackages.get(id);
      if (row === undefined) throw new Error('settings descendant package is absent');
      workPackages.set(id, { ...row, revision: row.revision + 1 });
      return {
        workPackageId: id,
        event: {
          type: 'work_package_settings_changed',
          optimizationEnabled: row.optimizationEnabled,
          scheduleEngine: row.scheduleEngine,
          scheduleObjective: row.scheduleObjective,
        },
      };
    },
  });
  const project = async (row: WorkPackage): Promise<WorkPackage> => {
    // Public reads detach the actual catalog before their first suspension; borrowed writes see that same staged catalog.
    row = structuredClone(row);
    const captured = structuredClone({
      settings: tables.settings,
      spaces: tables.spaces,
      projects: tables.creation.projects,
      owning,
      packages: workPackages,
      organizations: creation.organizations,
      markers: tables.markers,
    });
    const observed = inMemorySettings(captured.settings, {
      organizationExists: (id) => captured.organizations.has(id),
      readSpace: (id) => captured.spaces.get(id) ?? null,
      readProject: (id) => captured.projects.get(id) ?? null,
      readPackage: (id) => {
        const held = captured.packages.get(id);
        return held === undefined
          ? null
          : {
              projectId: held.projectId,
              restricted: held.restricted,
              organizationId: captured.owning.get(id) ?? null,
            };
      },
      packageIds: () => [...captured.packages.keys()],
      readMarkers: () =>
        [...captured.markers.held.values()].map(({ scope, ...marker }) => ({ scope, marker })),
      touchPackage: () => {
        throw new Error('detached package projection cannot write settings');
      },
    });
    const target = await observed.readTarget({ level: 'work_package', id: row.id }, null);
    if (target === null) throw new Error('memory package settings target disappeared');
    const snapshot = await observed.capture(target);
    return {
      ...structuredClone(row),
      pertWeights: resolveSetting(target.chain, 'pertWeights', snapshot).value,
      budgetFactor: resolveSetting(target.chain, 'budgetFactor', snapshot).value,
    };
  };
  const ownWrite = async (
    id: string,
    change: Parameters<typeof settings.write>[1],
    stamp: WriteStamp,
  ) => {
    const target = await settings.readTarget({ level: 'work_package', id }, null);
    if (target === null) throw new Error('memory package setting target disappeared');
    const written = await settings.write(target, change, stamp);
    if (!written.ok) throw new Error('memory package setting refused: ' + written.reason);
  };
  /** One moment per `userId::workPackageId`, exactly as the primary key holds it. */
  /**
   * Every stamp this store was handed, in call order, so a service test can
   * assert who wrote and when without a database to read audit columns from.
   */

  const store: LegacyWorkPackageStore = {
    async createInOrganization(workPackage, starting, stamp, organizationId, creatorGrant) {
      const retained = retainWorkPackageCreation(
        workPackage,
        starting,
        stamp,
        organizationId,
        creatorGrant,
      );
      if (workPackages.has(retained.workPackage.id)) throw new Error('duplicate package identity');
      const staged = structuredClone(tables),
        mapping = structuredClone(creation.ownership);
      const written = createMemoryWorkPackageIn(
        retained.workPackage,
        retained.steps,
        retained.organizationId,
        staged,
        creation,
      );
      if (typeof written === 'string') return Promise.resolve(written);
      staged.creation.creators.set(written.id, retained.stamp.by);
      staged.owning.set(written.id, retained.organizationId);
      mapping.set(written.id, retained.organizationId);
      writePackageCreatorGrantIn(
        staged.creation,
        { ...creation, ownership: mapping },
        retained.organizationId,
        written.id,
        retained.stamp,
        retained.creatorGrant,
      );
      const replace = <K, V>(live: Map<K, V>, accepted: ReadonlyMap<K, V>) => {
        live.clear();
        for (const [key, value] of accepted) live.set(key, structuredClone(value));
      };
      replace(workPackages, staged.workPackages);
      replace(steps, staged.steps);
      replace(owning, staged.owning);
      replace(tables.creation.creators, staged.creation.creators);
      replace(tables.creation.grants, staged.creation.grants);
      replace(tables.creation.audits, staged.creation.audits);
      replace(creation.ownership, mapping);
      replace(tables.settings.values, staged.settings.values);
      if (retained.workPackage.pertWeights !== undefined)
        await ownWrite(
          written.id,
          { key: 'pertWeights', value: retained.workPackage.pertWeights },
          retained.stamp,
        );
      return await project(written);
    },
    // No dependent rows live in this store, so nothing it holds can cross.
    findCrossReferences: () => Promise.resolve([]),
    // Organization-authorized edits exist only over SQLite, where the
    // membership they recheck and the audit table live; scoped access never
    // arises over this store.
    editInOrganization() {
      return Promise.reject(
        new Error('the in-memory work package store has no organization edits'),
      );
    },
    findInOrganization(id, organizationId) {
      return owning.get(id) === organizationId ? store.findById(id) : Promise.resolve(null);
    },
    recordReadableOpenInOrganization() {
      // Proof: OPEN M1 (2026-11-14), Returning false instead of rejecting failed
      // `explicitly refuses current navigation on the memory fixture rather than inventing read authority`
      // at rejected=true; explicit unsupported behavior only, not memory authority parity.
      return Promise.reject(
        new Error('the in-memory work package store has no current opening authority'),
      );
    },
    async recordOpenInOrganization(workPackageId, stamp, organizationId) {
      if (owning.get(workPackageId) !== organizationId) return false;
      await store.recordOpen(workPackageId, stamp);
      return true;
    },
    async listForInOrganization(userId, organizationId) {
      return (await store.listFor(userId)).filter(
        (workPackage) => owning.get(workPackage.id) === organizationId,
      );
    },
    async create(workPackage, starting, stamp) {
      if (!creation.users.has(stamp.by))
        throw new Error('package creator account reference is absent');
      const written = createMemoryWorkPackageIn(
        structuredClone(workPackage),
        structuredClone([...starting]),
        null,
        tables,
        creation,
      );
      if (typeof written !== 'string') {
        const organizationId = tables.owning.get(written.id);
        if (organizationId === undefined) throw new Error('created package organization is absent');
        creation.ownership.set(written.id, organizationId);
        tables.creation.creators.set(written.id, stamp.by);
      }
      if (typeof written === 'string') return written;
      if (workPackage.pertWeights !== undefined)
        await ownWrite(written.id, { key: 'pertWeights', value: workPackage.pertWeights }, stamp);
      return await project(written);
    },
    findById(id) {
      const found = workPackages.get(id);
      return found === undefined ? Promise.resolve(null) : project(found);
    },
    // Organization and slug together, as SQLite filters them: another
    // organization's work package holding the slug must not hide this one's.
    findBySolutionSlugInOrganization(slug, organizationId) {
      for (const workPackage of workPackages.values()) {
        if (workPackage.solutionRef?.slug === slug && owning.get(workPackage.id) === organizationId)
          return project(workPackage);
      }
      return Promise.resolve(null);
    },
    findBySolutionSlug(slug) {
      for (const workPackage of workPackages.values()) {
        if (workPackage.solutionRef?.slug === slug) return project(workPackage);
      }
      return Promise.resolve(null);
    },
    async list() {
      const rows = await Promise.all([...workPackages.values()].map(project));
      return rows.sort((a, b) => b.createdAt - a.createdAt);
    },
    async listFor(userId) {
      // Sorted the way SQLite's `ORDER BY last_opened_at DESC, created_at DESC`
      // sorts, NULLs last. A fixture ordering it any other way would let a
      // component pass against an order production does not produce.
      const withAccess: WorkPackageWithAccess[] = [];
      for (const workPackage of workPackages.values()) {
        const creatorId = tables.creation.creators.get(workPackage.id);
        if (creatorId === undefined) throw new Error('work package creation actor is absent');
        const creator = await users.findById(creatorId);
        // The same refusal the query's LEFT JOIN produces, for the same reason:
        // a fixture that answered a blank creator here would let the controller's
        // shape test pass against a list production throws on.
        if (creator === null) {
          throw new Error(
            `work package "${workPackage.name}" has a creation actor naming no account`,
          );
        }
        withAccess.push({
          ...(await project(workPackage)),
          lastOpenedAt: opened.get(`${userId}::${workPackage.id}`) ?? null,
          createdByName: creator.username,
          // This fixture's writes ignore their stamps, so it holds no instant:
          // every work package reads as one written before the audit columns. The
          // instant's rules are proved against SQLite (`work-package.db.test.ts`).
          updatedAt: null,
        });
      }
      return withAccess.sort((a, b) => {
        if (a.lastOpenedAt !== b.lastOpenedAt) {
          if (a.lastOpenedAt === null) return 1;
          if (b.lastOpenedAt === null) return -1;
          return b.lastOpenedAt - a.lastOpenedAt;
        }
        return b.createdAt - a.createdAt;
      });
    },
    recordOpen(workPackageId, stamp) {
      // Both halves of the key come off the stamp: the account that opened the
      // work package is the acting user, and the instant it opened is the act's.
      opened.set(`${stamp.by}::${workPackageId}`, stamp.at);
      return Promise.resolve();
    },
    async update(id, patch, stamp) {
      const existing = workPackages.get(id);
      if (existing === undefined) return Promise.resolve(null);
      if (
        patch.abbreviation !== undefined &&
        [...workPackages.values()].some(
          (row) =>
            row.id !== id &&
            (owning.get(row.id) ?? null) === (owning.get(id) ?? null) &&
            row.abbreviation === patch.abbreviation,
        )
      )
        return Promise.resolve('abbreviation_taken');
      if (patch.budgetFactor !== undefined) throw new Error('budgetFactor is project-only');
      const updated: WorkPackage = {
        ...existing,
        abbreviation: patch.abbreviation ?? existing.abbreviation,
        name: patch.name ?? existing.name,
        restricted: patch.restricted ?? existing.restricted,
        estimateMethod: patch.estimateMethod ?? existing.estimateMethod,
        depReach: patch.depReach ?? existing.depReach,
        pertWeights: existing.pertWeights,
        estimateRounding: patch.estimateRounding ?? existing.estimateRounding,
        startDate: patch.startDate === undefined ? existing.startDate : patch.startDate,
        solutionRef: patch.solutionRef === undefined ? existing.solutionRef : patch.solutionRef,
        optimizationEnabled: patch.optimizationEnabled ?? existing.optimizationEnabled,
        scheduleEngine: patch.scheduleEngine ?? existing.scheduleEngine,
        scheduleObjective: patch.scheduleObjective ?? existing.scheduleObjective,
        budgetFactor: existing.budgetFactor,
      };
      if (patch.timezone !== undefined) {
        await ownWrite(id, { key: 'timezone', value: patch.timezone }, stamp);
      }
      if (patch.pertWeights !== undefined)
        await ownWrite(id, { key: 'pertWeights', value: patch.pertWeights }, stamp);
      updated.revision += 1;
      workPackages.set(id, updated);
      return await project(updated);
    },
    setStepAllowance(workPackageId, stepId, allowancePercent, _stamp) {
      const found = (steps.get(workPackageId) ?? []).find((each) => each.id === stepId);
      if (found === undefined) return Promise.resolve({ ok: false, reason: 'not_found' });
      const previousPercent = found.allowancePercent;
      found.allowancePercent = allowancePercent;
      const revision = (allowanceRevisions.get(stepId) ?? 0) + 1;
      allowanceRevisions.set(stepId, revision);
      return Promise.resolve({ ok: true, step: structuredClone(found), previousPercent, revision });
    },
    async timezoneOf(workPackageId) {
      const target = await settings.readTarget({ level: 'work_package', id: workPackageId }, null);
      if (target === null) return null;
      return resolveSetting(target.chain, 'timezone', await settings.capture(target)).value;
    },
    async setTimezone(workPackageId, timezone, stamp) {
      const existing = workPackages.get(workPackageId);
      if (existing === undefined) return Promise.resolve(false);
      await ownWrite(workPackageId, { key: 'timezone', value: timezone }, stamp);
      workPackages.set(workPackageId, { ...existing, revision: existing.revision + 1 });
      return Promise.resolve(true);
    },
    stepAllowanceRevisions(workPackageId) {
      return Promise.resolve(
        new Map(
          (steps.get(workPackageId) ?? []).map((each) => [
            each.id,
            allowanceRevisions.get(each.id) ?? 0,
          ]),
        ),
      );
    },
    stepsOf(workPackageId) {
      // In step order, as production reads them — see `inMemorySteps` for what
      // an unordered read would let a test believe.
      return Promise.resolve(
        [...(steps.get(workPackageId) ?? [])]
          .map((step) => structuredClone(step))
          .sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1)),
      );
    },
  };
  return store;
}
