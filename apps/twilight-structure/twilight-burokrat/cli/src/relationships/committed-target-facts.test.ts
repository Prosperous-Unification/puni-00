import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterAll, describe, expect, test } from 'bun:test';

import { extractNxRelationships } from './nx';

const repositoryRoot = resolve(import.meta.dir, '../../../../../..');
const DECLARATIONS = [
  'docs/wiki-policy/relationships.json',
  'docs/wiki-policy/relationships.bootstrap.json',
];
const pathsToRemove: string[] = [];

afterAll(() => {
  for (const path of pathsToRemove) rmSync(path, { recursive: true });
});

interface NxTargetFact {
  readonly factId: string;
  readonly project: string;
  readonly target: string;
  readonly expectedConfiguration: unknown;
}

function currentNxTargetFacts(path: string): NxTargetFact[] {
  // Test boundary: the declaration's shape is validated by this package's own contracts; this
  // suite reads only the fields it compares.
  const declaration = JSON.parse(readFileSync(join(repositoryRoot, path), 'utf8')) as {
    facts: (NxTargetFact & { kind: string; at: { kind: string } })[];
  };
  return declaration.facts.filter(
    (fact) => fact.kind === 'nx-target' && fact.at.kind === 'current',
  );
}

/**
 * The working tree's Nx declarations alone, as a candidate checkout would hold them: `nx.json` and
 * every tracked `project.json`. Build output is left behind on purpose, because `dist/` repeats
 * project files and the extractor refuses a duplicate project name.
 */
function declaredWorkspace(): string {
  const listing = Bun.spawnSync(
    ['git', '-C', repositoryRoot, 'ls-files', '-z', '--', 'nx.json', '*project.json'],
    {
      stderr: 'pipe',
      stdout: 'pipe',
    },
  );
  if (listing.exitCode !== 0) throw new Error(`git ls-files failed: ${listing.stderr.toString()}`);
  const workspace = mkdtempSync(join(tmpdir(), 'wiki-target-facts-'));
  pathsToRemove.push(workspace);
  for (const path of listing.stdout.toString().split('\0')) {
    if (path === '') continue;
    mkdirSync(dirname(join(workspace, path)), { recursive: true });
    cpSync(join(repositoryRoot, path), join(workspace, path));
  }
  return workspace;
}

/**
 * A current `nx-target` fact is an authority selector over a target **as this package's static
 * extractor reads it**, not as Nx resolves it. The two differ by design: the extractor merges a
 * target default shallowly, so a target with its own `options` never shows a default's
 * `options.env`, while Nx merges options key by key. Admission refuses with `authority-selector
 * mismatch` when a fact and the extractor disagree; this suite says so in a second instead of
 * leaving it to the pilot's forty-second candidate run.
 */
describe('current nx-target facts in the committed relationship declarations', () => {
  const targets = extractNxRelationships(declaredWorkspace()).relationships.targets;

  for (const path of DECLARATIONS) {
    test(`${path} matches what the static extractor reads`, () => {
      const facts = currentNxTargetFacts(path);
      expect(facts.length).toBeGreaterThan(0);
      // Proof: giving `check.core.test` the `options.env` block that `nx show project` reports
      // (nx.json's `test` default carries one) failed this case for both declarations on the four
      // `env` lines the extractor does not read (`Expected - 0, Received + 4`). The same fault
      // had passed a comparison against Nx's own resolution and then failed the host gate in
      // pilot-policy.test.ts (2026-09-20).
      for (const fact of facts) {
        const live = targets.find(
          (target) => target.project === fact.project && target.target === fact.target,
        );
        expect({ factId: fact.factId, configuration: fact.expectedConfiguration }).toEqual({
          factId: fact.factId,
          configuration: live?.configuration,
        });
      }
    });
  }
});
