import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from 'bun:test';

test('fast-forward visits conditional design before tasks and leaves verification for after work', () => {
  const schema = Bun.YAML.parse(
    readFileSync(
      resolve(import.meta.dir, '../../../openspec/schemas/twilight-v1/schema.yaml'),
      'utf8',
    ),
  ) as {
    artifacts: { id: string; requires: string[]; instruction: string }[];
    apply: { requires: string[] };
  };
  const visited: string[] = [];
  function visit(id: string) {
    if (visited.includes(id)) return;
    const artifact = schema.artifacts.find((entry) => entry.id === id);
    if (!artifact) throw new Error(`Unknown artifact: ${id}`);
    artifact.requires.forEach(visit);
    visited.push(id);
  }
  schema.apply.requires.forEach(visit);
  expect(visited).toEqual(['intent', 'specs', 'design', 'tasks']);
  expect(schema.apply.requires).toEqual(['intent', 'specs', 'tasks']);
});
