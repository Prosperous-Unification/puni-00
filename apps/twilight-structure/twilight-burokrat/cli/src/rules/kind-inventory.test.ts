import { Buffer } from 'node:buffer';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import type { CandidateEntry } from '../inventory/read-candidate';
import { resolveKinds } from './kinds';

const cliPath = join(import.meta.dir, '..', 'cli.ts');
const inventoryPath = 'docs/kinds.json';
const scratchRoots: string[] = [];

afterEach(() => {
  for (const root of scratchRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function scratch(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  scratchRoots.push(root);
  return root;
}

function runGit(repository: string, argv: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...argv], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  expect(invocation.exitCode, invocation.stderr.toString('utf8')).toBe(0);
  return invocation.stdout.toString('utf8').trim();
}

function write(root: string, path: string, source: string): void {
  const absolutePath = join(root, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, source, 'utf8');
}

interface InventoryEntry {
  path: string;
  kind: string;
  disposition?: string;
}

function inventorySource(entries: InventoryEntry[]): string {
  return `${JSON.stringify({ reviewed: '2026-09-27', entries })}\n`;
}

/**
 * A candidate whose TypeScript the relationship extractor accepts. `inventory` is committed at
 * {@link inventoryPath} as given: a string verbatim, an entry list as a well-formed inventory,
 * `undefined` not at all.
 */
function commitCandidate(
  sources: Record<string, string>,
  inventory: string | InventoryEntry[] | undefined,
): { repository: string; revision: string } {
  const repository = scratch('twilight-kind-inventory-');
  runGit(repository, ['init', '--initial-branch=main']);
  runGit(repository, ['config', 'user.email', 'rules@example.test']);
  runGit(repository, ['config', 'user.name', 'Rules Fixture']);
  write(repository, 'nx.json', '{"$schema":"./node_modules/nx/schemas/nx-schema.json"}\n');
  write(repository, 'package.json', '{"name":"kind-inventory-fixture","private":true}\n');
  write(
    repository,
    'tsconfig.json',
    '{"compilerOptions":{"strict":true,"module":"ESNext","moduleResolution":"bundler","target":"ES2022"}}\n',
  );
  write(repository, 'src/entry.ts', 'export const entry = 1;\n');
  for (const [path, source] of Object.entries(sources)) write(repository, path, source);
  if (inventory !== undefined) {
    write(
      repository,
      inventoryPath,
      typeof inventory === 'string' ? inventory : inventorySource(inventory),
    );
  }
  runGit(repository, ['add', '--all']);
  runGit(repository, ['commit', '--message', 'candidate']);
  return { repository, revision: runGit(repository, ['rev-parse', 'HEAD']) };
}

const ruleIds = [
  'F1',
  'F7',
  'INV-CLASSIFY',
  'K2',
  'K3',
  'K4',
  'K5',
  'K6',
  'MOD-DIRECT-ENTRIES',
  'MOD-INDEX',
  'MOD-LAYOUT',
  'REL-EXTRACT',
];

/** A rule policy outside every candidate; it names the inventory unless told otherwise. */
function writePolicy(options: { namesInventory: boolean }): string {
  const path = join(scratch('twilight-kind-inventory-policy-'), 'rule-policy.json');
  writeFileSync(
    path,
    `${JSON.stringify({
      schemaVersion: 1,
      policyId: 'rules.kind-inventory.v1',
      ruleModes: ruleIds.map((ruleId) => ({ ruleId, mode: 'observe' })),
      relationshipRequest: {
        schemaVersion: 1,
        typescript: { configPaths: ['tsconfig.json'], publicEntrypoints: ['src/entry.ts'] },
      },
      plainTypeScriptPaths: [],
      ...(options.namesInventory ? { kindInventory: { path: inventoryPath } } : {}),
    })}\n`,
    'utf8',
  );
  return path;
}

interface Verdict {
  allowed: boolean;
  findings: { ruleId: string; path: string; subject?: string; message: string }[];
  unevaluated: { ruleId: string; reason: string }[];
}

function check(
  candidate: { repository: string; revision: string },
  ruleId: string,
  policyPath = writePolicy({ namesInventory: true }),
): { exitCode: number; stderr: string; verdict: Verdict } {
  const invocation = Bun.spawnSync(
    [
      process.execPath,
      'run',
      cliPath,
      'check',
      'committed',
      candidate.repository,
      candidate.revision,
      policyPath,
      '--rule',
      ruleId,
    ],
    { cwd: import.meta.dir, env: process.env, stderr: 'pipe', stdout: 'pipe' },
  );
  const stderr = Buffer.from(invocation.stderr).toString('utf8');
  const stdout = Buffer.from(invocation.stdout).toString('utf8');
  expect(stdout.length, stderr).toBeGreaterThan(0);
  return { exitCode: invocation.exitCode, stderr, verdict: JSON.parse(stdout) as Verdict };
}

/** A delivery file importing an unsuffixed store the inventory may call a resource. */
const deliveryImportsStore = {
  'src/m/store.ts': 'export const load = (): number => 1;\n',
  'src/m/view/panel.ts':
    "import { load } from '../store';\nexport const panel = (): number => load();\n",
};
const storeIsResource: InventoryEntry[] = [{ path: 'src/m/store.ts', kind: 'resource' }];

describe('kind inventory in the kind graph', () => {
  const entry = (path: string): CandidateEntry => ({ path, mode: '100644', blob: '0'.repeat(40) });

  test('gives an unsuffixed file its declared kind and module, and keeps support files unjudged', () => {
    const graph = resolveKinds(
      ['m/store.ts', 'm/shim.ts', 'm/view/panel.ts', 'n/n.feature.ts'].map(entry),
      [
        { path: 'm/store.ts', kind: 'resource' },
        { path: 'm/shim.ts', kind: 'support' },
      ],
    );
    expect(graph.files.map((file) => [file.path, file.kind, file.module])).toEqual([
      ['m/store.ts', 'resource', 'm'],
      ['m/view/panel.ts', 'delivery', 'm'],
      ['n/n.feature.ts', 'feature', 'n'],
    ]);
    expect(graph.moduleRoots).toEqual(['m', 'n']);
    expect(graph.supportFiles).toEqual(['m/shim.ts']);
  });

  test('keeps a delivery entry in its enclosing module, with its sibling view files', () => {
    const graph = resolveKinds(
      ['m/a.resource.ts', 'm/view/panel.ts', 'm/view/other.ts'].map(entry),
      [{ path: 'm/view/panel.ts', kind: 'delivery' }],
    );
    expect(graph.files.map((file) => [file.path, file.kind, file.module])).toEqual([
      ['m/a.resource.ts', 'resource', 'm'],
      ['m/view/other.ts', 'delivery', 'm'],
      ['m/view/panel.ts', 'delivery', 'm'],
    ]);
    expect(graph.moduleRoots).toEqual(['m']);
  });

  test('refuses a delivery entry that no module contains', () => {
    expect(() =>
      resolveKinds(['loose/panel.ts'].map(entry), [{ path: 'loose/panel.ts', kind: 'delivery' }]),
    ).toThrow('kind inventory calls loose/panel.ts delivery, but no module contains it');
  });

  test('refuses an entry for a composition root, which stays exempt', () => {
    // Proof: on 2026-09-27, deleting the composition-root conflict made this call return a graph
    // instead of throwing.
    expect(() =>
      resolveKinds(['m/m.resource.ts', 'm/composition.ts'].map(entry), [
        { path: 'm/composition.ts', kind: 'feature' },
      ]),
    ).toThrow('kind inventory classifies composition root m/composition.ts');
  });
});

describe('kind inventory through the production CLI', () => {
  test('an inventory-declared resource makes an unsuffixed delivery import a K2 finding', () => {
    const candidate = commitCandidate(deliveryImportsStore, storeIsResource);
    // Proof: on 2026-09-27, passing no inventory entries to resolveKinds in check.ts made this test
    // receive `findings: []`.
    const outcome = check(candidate, 'K2');
    expect(outcome.verdict.findings).toEqual([
      {
        ruleId: 'K2',
        path: 'src/m/view/panel.ts',
        subject: 'src/m/store.ts',
        message: "delivery imports resource src/m/store.ts through '../store'",
        effect: 'debt',
      } as Verdict['findings'][number],
    ]);
    expect(outcome.exitCode, outcome.stderr).toBe(0);
  }, 30_000);

  const unsuffixedEdges: [string, Record<string, string>, InventoryEntry[], string, string][] = [
    [
      'K3',
      {
        'src/m/run.ts':
          "import { read } from './store';\nexport const run = (): number => read();\n",
        'src/m/store.ts': 'export const read = (): number => 1;\n',
      },
      [
        { path: 'src/m/run.ts', kind: 'feature' },
        { path: 'src/m/store.ts', kind: 'repository' },
      ],
      'src/m/run.ts',
      'src/m/store.ts',
    ],
    [
      'K4',
      {
        'src/m/load.ts': "import { run } from './run';\nexport const load = (): number => run();\n",
        'src/m/run.ts': 'export const run = (): number => 1;\n',
      },
      [
        { path: 'src/m/load.ts', kind: 'resource' },
        { path: 'src/m/run.ts', kind: 'feature' },
      ],
      'src/m/load.ts',
      'src/m/run.ts',
    ],
    [
      'K5',
      {
        'src/m/store.ts':
          "import { load } from './load';\nexport const read = (): number => load();\n",
        'src/m/load.ts': 'export const load = (): number => 1;\n',
      },
      [
        { path: 'src/m/load.ts', kind: 'resource' },
        { path: 'src/m/store.ts', kind: 'repository' },
      ],
      'src/m/store.ts',
      'src/m/load.ts',
    ],
    [
      'K6',
      {
        'src/a/load.ts':
          "import { other } from '../b/load';\nexport const load = (): number => other();\n",
        'src/b/load.ts': 'export const other = (): number => 1;\n',
      },
      [
        { path: 'src/a/load.ts', kind: 'resource' },
        { path: 'src/b/load.ts', kind: 'resource' },
      ],
      'src/a/load.ts',
      'src/b/load.ts',
    ],
  ];

  for (const [ruleId, sources, inventory, source, target] of unsuffixedEdges) {
    test(`an inventory-declared forbidden edge is a ${ruleId} finding`, () => {
      // Proof: on 2026-09-27, passing no inventory entries to resolveKinds in check.ts made each of
      // these tests receive `findings: []`.
      const outcome = check(commitCandidate(sources, inventory), ruleId);
      expect(
        outcome.verdict.findings.map((finding) => [finding.ruleId, finding.path, finding.subject]),
      ).toEqual([[ruleId, source, target]]);
      expect(outcome.exitCode, outcome.stderr).toBe(0);
    }, 30_000);
  }

  test('an unreadable selected inventory blob is reported as a Git read failure', () => {
    const candidate = commitCandidate(deliveryImportsStore, storeIsResource);
    const blob = runGit(candidate.repository, ['rev-parse', `HEAD:${inventoryPath}`]);
    rmSync(join(candidate.repository, '.git', 'objects', blob.slice(0, 2), blob.slice(2)));
    // Proof: on 2026-09-27, moving the blob read inside the JSON error boundary made this reason
    // start `malformed kind inventory JSON` instead.
    const outcome = check(candidate, 'K2');
    expect(outcome.verdict.unevaluated).toHaveLength(1);
    expect(outcome.verdict.unevaluated[0]?.reason).toStartWith(
      `cannot read selected blob ${blob} for ${inventoryPath}`,
    );
    expect(outcome.exitCode).toBe(1);
  }, 30_000);

  test('without a named inventory the same candidate stays suffix-only', () => {
    const candidate = commitCandidate(deliveryImportsStore, storeIsResource);
    const outcome = check(candidate, 'K2', writePolicy({ namesInventory: false }));
    expect(outcome.verdict.findings).toEqual([]);
    expect(outcome.exitCode, outcome.stderr).toBe(0);
  }, 30_000);

  test('a support entry is never judged', () => {
    const candidate = commitCandidate(deliveryImportsStore, [
      { path: 'src/m/store.ts', kind: 'support', disposition: 're-export shim; fixture' },
    ]);
    const outcome = check(candidate, 'K2');
    expect(outcome.verdict.findings).toEqual([]);
    expect(outcome.verdict.unevaluated).toEqual([]);
    expect(outcome.exitCode, outcome.stderr).toBe(0);
  }, 30_000);

  test('reads the inventory of the selected revision, not the checkout', () => {
    const candidate = commitCandidate(deliveryImportsStore, storeIsResource);
    writeFileSync(join(candidate.repository, inventoryPath), inventorySource([]), 'utf8');
    // Proof: on 2026-09-27, reading the inventory with readFileSync from the repository checkout
    // made this test receive `findings: []`.
    expect(check(candidate, 'K2').verdict.findings.map((finding) => finding.path)).toEqual([
      'src/m/view/panel.ts',
    ]);
  }, 30_000);

  const refusals: [
    string,
    string | InventoryEntry[] | undefined,
    Record<string, string>,
    string,
  ][] = [
    [
      'absent from the candidate',
      undefined,
      {},
      // Proof: on 2026-09-27, returning no entries for an absent inventory made this test receive
      // `unevaluated: []` for F1.
      `kind inventory ${inventoryPath} is not a regular file in the selected candidate`,
    ],
    [
      'malformed JSON',
      '{\n',
      {},
      // Proof: on 2026-09-27, removing the JSON error boundary lost the inventory path from
      // this reason, which became only `JSON Parse error: Expected '}'`.
      `malformed kind inventory JSON ${inventoryPath}`,
    ],
    [
      'failing the schema',
      inventorySource([{ path: 'src/m/store.ts', kind: 'service' }]),
      {},
      'kind must be',
    ],
    [
      'classifying one path twice',
      [...storeIsResource, { path: 'src/m/store.ts', kind: 'feature' }],
      {},
      // Proof: on 2026-09-27, deleting the duplicate check made this test receive
      // `unevaluated: []` for F1.
      `kind inventory ${inventoryPath} classifies src/m/store.ts twice`,
    ],
    [
      'listing a stale path',
      [...storeIsResource, { path: 'src/m/gone.ts', kind: 'feature' }],
      {},
      // Proof: on 2026-09-27, deleting the stale-path check made this test receive
      // `unevaluated: []` for F1.
      `kind inventory ${inventoryPath} lists src/m/gone.ts, which is not a regular file in the selected candidate`,
    ],
    [
      'contradicting a filename suffix',
      [...storeIsResource, { path: 'src/n/n.feature.ts', kind: 'resource' }],
      { 'src/n/n.feature.ts': 'export const run = (): number => 1;\n' },
      // Proof: on 2026-09-27, deleting the suffix conflict made this test receive
      // `unevaluated: []` for F1.
      'kind inventory classifies src/n/n.feature.ts, which declares its kind by suffix',
    ],
    [
      'classifying a composition root',
      [...storeIsResource, { path: 'src/m/composition.ts', kind: 'feature' }],
      { 'src/m/composition.ts': 'export const wire = (): number => 1;\n' },
      // Proof: on 2026-09-27, deleting the composition-root conflict made this test receive
      // `unevaluated: []` for F1.
      'kind inventory classifies composition root src/m/composition.ts',
    ],
  ];

  for (const [name, inventory, extra, reason] of refusals) {
    test(`leaves every kind rule unevaluated for an inventory ${name}`, () => {
      const candidate = commitCandidate({ ...deliveryImportsStore, ...extra }, inventory);
      for (const ruleId of ['F1', 'K2', 'K6', 'MOD-LAYOUT']) {
        const outcome = check(candidate, ruleId);
        expect(outcome.verdict.unevaluated.map((entry) => entry.ruleId)).toEqual([ruleId]);
        expect(outcome.verdict.unevaluated[0]?.reason).toContain(reason);
        expect(outcome.verdict.allowed).toBe(false);
        expect(outcome.exitCode).toBe(1);
      }
    }, 120_000);
  }

  test('the repository rule policy names the tracked kind inventory', () => {
    const policy = JSON.parse(
      readFileSync(
        join(import.meta.dir, '../../../../../../docs/code-organization/rule-policy.json'),
        'utf8',
      ),
    ) as { kindInventory?: { path: string } };
    expect(policy.kindInventory).toEqual({ path: 'docs/code-organization/kinds.json' });
  });
});
