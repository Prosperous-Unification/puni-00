import { rm } from 'node:fs/promises';

import { afterAll, beforeAll, expect, test } from 'bun:test';

import { completeActivationFixture } from '../fixtures/dependency-complete-activation';
import { roots } from '../fixtures/source-startup';
import {
  assertParticipantTransition,
  readParticipantSnapshot,
} from './dependency-participant-transition';
import { readFields } from './managed-cohort';

let parked: Record<string, unknown>;
beforeAll(async () => {
  const fixture = await completeActivationFixture(['prod']);
  parked = structuredClone(fixture.backend);
  Object.assign(readFields(parked['State']), { Running: false, Pid: 0, Status: 'exited' });
  readFields(readFields(parked['HostConfig'])['RestartPolicy'])['Name'] = 'no';
});
afterAll(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
function started() {
  const member = structuredClone(parked);
  Object.assign(readFields(member['State']), {
    Running: true,
    Pid: 421,
    Status: 'running',
    StartedAt: '2026-10-24T12:30:00Z',
  });
  const network = Object.values(readFields(readFields(member['NetworkSettings'])['Networks'])).at(
    0,
  );
  Object.assign(readFields(network), {
    EndpointID: 'f'.repeat(64),
    IPAddress: '172.24.0.8',
    Gateway: '172.24.0.1',
  });
  return member;
}
test('exact participant manual start admits attachment addresses and historical FinishedAt', () => {
  const prior = readParticipantSnapshot(parked);
  const running = assertParticipantTransition(prior, started(), 'start');
  expect(running.pid).toBe(421);
  expect(assertParticipantTransition(running, structuredClone(running.native), 'stable').pid).toBe(
    421,
  );
});
for (const fault of [
  'id',
  'environment',
  'mount',
  'network',
  'alias',
  'paused',
  'restart',
  'noop',
  'start-ticks',
] as const)
  test(`participant transition refuses ${fault} drift`, () => {
    const member = started();
    const host = readFields(member['HostConfig']);
    const state = readFields(member['State']);
    const networks = readFields(readFields(member['NetworkSettings'])['Networks']);
    const network = readFields(Object.values(networks).at(0));
    if (fault === 'id') member['Id'] = 'f'.repeat(64);
    if (fault === 'environment') readFields(member['Config'])['Env'] = ['SECRET=changed'];
    if (fault === 'mount') readFields((member['Mounts'] as unknown[])[0])['RW'] = false;
    if (fault === 'network') network['NetworkID'] = 'f'.repeat(64);
    if (fault === 'alias') network['Aliases'] = ['foreign'];
    if (fault === 'paused') state['Paused'] = true;
    if (fault === 'restart') member['RestartCount'] = 1;
    if (fault === 'noop') Object.assign(state, { Running: false, Pid: 0, Status: 'exited' });
    if (fault === 'start-ticks') state['StartedAt'] = readFields(parked['State'])['StartedAt'];
    expect(() =>
      assertParticipantTransition(readParticipantSnapshot(parked), member, 'start'),
    ).toThrow();
    expect(readFields(host['RestartPolicy'])['Name']).toBe('no');
  });
test('participant policy restoration preserves exact process identity and captured retry count', () => {
  const running = assertParticipantTransition(readParticipantSnapshot(parked), started(), 'start');
  const restored = structuredClone(running.native);
  readFields(restored['HostConfig'])['RestartPolicy'] = {
    Name: 'on-failure',
    MaximumRetryCount: 7,
  };
  expect(
    assertParticipantTransition(running, restored, 'policy', {
      name: 'on-failure',
      maximumRetryCount: 7,
    }).pid,
  ).toBe(421);
  expect(() =>
    assertParticipantTransition(running, restored, 'policy', {
      name: 'on-failure',
      maximumRetryCount: 3,
    }),
  ).toThrow();
  readFields(restored['State'])['Pid'] = 422;
  expect(() =>
    assertParticipantTransition(running, restored, 'policy', {
      name: 'on-failure',
      maximumRetryCount: 7,
    }),
  ).toThrow();
});
