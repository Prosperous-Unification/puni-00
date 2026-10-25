import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';
import { stringify } from 'yaml';

const cli = join(import.meta.dir, 'parity-render-cli.ts');
function prepare() {
  const root = mkdtempSync(join(tmpdir(), 'parity-render-test-'));
  for (const path of ['infra/versions', 'infra/platform/charts', 'bin'])
    mkdirSync(join(root, path), { recursive: true });
  const kubectl = join(root, 'bin/kubectl'),
    helm = join(root, 'bin/helm');
  writeFileSync(
    kubectl,
    `#!/bin/sh\nif [ "$1" = version ]; then echo '{"clientVersion":{"gitVersion":"v1.2.3"}}'; else cat '${root}/manifest.yaml'; fi\n`,
  );
  chmodSync(kubectl, 0o700);
  writeFileSync(helm, "#!/bin/sh\nprintf 'v4.3.0'\n");
  chmodSync(helm, 0o700);
  writeFileSync(join(root, 'infra/platform/charts/chart.tgz'), 'chart');
  const lock = {
    binaries: {
      kubectl: {
        version: 'v1.2.3',
        sha256: createHash('sha256').update(readFileSync(kubectl)).digest('hex'),
      },
      helm: { version: 'v4.3.0' },
    },
    charts: {
      fixture: {
        version: '1.0.0',
        url: 'https://example.test/chart.tgz',
        sha256: createHash('sha256').update('chart').digest('hex'),
      },
    },
  };
  const manifest = {
    kind: 'HelmRelease',
    metadata: { name: 'fixture', namespace: 'observability' },
    spec: {
      chart: { spec: { chart: 'infra/platform/charts/chart.tgz', version: '1.0.0' } },
      values: {},
    },
  };
  function run(options: { lockText?: string; rendered?: string } = {}) {
    writeFileSync(
      join(root, 'infra/versions/toolchain.json'),
      options.lockText ?? JSON.stringify(lock),
    );
    writeFileSync(join(root, 'manifest.yaml'), options.rendered ?? stringify(manifest));
    return Bun.spawnSync([process.execPath, cli, root, join(root, 'bin')]);
  }
  return { root, lock, manifest, run, kubectl, helm };
}
for (const [name, message] of [
  ['executable hash', 'renderer tool kubectl hash differs'],
  ['version', 'renderer tool version differs'],
  ['process failure', 'renderer tool failed'],
  ['chart path', 'renderer chart identity differs'],
  ['chart version', 'renderer chart identity differs'],
  ['chart hash', 'renderer chart hash differs'],
] as const)
  test(`actual renderer adapter rejects ${name}`, () => {
    const fixture = prepare();
    try {
      if (name === 'executable hash') writeFileSync(fixture.kubectl, 'replaced');
      if (name === 'version') fixture.lock.binaries.helm.version = 'v4.4.0';
      if (name === 'process failure') writeFileSync(fixture.helm, '#!/bin/sh\nexit 42\n');
      if (name === 'chart path') fixture.manifest.spec.chart.spec.chart = 'outside/chart.tgz';
      if (name === 'chart version') fixture.manifest.spec.chart.spec.version = '2.0.0';
      if (name === 'chart hash')
        writeFileSync(join(fixture.root, 'infra/platform/charts/chart.tgz'), 'corrupt');
      const outcome = fixture.run();
      expect(outcome.exitCode).toBe(1);
      expect(outcome.stderr.toString()).toContain(message);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

for (const [name, lockText] of [
  ['JSON syntax', '{'],
  [
    'required field',
    '{"binaries":{"kubectl":{"version":"v1.2.3","sha256":"x"},"helm":{}},"charts":{}}',
  ],
  [
    'field type',
    '{"binaries":{"kubectl":{"version":"v1.2.3","sha256":"x"},"helm":{"version":42}},"charts":{}}',
  ],
] as const)
  test(`actual renderer adapter rejects malformed lock ${name}`, () => {
    const fixture = prepare();
    try {
      const outcome = fixture.run({ lockText });
      expect(outcome.exitCode).toBe(1);
      expect(outcome.stderr.toString()).toBe('malformed renderer lock\n');
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
test('actual renderer adapter rejects duplicate HelmRelease before comparison', () => {
  const fixture = prepare();
  try {
    const outcome = fixture.run({
      rendered: [fixture.manifest, fixture.manifest]
        .map((manifest) => stringify(manifest))
        .join('---\n'),
    });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr.toString()).toBe('duplicate rendered HelmRelease\n');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
test('actual renderer adapter checks the kubectl version independently', () => {
  const fixture = prepare();
  try {
    fixture.lock.binaries.kubectl.version = 'v1.2.4';
    const outcome = fixture.run();
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr.toString()).toBe('renderer tool version differs\n');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
