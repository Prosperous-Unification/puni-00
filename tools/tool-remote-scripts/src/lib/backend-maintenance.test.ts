import { expect, test } from 'bun:test';

import {
  assertMaintenanceContainer,
  backendWorkingDirectory,
  maintenanceConfig,
} from './backend-maintenance';

const identity = 'a'.repeat(64);
const imageId = `sha256:${'b'.repeat(64)}`;
const image = `registry/wbs-be-01@${imageId}`;
const name = 'be-01-green';
const app = JSON.stringify({
  services: {
    [name]: {
      image,
      container_name: name,
      init: true,
      working_dir: '/app/apps/wbs/be-01',
      environment: { DB_PATH: '/data/wbs.db' },
      volumes: [{ type: 'bind', source: '/host/data', target: '/data' }],
      command: ['bun', 'run', 'src/main.ts'],
      entrypoint: ['application'],
      healthcheck: { test: ['CMD', 'health'] },
      restart: 'always',
    },
  },
});
function observed() {
  return {
    Id: identity,
    Image: imageId,
    State: { Running: true, Paused: false, Restarting: false },
    Config: {
      Image: image,
      Entrypoint: ['bun', '-e', 'setInterval(() => {}, 60000)'],
      Cmd: [] as string[],
      WorkingDir: '/app/apps/wbs/be-01',
      Env: ['DB_PATH=/data/wbs.db'],
      Healthcheck: { Test: ['NONE'] },
    },
    HostConfig: {
      Init: true,
      PidMode: '',
      Privileged: false,
      CapAdd: null as string[] | null,
      RestartPolicy: { Name: 'no' },
      PortBindings: {},
    },
    Mounts: [{ Type: 'bind', Source: '/host/data', Destination: '/data', RW: true }],
  };
}
test('maintenance snapshot replaces all application entrypoints, commands and health/restart behavior', () => {
  const maintenance = maintenanceConfig(app, name);
  const parsed = JSON.parse(maintenance) as { services: Record<string, unknown> };
  expect(parsed.services[name]).toMatchObject({
    image,
    init: true,
    entrypoint: ['bun', '-e', 'setInterval(() => {}, 60000)'],
    command: [],
    healthcheck: { disable: true },
    restart: 'no',
    environment: { DB_PATH: '/data/wbs.db' },
    volumes: [{ type: 'bind', source: '/host/data', target: '/data' }],
  });
  expect(
    (JSON.parse(app) as { services: Record<string, { entrypoint: string[] }> }).services[name]
      .entrypoint,
  ).toEqual(['application']);
  assertMaintenanceContainer(JSON.stringify(observed()), identity, imageId, maintenance, name);
});
for (const fault of [
  'id',
  'image',
  'entrypoint',
  'command',
  'health',
  'restart',
  'env',
  'mount',
  'running',
  'init',
  'workdir',
  'paused',
  'restarting',
  'pid-mode',
  'privileged',
  'capability',
  'ports',
  'image-ref',
] as const) {
  test(`maintenance execution refuses ${fault} drift before any database CLI`, () => {
    const container = observed();
    if (fault === 'id') container.Id = 'c'.repeat(64);
    if (fault === 'image') container.Image = `sha256:${'d'.repeat(64)}`;
    if (fault === 'entrypoint') container.Config.Entrypoint = ['application'];
    if (fault === 'command') container.Config.Cmd = ['src/main.ts'];
    if (fault === 'health') container.Config.Healthcheck.Test = ['CMD', 'health'];
    if (fault === 'restart') container.HostConfig.RestartPolicy.Name = 'always';
    if (fault === 'env') container.Config.Env = ['DB_PATH=/data/other.db'];
    if (fault === 'mount') container.Mounts[0].Source = '/other';
    if (fault === 'running') container.State.Running = false;
    if (fault === 'init') container.HostConfig.Init = false;
    if (fault === 'workdir') container.Config.WorkingDir = '/';
    if (fault === 'paused') container.State.Paused = true;
    if (fault === 'restarting') container.State.Restarting = true;
    if (fault === 'pid-mode') container.HostConfig.PidMode = 'host';
    if (fault === 'privileged') container.HostConfig.Privileged = true;
    if (fault === 'capability') container.HostConfig.CapAdd = ['SYS_ADMIN'];
    if (fault === 'ports')
      Reflect.set(container.HostConfig, 'PortBindings', { '3100/tcp': [{ HostPort: '3100' }] });
    if (fault === 'image-ref') container.Config.Image = 'other';
    expect(() => {
      assertMaintenanceContainer(
        JSON.stringify(container),
        identity,
        imageId,
        maintenanceConfig(app, name),
        name,
      );
    }).toThrow('maintenance');
  });
}

test('effective working directory refuses absent and traversal metadata before snapshots', () => {
  const withDirectory = (working_dir: unknown) =>
    JSON.stringify({ services: { [name]: { working_dir } } });
  for (const directory of ['', '/app/../other', null, 4]) {
    expect(() => {
      backendWorkingDirectory(withDirectory(directory), name, '/image');
    }).toThrow('working directory');
  }
  expect(
    JSON.parse(
      backendWorkingDirectory(JSON.stringify({ services: { [name]: {} } }), name, '/image'),
    ) as unknown,
  ).toEqual({ services: { [name]: { working_dir: '/image' } } });
});
