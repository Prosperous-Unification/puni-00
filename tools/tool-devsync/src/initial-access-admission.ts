import { $ } from 'bun';

const MIGRATION_ROOTS = ['apps/be-01/drizzle', 'apps/wbs/be-01/drizzle'] as const;
const PROTECTED_MIGRATIONS = new Set([
  '20261102120000_add_access_grants',
  '20261103110000_add_initial_access_offers',
]);

interface GitEntry {
  readonly mode: string;
  readonly kind: string;
  readonly objectId: string;
  readonly path: string;
}

/** Adds the immutable query and owning repository to required Git failures, then rethrows. */
async function readGit(repository: string, args: readonly string[]): Promise<Buffer> {
  try {
    const invocation = await $`git -C ${repository} ${args}`.quiet();
    return invocation.stdout;
  } catch (error) {
    throw new Error(
      'cannot read initial-access Git inventory in ' + repository + ': ' + args.join(' '),
      { cause: error },
    );
  }
}

/** Decodes NUL-framed Git plumbing records, refusing unsupported release-tree entries. */
function readEntries(output: string): readonly GitEntry[] {
  if (output === '') return [];
  if (!output.endsWith('\0')) throw new Error('initial-access inventory is not NUL-framed');
  return output
    .slice(0, -1)
    .split('\0')
    .map((entry) => {
      const match = /^([0-7]{6}) (blob|tree|commit) ([0-9a-f]{40})\t([^\0\r\n]+)$/.exec(entry);
      if (match === null) throw new Error('malformed initial-access Git inventory entry');
      return { mode: match[1], kind: match[2], objectId: match[3], path: match[4] };
    });
}

/**
 * Reads one immutable release inventory from its source repository, independent of the
 * exported deployer's location. Throws for unsupported layout, revision or SQL blob mode.
 * No database, application module or candidate program is opened or executed.
 */
export async function readInitialAccessMigrations(
  repository: string,
  revision: string,
): Promise<readonly { readonly name: string; readonly sha256: string }[]> {
  if (!/^[0-9a-f]{40}$/.test(revision)) {
    throw new Error('initial-access admission requires a complete immutable commit identity');
  }
  const resolved = (await readGit(repository, ['rev-parse', '--verify', revision + '^{commit}']))
    .toString('utf8')
    .trim();
  if (resolved !== revision) throw new Error('initial-access revision is not the selected commit');
  const roots: GitEntry[] = [];
  for (const path of MIGRATION_ROOTS) {
    const entries = readEntries(
      (await readGit(repository, ['ls-tree', '-z', revision, '--', path])).toString('utf8'),
    );
    if (entries.length === 0) continue;
    if (
      entries.length !== 1 ||
      entries[0].path !== path ||
      entries[0].kind !== 'tree' ||
      entries[0].mode !== '040000'
    ) {
      throw new Error('unsupported initial-access migration root: ' + path);
    }
    roots.push(entries[0]);
  }
  if (roots.length !== 1)
    throw new Error('initial-access inventory requires exactly one supported migration root');
  const root = roots[0];
  const folders = readEntries(
    (await readGit(repository, ['ls-tree', '-z', root.objectId])).toString('utf8'),
  );
  if (folders.length === 0) throw new Error('initial-access migration inventory is empty');
  const migrations: { name: string; sha256: string }[] = [];
  for (const folder of folders) {
    if (
      folder.kind !== 'tree' ||
      folder.mode !== '040000' ||
      !/^[0-9]+_[a-z0-9_]+$/.test(folder.path)
    ) {
      throw new Error('unsupported initial-access migration entry: ' + folder.path);
    }
    const entries = readEntries(
      (
        await readGit(repository, ['ls-tree', '-z', folder.objectId, '--', 'migration.sql'])
      ).toString('utf8'),
    );
    if (
      entries.length !== 1 ||
      entries[0].path !== 'migration.sql' ||
      entries[0].kind !== 'blob' ||
      entries[0].mode !== '100644'
    ) {
      throw new Error('unsupported initial-access migration SQL: ' + folder.path);
    }
    const blob = await readGit(repository, ['cat-file', 'blob', entries[0].objectId]);
    migrations.push({
      name: folder.path,
      sha256: new Bun.CryptoHasher('sha256').update(blob).digest('hex'),
    });
  }
  return migrations;
}

/**
 * Refuses source-only transitions containing either grant-policy migration. Inspect current
 * and target commits plus any recovery commit selected by the caller. Even an already
 * upgraded store has no positive permit here: source inventory does not prove live cutover.
 * Malformed/missing inventory throws; changed protected SQL never becomes absence.
 */
export async function assertInitialAccessSourceAllowed(
  repository: string,
  revisions: readonly string[],
): Promise<void> {
  if (revisions.length === 0) throw new Error('initial-access admission has no selected revisions');
  for (const revision of new Set(revisions)) {
    const migrations = await readInitialAccessMigrations(repository, revision);
    const protectedMigration = migrations.find((migration) =>
      PROTECTED_MIGRATIONS.has(migration.name),
    );
    if (protectedMigration !== undefined) {
      throw new Error(
        'initial-access source transition requires an attended cutover: ' +
          revision +
          ':' +
          protectedMigration.name +
          ':' +
          protectedMigration.sha256,
      );
    }
  }
}
