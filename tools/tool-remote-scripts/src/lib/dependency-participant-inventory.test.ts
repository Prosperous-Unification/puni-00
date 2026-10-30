import { rm } from 'node:fs/promises';

import { afterAll, beforeAll, expect, test } from 'bun:test';

import { completeActivationFixture } from '../fixtures/dependency-complete-activation';
import { roots } from '../fixtures/source-startup';
import { assertParticipantInventory } from './dependency-participant-inventory';
import {
  assertParticipantTransition,
  readParticipantSnapshot,
} from './dependency-participant-transition';
import { readFields } from './managed-cohort';

let original: unknown[];
let selected: Set<string>;
let backendId: string;
let caddyId: string;
beforeAll(async () => {
  const fixture = await completeActivationFixture(['prod']);
  original = structuredClone(fixture.inventory);
  backendId = fixture.backend.Id;
  caddyId = fixture.caddy.Id;
  selected = new Set([fixture.backend.Id, fixture.gateway.Id, fixture.source.Id]);
  for (const raw of original) {
    const member = readFields(raw);
    if (selected.has(String(member['Id']))) {
      Object.assign(readFields(member['State']), { Running: false, Pid: 0, Status: 'exited' });
      Object.assign(readFields(readFields(member['HostConfig'])['RestartPolicy']), {
        Name: 'no',
        MaximumRetryCount: 0,
      });
    }
  }
});
afterAll(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
function running() {
  const current = structuredClone(original);
  const raw = current.find((member) => readFields(member)['Id'] === backendId);
  const prior = readParticipantSnapshot(raw);
  Object.assign(readFields(readFields(raw)['State']), {
    Running: true,
    Pid: 1234,
    Status: 'running',
    StartedAt: '2026-10-24T12:30:00Z',
  });
  const bound = assertParticipantTransition(prior, raw, 'start');
  return { current, bindings: new Map([[backendId, bound]]) };
}
test('participant full inventory preserves parked peers while one exact selected start is bound', () => {
  const { current, bindings } = running();
  for (const raw of current) {
    const mounts = readFields(raw)['Mounts'];
    if (!Array.isArray(mounts)) throw new Error('fixture mount list absent');
    mounts.reverse();
  }
  assertParticipantInventory(original, current, selected, bindings, new Set());
  expect(bindings.get(backendId)?.pid).toBe(1234);
});
for (const fault of [
  'extra',
  'missing',
  'duplicate',
  'peer-state',
  'peer-config',
  'peer-network',
  'unknown-binding',
  'removed-peer',
  'selected-missing',
  'selected-foreign',
] as const)
  test(`participant full inventory refuses ${fault}`, () => {
    const { current, bindings } = running();
    const peer = readFields(current.find((member) => readFields(member)['Id'] === caddyId));
    const removed = new Set<string>();
    const chosen = new Set(selected);
    const parkedSelected = [...selected].find((id) => id !== backendId);
    if (parkedSelected === undefined) throw new Error('fixture parked selected role absent');
    if (fault === 'selected-missing') chosen.delete(parkedSelected);
    if (fault === 'selected-foreign') {
      chosen.delete(parkedSelected);
      chosen.add('f'.repeat(64));
    }
    if (fault === 'extra') current.push({ ...peer, Id: 'f'.repeat(64) });
    if (fault === 'missing')
      current.splice(
        current.findIndex((member) => readFields(member)['Id'] === caddyId),
        1,
      );
    if (fault === 'duplicate') current.push(structuredClone(peer));
    if (fault === 'peer-state') readFields(peer['State'])['StartedAt'] = '2026-10-24T13:00:00Z';
    if (fault === 'peer-config') readFields(peer['Config'])['Env'] = ['PRIVATE_CONFIG_DRIFT=yes'];
    if (fault === 'peer-network') readFields(peer['NetworkSettings'])['SandboxKey'] = '/foreign';
    if (fault === 'unknown-binding') {
      peer['RestartCount'] = 0;
      Object.assign(readFields(peer['State']), {
        Running: true,
        Pid: 12345,
        Status: 'running',
        StartedAt: '2026-10-24T13:00:00Z',
        Paused: false,
        Restarting: false,
        Dead: false,
        OOMKilled: false,
        Error: '',
      });
      readFields(peer['HostConfig'])['RestartPolicy'] = { Name: 'no', MaximumRetryCount: 0 };
      bindings.set(caddyId, readParticipantSnapshot(peer));
    }
    if (fault === 'removed-peer') {
      removed.add(caddyId);
      current.splice(
        current.findIndex((member) => readFields(member)['Id'] === caddyId),
        1,
      );
    }
    expect(() => {
      assertParticipantInventory(original, current, chosen, bindings, removed);
    }).toThrow();
  });

test('participant full inventory permits only an explicitly removed terminal managed solver', () => {
  const { current, bindings } = running();
  const id = '0123456789abcdef'.repeat(4);
  expect(original.some((member) => readFields(member)['Id'] === id)).toBe(false);
  const token = '018f3f08-2ef7-7d1c-b645-14f877575d66';
  const terminal = {
    Id: id,
    Name: `/wbs-solver-${token}`,
    Image: `sha256:${'c'.repeat(64)}`,
    Path: 'bun',
    Args: ['worker'],
    RestartCount: 0,
    Config: {
      Image: `registry/solver@sha256:${'c'.repeat(64)}`,
      Env: [],
      Labels: {
        'wbs-managed-solver': 'true',
        'wbs-attempt-token': token,
        'wbs-caller-id': 'b'.repeat(64),
        'wbs-project-id': token,
        'wbs-objective': 'pri',
      },
    },
    HostConfig: {
      RestartPolicy: { Name: 'no', MaximumRetryCount: 0 },
      PidMode: '',
      Privileged: false,
      CapAdd: null,
    },
    State: {
      Running: false,
      Restarting: false,
      Paused: false,
      Dead: false,
      Status: 'exited',
      Pid: 0,
      ExitCode: 137,
      OOMKilled: false,
      Error: '',
      StartedAt: '2026-01-01T00:00:00Z',
      FinishedAt: '2026-01-01T00:01:00Z',
    },
    Mounts: [],
    NetworkSettings: { Networks: {} },
  };
  const parked = [...original, terminal];
  expect(() => {
    assertParticipantInventory(parked, current, selected, bindings, new Set());
  }).toThrow();
  assertParticipantInventory(parked, current, selected, bindings, new Set([id]));
  expect(current.some((member) => readFields(member)['Id'] === id)).toBe(false);
  expect(bindings.get(backendId)?.pid).toBe(1234);
});
