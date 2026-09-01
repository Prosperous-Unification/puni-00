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
  inputs?: (string | Record<string, unknown>)[];
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

/**
 * A cached target that reads a file Nx does not know about is a check that
 * cannot fail.
 *
 * Nx hashes a task from its declared `inputs`. The defaults cover the project's
 * own directory and its dependencies' — nothing else. A suite that reaches
 * outside, as nine of them do, replays from cache when the file it is about
 * changes, and reports green over a change no command read.
 *
 * The nine on 2026-09-02: five suites drive shell scripts under `bin/`, three
 * read shipped Caddy and Compose fragments under `deploy/`, and `libs/domain`'s
 * `every name it can answer is one the migration seeds` reads a be-01 migration
 * to prove the two lists are one fact — an anti-drift check whose own input was
 * invisible to the thing deciding whether to run it.
 *
 * This walks the suites rather than trusting a list. A path is covered when a
 * declared input matches it, or names something inside it when the read is a
 * directory.
 *
 * Proof: with `inputs` deleted from `tool-devsync`'s `test` target, watched
 * failing on `Expected value to be empty · Received: [ "tool-devsync:test does
 * not declare apps", "tool-devsync:test does not declare bin/dev-be-probe.sh",
 * …`; and with `libs/domain`'s deleted, on `Received: [ "domain:test does not
 * declare apps/be-01/drizzle/20260830020000_add_external_ref/migration.sql" ]`.
 *
 * The fault itself was watched through Nx the same day: with `tool-devsync`'s
 * declaration removed, an edit to `bin/dev-be-probe.sh` gave `nx run
 * tool-devsync:test  [existing outputs match the cache, left as is]`, and with
 * it restored the same edit ran the suite.
 */
const GROUPS = ['apps', 'libs', 'tools'];

/** Workspace-relative paths a `*.test.ts` reads from outside its own project. */
async function outsideReads(projectDir: string): Promise<string[]> {
  const found = new Set<string>();
  const glob = new Bun.Glob('src/**/*.test.ts');
  for await (const relative of glob.scan({ cwd: new URL(`${projectDir}/`, WORKSPACE).pathname })) {
    const source = await readFile(new URL(`${projectDir}/${relative}`, WORKSPACE), 'utf8');
    for (const [, up] of source.matchAll(/'((?:\.\.\/){3,}[A-Za-z0-9_./-]*)'/g)) {
      // Resolved against the file, then made workspace-relative. An empty
      // result is the workspace root itself or above it — a path being built,
      // not a file being read, and too broad to ask any target to declare.
      const resolved = new URL(up, new URL(`${projectDir}/${relative}`, WORKSPACE)).pathname;
      const root = WORKSPACE.pathname;
      if (!resolved.startsWith(root)) continue;
      const rel = resolved.slice(root.length).replace(/\/$/, '');
      if (rel === '' || rel.startsWith(`${projectDir}/`)) continue;
      found.add(rel);
    }
  }
  return [...found].sort();
}

describe('every cached target declares what it reads', () => {
  it('names every file a suite reads from outside its own project', async () => {
    const shared = (
      JSON.parse(await readFile(new URL('nx.json', WORKSPACE), 'utf8')) as {
        namedInputs?: Record<string, string[]>;
      }
    ).namedInputs?.['sharedGlobals'];
    expect(shared).toBeDefined();

    const undeclared: string[] = [];
    for (const group of GROUPS) {
      const entries = await readdir(new URL(`${group}/`, WORKSPACE), { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dir = `${group}/${entry.name}`;
        const reads = await outsideReads(dir);
        if (reads.length === 0) continue;
        let config: ProjectConfig;
        try {
          config = JSON.parse(
            await readFile(new URL(`${dir}/project.json`, WORKSPACE), 'utf8'),
          ) as ProjectConfig;
        } catch {
          continue;
        }
        const declared = [...(config.targets?.['test']?.inputs ?? []), ...(shared ?? [])]
          .filter(
            (each): each is string =>
              typeof each === 'string' && each.startsWith('{workspaceRoot}/'),
          )
          .map((each) => each.slice('{workspaceRoot}/'.length));
        for (const read of reads) {
          const covered = declared.some(
            (pattern) =>
              new Bun.Glob(pattern).match(read) ||
              // A directory read is covered by any declared input inside it:
              // that is what makes the directory's contents part of the hash.
              pattern.startsWith(`${read}/`),
          );
          if (!covered) undeclared.push(`${config.name ?? dir}:test does not declare ${read}`);
        }
      }
    }
    expect(undeclared).toBeEmpty();
  });
});
