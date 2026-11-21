import * as filesystem from 'node:fs';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, spyOn, test } from 'bun:test';

import * as backups from './backup';
import * as connections from './db';
import { runMigrations } from './migrate';
import * as migrationSet from './migration-set';
import { createWindowBackup, readWindowBackupFailure } from './window-backup';

const MIGRATIONS = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'wbs-window-publication-'));
  roots.push(root);
  const sourcePath = join(root, 'source.db');
  runMigrations(sourcePath, MIGRATIONS);
  return {
    sourcePath,
    snapshotPath: join(root, 'snapshot.db'),
    reportPath: join(root, 'report.json'),
    migrationsFolder: MIGRATIONS,
  };
}

function captureFailure(operation: () => unknown): unknown {
  try {
    operation();
    return null;
  } catch (cause) {
    return cause;
  }
}

for (const artifact of ['snapshot', 'report'] as const) {
  test(`reports actual ${artifact} publication after its native link throws following delegation`, () => {
    const request = fixture();
    const destination = artifact === 'snapshot' ? request.snapshotPath : request.reportPath;
    const primary = new Error(`post-${artifact}-link fault`);
    const original = filesystem.linkSync;
    let intercepted = 0;
    const fault = spyOn(filesystem, 'linkSync').mockImplementation((source, target) => {
      original(source, target);
      if (String(target) === destination) {
        intercepted += 1;
        throw primary;
      }
    });
    try {
      const failure = captureFailure(() => createWindowBackup(request));
      expect(intercepted).toBe(1);
      expect(failure).toBeInstanceOf(Error);
      const context = readWindowBackupFailure(failure);
      expect(context).not.toBeNull();
      if (context === null) throw new Error('missing actual publication failure context');
      const publication =
        artifact === 'snapshot' ? context.snapshotPublication : context.reportPublication;
      // A remaining final link must never be described as not published after an uncertain syscall outcome.
      expect(publication).toBe(existsSync(destination) ? 'unknown' : 'not_published');
      expect(failure instanceof AggregateError ? failure.errors : [failure]).toContain(primary);
      if (artifact === 'report') expect(existsSync(request.snapshotPath)).toBe(true);
      else expect(existsSync(request.reportPath)).toBe(false);
    } finally {
      fault.mockRestore();
    }
  });
}

test('refuses a checkpointed source write during final ledger observation', () => {
  const request = fixture();
  const open = connections.openDatabase(request.sourcePath);
  open.run('CREATE TABLE late_window_marker (value TEXT NOT NULL)');
  open.close();
  const read = migrationSet.readAppliedMigrationIdentities;
  let observations = 0;
  let writes = 0;
  const observing = spyOn(migrationSet, 'readAppliedMigrationIdentities').mockImplementation(
    (database, candidate) => {
      const identities = read(database, candidate);
      observations += 1;
      if (observations === 2) {
        const writer = connections.openDatabase(request.sourcePath);
        try {
          writer.run("INSERT INTO late_window_marker VALUES ('late checkpointed write')");
          writer.run('PRAGMA wal_checkpoint(TRUNCATE)');
          writes += 1;
        } finally {
          writer.close();
        }
      }
      return identities;
    },
  );
  try {
    const failure = captureFailure(() => createWindowBackup(request));
    expect(writes).toBe(1);
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain('sourceSha256 or sourceBytes changed');
    expect(existsSync(request.snapshotPath)).toBe(true);
    expect(existsSync(request.reportPath)).toBe(false);
  } finally {
    observing.mockRestore();
  }
});

for (const stageKind of ['snapshot', 'report'] as const) {
  test(
    'reports possible ' + stageKind + ' staging when native acquisition throws after creation',
    () => {
      const request = fixture();
      const primary = new Error('post-mkdtemp acquisition fault');
      const acquire = filesystem.mkdtempSync;
      let acquiredPath: string | undefined;
      const acquiring = spyOn(filesystem, 'mkdtempSync').mockImplementation(((
        ...args: Parameters<typeof acquire>
      ) => {
        const path = acquire(...args);
        if (args[0].includes('.window-' + stageKind + '-')) {
          acquiredPath = path;
          throw primary;
        }
        return path;
      }) as typeof acquire);
      try {
        const failure = captureFailure(() => createWindowBackup(request));
        expect(failure).toBe(primary);
        if (acquiredPath === undefined) throw new Error('actual stage acquisition was not reached');
        expect(filesystem.statSync(acquiredPath).isDirectory()).toBe(true);
        expect(readWindowBackupFailure(failure)?.stages).toContainEqual({
          kind: stageKind,
          parent: join(request.sourcePath, '..'),
          path: null,
        });
        expect(existsSync(request.snapshotPath)).toBe(stageKind === 'report');
        expect(existsSync(request.reportPath)).toBe(false);
      } finally {
        acquiring.mockRestore();
      }
    },
  );
}

test('preserves checkpoint and close failures without publishing or repeating cleanup', () => {
  const request = fixture();
  const primary = new Error('checkpoint read fault');
  const cleanup = new Error('checkpoint close fault');
  const open = connections.openExistingConnection;
  let queries = 0;
  let closes = 0;
  const restore: (() => void)[] = [];
  const acquired = spyOn(connections, 'openExistingConnection').mockImplementation((path) => {
    const connection = open(path);
    const close = connection.close;
    const reading = spyOn(connection.db, 'get').mockImplementation(() => {
      queries += 1;
      throw primary;
    });
    const closing = spyOn(connection, 'close').mockImplementation(() => {
      closes += 1;
      close();
      throw cleanup;
    });
    restore.push(() => {
      reading.mockRestore();
      closing.mockRestore();
    });
    return connection;
  });
  try {
    const failure = captureFailure(() => createWindowBackup(request));
    expect(queries).toBe(1);
    expect(closes).toBe(1);
    expect(failure).toBeInstanceOf(AggregateError);
    if (!(failure instanceof AggregateError)) throw new Error('missing paired failure');
    expect(failure.errors).toEqual([primary, cleanup]);
    expect(existsSync(request.snapshotPath)).toBe(false);
    expect(existsSync(request.reportPath)).toBe(false);
  } finally {
    acquired.mockRestore();
    for (const release of restore) release();
  }
});

test('preserves ledger and close failures without publishing or repeating cleanup', () => {
  const request = fixture();
  const primary = new Error('ledger read fault');
  const cleanup = new Error('ledger close fault');
  const open = connections.openWindowSourceDatabase;
  const read = migrationSet.readAppliedMigrationIdentities;
  let queries = 0;
  let closes = 0;
  const restore: (() => void)[] = [];
  const reading = spyOn(migrationSet, 'readAppliedMigrationIdentities').mockImplementation(
    (db, candidate) => {
      read(db, candidate);
      queries += 1;
      throw primary;
    },
  );
  const acquired = spyOn(connections, 'openWindowSourceDatabase').mockImplementation((path) => {
    const connection = open(path);
    const close = connection.close.bind(connection);
    const closing = spyOn(connection, 'close').mockImplementation(() => {
      closes += 1;
      close();
      throw cleanup;
    });
    restore.push(() => {
      closing.mockRestore();
    });
    return connection;
  });
  try {
    const failure = captureFailure(() => createWindowBackup(request));
    expect(queries).toBe(1);
    expect(closes).toBe(1);
    expect(failure).toBeInstanceOf(AggregateError);
    if (!(failure instanceof AggregateError)) throw new Error('missing paired failure');
    expect(failure.errors).toEqual([primary, cleanup]);
    expect(existsSync(request.snapshotPath)).toBe(false);
    expect(existsSync(request.reportPath)).toBe(false);
  } finally {
    acquired.mockRestore();
    reading.mockRestore();
    for (const release of restore) release();
  }
});

test('retains genuine lower snapshot cleanup uncertainty and propagates its exact identity', () => {
  const request = fixture();
  const cleanup = new Error('actual snapshot source close fault');
  const open = connections.openExistingConnection;
  const snapshot = backups.snapshotDatabase;
  let opens = 0;
  let closes = 0;
  let inherited: unknown;
  const restore: (() => void)[] = [];
  const acquired = spyOn(connections, 'openExistingConnection').mockImplementation((path) => {
    const connection = open(path);
    opens += 1;
    if (opens === 2) {
      const close = connection.close;
      const closing = spyOn(connection, 'close').mockImplementation(() => {
        closes += 1;
        close();
        throw cleanup;
      });
      restore.push(() => {
        closing.mockRestore();
      });
    }
    return connection;
  });
  const observed = spyOn(backups, 'snapshotDatabase').mockImplementation((...args) => {
    try {
      return snapshot(...args);
    } catch (cause) {
      inherited = cause;
      throw cause;
    }
  });
  try {
    const failure = captureFailure(() => createWindowBackup(request));
    expect(opens).toBe(2);
    expect(closes).toBe(1);
    expect(backups.isSnapshotCleanupUnknown(inherited)).toBe(true);
    expect(failure).toBe(inherited);
    const context = readWindowBackupFailure(failure);
    expect(context?.stages).toHaveLength(1);
    const stage = context?.stages[0]?.path;
    if (stage === undefined || stage === null) throw new Error('missing retained uncertain stage');
    expect(filesystem.statSync(stage).isDirectory()).toBe(true);
    expect(filesystem.readdirSync(stage)).not.toHaveLength(0);
    expect(existsSync(request.snapshotPath)).toBe(false);
    expect(existsSync(request.reportPath)).toBe(false);
  } finally {
    acquired.mockRestore();
    observed.mockRestore();
    for (const release of restore) release();
  }
});

test('allows an idle SQLite connection while producing a settled checkpointed report', () => {
  const request = fixture();
  const idle = connections.openDatabase(request.sourcePath);
  try {
    const receipt = createWindowBackup(request);
    expect(receipt.report.sourcePath).toBe(request.sourcePath);
    expect(existsSync(request.snapshotPath)).toBe(true);
    expect(existsSync(request.reportPath)).toBe(true);
    expect(idle.query('SELECT COUNT(*) FROM __drizzle_migrations').get()).not.toBeNull();
  } finally {
    idle.close();
  }
});

test('refuses a genuine reader-blocked checkpoint without publishing either artifact', () => {
  const request = fixture();
  const reader = connections.openDatabase(request.sourcePath);
  const writer = connections.openDatabase(request.sourcePath);
  reader.run('BEGIN');
  reader.query('SELECT * FROM __drizzle_migrations').all();
  writer.run('CREATE TABLE blocked_window_marker (value TEXT)');
  try {
    const failure = captureFailure(() => createWindowBackup(request));
    expect(String(failure)).toContain('checkpoint did not complete with busy=0');
    expect(existsSync(request.snapshotPath)).toBe(false);
    expect(existsSync(request.reportPath)).toBe(false);
  } finally {
    reader.run('ROLLBACK');
    reader.close();
    writer.close();
  }
});

test('refuses a genuinely active writer without publishing either artifact', () => {
  const request = fixture();
  const writer = connections.openDatabase(request.sourcePath);
  writer.run('BEGIN IMMEDIATE');
  try {
    const failure = captureFailure(() => createWindowBackup(request));
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toMatch(/checkpoint did not complete|database is locked/);
    expect(existsSync(request.snapshotPath)).toBe(false);
    expect(existsSync(request.reportPath)).toBe(false);
  } finally {
    writer.run('ROLLBACK');
    writer.close();
  }
});

for (const artifact of ['snapshot', 'report'] as const) {
  test('preserves a competing ' + artifact + ' destination created just before publication', () => {
    const request = fixture();
    const target = artifact === 'snapshot' ? request.snapshotPath : request.reportPath;
    const original = filesystem.linkSync;
    const competitor = 'concurrent operator artifact';
    let intercepted = 0;
    const linking = spyOn(filesystem, 'linkSync').mockImplementation((source, destination) => {
      if (String(destination) === target) {
        intercepted += 1;
        filesystem.writeFileSync(target, competitor, { flag: 'wx' });
      }
      original(source, destination);
    });
    try {
      const failure = captureFailure(() => createWindowBackup(request));
      expect(intercepted).toBe(1);
      expect(failure).toBeInstanceOf(Error);
      expect(filesystem.readFileSync(target, 'utf8')).toBe(competitor);
      expect(existsSync(request.reportPath)).toBe(artifact === 'report');
      expect(
        filesystem
          .readdirSync(join(request.sourcePath, '..'))
          .filter((name) => name.startsWith('.window-')),
      ).toHaveLength(artifact === 'snapshot' ? 1 : 2);
    } finally {
      linking.mockRestore();
    }
  });
}

test('refuses a missing source without creating a database or either artifact', () => {
  const request = fixture();
  filesystem.unlinkSync(request.sourcePath);
  const failure = captureFailure(() => createWindowBackup(request));
  expect(failure).toBeInstanceOf(Error);
  expect(existsSync(request.sourcePath)).toBe(false);
  expect(existsSync(request.snapshotPath)).toBe(false);
  expect(existsSync(request.reportPath)).toBe(false);
});

for (const ledger of ['missing', 'empty', 'changed-hash', 'null-name', 'duplicate']) {
  test('refuses ' + ledger + ' required ledger before publishing', () => {
    const request = fixture();
    const writer = connections.openDatabase(request.sourcePath);
    try {
      if (ledger === 'missing') writer.run('DROP TABLE __drizzle_migrations');
      if (ledger === 'empty') writer.run('DELETE FROM __drizzle_migrations');
      if (ledger === 'changed-hash')
        writer.run(
          "UPDATE __drizzle_migrations SET hash = 'corrupt' WHERE id = (SELECT MIN(id) FROM __drizzle_migrations)",
        );
      if (ledger === 'null-name')
        writer.run(
          'UPDATE __drizzle_migrations SET name = NULL WHERE id = (SELECT MIN(id) FROM __drizzle_migrations)',
        );
      if (ledger === 'duplicate')
        writer.run(
          'INSERT INTO __drizzle_migrations (name,hash,created_at) SELECT name,hash,created_at FROM __drizzle_migrations LIMIT 1',
        );
    } finally {
      writer.close();
    }
    const failure = captureFailure(() => createWindowBackup(request));
    expect(failure).toBeInstanceOf(Error);
    if (ledger === 'changed-hash')
      expect(String(failure)).toContain('is absent or changed in candidate');
    else expect(String(failure)).toMatch(/migrations ledger|name|duplicate/);
    expect(existsSync(request.snapshotPath)).toBe(false);
    expect(existsSync(request.reportPath)).toBe(false);
  });
}

test('refuses nonempty final snapshot sidecar evidence during producer ledger observation', () => {
  const request = fixture();
  const read = migrationSet.readAppliedMigrationIdentities;
  let observations = 0;
  let writes = 0;
  const marker = Buffer.from('deliberate nonempty sidecar evidence; not an ordinary WAL writer');
  const observing = spyOn(migrationSet, 'readAppliedMigrationIdentities').mockImplementation(
    (database, candidate) => {
      const identities = read(database, candidate);
      observations += 1;
      if (observations === 2) {
        filesystem.writeFileSync(request.snapshotPath + '-wal', marker);
        writes += 1;
      }
      return identities;
    },
  );
  try {
    const failure = captureFailure(() => createWindowBackup(request));
    expect(writes).toBe(1);
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain('snapshot -wal');
    expect(existsSync(request.snapshotPath)).toBe(true);
    expect(existsSync(request.reportPath)).toBe(false);
    expect(filesystem.readFileSync(request.snapshotPath + '-wal')).toEqual(marker);
  } finally {
    observing.mockRestore();
  }
});

test('window native source acquisition refuses SQL writes without changing evidence', () => {
  const request = fixture();
  const before = filesystem.readFileSync(request.sourcePath);
  const database = connections.openWindowSourceDatabase(request.sourcePath);
  try {
    expect(database.query('SELECT COUNT(*) FROM __drizzle_migrations').get()).not.toBeNull();
    expect(() => database.run('DELETE FROM __drizzle_migrations')).toThrow(/readonly/);
  } finally {
    database.close();
  }
  expect(filesystem.readFileSync(request.sourcePath)).toEqual(before);
});

test('window native source acquisition never creates an absent escaped path', () => {
  const request = fixture();
  const absent = join(request.sourcePath, '..', 'absent #?%.db');
  expect(() => connections.openWindowSourceDatabase(absent)).toThrow();
  expect(existsSync(absent)).toBe(false);
});

for (const artifact of ['snapshot', 'report'] as const) {
  test(
    'preserves competing ' + artifact + ' stage bytes replaced after its actual publication link',
    () => {
      const request = fixture();
      const link = filesystem.linkSync;
      let stagePath: string | undefined;
      let heldPath: string | undefined;
      let competitorPath: string | undefined;
      let intercepted = 0;
      const linking = spyOn(filesystem, 'linkSync').mockImplementation((source, target) => {
        link(source, target);
        if (
          String(target) === (artifact === 'snapshot' ? request.snapshotPath : request.reportPath)
        ) {
          intercepted += 1;
          stagePath = join(String(source), '..');
          heldPath = stagePath + '-held-original';
          filesystem.renameSync(stagePath, heldPath);
          filesystem.mkdirSync(stagePath);
          competitorPath = join(stagePath, 'operator-owned-evidence');
          filesystem.writeFileSync(competitorPath, 'competing bytes must survive');
        }
      });
      try {
        const receipt = createWindowBackup(request);
        expect(intercepted).toBe(1);
        if (competitorPath === undefined || heldPath === undefined || stagePath === undefined)
          throw new Error('stage replacement was not reached');
        expect(filesystem.readFileSync(competitorPath, 'utf8')).toBe(
          'competing bytes must survive',
        );
        expect(existsSync(heldPath)).toBe(true);
        expect(receipt.artifacts.stages).toContainEqual({
          kind: artifact,
          parent: join(request.sourcePath, '..'),
          path: stagePath,
        });
        expect(JSON.parse(filesystem.readFileSync(request.reportPath, 'utf8'))).toEqual(
          receipt.report,
        );
      } finally {
        linking.mockRestore();
      }
    },
  );
}

test('retains usable snapshot and both stage links in separate detached success metadata', () => {
  const request = fixture();
  const receipt = createWindowBackup(request);
  expect(receipt.artifacts).toEqual({
    snapshotPath: request.snapshotPath,
    reportPath: request.reportPath,
    snapshotPublication: 'published',
    reportPublication: 'published',
    stages: receipt.artifacts.stages,
  });
  expect(receipt.artifacts.stages.map(({ kind, parent }) => ({ kind, parent }))).toEqual([
    { kind: 'snapshot', parent: join(request.sourcePath, '..') },
    { kind: 'report', parent: join(request.sourcePath, '..') },
  ]);
  expect(Object.keys(receipt.report)).toHaveLength(8);
  for (const stage of receipt.artifacts.stages) {
    if (stage.path === null) throw new Error('successful stage pathname missing');
    const finalPath = stage.kind === 'snapshot' ? request.snapshotPath : request.reportPath;
    const stagedPath = join(stage.path, stage.kind === 'snapshot' ? 'snapshot.db' : 'report.json');
    expect(filesystem.statSync(stagedPath).ino).toBe(filesystem.statSync(finalPath).ino);
  }
  const snapshot = connections.openReadOnlyDatabase(request.snapshotPath);
  try {
    expect(snapshot.query('SELECT COUNT(*) FROM __drizzle_migrations').get()).not.toBeNull();
  } finally {
    snapshot.close();
  }
});

test('preserves published report and stages after parent sync failure and keeps descriptor close failures', () => {
  const request = fixture();
  const link = filesystem.linkSync;
  const sync = filesystem.fsyncSync;
  const close = filesystem.closeSync;
  const primary = new Error('post-report-link parent sync fault');
  const closing = new Error('post-report-link parent close fault');
  let reportLinked = false;
  let parentDescriptor: number | undefined;
  let parentCloses = 0;
  const linking = spyOn(filesystem, 'linkSync').mockImplementation((source, target) => {
    link(source, target);
    if (String(target) === request.reportPath) reportLinked = true;
  });
  const syncing = spyOn(filesystem, 'fsyncSync').mockImplementation((descriptor) => {
    if (reportLinked && filesystem.fstatSync(descriptor).isDirectory()) {
      parentDescriptor = descriptor;
      throw primary;
    }
    sync(descriptor);
  });
  const releasing = spyOn(filesystem, 'closeSync').mockImplementation((descriptor) => {
    close(descriptor);
    if (descriptor === parentDescriptor) {
      parentCloses += 1;
      throw closing;
    }
  });
  try {
    const failure = captureFailure(() => createWindowBackup(request));
    expect(reportLinked).toBe(true);
    expect(parentCloses).toBe(1);
    expect(failure).toBeInstanceOf(AggregateError);
    if (!(failure instanceof AggregateError)) throw new Error('paired publication failure missing');
    expect(failure.errors).toEqual([primary, closing]);
    expect(existsSync(request.reportPath)).toBe(true);
    expect(existsSync(request.snapshotPath)).toBe(true);
    const context = readWindowBackupFailure(failure);
    expect(context?.reportPublication).toBe('unknown');
    expect(context?.stages).toHaveLength(2);
    for (const stage of context?.stages ?? []) {
      if (stage.path === null) throw new Error('observed stage missing');
      expect(existsSync(stage.path)).toBe(true);
    }
  } finally {
    linking.mockRestore();
    syncing.mockRestore();
    releasing.mockRestore();
  }
});

test('returns detached failure stage diagnostics without changing retained evidence', () => {
  const request = fixture();
  const link = filesystem.linkSync;
  const primary = new Error('failure diagnostics snapshot');
  const linking = spyOn(filesystem, 'linkSync').mockImplementation((source, target) => {
    link(source, target);
    if (String(target) === request.reportPath) throw primary;
  });
  try {
    const failure = captureFailure(() => createWindowBackup(request));
    expect(failure).toBe(primary);
    const first = readWindowBackupFailure(failure);
    if (first === null) throw new Error('actual retained failure context missing');
    const expected = structuredClone(first);
    // Deliberate hostile consumer exercises the public detached diagnostic boundary.
    const mutable = first as unknown as {
      stages: { path: string | null }[];
      reportPublication: string;
    };
    mutable.stages[0].path = 'substituted';
    mutable.stages.pop();
    mutable.reportPublication = 'not_published';
    expect(readWindowBackupFailure(failure)).toEqual(expected);
    expect(existsSync(request.reportPath)).toBe(true);
  } finally {
    linking.mockRestore();
  }
});

test('retains report after actual file close throws without repeating that close', () => {
  const request = fixture();
  const open = filesystem.openSync;
  const close = filesystem.closeSync;
  const primary = new Error('report descriptor close fault');
  let reportDescriptor: number | undefined;
  let closes = 0;
  const opening = spyOn(filesystem, 'openSync').mockImplementation(
    (...args: Parameters<typeof open>) => {
      const descriptor = open(...args);
      if (String(args[0]).endsWith('/report.json') && args[1] === 'wx')
        reportDescriptor = descriptor;
      return descriptor;
    },
  );
  const releasing = spyOn(filesystem, 'closeSync').mockImplementation((descriptor) => {
    close(descriptor);
    if (descriptor === reportDescriptor) {
      closes += 1;
      throw primary;
    }
  });
  try {
    const failure = captureFailure(() => createWindowBackup(request));
    expect(reportDescriptor).toBeDefined();
    expect(closes).toBe(1);
    expect(failure).toBe(primary);
    expect(readWindowBackupFailure(failure)?.reportPublication).toBe('unknown');
    expect(existsSync(request.reportPath)).toBe(true);
    expect(existsSync(request.snapshotPath)).toBe(true);
  } finally {
    opening.mockRestore();
    releasing.mockRestore();
  }
});

for (const phase of ['write', 'sync'] as const) {
  test('retains stages and closes report once after actual report ' + phase + ' failure', () => {
    const request = fixture();
    const open = filesystem.openSync;
    const write = filesystem.writeFileSync;
    const sync = filesystem.fsyncSync;
    const close = filesystem.closeSync;
    const primary = new Error('report ' + phase + ' fault');
    let descriptor: number | undefined;
    let intercepted = 0;
    let closes = 0;
    const opening = spyOn(filesystem, 'openSync').mockImplementation(
      (...args: Parameters<typeof open>) => {
        const acquired = open(...args);
        if (String(args[0]).endsWith('/report.json') && args[1] === 'wx') descriptor = acquired;
        return acquired;
      },
    );
    const writing = spyOn(filesystem, 'writeFileSync').mockImplementation(
      (...args: Parameters<typeof write>) => {
        if (phase === 'write' && args[0] === descriptor) {
          intercepted += 1;
          throw primary;
        }
        write(...args);
      },
    );
    const syncing = spyOn(filesystem, 'fsyncSync').mockImplementation((acquired) => {
      if (phase === 'sync' && acquired === descriptor) {
        intercepted += 1;
        throw primary;
      }
      sync(acquired);
    });
    const releasing = spyOn(filesystem, 'closeSync').mockImplementation((acquired) => {
      close(acquired);
      if (acquired === descriptor) closes += 1;
    });
    try {
      const failure = captureFailure(() => createWindowBackup(request));
      expect(intercepted).toBe(1);
      expect(closes).toBe(1);
      expect(failure).toBe(primary);
      const context = readWindowBackupFailure(failure);
      expect(context?.reportPublication).toBe('not_published');
      expect(context?.stages).toHaveLength(2);
      expect(existsSync(request.reportPath)).toBe(false);
      expect(existsSync(request.snapshotPath)).toBe(true);
      for (const stage of context?.stages ?? []) {
        if (stage.path === null) throw new Error('acquired stage missing');
        expect(existsSync(stage.path)).toBe(true);
      }
    } finally {
      opening.mockRestore();
      writing.mockRestore();
      syncing.mockRestore();
      releasing.mockRestore();
    }
  });
}
