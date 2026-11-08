import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { describe, expect, it } from 'bun:test';
import { parse, parseAllDocuments } from 'yaml';

const root = join(import.meta.dir, '../../..');
interface Container {
  command: string[];
  readinessProbe?: { exec: { command: string[] } };
}
interface ObjectResource {
  kind: string;
  spec: { template: { spec: { containers: [Container] } } };
}
interface ElasticRelease {
  spec: {
    values: {
      nodeSets: [
        { config: Record<string, string>; podTemplate: { spec: { initContainers: [Container] } } },
      ];
    };
  };
}
async function objectContainer(kind: string): Promise<Container> {
  const documents = parseAllDocuments(
    await readFile(join(root, 'infra/platform/backup/local/object-store.yaml'), 'utf8'),
  );
  const resource = documents
    .map((document) => document.toJS() as ObjectResource)
    .find((resource) => resource.kind === kind);
  if (resource === undefined) throw new Error(`Missing shipped ${kind}`);
  return resource.spec.template.spec.containers[0];
}

/** Execute the shipped startup/bucket script while isolating its mounts and recording listener/client entry. */
async function runTrustBoundary(
  kind: string,
  fault: 'missing' | 'unreadable' | 'empty' | 'none',
  bypass = false,
) {
  const directory = await scratchAsync('backup-tls-');
  await mkdir(join(directory, 'certs'));
  await mkdir(join(directory, 'bin'));
  for (const filename of ['public.crt', 'private.key', 'ca.crt']) {
    if (fault !== 'missing') {
      await writeFile(join(directory, 'certs', filename), fault === 'empty' ? '' : 'fixture');
      if (fault === 'unreadable') await chmod(join(directory, 'certs', filename), 0);
    }
  }
  for (const binary of ['minio', 'mc']) {
    await writeFile(
      join(directory, 'bin', binary),
      '#!/bin/sh\necho client-entered >&2\nexit 91\n',
      { mode: 0o755 },
    );
  }
  const searchPath = process.env['PATH'];
  if (searchPath === undefined) throw new Error('Test PATH absent');
  const container = await objectContainer(kind);
  expect(container.command).toBeDefined();
  return Bun.spawnSync(
    container.command.map((argument) =>
      argument
        .replaceAll('/object-store-tls', join(directory, 'certs'))
        .replaceAll('/object-store-ca', join(directory, 'certs')),
    ),
    {
      env: {
        ...process.env,
        PATH: `${join(directory, 'bin')}:${searchPath}`,
        MC_CONFIG_DIR: join(directory, 'mc'),
        MINIO_ROOT_USER: 'fixture',
        MINIO_ROOT_PASSWORD: 'fixture',
        ...(bypass ? { MC_INSECURE: 'true' } : {}),
      },
    },
  );
}

describe('backup transport contract', () => {
  it('local and production snapshot endpoints require HTTPS', async () => {
    const shared = parse(
      await readFile(
        join(root, 'infra/platform/observability/elastic/base/elasticsearch.yaml'),
        'utf8',
      ),
    ) as ElasticRelease;
    const local = parse(
      await readFile(join(root, 'infra/platform/observability/local/kustomization.yaml'), 'utf8'),
    ) as { patches: [{ patch: string }] };
    expect(shared.spec.values.nodeSets[0].config['s3.client.default.protocol']).toBe('https');
    expect(local.patches[0].patch).not.toContain('value: "http"');
    expect(
      await readFile(join(root, 'infra/platform/backup/velero/local/velero.yaml'), 'utf8'),
    ).toContain('s3Url: https://object-store.puni-backup.svc:9000');
  });
  for (const kind of ['Deployment', 'Job']) {
    it(`${kind} refuses ambient certificate bypass`, async () => {
      const execution = await runTrustBoundary(kind, 'none', true);
      expect(execution.exitCode).toBe(1);
      expect(execution.stderr.toString()).toContain('certificate bypass');
    });
    for (const fault of ['missing', 'unreadable', 'empty'] as const) {
      it(`${kind} refuses ${fault} trust before opening transport`, async () => {
        const execution = await runTrustBoundary(kind, fault);
        expect(execution.exitCode).toBe(1);
        expect(execution.stderr.toString()).toContain(`${fault} TLS input`);
        expect(execution.stderr.toString()).not.toContain('client-entered');
      });
    }
    it(`${kind} reaches its pinned client with readable trust`, async () => {
      expect((await runTrustBoundary(kind, 'none')).exitCode).toBe(91);
    });
  }
  it('executes readiness without a Ready Service route', async () => {
    const directory = await scratchAsync('backup-readiness-route-');
    await writeFile(
      join(directory, 'mc'),
      `#!/bin/sh
set -eu
if [ "$1 $2" = 'alias set' ]; then
  [ "$4" = 'https://127.0.0.1:9000' ] || { echo 'Service has no Ready endpoints' >&2; exit 42; }
  [ "$5" = 'fixture-user' ] && [ "$6" = 'fixture-password' ] || exit 43
elif [ "$1 $2" != 'ready store' ]; then
  exit 44
fi
`,
      { mode: 0o755 },
    );
    const command = (await objectContainer('Deployment')).readinessProbe?.exec.command;
    if (command === undefined) throw new Error('Shipped readiness command absent');
    const searchPath = process.env['PATH'];
    if (searchPath === undefined) throw new Error('Test PATH absent');
    const execution = Bun.spawnSync(command, {
      env: {
        ...process.env,
        PATH: `${directory}:${searchPath}`,
        MINIO_ROOT_USER: 'fixture-user',
        MINIO_ROOT_PASSWORD: 'fixture-password',
      },
    });
    expect(execution.stderr.toString()).toBe('');
    expect(execution.exitCode).toBe(0);
  });
  it('readiness verifies the configured CA with a bounded client', async () => {
    const probe = (await objectContainer('Deployment')).readinessProbe;
    expect(probe?.exec.command.join(' ')).toContain('timeout');
    expect(probe?.exec.command.join(' ')).toContain('mc');
    expect(probe?.exec.command.join(' ')).not.toContain('--insecure');
  });
});

async function runJavaTrust(
  fault:
    | 'missing'
    | 'unreadable'
    | 'empty'
    | 'none'
    | 'system-missing'
    | 'system-unreadable'
    | 'malformed',
  mode: string,
) {
  const directory = await scratchAsync('java-trust-');
  await mkdir(join(directory, 'jdk/lib/security'), { recursive: true });
  await mkdir(join(directory, 'jdk/bin'));
  await mkdir(join(directory, 'trust'));
  await mkdir(join(directory, 'credentials'));
  if (fault !== 'system-missing')
    await writeFile(join(directory, 'jdk/lib/security/cacerts'), 'system roots');
  if (fault === 'system-unreadable') await chmod(join(directory, 'jdk/lib/security/cacerts'), 0);
  if (fault !== 'missing') {
    await writeFile(join(directory, 'credentials/ca.crt'), fault === 'empty' ? '' : 'fixture');
    if (fault === 'unreadable') await chmod(join(directory, 'credentials/ca.crt'), 0);
  }
  await writeFile(
    join(directory, 'jdk/bin/keytool'),
    '#!/bin/sh\nif [ "$1" = -printcert ]; then [ "$FAULT" = malformed ] && exit 42; exit 0; fi\necho keytool-entered >&2\nexit 91\n',
    { mode: 0o755 },
  );
  const shared = parse(
    await readFile(
      join(root, 'infra/platform/observability/elastic/base/elasticsearch.yaml'),
      'utf8',
    ),
  ) as ElasticRelease;
  const init = shared.spec.values.nodeSets[0].podTemplate.spec.initContainers[0];
  expect(init).toBeDefined();
  const command: string[] = init.command;
  return Bun.spawnSync(
    command.map((argument) =>
      argument
        .replaceAll('/usr/share/elasticsearch/jdk', join(directory, 'jdk'))
        .replaceAll('/usr/share/elasticsearch/config/s3-trust', join(directory, 'trust'))
        .replaceAll('/s3-credentials', join(directory, 'credentials')),
    ),
    {
      env: { ...process.env, JAVA_HOME: join(directory, 'jdk'), S3_TRUST_MODE: mode, FAULT: fault },
    },
  );
}

describe('Elasticsearch shared trust setup', () => {
  for (const fault of ['system-missing', 'system-unreadable'] as const) {
    it(`refuses ${fault} bundled roots`, async () => {
      const execution = await runJavaTrust(fault, 'system-roots');
      expect(execution.exitCode).not.toBe(0);
      expect(execution.stderr.toString()).toContain('cacerts');
    });
  }
  for (const fault of ['missing', 'unreadable', 'empty'] as const) {
    it(`refuses ${fault} private CA instead of falling back to public roots`, async () => {
      const execution = await runJavaTrust(fault, 'system-roots-plus-ca');
      expect(execution.exitCode).toBe(1);
      expect(execution.stderr.toString()).toContain(`${fault} TLS input`);
      expect(execution.stderr.toString()).not.toContain('keytool-entered');
    });
  }
  it('selects public roots explicitly without requiring a private CA', async () => {
    expect((await runJavaTrust('missing', 'system-roots')).exitCode).toBe(0);
  });
  it('imports the required private CA through the bundled keytool', async () => {
    expect((await runJavaTrust('none', 'system-roots-plus-ca')).exitCode).toBe(91);
  });
  it('refuses malformed private CA distinctly', async () => {
    const execution = await runJavaTrust('malformed', 'system-roots-plus-ca');
    expect(execution.exitCode).toBe(1);
    expect(execution.stderr.toString()).toContain('malformed TLS input');
  });
  it('refuses an unknown mode', async () => {
    const execution = await runJavaTrust('none', 'insecure');
    expect(execution.exitCode).toBe(1);
    expect(execution.stderr.toString()).toContain('invalid S3_TRUST_MODE');
  });
});
