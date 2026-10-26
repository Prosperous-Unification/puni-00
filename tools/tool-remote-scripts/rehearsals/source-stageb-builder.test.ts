import { expect, test } from 'bun:test';

import { consumer, fixture } from './source-stageb-artifacts.test';

test('native-binding integration: actual J-owned staging streams real payloads and cleans only its child', async () => {
  const observed = await consumer(await fixture(), 'stage');
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
  expect(observed.stdout).toBe('synthetic-B1-verified\n');
}, 20000);

for (const fault of ['preexisting', 'consumed-byte', 'partial-write'])
  test(`native-binding integration: actual staging refuses ${fault} and preserves bounded cleanup`, async () => {
    const observed = await consumer(await fixture(), 'stage', fault);
    expect(observed.code).not.toBe(0);
    expect(observed.stdout).toBe('');
    const { readdir, readFile } = await import('node:fs/promises');
    const parent = observed.directory + '/staging-parent';
    if (fault === 'preexisting')
      expect(await readFile(parent + '/source-stageb-staging/foreign', 'utf8')).toBe('foreign');
    else expect(await readdir(parent)).toEqual([]);
  }, 20000);
for (const fault of ['short-read', 'short-write', 'no-yield'])
  test(`native-binding integration: actual staging ${fault} obeys complete IO/acquisition`, async () => {
    const observed = await consumer(await fixture(), 'stage', fault);
    expect(observed.stderr).toBe('');
    expect(observed.code).toBe(0);
  }, 20000);

for (const fault of ['replace-child', 'replace-parent'])
  test(`native-binding integration: ${fault} cleanup preserves foreign objects and reports unproved`, async () => {
    const observed = await consumer(await fixture(), 'stage', fault);
    expect(observed.code).not.toBe(0);
    expect(observed.stdout).toBe('');
    const { readFile } = await import('node:fs/promises');
    expect(
      await readFile(
        observed.directory +
          '/staging-parent/' +
          (fault === 'replace-child' ? 'source-stageb-staging/' : '') +
          'foreign',
        'utf8',
      ),
    ).toBe('foreign');
  }, 20000);
test('native-binding integration: foreign staging close cannot affect original lifetime', async () => {
  const observed = await consumer(await fixture(), 'stage', 'foreign-close');
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
}, 20000);

test('native-binding integration: final population rechecks an earlier same-inode staged byte change', async () => {
  const observed = await consumer(await fixture(), 'stage', 'staged-byte');
  expect(observed.code).not.toBe(0);
  expect(observed.stdout).toBe('');
}, 20000);

for (const fault of [
  'dispatch-failure',
  'mkdir-failure',
  'first-open-failure',
  'first-stat-failure',
  'journal-observation-failure',
  'late-acquisition',
])
  test(`native-binding integration: ${fault} settles acquisition without a token or staging residue`, async () => {
    const observed = await consumer(await fixture(), 'stage', fault);
    expect(observed.code).not.toBe(0);
    expect(observed.stdout).toBe('');
    const { readdir } = await import('node:fs/promises');
    expect(await readdir(observed.directory + '/staging-parent')).toEqual([]);
  }, 20000);

test('native-binding integration: actual consumed-stream join refuses isolated digest observation fault', async () => {
  const observed = await consumer(await fixture(), 'stage', 'stream-observation');
  expect(observed.code).not.toBe(0);
  expect(observed.stderr).toContain('artifact join refused');
  expect(observed.stdout).toBe('');
}, 20000);

for (const fault of ['late-parent-open', 'parent-path-only', 'parent-object'])
  test(`native-binding integration: ${fault} preserves caller parent and settles own acquisition`, async () => {
    const observed = await consumer(await fixture(), 'stage', fault);
    expect(observed.code).not.toBe(0);
    expect(observed.stdout).toBe('');
    const { readdir } = await import('node:fs/promises');
    expect(await readdir(observed.directory + '/staging-parent')).toEqual([]);
    expect(await readdir(observed.directory)).not.toContain('invoked');
  }, 20000);

test('native-binding integration: racing EEXIST child is never adopted populated or removed', async () => {
  const observed = await consumer(await fixture(), 'stage', 'racing-child');
  expect(observed.code).not.toBe(0);
  const { readFile } = await import('node:fs/promises');
  expect(
    await readFile(observed.directory + '/staging-parent/source-stageb-staging/foreign', 'utf8'),
  ).toBe('foreign');
}, 20000);
test('native-binding integration: known preexisting child refuses before J effect-intent records', async () => {
  const observed = await consumer(await fixture(), 'stage', 'preexisting');
  expect(observed.code).not.toBe(0);
  const { readdir } = await import('node:fs/promises');
  expect(
    (await readdir(observed.directory + '/parent/source-stageb-' + '3'.repeat(32))).length,
  ).toBe(1);
}, 20000);

test('native-binding integration: final staged identity refuses write-and-restore timestamp drift', async () => {
  const observed = await consumer(await fixture(), 'stage', 'staged-restored-byte');
  expect(observed.code).not.toBe(0);
  expect(observed.stdout).toBe('');
}, 20000);
test('native-binding integration: independent final output readback hash refuses an actual read observation fault', async () => {
  const observed = await consumer(await fixture(), 'stage', 'final-readback-observation');
  expect(observed.code).not.toBe(0);
  expect(observed.stderr).toContain('final file bytes differ');
}, 20000);

test('native-binding integration: staging close memoizes the original in-flight settlement Promise', async () => {
  const observed = await consumer(await fixture(), 'stage', 'stage-close-memo');
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
}, 20000);

for (const fault of [
  'r1-reader-close',
  'r1-reader-primary-close',
  'r1-writer-primary-close',
  'r1-reader-recycle',
  'r1-writer-recycle',
])
  test(`native-binding integration: wave1 leaf settlement preserves primary and sentinel for ${fault}`, async () => {
    const observed = await consumer(await fixture(), 'stage', fault);
    expect(observed.code).not.toBe(0);
    const { readFile } = await import('node:fs/promises');
    const evidence: unknown = JSON.parse(
      await readFile(observed.directory + '/r1-failure.json', 'utf8'),
    );
    const encoded = JSON.stringify(evidence);
    if (fault.includes('primary') || fault.includes('recycle'))
      expect(encoded).toContain(
        'r1 injected ' + (fault.includes('reader') ? 'reader' : 'writer') + ' primary',
      );
    if (fault.includes('recycle')) {
      expect(encoded).toContain('object identity differs');
      expect(encoded).toContain('"sentinelSurvived":true');
    } else {
      expect(encoded).toContain('cleanup unproved');
      expect(encoded).toContain('r1 injected leaf close failure');
      expect(encoded).toContain('"closeCount":1');
    }
  }, 20000);

test('native-binding integration: wave1 required recheck settles before any parent IO', async () => {
  const observed = await consumer(await fixture(), 'stage', 'r1-recheck-before-parent');
  expect(observed.code).not.toBe(0);
  const { readdir, readFile } = await import('node:fs/promises');
  expect(observed.stderr).toContain('r1 injected input recheck failure');
  const names = await readdir(observed.directory);
  expect(names).not.toContain('r1-unhandled');
  expect(names).not.toContain('r1-parent-requested');
  expect(await readFile(observed.directory + '/r1-failure.json', 'utf8')).toContain(
    'r1 injected input recheck failure',
  );
}, 20000);
for (const fault of ['r1-remove-intent', 'r1-remove-dispatch'])
  test(`native-binding integration: wave1 published cleanup requires ${fault} durability before deletion`, async () => {
    const observed = await consumer(await fixture(), 'stage', fault);
    expect(observed.code).not.toBe(0);
    const { readdir, readFile } = await import('node:fs/promises');
    expect(await readdir(observed.directory)).not.toContain('r1-removal-effect');
    expect(await readFile(observed.directory + '/r1-remove-failure.json', 'utf8')).toContain(
      'cleanup unproved',
    );
    expect(
      await readFile(
        observed.directory + '/staging-parent/source-stageb-staging/source/node_modules/module',
        'utf8',
      ),
    ).toBe('synthetic dependency\n');
  }, 20000);
for (const fault of ['r1-backing-alias', 'r1-recorded-alias'])
  test(`native-binding integration: wave1 ${fault} refuses before effects and preserves usable J`, async () => {
    const observed = await consumer(await fixture(), 'stage', fault);
    expect(observed.code).not.toBe(0);
    const { readFile } = await import('node:fs/promises');
    expect(JSON.parse(await readFile(observed.directory + '/r1-alias.json', 'utf8'))).toEqual({
      journalUnchanged: true,
      journalUsable: true,
      childAbsent: true,
      siblingIntact: true,
    });
  }, 20000);
for (const fault of ['r1-shared-parent', 'r1-absence-parent'])
  test(`native-binding integration: wave1 ${fault} remains eligible with J usability`, async () => {
    const observed = await consumer(await fixture(), 'stage', fault);
    expect(observed.stderr).toBe('');
    expect(observed.code).toBe(0);
    const { readFile } = await import('node:fs/promises');
    expect(await readFile(observed.directory + '/r1-allowed-parent', 'utf8')).toBe('usable');
  }, 20000);

test('native-binding integration: wave2 post-chmod observation cannot replace original close identity', async () => {
  const observed = await consumer(await fixture(), 'stage', 'r2-chmod-recycle');
  expect(observed.code).not.toBe(0);
  expect(observed.stdout).toBe('');
  const { readFile } = await import('node:fs/promises');
  const evidence = await readFile(observed.directory + '/r1-failure.json', 'utf8');
  expect(evidence).toContain('"sentinelSurvived":true');
  expect(evidence).toContain('post-chmod identity differs');
  expect(evidence).toContain('cleanup unproved');
  expect(evidence).toContain('object identity differs');
  expect(await readFile(observed.directory + '/r2-sentinel', 'utf8')).toBe(
    'already-created sentinel',
  );
  expect(await readFile(observed.directory + '/r2-injected', 'utf8')).toContain('sentinelInode');
}, 20000);
