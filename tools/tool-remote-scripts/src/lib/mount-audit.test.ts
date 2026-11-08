import { chmod, link, mkdir, rename, rm, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { createNamespaceFixture as fixture } from '../fixtures/namespace-audit';
import { inspectBackendWriters } from '../swap';
import { auditManagedMounts, auditUnmanagedMounts } from './backend-cohort';
import { ROOT } from './docker';
import { verifyContainerNamespace } from './mount-audit';

const image = `registry/wbs-be-01@sha256:${'c'.repeat(64)}`;
test('normal shipped mounted namespaces admit with complete initialized-session cleanup', async () => {
  const proof = await fixture();
  try {
    await verifyContainerNamespace(
      proof.container,
      proof.destinations,
      proof.database,
      image,
      proof.runDocker,
      null,
      undefined,
      proof.exec,
    );
    expect(proof.counters()).toEqual({ sessions: 4, acknowledgements: 4 });
    expect(
      proof.commands.filter((args) => ['stop', 'restart', 'rm', 'create', 'run'].includes(args[0])),
    ).toEqual([]);
  } finally {
    await chmod(join(proof.root, 'family'), 0o700);
    await rm(proof.root, { recursive: true, force: true });
  }
});
test('effective readonly alias remains a reader', async () => {
  const proof = await fixture('readonly-reader');
  try {
    await verifyContainerNamespace(
      proof.container,
      proof.destinations,
      proof.database,
      image,
      proof.runDocker,
      null,
      undefined,
      proof.exec,
    );
  } finally {
    await chmod(join(proof.root, 'family'), 0o700);
    await rm(proof.root, { recursive: true, force: true });
  }
});
for (const fault of [
  'replaced-source',
  'nested-rw',
  'all-ro-nested',
  'hidden-root',
  'hardlink:',
  'hardlink:-wal',
  'hardlink:-shm',
  'hardlink:-journal',
  'symlink',
  'image-absent',
  'image-malformed',
  'tool-absent',
  'entry-stat-failure',
  'mountinfo-malformed',
  'mountinfo-race',
  'pid-race',
  'incomplete',
  'forged-receipt',
  'count-mismatch',
  'extra-frame',
  'reap-absent',
  'group-residue',
  'entry-limit',
  'depth-limit',
  'stalled-start',
  'stalled-cleanup',
  'session-forged',
  'host-family-race',
  'main-absent',
  'main-nonregular',
  'main-unreadable',
  'declared-mount-missing',
  'root-mount-missing',
  'ambiguous-mount',
  'privileged-target',
  'expanded-capability',
  'missing-pid',
  'malformed-pid',
  'missing-init',
  'private-pid-missing',
  'inspection-unreadable',
]) {
  test(`actual initialized namespace admission refuses ${fault}`, async () => {
    const proof = await fixture(fault);
    try {
      await refuses(
        verifyContainerNamespace(
          proof.container,
          proof.destinations,
          proof.database,
          image,
          proof.runDocker,
          null,
          { totalMs: 300, cleanupMs: 120 },
          proof.exec,
        ),
      );
    } finally {
      await chmod(join(proof.root, 'family'), 0o700);
      await rm(proof.root, { recursive: true, force: true });
    }
  });
}
for (const fault of ['managed-match', 'managed-mismatch'])
  test(`managed actual family ${fault}`, async () => {
    const proof = await fixture(fault);
    try {
      const checked = verifyContainerNamespace(
        proof.container,
        proof.destinations,
        proof.database,
        image,
        proof.runDocker,
        '/data/wbs.db',
        undefined,
        proof.exec,
      );
      if (fault === 'managed-match') await checked;
      else await refuses(checked, 'family');
    } finally {
      await chmod(join(proof.root, 'family'), 0o700);
      await rm(proof.root, { recursive: true, force: true });
    }
  });

async function refuses(check: Promise<unknown>, message?: string): Promise<void> {
  let failure: unknown = null;
  try {
    await check;
  } catch (cause) {
    failure = cause;
  }
  expect(failure).toBeInstanceOf(Error);
  if (message !== undefined) expect(String(failure)).toContain(message);
}

test('production writer inventory delegates inaccessible named-volume sources to actual namespace admission and never stops unrelated services', async () => {
  const proof = await fixture();
  try {
    const hostLogs = join(proof.root, 'host-logs');
    await mkdir(hostLogs);
    const mounts = proof.destinations.map((destination, index) => ({
      Type: index === 2 ? 'bind' : 'volume',
      Source: index === 2 ? hostLogs : `/var/lib/docker/volumes/audit-${index.toString()}/_data`,
      Destination: destination,
      RW: true,
    }));
    const inventory = (args: string[]) => {
      if (args[0] === 'ps') return Promise.resolve(proof.container.Id);
      if (args[0] === 'inspect' && args[1] !== '--format')
        return Promise.resolve(
          JSON.stringify([{ ...proof.container, Name: '/wbs-caddy-1', Mounts: mounts }]),
        );
      return proof.runDocker(args);
    };
    const resolveMount = (path: string) => {
      if (path === `${ROOT}/data`) return Promise.resolve(join(proof.root, 'family'));
      if (path.startsWith('/var/lib/docker/volumes/'))
        return Promise.reject(Object.assign(new Error('permission denied'), { code: 'EACCES' }));
      return Promise.resolve(path);
    };
    const writers = await inspectBackendWriters(
      inventory,
      proof.database,
      resolveMount,
      image,
      (container, destinations, database, candidate, runDocker, databasePath, bounds) =>
        verifyContainerNamespace(
          container,
          destinations,
          database,
          candidate,
          runDocker,
          databasePath,
          bounds,
          proof.exec,
        ),
    );
    expect(writers.size).toBe(0);
    expect(proof.counters().acknowledgements).toBe(4);
    expect(proof.commands.some((args) => ['stop', 'restart', 'rm'].includes(args[0]))).toBe(false);
  } finally {
    await chmod(join(proof.root, 'family'), 0o700);
    await rm(proof.root, { recursive: true, force: true });
  }
});

test('reduced-capability census refuses unreadable directory hiding a SQLite hardlink', async () => {
  const proof = await fixture('unreadable-hardlink');
  Reflect.set(proof.container.HostConfig, 'CapDrop', ['ALL']);
  try {
    let refused = false;
    try {
      await verifyContainerNamespace(
        proof.container,
        proof.destinations,
        proof.database,
        image,
        proof.runDocker,
        null,
        undefined,
        proof.exec,
      );
    } catch (cause) {
      expect(cause).toBeInstanceOf(Error);
      expect(String(cause)).toContain('actual scanner failed 80');
      refused = true;
    }
    expect(refused).toBe(true);
  } finally {
    await chmod(join(proof.root, 'namespace/data/nested'), 0o700);
    await rm(proof.root, { recursive: true, force: true });
  }
});

async function auditBackendParticipant(
  proof: Awaited<ReturnType<typeof fixture>>,
  opaque: boolean,
  readonly = false,
  totalMs = 3000,
  sourceCode: 'EACCES' | 'ENOENT' = 'EACCES',
): Promise<void> {
  const file = await stat(proof.database);
  const directory = await stat(join(proof.root, 'family'));
  const hostSource = join(proof.root, 'rebound-empty');
  await mkdir(hostSource, { recursive: true });
  const container = {
    ...proof.container,
    Mounts: proof.destinations.map((target) => ({
      Type: 'volume',
      Source: opaque ? '/var/lib/docker/volumes/backend-audit/_data' : hostSource,
      Destination: target,
      RW: !readonly,
    })),
  };
  await auditUnmanagedMounts(
    [container],
    { blue: null, green: null },
    {
      path: '/data/wbs.db',
      host: proof.database,
      directoryIdentity: `${String(directory.dev)}:${String(directory.ino)}`,
      fileIdentity: `${String(file.dev)}:${String(file.ino)}`,
    },
    image,
    proof.runDocker,
    performance.now() + totalMs,
    (subject, destinations, database, candidate, runDocker, databasePath, bounds) =>
      verifyContainerNamespace(
        subject,
        destinations,
        database,
        candidate,
        runDocker,
        databasePath,
        bounds,
        proof.exec,
      ),
    opaque
      ? () =>
          Promise.reject(Object.assign(new Error('host source inaccessible'), { code: sourceCode }))
      : undefined,
  );
}

test('backend fence audits an opaque unrelated volume using complete actual namespace receipts', async () => {
  const proof = await fixture();
  try {
    await auditBackendParticipant(proof, true);
    expect(proof.counters()).toEqual({ sessions: 4, acknowledgements: 4 });
    expect(
      proof.commands.some((args) => ['stop', 'restart', 'rm', 'create', 'run'].includes(args[0])),
    ).toBe(false);
  } finally {
    await rm(proof.root, { recursive: true, force: true });
  }
});

for (const fault of [
  'hardlink:',
  'hardlink:-wal',
  'hardlink:-shm',
  'hardlink:-journal',
  'nested-rw',
  'all-ro-nested',
  'replaced-source',
  'hidden-root',
  'symlink',
  'mountinfo-race',
  'declared-mount-missing',
  'root-mount-missing',
  'pid-race',
  'inspection-unreadable',
  'tool-absent',
  'mountinfo-malformed',
  'incomplete',
  'reap-absent',
  'group-residue',
  'privileged-target',
  'expanded-capability',
  'missing-init',
  'private-pid-missing',
  'stalled-start',
] as const) {
  test(`backend fence namespace adapter refuses ${fault}`, async () => {
    const proof = await fixture(fault);
    try {
      await refuses(
        auditBackendParticipant(
          proof,
          fault !== 'replaced-source',
          ['nested-rw', 'all-ro-nested'].includes(fault),
          fault === 'stalled-start' ? 300 : 3000,
        ),
      );
      expect(
        proof.commands.some((args) => ['stop', 'restart', 'rm', 'create', 'run'].includes(args[0])),
      ).toBe(false);
    } finally {
      await rm(proof.root, { recursive: true, force: true });
    }
  });
}

test('backend fence audits a host-readable unrelated volume using complete actual namespace receipts', async () => {
  const proof = await fixture();
  try {
    await auditBackendParticipant(proof, false);
    expect(proof.counters()).toEqual({ sessions: 4, acknowledgements: 4 });
  } finally {
    await rm(proof.root, { recursive: true, force: true });
  }
});
for (const fault of ['start-race', 'restart-race', 'foreign-id'] as const) {
  test(`backend fence namespace adapter refuses ${fault}`, async () => {
    const proof = await fixture();
    const original = proof.runDocker;
    proof.runDocker = (args: string[]) => {
      if (args[0] === 'inspect' && proof.counters().sessions > 0) {
        const changed = structuredClone(proof.container);
        if (fault === 'start-race') changed.State.StartedAt = 'changed';
        if (fault === 'restart-race') changed.RestartCount = 1;
        if (fault === 'foreign-id') changed.Id = 'f'.repeat(64);
        return Promise.resolve(JSON.stringify(changed));
      }
      return original(args);
    };
    try {
      await refuses(auditBackendParticipant(proof, true));
    } finally {
      await rm(proof.root, { recursive: true, force: true });
    }
  });
}

test('backend fence treats host Source ENOENT as unknown until actual namespace admission', async () => {
  const proof = await fixture();
  try {
    await auditBackendParticipant(proof, true, false, 3000, 'ENOENT');
    expect(proof.counters()).toEqual({ sessions: 4, acknowledgements: 4 });
  } finally {
    await rm(proof.root, { recursive: true, force: true });
  }
});

test('backend fence namespace refusal names the exact unsupported participant and attended path', async () => {
  const proof = await fixture('missing-init');
  try {
    await refuses(
      auditBackendParticipant(proof, true),
      `container ${proof.container.Id}; attended maintenance or a dedicated daemon required`,
    );
  } finally {
    await rm(proof.root, { recursive: true, force: true });
  }
});

for (const boundary of ['before-census', 'after-census'] as const) {
  test(`managed namespace keeps captured host identity ${boundary}`, async () => {
    const proof = await fixture('managed-match');
    const file = await stat(proof.database);
    const directory = await stat(join(proof.root, 'family'));
    const database = {
      path: '/data/wbs.db',
      host: proof.database,
      fileIdentity: `${String(file.dev)}:${String(file.ino)}`,
      directoryIdentity: `${String(directory.dev)}:${String(directory.ino)}`,
    };
    const container = {
      ...proof.container,
      Mounts: proof.destinations.map((target) => ({
        Type: 'bind',
        Source: join(proof.root, 'family'),
        Destination: target,
        RW: true,
      })),
    };
    const replace = async () => {
      await rename(proof.database, proof.database + '.retained');
      await Bun.write(proof.database, 'replacement');
    };
    try {
      if (boundary === 'before-census') {
        await replace();
        await unlink(`${proof.root}/namespace/data/wbs.db`);
        await link(proof.database, `${proof.root}/namespace/data/wbs.db`);
      }
      await refuses(
        auditManagedMounts(
          container,
          database,
          image,
          proof.runDocker,
          performance.now() + 3000,
          async (subject, destinations, host, candidate, runDocker, path, bounds) => {
            await verifyContainerNamespace(
              subject,
              destinations,
              host,
              candidate,
              runDocker,
              path,
              bounds,
              proof.exec,
            );
            if (boundary === 'after-census') await replace();
          },
        ),
        'captured database family identity',
      );
      if (boundary === 'before-census') expect(proof.counters().sessions).toBe(0);
      else expect(proof.counters().acknowledgements).toBe(4);
    } finally {
      await rm(proof.root, { recursive: true, force: true });
    }
  });
}

for (const fault of [
  'managed-directory-mismatch',
  'managed-directory-entry-missing',
  'host-directory-race',
]) {
  test(`managed actual namespace rejects ${fault} despite identical SQLite file inodes`, async () => {
    const proof = await fixture(fault);
    try {
      await refuses(
        verifyContainerNamespace(
          proof.container,
          proof.destinations,
          proof.database,
          image,
          proof.runDocker,
          '/data/wbs.db',
          undefined,
          proof.exec,
        ),
        fault === 'host-directory-race'
          ? 'directory changed'
          : fault === 'managed-directory-mismatch'
            ? 'directory differs'
            : 'incomplete',
      );
    } finally {
      await rm(proof.root, { recursive: true, force: true });
    }
  });
}
