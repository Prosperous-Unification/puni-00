import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'bun:test';
import { DiBag, type GraphSnapshot } from 'di-bag';

const WORKSPACE = fileURLToPath(new URL('../../..', import.meta.url));

/**
 * The two directories whose subdirectories are the sealed DI Bag modules of `adopt-di-composition`,
 * and the identifier segment each location implies: a library module carries its ring, a module
 * under an app its runtime word. `apps/wbs/fe-01/src/modules` is outside this change and carries
 * no index block yet, so it is not read here.
 */
const MODULE_ROOTS = [
  { root: 'libs/wbs/application/core/src/module', segment: 'application' },
  { root: 'apps/wbs/be-01/src/module', segment: 'backend' },
] as const;

/**
 * The sealed modules with no content-review pilot registration. Both predecessors postdate the
 * pilot's frozen `sourceRevision`, so no `sourceSelector` can bind them (task 7.5).
 */
const UNREGISTERED = ['module.application.plan-document', 'module.application.plan-import'];

/** The project a `kinds.json` shim row lives in, and the segment of the modules it may name. */
const PROJECTS = [
  { prefix: 'libs/wbs/application/core/', segment: 'application' },
  { prefix: 'apps/wbs/be-01/', segment: 'backend' },
] as const;

/** How a `kinds.json` shim row names the module that owns what it re-exports. */
const SHIM_OWNER =
  /^re-export shim; delete when importers use (?:@wbs\/core or )?the ([a-z0-9-]+) module directly$/;

/**
 * The other shim dispositions `kinds.json` uses, which forward a be-01 file to a library rather
 * than to a module; the capture is the core service file a `@wbs/core/service/<file>` row names.
 * Any row mentioning a shim that is neither this, on a be-01 path, nor {@link SHIM_OWNER} is
 * refused, and a named core service file must exist.
 *
 * Known limit: a be-01 owner row rewritten into the `@wbs/core directly` or
 * `@wbs/runtime-portable directly` form is skipped, until forwarding rows are compared by identity
 * against the library's index. The kind rules own the wording.
 */
const SHIM_FORWARD =
  /^re-export shim; delete when importers use @wbs\/(?:core(?:\/service\/([a-z0-9.-]+))?|runtime-portable) directly$/;

/** Where a `@wbs/core/service/<file>` forwarding row's file lives. */
const CORE_SERVICES = 'libs/wbs/application/core/src/service';

/** One sealed module directory and the identity its location implies. */
interface SealedModule {
  readonly directory: string;
  readonly moduleId: string;
  readonly label: string;
}

/**
 * Every module directory under {@link MODULE_ROOTS}, sorted within each root. `stat` follows a
 * symbolic link, so a linked module directory is read rather than skipped.
 *
 * @throws When a root is unreadable or holds no directory: a moved root would otherwise read as
 *   "no module disagrees".
 */
async function sealedModules(): Promise<readonly SealedModule[]> {
  const modules: SealedModule[] = [];
  for (const { root, segment } of MODULE_ROOTS) {
    const names: string[] = [];
    // Proof (2026-09-24): pointing the backend root at a missing `src/modules` failed all five
    // tests with `ENOENT: no such file or directory, scandir` (0 pass, 5 fail).
    for (const entry of await readdir(join(WORKSPACE, root))) {
      if ((await stat(join(WORKSPACE, root, entry))).isDirectory()) names.push(entry);
    }
    names.sort();
    // Proof (2026-09-24): keeping files instead of directories failed all five tests with
    // `libs/wbs/application/core/src/module holds no module directory` (0 pass, 5 fail).
    if (names.length === 0) throw new Error(`${root} holds no module directory`);
    for (const name of names) {
      modules.push({
        directory: `${root}/${name}`,
        moduleId: `module.${segment}.${name}`,
        label: `${segment}.${name}`,
      });
    }
  }
  return modules;
}

/** Every runtime value a file exports, in export order. */
async function exportedValues(path: string): Promise<readonly unknown[]> {
  const namespace: unknown = await import(join(WORKSPACE, path));
  if (typeof namespace !== 'object' || namespace === null) {
    throw new Error(`${path} did not load as a module namespace`);
  }
  const values: readonly unknown[] = Object.values(namespace);
  return values;
}

/**
 * The labels di-bag gives the private bindings of one installation of the module `module.ts`
 * exports, read from the running library rather than from any spelling in the source.
 *
 * Exported bindings keep their bare key and carry their public names in `serviceKeys`, so only a
 * binding with no key is read: an exported key that merely contains a slash cannot pass for a label. The
 * label is observable only this way, so every sealed module keeps at least one private binding by
 * convention; one that exports every binding is refused as sealing none.
 *
 * Known limit: di-bag exposes a label only as the prefix of private binding names — 0.5.0 keeps
 * `moduleLabel` write-only, held in a private `WeakMap` — so a module that drops its label and
 * either spells `<label>/<key>` into a private key or installs an inner module sealed under that
 * label reads as labelled. Closing that needs a label accessor the library does not have yet (WBS
 * 040.13, left open by the 0.5.0 migration).
 *
 * @throws When `module.ts` exports anything but exactly one value, or when di-bag refuses it as a
 *   module.
 */
async function privateBindingLabels(directory: string): Promise<readonly string[]> {
  const values = await exportedValues(`${directory}/module.ts`);
  // Proof (2026-09-24): appending `export const decoy = capacityModule;` to Capacity's module.ts
  // failed "seals every module under the label its location implies" with `…/capacity/module.ts
  // exports 2 values, expected 1` (4 pass, 1 fail).
  if (values.length !== 1) {
    throw new Error(`${directory}/module.ts exports ${String(values.length)} values, expected 1`);
  }
  // The host below supplies none of the module's requirements, which the type checker refuses;
  // the runtime still builds the graph, and describing it resolves nothing.
  const builder = DiBag.createBuilder() as unknown as {
    withInstalledModules: (modules: readonly unknown[]) => {
      buildContainer: () => { graphSnapshot: () => GraphSnapshot };
    };
  };
  const graph = builder.withInstalledModules([values[0]]).buildContainer().graphSnapshot();
  // Proof (2026-09-24): reading no binding as private reported every one of the eighteen modules
  // as `seals no private binding` in "seals every module under the label its location implies"
  // (4 pass, 1 fail).
  return graph.bindings
    .filter((binding) => binding.serviceKeys.length === 0)
    .map((binding) => binding.bindingLabel);
}

/**
 * The `moduleId` of the one `module-index` block in a module's README.
 *
 * The wiki reads any HTML comment containing `module-index`, however spaced, across lines, and
 * never inside a code fence. Rather than reimplement that grammar, the README may hold exactly one
 * `<!--` at all, in prose, a code span or a fence alike, on a line in the one spelling written
 * here, with no code fence opening above it. So the check and the wiki read the same identifier or
 * the check refuses: a block inside a fence is refused, and a block the wiki reads across several
 * lines is refused as not a module-index line.
 *
 * @throws When the README is unreadable, holds any other HTML comment or none, its one comment is
 *   not that line, a code fence opens above it, or the block is not JSON carrying a string
 *   `moduleId`.
 */
async function indexedModuleId(directory: string): Promise<string> {
  const source = await readFile(join(WORKSPACE, directory, 'README.md'), 'utf8');
  const comments = source.split('<!--').length - 1;
  // Proof (2026-09-24): repeating Capacity's index line at the end of its README, and appending
  // it inside a Markdown code fence instead, each failed "indexes every module under the
  // identifier its location implies" with `…/capacity/README.md holds 2 HTML comments, expected
  // 1` (4 pass, 1 fail each).
  if (comments !== 1) {
    throw new Error(`${directory}/README.md holds ${String(comments)} HTML comments, expected 1`);
  }
  const blocks = source
    .split('\n')
    .map((line) => /^<!-- module-index (\{.*\}) -->$/.exec(line)?.[1])
    .filter((block) => block !== undefined);
  // Proof (2026-09-24): respelling Capacity's block `<!--module-index {`, which the wiki still
  // reads, failed the same test with `…/capacity/README.md's one HTML comment is not a
  // module-index line` (4 pass, 1 fail).
  if (blocks.length !== 1) {
    throw new Error(`${directory}/README.md's one HTML comment is not a module-index line`);
  }
  const lines = source.split('\n');
  const at = lines.findIndex((line) => line.startsWith('<!-- module-index '));
  // Proof (2026-09-24): wrapping Plan document's index line in a Markdown code fence, which the
  // wiki then ignores, failed the same test with `…/plan-document/README.md's module-index line
  // follows a code fence` (4 pass, 1 fail).
  if (lines.slice(0, at).some((line) => /^ {0,3}(```|~~~)/.test(line))) {
    throw new Error(`${directory}/README.md's module-index line follows a code fence`);
  }
  const parsed: unknown = JSON.parse(blocks[0]);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('moduleId' in parsed) ||
    typeof parsed.moduleId !== 'string'
  ) {
    throw new Error(`${directory}/README.md's module-index block names no moduleId`);
  }
  return parsed.moduleId;
}

/** One JSON record: the fields this check reads, each checked where it is read. */
type JsonRecord = Readonly<Record<string, unknown>>;

/** A JSON file's array under one top-level key, each element an object. */
async function recordsOf(path: string, key: string): Promise<readonly JsonRecord[]> {
  const parsed: unknown = JSON.parse(await readFile(join(WORKSPACE, path), 'utf8'));
  const records: unknown =
    typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, key) : undefined;
  if (!Array.isArray(records)) throw new Error(`${path} has no ${key} array`);
  return records.map((record: unknown, index) => {
    if (typeof record !== 'object' || record === null) {
      throw new Error(`${path} ${key}[${String(index)}] is not an object`);
    }
    return Object.fromEntries(Object.entries(record));
  });
}

/** One string field of a record, or `undefined` when the record carries none. */
function textOf(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

/** The module directory a path lies in, when it lies under one of {@link MODULE_ROOTS}. */
function moduleDirectoryOf(path: string): string | undefined {
  for (const { root } of MODULE_ROOTS) {
    if (path.startsWith(`${root}/`)) return `${root}/${path.slice(root.length + 1).split('/')[0]}`;
  }
  return undefined;
}

test('discovers the sealed modules of both roots', async () => {
  const identifiers = (await sealedModules()).map(({ moduleId }) => moduleId);

  expect(identifiers).toContain('module.application.plan-history');
  expect(identifiers).toContain('module.backend.optimization');
});

test('seals every module under the label its location implies', async () => {
  const mismatches: string[] = [];
  for (const { directory, label } of await sealedModules()) {
    const labels = await privateBindingLabels(directory);
    if (labels.length === 0) mismatches.push(`${directory}: seals no private binding`);
    for (const binding of labels) {
      // One identifier after the label: a label with a slash in it, or a labelled outer module,
      // would otherwise put a different label in front of a key that looks right.
      const key = binding.startsWith(`${label}/`) ? binding.slice(label.length + 1) : '';
      // Proof (2026-09-24): Capacity's contract label set to `application.capacities`, then to
      // `application.capacity/nested`, and its `buildModule` call without the label each failed
      // "seals every module under the label its location implies" naming the private binding
      // `application.capacities/capacityOptions`, `application.capacity/nested/capacityOptions`
      // and `capacityOptions` (4 pass, 1 fail each); with the first of them Capacity's own
      // module tests stayed green (5 pass), the drift no earlier check saw.
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) {
        mismatches.push(`${directory}: private binding "${binding}" is not under ${label}`);
      }
    }
  }

  expect(mismatches).toEqual([]);
});

test('indexes every module under the identifier its location implies', async () => {
  const mismatches: string[] = [];
  for (const { directory, moduleId } of await sealedModules()) {
    const indexed = await indexedModuleId(directory);
    // Proof (2026-09-24): Capacity's README naming `module.application.capacities` failed this
    // test with `…/capacity: README names module.application.capacities` (4 pass, 1 fail).
    if (indexed !== moduleId) mismatches.push(`${directory}: README names ${indexed}`);
  }

  expect(mismatches).toEqual([]);
});

test('registers every module in the pilot under that identifier, or is known not to', async () => {
  const modules = await sealedModules();
  const rows = await recordsOf('docs/wiki-policy/modules.json', 'modules');
  const boundaries = await recordsOf('docs/wiki-policy/policy.json', 'boundaries');
  const mismatches: string[] = [];
  const unregistered: string[] = [];
  for (const { directory, moduleId, label } of modules) {
    const row = rows.filter((candidate) => textOf(candidate, 'moduleId') === moduleId);
    const boundary = boundaries.filter(
      (candidate) => textOf(candidate, 'boundaryId') === `boundary.${label}`,
    );
    if (row.length === 0 && boundary.length === 0) {
      unregistered.push(moduleId);
      continue;
    }
    // Proof (2026-09-24): Capacity's `modules.json` row renamed `module.application.capacities`
    // failed "registers every module in the pilot under that identifier, or is known not to" with
    // `…/capacity: modules.json does not index it once as module.application.capacity` and the
    // reverse clause's line (4 pass, 1 fail).
    if (row.length !== 1 || textOf(row[0], 'indexPath') !== `${directory}/README.md`) {
      mismatches.push(`${directory}: modules.json does not index it once as ${moduleId}`);
    }
    // Proof (2026-09-24): Capacity's boundary renamed `boundary.application.capacities`, then its
    // selector pointed at the Step directory, each failed the same test with `…/capacity:
    // policy.json does not select it once as boundary.application.capacity` (4 pass, 1 fail).
    if (
      boundary.length !== 1 ||
      JSON.stringify(boundary[0]['selector']) !==
        JSON.stringify({ kind: 'prefix', value: directory })
    ) {
      mismatches.push(`${directory}: policy.json does not select it once as boundary.${label}`);
    }
  }
  for (const row of rows) {
    const directory = moduleDirectoryOf(textOf(row, 'indexPath') ?? '');
    const owner = modules.find((candidate) => candidate.directory === directory);
    // Proof (2026-09-24): the Memory source row's index path moved to Plan document's README
    // failed the same test with `modules.json: module.adapter.store-memory indexes
    // …/plan-document` alone (4 pass, 1 fail).
    if (directory !== undefined && owner?.moduleId !== textOf(row, 'moduleId')) {
      mismatches.push(`modules.json: ${String(textOf(row, 'moduleId'))} indexes ${directory}`);
    }
  }

  expect(mismatches).toEqual([]);
  // Proof (2026-09-24): dropping Capacity's `modules.json` row and `policy.json` boundary failed
  // the same test here, the received list gaining `module.application.capacity` (4 pass, 1 fail).
  expect(unregistered).toEqual(UNREGISTERED);
});

test('names in kinds.json only the module that owns every export of the shim', async () => {
  const modules = await sealedModules();
  const entries = await recordsOf('docs/code-organization/kinds.json', 'entries');
  const mismatches: string[] = [];
  let named = 0;
  for (const entry of entries) {
    const path = textOf(entry, 'path');
    const disposition = textOf(entry, 'disposition') ?? '';
    const owner = SHIM_OWNER.exec(disposition)?.[1];
    if (path === undefined) continue;
    if (owner === undefined) {
      // Proof (2026-09-24): Capacity's shim row starting `Re-export shim` failed "names in
      // kinds.json only the module that owns every export of the shim" with
      // `…/service/capacity.service.ts: re-export shim disposition matches no known form`
      // (4 pass, 1 fail).
      if (!/shim/i.test(disposition)) continue;
      const forward = path.startsWith('apps/wbs/be-01/') ? SHIM_FORWARD.exec(disposition) : null;
      const service = forward?.[1];
      // Proof (2026-09-24): Capacity's shim row reworded to end `the capacity module`, and
      // rewritten into the `@wbs/core directly` form only be-01 rows may use, each failed the same
      // test with `…/service/capacity.service.ts: re-export shim disposition matches no known
      // form` (4 pass, 1 fail each).
      if (forward === null) {
        mismatches.push(`${path}: re-export shim disposition matches no known form`);
      } else if (
        service !== undefined &&
        !(await Bun.file(join(WORKSPACE, CORE_SERVICES, `${service}.ts`)).exists())
      ) {
        // Proof (2026-09-24): the be-01 `assumed-assignee.ts` row forwarding to a missing
        // `assumed-assignee-missing` failed the same test with `…: forwards to a core service
        // that does not exist: assumed-assignee-missing` (4 pass, 1 fail).
        mismatches.push(`${path}: forwards to a core service that does not exist: ${service}`);
      }
      continue;
    }
    named += 1;
    const project = PROJECTS.find(({ prefix }) => path.startsWith(prefix));
    const module = modules.find(
      ({ moduleId }) => moduleId === `module.${String(project?.segment)}.${owner}`,
    );
    // Proof (2026-09-24): Capacity's shim row naming `the capacities module` failed the same test
    // with `…/service/capacity.service.ts: names no sealed module capacities` (4 pass, 1 fail).
    if (module === undefined) {
      mismatches.push(`${path}: names no sealed module ${owner}`);
      continue;
    }
    const files = (await readdir(join(WORKSPACE, module.directory))).filter(
      (file) => file.endsWith('.ts') && !file.endsWith('.test.ts'),
    );
    const owned = new Set<unknown>();
    for (const file of files) {
      for (const value of await exportedValues(`${module.directory}/${file}`)) owned.add(value);
    }
    const shimmed = await exportedValues(path);
    // Proof (2026-09-24): Capacity's shim row naming `the step module` failed the same test with
    // `…/service/capacity.service.ts: re-exports what …/module/step does not export`
    // (4 pass, 1 fail).
    if (shimmed.length === 0 || shimmed.some((value) => !owned.has(value))) {
      mismatches.push(`${path}: re-exports what ${module.directory} does not export`);
    }
  }

  // Proof (2026-09-24): a pattern expecting `modules directly` matched no row and failed the
  // same test here with `Expected: > 0`, `Received: 0` (4 pass, 1 fail).
  expect(named).toBeGreaterThan(0);
  expect(mismatches).toEqual([]);
});
