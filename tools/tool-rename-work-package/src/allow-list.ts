/** A path glob (Bun.Glob syntax, repo-relative) neither `apply` nor `check` touches. */
export interface ExcludedPath {
  readonly glob: string;
  readonly reason: string;
}

/**
 * Why a line keeps the word: `new` for identifiers already in the new sense (design E12, so
 * `apply` never makes a second `workPackageId`), `other` for the word in a sense the map does
 * not own (Nx, licences).
 */
export type LineSense = 'new' | 'other';

/** A line pattern: a matching line is left byte-identical by `apply` and unreported by `check`. */
export interface ProtectedLine {
  readonly pattern: RegExp;
  readonly sense: LineSense;
  readonly reason: string;
}

/**
 * Paths outside the rename (design E11). Each glob is matched against the repo-relative path;
 * a file under any of them is neither rewritten nor checked.
 */
export const EXCLUDED_PATHS: readonly ExcludedPath[] = [
  { glob: '**/project.json', reason: 'Nx project configuration' },
  { glob: 'tools/tool-rename-work-package/**', reason: 'the rename tool names both vocabularies' },
  { glob: 'tools/tool-devsync/**', reason: "Nx project names: tool-devsync's workspace inventory" },
  { glob: 'tools/tool-git-hooks/**', reason: 'Nx project tokens parsed from task output' },
  { glob: 'tools/workspace/**', reason: 'Nx workspace portability over project.json files' },
  {
    glob: 'apps/twilight-structure/twilight-burokrat/**',
    reason: "Burokrat's projectId is an Nx project id",
  },
  {
    glob: 'apps/twilight-structure/twilight-dash/**',
    reason: "Dash's ledger project columns and activation inventory are Nx projects",
  },
  {
    glob: 'apps/wbs/be-01/drizzle/**',
    reason: 'every existing migration.sql/down.sql and snapshot: rollback refuses an edited one',
  },
  { glob: '**/migration.sql', reason: 'applied migrations are history' },
  { glob: '**/down.sql', reason: 'rollback scripts pair with applied migrations' },
  {
    glob: 'openspec/changes/wbs-work-packages/**',
    reason: 'this change names both senses on purpose; it is edited by hand',
  },
  { glob: 'openspec/changes/**', reason: 'other changes and the archive are history' },
  { glob: 'docs/findings/**', reason: 'dated proof details' },
  { glob: 'docs/superpowers/**', reason: 'dated plans and specs' },
  { glob: 'docs/plans/**', reason: 'dated plans' },
  { glob: 'docs/wbs/testing/**', reason: 'dated test records' },
  { glob: 'docs/*-history.md', reason: 'dated history records' },
  { glob: 'docs/**/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-*', reason: 'dated records' },
  { glob: 'docs/**/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-*/**', reason: 'dated records' },
  { glob: 'openspec/*-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].md', reason: 'dated audits' },
  { glob: 'docs/experiment-evidence/**', reason: 'evidence logs' },
  { glob: '**/evidence/**', reason: 'evidence logs' },
  { glob: '**/*.log', reason: 'evidence logs' },
  { glob: '.superpowers/**', reason: 'dated agent task records' },
  { glob: '.claude/**', reason: 'agent commands and skills: project means the repository' },
  { glob: '.agents/**', reason: 'agent skills: project means the repository' },
  { glob: 'notes/**', reason: 'dated working notes' },
  {
    glob: 'apps/twilight-structure/twilight-navigator/cli/src/fixtures/plan-export.v*.json',
    reason: 'older plan-export fixtures (v7 to v11) stay as exported',
  },
  {
    glob: 'apps/wbs/be-01/src/service/fixtures/live-plan-2026-08-09.json',
    reason: 'dated plan-export fixture',
  },
  { glob: '**/CONTEXT.md', reason: 'terms keep the word in its new sense (E24), edited by hand' },
  {
    glob: 'libs/wbs/domain/contracts/solver/solver-wire.v*.json',
    reason: 'solver wire schemas: comments reworded with the next wire version (E26, WP-13)',
  },
  {
    glob: 'libs/wbs/adapters/solver-py/src/wbs_solver/solver-wire.v*.json',
    reason: 'byte-identical solver-py copies of the wire schemas (E26)',
  },
];

/**
 * Lines that keep the word. Nx's `projectType` needs no pattern: it is written only in
 * `project.json` files, which {@link EXCLUDED_PATHS} covers whole. Every pattern matches at least one line of the tree today, which
 * `allow-list.test.ts` enforces, so a pattern outlived by its code fails a test instead of
 * silently widening the allow-list (E12).
 *
 * Not yet listed: the `wbs-permissions` identifiers E11 names (`ScopeChain.projectId`,
 * `organization.create_project`, the `project.*` permission ids, the project role names,
 * `{ kind: 'project'; chain }` and project-scoped grant rows). They have not landed on `main`;
 * the permissions slices add their patterns here when they do, and the test then holds them to
 * the code.
 */
export const PROTECTED_LINES: readonly ProtectedLine[] = [
  {
    pattern: /\[PROJECT-ASSIGNMENT-READS-\d{3}\]/,
    sense: 'new',
    reason: 'scenario ids tests cite by id (WP-8)',
  },
  {
    pattern: /\bclient projects?\b/,
    sense: 'new',
    reason: 'a client project is the engagement: the new sense',
  },
  { pattern: /\bproject\.json\b/, sense: 'other', reason: 'Nx project configuration file' },
  { pattern: /\bnx (?:run|show|graph|affected)\b/, sense: 'other', reason: 'Nx command lines' },
  { pattern: /\bNx projects?\b/, sense: 'other', reason: 'prose naming Nx projects' },
  { pattern: /\bcollaborative font projects\b/, sense: 'other', reason: 'SIL Open Font License' },
];

/** The first protected line pattern `line` matches, if any. */
export function protectionOf(line: string): ProtectedLine | undefined {
  return PROTECTED_LINES.find((each) => each.pattern.test(line));
}

const EXCLUDED_GLOBS = EXCLUDED_PATHS.map((each) => ({
  ...each,
  matcher: new Bun.Glob(each.glob),
}));

/** The first exclusion covering the repo-relative `path`, if any. */
export function exclusionOf(path: string): ExcludedPath | undefined {
  return EXCLUDED_GLOBS.find((each) => each.matcher.match(path));
}
