/**
 * The five target spellings of one word family (design E11). `constant` is not a sixth entry:
 * {@link constantSpellingOf} derives it from `sql`.
 */
export interface Spellings {
  /** Table, column, index, trigger, audit and event names: `work_package`. */
  readonly sql: string;
  /** Variables, properties, JSON keys and document fields: `workPackage`. */
  readonly identifier: string;
  /** Types and operationId segments: `WorkPackage`. */
  readonly type: string;
  /** Paths, module directories, route segments and the realtime prefix: `work-package`. */
  readonly path: string;
  /** Prose and UI words: `work package`. */
  readonly prose: string;
}

/** The old spelling a family is keyed by: the lowercase singular or plural word. */
export type OldWord = 'project' | 'projects';

/**
 * E11's vocabulary, keyed by the old lowercase word. The map is ordered plural first, so a
 * reader matching keys in order never takes `projects` for `project` plus a stray `s`. Every
 * case family of the old word (`project`, `Project`, `PROJECT`, `project_id`, `projectId`)
 * resolves to one of these spellings by where it stands: {@link renameText} chooses which.
 */
export const RENAME_MAP: ReadonlyMap<OldWord, Spellings> = new Map<OldWord, Spellings>([
  [
    'projects',
    {
      sql: 'work_packages',
      identifier: 'workPackages',
      type: 'WorkPackages',
      path: 'work-packages',
      prose: 'work packages',
    },
  ],
  [
    'project',
    {
      sql: 'work_package',
      identifier: 'workPackage',
      type: 'WorkPackage',
      path: 'work-package',
      prose: 'work package',
    },
  ],
]);

/** `WORK_PACKAGE` for `PROJECT_ID`-style constants: the SQL spelling, upper-cased. */
export function constantSpellingOf(spellings: Spellings): string {
  return spellings.sql.toUpperCase();
}

/** Where a named rename is written, which decides the spelling {@link renameText} picks. */
export type NamedSite = 'code' | 'string';

/**
 * Every rename E11 names one by one. The algorithm derives each from {@link RENAME_MAP}; this
 * list pins the derivation, so a rule change that respells a named surface fails
 * `rename-map.test.ts` instead of reaching the mechanical commit.
 */
export const NAMED_RENAMES: readonly {
  readonly from: string;
  readonly to: string;
  readonly site: NamedSite;
}[] = [
  { from: 'projectId', to: 'workPackageId', site: 'code' },
  { from: 'ProjectId', to: 'WorkPackageId', site: 'code' },
  { from: 'project_id', to: 'work_package_id', site: 'string' },
  { from: 'project:', to: 'work-package:', site: 'string' },
  { from: 'project_settings_changed', to: 'work_package_settings_changed', site: 'string' },
  { from: 'project_changed', to: 'work_package_changed', site: 'string' },
  { from: 'project', to: 'work_package', site: 'string' },
  { from: 'restricted_project_recovery', to: 'restricted_work_package_recovery', site: 'string' },
  { from: 'project_access', to: 'work_package_access', site: 'string' },
  { from: 'project_organization', to: 'work_package_organization', site: 'string' },
  { from: 'project_priority_band', to: 'work_package_priority_band', site: 'string' },
  { from: 'project_rank', to: 'work_package_rank', site: 'string' },
  { from: 'project_resource_capacity', to: 'work_package_resource_capacity', site: 'string' },
  { from: 'project_solution', to: 'work_package_solution', site: 'string' },
  { from: 'project_team_capacity', to: 'work_package_team_capacity', site: 'string' },
  { from: 'space_project', to: 'space_work_package', site: 'string' },
  { from: 'lastOpenedProject', to: 'lastOpenedWorkPackage', site: 'code' },
];

/**
 * E11's module directory moves. Both carry indexed READMEs, so the moved README's
 * `module-index` envelope is rewritten by the same content pass.
 */
export const PATH_MOVES: readonly { readonly from: string; readonly to: string }[] = [
  {
    from: 'libs/wbs/application/core/src/module/project',
    to: 'libs/wbs/application/core/src/module/work-package',
  },
  { from: 'apps/wbs/fe-01/src/modules/project', to: 'apps/wbs/fe-01/src/modules/work-package' },
];
