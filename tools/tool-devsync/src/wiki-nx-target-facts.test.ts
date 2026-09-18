import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

const WORKSPACE = join(import.meta.dir, '../../..');
const DECLARATIONS = [
  'docs/wiki-policy/relationships.json',
  'docs/wiki-policy/relationships.bootstrap.json',
];

interface NxTargetFact {
  readonly factId: string;
  readonly kind: 'nx-target';
  readonly at: { readonly kind: string };
  readonly project: string;
  readonly target: string;
  readonly expectedConfiguration: unknown;
}

function currentNxTargetFacts(path: string): NxTargetFact[] {
  // Test boundary: the committed declaration shape is validated by the wiki CLI's own contracts;
  // this suite reads only the four fields it compares.
  const declaration = JSON.parse(readFileSync(join(WORKSPACE, path), 'utf8')) as {
    facts: { kind: string; at: { kind: string } }[];
  };
  return declaration.facts.filter(
    (fact): fact is NxTargetFact & typeof fact =>
      fact.kind === 'nx-target' && fact.at.kind === 'current',
  );
}

const resolvedProjects = new Map<string, Record<string, unknown>>();

/** The target as Nx itself resolves it, read once per project. Throws when Nx cannot answer. */
function resolvedTarget(project: string, target: string): unknown {
  let targets = resolvedProjects.get(project);
  if (targets === undefined) {
    const invocation = Bun.spawnSync(['bunx', 'nx', 'show', 'project', project, '--json'], {
      cwd: WORKSPACE,
      env: { ...process.env, NX_DAEMON: 'false' },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (invocation.exitCode !== 0) {
      throw new Error(`nx show project ${project} failed: ${invocation.stderr.toString()}`);
    }
    // Test boundary: `nx show project --json` prints one project configuration object.
    const configuration = JSON.parse(invocation.stdout.toString()) as {
      targets: Record<string, unknown>;
    };
    targets = configuration.targets;
    resolvedProjects.set(project, targets);
  }
  return targets[target];
}

/**
 * A current `nx-target` fact is an authority selector over a live Nx target: the wiki classifier
 * refuses admission with `authority-selector mismatch` the moment the target moves and the
 * declaration does not. This suite surfaces that drift in the ordinary gate instead.
 */
describe('current nx-target facts in the wiki relationship declarations', () => {
  for (const path of DECLARATIONS) {
    it(`${path} matches the Nx-resolved targets`, () => {
      const facts = currentNxTargetFacts(path);
      expect(facts.length).toBeGreaterThan(0);
      // Proof: restoring relationships.json's pre-P5 `check.wiki-cli.test` (one
      // --path-ignore-patterns, eight inputs) failed this case with the Nx-resolved command and
      // the two added inputs as the received value (2026-09-18).
      for (const fact of facts) {
        expect({ factId: fact.factId, configuration: fact.expectedConfiguration }).toEqual({
          factId: fact.factId,
          configuration: resolvedTarget(fact.project, fact.target),
        });
      }
    }, 120_000);
  }
});
