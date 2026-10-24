import { rejects } from 'node:assert/strict';

import { describe, expect, test } from 'bun:test';

import {
  assertSourceLatch,
  assertSourceOutputParents,
  bindSourceRoles,
  decodeSourceCapture,
  decodeSourceOwnership,
  sourceProfileSummary,
} from './source-participant-profile';

const hash = 'a'.repeat(64);
const owned = {
  format: 'isolated-ci-owned-source',
  version: 1,
  id: hash,
  name: 'wbs-dev-src',
  created: '2026-10-24T00:00:00.000Z',
  imageId: `sha256:${hash}`,
  reference: `fixture/source@sha256:${hash}`,
  nonce: 'b'.repeat(32),
  sourceSha: 'c'.repeat(40),
  manifestSha256: hash,
  dependencySha256: hash,
  configurationSha256: hash,
} as const;
const namespaces = { pid: 'pid:[10]', net: 'net:[11]', mnt: 'mnt:[12]' };
function capture() {
  return {
    format: 'isolated-ci-source-capture',
    version: 1,
    source: owned,
    running: true,
    initPid: 10,
    initStart: '100',
    namespaces,
    processes: [
      ...['backend', 'gateway', 'mcp', 'frontend'].map((role, index) => ({
        pid: index + 11,
        innerPid: index + 2,
        parentPid: 10,
        parentStart: '100',
        start: String(index + 101),
        uids: [1000, 1000, 1000, 1000],
        gids: [1000, 1000, 1000, 1000],
        cgroup: '/fixture',
        namespaces,
        argv: ['/usr/local/bin/bun', '--watch', 'src/main.ts'],
        cwd: `/src/apps/wbs/${['be-01', 'gw-01', 'mcp-01', 'fe-01'][index]}`,
        executablePath: '/usr/local/bin/bun',
        executable: { device: '1', inode: '2', sha256: hash },
        listeners: [
          {
            family: 'ipv4',
            address: '0.0.0.0',
            port: [3100, 3200, 3300, 4200][index],
            inode: String(index + 500),
            descriptor: 20,
          },
        ],
      })),
      {
        pid: 10,
        innerPid: 1,
        parentPid: 90,
        parentStart: '80',
        start: '100',
        uids: [1000, 1000, 1000, 1000],
        gids: [1000, 1000, 1000, 1000],
        cgroup: '/fixture',
        namespaces,
        argv: ['/usr/local/bin/bun', 'run', 'dev'],
        cwd: '/src',
        executablePath: '/usr/local/bin/bun',
        executable: { device: '1', inode: '2', sha256: hash },
        listeners: [],
      },
    ],
    outputParents: [
      {
        path: '/src/apps/wbs/mcp-01/src/generated',
        device: '1',
        inode: '9',
        mode: 493,
        members: ['openapi.json'],
      },
    ],
    outputs: [
      {
        path: '/src/apps/wbs/mcp-01/src/generated/openapi.json',
        kind: 'file',
        mode: 420,
        sha256: hash,
      },
    ],
  };
}
const ports = { backend: 3100, gateway: 3200, mcp: 3300, frontend: 4200 };

describe('source measurement evidence only', () => {
  test('closes the ownership packet and retains only pinned source identity', () => {
    expect(decodeSourceOwnership(owned)).toEqual(owned);
    expect(() => decodeSourceOwnership({ ...owned, program: 'private-sentinel' })).toThrow();
    expect(() => decodeSourceOwnership({ ...owned, id: 'short' })).toThrow();
    expect(() => decodeSourceOwnership({ ...owned, name: 'borrowed' })).toThrow();
  });
  test('refuses capture ownership drift and unknown evidence fields', () => {
    expect(decodeSourceCapture(capture(), decodeSourceOwnership(owned)).processes).toHaveLength(5);
    expect(() =>
      decodeSourceCapture(
        { ...capture(), source: { ...owned, nonce: 'd'.repeat(32) } },
        decodeSourceOwnership(owned),
      ),
    ).toThrow();
    expect(() =>
      decodeSourceCapture({ ...capture(), expectedSuccess: true }, decodeSourceOwnership(owned)),
    ).toThrow();
  });
  test('binds roles from actual fixed port and working directory, refusing ambiguity', () => {
    const observed = decodeSourceCapture(capture(), decodeSourceOwnership(owned));
    expect(bindSourceRoles(observed, ports).backend.pid).toBe(11);
    const duplicate = capture();
    duplicate.processes.push({ ...duplicate.processes[0], pid: 30, innerPid: 30 });
    expect(() =>
      bindSourceRoles(decodeSourceCapture(duplicate, decodeSourceOwnership(owned)), ports),
    ).toThrow();
  });
  test('refuses a missing role and a foreign same-port listener', () => {
    const missing = capture();
    missing.processes.splice(3, 1);
    expect(() =>
      bindSourceRoles(decodeSourceCapture(missing, decodeSourceOwnership(owned)), ports),
    ).toThrow();
    const foreign = capture();
    foreign.processes.push({ ...foreign.processes[0], pid: 30, innerPid: 30, cwd: '/foreign' });
    expect(() =>
      bindSourceRoles(decodeSourceCapture(foreign, decodeSourceOwnership(owned)), ports),
    ).toThrow();
  });
  test('never rebases a latched process or original namespace', () => {
    const first = decodeSourceCapture(capture(), decodeSourceOwnership(owned));
    expect(() => {
      assertSourceLatch(first, first);
    }).not.toThrow();
    const replaced = capture();
    replaced.processes[0].start = '999';
    expect(() => {
      assertSourceLatch(first, decodeSourceCapture(replaced, decodeSourceOwnership(owned)));
    }).toThrow();
    expect(() => {
      assertSourceLatch(first, { ...first, initStart: '999' });
    }).toThrow();
  });
  test('allows changed output membership but refuses original parent object replacement', () => {
    const first = decodeSourceCapture(capture(), decodeSourceOwnership(owned));
    const changed = capture();
    changed.outputParents[0].members.push('new-output');
    expect(() => {
      assertSourceOutputParents(
        first.outputParents,
        decodeSourceCapture(changed, decodeSourceOwnership(owned)).outputParents,
      );
    }).not.toThrow();
    changed.outputParents[0].inode = '99';
    expect(() => {
      assertSourceOutputParents(
        first.outputParents,
        decodeSourceCapture(changed, decodeSourceOwnership(owned)).outputParents,
      );
    }).toThrow();
  });
  test('public summaries discard private sentinels and never grant admission', () => {
    const summary = sourceProfileSummary('unsupported', 'role-binding', 'unproved');
    expect(summary).toEqual({
      case: 'B2-source-profile',
      status: 'unsupported',
      reason: 'role-binding',
      admission: 'not-granted',
      cleanup: 'unproved',
    });
    expect(JSON.stringify(summary)).not.toContain('private-sentinel');
    expect(sourceProfileSummary('unexecuted', 'provider-incomplete', 'unproved').status).toBe(
      'unexecuted',
    );
    expect(() => sourceProfileSummary('measured', 'complete', 'unproved')).toThrow();
  });
});

import {
  advanceSourceSequence,
  decodeSourceChannelReply,
  sourceChannelRequest,
} from './source-participant-profile';

test('source channel contains no caller-selected target and joins exact request identity', () => {
  const request = sourceChannelRequest(owned.nonce, 1, 'capture-owned-source');
  expect(Object.keys(request)).toEqual(['version', 'nonce', 'sequence', 'operation']);
  expect(
    decodeSourceChannelReply(
      { ...request, status: 'captured', capture: capture() },
      request,
      decodeSourceOwnership(owned),
    ),
  ).toHaveProperty('capture');
  expect(() =>
    decodeSourceChannelReply(
      { ...request, sequence: 2, status: 'captured', capture: capture() },
      request,
      decodeSourceOwnership(owned),
    ),
  ).toThrow();
  expect(() =>
    decodeSourceChannelReply(
      { ...request, status: 'captured', capture: capture(), pid: 123 },
      request,
      decodeSourceOwnership(owned),
    ),
  ).toThrow();
});

test('source stop/join proof and finalize follow source stop before context release', () => {
  expect(advanceSourceSequence('cold', 'acknowledge-source-start')).toBe('acknowledged');
  expect(advanceSourceSequence('acknowledged', 'capture-owned-source')).toBe('running');
  expect(advanceSourceSequence('running', 'stop-join-owned-source')).toBe('stopped');
  expect(advanceSourceSequence('stopped', 'finalize-evidence')).toBe('finalized');
  expect(() => advanceSourceSequence('running', 'finalize-evidence')).toThrow();
  const request = sourceChannelRequest(owned.nonce, 2, 'stop-join-owned-source');
  const proof = {
    sourceStopped: true,
    processesAbsent: true,
    listenersClosed: true,
    helpersJoined: true,
  };
  expect(
    decodeSourceChannelReply(
      { ...request, status: 'stopped', proof },
      request,
      decodeSourceOwnership(owned),
    ),
  ).toHaveProperty('proof');
  expect(() =>
    decodeSourceChannelReply(
      { ...request, status: 'stopped', proof: { ...proof, processesAbsent: false } },
      request,
      decodeSourceOwnership(owned),
    ),
  ).toThrow();
});

test('cold snapshots cannot borrow a running process baseline', () => {
  const cold = {
    ...capture(),
    running: false,
    initPid: 0,
    initStart: '0',
    namespaces: null,
    processes: [],
    outputs: [],
  };
  expect(decodeSourceCapture(cold, decodeSourceOwnership(owned)).running).toBe(false);
  expect(() =>
    decodeSourceCapture({ ...cold, processes: capture().processes }, decodeSourceOwnership(owned)),
  ).toThrow();
  expect(() =>
    decodeSourceCapture({ ...cold, outputs: capture().outputs }, decodeSourceOwnership(owned)),
  ).toThrow();
});

import { measureSourceProfile } from './source-participant-profile';

test('measurement cannot use a reconstructed finalized context or touch the provider', async () => {
  const operations: unknown[] = [];
  await rejects(
    measureSourceProfile(
      {} as Parameters<typeof measureSourceProfile>[0],
      {} as Parameters<typeof measureSourceProfile>[1],
      {
        exchange: (request: unknown) => {
          operations.push(request);
          return Promise.reject(new Error('forbidden boundary'));
        },
        closeAndJoin: () => {
          operations.push('close');
          return Promise.resolve();
        },
      },
    ),
    /participant restoration context is not original and consumed/,
  );
  expect(operations).toEqual([]);
});

import { decodeSourceProfilePacket } from './source-participant-profile';
const configuration = {
  ports,
  gatewayBackend: 'http://localhost:3100',
  mcpBackend: 'http://localhost:3100',
  frontendBackend: 'http://localhost:3100',
  frontendGateway: 'http://localhost:3200',
};
function packet() {
  return {
    format: 'isolated-ci-source-profile',
    version: 1,
    source: owned,
    workflowSha: 'd'.repeat(40),
    inputManifestSha256: hash,
    recipientFingerprint: hash,
    pins: {
      version: 1,
      sourceSha: owned.sourceSha,
      runtimeImageId: owned.imageId,
      manifestSha256: owned.manifestSha256,
      environmentSha256: owned.configurationSha256,
    },
    configuration,
    openapiSha256: hash,
  };
}
test('B2 packet stays distinct and joins original source pins', () => {
  expect(decodeSourceProfilePacket(packet()).source.id).toBe(owned.id);
  expect(() =>
    decodeSourceProfilePacket({ ...packet(), format: 'isolated-ci-created-pair' }),
  ).toThrow();
  expect(() =>
    decodeSourceProfilePacket({
      ...packet(),
      pins: { ...packet().pins, runtimeImageId: `sha256:${'e'.repeat(64)}` },
    }),
  ).toThrow();
  expect(() => decodeSourceProfilePacket({ ...packet(), pid: 123 })).toThrow();
});

test('closed capture bounds and process fields refuse malformed kernel evidence', () => {
  const malformed: unknown[] = [
    {
      ...capture(),
      processes: Array.from({ length: 257 }, (_, index) => ({
        ...capture().processes[0],
        pid: index + 100,
        innerPid: index + 100,
      })),
    },
    { ...capture(), processes: [{ ...capture().processes[0], uids: [1000] }] },
    {
      ...capture(),
      processes: [
        { ...capture().processes[0], executable: { device: '1', inode: '2', sha256: 'short' } },
      ],
    },
    { ...capture(), processes: [{ ...capture().processes[0], cwd: '/src/../foreign' }] },
    { ...capture(), outputParents: [{ ...capture().outputParents[0], members: ['../secret'] }] },
    { ...capture(), outputs: [{ ...capture().outputs[0], kind: 'symlink' }] },
  ];
  for (const evidence of malformed)
    expect(() => decodeSourceCapture(evidence, decodeSourceOwnership(owned))).toThrow();
});

test('complete persistent roster requires joined ancestry without cycles', () => {
  const orphan = capture();
  orphan.processes.push({
    ...orphan.processes[0],
    pid: 40,
    innerPid: 40,
    parentPid: 999,
    listeners: [],
  });
  expect(() =>
    bindSourceRoles(decodeSourceCapture(orphan, decodeSourceOwnership(owned)), ports),
  ).toThrow();
  const cycle = capture();
  cycle.processes[0].parentPid = cycle.processes[0].pid;
  cycle.processes[0].parentStart = cycle.processes[0].start;
  expect(() =>
    bindSourceRoles(decodeSourceCapture(cycle, decodeSourceOwnership(owned)), ports),
  ).toThrow();
});

test('raw sentinels in frames, captures and exceptions never enter a public receipt', () => {
  const privateCapture = capture();
  privateCapture.processes[0].argv.push('PRIVATE_SOURCE_SENTINEL');
  const decoded = decodeSourceCapture(privateCapture, decodeSourceOwnership(owned));
  expect(decoded.processes[0].argv).toContain('PRIVATE_SOURCE_SENTINEL');
  const publicReceipt = sourceProfileSummary('unsupported', 'io-failure', 'unproved');
  expect(JSON.stringify(publicReceipt)).not.toContain('PRIVATE_SOURCE_SENTINEL');
  expect(() =>
    sourceProfileSummary(
      'unsupported',
      'PRIVATE_SOURCE_SENTINEL' as Parameters<typeof sourceProfileSummary>[1],
      'unproved',
    ),
  ).toThrow('Source profile evidence refused');
  const request = sourceChannelRequest(owned.nonce, 1, 'capture-owned-source');
  expect(() =>
    decodeSourceChannelReply(
      { ...request, status: 'refused', reason: 'PRIVATE_SOURCE_SENTINEL' },
      request,
      decodeSourceOwnership(owned),
    ),
  ).toThrow('Source profile evidence refused');
});

import { latchSourceRoleCandidates } from './source-participant-profile';

test('already observed applications cannot rebaseline while another role is starting', () => {
  const partial = capture();
  partial.processes.splice(3, 1);
  const latched = latchSourceRoleCandidates(
    {},
    decodeSourceCapture(partial, decodeSourceOwnership(owned)),
    ports,
  );
  expect(latched.backend?.pid).toBe(11);
  const drifted = capture();
  drifted.processes[0].start = '999';
  expect(() =>
    latchSourceRoleCandidates(
      latched,
      decodeSourceCapture(drifted, decodeSourceOwnership(owned)),
      ports,
    ),
  ).toThrow();
  const disappeared = capture();
  disappeared.processes.shift();
  expect(() =>
    latchSourceRoleCandidates(
      latched,
      decodeSourceCapture(disappeared, decodeSourceOwnership(owned)),
      ports,
    ),
  ).toThrow();
});

test('a single foreign application at a required port cannot acquire the role label', () => {
  const foreign = capture();
  foreign.processes[0].cwd = '/foreign';
  expect(() =>
    bindSourceRoles(decodeSourceCapture(foreign, decodeSourceOwnership(owned)), ports),
  ).toThrow();
});

import { decodeSourceChannelRequest } from './source-participant-profile';
test('provider request decoder rejects caller-selected targets and replay', () => {
  const request = sourceChannelRequest(owned.nonce, 1, 'capture-owned-source');
  expect(decodeSourceChannelRequest(request, owned.nonce, 1)).toEqual(request);
  expect(() => decodeSourceChannelRequest({ ...request, pid: 123 }, owned.nonce, 1)).toThrow();
  expect(() => decodeSourceChannelRequest(request, owned.nonce, 2)).toThrow();
  expect(() =>
    decodeSourceChannelRequest({ ...request, operation: 'exec' }, owned.nonce, 1),
  ).toThrow();
});

import { assertSourceOutputCoverage } from './source-participant-profile';
test('complete raw output coverage requires fixed original parents and exact emitted OpenAPI', () => {
  const observed = decodeSourceCapture(capture(), decodeSourceOwnership(owned));
  expect(() => {
    assertSourceOutputCoverage(observed, hash);
  }).toThrow();
  const complete = {
    ...observed,
    outputParents: [
      '/src',
      '/src/node_modules',
      '/src/apps/wbs/fe-01',
      '/src/apps/wbs/mcp-01/src',
    ].map((path, index) => ({
      path,
      device: '1',
      inode: String(index + 1),
      mode: 493,
      members: [],
    })),
    outputs: [
      {
        path: '/src/apps/wbs/mcp-01/src/openapi.json',
        kind: 'file' as const,
        mode: 420,
        sha256: hash,
      },
    ],
  };
  expect(() => {
    assertSourceOutputCoverage(complete, hash);
  }).not.toThrow();
  expect(() => {
    assertSourceOutputCoverage({ ...complete, outputParents: [] }, hash);
  }).toThrow();
  expect(() => {
    assertSourceOutputCoverage({ ...complete, outputs: [] }, hash);
  }).toThrow();
  expect(() => {
    assertSourceOutputCoverage(complete, 'e'.repeat(64));
  }).toThrow();
});

test('review: complete persistent roster must include the init process observation', () => {
  const missing = capture();
  missing.processes.splice(4, 1);
  expect(() =>
    bindSourceRoles(decodeSourceCapture(missing, decodeSourceOwnership(owned)), ports),
  ).toThrow();
});

test('review: included init observation must join the declared init start', () => {
  const inconsistent = capture();
  inconsistent.processes[4].start = '999';
  expect(() =>
    bindSourceRoles(decodeSourceCapture(inconsistent, decodeSourceOwnership(owned)), ports),
  ).toThrow();
});

test('review: a non-init process cannot claim inner PID1', () => {
  const inconsistent = capture();
  inconsistent.processes[0].innerPid = 1;
  expect(() =>
    bindSourceRoles(decodeSourceCapture(inconsistent, decodeSourceOwnership(owned)), ports),
  ).toThrow();
});

test('review: exactly one init row is required even at the typed binder boundary', () => {
  const observed = decodeSourceCapture(capture(), decodeSourceOwnership(owned));
  const init = observed.processes[4];
  expect(() =>
    bindSourceRoles({ ...observed, processes: [...observed.processes, { ...init }] }, ports),
  ).toThrow();
});

test('review: declared init must be inner PID1 even when all inner PIDs are unique', () => {
  const inconsistent = capture();
  inconsistent.processes[4].innerPid = 9;
  expect(() =>
    bindSourceRoles(decodeSourceCapture(inconsistent, decodeSourceOwnership(owned)), ports),
  ).toThrow();
  inconsistent.processes[0].innerPid = 1;
  expect(() =>
    bindSourceRoles(decodeSourceCapture(inconsistent, decodeSourceOwnership(owned)), ports),
  ).toThrow();
});

test('review: init namespace must join the container namespace contract', () => {
  const inconsistent = capture();
  inconsistent.processes[4].namespaces = { ...namespaces, pid: 'pid:[999]' };
  expect(() =>
    bindSourceRoles(decodeSourceCapture(inconsistent, decodeSourceOwnership(owned)), ports),
  ).toThrow();
});

test('review: only the observed init may have an external parent', () => {
  const foreign = capture();
  foreign.processes[0].parentPid = 90;
  foreign.processes[0].parentStart = '80';
  expect(() =>
    bindSourceRoles(decodeSourceCapture(foreign, decodeSourceOwnership(owned)), ports),
  ).toThrow();
  const internal = capture();
  internal.processes[4].parentPid = 11;
  internal.processes[4].parentStart = '101';
  expect(() =>
    bindSourceRoles(decodeSourceCapture(internal, decodeSourceOwnership(owned)), ports),
  ).toThrow();
});

test('review: stable init row metadata remains latched beyond its declared tuple', () => {
  const first = decodeSourceCapture(capture(), decodeSourceOwnership(owned));
  const replaced = capture();
  replaced.processes[4].executable = { device: '1', inode: '999', sha256: hash };
  const repeated = decodeSourceCapture(replaced, decodeSourceOwnership(owned));
  expect(() => bindSourceRoles(repeated, ports)).not.toThrow();
  expect(() => {
    assertSourceLatch(first, repeated);
  }).toThrow();
});

test('review: indirect ancestry must join the full init observation', () => {
  const branched = capture();
  branched.processes.push({
    ...branched.processes[0],
    pid: 40,
    innerPid: 40,
    start: '222',
    parentPid: 10,
    parentStart: '100',
    cwd: '/src',
    listeners: [],
  });
  branched.processes[0].parentPid = 40;
  branched.processes[0].parentStart = '222';
  expect(() =>
    bindSourceRoles(decodeSourceCapture(branched, decodeSourceOwnership(owned)), ports),
  ).not.toThrow();
  branched.processes[5].parentStart = '999';
  expect(() =>
    bindSourceRoles(decodeSourceCapture(branched, decodeSourceOwnership(owned)), ports),
  ).toThrow();
  branched.processes[5].parentStart = '80';
  branched.processes[5].parentPid = 90;
  expect(() =>
    bindSourceRoles(decodeSourceCapture(branched, decodeSourceOwnership(owned)), ports),
  ).toThrow();
});

test('review: top-level init start must agree with the fully joined row', () => {
  const inconsistent = capture();
  inconsistent.initStart = '999';
  expect(() =>
    bindSourceRoles(decodeSourceCapture(inconsistent, decodeSourceOwnership(owned)), ports),
  ).toThrow();
});

test('review: the launcher init cannot acquire an application role label', () => {
  const mislabeled = capture();
  const backend = mislabeled.processes[0];
  const init = mislabeled.processes[4];
  mislabeled.processes[4] = { ...init, cwd: backend.cwd, listeners: backend.listeners };
  mislabeled.processes.splice(0, 1);
  expect(() =>
    bindSourceRoles(decodeSourceCapture(mislabeled, decodeSourceOwnership(owned)), ports),
  ).toThrow();
});
