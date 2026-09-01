import { readdir, readFile } from 'node:fs/promises';

import { describe, expect, it } from 'bun:test';

/**
 * `tsc -p` on a solution-style config compiles **nothing**.
 *
 * A solution config carries `"files": []`, `"include": []` and a `references`
 * list. `tsc --build` follows those references; `tsc --noEmit -p` does not — it
 * loads the zero files the config names and exits 0. A target written that way
 * is a check that cannot fail, which is the fault CLAUDE.md's ledger records as
 * having shipped three times: be-01 and fe-01 (2026-08-06), gw-01 (2026-08-09),
 * and every `libs/*` and `tools/*` project until 2026-09-02, when this test was
 * written. On that day 18 of 23 targets compiled nothing, and `swap.ts` — 1,033
 * lines that swap production — was typechecked by nothing at all.
 *
 * This walks the projects rather than trusting a list, in the shape of
 * `RESTART_PATHS coverage` below: a project added with the wrong form fails
 * here rather than reporting green over code no compiler has read.
 *
 * Proof: with `tools/tool-remote-scripts/project.json` put back to
 * `bunx tsc --noEmit -p tools/tool-remote-scripts/tsconfig.json`, watched
 * failing on `Expected value to be empty · Received: [ "tool-remote-scripts" ]`
 * (2026-09-02).
 * The same fault was watched through the target itself: with
 * `const deliberatelyWrong: number = 'not a number'` appended to `swap.ts`,
 * the old command exited 0 in 0.156s and the new one failed on
 * `swap.ts(1035,7): error TS2322`.
 */
const WORKSPACE = new URL('../../../', import.meta.url);

interface ProjectTarget {
  options?: { command?: string; commands?: string[] };
}

interface ProjectConfig {
  name?: string;
  targets?: Record<string, ProjectTarget>;
}

/** Every `<group>/<project>/project.json` on disk, read as JSON. */
async function projectsOnDisk(): Promise<{ dir: string; config: ProjectConfig }[]> {
  const found: { dir: string; config: ProjectConfig }[] = [];
  for (const group of ['apps', 'libs', 'tools']) {
    const entries = await readdir(new URL(`${group}/`, WORKSPACE), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = `${group}/${entry.name}`;
      const path = new URL(`${dir}/project.json`, WORKSPACE);
      let raw: string;
      try {
        raw = await readFile(path, 'utf8');
      } catch {
        // Not every directory under these three is an Nx project; one that
        // declares no `project.json` declares no targets to get wrong.
        continue;
      }
      found.push({ dir, config: JSON.parse(raw) as ProjectConfig });
    }
  }
  return found;
}

/** The shell commands a target runs, whether it spells one or several. */
function commandsOf(target: ProjectTarget): string[] {
  return [
    ...(target.options?.command === undefined ? [] : [target.options.command]),
    ...(target.options?.commands ?? []),
  ];
}

describe('every typecheck target compiles files', () => {
  it('finds a project.json for every project', async () => {
    const projects = await projectsOnDisk();
    expect(projects.length).toBeGreaterThan(20);
  });

  it('never runs `tsc -p` against a solution-style config', async () => {
    const offenders: string[] = [];
    for (const { dir, config } of await projectsOnDisk()) {
      const target = config.targets?.['typecheck'];
      if (target === undefined) continue;
      for (const command of commandsOf(target)) {
        const project = /tsc\s[^&|]*?--noEmit[^&|]*?-p\s+(\S+)/.exec(command)?.[1];
        if (project === undefined) continue;
        const raw = await readFile(new URL(project, WORKSPACE), 'utf8');
        // A solution config names no files of its own and delegates to
        // references; `-p` reads the former and ignores the latter.
        const compilesNothing =
          /"files"\s*:\s*\[\s*\]/.test(raw) && /"include"\s*:\s*\[\s*\]/.test(raw);
        if (compilesNothing) offenders.push(config.name ?? dir);
      }
    }
    expect(offenders).toBeEmpty();
  });

  it('gives every project a typecheck target', async () => {
    const missing = (await projectsOnDisk())
      .filter(({ config }) => config.targets?.['typecheck'] === undefined)
      .map(({ dir }) => dir);
    expect(missing).toBeEmpty();
  });
});
