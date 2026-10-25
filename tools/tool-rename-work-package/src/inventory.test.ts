import { describe, expect, it } from 'bun:test';

import { formatInventory, routeInventory, schemaInventory } from './inventory';

describe('the inventory', () => {
  it('counts the schema objects that name the old word', () => {
    const rows = schemaInventory([
      'CREATE TABLE project (id text PRIMARY KEY);\n--> statement-breakpoint\nCREATE TABLE step (id text, project_id text);',
      'CREATE INDEX step_project ON step (project_id);\n--> statement-breakpoint\nCREATE TRIGGER step_guard BEFORE INSERT ON step BEGIN SELECT id FROM project; END;',
    ]);
    expect(Object.fromEntries(rows.map(({ surface, count }) => [surface, count]))).toEqual({
      'tables named project': 1,
      'columns named project': 1,
      'project_id columns': 1,
      'indexes named project': 1,
      'automatic indexes of project tables': 1,
      'indexes whose definition names project': 0,
      'triggers named project': 0,
      'triggers whose body names project': 1,
    });
  });

  it('counts routes and operationIds', () => {
    const rows = routeInventory({
      paths: {
        '/api/projects/{id}': { get: { operationId: 'getProject' } },
        '/api/organization/project-rank': { get: { operationId: 'getProjectRank' } },
        '/health': { get: { operationId: 'getHealth' } },
      },
    });
    expect(rows.map(({ count }) => count)).toEqual([1, 2, 2]);
  });

  it('refuses an operationId that is not a string', () => {
    expect(() => routeInventory({ paths: { '/x': { get: { operationId: 1 } } } })).toThrow(
      'operationId is not a string',
    );
  });

  it('prints a Markdown table', () => {
    expect(formatInventory([{ surface: 'tables named project', count: 9 }])).toBe(
      '| Surface              | Count |\n| -------------------- | ----: |\n| tables named project |     9 |\n',
    );
  });
});
