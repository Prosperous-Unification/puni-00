import { expect, test } from 'bun:test';

import type { CgroupObservation } from './forge-process-observation';
import type { PodObservation } from './forge-recovery-check';
import { requireMemoryEvidence } from './forge-recovery-lab';
import type { SourceBinding } from './forge-source-memory-evidence';

const first: PodObservation = {
  uid: 'owned-pod',
  container: `containerd://${'a'.repeat(64)}`,
  restarts: 0,
  ready: false,
  oom: true,
};
const binding: SourceBinding = {
  uid: 'owned-pod',
  container: `containerd://${'a'.repeat(64)}`,
  init: { pid: 42, starttime: '1234' },
  cgroup: '/kubepods/podowned-pod/source',
  device: '29',
  inode: '200',
};
const sample: CgroupObservation = {
  sampledAt: '2026-10-16T00:00:00.000Z',
  elapsedMs: 5,
  cgroup: '/kubepods/podowned-pod/source',
  device: '29',
  inode: '200',
  memory: { current: '2000', peak: '3000', max: '2147483648', events: { oom: '1', oom_kill: '1' } },
  processes: [
    {
      pid: 42,
      starttime: '1234',
      ppid: 1,
      executable: 'bun',
      role: 'unknown',
      rssKiB: 2,
      threads: 1,
    },
  ],
};

test('returns complete first-container evidence without readiness or OOM verdicts', () => {
  const evidence = requireMemoryEvidence([sample], first, binding);
  expect(evidence.source).toEqual(binding);
  expect(evidence.samples).toEqual([sample]);
  expect(Object.keys(evidence).sort()).toEqual(['samples', 'source']);
});

for (const [label, changed] of [
  ['foreign Pod', { uid: 'foreign' }],
  ['replacement container', { container: `containerd://${'b'.repeat(64)}` }],
  ['warm container', { container: `containerd://${'c'.repeat(64)}` }],
  ['container prefix', { container: 'containerd://aaaa' }],
  ['empty Pod UID', { uid: '' }],
  ['invalid init PID', { init: { pid: 0, starttime: '1234' } }],
  ['invalid init starttime', { init: { pid: 42, starttime: 'bad' } }],
  ['unsafe init PID', { init: { pid: Number.MAX_SAFE_INTEGER + 1, starttime: '1234' } }],
  ['root cgroup', { cgroup: '/' }],
  ['dot cgroup', { cgroup: '/kubepods/../source' }],
  ['relative cgroup', { cgroup: 'kubepods/source' }],
  ['invalid device', { device: '' }],
  ['invalid inode', { inode: 'bad' }],
] as const) {
  test(`refuses binding ${label}`, () => {
    expect(() => requireMemoryEvidence([sample], first, { ...binding, ...changed })).toThrow();
  });
}

function observeValidation(
  samples: readonly CgroupObservation[],
  expected: PodObservation,
  source: SourceBinding,
) {
  try {
    return { rejected: false, evidence: requireMemoryEvidence(samples, expected, source) };
  } catch {
    return { rejected: true };
  }
}

for (const [label, changed] of [
  ['root cgroup', { cgroup: '/' }],
  ['dot cgroup', { cgroup: '/kubepods/../source' }],
  ['relative cgroup', { cgroup: 'kubepods/source' }],
  ['empty segment cgroup', { cgroup: '/kubepods//source' }],
  ['invalid device', { device: '' }],
  ['invalid inode', { inode: 'bad' }],
] as const) {
  test(`refuses co-mutated malformed binding ${label}`, () => {
    expect(
      observeValidation([{ ...sample, ...changed }], first, { ...binding, ...changed }),
    ).toEqual({ rejected: true });
  });
}

for (const changed of [
  { uid: '' },
  { container: 'containerd://aaaa' },
  { container: `docker://${'a'.repeat(64)}` },
]) {
  test(`refuses co-mutated malformed expected identity ${JSON.stringify(changed)}`, () => {
    expect(
      observeValidation([sample], { ...first, ...changed }, { ...binding, ...changed }),
    ).toEqual({ rejected: true });
  });
}

for (const init of [
  { pid: 0, starttime: '1234' },
  { pid: Number.MAX_SAFE_INTEGER + 1, starttime: '1234' },
  { pid: 42, starttime: 'bad' },
]) {
  test(`refuses co-mutated malformed init across enforcement path ${JSON.stringify(init)}`, () => {
    const processes = sample.processes.map((process) => ({ ...process, ...init }));
    expect(observeValidation([{ ...sample, processes }], first, { ...binding, init })).toEqual({
      rejected: true,
    });
  });
}

for (const [label, changed] of [
  ['sibling cgroup', { cgroup: '/kubepods/podowned-pod/sibling' }],
  ['prefix cgroup', { cgroup: '/kubepods/podowned-pod/source-extra' }],
  ['device', { device: '30' }],
  ['inode', { inode: '201' }],
] as const) {
  test(`refuses sample ${label}`, () => {
    expect(() => requireMemoryEvidence([{ ...sample, ...changed }], first, binding)).toThrow(
      'cgroup identity',
    );
  });
}

for (const processes of [
  [],
  [{ ...sample.processes[0], pid: 43 }],
  [{ ...sample.processes[0], starttime: '5678' }],
]) {
  test(`refuses absent or reused init ${JSON.stringify(processes)}`, () => {
    expect(() => requireMemoryEvidence([{ ...sample, processes }], first, binding)).toThrow(
      'init member',
    );
  });
}

for (const max of [undefined, 'max', '', '-1', '2Gi', '2147483649', '02147483648']) {
  test(`refuses invalid memory.max ${String(max)}`, () => {
    expect(() =>
      requireMemoryEvidence(
        [{ ...sample, memory: { ...sample.memory, max } } as CgroupObservation],
        first,
        binding,
      ),
    ).toThrow('2Gi');
  });
}

test('refuses empty samples', () => {
  expect(() => requireMemoryEvidence([], first, binding)).toThrow('complete sample');
});

for (const [label, changed] of [
  ['current', { memory: { ...sample.memory, current: undefined } }],
  ['peak', { memory: { ...sample.memory, peak: '-1' } }],
  ['missing oom', { memory: { ...sample.memory, events: { oom_kill: '0' } } }],
  ['events', { memory: { ...sample.memory, events: { oom: '0' } } }],
  ['event count', { memory: { ...sample.memory, events: { oom: '0', oom_kill: 'bad' } } }],
  ['RSS', { processes: [{ ...sample.processes[0], rssKiB: undefined }] }],
  ['threads', { processes: [{ ...sample.processes[0], threads: NaN }] }],
  ['PPID', { processes: [{ ...sample.processes[0], ppid: -1 }] }],
  ['PID', { processes: [sample.processes[0], { ...sample.processes[0], pid: 0 }] }],
  [
    'starttime',
    { processes: [sample.processes[0], { ...sample.processes[0], pid: 43, starttime: 'bad' }] },
  ],
  ['executable', { processes: [{ ...sample.processes[0], executable: '/private/credential' }] }],
  ['role', { processes: [{ ...sample.processes[0], role: 'invented' }] }],
  ['duplicate PID', { processes: [sample.processes[0], sample.processes[0]] }],
  [
    'event name',
    { memory: { ...sample.memory, events: { oom: '0', oom_kill: '0', 'not valid': '1' } } },
  ],
  ['timestamp', { sampledAt: 'bad' }],
  ['elapsed', { elapsedMs: Infinity }],
  ['negative elapsed', { elapsedMs: -1 }],
] as const) {
  test(`refuses incomplete ${label}`, () => {
    expect(() =>
      requireMemoryEvidence(
        [{ ...sample, ...changed } as unknown as CgroupObservation],
        first,
        binding,
      ),
    ).toThrow('complete sample');
  });
}

test('refuses an incomplete later sample instead of crediting one complete sample', () => {
  expect(() =>
    requireMemoryEvidence(
      [sample, { ...sample, memory: { ...sample.memory, peak: '' } }],
      first,
      binding,
    ),
  ).toThrow('complete sample');
});

test('omits credential argv and injected restored success from returned evidence', () => {
  const credential = 'private-token-credential';
  const supplied = [
    {
      ...sample,
      argv: [credential],
      acceptancePassed: true,
      restoredChecker: 'pass',
      processes: sample.processes.map((process) => ({ ...process, argv: [credential] })),
    },
  ];
  const suppliedBinding = { ...binding, argv: [credential], acceptancePassed: true };
  const evidence = requireMemoryEvidence(supplied, first, suppliedBinding);
  expect(JSON.stringify(evidence)).not.toContain(credential);
  expect(JSON.stringify(evidence)).not.toContain('argv');
  expect(JSON.stringify(evidence)).not.toContain('acceptancePassed');
  expect(JSON.stringify(evidence)).not.toContain('restoredChecker');
});
