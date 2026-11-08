import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readdirSync,
  readFileSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';

import { runMigrations } from '@wbs/store-sqlite/migrate';
import { captureAppliedMigrationSet } from '@wbs/store-sqlite/migration-set';

import { decodeDependencyMigrationManifest } from '../src/lib/dependency-migration-artifact';

declare const SOURCE_STAGEB_MIGRATION_LITERAL: string;
/** Fixed package facts embedded before worker hashing; never a runtime path selector. */
export interface SourceMigrationPackage {
  readonly version: 1;
  readonly sourceSha: string;
  readonly workflowSha: string;
  readonly nonce: string;
  readonly migrationManifestSha256: string;
  readonly envelope: string;
  readonly databases: readonly [
    Readonly<{ environment: 'prod'; path: string }>,
    Readonly<{ environment: 'dev'; path: string }>,
  ];
}
type Environment = 'prod' | 'dev';
type Base = Readonly<{ version: 1; nonce: string; environment: Environment }>;
/** One private parent grant; durations use the child's earlier entry anchor. */
export type SourceMigrationPermit = Base &
  Readonly<{
    phase: 'migrate';
    sourceSha: string;
    workflowSha: string;
    inputManifestSha256: string;
    migrationManifestSha256: string;
    remainingMs: number;
    notAfter: number;
  }>;
export type SourceMigrationFrame =
  | SourceMigrationPermit
  | (Base & Readonly<{ phase: 'ready' }>)
  | (Base & Readonly<{ phase: 'complete'; migrationManifestSha256: string }>)
  | (Base &
      Readonly<{
        phase: 'failed';
        reason: 'permission-refused' | 'deadline' | 'migration' | 'settlement';
      }>);
function refuse(reason = 'boundary'): never {
  throw new Error('source migration ' + reason + ' refused');
}
function fields(value: unknown, names: readonly string[]): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== [...names].sort().join(',')
  )
    return refuse();
  // Boundary: exact own field set and ordinary parsed JSON object checked above.
  return value as Record<string, unknown>;
}
function hex(value: unknown, length: number): string {
  if (typeof value !== 'string' || !new RegExp(`^[a-f0-9]{${String(length)}}$`).test(value))
    return refuse();
  return value;
}
function integer(value: unknown, minimum: number, maximum: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  )
    return refuse();
  return value;
}
function decodeFrame(value: unknown): SourceMigrationFrame {
  if (typeof value !== 'object' || value === null || !('phase' in value)) return refuse();
  const extra =
    value.phase === 'ready'
      ? []
      : value.phase === 'complete'
        ? ['migrationManifestSha256']
        : value.phase === 'failed'
          ? ['reason']
          : value.phase === 'migrate'
            ? [
                'sourceSha',
                'workflowSha',
                'inputManifestSha256',
                'migrationManifestSha256',
                'remainingMs',
                'notAfter',
              ]
            : refuse();
  const checked = fields(value, ['version', 'nonce', 'environment', 'phase', ...extra]);
  if (
    checked['version'] !== 1 ||
    (checked['environment'] !== 'prod' && checked['environment'] !== 'dev')
  )
    return refuse();
  const base = {
    version: 1,
    nonce: hex(checked['nonce'], 32),
    environment: checked['environment'],
  } as const;
  switch (checked['phase']) {
    case 'ready':
      return { ...base, phase: 'ready' };
    case 'complete':
      return {
        ...base,
        phase: 'complete',
        migrationManifestSha256: hex(checked['migrationManifestSha256'], 64),
      };
    case 'failed': {
      const reason = checked['reason'];
      if (
        reason !== 'permission-refused' &&
        reason !== 'deadline' &&
        reason !== 'migration' &&
        reason !== 'settlement'
      )
        return refuse();
      return { ...base, phase: 'failed', reason };
    }
    case 'migrate':
      return {
        ...base,
        phase: 'migrate',
        sourceSha: hex(checked['sourceSha'], 40),
        workflowSha: hex(checked['workflowSha'], 40),
        inputManifestSha256: hex(checked['inputManifestSha256'], 64),
        migrationManifestSha256: hex(checked['migrationManifestSha256'], 64),
        remainingMs: integer(checked['remainingMs'], 1, 120000),
        notAfter: integer(checked['notAfter'], 1, Number.MAX_SAFE_INTEGER),
      };
    default:
      return refuse();
  }
}
/** Encode one closed canonical body without LF, preceded by its unsigned BE length. */
export function encodeSourceMigrationFrame(frame: SourceMigrationFrame): Uint8Array {
  const body = Buffer.from(JSON.stringify(decodeFrame(frame)));
  if (body.length > 1024) return refuse();
  const encoded = Buffer.alloc(body.length + 4);
  encoded.writeUInt32BE(body.length);
  body.copy(encoded, 4);
  return encoded;
}
/** Decode a complete bounded stream; truncated, noncanonical and surplus bodies throw. */
export function decodeSourceMigrationFrames(bytes: Uint8Array): SourceMigrationFrame[] {
  // Proof: frame-stream-red.log omitted only this cap and reached later frame-body refusal; exact guarded restoration GREEN.
  if (bytes.length > 2056) return refuse('frame-stream-bound');
  const encoded = Buffer.from(bytes);
  const frames: SourceMigrationFrame[] = [];
  for (let offset = 0; offset < encoded.length;) {
    // Proof: frame-header-red.log omitted this check and reached native range refusal; exact guarded restoration GREEN.
    if (encoded.length - offset < 4) return refuse('frame-header');
    const length = encoded.readUInt32BE(offset);
    offset += 4;
    // Proof: frame-body-red.log omitted this predicate: malformed/truncated bodies reached later JSON refusal, while three closed frames were returned; restored precise labels GREEN.
    if (length < 1 || length > 1024 || encoded.length - offset < length || frames.length === 2)
      return refuse('frame-body');
    const body = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      encoded.subarray(offset, offset + length),
    );
    const frame = decodeFrame(JSON.parse(body));
    // Proof: frame-canonical-red.log omission accepted an LF body and let a noncanonical permit reach actual SQLite; exact restoration GREEN.
    if (JSON.stringify(frame) !== body) return refuse('frame-canonical');
    frames.push(frame);
    offset += length;
  }
  return frames;
}
function pathname(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.includes('\0') ||
    value
      .split('/')
      .slice(1)
      .some((part) => !part || part === '.' || part === '..')
  )
    return refuse();
  return value;
}
function decodePackage(literal: string): SourceMigrationPackage {
  const checked = fields(JSON.parse(literal), [
    'version',
    'sourceSha',
    'workflowSha',
    'nonce',
    'migrationManifestSha256',
    'envelope',
    'databases',
  ]);
  if (
    checked['version'] !== 1 ||
    !Array.isArray(checked['databases']) ||
    checked['databases'].length !== 2
  )
    return refuse();
  const prod = fields(checked['databases'][0], ['environment', 'path']);
  const dev = fields(checked['databases'][1], ['environment', 'path']);
  if (prod['environment'] !== 'prod' || dev['environment'] !== 'dev') return refuse();
  const fixed: SourceMigrationPackage = {
    version: 1,
    sourceSha: hex(checked['sourceSha'], 40),
    workflowSha: hex(checked['workflowSha'], 40),
    nonce: hex(checked['nonce'], 32),
    migrationManifestSha256: hex(checked['migrationManifestSha256'], 64),
    envelope: pathname(checked['envelope']),
    databases: [
      { environment: 'prod', path: pathname(prod['path']) },
      { environment: 'dev', path: pathname(dev['path']) },
    ],
  };
  if (fixed.databases[0].path === fixed.databases[1].path || JSON.stringify(fixed) !== literal)
    return refuse();
  return fixed;
}
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function readRegular(path: string, maximum: number): Buffer {
  // Proof: nofollow-red.log omitted O_NOFOLLOW; an owned byte-identical manifest symlink then permitted actual SQLite opens. Exact restoration GREEN.
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(descriptor);
    // Proof: read-type-red.log omitted type refusal and reached actual SQLite; read-size-red.log omitted size refusal and triggered the owned raw-read exit71 sentinel. Restored independently GREEN.
    if (!before.isFile() || before.size > maximum) return refuse();
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    // Proof: read-drift-red.log omitted this bracket under a raw post-read mtime fault and reached actual SQLite; exact restoration GREEN.
    if (
      bytes.length !== before.size ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs
    )
      return refuse();
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}
function verifyEnvelope(fixed: SourceMigrationPackage) {
  // Proof: envelope-red.log omitted only this membership predicate; an extra inert envelope member then permitted actual SQLite, with its foreign sentinel preserved. Restored GREEN.
  if (
    !lstatSync(fixed.envelope).isDirectory() ||
    JSON.stringify(readdirSync(fixed.envelope).sort()) !==
      JSON.stringify(['drizzle', 'manifest.json'])
  )
    return refuse();
  const bytes = readRegular(join(fixed.envelope, 'manifest.json'), 4 * 1024 * 1024);
  const contents = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const raw: unknown = JSON.parse(contents);
  if (
    typeof raw !== 'object' ||
    raw === null ||
    !('candidateImage' in raw) ||
    !('candidateImageId' in raw) ||
    typeof raw.candidateImage !== 'string' ||
    typeof raw.candidateImageId !== 'string'
  )
    return refuse();
  const manifest = decodeDependencyMigrationManifest(contents, {
    version: 1,
    sourceSha: fixed.sourceSha,
    candidateImage: raw.candidateImage,
    candidateImageId: raw.candidateImageId,
    // Proof: manifest-pin-red.log replaced this original commitment with the observed hash and admitted a changed manifest to actual SQLite; exact restoration GREEN.
    manifestSha256: fixed.migrationManifestSha256,
  });
  // Proof: drizzle-red.log omitted roster equality; an unmanifested SQL directory reached actual SQLite before later ledger refusal. Exact restoration GREEN.
  const directory = join(fixed.envelope, 'drizzle');
  if (
    !lstatSync(directory).isDirectory() ||
    JSON.stringify(readdirSync(directory).sort()) !==
      JSON.stringify(manifest.migrations.map((row) => row.name))
  )
    return refuse();
  for (const row of manifest.migrations) {
    const folder = join(directory, row.name);
    if (!lstatSync(folder).isDirectory()) return refuse();
    const members =
      row.snapshot === null
        ? ['down.sql', 'migration.sql']
        : ['down.sql', 'migration.sql', 'snapshot.json'];
    // Proof: row-red.log omitted exact row membership; an extra inert row member then permitted actual SQLite. Exact restoration GREEN.
    if (JSON.stringify(readdirSync(folder).sort()) !== JSON.stringify(members)) return refuse();
    for (const [name, identity] of [
      ['migration.sql', row.migration],
      ['down.sql', row.down],
      ['snapshot.json', row.snapshot],
    ] as const) {
      if (identity === null) continue;
      const content = readRegular(join(folder, name), identity.size);
      // Proof: sql-content-red.log omitted this comparison; altered SQL created foreign_sql_effect despite the later ledger refusal. Exact restoration GREEN.
      if (content.length !== identity.size || digest(content) !== identity.sha256) return refuse();
    }
  }
  return manifest;
}
function publish(frame: SourceMigrationFrame): void {
  const bytes = encodeSourceMigrationFrame(frame);
  for (let offset = 0; offset < bytes.length;) {
    const written = writeSync(1, bytes, offset, bytes.length - offset);
    if (written < 1) return refuse();
    offset += written;
  }
}
async function main(): Promise<void> {
  const enteredAt = performance.now();
  if (typeof SOURCE_STAGEB_MIGRATION_LITERAL === 'undefined') return refuse();
  const fixed = decodePackage(SOURCE_STAGEB_MIGRATION_LITERAL);
  const environment = process.argv[2];
  // Proof: argv-red.log omitted this guard; an extra argv element then permitted actual SQLite. Exact restoration GREEN.
  if (process.argv.length !== 3 || (environment !== 'prod' && environment !== 'dev'))
    return refuse();
  const base = { version: 1, nonce: fixed.nonce, environment } as const;
  let reason: 'permission-refused' | 'deadline' | 'migration' | 'settlement' = 'permission-refused';
  try {
    // Proof: environment-red.log omitted this closed environment guard; wrong WBS_ENV, extra ambient variable and wrong scratch coordinate each permitted actual SQLite. Restored GREEN.
    if (
      JSON.stringify(Object.keys(process.env).sort()) !==
        JSON.stringify([
          'BUN_RUNTIME_TRANSPILER_CACHE_PATH',
          'LANG',
          'SQLITE_TMPDIR',
          'TMPDIR',
          'TZ',
          'WBS_ENV',
        ]) ||
      process.env['WBS_ENV'] !== environment ||
      process.env['BUN_RUNTIME_TRANSPILER_CACHE_PATH'] !== '0' ||
      process.env['LANG'] !== 'C.UTF-8' ||
      process.env.TZ !== 'UTC' ||
      process.env['TMPDIR'] !== join(process.cwd(), 'copy') ||
      process.env['SQLITE_TMPDIR'] !== join(process.cwd(), 'sqlite')
    )
      return refuse();
    // Proof: injected SQL before ready failed the real worker_sentinel no-effect oracle (barrier-red.log); exact restoration passed.
    verifyEnvelope(fixed);
    // Proof: transient-before-ready-red.log injected a completed readonly capture here; owned native inotify saw OPEN/CLOSE despite clean sampled descriptors and unchanged SQL sentinel. Restored GREEN.
    publish({ ...base, phase: 'ready' });
    const chunks: Uint8Array[] = [];
    let length = 0;
    // Proof: transient-before-eof-red.log injected a completed readonly capture after a permit chunk; owned inotify detected it before EOF while FD/sentinel samples remained clean. Restored GREEN.
    for await (const chunk of Bun.stdin.stream()) {
      length += chunk.length;
      if (length > 1028) return refuse();
      chunks.push(chunk);
    }
    const frames = decodeSourceMigrationFrames(Buffer.concat(chunks));
    const permit = frames[0];
    // Proof: omitted nonce/source/workflow/manifest joins made each real worker negative report complete (joins-red.log); restored tests pass.
    if (
      frames.length !== 1 ||
      permit.phase !== 'migrate' ||
      permit.nonce !== fixed.nonce ||
      permit.environment !== environment ||
      permit.sourceSha !== fixed.sourceSha ||
      permit.workflowSha !== fixed.workflowSha ||
      permit.migrationManifestSha256 !== fixed.migrationManifestSha256
    )
      return refuse();
    // Proof: clock-monotonic-red.log and clock-wall-red.log independently omitted each clock and observed actual SQLite activity; restoring each retained the original entry anchor and wall cutoff, GREEN.
    const assertDeadline = () => {
      if (performance.now() >= enteredAt + permit.remainingMs || Date.now() >= permit.notAfter) {
        reason = 'deadline';
        return refuse();
      }
    };
    assertDeadline();
    reason = 'migration';
    const manifest = verifyEnvelope(fixed);
    const database = fixed.databases[environment === 'prod' ? 0 : 1].path;
    // Proof: pre-sql-deadline-red.log omitted only this immediate recheck after a delayed real envelope read; native DB events and worker_sentinel appeared. Exact restoration GREEN.
    assertDeadline();
    runMigrations(database, join(fixed.envelope, 'drizzle'));
    assertDeadline();
    const capture = captureAppliedMigrationSet(database, join(fixed.envelope, 'drizzle'), {
      target: environment,
      attempt: fixed.nonce,
      candidate: fixed.sourceSha,
    });
    // Proof: ledger-comparison-red.log omitted this comparison after an actual SQLite close-boundary row deletion and reported complete; exact restoration refused the incomplete full ledger, GREEN.
    if (
      capture.pending.length !== 0 ||
      JSON.stringify(capture.applied) !==
        JSON.stringify(
          manifest.migrations.map((row) => ({ name: row.name, hash: row.migration.sha256 })),
        )
    )
      return refuse();
    verifyEnvelope(fixed);
    assertDeadline();
    reason = 'settlement';
    publish({ ...base, phase: 'complete', migrationManifestSha256: fixed.migrationManifestSha256 });
  } catch {
    publish({ ...base, phase: 'failed', reason });
    process.exitCode = 1;
  }
}
if (import.meta.main) await main();
