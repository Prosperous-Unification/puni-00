import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, expect, it } from 'bun:test';

import { discoverConsumers } from './consumers';
import { checkInventory } from './inventory';
import type { Consumer, Runtime } from './model';
import { readWorkspace } from './workspace';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
interface Declaration {
  id: string;
  digest: string;
  runtime: Runtime;
  owner: string;
  callers: string[];
  replacement: string;
  verification: string;
  disposition: 'active' | 'historical';
  clientExposure: { kind: 'internal' } | { kind: 'client'; command: string[] };
}
function declare(site: Consumer, runtime: Runtime, callers: string[]): Declaration {
  return {
    id: site.id,
    digest: site.digest,
    runtime,
    owner: 'PUNI operations',
    callers,
    replacement: 'puni dash fixture check',
    verification: 'fixture operation and changed-source control',
    disposition: 'active',
    clientExposure: { kind: 'internal' },
  };
}
function createFixture(runtime: 'bun' | 'node' = 'bun') {
  const root = mkdtempSync(join(tmpdir(), 'puni inventory declarations '));
  roots.push(root);
  const initialized = Bun.spawnSync(['/usr/bin/git', 'init', '--quiet', root], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(initialized.exitCode).toBe(0);
  function write(path: string, text: string) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  write('package.json', JSON.stringify({ scripts: { verify: runtime + ' ./program.unknown' } }));
  write('program.unknown', 'console.log("fixture");');
  const sites = discoverConsumers(readWorkspace(root)),
    command = sites.find((site) => site.source === 'package.json' && site.kind === 'command'),
    program = sites.find((site) => site.source === 'program.unknown' && site.kind === 'entrypoint');
  if (command === undefined || program === undefined)
    throw new Error('fixture execution graph missing');
  const entries = [
    declare(command, runtime, [command.id]),
    declare(program, runtime, [command.id]),
  ];
  return { root, sites, command, program, entries, manifest: { schemaVersion: 1, entries }, write };
}

it('reconciles exact discovered identities with caller evidence and required ownership metadata', () => {
  const f = createFixture(),
    inventory = checkInventory(f.sites, f.manifest);
  expect(inventory.scope).toBe('entrypoint-package-nx-github');
  expect(inventory.entries).toHaveLength(2);
  expect(inventory.compliance).toEqual({ kind: 'bun-compatible' });
});
it('catalogues known Node execution while retaining the remaining Bun conversion sites', () => {
  const f = createFixture('node'),
    inventory = checkInventory(f.sites, f.manifest);
  expect(inventory.compliance.kind).toBe('remaining');
  if (inventory.compliance.kind !== 'remaining') throw new Error('legacy conversion sites missing');
  expect(inventory.compliance.consumers).toEqual(f.sites.map((site) => site.id).sort());
});
it('refuses a newly discovered executable absent from the declarations', () => {
  const f = createFixture();
  f.write('new/deep/new.xyz', '#!/usr/bin/env bun\n');
  chmodSync(join(f.root, 'new/deep/new.xyz'), 0o755);
  expect(() => checkInventory(discoverConsumers(readWorkspace(f.root)), f.manifest)).toThrow(
    'unclassified',
  );
});
it('refuses stale and duplicate declaration identities', () => {
  const f = createFixture();
  expect(() =>
    checkInventory(f.sites, {
      schemaVersion: 1,
      entries: [...f.entries, { ...f.entries[0], id: 'stale consumer' }],
    }),
  ).toThrow('stale');
  expect(() =>
    checkInventory(f.sites, { schemaVersion: 1, entries: [...f.entries, f.entries[0]] }),
  ).toThrow('duplicate');
});
it('refuses changed captured program bytes even when the invoking command body is unchanged', () => {
  const f = createFixture();
  f.write('program.unknown', 'changed program');
  expect(() => checkInventory(discoverConsumers(readWorkspace(f.root)), f.manifest)).toThrow(
    'changed',
  );
});
for (const field of ['owner', 'replacement', 'verification'] as const)
  it('refuses missing required declaration ' + field, () => {
    const f = createFixture();
    const invalid = { ...f.entries[0], [field]: '' };
    expect(() =>
      checkInventory(f.sites, { schemaVersion: 1, entries: [invalid, f.entries[1]] }),
    ).toThrow(field);
  });
it('refuses arbitrary or missing caller claims instead of treating nonempty strings as proof', () => {
  const f = createFixture();
  expect(() =>
    checkInventory(f.sites, {
      schemaVersion: 1,
      entries: [{ ...f.entries[0], callers: ['made up caller'] }, f.entries[1]],
    }),
  ).toThrow('caller');
  expect(() =>
    checkInventory(f.sites, {
      schemaVersion: 1,
      entries: [f.entries[0], { ...f.entries[1], callers: [] }],
    }),
  ).toThrow('caller');
});
it('does not allow a declaration to relabel observed Node execution as Bun', () => {
  const f = createFixture('node');
  expect(() =>
    checkInventory(f.sites, {
      schemaVersion: 1,
      entries: f.entries.map((entry) => ({ ...entry, runtime: 'bun' })),
    }),
  ).toThrow('runtime');
});
it('does not permit historical classification for an active field or referenced program', () => {
  const f = createFixture();
  for (const index of [0, 1])
    expect(() =>
      checkInventory(f.sites, {
        schemaVersion: 1,
        entries: f.entries.map((entry, position) =>
          position === index ? { ...entry, disposition: 'historical' } : entry,
        ),
      }),
    ).toThrow('historical');
});
it('allows an explicitly historical unreferenced executable without converting its specimen bytes', () => {
  const root = mkdtempSync(join(tmpdir(), 'puni historical specimen inventory '));
  roots.push(root);
  const initialized = Bun.spawnSync(['/usr/bin/git', 'init', '--quiet', root], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(initialized.exitCode).toBe(0);
  writeFileSync(join(root, 'historical.xyz'), '#!/usr/bin/env node\n');
  const sites = discoverConsumers(readWorkspace(root)),
    site = sites.at(0);
  if (site === undefined) throw new Error('historical specimen absent');
  const entry = { ...declare(site, 'node', []), disposition: 'historical' };
  expect(checkInventory(sites, { schemaVersion: 1, entries: [entry] }).compliance).toEqual({
    kind: 'bun-compatible',
  });
});
it('requires client routes to name the PUNI root and keeps them separate from installed execution proof', () => {
  const f = createFixture();
  expect(() =>
    checkInventory(f.sites, {
      schemaVersion: 1,
      entries: [
        { ...f.entries[0], clientExposure: { kind: 'client', command: ['twilight-dash', 'ops'] } },
        f.entries[1],
      ],
    }),
  ).toThrow('puni');
  const inventory = checkInventory(f.sites, {
    schemaVersion: 1,
    entries: [
      { ...f.entries[0], clientExposure: { kind: 'client', command: ['puni', 'dash', 'fixture'] } },
      f.entries[1],
    ],
  });
  expect(inventory.entries).toHaveLength(2);
});
it('does not let declarations bless wrappers ignored targets or other unresolved execution boundaries', () => {
  const f = createFixture();
  f.write('package.json', JSON.stringify({ scripts: { verify: 'env bun ./program.unknown' } }));
  const sites = discoverConsumers(readWorkspace(f.root)),
    site = sites.find((candidate) => candidate.kind === 'command');
  if (site === undefined) throw new Error('wrapper site missing');
  expect(() =>
    checkInventory(sites, { schemaVersion: 1, entries: [declare(site, 'unknown', [site.id])] }),
  ).toThrow('script inventory consumer is unresolved:');
});
it('does not let declarations bless wrappers or a known Bun interpreter with an ignored target', () => {
  const f = createFixture();
  f.write('.gitignore', 'program.unknown\n');
  const sites = discoverConsumers(readWorkspace(f.root));
  const site = sites.find((candidate) => candidate.kind === 'command');
  if (site === undefined) throw new Error('Bun invocation site missing');
  expect(site.observedRuntime).toBe('bun');
  expect(() =>
    checkInventory(sites, { schemaVersion: 1, entries: [declare(site, 'bun', [site.id])] }),
  ).toThrow('script inventory consumer is unresolved:');
});
for (const manifest of [
  null,
  [],
  {},
  { schemaVersion: 2, entries: [] },
  { schemaVersion: 1, entries: [], accepted: true },
])
  it('refuses missing unknown or malformed inventory envelope ' + JSON.stringify(manifest), () => {
    expect(() => checkInventory([], manifest)).toThrow();
  });
it('refuses duplicate discovered consumer identities rather than reconciling only the final copy', () => {
  const f = createFixture();
  expect(() => checkInventory([...f.sites, f.command], f.manifest)).toThrow('duplicate');
});
it('does not create a broad frozen-solver exemption from a declaration label', () => {
  const f = createFixture('node');
  expect(() =>
    checkInventory(f.sites, {
      schemaVersion: 1,
      entries: f.entries.map((entry) => ({ ...entry, disposition: 'frozen' })),
    }),
  ).toThrow('disposition');
});

it('refuses empty required strings duplicate caller claims and unknown metadata properties', () => {
  const f = createFixture(),
    entry = f.entries.at(0);
  if (entry === undefined) throw new Error('entry missing');
  for (const invalid of [
    { ...entry, owner: ' ' },
    { ...entry, callers: [f.command.id, f.command.id] },
    { ...entry, approved: true },
    { ...entry, digest: 'invalid' },
    { ...entry, clientExposure: { kind: 'internal', command: ['puni'] } },
  ])
    expect(() =>
      checkInventory(f.sites, { schemaVersion: 1, entries: [invalid, f.entries[1]] }),
    ).toThrow();
});
it('refuses historical client exposure even when no captured caller references the specimen', () => {
  const root = mkdtempSync(join(tmpdir(), 'puni historical client specimen '));
  roots.push(root);
  const initialized = Bun.spawnSync(['/usr/bin/git', 'init', '--quiet', root], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(initialized.exitCode).toBe(0);
  writeFileSync(join(root, 'specimen.xyz'), '#!/usr/bin/env bun\n');
  const sites = discoverConsumers(readWorkspace(root)),
    site = sites.at(0);
  if (site === undefined) throw new Error('specimen absent');
  const entry = {
    ...declare(site, 'bun', []),
    disposition: 'historical',
    clientExposure: { kind: 'client', command: ['puni', 'dash', 'specimen'] },
  };
  expect(() => checkInventory(sites, { schemaVersion: 1, entries: [entry] })).toThrow('historical');
});

it('allows repeated literal client arguments while still validating the PUNI root', () => {
  const f = createFixture();
  const entries = f.entries.map((entry) => ({
    ...entry,
    clientExposure: {
      kind: 'client',
      command: ['puni', 'dash', 'ops', 'job', 'run', '--', 'echo', 'echo'],
    },
  }));
  expect(checkInventory(f.sites, { schemaVersion: 1, entries }).entries).toHaveLength(2);
});
it('rejects unsupported runtime labels even for an opaque historical candidate', () => {
  const root = mkdtempSync(join(tmpdir(), 'puni historical runtime label '));
  roots.push(root);
  const initialized = Bun.spawnSync(['/usr/bin/git', 'init', '--quiet', root], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(initialized.exitCode).toBe(0);
  writeFileSync(join(root, 'specimen.xyz'), 'opaque specimen');
  chmodSync(join(root, 'specimen.xyz'), 0o755);
  const sites = discoverConsumers(readWorkspace(root)),
    site = sites.at(0);
  if (site === undefined) throw new Error('specimen absent');
  const entry = {
    ...declare(site, 'unknown', []),
    runtime: 'invented runtime',
    disposition: 'historical',
  };
  expect(() => checkInventory(sites, { schemaVersion: 1, entries: [entry] })).toThrow(
    'runtime is unsupported',
  );
});
it('classifies malformed digests before comparing their execution identity', () => {
  const f = createFixture();
  expect(() =>
    checkInventory(f.sites, {
      schemaVersion: 1,
      entries: f.entries.map((entry) => ({ ...entry, digest: 'invalid digest' })),
    }),
  ).toThrow('digest must be SHA256');
});
it('refuses unknown client exposure kinds rather than interpreting them as clients', () => {
  const f = createFixture();
  expect(() =>
    checkInventory(f.sites, {
      schemaVersion: 1,
      entries: f.entries.map((entry) => ({
        ...entry,
        clientExposure: { kind: 'invented', command: ['puni'] },
      })),
    }),
  ).toThrow('clientExposure kind');
});
it('refuses non-JSON envelope objects even when they carry otherwise valid fields', () => {
  const f = createFixture();
  expect(() => checkInventory(f.sites, Object.assign(new Date(0), f.manifest))).toThrow(
    'requires an object',
  );
});

it('refuses conflicting observed runtimes for the same opaque captured program', () => {
  const f = createFixture();
  f.write(
    'package.json',
    JSON.stringify({ scripts: { bun: 'bun ./program.unknown', node: 'node ./program.unknown' } }),
  );
  const sites = discoverConsumers(readWorkspace(f.root)),
    callers = sites.filter((site) => site.kind === 'command'),
    program = sites.find((site) => site.kind === 'entrypoint');
  if (program === undefined) throw new Error('program absent');
  const entries = [
    ...callers.map((site) => declare(site, site.observedRuntime, [site.id])),
    declare(
      program,
      'bun',
      callers.map((site) => site.id),
    ),
  ];
  expect(() => checkInventory(sites, { schemaVersion: 1, entries })).toThrow(
    'runtime observations conflict',
  );
});
it('requires historical runtime metadata to agree with the observed shebang', () => {
  const f = createFixture();
  f.write('package.json', '{}');
  f.write('specimen.xyz', '#!/usr/bin/env node\n');
  const sites = discoverConsumers(readWorkspace(f.root)),
    specimen = sites.find((site) => site.source === 'specimen.xyz');
  if (specimen === undefined) throw new Error('specimen absent');
  expect(() =>
    checkInventory(sites, {
      schemaVersion: 1,
      entries: [{ ...declare(specimen, 'bun', []), disposition: 'historical' }],
    }),
  ).toThrow('historical runtime');
});
it('does not treat configuration references as program callers for an independently executable candidate', () => {
  const f = createFixture();
  f.write('package.json', '{}');
  f.write(
    '.github/workflows/ci.yml',
    'jobs:\n  x:\n    steps:\n      - uses: ./.github/actions/local\n',
  );
  f.write(
    '.github/actions/local/action.yml',
    '#!/usr/bin/env bun\nruns:\n  using: composite\n  steps: []\n',
  );
  const sites = discoverConsumers(readWorkspace(f.root)),
    candidate = sites.find((site) => site.kind === 'entrypoint'),
    reference = sites.find((site) => site.source === '.github/workflows/ci.yml');
  if (candidate === undefined || reference === undefined) throw new Error('metadata graph absent');
  const entries = [declare(candidate, 'bun', []), declare(reference, 'external', [reference.id])];
  expect(checkInventory(sites, { schemaVersion: 1, entries }).compliance).toEqual({
    kind: 'bun-compatible',
  });
});
