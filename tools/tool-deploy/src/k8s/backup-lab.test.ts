import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';
import { parseAllDocuments } from 'yaml';

import { prepareBackupLab, requireVerification, VERIFICATION_FAULT_SCRIPT } from './backup-lab';

describe('scheduled verification lab evidence', () => {
  it('refuses a failed known-backup verification', () => {
    expect(() => {
      requireVerification('known', 'failed', 'connection refused');
    }).toThrow('known');
  });

  it('refuses a fault the production runner accepted', () => {
    expect(() => {
      requireVerification('snapshot', 'succeeded', 'bytes differ from its report', 'bytes differ');
    }).toThrow('snapshot');
  });

  it('refuses a failure caused by an unrelated dependency', () => {
    expect(() => {
      requireVerification('snapshot', 'failed', 'connection refused', 'bytes differ');
    }).toThrow('snapshot');
  });

  it('accepts the observed success and the specific production refusal', () => {
    expect(() => {
      requireVerification('known', 'succeeded', 'verified report');
    }).not.toThrow();
    expect(() => {
      requireVerification('snapshot', 'failed', 'bytes differ from its report', 'bytes differ');
    }).not.toThrow();
  });
});

async function createFixture() {
  const directory = await scratchAsync('verification-cronjob-');
  const objects = new Map<string, Uint8Array<ArrayBuffer>>();
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const key = decodeURIComponent(url.pathname).replace(/^\/puni-sqlite\//, '');
      if (request.method === 'PUT') {
        objects.set(key, new Uint8Array(await request.arrayBuffer()));
        return new Response('', { headers: { 'x-amz-version-id': 'lab-version' } });
      }
      if (request.method === 'GET' && url.searchParams.has('list-type')) {
        const prefix = url.searchParams.get('prefix');
        if (prefix === null) throw new Error('S3 fixture requires a list prefix');
        const keys = [...objects.keys()].filter((stored) => stored.startsWith(prefix));
        return new Response(
          `<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><IsTruncated>false</IsTruncated>${keys.map((stored) => `<Contents><Key>${stored}</Key></Contents>`).join('')}</ListBucketResult>`,
          { headers: { 'content-type': 'application/xml' } },
        );
      }
      const bytes = objects.get(key);
      if (request.method !== 'GET' || bytes === undefined) return new Response('', { status: 404 });
      return new Response(bytes);
    },
  });
  try {
    const source = join(directory, 'source.sqlite');
    const db = new Database(source, { create: true });
    try {
      db.run(
        'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, name TEXT, hash TEXT, created_at INTEGER)',
      );
      db.run("INSERT INTO __drizzle_migrations VALUES (1, 'known-migration', 'known-hash', 1)");
      db.run('CREATE TABLE project (name TEXT)');
      db.run("INSERT INTO project VALUES ('verification-known-row')");
    } finally {
      db.close();
    }
    const environment = {
      S3_ENDPOINT: server.url.toString(),
      S3_BUCKET: 'puni-sqlite',
      S3_REGION: 'us-east-1',
      AWS_ACCESS_KEY_ID: 'lab-only-access',
      AWS_SECRET_ACCESS_KEY: 'lab-only-secret',
      BACKUP_DATABASE_NAME: 'wbs',
      BACKUP_PREFIX: 'sqlite',
      RESTORE_TARGET_PATH: join(directory, 'verified.sqlite'),
    };
    const backedUp = await runRunner(
      {
        ...environment,
        BACKUP_DATABASE_PATH: source,
        BACKUP_SCRATCH_DIRECTORY: directory,
        PUNI_SOURCE_REVISION: 'lab-source',
      },
      undefined,
      'backup',
    );
    if (backedUp.exitCode !== 0) throw new Error(backedUp.stderr);
    const report = JSON.parse(backedUp.stdout) as { objectKey: string; sha256: string };
    return { server, environment, report, objects };
  } catch (cause) {
    await server.stop(true);
    throw cause;
  }
}

async function runRunner(
  environment: Record<string, string>,
  script?: string,
  mode: 'backup' | 'verify' = 'verify',
) {
  const command =
    script === undefined
      ? ['bun', join(import.meta.dir, '../../../tool-fleet/src/backup-sqlite.ts'), mode]
      : ['bun', '-e', script];
  const process = Bun.spawn(command, {
    env: { ...globalThis.process.env, ...environment },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  return { stdout, stderr, exitCode };
}

describe('verification lab faults through the production CLI', () => {
  it('verifies the known snapshot and complete migration set', async () => {
    const fixture = await createFixture();
    try {
      const verified = await runRunner(fixture.environment);
      expect(verified.exitCode).toBe(0);
      expect(JSON.parse(verified.stdout)).toEqual(fixture.report);
      const db = new Database(fixture.environment.RESTORE_TARGET_PATH, { readonly: true });
      try {
        expect(db.query('SELECT name FROM project').all()).toEqual([
          { name: 'verification-known-row' },
        ]);
      } finally {
        db.close();
      }
    } finally {
      await fixture.server.stop(true);
    }
  });

  for (const [fault, refusal] of [
    ['snapshot', 'bytes differ from its report'],
    ['report', 'migration set differs from its report'],
  ] as const) {
    it(`refuses the lab's injected ${fault} fault`, async () => {
      const fixture = await createFixture();
      try {
        const prefix = `f10-${fault}`;
        const injected = await runRunner(
          {
            ...fixture.environment,
            PUNI_REPORT: JSON.stringify(fixture.report),
            PUNI_PREFIX: prefix,
            PUNI_FAULT: fault,
          },
          VERIFICATION_FAULT_SCRIPT.replace(
            // The local fixture resolves the same shipped runner bytes as the lab ConfigMap mount.
            '/runner/backup-sqlite.ts',
            join(import.meta.dir, '../../../tool-fleet/src/backup-sqlite.ts'),
          ),
        );
        expect(injected.exitCode).toBe(0);
        const refused = await runRunner({ ...fixture.environment, BACKUP_PREFIX: prefix });
        expect(refused.exitCode).not.toBe(0);
        expect(refused.stderr).toContain(refusal);
        const original = fixture.objects.get(fixture.report.objectKey);
        if (original === undefined)
          throw new Error('The fault injector removed the original backup');
        expect(createHash('sha256').update(original).digest('hex')).toBe(fixture.report.sha256);
      } finally {
        await fixture.server.stop(true);
      }
    });
  }

  it('refuses an absent backup under the isolated prefix', async () => {
    const fixture = await createFixture();
    try {
      const refused = await runRunner({ ...fixture.environment, BACKUP_PREFIX: 'f10-absent' });
      expect(refused.exitCode).not.toBe(0);
      expect(refused.stderr).toContain('No SQLite backup report under f10-absent/wbs/');
    } finally {
      await fixture.server.stop(true);
    }
  });
});

interface LabResource {
  readonly kind: string;
  readonly metadata: { readonly name: string };
  readonly spec: { readonly suspend?: boolean; readonly jobTemplate?: unknown };
}

describe('backup lab schedule isolation', () => {
  it('refuses a CronJob whose trusted spec is absent or null', () => {
    for (const spec of [undefined, null]) {
      expect(() => prepareBackupLab(JSON.stringify({ kind: 'CronJob', spec }))).toThrow(
        'CronJob spec',
      );
    }
  });

  it('suspends both shipped CronJobs before apply while preserving their manual Job templates', () => {
    // Proof: without base/**/* and backup-sqlite.ts in tool-deploy:test inputs, the production
    // workspace index reported both this dynamic manifest directory and the CLI runner missing.
    const manifests = ['backup.yaml', 'verify-cronjob.yaml'].map((name) =>
      readFileSync(join(import.meta.dir, '../../../../deploy/k8s/wbs/base', name), 'utf8'),
    );
    const rendered = manifests.join('\n---\n');
    const prepared = JSON.parse(prepareBackupLab(rendered)) as { items: LabResource[] };
    const crons = prepared.items.filter(
      (resource: { kind: string }) => resource.kind === 'CronJob',
    );
    expect(crons).toHaveLength(2);
    for (const name of ['sqlite-backup', 'sqlite-backup-verify']) {
      const shipped = manifests
        .flatMap((manifest) =>
          parseAllDocuments(manifest).map((document) => document.toJS() as LabResource),
        )
        .flatMap((resource) => (resource.kind === 'CronJob' ? [resource] : []))
        .find((resource) => resource.metadata.name === name);
      const isolated = crons.find(
        (resource: { metadata: { name: string } }) => resource.metadata.name === name,
      );
      if (shipped === undefined || isolated === undefined)
        throw new Error(`Missing shipped CronJob ${name}`);
      expect(isolated.spec.suspend).toBe(true);
      expect(isolated.spec.jobTemplate).toEqual(shipped.spec.jobTemplate);
    }
  });
});
