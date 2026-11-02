import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';

/** be-01's migration folders, relative to the repo root. */
export const MIGRATIONS_DIR = 'apps/wbs/be-01/drizzle';

/** The OpenAPI emitter whose document the route counts are read from. */
export const OPENAPI_EMITTER = 'apps/wbs/be-01/src/openapi/emit-openapi-cli.ts';

/** One row of the rename inventory `report` prints. */
export interface InventoryRow {
  readonly surface: string;
  readonly count: number;
}

/**
 * The live schema's old-word objects: `migrations` applied in order to an in-memory SQLite,
 * each split on drizzle's `--> statement-breakpoint`.
 *
 * @throws when a migration does not apply: the inventory is of the schema as it migrates.
 */
export function schemaInventory(migrations: readonly string[]): InventoryRow[] {
  const db = new Database(':memory:');
  try {
    for (const migration of migrations) {
      for (const statement of migration.split('--> statement-breakpoint')) {
        if (statement.trim() !== '') db.run(statement);
      }
    }
    const objects = db
      .query<{ type: string; name: string; sql: string | null }, []>(
        'SELECT type, name, sql FROM sqlite_master',
      )
      .all();
    const named = (type: string): number =>
      objects.filter(
        (each) =>
          each.type === type && !each.name.startsWith('sqlite_') && each.name.includes('project'),
      ).length;
    const columns = objects
      .filter((each) => each.type === 'table')
      .flatMap((table) =>
        db
          .query<{ name: string }, []>(`SELECT name FROM pragma_table_info('${table.name}')`)
          .all()
          .filter((column) => column.name.includes('project')),
      );
    return [
      { surface: 'tables named project', count: named('table') },
      { surface: 'columns named project', count: columns.length },
      {
        surface: 'project_id columns',
        count: columns.filter((c) => c.name === 'project_id').length,
      },
      { surface: 'indexes named project', count: named('index') },
      {
        surface: 'automatic indexes of project tables',
        count: objects.filter(
          (each) => each.name.startsWith('sqlite_autoindex_') && each.name.includes('project'),
        ).length,
      },
      {
        surface: 'indexes whose definition names project',
        count: objects.filter(
          (each) =>
            each.type === 'index' &&
            !each.name.includes('project') &&
            (each.sql ?? '').includes('project'),
        ).length,
      },
      { surface: 'triggers named project', count: named('trigger') },
      {
        surface: 'triggers whose body names project',
        count: objects.filter(
          (each) => each.type === 'trigger' && (each.sql ?? '').includes('project'),
        ).length,
      },
    ];
  } finally {
    db.close();
  }
}

/** The OpenAPI document's shape as far as the inventory reads it. */
export interface RouteDocument {
  readonly paths: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

/**
 * Paths with a `projects` segment, paths naming the old word in any segment, and operationIds
 * containing `Project`.
 *
 * @throws when an operation's `operationId` is present but not a string.
 */
export function routeInventory(document: RouteDocument): InventoryRow[] {
  const paths = Object.keys(document.paths);
  const operationIds = Object.values(document.paths).flatMap((operations) =>
    Object.values(operations).flatMap((operation) => {
      if (typeof operation !== 'object' || operation === null || !('operationId' in operation)) {
        return [];
      }
      const { operationId } = operation;
      if (typeof operationId !== 'string') throw new Error('operationId is not a string');
      return [operationId];
    }),
  );
  return [
    {
      surface: 'paths with a projects segment',
      count: paths.filter((path) => path.split('/').includes('projects')).length,
    },
    {
      surface: 'paths naming project in a segment',
      count: paths.filter((path) => path.includes('project')).length,
    },
    {
      surface: 'operationIds containing Project',
      count: operationIds.filter((id) => id.includes('Project')).length,
    },
  ];
}

/** Every `migration.sql` under `root`'s {@link MIGRATIONS_DIR}, in folder order. */
export function readMigrations(root: string): string[] {
  const directory = join(root, MIGRATIONS_DIR);
  return readdirSync(directory)
    .sort()
    .map((folder) => readFileSync(join(directory, folder, 'migration.sql'), 'utf8'));
}

/**
 * The document {@link OPENAPI_EMITTER} writes, run as its own process so this infra tool never
 * imports product code.
 *
 * @throws when the emitter exits non-zero or prints something other than a paths object.
 */
export function emitRouteDocument(root: string): RouteDocument {
  const run = Bun.spawnSync(['bun', OPENAPI_EMITTER], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (run.exitCode !== 0) {
    throw new Error(`${OPENAPI_EMITTER} exited ${String(run.exitCode)}: ${run.stderr.toString()}`);
  }
  const parsed: unknown = JSON.parse(run.stdout.toString());
  if (!isRouteDocument(parsed)) throw new Error(`${OPENAPI_EMITTER} printed no paths object`);
  return parsed;
}

function isRouteDocument(value: unknown): value is RouteDocument {
  if (typeof value !== 'object' || value === null || !('paths' in value)) return false;
  const { paths } = value;
  return (
    typeof paths === 'object' &&
    paths !== null &&
    Object.values(paths).every(
      (operations) => typeof operations === 'object' && operations !== null,
    )
  );
}

/** The inventory as a Markdown table. */
export function formatInventory(rows: readonly InventoryRow[]): string {
  const width = Math.max(...rows.map((row) => row.surface.length), 'Surface'.length);
  const lines = [
    `| ${'Surface'.padEnd(width)} | Count |`,
    `| ${'-'.repeat(width)} | ----: |`,
    ...rows.map((row) => `| ${row.surface.padEnd(width)} | ${String(row.count).padStart(5)} |`),
  ];
  return `${lines.join('\n')}\n`;
}
