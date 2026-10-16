import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { Database } from 'bun:sqlite';
import { afterEach, expect, it } from 'bun:test';

import {
  parseSqliteReport,
  restoreCommand,
  restoreEnvironment,
  SQLITE_REPORT_SCRIPT,
} from './cutover';
import { cutoverEnvironment } from './cutover-replay';
import {
  fixtureBackend,
  fixtureCutoverIdentity,
  fixtureDescriptorBytes,
  fixtureOldBackend,
} from './cutover-replay.fixture';
import { sha256Of } from './migration-capture';

const image = fixtureBackend;
const oldImage = fixtureOldBackend;
const descriptorBytes = fixtureDescriptorBytes;
const identity = fixtureCutoverIdentity;
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture(kinds = ['replace_blockage', 'move_progress_v1']) {
  const root = scratchSync('cutover-replay-');
  roots.push(root);
  mkdirSync(join(root, 'src'));
  writeFileSync(
    join(root, 'src/step-blockage-replay-kinds-cli.ts'),
    `console.log(${JSON.stringify(JSON.stringify(kinds))});`,
  );
  const source = join(root, 'source.sqlite');
  const db = new Database(source);
  db.run(
    'CREATE TABLE command_journal(payload TEXT,inverse TEXT,preconditions TEXT); CREATE TABLE __drizzle_migrations(name TEXT,created_at INTEGER); INSERT INTO __drizzle_migrations VALUES("m1",0); CREATE TABLE project(name TEXT); INSERT INTO project VALUES("known")',
  );
  db.query('INSERT INTO command_journal VALUES(?,?,?)').run(
    JSON.stringify({ forward: { do: 'batch', steps: [{ do: 'replace_blockage' }] } }),
    JSON.stringify({ do: 'batch', steps: [{ do: 'move', expectedProgress: [] }] }),
    JSON.stringify({ moveProgress: {} }),
  );
  db.close();
  const exported = join(root, 'export.sqlite');
  const env = {
    ...cutoverEnvironment(identity()),
    PUNI_DB: source,
    PUNI_EXPORT: exported,
    PUNI_KNOWN: '["known"]',
  };
  const execute = (script: string, overrides: Record<string, string> = {}) =>
    Bun.spawnSync({
      cmd: ['bun', '-e', script],
      cwd: root,
      env: { ...process.env, ...env, ...overrides },
      stdout: 'pipe',
      stderr: 'pipe',
    });
  return { root, source, exported, env, execute };
}
it('binds export replay evidence to original descriptor bytes and equal digest aliases', () => {
  const { execute, exported } = fixture();
  const child = execute(SQLITE_REPORT_SCRIPT);
  expect(child.exitCode).toBe(0);
  const report = parseSqliteReport(child.stdout.toString());
  expect(report.replay).toMatchObject({
    version: 1,
    descriptorBytes,
    descriptorSha256: sha256Of(descriptorBytes),
    oldBackendImage: oldImage,
    backendImage: image,
    exportSha256: createHash('sha256').update(readFileSync(exported)).digest('hex'),
  });
});
for (const kinds of [[], ['move_progress_v1']])
  it(`refuses unsupported export ${JSON.stringify(kinds)} before snapshot`, () => {
    const { execute, source, exported } = fixture(kinds);
    const before = readFileSync(source);
    const child = execute(SQLITE_REPORT_SCRIPT);
    expect(child.exitCode).not.toBe(0);
    expect(child.stderr.toString()).toContain('unsupported');
    expect(existsSync(exported)).toBe(false);
    expect(readFileSync(source)).toEqual(before);
  });
for (const fault of [
  'missing-db',
  'missing-journal',
  'missing-source',
  'unreadable-db',
  'malformed',
  'missing-cli',
  'unreadable-cli',
  'foreign-descriptor',
  'changed-descriptor',
  'foreign-image',
  'foreign-backend',
  'malformed-descriptor',
  'descriptor-version',
])
  it(`refuses ${fault} trusted export input`, () => {
    const { execute, source, exported, root } = fixture();
    const overrides: Record<string, string> = {};
    if (fault === 'missing-db') rmSync(source);
    if (fault === 'missing-journal') {
      const db = new Database(source);
      db.run('DROP TABLE command_journal');
      db.close();
    }
    if (fault === 'missing-source') rmSync(join(root, 'src'), { recursive: true });
    if (fault === 'unreadable-db') chmodSync(source, 0);
    if (fault === 'malformed') {
      const db = new Database(source);
      db.run("UPDATE command_journal SET inverse='null'");
      db.close();
    }
    if (fault === 'missing-cli') rmSync(join(root, 'src/step-blockage-replay-kinds-cli.ts'));
    if (fault === 'unreadable-cli')
      chmodSync(join(root, 'src/step-blockage-replay-kinds-cli.ts'), 0);
    if (fault === 'foreign-descriptor') overrides['PUNI_DESCRIPTOR_SHA256'] = 'f'.repeat(64);
    if (fault === 'changed-descriptor') overrides['PUNI_DESCRIPTOR_BYTES'] = ` ${descriptorBytes}`;
    if (fault === 'foreign-backend')
      overrides['PUNI_BACKEND_IMAGE'] = `alias/be@sha256:${'1'.repeat(64)}`;
    if (fault === 'malformed-descriptor' || fault === 'descriptor-version') {
      const bytes =
        fault === 'malformed-descriptor'
          ? '[]'
          : descriptorBytes.replace('"schemaVersion":1', '"schemaVersion":2');
      overrides['PUNI_DESCRIPTOR_BYTES'] = bytes;
      overrides['PUNI_DESCRIPTOR_SHA256'] = sha256Of(bytes);
    }
    if (fault === 'foreign-image')
      overrides['PUNI_OLD_BACKEND_IMAGE'] = `be@sha256:${'2'.repeat(64)}`;
    const child = execute(SQLITE_REPORT_SCRIPT, overrides);
    expect(child.exitCode).not.toBe(0);
    if (fault === 'malformed-descriptor')
      expect(child.stderr.toString()).toContain('cutover descriptor is malformed');
    expect(existsSync(exported)).toBe(false);
  });

for (const fault of [
  'none',
  'empty-capabilities',
  'missing-incoming',
  'unreadable-incoming',
  'move-only',
  'changed-bytes',
  'cli-mutates-bytes',
  'foreign-export',
  'foreign-image',
  'changed-inventory',
  'legacy',
  'stale-marker',
] as const) {
  it(`checks incoming replay before rename: ${fault}`, () => {
    const { execute, exported, root } = fixture();
    const first = execute(SQLITE_REPORT_SCRIPT);
    expect(first.exitCode).toBe(0);
    const report = parseSqliteReport(first.stdout.toString());
    const target = join(root, 'restored.sqlite');
    const incoming = join(root, 'cutover-incoming.sqlite');
    const marker = join(root, 'cutover-incoming.done');
    writeFileSync(incoming, readFileSync(exported));
    const before = readFileSync(incoming);
    if (fault === 'missing-incoming') rmSync(incoming);
    if (fault === 'unreadable-incoming') chmodSync(incoming, 0);
    if (fault === 'empty-capabilities' || fault === 'move-only')
      writeFileSync(
        join(root, 'src/step-blockage-replay-kinds-cli.ts'),
        `console.log('${fault === 'empty-capabilities' ? '[]' : '["move_progress_v1"]'}');`,
      );
    if (fault === 'changed-bytes')
      writeFileSync(incoming, Buffer.concat([before, Buffer.from('changed')]));
    if (fault === 'cli-mutates-bytes')
      writeFileSync(
        join(root, 'src/step-blockage-replay-kinds-cli.ts'),
        `require('node:fs').appendFileSync(process.env.DB_PATH,'changed');console.log('["replace_blockage","move_progress_v1"]');`,
      );
    const evidence = JSON.parse(JSON.stringify(report.replay)) as {
      exportSha256: string;
      backendImage: string;
      inventory: unknown;
    };
    if (fault === 'foreign-export') evidence.exportSha256 = 'f'.repeat(64);
    if (fault === 'foreign-image') evidence.backendImage = `be@sha256:${'2'.repeat(64)}`;
    if (fault === 'changed-inventory') evidence.inventory = [];
    const env = {
      ...restoreEnvironment(report.sha256, ['known'], identity(), report.replay),
      PUNI_DB: target,
      PUNI_EXPORT_REPLAY: JSON.stringify(fault === 'legacy' ? null : evidence),
      PUNI_EXPORT: '',
    };
    if (fault === 'stale-marker') writeFileSync(marker, 'stale');
    const command = restoreCommand();
    // Marker arrival follows process start; a stale pre-existing marker can never authorize retry.
    const program =
      fault === 'stale-marker'
        ? command[2]
        : `require('node:timers').setTimeout(()=>{},0); const spawn=require('node:child_process').spawn; const child=spawn('sh',['-c','sleep 0.05; touch "$MARKER"'],{env:{...process.env,MARKER:${JSON.stringify(marker)}}});\n${command[2]}`;
    const restored = execute(program, env);
    if (fault === 'unreadable-incoming') chmodSync(incoming, 0o600);
    expect(readFileSync(exported)).toEqual(before);
    if (fault === 'none') {
      expect(restored.exitCode).toBe(0);
      expect(readFileSync(target)).toEqual(before);
      expect(parseSqliteReport(restored.stdout.toString()).replay).toEqual(report.replay);
    } else {
      expect(restored.exitCode).not.toBe(0);
      expect(existsSync(target)).toBe(false);
      expect(existsSync(incoming)).toBe(fault !== 'missing-incoming');
      if (
        fault !== 'changed-bytes' &&
        fault !== 'cli-mutates-bytes' &&
        fault !== 'missing-incoming'
      )
        expect(readFileSync(incoming)).toEqual(before);
    }
    if (fault === 'empty-capabilities') {
      writeFileSync(
        join(root, 'src/step-blockage-replay-kinds-cli.ts'),
        'console.log(\'["replace_blockage","move_progress_v1"]\');',
      );
      expect(execute(command[2], env).stderr.toString()).toContain('stale');
      expect(existsSync(target)).toBe(false);
    }
  });
}

for (const marker of ['forward', 'inverse', 'precondition', 'none'] as const) {
  it(`inventories independent ${marker} markers with empty snapshots`, () => {
    const { execute, source, exported } = fixture([]);
    const guarded = {
      do: 'batch',
      steps: [{ do: 'batch', steps: [{ do: 'move', expectedProgress: [] }] }],
    };
    const db = new Database(source);
    db.query('UPDATE command_journal SET payload=?,inverse=?,preconditions=?').run(
      JSON.stringify({ forward: marker === 'forward' ? guarded : { do: 'patch' } }),
      JSON.stringify(marker === 'inverse' ? guarded : { do: 'patch' }),
      JSON.stringify(marker === 'precondition' ? { moveProgress: {} } : {}),
    );
    db.close();
    const child = execute(SQLITE_REPORT_SCRIPT);
    expect(child.exitCode).toBe(marker === 'none' ? 0 : 1);
    if (marker !== 'none') expect(child.stderr.toString()).toContain('move_progress_v1');
    expect(existsSync(exported)).toBe(marker === 'none');
  });
}

for (const source of [
  "console.log('[]');process.exit(1)",
  "console.log('{}')",
  "console.log('[3]')",
  'console.log(\'["move_progress_v1","move_progress_v1"]\')',
] as const) {
  it(`refuses broken own capability CLI even with empty history: ${source}`, () => {
    const { execute, root, source: path, exported } = fixture([]);
    const db = new Database(path);
    db.run('DELETE FROM command_journal');
    db.close();
    writeFileSync(join(root, 'src/step-blockage-replay-kinds-cli.ts'), source);
    const child = execute(SQLITE_REPORT_SCRIPT);
    expect(child.exitCode).not.toBe(0);
    expect(existsSync(exported)).toBe(false);
    expect(child.stderr.toString()).toContain(
      source.includes('exit(1)') ? 'observation failed' : 'observation is malformed',
    );
  });
}

for (const direction of ['forward', 'inverse', 'both', 'combined', 'legacy'] as const) {
  for (const supportsDelete of [false, true]) {
    it(`inventories deletionState ${direction} independently (supported=${String(supportsDelete)})`, () => {
      const { execute, source, exported } = fixture(
        supportsDelete ? ['delete_state_v1', 'move_progress_v1'] : ['move_progress_v1'],
      );
      const deletion = {
        do: 'batch',
        steps: [{ do: 'delete_subtree', deletionState: { blockages: [], parentBlockages: [] } }],
      };
      const restoration = {
        do: 'batch',
        steps: [
          {
            do: 'batch',
            steps: [
              { do: 'restore_subtree', deletionState: { blockages: [], parentBlockages: [] } },
            ],
          },
        ],
      };
      const db = new Database(source);
      db.query('UPDATE command_journal SET payload=?,inverse=?,preconditions=?').run(
        JSON.stringify({
          forward: ['forward', 'both', 'combined'].includes(direction)
            ? deletion
            : { do: 'delete_subtree' },
        }),
        JSON.stringify(
          ['inverse', 'both'].includes(direction) ? restoration : { do: 'restore_subtree' },
        ),
        JSON.stringify(direction === 'combined' ? { moveProgress: {} } : {}),
      );
      db.close();
      const plain = new Database(source);
      plain
        .query('INSERT INTO command_journal VALUES(?,?,?)')
        .run(
          JSON.stringify({ forward: { do: 'delete_subtree' } }),
          JSON.stringify({ do: 'restore_subtree' }),
          '{}',
        );
      plain.close();
      const child = execute(SQLITE_REPORT_SCRIPT);
      if (direction === 'legacy' || supportsDelete) {
        expect(child.exitCode).toBe(0);
        const replay = parseSqliteReport(child.stdout.toString()).replay as {
          inventory: { kind: string; count: number }[];
        };
        expect(replay.inventory).toEqual(
          direction === 'legacy'
            ? []
            : direction === 'combined'
              ? [
                  { kind: 'move_progress_v1', count: 1 },
                  { kind: 'delete_state_v1', count: 1 },
                ]
              : [{ kind: 'delete_state_v1', count: 1 }],
        );
      } else {
        expect(child.exitCode).not.toBe(0);
        expect(child.stderr.toString()).toContain('delete_state_v1 unsupported');
        expect(existsSync(exported)).toBe(false);
      }
    });
  }
}

it('retains enabled-empty capability in pinned cutover evidence', async () => {
  const { validateCutoverReplay } = await import('./cutover-replay');
  const pinned = identity();
  const sha256 = '0'.repeat(64);
  expect(
    validateCutoverReplay(
      {
        ...pinned,
        version: 1,
        inventory: [{ kind: 'step_blockage_activation_v1', count: 1 }],
        capabilities: ['step_blockage_activation_v1'],
        exportSha256: sha256,
      },
      pinned,
      sha256,
    ).inventory,
  ).toEqual([{ kind: 'step_blockage_activation_v1', count: 1 }]);
});
