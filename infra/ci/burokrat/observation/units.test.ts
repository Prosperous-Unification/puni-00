import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { type ObservationUnitInput, renderObservationUnits } from './render';

const root = import.meta.dir;

function layout(): ObservationUnitInput {
  return {
    schemaVersion: 1,
    serviceUser: 'toolwikiobs',
    serviceGroup: 'toolwikiobs',
    runtimeDirectory: '/opt/tool-wiki-observation/v1',
    trustDirectory: '/etc/tool-wiki-observation',
    stateDirectory: '/var/lib/tool-wiki-observation',
    bunPath: '/opt/tool-wiki-observation/v1/bun',
    bunIdentity: 'a'.repeat(64),
    launcherPath: '/opt/tool-wiki-observation/v1/observation-service-cli.js',
    launcherIdentity: 'b'.repeat(64),
    bunConfigPath: '/etc/tool-wiki-observation/bunfig.toml',
    bunConfigIdentity: 'c'.repeat(64),
    serviceConfigPath: '/etc/tool-wiki-observation/service.json',
    serviceConfigIdentity: 'd'.repeat(64),
    bootstrapPath: '/etc/tool-wiki-observation/bootstrap.json',
    bootstrapIdentity: 'e'.repeat(64),
    runtimePinPath: '/etc/tool-wiki-observation/runtime.sha256',
    credentialPath: '/etc/tool-wiki-observation/github-token',
    wholeTickMs: 30_000,
    cleanupMs: 5_000,
    startTimeoutSec: 60,
    stopTimeoutSec: 10,
  };
}

test('observation service template requires protected execution and bounded shutdown', () => {
  const path = join(root, 'observation.service.template');
  expect(existsSync(path)).toBe(true);
  const service = readFileSync(path, 'utf8');
  for (const directive of [
    'Type=oneshot',
    'NoNewPrivileges=yes',
    'ProtectSystem=strict',
    'ProtectHome=yes',
    'PrivateTmp=yes',
    'PrivateDevices=yes',
    'CapabilityBoundingSet=',
    'AmbientCapabilities=',
    'ReadOnlyPaths=',
    'KillMode=control-group',
    'Restart=no',
    'TimeoutStartSec=',
    'TimeoutStopSec=',
    'ReadWritePaths=',
    'ExecStartPre=',
    'ExecStart=',
  ]) {
    expect(service).toContain(directive);
  }
});

test('timer artifact cannot grant execution authority', () => {
  const path = join(root, 'observation.timer.template');
  expect(existsSync(path)).toBe(true);
  const timer = readFileSync(path, 'utf8');
  expect(timer).toContain('Persistent=true');
  expect(timer).toContain('Unit=');
  expect(timer).not.toContain('ExecStart');
  expect(timer).not.toContain('EnvironmentFile');
  expect(timer).not.toContain('Credential');
});

test('renderer binds exact non-root account runtime trust and finite service exit', () => {
  const rendered = renderObservationUnits(layout());
  expect(rendered.service).toContain('User=toolwikiobs');
  expect(rendered.service).toContain('Group=toolwikiobs');
  expect(rendered.service).toContain('ReadWritePaths=/var/lib/tool-wiki-observation');
  expect(rendered.service).toContain(
    'ReadOnlyPaths=/opt/tool-wiki-observation/v1 /etc/tool-wiki-observation',
  );
  expect(rendered.service).toContain('TimeoutStartSec=60s');
  expect(rendered.service).toContain('TimeoutStopSec=10s');
  expect(rendered.service).toContain('KillMode=control-group');
  expect(rendered.service).toContain('Restart=no');
  expect(rendered.service).toContain(
    'ExecStartPre=/usr/bin/sha256sum --check /etc/tool-wiki-observation/runtime.sha256',
  );
  expect(rendered.service).toContain(
    'ExecStart=/usr/bin/env -i PATH=/usr/bin:/bin HOME=/nonexistent TMPDIR=/tmp',
  );
  expect(rendered.service).toContain(
    '--no-env-file --config=/etc/tool-wiki-observation/bunfig.toml',
  );
  expect(rendered.service).toContain(
    '/opt/tool-wiki-observation/v1/observation-service-cli.js /etc/tool-wiki-observation/service.json',
  );
  expect(rendered.service).not.toContain('EnvironmentFile');
  expect(rendered.service).not.toContain('@');
  expect(rendered.runtimePins).toBe(
    `${'a'.repeat(64)}  /opt/tool-wiki-observation/v1/bun\n${'b'.repeat(64)}  /opt/tool-wiki-observation/v1/observation-service-cli.js\n${'c'.repeat(64)}  /etc/tool-wiki-observation/bunfig.toml\n${'d'.repeat(64)}  /etc/tool-wiki-observation/service.json\n${'e'.repeat(64)}  /etc/tool-wiki-observation/bootstrap.json\n`,
  );
});

test('renderer refuses root account unsafe layout and missing runtime pin', () => {
  const baseline = layout();
  for (const changed of [
    { ...baseline, serviceUser: 'root' },
    { ...baseline, stateDirectory: baseline.runtimeDirectory },
    { ...baseline, serviceConfigPath: '/var/lib/tool-wiki-observation/service.json' },
    { ...baseline, serviceConfigPath: '/etc/foreign-service/service.json' },
    { ...baseline, bunPath: '/opt/tool-wiki-observation/v1/bun%h' },
    { ...baseline, runtimePinPath: '' },
    {
      ...baseline,
      runtimePinPath: '/etc/tool-wiki-observation/runtime.sha256\nExecStart=/bin/true',
    },
  ]) {
    expect(() => renderObservationUnits(changed)).toThrow();
  }
});

test('renderer refuses timeout that cannot cover tick cleanup or stop', () => {
  const baseline = layout();
  expect(() => renderObservationUnits({ ...baseline, startTimeoutSec: 35 })).toThrow();
  expect(() => renderObservationUnits({ ...baseline, stopTimeoutSec: 4 })).toThrow();
  expect(() => renderObservationUnits({ ...baseline, startTimeoutSec: 3601 })).toThrow();
});

test('renderer refuses a protected input outside its exact trust directory', () => {
  expect(() =>
    renderObservationUnits({
      ...layout(),
      serviceConfigPath: '/etc/foreign-service/service.json',
    }),
  ).toThrow('observation unit path escapes protected layout');
});

for (const [name, segment] of [
  ['systemd variable', '${USER}'],
  ['quote', '"'],
  ['NUL', '\0'],
] as const) {
  test(`renderer refuses ${name} in an executable service path`, () => {
    expect(() =>
      renderObservationUnits({
        ...layout(),
        launcherPath: `/opt/tool-wiki-observation/v1/launcher-${segment}`,
      }),
    ).toThrow('observation unit path malformed');
  });
}

test('admin renderer writes an uninstalled bundle into a fresh directory only', async () => {
  const scratch = mkdtempSync(join(tmpdir(), 'observation-render-test-'));
  try {
    const inputPath = join(scratch, 'layout.json');
    const outputDirectory = join(scratch, 'rendered');
    writeFileSync(inputPath, JSON.stringify(layout()));
    const first = Bun.spawn(['bun', join(root, 'render-cli.ts'), inputPath, outputDirectory], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(await first.exited).toBe(0);
    expect(readFileSync(join(outputDirectory, 'tool-wiki-observation.service'), 'utf8')).toContain(
      'Type=oneshot',
    );
    const preexistingDirectory = join(scratch, 'preexisting');
    mkdirSync(preexistingDirectory);
    const preexisting = Bun.spawn(
      ['bun', join(root, 'render-cli.ts'), inputPath, preexistingDirectory],
      {
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    expect(await preexisting.exited).not.toBe(0);
    expect(existsSync(join(preexistingDirectory, 'tool-wiki-observation.service'))).toBe(false);
    const aliasDirectory = join(scratch, 'alias');
    mkdirSync(aliasDirectory);
    const aliasedOutput = `${aliasDirectory}/../aliased-render`;
    const aliased = Bun.spawn(['bun', join(root, 'render-cli.ts'), inputPath, aliasedOutput], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(await aliased.exited).not.toBe(0);
    expect(existsSync(join(scratch, 'aliased-render'))).toBe(false);
    expect(readFileSync(join(outputDirectory, 'tool-wiki-observation.timer'), 'utf8')).toContain(
      'Persistent=true',
    );
    const second = Bun.spawn(['bun', join(root, 'render-cli.ts'), inputPath, outputDirectory], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(await second.exited).not.toBe(0);
    expect(readFileSync(join(outputDirectory, 'tool-wiki-observation.service'), 'utf8')).toContain(
      'Type=oneshot',
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
