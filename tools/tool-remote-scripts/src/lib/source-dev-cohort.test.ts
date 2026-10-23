import { expect, test } from 'bun:test';

import { sourceFixture } from '../fixtures/source-dev';
import { envLayout } from './env';
import { decodeSourceDev, sourceDevIdentity } from './source-dev-cohort';

for (const init of [null, false, true])
  test(`source decoder permits typed init ${String(init)}`, () => {
    expect(decodeSourceDev(sourceFixture(init), envLayout('dev')).id).toBe('a'.repeat(64));
  });
for (const pid of ['host', 'container:other'])
  test(`source decoder refuses PID sharing ${pid}`, () => {
    const container = sourceFixture();
    container.HostConfig.PidMode = pid;
    expect(() => decodeSourceDev(container, envLayout('dev'))).toThrow('private PID');
  });
test('source decoder binds complete config mounts and lifecycle identity', () => {
  const first = decodeSourceDev(sourceFixture(), envLayout('dev'));
  const changed = sourceFixture();
  changed.Config.User = '0';
  expect(() => decodeSourceDev(changed, envLayout('dev'))).toThrow();
  const stopped = sourceFixture();
  stopped.State.Running = false;
  stopped.State.Pid = 0;
  stopped.State.Status = 'exited';
  stopped.State.FinishedAt = '2026-10-23T01:00:00Z';
  expect(sourceDevIdentity(decodeSourceDev(stopped, envLayout('dev')))).toEqual(
    sourceDevIdentity(first),
  );
});

for (const fault of [
  'image',
  'cwd',
  'user',
  'service',
  'project',
  'command',
  'entrypoint',
  'init',
  'privileged',
  'caps',
  'network',
  'mount',
  'policy',
  'state',
] as const)
  test(`source decoder refuses unsupported ${fault}`, () => {
    const source = sourceFixture();
    if (fault === 'image') source.Config.Image = 'wrong:1';
    if (fault === 'cwd') source.Config.WorkingDir = '/wrong';
    if (fault === 'user') source.Config.User = '0';
    if (fault === 'service') source.Config.Labels['com.docker.compose.service'] = 'wrong';
    if (fault === 'project') source.Config.Labels['com.docker.compose.project'] = '';
    if (fault === 'command') source.Config.Cmd = ['sh'];
    if (fault === 'entrypoint') Reflect.set(source.Config, 'Entrypoint', []);
    if (fault === 'init') Reflect.set(source.HostConfig, 'Init', 'true');
    if (fault === 'privileged') source.HostConfig.Privileged = true;
    if (fault === 'caps') Reflect.set(source.HostConfig, 'CapAdd', ['SYS_ADMIN']);
    if (fault === 'network') source.HostConfig.NetworkMode = 'host';
    if (fault === 'mount') source.Mounts[0].Source = '/wrong';
    if (fault === 'policy') source.HostConfig.RestartPolicy.Name = 'always';
    if (fault === 'state') source.State.Pid = 0;
    expect(() => decodeSourceDev(source, envLayout('dev'))).toThrow();
  });

test('source decoder binds inherited image entrypoint to effective executable and arguments', () => {
  const source = sourceFixture();
  Reflect.set(source.Config, 'Entrypoint', ['/usr/local/bin/docker-entrypoint.sh']);
  source.Path = '/usr/local/bin/docker-entrypoint.sh';
  source.Args = ['bun', 'run', 'dev'];
  expect(decodeSourceDev(source, envLayout('dev')).path).toBe(source.Path);
  source.Path = 'sh';
  expect(() => decodeSourceDev(source, envLayout('dev'))).toThrow('executable');
});

test('source mount contract is independent of Docker mount array order', () => {
  const source = sourceFixture();
  source.Mounts.reverse();
  expect(decodeSourceDev(source, envLayout('dev')).id).toBe(source.Id);
});

for (const fault of ['unfinished-exit', 'unstarted-running', 'early-finish'] as const)
  test(`source decoder refuses incoherent timestamp lifecycle ${fault}`, () => {
    const source = sourceFixture();
    if (fault === 'unstarted-running') source.State.StartedAt = '0001-01-01T00:00:00Z';
    else {
      source.State.Running = false;
      source.State.Pid = 0;
      source.State.Status = 'exited';
      if (fault === 'early-finish') source.State.FinishedAt = '2026-10-22T00:00:00Z';
    }
    expect(() => decodeSourceDev(source, envLayout('dev'))).toThrow();
  });

test('source running after restart retains coherent historical finish time', () => {
  const source = sourceFixture();
  source.RestartCount = 2;
  source.State.FinishedAt = '2026-10-22T23:59:00Z';
  expect(decodeSourceDev(source, envLayout('dev')).restartCount).toBe(2);
  source.State.FinishedAt = '2026-10-23T00:01:00Z';
  expect(() => decodeSourceDev(source, envLayout('dev'))).toThrow('timestamp lifecycle');
});
