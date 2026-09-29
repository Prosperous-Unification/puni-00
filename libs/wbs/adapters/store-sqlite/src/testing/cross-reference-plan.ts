import { openDatabase, openDrizzle } from '../db';
import { OPEN } from '../gate';
import { ProjectRepository } from '../project';

/**
 * The full-table scans `ProjectRepository.findCrossReferences` would run over
 * `work_item` or `dependency` in the database at `path`, read from SQLite's
 * `EXPLAIN QUERY PLAN` for the statement the repository actually issues.
 *
 * Every alias the arms give either table is checked. A covering-index scan of
 * the small `project` table is not reported: the parent arm probes
 * `work_item_siblings` once per other project through it.
 */
export async function crossReferenceScans(path: string): Promise<string[]> {
  const queries: { sql: string; params: unknown[] }[] = [];
  const logged = new ProjectRepository(
    openDrizzle(path, { logQuery: (sql, params) => queries.push({ sql, params }) }),
    OPEN,
  );
  await logged.findCrossReferences('p', 'o');
  const query = queries.at(-1);
  if (query === undefined) throw new Error('findCrossReferences issued no statement');
  const raw = openDatabase(path);
  try {
    // Parameters arrive as drizzle logged them: the project and organization ids.
    const plan = raw
      .query<{ detail: string }, string[]>(`EXPLAIN QUERY PLAN ${query.sql}`)
      .all(...(query.params as string[]));
    if (plan.length === 0) throw new Error('EXPLAIN QUERY PLAN answered no step');
    return plan
      .map(({ detail }) => detail)
      .filter((detail) => /^SCAN (w|d|l|pre|suc|parent|work_item|dependency)\b/.test(detail));
  } finally {
    raw.close();
  }
}
