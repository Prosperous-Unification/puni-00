import type { Stats } from 'node:fs';

export interface MigrationFileIdentity {
  size: number;
  sha256: string;
}
export interface MigrationArtifactRow {
  name: string;
  migration: MigrationFileIdentity;
  down: MigrationFileIdentity;
  snapshot: MigrationFileIdentity | null;
}

/**
 * Self-contained filesystem-only scanner, serialized verbatim for the image probe.
 * Linux procfs descriptor paths anchor every read; no application or SQLite import occurs.
 * Ancestors before the private artifact boundary retain ordinary-directory identities;
 * private root and descendants additionally require 0700/0755 and 0600/0644 modes.
 * retain keeps every root/file descriptor live until close; verify rechecks the original
 * anchored identities and listings. These local resource methods never enter evidence.
 * Throws on unknown members, aliasing, mutation, unreadability, invalid UTF-8 or bounds.
 */
export async function scanMigrationArtifact(root: string, deadline: number, retain = false) {
  const fs = await import('node:fs');
  const crypto = await import('node:crypto');
  const path = await import('node:path');
  const descriptors: number[] = [];
  const anchors: { pathname: string; descriptor: number; identity: string; strict: boolean }[] = [];
  const identities: string[] = [];
  let total = 0;
  let completed = false;
  let closed = false;
  const closeScan = () => {
    if (closed) throw new Error('migration scanner already closed');
    closed = true;
    for (const descriptor of descriptors.reverse()) fs.closeSync(descriptor);
  };
  // Proof: scanner-deadline omission accepted expired work; bounds-and-artifact-safety test failed.
  const assertDeadline = () => {
    if (!Number.isFinite(deadline) || performance.now() >= deadline)
      throw new Error('migration artifact deadline exceeded');
  };
  const identifyEntry = (stat: Stats, strict: boolean) =>
    strict
      ? `${String(stat.dev)}:${String(stat.ino)}:${String(stat.mode)}:${String(stat.nlink)}:${String(stat.size)}:${String(stat.mtimeMs)}:${String(stat.ctimeMs)}`
      : `${String(stat.dev)}:${String(stat.ino)}:${String(stat.mode)}`;
  const openDirectory = (pathname: string, strict: boolean) => {
    assertDeadline();
    const before = fs.lstatSync(pathname);
    // Proof: private-root-modes omission admitted mode0777; artifact-safety boundary test failed.
    if (!before.isDirectory() || (strict && ![0o700, 0o755].includes(before.mode & 0o7777)))
      throw new Error('migration artifact directory is unsafe');
    const descriptor = fs.openSync(
      pathname,
      fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
    );
    descriptors.push(descriptor);
    const identity = identifyEntry(before, strict);
    if (identifyEntry(fs.fstatSync(descriptor), strict) !== identity)
      throw new Error('migration artifact directory changed');
    anchors.push({ pathname, descriptor, identity, strict });
    identities.push(identity);
    return `/proc/self/fd/${String(descriptor)}`;
  };
  const listMembers = (pathname: string) => {
    assertDeadline();
    return fs.readdirSync(pathname).sort();
  };
  const readFileIdentity = (
    pathname: string,
    kind: 'migration' | 'down' | 'snapshot',
  ): MigrationFileIdentity => {
    assertDeadline();
    const before = fs.lstatSync(pathname);
    const maximum = kind === 'snapshot' ? 16 * 1024 * 1024 : 8 * 1024 * 1024;
    // Proof: hardlink/file-modes omissions admitted linked or mode0666 SQL; malformed-complete-artifact tests failed.
    // Proof: sql-pre-read-bound omission reached readSync above 8MiB; oversized-SQL boundary test failed.
    if (
      !before.isFile() ||
      before.nlink !== 1 ||
      ![0o600, 0o644].includes(before.mode & 0o7777) ||
      before.size < 1 ||
      before.size > maximum
    )
      throw new Error('migration artifact file is unsafe or outside bounds');
    total += before.size;
    if (total > 256 * 1024 * 1024) throw new Error('migration artifact total exceeds bound');
    const descriptor = fs.openSync(
      pathname,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
    );
    descriptors.push(descriptor);
    const identity = identifyEntry(before, true);
    if (identifyEntry(fs.fstatSync(descriptor), true) !== identity)
      throw new Error('migration artifact file changed before read');
    const hash = crypto.createHash('sha256');
    // Proof: fatal-utf8 omission admitted byteFF as forward SQL; malformed-complete-artifact test failed.
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
    const buffer = Buffer.alloc(64 * 1024);
    let size = 0;
    let text = '';
    for (;;) {
      assertDeadline();
      const length = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (length === 0) break;
      size += length;
      if (size > maximum || size > before.size)
        throw new Error('migration artifact grew during read');
      hash.update(buffer.subarray(0, length));
      text += decoder.decode(buffer.subarray(0, length), { stream: true });
    }
    text += decoder.decode();
    if (
      size !== before.size ||
      identifyEntry(fs.fstatSync(descriptor), true) !== identity ||
      identifyEntry(fs.lstatSync(pathname), true) !== identity
    )
      throw new Error('migration artifact file changed during read');
    // Proof: nonempty-down omission admitted whitespace-only rollback SQL; malformed-complete-artifact test failed.
    if (kind === 'down' && text.trim() === '') throw new Error('migration artifact down is empty');
    // Proof: snapshot-json omission admitted invalid JSON bytes; malformed-complete-artifact test failed.
    if (kind === 'snapshot') {
      try {
        JSON.parse(text);
      } catch {
        throw new Error('migration snapshot JSON is invalid');
      }
    }
    anchors.push({ pathname, descriptor, identity, strict: true });
    identities.push(identity);
    return { size, sha256: hash.digest('hex') };
  };
  try {
    if (!path.isAbsolute(root) || path.resolve(root) !== root || fs.realpathSync(root) !== root)
      throw new Error('migration artifact root is not canonical');
    let anchored = openDirectory('/', false);
    const components = root.split('/').filter(Boolean);
    for (const [index, component] of components.entries())
      anchored = openDirectory(`${anchored}/${component}`, index === components.length - 1);
    const names = listMembers(anchored);
    // Proof: scanner-cardinality omission reached member file reads at 4097 entries; migration-count boundary test failed.
    if (names.length < 1 || names.length > 4096)
      throw new Error('migration artifact member count outside bounds');
    const stamps = new Set<string>();
    const rows: MigrationArtifactRow[] = [];
    const listings: { pathname: string; names: string[] }[] = [{ pathname: anchored, names }];
    for (const name of names) {
      if (
        Buffer.byteLength(name) > 160 ||
        !/^[0-9]{14}_[a-z0-9_]+$/.test(name) ||
        stamps.has(name.slice(0, 14))
      )
        throw new Error('migration artifact name or stamp is invalid');
      stamps.add(name.slice(0, 14));
      const migrationDirectory = openDirectory(`${anchored}/${name}`, true);
      const members = listMembers(migrationDirectory);
      const hasSnapshot = members.includes('snapshot.json');
      // Proof: complete-membership omission ignored an extra migration-directory file; malformed-complete-artifact test failed.
      if (
        JSON.stringify(members) !==
        JSON.stringify(
          hasSnapshot
            ? ['down.sql', 'migration.sql', 'snapshot.json']
            : ['down.sql', 'migration.sql'],
        )
      )
        throw new Error('migration artifact membership differs');
      listings.push({ pathname: migrationDirectory, names: members });
      rows.push({
        name,
        migration: readFileIdentity(`${migrationDirectory}/migration.sql`, 'migration'),
        down: readFileIdentity(`${migrationDirectory}/down.sql`, 'down'),
        snapshot: hasSnapshot
          ? readFileIdentity(`${migrationDirectory}/snapshot.json`, 'snapshot')
          : null,
      });
    }
    const verifyScan = () => {
      if (closed) throw new Error('migration scanner scope expired');
      // Proof: complete-final-enumeration (with redundant final metadata guard omitted) admitted a file added after first listing; late-file negative failed.
      for (const listing of listings)
        if (JSON.stringify(listMembers(listing.pathname)) !== JSON.stringify(listing.names))
          throw new Error('migration artifact listing changed');
      // Proof: retained-directory-and-file-identities omission admitted same-byte root replacement; same-byte-root negative failed.
      // Proof: streamed-file-mutation omitted growth/post-read/final metadata guards; during-read negative failed.
      for (const anchor of anchors)
        if (
          identifyEntry(fs.fstatSync(anchor.descriptor), anchor.strict) !== anchor.identity ||
          identifyEntry(fs.lstatSync(anchor.pathname), anchor.strict) !== anchor.identity
        )
          throw new Error('migration artifact ancestor changed');
    };
    verifyScan();
    assertDeadline();
    completed = true;
    return { migrations: rows, identities, verify: verifyScan, close: closeScan };
  } finally {
    if (!retain || !completed) closeScan();
  }
}

/** Fixed image directory, no application imports, no caller program or path. */
export function migrationScannerProgram(): string {
  return `(${scanMigrationArtifact.toString()})('/app/apps/wbs/be-01/drizzle',performance.now()+110000).then(scan=>{process.stdout.write(JSON.stringify(scan.migrations)+'\\n')}).catch(()=>{process.exitCode=1})`;
}
