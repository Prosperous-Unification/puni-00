import { unreachable } from '@/lib/http';
import {
  PlanDocumentSchemaError,
  type PlanImportRefusal,
  PlanImportRefusalError,
  type PlanImportSummary,
} from '@/lib/wbs-api';

import { shortInstant } from './short-date';

/** What every import failure nobody has worded says. Names no code, so a reader never sees one. */
export const IMPORT_FAILED = 'The plan could not be imported. Try again.';

/** Said when the parsed file is JSON but not the app's export document. */
const NOT_A_PLAN_EXPORT = 'This JSON is not a plan export.';

/**
 * Whether `path` is the document as a whole or its header, where a wrong value
 * means the file is some other JSON rather than a damaged plan export.
 */
const isDocumentLevel = (path: string): boolean =>
  path === '' || path === 'document' || path.startsWith('document.') || path === 'body';

const plural = (count: number, one: string, many: string): string =>
  `${String(count)} ${count === 1 ? one : many}`;

const listed = (parts: readonly string[]): string =>
  parts.length <= 1
    ? parts.join('')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

/** The directory names an import added, as one sentence, or null when it added none. */
const addedNames = (created: PlanImportSummary['created']): string | null => {
  const kinds: readonly [string, string, readonly string[]][] = [
    ['team', 'teams', created.teams],
    ['person', 'people', created.people],
    ['tag', 'tags', created.tags],
    ['service', 'services', created.services],
    ['type', 'types', created.types],
    ['external system', 'external systems', created.externalSystems],
  ];
  const added = kinds.flatMap(([one, many, names]) =>
    names.length === 0 ? [] : [`${plural(names.length, one, many)} (${names.join(', ')})`],
  );
  return added.length === 0 ? null : `Added ${listed(added)}.`;
};

/**
 * What a finished import says: the new project by the name it was given, how
 * many work items it holds, and only the facts that happened — directory names
 * it added, and the solution link when the file carried one.
 *
 * `name` is the catalogue's name for the new project, not the file's: the two
 * differ when {@link distinctImportName} dated it.
 */
export function importSummarySentence(summary: PlanImportSummary, name: string): string {
  const sentences = [`Imported “${name}” with ${plural(summary.rows, 'work item', 'work items')}.`];
  const added = addedNames(summary.created);
  if (added !== null) sentences.push(added);
  if (summary.solutionRef === 'kept') sentences.push('It keeps its solution link.');
  if (summary.solutionRef === 'left-off')
    sentences.push('Its solution link was left off: another project already has it.');
  return sentences.join(' ');
}

/** The sentence for be-01's refusal, before any location in the file is added. */
function refusalWords(refusal: PlanImportRefusal): string {
  switch (refusal.error) {
    case 'invalid_body':
      return isDocumentLevel(refusal.path)
        ? NOT_A_PLAN_EXPORT
        : 'This plan export has a value the app cannot read.';
    case 'invalid_typed_dependency':
      return 'This plan export has a dependency the app cannot read.';
    case 'unsupported_version':
      return 'This plan export comes from a version of the app this one cannot read.';
    case 'unknown_ref':
      return 'This plan export refers to something it does not contain.';
    case 'cycle':
      return 'The dependencies in this plan export go round in a circle.';
    case 'ancestor':
      return 'This plan export makes a work item depend on a group it sits in.';
    case 'deadline_before_project_start':
      return 'This plan export has a work item deadline before the project starts.';
    case 'work_item_takes_one_type':
      return 'This plan export gives a work item more than one type.';
    case 'engine_unavailable':
      return 'This plan uses the optimizing scheduler, which this server does not have.';
    case 'source_refused':
      return 'The server could not write one of this plan’s work items, so nothing was imported.';
    case 'step_blockage_inactive':
      return 'This server does not take blocked steps yet, so nothing was imported.';
    case 'unauthenticated':
      return 'You are signed out. Sign in, then import the file again.';
    case 'invalid_origin':
      return 'The server did not trust the page the import came from. Reload, then try again.';
    case 'insufficient_scope':
    case 'forbidden':
      return 'Your account can read plans here but not import them.';
    case 'no_active_organization':
      return 'Choose an organization before importing a plan.';
    case 'not_a_member':
      return 'You are no longer a member of this organization, so nothing was imported.';
    case 'sso_required':
      return 'This organization signs in through SSO. Sign in that way, then import again.';
    case 'reauthentication_required':
      return 'Sign in again, then import the file again.';
    case 'organization_context_changed':
      return 'The organization changed in another tab. Reload, then import again.';
    case 'agent_person_limit':
      // The numbers are the refusal's own (`wbs-organization-limits` L14).
      return `Organization limit: this plan would add ${String(refusal.added)} agent persons to the ${String(refusal.current)} of ${String(refusal.cap)} the organization holds, so nothing was imported.`;
    default:
      return unreachable(refusal);
  }
}

/**
 * Where in the file a refusal points, in the file's own paths, or nothing.
 *
 * The path is the reader's own document (`workItems[12].dependsOn[0]`), not
 * an internal name, and it is the only way to find the bad value in a 70 KB
 * file. `source_refused` carries the store's reason code as its detail, so it
 * keeps the path and drops the detail.
 */
function refusalLocation(refusal: PlanImportRefusal): string {
  if (!('path' in refusal) || isDocumentLevel(refusal.path)) return '';
  const detail =
    refusal.detail === null || refusal.error === 'source_refused' ? '' : `: ${refusal.detail}`;
  return ` (${refusal.path}${detail})`;
}

/** The sentences for the failures this side of the wire names by an `Error` message. */
const CLIENT_FAILURES: Readonly<Record<string, string | undefined>> = {
  invalid_json: 'This file is not JSON.',
  file_read_failed: 'The file could not be read. Choose it again.',
  imported_project_missing:
    'The plan was imported, but the new project is not in your list yet. Reload to see it.',
};

/**
 * What a failed import says, in the app's words and never a wire code.
 *
 * Exhaustive over the import route's typed refusals, so a refusal be-01 adds
 * fails the typecheck here rather than reaching a toast as `snake_case`. A
 * failure with no sentence (a transport fault, an unexpected status) falls
 * back to {@link IMPORT_FAILED}.
 */
export function importRefusalSentence(thrown: unknown): string {
  if (thrown instanceof PlanImportRefusalError) {
    const words = refusalWords(thrown.refusal);
    const location = refusalLocation(thrown.refusal);
    return location === '' ? words : `${words.slice(0, -1)}${location}.`;
  }
  if (thrown instanceof PlanDocumentSchemaError) {
    return isDocumentLevel(thrown.path)
      ? NOT_A_PLAN_EXPORT
      : `This plan export has a value the app cannot read: ${thrown.detail}.`;
  }
  if (thrown instanceof Error) {
    const worded = CLIENT_FAILURES[thrown.message];
    if (worded !== undefined) return worded;
    if (/^http_5\d\d$/.test(thrown.message))
      return 'The server could not import the plan. Try again.';
  }
  return IMPORT_FAILED;
}

/** ` (imported 15 Oct)` or ` (imported 15 Oct, 2)` at the end of a name. */
const IMPORTED_SUFFIX = / \(imported [^()]*\)$/;

const nameKey = (name: string): string => name.trim().toLocaleLowerCase();

/**
 * The name an imported plan is created under, so the account never holds two
 * projects the list cannot tell apart.
 *
 * The file's name when no project in `taken` uses it (compared without case
 * or outer spaces); otherwise the name dated with the reader's today, `Review
 * fixture (imported 15 Oct)`, then `(imported 15 Oct, 2)` and on. A name that
 * already ends in an import date is re-dated rather than given a second one.
 *
 * Applied by the app's import alone: be-01 still creates whatever name the
 * document carries, so an API or MCP import keeps the file's name.
 */
export function distinctImportName(name: string, taken: readonly string[], now: Date): string {
  const used = new Set(taken.map(nameKey));
  if (!used.has(nameKey(name))) return name;
  const base = name.replace(IMPORTED_SUFFIX, '');
  const day = shortInstant(now.getTime(), now);
  for (let copy = 1; ; copy += 1) {
    const candidate = `${base} (imported ${day}${copy === 1 ? '' : `, ${String(copy)}`})`;
    if (!used.has(nameKey(candidate))) return candidate;
  }
}
