/**
 * Blue and green share one SQLite file, so a destructive migration breaks the
 * still-live old colour. This gate turns that from a 3am surprise into a
 * deploy-time prompt.
 */
export function hasNewMigrations(deployed: string[] | null, head: string[]): boolean {
  if (deployed === null) return false;
  const known = new Set(deployed);
  return head.some((m) => !known.has(m));
}

export function assertMigrationFlag(
  newMigrations: boolean,
  withMigrations: boolean,
  stopTheWorld: boolean,
): void {
  if (!newMigrations) return;
  if (withMigrations || stopTheWorld) return;
  throw new Error(
    'this deploy contains new migrations.\n' +
      '  Blue and green share one database, so the migration must be backward-compatible\n' +
      '  with the release still serving traffic (add columns, never drop).\n' +
      '  Pass --with-migrations once you have confirmed that, or --stop-the-world for a\n' +
      '  plain restart with a brief outage.',
  );
}

const MIGRATIONS_DIR = 'apps/be-01/drizzle';

/**
 * Thin git plumbing boundary for `hasNewMigrations`: lists migration folder
 * names present in `apps/be-01/drizzle` at a given commit-ish. Kept separate
 * from the pure comparison above so that function stays trivially testable
 * without shelling out to git.
 */
export function migrationsAtSha(sha: string, dir: string = MIGRATIONS_DIR): string[] {
  const proc = Bun.spawnSync(['git', 'ls-tree', '-r', '--name-only', sha, '--', dir]);
  if (proc.exitCode !== 0) {
    throw new Error(`git ls-tree ${sha} -- ${dir} failed: ${proc.stderr.toString('utf8').trim()}`);
  }
  const ids = new Set<string>();
  const prefix = `${dir}/`;
  for (const raw of proc.stdout.toString('utf8').split('\n')) {
    const line = raw.trim();
    if (!line.startsWith(prefix)) continue;
    const rest = line.slice(prefix.length);
    const id = rest.split('/')[0];
    if (id) ids.add(id);
  }
  return [...ids].sort();
}
