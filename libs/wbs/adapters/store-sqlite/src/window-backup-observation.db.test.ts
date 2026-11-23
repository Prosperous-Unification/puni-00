import * as filesystem from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, spyOn, test } from 'bun:test';

import * as connections from './db';
import { runMigrations } from './migrate';
import * as migrationSet from './migration-set';
import { copyRecoveryPrefix } from './testing/recovery-state';
import { assertWindowBackup, createWindowBackup, readWindowBackupFailure } from './window-backup';

const MIGRATIONS = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) filesystem.rmSync(root, { recursive: true, force: true });
});
function fixture(report = false, sourceName = 'source.db') {
  const root = filesystem.mkdtempSync(
    join(process.env['WINDOW_OBSERVATION_PARENT'] ?? tmpdir(), 'window-observation-'),
  );
  roots.push(root);
  const sourcePath = join(root, sourceName);
  runMigrations(sourcePath, copyRecoveryPrefix(root, '20261115120000_add_step_migration_report'));
  const database = connections.openDatabase(sourcePath);
  try {
    database.run('CREATE TABLE observation_marker (value TEXT NOT NULL)');
  } finally {
    database.close();
  }
  const request = {
    sourcePath,
    snapshotPath: join(root, 'snapshot.db'),
    reportPath: join(root, 'report.json'),
    migrationsFolder: MIGRATIONS,
  };
  if (report) createWindowBackup(request);
  return request;
}
function captureFailure(operation: () => unknown): unknown {
  try {
    operation();
    return null;
  } catch (cause) {
    return cause;
  }
}

for (const alteration of ['pathname', 'descriptor'] as const) {
  test(
    'refuses ' +
      (alteration === 'pathname' ? 'pathname replacement' : 'descriptor content change') +
      ' during actual source hashing before SQLite acquisition',
    () => {
      const request = fixture();
      const before = filesystem.readFileSync(request.sourcePath);
      const open = filesystem.openSync;
      const read = filesystem.readSync;
      let descriptor: number | undefined;
      let intercepted = 0;
      let owners = 0;
      const opening = spyOn(filesystem, 'openSync').mockImplementation(
        (...args: Parameters<typeof open>) => {
          const acquired = open(...args);
          if (String(args[0]) === request.sourcePath && descriptor === undefined)
            descriptor = acquired;
          return acquired;
        },
      );
      const reading = spyOn(filesystem, 'readSync').mockImplementation(
        // Retains both native overloads while forwarding the complete actual argument tuple.
        ((...args: Parameters<typeof read>) => {
          const count = read(...args);
          if (args[0] === descriptor && intercepted === 0) {
            intercepted += 1;
            if (alteration === 'pathname') {
              const held = request.sourcePath + '.held';
              filesystem.renameSync(request.sourcePath, held);
              filesystem.copyFileSync(held, request.sourcePath);
            } else filesystem.appendFileSync(request.sourcePath, Buffer.from([0]));
          }
          return count;
        }) as typeof read,
      );
      const acquire = connections.openExistingConnection;
      const acquiring = spyOn(connections, 'openExistingConnection').mockImplementation((path) => {
        owners += 1;
        return acquire(path);
      });
      try {
        const failure = captureFailure(() => createWindowBackup(request));
        expect(intercepted).toBe(1);
        expect(String(failure)).toContain('sourcePath changed while reading');
        expect(owners).toBe(0);
        expect(filesystem.existsSync(request.snapshotPath)).toBe(false);
        expect(filesystem.existsSync(request.reportPath)).toBe(false);
        if (alteration === 'pathname')
          expect(filesystem.readFileSync(request.sourcePath)).toEqual(before);
      } finally {
        opening.mockRestore();
        reading.mockRestore();
        acquiring.mockRestore();
      }
    },
  );
}

test('refuses premature source EOF and closes its actual descriptor once', () => {
  const request = fixture();
  const open = filesystem.openSync;
  const read = filesystem.readSync;
  const close = filesystem.closeSync;
  let descriptor: number | undefined;
  let intercepted = 0;
  let closes = 0;
  const opening = spyOn(filesystem, 'openSync').mockImplementation(
    (...args: Parameters<typeof open>) => {
      const acquired = open(...args);
      if (String(args[0]) === request.sourcePath && descriptor === undefined) descriptor = acquired;
      return acquired;
    },
  );
  const reading = spyOn(filesystem, 'readSync').mockImplementation(
    // Retains both native overloads while forwarding the complete actual argument tuple.
    ((...args: Parameters<typeof read>) => {
      if (args[0] === descriptor) {
        intercepted += 1;
        return 0;
      }
      return read(...args);
    }) as typeof read,
  );
  const releasing = spyOn(filesystem, 'closeSync').mockImplementation((acquired) => {
    close(acquired);
    if (acquired === descriptor) closes += 1;
  });
  try {
    const failure = captureFailure(() => createWindowBackup(request));
    expect(intercepted).toBe(1);
    expect(closes).toBe(1);
    expect(String(failure)).toContain('sourcePath truncated while reading');
    expect(filesystem.existsSync(request.snapshotPath)).toBe(false);
    expect(filesystem.existsSync(request.reportPath)).toBe(false);
  } finally {
    opening.mockRestore();
    reading.mockRestore();
    releasing.mockRestore();
  }
});

test('preserves actual source read and descriptor close failures before checkpoint', () => {
  const request = fixture();
  const open = filesystem.openSync;
  const read = filesystem.readSync;
  const close = filesystem.closeSync;
  const primary = new Error('source descriptor read fault');
  const closing = new Error('source descriptor close fault');
  let descriptor: number | undefined;
  let reads = 0;
  let closes = 0;
  const opening = spyOn(filesystem, 'openSync').mockImplementation(
    (...args: Parameters<typeof open>) => {
      const acquired = open(...args);
      if (String(args[0]) === request.sourcePath && descriptor === undefined) descriptor = acquired;
      return acquired;
    },
  );
  const reading = spyOn(filesystem, 'readSync').mockImplementation(
    // Retains both native overloads while forwarding the complete actual argument tuple.
    ((...args: Parameters<typeof read>) => {
      if (args[0] === descriptor) {
        reads += 1;
        throw primary;
      }
      return read(...args);
    }) as typeof read,
  );
  const releasing = spyOn(filesystem, 'closeSync').mockImplementation((acquired) => {
    close(acquired);
    if (acquired === descriptor) {
      closes += 1;
      throw closing;
    }
  });
  try {
    const failure = captureFailure(() => createWindowBackup(request));
    expect(reads).toBe(1);
    expect(closes).toBe(1);
    expect(failure).toBeInstanceOf(AggregateError);
    if (!(failure instanceof AggregateError))
      throw new Error('source operation/close pair missing');
    expect(failure.errors).toEqual([primary, closing]);
    expect(failure.cause).toBe(primary);
    expect(readWindowBackupFailure(failure)?.stages).toEqual([]);
    expect(filesystem.existsSync(request.snapshotPath)).toBe(false);
  } finally {
    opening.mockRestore();
    reading.mockRestore();
    releasing.mockRestore();
  }
});

test('refuses report pathname replacement after actual JSON reading before SQLite acquisition', () => {
  const request = fixture(true);
  const sourceBefore = filesystem.readFileSync(request.sourcePath);
  const read = filesystem.readFileSync;
  let intercepted = 0;
  let owners = 0;
  const reading = spyOn(filesystem, 'readFileSync').mockImplementation(((
    ...args: Parameters<typeof read>
  ) => {
    const bytes = read(...args);
    if (typeof args[0] === 'number' && intercepted === 0) {
      intercepted += 1;
      const held = request.reportPath + '.held';
      filesystem.renameSync(request.reportPath, held);
      filesystem.copyFileSync(held, request.reportPath);
    }
    return bytes;
  }) as typeof read);
  const acquire = connections.openWindowSourceDatabase;
  const acquiring = spyOn(connections, 'openWindowSourceDatabase').mockImplementation((path) => {
    owners += 1;
    return acquire(path);
  });
  try {
    const failure = captureFailure(() => assertWindowBackup(request));
    expect(intercepted).toBe(1);
    expect(String(failure)).toContain('reportPath changed while reading');
    expect(owners).toBe(0);
    expect(filesystem.readFileSync(request.sourcePath)).toEqual(sourceBefore);
  } finally {
    reading.mockRestore();
    acquiring.mockRestore();
  }
});

test('preserves report JSON read and descriptor close failures without opening SQLite', () => {
  const request = fixture(true);
  const open = filesystem.openSync;
  const read = filesystem.readFileSync;
  const close = filesystem.closeSync;
  const primary = new Error('report descriptor read fault');
  const closing = new Error('report descriptor close fault');
  let descriptor: number | undefined;
  let reads = 0;
  let closes = 0;
  const opening = spyOn(filesystem, 'openSync').mockImplementation(
    (...args: Parameters<typeof open>) => {
      const acquired = open(...args);
      if (String(args[0]) === request.reportPath && descriptor === undefined) descriptor = acquired;
      return acquired;
    },
  );
  const reading = spyOn(filesystem, 'readFileSync').mockImplementation(((
    ...args: Parameters<typeof read>
  ) => {
    if (args[0] === descriptor) {
      reads += 1;
      throw primary;
    }
    return read(...args);
  }) as typeof read);
  const releasing = spyOn(filesystem, 'closeSync').mockImplementation((acquired) => {
    close(acquired);
    if (acquired === descriptor) {
      closes += 1;
      throw closing;
    }
  });
  try {
    const failure = captureFailure(() => assertWindowBackup(request));
    expect(reads).toBe(1);
    expect(closes).toBe(1);
    expect(failure).toBeInstanceOf(AggregateError);
    if (!(failure instanceof AggregateError))
      throw new Error('report operation/close pair missing');
    expect(failure.errors[1]).toBe(closing);
    expect(failure.errors[0]).toBeInstanceOf(Error);
    const contextual: unknown = failure.errors[0];
    if (!(contextual instanceof Error)) throw new Error('contextual report failure missing');
    expect(contextual.cause).toBe(primary);
  } finally {
    opening.mockRestore();
    reading.mockRestore();
    releasing.mockRestore();
  }
});

for (const field of ['source', 'snapshot'] as const) {
  test('refuses late ' + field + ' mutation during actual verifier ledger observation', () => {
    const request = fixture(true);
    const sourceBefore = filesystem.readFileSync(request.sourcePath);
    const reportBefore = filesystem.readFileSync(request.reportPath);
    const target = field === 'source' ? request.sourcePath : request.snapshotPath;
    const beforeBytes = filesystem.statSync(target).size;
    const read = migrationSet.readAppliedMigrationIdentities;
    let observations = 0;
    let mutations = 0;
    const reading = spyOn(migrationSet, 'readAppliedMigrationIdentities').mockImplementation(
      (database, candidate) => {
        const identities = read(database, candidate);
        observations += 1;
        if (observations === (field === 'source' ? 1 : 2)) {
          const writer = connections.openDatabase(
            field === 'source' ? request.sourcePath : request.snapshotPath,
          );
          try {
            writer
              .query('INSERT INTO observation_marker VALUES (zeroblob(?))')
              .run(beforeBytes + 4096);
            writer.run('PRAGMA wal_checkpoint(TRUNCATE)');
            mutations += 1;
          } finally {
            writer.close();
          }
        }
        return identities;
      },
    );
    try {
      const failure = captureFailure(() => assertWindowBackup(request));
      expect(mutations).toBe(1);
      expect(filesystem.statSync(target).size).toBeGreaterThan(beforeBytes);
      expect(String(failure)).toContain(field + 'Sha256 changed during verification');
      expect(filesystem.readFileSync(request.reportPath)).toEqual(reportBefore);
      if (field === 'snapshot')
        expect(filesystem.readFileSync(request.sourcePath)).toEqual(sourceBefore);
    } finally {
      reading.mockRestore();
    }
  });
}

for (const field of ['source', 'snapshot'] as const) {
  test(
    'refuses final ' + field + ' sidecar evidence created after actual verifier digest close',
    () => {
      const request = fixture(true);
      const target = field === 'source' ? request.sourcePath : request.snapshotPath;
      const before = filesystem.readFileSync(target);
      const reportBefore = filesystem.readFileSync(request.reportPath);
      const open = filesystem.openSync;
      const close = filesystem.closeSync;
      let opens = 0;
      let descriptor: number | undefined;
      let introduced = 0;
      const opening = spyOn(filesystem, 'openSync').mockImplementation(
        (...args: Parameters<typeof open>) => {
          const acquired = open(...args);
          if (String(args[0]) === target) {
            opens += 1;
            if (opens === 2) descriptor = acquired;
          }
          return acquired;
        },
      );
      const releasing = spyOn(filesystem, 'closeSync').mockImplementation((acquired) => {
        close(acquired);
        if (acquired === descriptor && introduced === 0) {
          introduced += 1;
          filesystem.writeFileSync(target + '-wal', 'late physical WAL evidence');
        }
      });
      try {
        const failure = captureFailure(() => assertWindowBackup(request));
        expect(introduced).toBe(1);
        expect(String(failure)).toContain(field + ' -wal must be absent or empty');
        expect(filesystem.readFileSync(target)).toEqual(before);
        expect(filesystem.readFileSync(target + '-wal', 'utf8')).toBe('late physical WAL evidence');
        expect(filesystem.readFileSync(request.reportPath)).toEqual(reportBefore);
      } finally {
        opening.mockRestore();
        releasing.mockRestore();
      }
    },
  );
}

for (const phase of ['sync', 'close'] as const) {
  test('retains snapshot after its actual publication parent ' + phase + ' fails', () => {
    const request = fixture();
    const link = filesystem.linkSync;
    const sync = filesystem.fsyncSync;
    const close = filesystem.closeSync;
    const primary = new Error('snapshot parent ' + phase + ' fault');
    let linked = false;
    let parent: number | undefined;
    let intercepted = 0;
    let closes = 0;
    const linking = spyOn(filesystem, 'linkSync').mockImplementation((source, target) => {
      link(source, target);
      if (String(target) === request.snapshotPath) linked = true;
    });
    const syncing = spyOn(filesystem, 'fsyncSync').mockImplementation((descriptor) => {
      if (linked && filesystem.fstatSync(descriptor).isDirectory()) {
        parent = descriptor;
        if (phase === 'sync') {
          intercepted += 1;
          throw primary;
        }
      }
      sync(descriptor);
    });
    const releasing = spyOn(filesystem, 'closeSync').mockImplementation((descriptor) => {
      close(descriptor);
      if (descriptor === parent) {
        closes += 1;
        if (phase === 'close') {
          intercepted += 1;
          throw primary;
        }
      }
    });
    try {
      const failure = captureFailure(() => createWindowBackup(request));
      expect(linked).toBe(true);
      expect(intercepted).toBe(1);
      expect(closes).toBe(1);
      expect(failure).toBe(primary);
      const context = readWindowBackupFailure(failure);
      expect(context?.snapshotPublication).toBe('unknown');
      expect(context?.reportPublication).toBe('not_published');
      expect(context?.stages).toHaveLength(1);
      expect(filesystem.existsSync(request.snapshotPath)).toBe(true);
      expect(filesystem.existsSync(request.reportPath)).toBe(false);
      const stage = context?.stages[0]?.path;
      if (stage === undefined || stage === null)
        throw new Error('actual retained snapshot stage missing');
      expect(filesystem.statSync(join(stage, 'snapshot.db')).ino).toBe(
        filesystem.statSync(request.snapshotPath).ino,
      );
    } finally {
      linking.mockRestore();
      syncing.mockRestore();
      releasing.mockRestore();
    }
  });
}

test('refuses empty source bytes before a checkpoint can initialize the file', () => {
  const request = fixture();
  filesystem.writeFileSync(request.sourcePath, '');
  const acquire = connections.openExistingConnection;
  let owners = 0;
  const acquiring = spyOn(connections, 'openExistingConnection').mockImplementation((path) => {
    owners += 1;
    return acquire(path);
  });
  try {
    const failure = captureFailure(() => createWindowBackup(request));
    expect(filesystem.readFileSync(request.sourcePath)).toHaveLength(0);
    expect(owners).toBe(0);
    expect(String(failure)).toContain('sourcePath has invalid bytes');
    expect(filesystem.existsSync(request.snapshotPath)).toBe(false);
  } finally {
    acquiring.mockRestore();
  }
});

test('refuses source permission removal after native acquisition before reading its descriptor', () => {
  const request = fixture();
  const open = filesystem.openSync;
  const read = filesystem.readSync;
  let descriptor: number | undefined;
  let reads = 0;
  const opening = spyOn(filesystem, 'openSync').mockImplementation(
    (...args: Parameters<typeof open>) => {
      const acquired = open(...args);
      if (String(args[0]) === request.sourcePath && descriptor === undefined) {
        descriptor = acquired;
        filesystem.chmodSync(request.sourcePath, 0);
      }
      return acquired;
    },
  );
  const reading = spyOn(filesystem, 'readSync').mockImplementation(((
    ...args: Parameters<typeof read>
  ) => {
    if (args[0] === descriptor) reads += 1;
    return read(...args);
  }) as typeof read);
  try {
    const failure = captureFailure(() => createWindowBackup(request));
    expect(descriptor).toBeDefined();
    expect(reads).toBe(0);
    expect(String(failure)).toContain('sourcePath is not a readable regular file');
    expect(filesystem.existsSync(request.snapshotPath)).toBe(false);
  } finally {
    opening.mockRestore();
    reading.mockRestore();
    filesystem.chmodSync(request.sourcePath, 0o600);
  }
});

test('refuses unsafe trusted descriptor byte metadata before reading or acquiring SQLite', () => {
  const request = fixture();
  const open = filesystem.openSync;
  const inspect = filesystem.fstatSync;
  const read = filesystem.readSync;
  let descriptor: number | undefined;
  let inspections = 0;
  let reads = 0;
  const opening = spyOn(filesystem, 'openSync').mockImplementation(
    (...args: Parameters<typeof open>) => {
      const acquired = open(...args);
      if (String(args[0]) === request.sourcePath && descriptor === undefined) descriptor = acquired;
      return acquired;
    },
  );
  const inspecting = spyOn(filesystem, 'fstatSync').mockImplementation(((
    ...args: Parameters<typeof inspect>
  ) => {
    const identity = inspect(...args);
    if (args[0] === descriptor && 'bigint' in (args[1] ?? {}) && args[1]?.bigint) {
      inspections += 1;
      Object.assign(identity, { size: BigInt(Number.MAX_SAFE_INTEGER) + 1n });
    }
    return identity;
  }) as typeof inspect);
  const reading = spyOn(filesystem, 'readSync').mockImplementation(((
    ...args: Parameters<typeof read>
  ) => {
    if (args[0] === descriptor) reads += 1;
    return read(...args);
  }) as typeof read);
  try {
    const failure = captureFailure(() => createWindowBackup(request));
    expect(inspections).toBe(1);
    expect(reads).toBe(0);
    expect(String(failure)).toContain('sourcePath has invalid bytes');
    expect(filesystem.existsSync(request.snapshotPath)).toBe(false);
  } finally {
    opening.mockRestore();
    inspecting.mockRestore();
    reading.mockRestore();
  }
});

test('refuses missing required ledger before allocating a retained snapshot stage', () => {
  const request = fixture();
  const database = connections.openDatabase(request.sourcePath);
  try {
    database.run('DROP TABLE __drizzle_migrations');
  } finally {
    database.close();
  }
  const failure = captureFailure(() => createWindowBackup(request));
  expect(readWindowBackupFailure(failure)?.stages).toEqual([]);
  expect(String(failure)).toContain('migrations ledger is absent or empty');
  expect(filesystem.existsSync(request.snapshotPath)).toBe(false);
});

test('refuses actual snapshot mutation after publication before writing a report', () => {
  const request = fixture();
  const sourceBefore = filesystem.readFileSync(request.sourcePath);
  const link = filesystem.linkSync;
  let mutations = 0;
  const linking = spyOn(filesystem, 'linkSync').mockImplementation((source, target) => {
    link(source, target);
    if (String(target) === request.snapshotPath) {
      const writer = connections.openDatabase(request.snapshotPath);
      try {
        writer.run("INSERT INTO observation_marker VALUES ('published snapshot mutation')");
        mutations += 1;
      } finally {
        writer.close();
      }
    }
  });
  try {
    const failure = captureFailure(() => createWindowBackup(request));
    expect(mutations).toBe(1);
    expect(String(failure)).toContain(
      'snapshotSha256 or snapshotBytes changed while producing report',
    );
    expect(filesystem.readFileSync(request.sourcePath)).toEqual(sourceBefore);
    expect(filesystem.existsSync(request.reportPath)).toBe(false);
  } finally {
    linking.mockRestore();
  }
});

async function expectBoundedWindowRefusal(file: URL, testName: string): Promise<void> {
  const parent = filesystem.mkdtempSync(join(tmpdir(), 'window-observation-child-'));
  roots.push(parent);
  const reportPath = join(parent, 'junit.xml');
  const child = Bun.spawn(
    [
      process.execPath,
      'test',
      file.pathname,
      '--test-name-pattern',
      '^' + testName + '$',
      '--reporter=junit',
      '--reporter-outfile=' + reportPath,
    ],
    {
      env: { ...process.env, TMPDIR: parent, WINDOW_OBSERVATION_PARENT: parent },
      stdout: 'pipe',
      stderr: 'pipe',
      // The child needs time to load Bun and its modules before the measured test begins.
      signal: AbortSignal.timeout(10_000),
      killSignal: 'SIGKILL',
    },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(exitCode, stdout + stderr).toBe(0);
  expect(child.signalCode).toBeNull();
  const report = await Bun.file(reportPath).text();
  // Bun writes executed successes as self-closing cases and gives skipped cases a child element.
  const passed = report.match(/<testcase\b[^>]*\/>/gu) ?? [];
  expect(passed).toHaveLength(1);
  const [selected] = passed;
  if (selected === undefined) throw new Error('native child test outcome is absent');
  expect(selected).toContain('name="' + testName + '"');
  expect(Number(/\bassertions="(\d+)"/u.exec(selected)?.[1])).toBeGreaterThan(0);
  // Proof: delaying the real checkpoint child by 3.7 seconds reached this assertion at 4.31 seconds.
  expect(Number(/\btime="([\d.]+)"/u.exec(selected)?.[1])).toBeLessThanOrEqual(3.5);
}

test('completes the real premature EOF refusal inside a bounded child', async () => {
  await expectBoundedWindowRefusal(
    new URL('./window-backup-observation.db.test.ts', import.meta.url),
    'refuses premature source EOF and closes its actual descriptor once',
  );
}, 12_000);

for (const field of ['source', 'report'] as const) {
  test(
    'propagates successful ' +
      field +
      ' read close failure exactly once before further observation',
    () => {
      const request = fixture(field === 'report');
      const target = field === 'source' ? request.sourcePath : request.reportPath;
      const open = filesystem.openSync;
      const close = filesystem.closeSync;
      const primary = new Error(field + ' successful-read close fault');
      let descriptor: number | undefined;
      let closes = 0;
      const opening = spyOn(filesystem, 'openSync').mockImplementation(
        (...args: Parameters<typeof open>) => {
          const acquired = open(...args);
          if (String(args[0]) === target && descriptor === undefined) descriptor = acquired;
          return acquired;
        },
      );
      const releasing = spyOn(filesystem, 'closeSync').mockImplementation((acquired) => {
        close(acquired);
        if (acquired === descriptor && closes === 0) {
          closes += 1;
          throw primary;
        }
      });
      try {
        const failure = captureFailure(() =>
          field === 'source' ? createWindowBackup(request) : assertWindowBackup(request),
        );
        expect(descriptor).toBeDefined();
        expect(closes).toBe(1);
        expect(failure).toBe(primary);
        if (field === 'source') {
          expect(filesystem.existsSync(request.snapshotPath)).toBe(false);
          expect(readWindowBackupFailure(failure)?.stages).toEqual([]);
        }
      } finally {
        opening.mockRestore();
        releasing.mockRestore();
      }
    },
  );
}

test('propagates successful ledger close failure before creating a snapshot stage', () => {
  const request = fixture();
  const acquire = connections.openWindowSourceDatabase;
  const primary = new Error('successful ledger close fault');
  let closes = 0;
  const releases: (() => void)[] = [];
  const acquiring = spyOn(connections, 'openWindowSourceDatabase').mockImplementation((path) => {
    const database = acquire(path);
    const close = database.close.bind(database);
    const releasing = spyOn(database, 'close').mockImplementation(() => {
      closes += 1;
      close();
      throw primary;
    });
    releases.push(() => {
      releasing.mockRestore();
    });
    return database;
  });
  try {
    const failure = captureFailure(() => createWindowBackup(request));
    expect(closes).toBe(1);
    expect(failure).toBe(primary);
    expect(readWindowBackupFailure(failure)?.stages).toEqual([]);
    expect(filesystem.existsSync(request.snapshotPath)).toBe(false);
  } finally {
    acquiring.mockRestore();
    for (const release of releases) release();
  }
});

test('refuses an existing snapshot before acquiring any staging directory', () => {
  const request = fixture();
  filesystem.writeFileSync(request.snapshotPath, 'operator snapshot evidence');
  const before = filesystem.readFileSync(request.sourcePath);
  const failure = captureFailure(() => createWindowBackup(request));
  expect(
    filesystem
      .readdirSync(join(request.sourcePath, '..'))
      .filter((name) => name.startsWith('.window-')),
  ).toEqual([]);
  expect(String(failure)).toContain('snapshotPath already exists');
  expect(filesystem.readFileSync(request.snapshotPath, 'utf8')).toBe('operator snapshot evidence');
  expect(filesystem.readFileSync(request.sourcePath)).toEqual(before);
  expect(filesystem.existsSync(request.reportPath)).toBe(false);
});

test('completes the actual blocking reader checkpoint refusal inside a bounded child', async () => {
  await expectBoundedWindowRefusal(
    new URL('./window-backup.db.test.ts', import.meta.url),
    'refuses a genuine reader-blocked checkpoint without publishing either artifact',
  );
}, 12_000);

test('opens the exact immutable source whose native filename contains URI delimiters', () => {
  const request = fixture(false, 'source #?% mode=rw.db');
  const before = filesystem.readFileSync(request.sourcePath);
  const database = connections.openWindowSourceDatabase(request.sourcePath);
  try {
    expect(database.query('SELECT COUNT(*) FROM observation_marker').get()).not.toBeNull();
    expect(() => database.run('DELETE FROM __drizzle_migrations')).toThrow(/readonly/);
  } finally {
    database.close();
  }
  expect(filesystem.readFileSync(request.sourcePath)).toEqual(before);
  expect(filesystem.existsSync(request.sourcePath + '-wal')).toBe(false);
  expect(filesystem.existsSync(request.sourcePath + '-shm')).toBe(false);
});

for (const [operation, field] of [
  ['producer', 'source'],
  ['verifier', 'source'],
  ['verifier', 'snapshot'],
] as const) {
  test(
    'refuses ' + operation + ' ' + field + ' WAL before entering its actual ledger owner',
    () => {
      const request = fixture(operation === 'verifier');
      const target = field === 'source' ? request.sourcePath : request.snapshotPath;
      const before = filesystem.readFileSync(target);
      const open = filesystem.openSync;
      const close = filesystem.closeSync;
      const sourceAcquire = connections.openWindowSourceDatabase;
      const snapshotAcquire = connections.openReadOnlyDatabase;
      let opens = 0;
      let descriptor: number | undefined;
      let introduced = 0;
      let owners = 0;
      const opening = spyOn(filesystem, 'openSync').mockImplementation(
        (...args: Parameters<typeof open>) => {
          const acquired = open(...args);
          if (String(args[0]) === target) {
            opens += 1;
            if (opens === (operation === 'producer' ? 2 : 1)) descriptor = acquired;
          }
          return acquired;
        },
      );
      const releasing = spyOn(filesystem, 'closeSync').mockImplementation((acquired) => {
        close(acquired);
        if (acquired === descriptor && introduced === 0) {
          introduced += 1;
          filesystem.writeFileSync(target + '-wal', 'physical pre-owner WAL evidence');
        }
      });
      const sourceOwner = spyOn(connections, 'openWindowSourceDatabase').mockImplementation(
        (path) => {
          if (path === target) owners += 1;
          return sourceAcquire(path);
        },
      );
      const snapshotOwner = spyOn(connections, 'openReadOnlyDatabase').mockImplementation(
        (path) => {
          if (path === target) owners += 1;
          return snapshotAcquire(path);
        },
      );
      try {
        const failure = captureFailure(() =>
          operation === 'producer' ? createWindowBackup(request) : assertWindowBackup(request),
        );
        expect(introduced).toBe(1);
        expect(owners).toBe(0);
        expect(String(failure)).toContain(field + ' -wal must be absent or empty');
        expect(filesystem.readFileSync(target)).toEqual(before);
        expect(filesystem.readFileSync(target + '-wal', 'utf8')).toBe(
          'physical pre-owner WAL evidence',
        );
      } finally {
        opening.mockRestore();
        releasing.mockRestore();
        sourceOwner.mockRestore();
        snapshotOwner.mockRestore();
      }
    },
  );
}

test('refuses producer snapshot WAL after ledger close before opening its hash descriptor', () => {
  const request = fixture();
  const read = migrationSet.readAppliedMigrationIdentities;
  const open = filesystem.openSync;
  let observations = 0;
  let introduced = 0;
  let hashes = 0;
  const reading = spyOn(migrationSet, 'readAppliedMigrationIdentities').mockImplementation(
    (database, candidate) => {
      const identities = read(database, candidate);
      observations += 1;
      if (observations === 3) {
        introduced += 1;
        filesystem.writeFileSync(request.snapshotPath + '-wal', 'physical post-owner WAL evidence');
      }
      return identities;
    },
  );
  const opening = spyOn(filesystem, 'openSync').mockImplementation(
    (...args: Parameters<typeof open>) => {
      if (String(args[0]) === request.snapshotPath) hashes += 1;
      return open(...args);
    },
  );
  try {
    const failure = captureFailure(() => createWindowBackup(request));
    expect(introduced).toBe(1);
    expect(hashes).toBe(0);
    expect(String(failure)).toContain('snapshot -wal must be absent or empty');
    expect(filesystem.readFileSync(request.snapshotPath + '-wal', 'utf8')).toBe(
      'physical post-owner WAL evidence',
    );
    expect(filesystem.existsSync(request.reportPath)).toBe(false);
  } finally {
    reading.mockRestore();
    opening.mockRestore();
  }
});

for (const field of ['source', 'snapshot'] as const) {
  test('refuses final producer ' + field + ' WAL after its actual digest closes', () => {
    const request = fixture();
    const target = field === 'source' ? request.sourcePath : request.snapshotPath;
    const sourceBefore = filesystem.readFileSync(request.sourcePath);
    const open = filesystem.openSync;
    const close = filesystem.closeSync;
    const link = filesystem.linkSync;
    let opens = 0;
    let descriptor: number | undefined;
    let introduced = 0;
    let snapshotBefore: Buffer | undefined;
    const linking = spyOn(filesystem, 'linkSync').mockImplementation((source, target) => {
      link(source, target);
      if (String(target) === request.snapshotPath)
        snapshotBefore = filesystem.readFileSync(request.snapshotPath);
    });
    const opening = spyOn(filesystem, 'openSync').mockImplementation(
      (...args: Parameters<typeof open>) => {
        const acquired = open(...args);
        if (String(args[0]) === target) {
          opens += 1;
          if (opens === (field === 'source' ? 3 : 1)) descriptor = acquired;
        }
        return acquired;
      },
    );
    const releasing = spyOn(filesystem, 'closeSync').mockImplementation((acquired) => {
      close(acquired);
      if (acquired === descriptor && introduced === 0) {
        introduced += 1;
        filesystem.writeFileSync(target + '-wal', 'physical final producer WAL evidence');
      }
    });
    try {
      const failure = captureFailure(() => createWindowBackup(request));
      expect(introduced).toBe(1);
      expect(String(failure)).toContain(field + ' -wal must be absent or empty');
      expect(filesystem.readFileSync(request.sourcePath)).toEqual(sourceBefore);
      expect(filesystem.readFileSync(target + '-wal', 'utf8')).toBe(
        'physical final producer WAL evidence',
      );
      if (snapshotBefore === undefined) throw new Error('actual published snapshot not reached');
      expect(filesystem.readFileSync(request.snapshotPath).equals(snapshotBefore)).toBe(true);
      expect(filesystem.existsSync(request.reportPath)).toBe(false);
    } finally {
      linking.mockRestore();
      opening.mockRestore();
      releasing.mockRestore();
    }
  });
}

for (const field of ['sourceSha256', 'sourceBytes', 'snapshotSha256', 'snapshotBytes'] as const) {
  test('refuses initial ' + field + ' mismatch before opening either ledger owner', () => {
    const request = fixture(true);
    const report = JSON.parse(filesystem.readFileSync(request.reportPath, 'utf8')) as Record<
      string,
      unknown
    >;
    if (field.endsWith('Sha256')) report[field] = '0'.repeat(64);
    else {
      const bytes = report[field];
      if (typeof bytes !== 'number') throw new Error('actual report byte field missing');
      report[field] = bytes + 1;
    }
    filesystem.writeFileSync(request.reportPath, JSON.stringify(report));
    const sourceAcquire = connections.openWindowSourceDatabase;
    const snapshotAcquire = connections.openReadOnlyDatabase;
    let owners = 0;
    const sourceOwner = spyOn(connections, 'openWindowSourceDatabase').mockImplementation(
      (path) => {
        owners += 1;
        return sourceAcquire(path);
      },
    );
    const snapshotOwner = spyOn(connections, 'openReadOnlyDatabase').mockImplementation((path) => {
      owners += 1;
      return snapshotAcquire(path);
    });
    try {
      const failure = captureFailure(() => assertWindowBackup(request));
      expect(owners).toBe(0);
      expect(String(failure)).toContain(field + ' differs from report');
    } finally {
      sourceOwner.mockRestore();
      snapshotOwner.mockRestore();
    }
  });
}

for (const field of ['source', 'snapshot'] as const) {
  test('refuses initial ' + field + ' WAL before opening its hash descriptor', () => {
    const request = fixture(true);
    const target = field === 'source' ? request.sourcePath : request.snapshotPath;
    const before = filesystem.readFileSync(target);
    const open = filesystem.openSync;
    let hashes = 0;
    let writer: ReturnType<typeof connections.openDatabase> | undefined;
    if (field === 'source') {
      writer = connections.openDatabase(target);
      writer.run('PRAGMA wal_autocheckpoint=0');
      writer.run("INSERT INTO observation_marker VALUES ('genuine pending WAL')");
    } else filesystem.writeFileSync(target + '-wal', 'physical initial snapshot WAL evidence');
    const walBefore = filesystem.readFileSync(target + '-wal');
    expect(walBefore.length).toBeGreaterThan(0);
    expect(filesystem.readFileSync(target)).toEqual(before);
    const opening = spyOn(filesystem, 'openSync').mockImplementation(
      (...args: Parameters<typeof open>) => {
        if (String(args[0]) === target) hashes += 1;
        return open(...args);
      },
    );
    try {
      const failure = captureFailure(() => assertWindowBackup(request));
      expect(hashes).toBe(0);
      expect(String(failure)).toContain(field + ' -wal must be absent or empty');
      expect(filesystem.readFileSync(target + '-wal')).toEqual(walBefore);
      expect(filesystem.readFileSync(target)).toEqual(before);
    } finally {
      opening.mockRestore();
      writer?.close();
    }
  });
}

for (const operation of ['producer', 'verifier'] as const) {
  test('refuses ' + operation + ' cross-file source WAL before its next hash observation', () => {
    const request = fixture(operation === 'verifier');
    const target = operation === 'producer' ? request.snapshotPath : request.sourcePath;
    const read = migrationSet.readAppliedMigrationIdentities;
    const open = filesystem.openSync;
    let observations = 0;
    let introduced = 0;
    let hashes = 0;
    const reading = spyOn(migrationSet, 'readAppliedMigrationIdentities').mockImplementation(
      (database, candidate) => {
        const identities = read(database, candidate);
        observations += 1;
        if (observations === (operation === 'producer' ? 3 : 2)) {
          introduced += 1;
          filesystem.writeFileSync(
            request.sourcePath + '-wal',
            'physical cross-file source WAL evidence',
          );
        }
        return identities;
      },
    );
    const opening = spyOn(filesystem, 'openSync').mockImplementation(
      (...args: Parameters<typeof open>) => {
        if (String(args[0]) === target) hashes += 1;
        return open(...args);
      },
    );
    try {
      const failure = captureFailure(() =>
        operation === 'producer' ? createWindowBackup(request) : assertWindowBackup(request),
      );
      expect(introduced).toBe(1);
      expect(hashes).toBe(operation === 'producer' ? 0 : 1);
      expect(String(failure)).toContain('source -wal must be absent or empty');
      expect(filesystem.readFileSync(request.sourcePath + '-wal', 'utf8')).toBe(
        'physical cross-file source WAL evidence',
      );
    } finally {
      reading.mockRestore();
      opening.mockRestore();
    }
  });
}

for (const field of ['source', 'snapshot'] as const) {
  test('refuses changed producer ' + field + ' ledger before its next hash observation', () => {
    const request = fixture();
    const link = filesystem.linkSync;
    const open = filesystem.openSync;
    let changed = 0;
    let hashes = 0;
    const linking = spyOn(filesystem, 'linkSync').mockImplementation((source, target) => {
      link(source, target);
      if (String(target) === request.snapshotPath) {
        const writer = connections.openDatabase(
          field === 'source' ? request.sourcePath : request.snapshotPath,
        );
        try {
          writer.run(
            'DELETE FROM __drizzle_migrations WHERE id=(SELECT MIN(id) FROM __drizzle_migrations)',
          );
          changed += 1;
        } finally {
          writer.close();
        }
      }
    });
    const opening = spyOn(filesystem, 'openSync').mockImplementation(
      (...args: Parameters<typeof open>) => {
        if (String(args[0]) === request.snapshotPath) hashes += 1;
        return open(...args);
      },
    );
    try {
      const failure = captureFailure(() => createWindowBackup(request));
      expect(changed).toBe(1);
      expect(hashes).toBe(0);
      expect(String(failure)).toContain('migrations changed while producing report');
      expect(filesystem.existsSync(request.reportPath)).toBe(false);
    } finally {
      linking.mockRestore();
      opening.mockRestore();
    }
  });
}

test('refuses an absent native checkpoint response before allocating a stage', () => {
  const request = fixture();
  const acquire = connections.openExistingConnection;
  let observations = 0;
  let owners = 0;
  const releases: (() => void)[] = [];
  const acquiring = spyOn(connections, 'openExistingConnection').mockImplementation((path) => {
    const connection = acquire(path);
    owners += 1;
    if (owners !== 1) return connection;
    const get = connection.db.get.bind(connection.db);
    const reading = spyOn(connection.db, 'get').mockImplementation(((
      ...args: Parameters<typeof get>
    ) => {
      const actual = get(...args);
      observations += 1;
      expect(actual).toMatchObject({ busy: 0, log: 0, checkpointed: 0 });
      return undefined;
    }) as typeof connection.db.get);
    releases.push(() => {
      reading.mockRestore();
    });
    return connection;
  });
  try {
    const failure = captureFailure(() => createWindowBackup(request));
    expect(observations).toBe(1);
    expect(String(failure)).toContain('checkpoint did not complete with busy=0');
    expect(readWindowBackupFailure(failure)?.stages).toEqual([]);
    expect(filesystem.existsSync(request.snapshotPath)).toBe(false);
  } finally {
    acquiring.mockRestore();
    for (const release of releases) release();
  }
});

for (const field of ['source', 'report'] as const) {
  test('refuses a live ' + field + ' leaf symlink before reading its descriptor', () => {
    const request = fixture(field === 'report');
    const target = field === 'source' ? request.sourcePath : request.reportPath;
    const held = target + '.held';
    filesystem.renameSync(target, held);
    filesystem.symlinkSync(held, target);
    const before = filesystem.readFileSync(held);
    const read = filesystem.readSync;
    const readFile = filesystem.readFileSync;
    let reads = 0;
    const reading = spyOn(filesystem, 'readSync').mockImplementation(((
      ...args: Parameters<typeof read>
    ) => {
      reads += 1;
      return read(...args);
    }) as typeof read);
    const readingFile = spyOn(filesystem, 'readFileSync').mockImplementation(((
      ...args: Parameters<typeof readFile>
    ) => {
      if (typeof args[0] === 'number') reads += 1;
      return readFile(...args);
    }) as typeof readFile);
    try {
      const failure = captureFailure(() =>
        field === 'source' ? createWindowBackup(request) : assertWindowBackup(request),
      );
      expect(reads).toBe(0);
      expect(String(failure)).toContain(field + 'Path cannot be opened');
      expect(filesystem.readFileSync(held)).toEqual(before);
    } finally {
      reading.mockRestore();
      readingFile.mockRestore();
    }
  });
}

test('refuses report permission removal after acquisition before reading JSON', () => {
  const request = fixture(true);
  const open = filesystem.openSync;
  const read = filesystem.readFileSync;
  let descriptor: number | undefined;
  let reads = 0;
  const opening = spyOn(filesystem, 'openSync').mockImplementation(
    (...args: Parameters<typeof open>) => {
      const acquired = open(...args);
      if (String(args[0]) === request.reportPath && descriptor === undefined) {
        descriptor = acquired;
        filesystem.chmodSync(request.reportPath, 0);
      }
      return acquired;
    },
  );
  const reading = spyOn(filesystem, 'readFileSync').mockImplementation(((
    ...args: Parameters<typeof read>
  ) => {
    if (args[0] === descriptor) reads += 1;
    return read(...args);
  }) as typeof read);
  try {
    const failure = captureFailure(() => assertWindowBackup(request));
    expect(descriptor).toBeDefined();
    expect(reads).toBe(0);
    expect(String(failure)).toContain('reportPath is not a readable regular file');
  } finally {
    opening.mockRestore();
    reading.mockRestore();
    filesystem.chmodSync(request.reportPath, 0o600);
  }
});

test('refuses a real closed-writer WAL between checkpoint response and owner settlement', () => {
  const request = fixture();
  const acquire = connections.openExistingConnection;
  const releases: (() => void)[] = [];
  let writes = 0;
  let owners = 0;
  let walBytes: number | undefined;
  const acquiring = spyOn(connections, 'openExistingConnection').mockImplementation((path) => {
    const connection = acquire(path);
    owners += 1;
    if (owners !== 1) return connection;
    const get = connection.db.get.bind(connection.db);
    const reading = spyOn(connection.db, 'get').mockImplementation(((
      ...args: Parameters<typeof get>
    ) => {
      const actual = get(...args);
      expect(actual).toMatchObject({ busy: 0, log: 0, checkpointed: 0 });
      const writer = connections.openDatabase(request.sourcePath);
      try {
        writer.run("INSERT INTO observation_marker VALUES ('real closed writer')");
        writes += 1;
      } finally {
        writer.close();
      }
      if (!filesystem.existsSync(request.sourcePath + '-wal'))
        throw new Error('ordinary closed-writer WAL precondition unavailable');
      walBytes = filesystem.statSync(request.sourcePath + '-wal').size;
      expect(walBytes).toBeGreaterThan(0);
      return actual;
    }) as typeof connection.db.get);
    releases.push(() => {
      reading.mockRestore();
    });
    return connection;
  });
  try {
    const failure = captureFailure(() => createWindowBackup(request));
    expect(writes).toBe(1);
    expect(walBytes).toBeGreaterThan(0);
    expect(String(failure)).toContain('source -wal must be absent or empty');
    expect(readWindowBackupFailure(failure)?.stages).toEqual([]);
    expect(filesystem.existsSync(request.snapshotPath)).toBe(false);
  } finally {
    acquiring.mockRestore();
    for (const release of releases) release();
  }
});

test('refuses real post-checkpoint-close WAL before hashing the source again', () => {
  const request = fixture();
  const acquire = connections.openExistingConnection;
  const open = filesystem.openSync;
  let writer: ReturnType<typeof connections.openDatabase> | undefined;
  let owners = 0;
  let hashes = 0;
  let introduced = 0;
  const releases: (() => void)[] = [];
  const acquiring = spyOn(connections, 'openExistingConnection').mockImplementation((path) => {
    const connection = acquire(path);
    owners += 1;
    if (owners !== 1) return connection;
    const close = connection.close.bind(connection);
    const releasing = spyOn(connection, 'close').mockImplementation(() => {
      close();
      writer = connections.openDatabase(request.sourcePath);
      writer.run('PRAGMA wal_autocheckpoint=0');
      writer.run("INSERT INTO observation_marker VALUES ('real post-close writer')");
      introduced += 1;
      expect(filesystem.statSync(request.sourcePath + '-wal').size).toBeGreaterThan(0);
    });
    releases.push(() => {
      releasing.mockRestore();
    });
    return connection;
  });
  const opening = spyOn(filesystem, 'openSync').mockImplementation(
    (...args: Parameters<typeof open>) => {
      if (String(args[0]) === request.sourcePath) hashes += 1;
      return open(...args);
    },
  );
  try {
    const failure = captureFailure(() => createWindowBackup(request));
    expect(introduced).toBe(1);
    expect(hashes).toBe(1);
    expect(String(failure)).toContain('source -wal must be absent or empty');
    expect(readWindowBackupFailure(failure)?.stages).toEqual([]);
  } finally {
    acquiring.mockRestore();
    opening.mockRestore();
    for (const release of releases) release();
    writer?.close();
  }
});
