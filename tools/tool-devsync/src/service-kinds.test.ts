import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// tool-devsync's `build` target runs shellcheck over `bin/*.sh` and bundles no TypeScript, so the
// buildable-library half of the boundary rule has no output to protect here. The half that does
// apply — `scope:infra` may reach `product:shared` — holds, and workspace-projects.test.ts checks
// it against the real Nx graph.
// eslint-disable-next-line @nx/enforce-module-boundaries -- no TypeScript build to protect
import { ValidationError } from '@shared/validation';
import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import {
  declaresKindBySuffix,
  entriesMissingRationale,
  entriesMissingRequiredField,
  type KindEntry,
  listServiceCandidates,
  listSuffixDeclaredFiles,
  readKinds,
  SHIM_DISPOSITION_PREFIX,
} from './service-kinds';

const WORKSPACE = fileURLToPath(new URL('../../..', import.meta.url));

/** The three roots with one tracked file each, so an emptiness refusal is not the default. */
const POPULATED_ROOTS: Readonly<Record<string, string>> = {
  'apps/wbs/be-01/src/service/optimizer-wiring.ts': 'export const wiring = 1;\n',
  'libs/wbs/application/core/src/service/step.service.ts': 'export const step = 1;\n',
  'libs/wbs/application/core/src/use-cases/save-plan.ts': 'export const savePlan = 1;\n',
};

async function runGit(root: string, args: readonly string[]): Promise<void> {
  const child = Bun.spawn(['git', '-C', root, ...args], { stderr: 'pipe', stdout: 'pipe' });
  const [failure, code] = await Promise.all([new Response(child.stderr).text(), child.exited]);
  if (code !== 0) {
    throw new Error(`git ${args.join(' ')} failed in ${root}: ${failure.trim()}`);
  }
}

/**
 * A throwaway Git workspace holding exactly `files`, staged so `git ls-files` sees them.
 *
 * `scratchAsync` puts it under this process's own scratch root, which the preload removes on exit,
 * so the repository under test is never this clone and never a fixed temporary path.
 */
async function gitFixture(
  prefix: string,
  files: Readonly<Record<string, string>>,
): Promise<string> {
  const root = await scratchAsync(prefix);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  await runGit(root, ['init', '-q']);
  await runGit(root, ['add', '-A']);
  return root;
}

/** A fixture whose only interesting content is the policy file itself. */
async function policyFixture(prefix: string, contents: string): Promise<string> {
  const root = await scratchAsync(prefix);
  await mkdir(join(root, 'docs/code-organization'), { recursive: true });
  await writeFile(join(root, 'docs/code-organization/kinds.json'), contents);
  return root;
}

test('a file that declares its kind by suffix owes no policy entry, wherever it lives', async () => {
  const root = await gitFixture('kinds-suffix-', {
    ...POPULATED_ROOTS,
    'apps/wbs/be-01/src/service/retention.feature.ts': 'export const sweep = 1;\n',
    'apps/wbs/fe-01/src/modules/directory/directory.resource.test.ts': 'export const t = 1;\n',
    'apps/wbs/fe-01/src/modules/directory/directory.resource.ts': 'export const dir = 1;\n',
    'apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.ts': 'export const s = 1;\n',
    'apps/wbs/fe-01/src/modules/preferences/preferences.resource.ts': 'export const p = 1;\n',
  });

  expect(await listServiceCandidates(root)).toEqual([
    'apps/wbs/be-01/src/service/optimizer-wiring.ts',
    'libs/wbs/application/core/src/service/step.service.ts',
    'libs/wbs/application/core/src/use-cases/save-plan.ts',
  ]);
  expect(await listSuffixDeclaredFiles(root)).toEqual([
    'apps/wbs/be-01/src/service/retention.feature.ts',
    'apps/wbs/fe-01/src/modules/directory/directory.resource.ts',
    'apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.ts',
    'apps/wbs/fe-01/src/modules/preferences/preferences.resource.ts',
  ]);
});

test('candidates are the non-test TypeScript files under the roots and nothing else', async () => {
  const root = await gitFixture('kinds-filter-', {
    ...POPULATED_ROOTS,
    'apps/wbs/be-01/src/service/fixtures/live-plan.json': '{}\n',
    'apps/wbs/be-01/src/service/nested/solver-exit-outcome.ts': 'export const exitCode = 1;\n',
    'apps/wbs/be-01/src/service/solver.spec.ts': 'export const spec = 1;\n',
    'apps/wbs/be-01/src/service/step.service.db.test.ts': 'export const dbTest = 1;\n',
    'apps/wbs/be-01/src/service/types.d.ts': 'export type Declared = string;\n',
    'apps/wbs/gw-01/src/service/gateway.ts': 'export const gateway = 1;\n',
  });

  expect(await listServiceCandidates(root)).toEqual([
    'apps/wbs/be-01/src/service/nested/solver-exit-outcome.ts',
    'apps/wbs/be-01/src/service/optimizer-wiring.ts',
    'libs/wbs/application/core/src/service/step.service.ts',
    'libs/wbs/application/core/src/use-cases/save-plan.ts',
  ]);
});

test('a service root that tracks nothing is refused, not read as an empty inventory', async () => {
  const root = await gitFixture('kinds-empty-root-', {
    'apps/wbs/be-01/src/service/optimizer-wiring.ts': 'export const wiring = 1;\n',
    'libs/wbs/application/core/src/service/step.service.ts': 'export const step = 1;\n',
  });

  expect(listServiceCandidates(root)).rejects.toThrow(
    /libs\/wbs\/application\/core\/src\/use-cases tracks no file/,
  );
});

test('a workspace Git cannot read is refused, not read as an empty inventory', async () => {
  const root = await scratchAsync('kinds-no-repo-');

  expect(listServiceCandidates(root)).rejects.toThrow(/git ls-files exited 128/);
});

test('an absent policy is refused, naming the file', async () => {
  const root = await scratchAsync('kinds-absent-');

  expect(readKinds(root)).rejects.toThrow(
    /cannot read the service kinds policy at .*docs\/code-organization\/kinds\.json/,
  );
});

test('an unreadable policy is refused, naming the file', async () => {
  const root = await scratchAsync('kinds-unreadable-');
  await mkdir(join(root, 'docs/code-organization/kinds.json'), { recursive: true });

  expect(readKinds(root)).rejects.toThrow(
    /cannot read the service kinds policy at .*docs\/code-organization\/kinds\.json/,
  );
});

test('a policy that is not JSON is refused, naming the file', async () => {
  const root = await policyFixture('kinds-not-json-', '{ "entries": [\n');

  expect(readKinds(root)).rejects.toThrow(/the service kinds policy at .*kinds\.json is not JSON/);
});

test('a policy that fails the schema is refused with the failing field', async () => {
  const root = await policyFixture(
    'kinds-schema-',
    JSON.stringify({ reviewed: '2026-09-20', entries: [{ path: 'x.ts', kind: 'service' }] }),
  );

  expect(readKinds(root)).rejects.toThrow(ValidationError);
  expect(readKinds(root)).rejects.toThrow(
    /entries\[0\]\.kind must be "delivery", "feature", "repository", "resource" or "support" \(was "service"\)/,
  );
});

test('a policy that classifies one path twice is refused, naming the path', async () => {
  const root = await policyFixture(
    'kinds-duplicate-',
    JSON.stringify({
      reviewed: '2026-09-20',
      entries: [
        { path: 'x.ts', kind: 'support', disposition: 'first' },
        { path: 'x.ts', kind: 'support', disposition: 'second' },
      ],
    }),
  );

  expect(readKinds(root)).rejects.toThrow(/classifies twice: x\.ts/);
});

test('a well-formed policy at the same fixture location is read, not refused', async () => {
  const root = await policyFixture(
    'kinds-control-',
    JSON.stringify({
      reviewed: '2026-09-20',
      entries: [{ path: 'x.ts', kind: 'resource', term: 'work item', rationale: 'why' }],
    }),
  );

  expect(await readKinds(root)).toEqual([
    { path: 'x.ts', kind: 'resource', term: 'work item', rationale: 'why' },
  ]);
});

test('an empty policy is well formed, so the inventory comparison is what catches it', async () => {
  const root = await policyFixture(
    'kinds-empty-',
    JSON.stringify({ reviewed: '2026-09-20', entries: [] }),
  );

  expect(await readKinds(root)).toEqual([]);
});

test('a kind asserted without the field that makes it checkable is named', () => {
  const entries: readonly KindEntry[] = [
    { path: 'a.ts', kind: 'feature', rationale: 'r' },
    { path: 'b.ts', kind: 'resource', rationale: 'r' },
    { path: 'c.ts', kind: 'support', rationale: 'r' },
    { path: 'd.ts', kind: 'feature', capability: 'realtime', rationale: 'r' },
    { path: 'e.ts', kind: 'resource', term: 'work item', rationale: 'r' },
    { path: 'f.ts', kind: 'support', disposition: 'pure domain code', rationale: 'r' },
    { path: 'g.ts', kind: 'repository', rationale: 'r' },
  ];

  expect(entriesMissingRequiredField(entries)).toEqual([
    'a.ts: capability',
    'b.ts: term',
    'c.ts: disposition',
  ]);
});

test('every entry but a re-export shim owes a written rationale', () => {
  const entries: readonly KindEntry[] = [
    { path: 'a.ts', kind: 'support', disposition: `${SHIM_DISPOSITION_PREFIX} delete when done` },
    { path: 'b.ts', kind: 'support', disposition: 'private member of c.ts' },
    { path: 'c.ts', kind: 'resource', term: 'work item' },
    { path: 'd.ts', kind: 'resource', term: 'work item', rationale: 'owns the estimate rules' },
  ];

  expect(entriesMissingRationale(entries)).toEqual(['b.ts', 'c.ts']);
});

test('every backend service file with no kind suffix is classified exactly once', async () => {
  const classified = (await readKinds(WORKSPACE)).map((entry) => entry.path).sort();

  // Proof: deleting assumed-assignee.ts put that path on a `-` line; adding does-not-exist.ts put
  // it on a `+` line; and changing the former path to assumed-assignee.resource.ts showed both
  // lines here (2026-09-20).
  expect(classified).toEqual([...(await listServiceCandidates(WORKSPACE))]);
});

test('each kind carries the field that keeps it honest', async () => {
  // Proof: removing calendar-marker.service.ts's term failed here naming that path and `term`
  // (2026-09-20).
  expect(entriesMissingRequiredField(await readKinds(WORKSPACE))).toEqual([]);
});

test('every entry that is not a re-export shim states its rationale', async () => {
  // Proof: removing optimization-coordinator.ts's rationale failed here naming that path
  // (2026-09-20).
  expect(entriesMissingRationale(await readKinds(WORKSPACE))).toEqual([]);
});

test('no entry classifies a file that already declares its kind by suffix', async () => {
  const declaredTwice = (await readKinds(WORKSPACE))
    .map((entry) => entry.path)
    .filter((path) => declaresKindBySuffix(path));

  // Proof: changing assumed-assignee.ts to assumed-assignee.resource.ts failed here naming the
  // suffix-declared path (2026-09-20).
  expect(declaredTwice).toEqual([]);
});
