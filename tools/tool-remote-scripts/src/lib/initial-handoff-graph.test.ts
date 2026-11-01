import { chmod, readFile, symlink, unlink, writeFile } from 'node:fs/promises';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { captureEdgePolicy } from './edge-policy';
import { captureInitialHandoff } from './initial-handoff-graph';

test('active graph refuses missing committed pointer without creating or scanning evidence', async () => {
  const directory = scratchSync('initial-handoff-graph-');
  await writeFile(
    directory + '/edge-policy.json',
    JSON.stringify({
      format: 'dependency-edge-policy',
      version: 1,
      phase: 'active',
      edgeState: directory,
      ownerPublicationSha256: 'a'.repeat(64),
      handoff: { name: 'edge-owner-000001-handoff-complete.json', sha256: 'b'.repeat(64) },
    }),
    { mode: 0o600 },
  );
  const snapshot = await captureEdgePolicy(directory);
  let refusal: unknown;
  try {
    await captureInitialHandoff(snapshot, performance.now() + 120000);
  } catch (cause) {
    refusal = cause;
  }
  expect(String(refusal)).toContain('edge-owner.json');
  expect(await Bun.file(directory + '/edge-owner.json').exists()).toBe(false);
});

import { resolve } from 'node:path';

import { initialHandoffFixture, initialHandoffLayout } from '../fixtures/initial-handoff';

async function runGraph(
  fixture: Awaited<ReturnType<typeof initialHandoffFixture>>,
  closingFault?: string,
) {
  const entry = fixture.root + '/reader.ts';
  const bundle = fixture.root + '/reader.js';
  await writeFile(
    entry,
    `import {captureEdgePolicy} from ${JSON.stringify(resolve(import.meta.dir, 'edge-policy.ts'))};import {captureInitialHandoff} from ${JSON.stringify(resolve(import.meta.dir, 'initial-handoff-graph.ts'))};import{appendFileSync}from'node:fs';const graph=await captureInitialHandoff(await captureEdgePolicy(${JSON.stringify(fixture.root)}),performance.now()+120000);try{${closingFault === undefined ? '' : `appendFileSync(${JSON.stringify(closingFault)},'changed');`}graph.verifyClosure();graph.assertStable();console.log('ACCEPTED');}finally{graph.closeFiles();}`,
  );
  const built = await Bun.build({
    entrypoints: [entry],
    target: 'bun',
    plugins: [initialHandoffLayout(fixture.root, fixture.layouts)],
  });
  if (!built.success || built.outputs.length !== 1)
    throw new Error('owned graph fixture compilation failed', { cause: built.logs });
  const output = built.outputs.at(0);
  if (output === undefined) throw new Error('owned graph bundle absent');
  await Bun.write(bundle, output);
  const child = Bun.spawn([process.execPath, bundle], { stdout: 'pipe', stderr: 'pipe' });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code, stdout, stderr };
}
for (const phase of ['H6', 'H7', 'H8'] as const) {
  test(`complete owned initial graph captures and closes ${phase}`, async () => {
    const fixture = await initialHandoffFixture(phase);
    const observed = await runGraph(fixture);
    expect(observed.stderr).toBe('');
    expect(observed.code).toBe(0);
    expect(observed.stdout.trim()).toBe('ACCEPTED');
  });
}

for (const label of [
  'handoff-admission',
  'handoff-intent',
  'exposure-intent',
  'exposure-complete',
  'handoff-complete',
  'solver-restore-intent',
  'solver-restore-complete',
  'activation-participants',
  'activation-capture',
  'activation-backup',
  'activation-intent',
  'activation-committed',
  'activation-participant-restore-intent',
  'activation-participant-ready',
  'activation-participant-policy-intent',
  'activation-participants-restored',
]) {
  test(`complete graph rejects a hash-bound unknown field in ${label}`, async () => {
    const fixture = await initialHandoffFixture('H8', undefined, (selected, fields) => {
      if (selected === label) fields['unrecognized'] = true;
    });
    const observed = await runGraph(fixture);
    expect(observed.code).toBe(1);
    expect(observed.stdout).not.toContain('ACCEPTED');
    expect(observed.stderr).toContain('unknown or missing fields');
  });
}
for (const phase of ['policy-publication-intent', 'policy-published']) {
  test(`dedicated solver-ready edge rejects inherited ${phase} sibling`, async () => {
    const fixture = await initialHandoffFixture('H8', undefined, (label, fields) => {
      if (label === 'solver-restore-complete') fields['phase'] = phase;
    });
    const observed = await runGraph(fixture);
    expect(observed.code).toBe(1);
    expect(observed.stderr).toContain('solver-ready phase differs');
  });
}
for (const fault of ['raw-capture', 'raw-backup']) {
  test(`independent closing graph refuses changed ${fault} bytes`, async () => {
    const fixture = await initialHandoffFixture();
    const path = fixture.paths.get(fault);
    if (path === undefined) throw new Error('fixture raw path absent');
    const observed = await runGraph(fixture, path);
    expect(observed.code).toBe(1);
    expect(observed.stderr).toContain('retained file identity differs');
  });
}

test('complete graph refuses consistently archived backend database differing from selected database identity', async () => {
  const fixture = await initialHandoffFixture('H8', undefined, (label, fields) => {
    if (label !== 'archived-backend-intent' && label !== 'archived-backend-complete') return;
    const cohort = fields['cohort'] as { blue: { database: { host: string } } };
    cohort.blue.database.host += '.foreign';
  });
  const observed = await runGraph(fixture);
  expect(observed.code).toBe(1);
  expect(observed.stdout).not.toContain('ACCEPTED');
});
test('complete graph refuses NUL in otherwise matched historical solver-ready cgroup', async () => {
  const fixture = await initialHandoffFixture('H8', undefined, (label, fields) => {
    if (label !== 'solver-restore-complete') return;
    const observed = fields['observed'] as {
      unit: { cgroup: string };
      process: { cgroup: string };
    };
    const group = '/user.slice/owned\0/wbs-solver-supervisor.service';
    observed.unit.cgroup = group;
    observed.process.cgroup = group;
  });
  const observed = await runGraph(fixture);
  expect(observed.code).toBe(1);
  expect(observed.stdout).not.toContain('ACCEPTED');
});

for (const activate of [['prod'], ['dev'], ['prod', 'dev']] as const) {
  test(`complete selected artifact closure accepts ordered roster ${activate.join(',')}`, async () => {
    const fixture = await initialHandoffFixture('H8', undefined, undefined, { activate });
    const observed = await runGraph(fixture);
    expect(observed.code).toBe(0);
    expect(observed.stderr).toBe('');
  });
}
for (const fault of ['unknown-root', 'unknown-applied-row', 'pending-ledger'] as const) {
  test(`selected exact raw capture reader refuses ${fault} with recomputed reference hashes`, async () => {
    const fixture = await initialHandoffFixture('H8', undefined, (label, fields) => {
      if (label !== 'raw-capture-input') return;
      if (fault === 'unknown-root') fields['unrecognized'] = true;
      if (fault === 'unknown-applied-row') {
        const applied = fields['applied'] as Record<string, unknown>[];
        const first = applied.at(0);
        if (first === undefined) throw new Error('owned applied entry missing');
        first['unrecognized'] = true;
      }
      if (fault === 'pending-ledger')
        fields['pending'] = [
          { name: '20261101000000_owned_pending', hash: 'e'.repeat(64), downHash: 'e'.repeat(64) },
        ];
    });
    const observed = await runGraph(fixture);
    expect(observed.code).toBe(1);
    expect(observed.stdout).not.toContain('ACCEPTED');
    expect(observed.stderr).toContain(
      fault === 'pending-ledger' ? 'complete applied ledger differs' : 'unknown or missing fields',
    );
  });
}
for (const [label, fault] of [
  ['writers-input', 'origin'],
  ['source-manifest-input', 'closed'],
  ['migration-manifest-input', 'closed'],
] as const) {
  test(`original manifest codec refuses hash-bound ${label} ${fault}`, async () => {
    const fixture = await initialHandoffFixture('H8', undefined, (selected, fields) => {
      if (selected !== label) return;
      if (fault === 'closed') fields['unrecognized'] = true;
      else {
        const members = fields['members'] as Record<string, unknown>[];
        const first = members.at(0);
        if (first === undefined) throw new Error('owned writer missing');
        first['origin'] = 'invented';
      }
    });
    const observed = await runGraph(fixture);
    expect(observed.code).toBe(1);
    expect(observed.stdout).not.toContain('ACCEPTED');
  });
}
for (const bytes of [0, 1073741825]) {
  test(`selected backup reader refuses declared byte bound ${String(bytes)}`, async () => {
    const fixture = await initialHandoffFixture('H8', undefined, (label, fields) => {
      if (label === 'activation-backup') {
        const snapshot = fields['snapshot'] as Record<string, unknown>;
        snapshot['bytes'] = bytes;
      }
    });
    const observed = await runGraph(fixture);
    expect(observed.code).toBe(1);
    expect(observed.stderr).toContain('backup byte or name bound differs');
  });
}

for (const fault of [
  'absent-capture',
  'unreadable-capture',
  'public-capture',
  'symlink-capture',
  'absent-backup',
  'unreadable-backup',
  'extra-artifact',
  'retained-original-fence',
] as const) {
  test(`complete real artifact boundary refuses ${fault}`, async () => {
    const fixture = await initialHandoffFixture();
    const capture = fixture.paths.get('raw-capture');
    const backup = fixture.paths.get('raw-backup');
    if (capture === undefined || backup === undefined) throw new Error('owned raw paths absent');
    if (fault === 'absent-capture') await unlink(capture);
    if (fault === 'unreadable-capture') await chmod(capture, 0);
    if (fault === 'public-capture') await chmod(capture, 0o644);
    if (fault === 'symlink-capture') {
      const bytes = await readFile(capture);
      const foreign = fixture.root + '/foreign-capture';
      await writeFile(foreign, bytes, { mode: 0o600 });
      await unlink(capture);
      await symlink(foreign, capture);
    }
    if (fault === 'absent-backup') await unlink(backup);
    if (fault === 'unreadable-backup') await chmod(backup, 0);
    if (fault === 'extra-artifact')
      await writeFile(capture + '.unexpected', 'owned unexpected evidence', { mode: 0o600 });
    if (fault === 'retained-original-fence')
      await writeFile(fixture.root + '/dependency-backend-fence.json', 'retained', { mode: 0o600 });
    try {
      const observed = await runGraph(fixture);
      expect(observed.code).toBe(1);
      expect(observed.stdout).not.toContain('ACCEPTED');
    } finally {
      if (fault === 'unreadable-capture') await chmod(capture, 0o600);
      if (fault === 'unreadable-backup') await chmod(backup, 0o600);
    }
  });
}
for (const fault of [
  'both',
  'neither',
  'complete-pending',
  'unknown-pointer',
  'wrong-pointer-policy',
] as const) {
  test(`full initial pointer/pending/archive state refuses ${fault}`, async () => {
    const fixture = await initialHandoffFixture(
      fault === 'neither' || fault === 'complete-pending' ? 'H6' : 'H8',
    );
    const archived = fixture.paths.get('owner-archive');
    if (archived === undefined) throw new Error('owned publication path absent');
    if (fault === 'both')
      await writeFile(fixture.root + '/edge-owner.pending', fixture.owner, { mode: 0o600 });
    if (fault === 'neither') await unlink(archived);
    if (
      fault === 'complete-pending' ||
      fault === 'unknown-pointer' ||
      fault === 'wrong-pointer-policy'
    ) {
      const pointer = JSON.parse(
        await readFile(fixture.root + '/edge-owner.json', 'utf8'),
      ) as Record<string, unknown>;
      if (fault === 'complete-pending') pointer['phase'] = 'complete';
      if (fault === 'unknown-pointer') pointer['phase'] = 'uncertain';
      if (fault === 'wrong-pointer-policy') pointer['policySha256'] = 'f'.repeat(64);
      await writeFile(fixture.root + '/edge-owner.json', JSON.stringify(pointer));
    }
    const observed = await runGraph(fixture);
    expect(observed.code).toBe(1);
    expect(observed.stdout).not.toContain('ACCEPTED');
  });
}

test('full graph preserves a nonzero original on-failure retry count', async () => {
  const fixture = await initialHandoffFixture('H8', undefined, (label, fields) => {
    if (label !== 'activation-participant-restore-intent') return;
    const selected = fields['selected'] as {
      originalPolicy: { name: string; maximumRetryCount: number };
    }[];
    const backend = selected.at(0);
    if (backend === undefined) throw new Error('owned original policy absent');
    backend.originalPolicy.name = 'on-failure';
    backend.originalPolicy.maximumRetryCount = 3;
  });
  const observed = await runGraph(fixture);
  expect(observed.code).toBe(0);
  expect(observed.stderr).toBe('');
});

for (const fault of [
  'admission-v1',
  'missing-pins',
  'unknown-pin',
  'foreign-source',
  'foreign-writer',
  'foreign-machine',
  'missing-profile',
  'reversed-profile',
  'boolean-uid',
  'invalid-hash',
] as const) {
  test(`complete hash-bound admission-v2 consumer refuses ${fault}`, async () => {
    const fixture = await initialHandoffFixture('H8', undefined, (label, fields) => {
      if (label !== 'handoff-admission') return;
      if (fault === 'admission-v1') {
        fields['version'] = 1;
        return;
      }
      if (fault === 'missing-pins') {
        delete fields['runtimeLaunch'];
        return;
      }
      const pins = fields['runtimeLaunch'] as Record<string, unknown>;
      if (fault === 'unknown-pin') pins['unrecognized'] = true;
      if (fault === 'foreign-source') pins['sourceSha'] = 'f'.repeat(40);
      if (fault === 'foreign-writer') pins['writerManifestSha256'] = 'f'.repeat(64);
      if (fault === 'foreign-machine') pins['hostMachineIdSha256'] = 'f'.repeat(64);
      if (fault === 'invalid-hash') pins['projectionSha256'] = 'G'.repeat(64);
      const profiles = pins['sessionProfiles'] as Record<string, unknown>[];
      if (fault === 'missing-profile') profiles.pop();
      if (fault === 'reversed-profile') profiles.reverse();
      if (fault === 'boolean-uid') {
        const first = profiles.at(0);
        if (first === undefined) throw new Error('owned profile absent');
        first['uid'] = false;
      }
    });
    const observed = await runGraph(fixture);
    expect(observed.code).toBe(1);
    expect(observed.stdout).not.toContain('ACCEPTED');
    expect(observed.stderr).toMatch(/runtime launch|record format|unknown or missing fields/);
  });
}

for (const fault of [
  'writer-build-revision',
  'migration-image-identity',
  'restored-policy-digest',
] as const) {
  test(`review crosslink refuses independent ${fault} branch with recomputed enclosing hashes`, async () => {
    const fixture = await initialHandoffFixture('H8', undefined, (label, fields) => {
      if (fault === 'writer-build-revision' && label === 'writers-input')
        fields['buildSha'] = '2'.repeat(40);
      if (fault === 'migration-image-identity') {
        if (label === 'migration-manifest-input')
          fields['candidateImageId'] = 'sha256:' + 'c'.repeat(64);
        if (label === 'handoff-admission') {
          const migrations = fields['migrations'] as Record<string, unknown>;
          migrations['candidateImageId'] = 'sha256:' + 'c'.repeat(64);
        }
      }
      if (
        fault === 'restored-policy-digest' &&
        label === 'activation-participant-policy-intent' &&
        fields['role'] === 'backend'
      )
        fields['policySha256'] = 'f'.repeat(64);
    });
    const observed = await runGraph(fixture);
    expect(observed.code).toBe(1);
    expect(observed.stdout).not.toContain('ACCEPTED');
    expect(observed.stderr).toContain(
      fault === 'writer-build-revision'
        ? 'writer manifest source differs'
        : fault === 'migration-image-identity'
          ? 'migration selected image differs'
          : 'participant original policy digest differs',
    );
  });
}
