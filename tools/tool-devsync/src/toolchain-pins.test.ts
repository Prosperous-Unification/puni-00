import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import { describe, expect, it } from 'bun:test';

/**
 * The version pins that can drift apart, held together by a test.
 *
 * Bun's version used to be typed in six places — the CI workflow twice, three
 * app Dockerfiles and the dev-src Dockerfile — and on 2026-09-06 they said
 * three different things: 1.3.14, 1.3.14 and 1.2.20, against a 1.4.0 on the
 * workspace box. Nothing read them side by side, so nothing could say so.
 * `.bun-version` is now the one source: `setup-bun` reads it through
 * `bun-version-file`, and the Dockerfiles, which cannot read a file, are held
 * to it here.
 *
 * Every file this suite reads from outside its own project is named in
 * `tool-devsync:test`'s `inputs`, and that is not bookkeeping: Nx caches the
 * target, and a read it does not know about is a change it cannot see.
 * Measured 2026-09-06: with `{workspaceRoot}/apps/*\/Dockerfile` declared, a
 * Dockerfile put back to 1.3.14 re-ran this suite and failed it; with that
 * line removed, the same edit answered `nx run tool-devsync:test [local
 * cache]` — green, having run nothing. `workspace-targets.test.ts` cannot see
 * these reads (it looks for `'../../../…'` literals), so the list is kept by hand.
 *
 * Proof: with `apps/wbs/be-01/Dockerfile`'s first stage put back to
 * `oven/bun:1.3.14-alpine`, `every Bun image tag equals .bun-version` failed
 * on `- []` / `+ [ "apps/wbs/be-01/Dockerfile: 1.3.14" ]` (2026-09-06). And with
 * `bun-version: 1.3.14` put back in place of `bun-version-file` in the
 * `pixels` job, `CI reads the file rather than a literal` failed on
 * `Expected: 0 · Received: 1`.
 */
const WORKSPACE = new URL('../../../', import.meta.url);

async function read(path: string): Promise<string> {
  return readFile(new URL(path, WORKSPACE), 'utf8');
}

/** Every Dockerfile that starts from a Bun image. Listed, so a new one is added here on the day it is written. */
const BUN_DOCKERFILES = [
  'apps/wbs/be-01/Dockerfile',
  'apps/wbs/gw-01/Dockerfile',
  'apps/wbs/fe-01/Dockerfile',
  'deploy/dev-src/Dockerfile',
] as const;

describe('the Bun version', () => {
  it('has one source, and it is a bare version', async () => {
    const pinned = (await read('.bun-version')).trim();
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('every Bun image tag equals .bun-version', async () => {
    const pinned = (await read('.bun-version')).trim();
    const drifted: string[] = [];
    for (const file of BUN_DOCKERFILES) {
      // The version alone: `1.4.2-alpine AS deps` and `1.4.2-debian` are both one pin.
      const tags = [...(await read(file)).matchAll(/^FROM oven\/bun:(\d+\.\d+\.\d+)/gm)].map(
        (m) => m[1],
      );
      // A Dockerfile with no Bun stage is a listing error, not a pass.
      expect(tags.length).toBeGreaterThan(0);
      for (const tag of tags) if (tag !== pinned) drifted.push(`${file}: ${tag}`);
    }
    expect(drifted).toEqual([]);
  });

  it('CI reads the file rather than a literal', async () => {
    const workflow = await read('.github/workflows/ci.yml');
    const literals = workflow.match(/^\s*bun-version:/gm) ?? [];
    expect(literals.length).toBe(0);
    const fromFile = workflow.match(/^\s*bun-version-file: \.bun-version$/gm) ?? [];
    // Both jobs set Bun up; one reading the file and one floating is the drift this exists to stop.
    expect(fromFile.length).toBe((workflow.match(/uses: oven-sh\/setup-bun@/g) ?? []).length);
  });

  it('CI and the heavy gate use the moved solver and image paths', async () => {
    const workflow = await read('.github/workflows/ci.yml');
    const gateSteps = await read('bin/h2puni-gate-steps.sh');
    const manifest = await read('tools/tool-devsync/project.json');

    // Proof: the legacy CI solver paths made this production-workflow oracle fail before its
    // first expected cache path; the heavy-gate companion also failed on its old Nx identity
    // (0 passed / 2 failed).
    expect(workflow).toContain(
      'cache-dependency-path: libs/wbs/adapters/solver-py/requirements.lock',
    );
    expect(workflow).toContain(
      'python3 -m pip install --require-hashes -r libs/wbs/adapters/solver-py/requirements.lock',
    );
    expect(workflow).toContain('bunx nx run wbs-be-01:solver-image-smoke');
    expect(gateSteps).toContain('bunx nx run wbs-be-01:solver-image-smoke');
    // Proof: on 2026-09-14, removing the recursive app-manifest glob and this
    // assertion, then warming the real target, let removing `product:wbs` from
    // apps/wbs/fe-01/project.json replay 1/1 from local cache and exit 0. With
    // the input restored, it reran and failed 176/2 in the product/layout guards.
    expect(manifest).toContain('"{workspaceRoot}/apps/**/project.json"');
    expect(manifest).toContain('"{workspaceRoot}/libs/**/project.json"');
    expect(manifest).toContain('"{workspaceRoot}/tools/**/project.json"');
    // Proof: on 2026-09-14, removing this Dockerfile input and assertion, then
    // warming the real target, let a 1.4.2 -> 0.0.0 backend Bun-tag mutation
    // replay 1/1 from local cache and exit 0. Restoring the input reran and
    // failed 177/1 on `apps/wbs/be-01/Dockerfile: 0.0.0`.
    expect(manifest).toContain('"{workspaceRoot}/apps/**/Dockerfile"');
  });
});

describe('namespace-sensitive ignore boundaries', () => {
  it('keeps the development entrypoint out of production image contexts', async () => {
    const dockerIgnore = (await read('.dockerignore')).split('\n');
    // Proof: the pre-move exclusion failed here with the received root file
    // containing only `apps/be-01/src/dev`; the moved entrypoint was absent.
    expect(dockerIgnore).toContain('apps/wbs/be-01/src/dev');
    expect(dockerIgnore).not.toContain('apps/be-01/src/dev');
  });

  it('keeps generated migration and solver artifacts out of formatting', async () => {
    const prettierIgnore = (await read('.prettierignore')).split('\n');
    expect(prettierIgnore).toContain('apps/wbs/be-01/drizzle/**/snapshot.json');
    // Proof: before these moved solver exclusions were added, the received
    // production ignore list ended after the migration snapshot and root/tool
    // exclusions, with neither build-output path present.
    expect(prettierIgnore).toContain('libs/wbs/adapters/solver-py/build/');
    expect(prettierIgnore).toContain('libs/wbs/adapters/solver-py/src/*.egg-info/');
  });

  it('keeps local solver build artifacts under the moved adapter root', async () => {
    const gitIgnore = (await read('.gitignore')).split('\n');
    // Proof: the pre-move file failed this assertion with only
    // `libs/solver-py/build/` and `libs/solver-py/src/*.egg-info/` received.
    expect(gitIgnore).toContain('libs/wbs/adapters/solver-py/build/');
    expect(gitIgnore).toContain('libs/wbs/adapters/solver-py/src/*.egg-info/');
    expect(gitIgnore).not.toContain('libs/solver-py/build/');
    expect(gitIgnore).not.toContain('libs/solver-py/src/*.egg-info/');
  });

  it('declares every root ignore file this cached guard reads', async () => {
    const manifest = await read('tools/tool-devsync/project.json');
    expect(manifest).toContain('"{workspaceRoot}/.dockerignore"');
    expect(manifest).toContain('"{workspaceRoot}/.gitignore"');
    expect(manifest).toContain('"{workspaceRoot}/.prettierignore"');
  });
});

/**
 * TypeScript wears two hats here, and each is pinned to its own major.
 *
 * `tsc` on the workspace path is TypeScript 7 — the native compiler, ten
 * times faster and the one every `typecheck` target runs. TypeScript 7 ships
 * no compiler API, and typescript-eslint needs one (`>=4.8.4 <6.1.0`), so the
 * package that answers `require('typescript')` is `@typescript/typescript6`,
 * installed under the `typescript` name; its only bin is `tsc6`, which is why
 * the two do not collide. The arrangement lives in `package.json`'s two
 * `npm:` aliases and nothing else says which role is which — a swap would
 * leave every typecheck target compiling with TS 6 and ESLint parsing with a
 * package that has no API, and both would still exit 0 on a clean tree.
 *
 * Proof: with no alias at all, both failed — `Expected: "6" · Received: "5"`
 * and `Received: "Version 5.9.3"`. With the two aliases swapped, both failed
 * again on `Expected: "6" · Received: "7"` and `Received: "Version 6.0.3"` —
 * the 6.0.3 being a transitive TypeScript that owned `.bin/tsc` once the
 * TS 7 package no longer did (2026-09-06).
 */
describe('the two TypeScripts', () => {
  const require = createRequire(import.meta.url);

  it('the typescript package is the TS 6 API build', () => {
    const { version } = require('typescript/package.json') as { version: string };
    expect(version.split('.')[0]).toBe('6');
  });

  it('tsc on the workspace path is TypeScript 7', () => {
    const tsc = new URL('node_modules/.bin/tsc', WORKSPACE).pathname;
    const { stdout, exitCode } = Bun.spawnSync([tsc, '--version']);
    expect(exitCode).toBe(0);
    expect(stdout.toString().trim()).toMatch(/^Version 7\./);
  });
});

/**
 * ESLint is told React's version rather than detecting it — see the
 * `settings.react.version` comment in `apps/wbs/eslint.product.mjs` for why — and a told
 * version can go stale. This is the line that says when it has.
 *
 * Proof: with the pin set to `18.3.1` against React 19.2.8 installed,
 * `the React version ESLint is told is the one installed` failed on
 * `Expected: "19.2.8" · Received: "18.3.1"` (2026-09-06).
 */
describe('the React version ESLint is told', () => {
  it('is the one installed', async () => {
    const config = await read('apps/wbs/eslint.product.mjs');
    const told = /settings: \{ react: \{ version: '([^']+)' \} \}/.exec(config)?.[1];
    const require = createRequire(import.meta.url);
    const { version } = require('react/package.json') as { version: string };
    expect(told).toBe(version);
  });
});

interface WorkflowStep {
  if?: string;
  name?: string;
  id?: string;
  env?: Record<string, string>;
  run?: string;
  uses?: string;
  with?: { 'fetch-depth'?: number };
}

interface CiJob {
  if?: string;
  needs?: string | string[];
  steps?: WorkflowStep[];
}

/**
 * `jobs` names the gate jobs rather than being a `Record`, for the reason
 * `corpus-lint-workflow.test.ts` gives: an index signature types every lookup as
 * present and `no-unnecessary-condition` then rejects the `?.` a missing job needs.
 */
interface CiWorkflow {
  jobs?: { gate_mode?: CiJob; gate_docs?: CiJob; gate_workspace?: CiJob; gate_twilight?: CiJob };
}

type GateJob = keyof NonNullable<CiWorkflow['jobs']>;

async function readCiWorkflow(): Promise<CiWorkflow> {
  return Bun.YAML.parse(await read('.github/workflows/ci.yml')) as CiWorkflow;
}

function gateStep(workflow: CiWorkflow, job: GateJob, name: string): WorkflowStep {
  const step = workflow.jobs?.[job]?.steps?.find((candidate) => candidate.name === name);
  expect(step, `the ${job} job has no \`${name}\` step`).toBeDefined();
  return step ?? {};
}

/**
 * `on` is the one key YAML 1.1 reads as a boolean, so `workflow.on` is undefined and a
 * suite that read it would pass by checking nothing — see `corpus-lint-workflow.test.ts`.
 */
function subscribedEvents(workflow: CiWorkflow): string[] {
  const record = workflow as unknown as Record<string, unknown>;
  // Bracketed because both come from an index signature (TS4111), not style.
  const block = (record['on'] ?? record['true']) as Record<string, unknown> | undefined;
  expect(block, 'the workflow has no `on:` block under either key').toBeDefined();
  return Object.keys(block ?? {});
}

/**
 * The event labels of the OUTER `case` in a script, `*` included, one per alternative.
 *
 * The class deliberately excludes the space that used to be in it. With ` ` inside,
 * `^ {2}` consumed two spaces of a SIX-space nested arm and the class ate the other four,
 * so the inner `case "$tool_wiki_status"`'s own `*)` was harvested as an outer event: the
 * real script yielded `["pull_request", "*", "push", "merge_group", "workflow_dispatch",
 * "*"]` and `toContain('*')` passed with the outer refusal arm deleted. Alternatives are
 * matched as an explicit ` | ` list instead, which only the outer arms are written as.
 */
function caseArmEvents(script: string): string[] {
  return [...script.matchAll(/^ {2}([a-z_]+(?: \| [a-z_]+)*|\*)\)$/gm)].flatMap((match) =>
    match[1].split('|').map((event) => event.trim()),
  );
}

/**
 * A script with every run of whitespace collapsed to one space.
 *
 * A refusal is two lines — say what happened, then stop — and a `toContain` on either line
 * alone pins neither. `exit 1` in particular appears more than once in this script now, so
 * asserting it bare is an assertion that cannot fail; asserting the pair as one normalised
 * string is what makes deleting the `exit` visible.
 *
 * Always applied to `commandsOf(...)`, never to the raw script: a `Proof:` comment beside a
 * pinned arm quotes the literal the pin asserts, and on 2026-09-16 the pixels twin was
 * watched passing on its own comment after one reflow with the arm's `exit 1` deleted.
 */
function oneLine(script: string): string {
  return script.replace(/\s+/g, ' ');
}

/**
 * A shell script's commands, with its WHOLE-LINE comments dropped — a line whose first
 * non-space character is `#` — so counting commands counts commands. A trailing comment on a
 * command line survives, so the guarantee is "a standalone comment cannot satisfy a pin",
 * not "no comment can".
 */
function commandsOf(script: string): string {
  return script
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/**
 * The gate's scope, which is chosen from the event and never inferred.
 *
 * The header of `ci.yml` used to say "deliberately run-many, not affected", and the
 * reason it gave is still the right one: `nx affected` with a wrong or missing base is a
 * gate that silently narrows. What changed is where the base comes from — the pull
 * request's own immutable payload SHA, refused when empty — and that `merge_group` and
 * `push` keep the full run, so nothing narrows for `main`. This suite is what holds the
 * workflow to that, because a scope that moves without saying so is the whole hazard.
 */
describe('the CI gate scope', () => {
  it('maps every subscribed event and refuses one it has no rule for', async () => {
    // Proofs re-observed 2026-09-16 on the shipped tree, because the first pair of them was
    // written before the nested `case "$tool_wiki_status"` existed and stopped reproducing
    // when it landed — see `caseArmEvents` above:
    //
    // 1. Whole `*)` arm deleted from `Gate mode`: fails on the star assertion below with
    //    `Expected: ["*"] · Received: []` — 16 passed / 1 failed. It could not fail before:
    //    the old extractor harvested the nested `case "$tool_wiki_status"`'s `*)` too, so
    //    `arms` was `["pull_request", "*", "push", "merge_group", "workflow_dispatch", "*"]`
    //    and a `toContain('*')` passed with this arm gone.
    // 2. Only the arm's `exit 1` deleted, leaving the message — the log-and-continue shape
    //    AGENTS.md forbids: fails on `Expected to contain: "printf 'no gate mode for event
    //    %s\\n' \"$EVENT_NAME\" >&2 exit 1"` — 16 passed / 1 failed. Before this fix that
    //    fault left every case green, because the `type == "array"` guard in the same script
    //    supplies a second `exit 1` for a bare `toContain('exit 1')` to find.
    //
    // The set equality is the other half: adding a trigger to `on:` without a case arm
    // fails on the two sets rather than choosing a scope by accident.
    const workflow = await readCiWorkflow();
    const script = gateStep(workflow, 'gate_mode', 'Gate mode').run ?? '';
    const arms = caseArmEvents(script);

    // Exactly one `*`, sorted rather than positional — the `on:` key order is not the arm
    // order and neither is a contract.
    expect(arms.filter((event) => event === '*')).toEqual(['*']);
    expect(arms.filter((event) => event !== '*').sort()).toEqual(subscribedEvents(workflow).sort());
    expect(oneLine(commandsOf(script))).toContain(
      `printf 'no gate mode for event %s\\n' "$EVENT_NAME" >&2 exit 1`,
    );
  });

  it('takes the pull-request boundary from the validated synthetic merge plan', async () => {
    const step = gateStep(await readCiWorkflow(), 'gate_mode', 'Gate mode');
    expect(step.env).toEqual({
      EVENT_NAME: '${{ github.event_name }}',
      PR_HEAD_SHA: '${{ github.event.pull_request.head.sha }}',
      PR_NUMBER: '${{ github.event.pull_request.number }}',
    });
    const commands = oneLine(commandsOf(step.run ?? ''));
    expect(commands).toContain(
      'pull_request) base="$(bun run tools/tool-git-hooks/src/hooks/pr-merge-base.ts)" bun run tools/tool-git-hooks/src/hooks/ci-plan.ts "$base" "$GITHUB_SHA" . > ci-selection.json',
    );
    expect(commands).toContain(
      'push | merge_group | workflow_dispatch) printf \'mode=full\\n\' >> "$GITHUB_OUTPUT" printf \'twilight=run\\n\' >> "$GITHUB_OUTPUT"',
    );
    expect(commands).not.toContain('grep');
  });

  it('runs validated PR projects and keeps the unchanged full workspace command', async () => {
    const step = gateStep(
      await readCiWorkflow(),
      'gate_workspace',
      'Gate — test, lint, typecheck, build',
    );
    expect(step.env).toEqual({
      GATE_MODE: '${{ needs.gate_mode.outputs.mode }}',
      GATE_BASE: '${{ needs.gate_mode.outputs.base }}',
      EVENT_NAME: '${{ github.event_name }}',
      PR_HEAD_SHA: '${{ github.event.pull_request.head.sha }}',
      PR_NUMBER: '${{ github.event.pull_request.number }}',
    });
    const commands = oneLine(commandsOf(step.run ?? ''));
    expect(commands).toContain(
      'if [ "$GATE_MODE" = affected ]; then bun run tools/tool-git-hooks/src/hooks/ci-run-runtime.ts workspace "$GATE_BASE" "$GITHUB_SHA" .',
    );
    expect(commands).toContain(
      'else bunx nx run-many -t test lint typecheck build --parallel=2 --output-style=stream \\ --exclude=twilight-burokrat,twilight-dash > nx-gate.log 2>&1',
    );
    expect(occurrences(commands, '--exclude=twilight-burokrat,twilight-dash')).toBe(1);
  });

  it('runs the h2puni gate with the same Twilight split as CI', async () => {
    // The host gate mirrors the two CI shards in one script: the workspace without the Twilight
    // suite, then both Twilight projects' targets and their uncached lint.
    // Proof (2026-10-12): with `,twilight-dash` dropped from bin/h2puni-gate-steps.sh's
    // exclusion this failed on `Expected: 1 · Received: 0`.
    const steps = oneLine(commandsOf(await read('bin/h2puni-gate-steps.sh')));

    expect(
      occurrences(
        steps,
        'bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache \\ ' +
          '--exclude=twilight-burokrat,twilight-dash',
      ),
    ).toBe(1);
    expect(steps).toContain(
      'bunx nx run-many -t test typecheck build -p twilight-burokrat,twilight-dash --parallel=2',
    );
    expect(steps).toContain('bunx nx run twilight-burokrat:lint:source --skip-nx-cache');
    expect(steps).toContain('bunx nx run twilight-dash:lint --skip-nx-cache');
  });

  it('keeps selected Twilight runtime checks separate from the full suite', async () => {
    const workflow = await readCiWorkflow();
    const twilight = workflow.jobs?.gate_twilight;
    const targets = commandsOf(
      gateStep(workflow, 'gate_twilight', 'Twilight — test, typecheck, build, lint').run ?? '',
    );
    expect(twilight?.needs).toBe('gate_mode');
    expect(twilight?.if).toBe("${{ needs.gate_mode.outputs.twilight == 'run' }}");
    expect(oneLine(targets)).toContain(
      'if [ "$GATE_MODE" = affected ]; then bun run tools/tool-git-hooks/src/hooks/ci-run-runtime.ts twilight "$GATE_BASE" "$GITHUB_SHA" .',
    );
    expect(targets).toContain(
      'bunx nx run-many -t test typecheck build -p twilight-burokrat,twilight-dash \\',
    );
    expect(targets).toContain(
      'bunx nx run twilight-burokrat:lint:source --skip-nx-cache --output-style=stream',
    );
    expect(targets).toContain(
      'bunx nx run twilight-dash:lint --skip-nx-cache --output-style=stream',
    );
  });

  it('runs Burokrat packaging only for full gates or exact project membership', async () => {
    const workflow = await readCiWorkflow();
    for (const name of [
      'Provision bubblewrap for the packed package suite',
      'Twilight Burokrat packed package suite',
    ]) {
      const step = gateStep(workflow, 'gate_twilight', name);
      expect(step.if).toBe(
        "${{ needs.gate_mode.outputs.mode == 'full' || contains(fromJSON(needs.gate_mode.outputs.projects), 'twilight-burokrat') }}",
      );
    }
  });

  it('checks every gate job out at full depth, which --base cannot resolve without', async () => {
    const workflow = await readCiWorkflow();
    for (const job of ['gate_mode', 'gate_docs', 'gate_workspace', 'gate_twilight'] as const) {
      const checkout = workflow.jobs?.[job]?.steps?.find(({ uses }) =>
        uses?.startsWith('actions/checkout@'),
      );

      expect(checkout, `the ${job} job has no checkout step`).toBeDefined();
      expect(checkout?.with?.['fetch-depth']).toBe(0);
    }
  });
});

/**
 * The three owner-maintained libraries are pinned exactly, because their report formats are
 * stored data: the diagnostic format changed twice in two days in September 2026.
 *
 * The second test reads lock KEYS and the version each key resolves, which is what the
 * lockfile can say. That the copies a duplicate would produce are actually one module at
 * runtime is a different claim, proved by the resolution probe in the task's verification.
 */
// Proof (2026-09-26): reverting the manifest's di-bag pin to 0.5.0 failed the exact-pin test
// with expected 0.5.1 and received 0.5.0; changing this expectation to 0.5.0 made it pass.
const OWNER_PACKAGES = {
  'di-bag': '0.5.1',
  'application-exception': '0.7.0',
  'caught-object-report-json': '13.0.0',
} as const;

// Proof: `"di-bag": "^0.4.0"` failed `are pinned to exact versions in the root manifest` on the
// expected map. Installing application-exception 0.4.0, which needs the report library at ^10,
// put an `application-exception/caught-object-report-json` key at 10.0.0 in bun.lock and failed
// `resolve to one copy of the report library, at the pinned version` on the two-element list,
// while the resolution probe failed on two copies under node_modules. A bun.lock-only edit of
// the version inside the single key failed the same test on `11.0.0` (2026-09-20).
// With the Nx cache warm for `tool-devsync:test`, the caret edit to package.json alone and the
// version edit to bun.lock alone each forced a fresh run that failed its test, 266 pass and
// 1 fail, where the unedited tree was answered from cache (planner, 2026-09-20).
describe('the owner-maintained libraries', () => {
  it('are pinned to exact versions in the root manifest', async () => {
    const manifest = JSON.parse(await read('package.json')) as {
      dependencies?: Record<string, string>;
    };
    const pinned = Object.fromEntries(
      Object.keys(OWNER_PACKAGES).map((name) => [name, manifest.dependencies?.[name]]),
    );
    // Proof: on 2026-09-25, pinning di-bag to 0.4.0 failed 'are pinned to exact
    // versions in the root manifest' on `expect(received).toEqual(expected)`;
    // weakening this assertion to an object type check made the same fault pass.
    expect(pinned).toEqual({ ...OWNER_PACKAGES });
  });

  it('resolve to one copy of the report library, at the pinned version', async () => {
    const lock = await read('bun.lock');
    // The key names the copy — a nested one is `"<parent>/caught-object-report-json"` — and
    // the first array element names the version. Asserting the key alone would accept a
    // single entry resolving 10.0.0.
    const copies = lock.split('\n').flatMap((line) => {
      const entry =
        /^ {4}"((?:[^"]+\/)?caught-object-report-json)": \["caught-object-report-json@([^"]+)"/.exec(
          line,
        );
      return entry === null ? [] : [`${entry[1]}@${entry[2]}`];
    });
    expect(copies).toEqual(['caught-object-report-json@13.0.0']);
  });

  /**
   * What the runtime loads, which the lock keys above cannot say.
   *
   * application-exception builds its reports with the copy of the report library it resolves
   * itself. A second copy beside it — nested under `node_modules/application-exception`, left
   * behind by an install over an older tree, or installed because the two pins stopped agreeing
   * — writes the operator's reports in that copy's format while this repository's own imports
   * load the other. So both resolutions must land on the same file, and that file's package must
   * be the pinned version.
   *
   * Nx keys this suite's cache on `bun.lock`, not on `node_modules`, which it cannot hash: an
   * installed tree that drifts without a lockfile change is seen by an uncached run and by every
   * fresh install, not by a cached answer.
   */
  it('installs one copy of the report library, the one application-exception loads', () => {
    const fromRoot = createRequire(new URL('package.json', WORKSPACE));
    const rootCopy = fromRoot.resolve('caught-object-report-json/package.json');
    const fromApplicationException = createRequire(fromRoot.resolve('application-exception'));
    const loadedCopy = fromApplicationException.resolve('caught-object-report-json/package.json');
    // Proof: on 2026-09-25, a copy of the report library nested under application-exception
    // failed this test on the two resolutions,
    // `node_modules/application-exception/node_modules/…` received where the root copy was
    // expected, while the lock-key test beside it passed; with this assertion weakened to a type
    // check the same nested copy passed the whole suite.
    expect(loadedCopy).toBe(rootCopy);
    const { version } = fromRoot(rootCopy) as { version: string };
    // Proof: on 2026-09-25, the installed copy's `package.json` edited to `"version": "12.9.9"`
    // failed this test with `Expected: "13.0.0"`, `Received: "12.9.9"` while the lock-key test
    // passed; with this assertion weakened to a type check the same edit passed the whole suite.
    expect(version).toBe(OWNER_PACKAGES['caught-object-report-json']);
  });
});

it('provisions usable bubblewrap before workspace native runtime tests', async () => {
  const workflow = await readCiWorkflow();
  const steps = workflow.jobs?.gate_workspace?.steps;
  if (steps === undefined) throw new Error('workspace gate steps missing');
  const provision = gateStep(
    workflow,
    'gate_workspace',
    'Provision bubblewrap for native runtime tests',
  );
  expect(provision.if).toBeUndefined();
  // Proof: removing BusyBox from workspace provisioning failed this check before native migration subprocess tests.
  expect(provision.run).toContain(
    'apt-get install --yes --no-install-recommends bubblewrap busybox',
  );
  expect(provision.run).toContain('/bin/busybox sh -c');
  expect(provision.run).toContain('sudo apparmor_parser --replace /etc/apparmor.d/bwrap');
  expect(provision.run).toContain(
    'bwrap --die-with-parent --new-session --unshare-all --uid 1000 --gid 1000',
  );
  expect(steps.indexOf(provision)).toBeLessThan(
    steps.findIndex(
      (step) =>
        step.run?.includes('ci-run-runtime.ts workspace') === true ||
        step.run?.includes('run-many -t test') === true,
    ),
  );
});
