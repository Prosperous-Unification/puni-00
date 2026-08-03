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

export function assertMigrationFlag(newMigrations: boolean, withMigrations: boolean): void {
  if (!newMigrations) return;
  if (withMigrations) return;
  throw new Error(
    'this deploy contains new migrations.\n' +
      '  Blue and green share one database, so the migration must be backward-compatible\n' +
      '  with the release still serving traffic (add columns, never drop).\n' +
      '  Pass --with-migrations once you have confirmed that. There is no automated\n' +
      '  stop-the-world path — if this migration genuinely cannot be made backward-\n' +
      '  compatible, restructure it as an additive change, or take the app down manually\n' +
      '  (stop both colours, apply the migration by hand, bring one colour back up).',
  );
}

/**
 * `--stop-the-world` is parsed (see affected.ts) but not implemented: it used
 * to fall through to the exact same blue/green swap command a normal deploy
 * produces (see deploy.ts's per-tier command construction), so an operator
 * who reached for it BECAUSE a migration is too destructive for two colours
 * sharing one SQLite file got blue/green anyway — silently. A flag that
 * claims a safety property it doesn't have is worse than a flag that refuses
 * outright, so this rejects it unconditionally, before any tier is examined.
 */
export function assertStopTheWorldNotImplemented(stopTheWorld: boolean): void {
  if (!stopTheWorld) return;
  throw new Error(
    '--stop-the-world is not implemented.\n' +
      '  It would produce the exact same blue/green swap command as a normal deploy —\n' +
      '  selecting it does NOT avoid two colours briefly sharing one SQLite file.\n' +
      '  If a migration is too destructive to run backward-compatible under blue/green,\n' +
      '  instead either:\n' +
      '    - restructure it as an additive-only change (add columns, never drop) and\n' +
      '      deploy with --with-migrations, or\n' +
      '    - take the app down manually (stop both colours, apply the migration by hand,\n' +
      '      bring one colour back up) — this tool has no automated stop-the-world\n' +
      '      sequence yet.',
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
