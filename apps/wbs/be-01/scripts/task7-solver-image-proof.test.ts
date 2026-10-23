// Bun's rejects matcher is typed void; awaiting it is required by these asynchronous negative tests.
/* eslint-disable @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-dynamic-delete, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/require-await */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, test } from 'bun:test';

import { Attempt, faults, finish, mutate, preflight } from './task7-solver-image-proof';

let folder: string;
let originalPath = '';
beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'task7-proof-test-'));
  originalPath = process.env['PATH'] ?? '';
  mkdirSync(join(folder, 'bin'));
  writeFileSync(
    join(folder, 'bin/docker'),
    `#!/bin/sh
printf '%s\\n' "$*" >> "$PROOF_TEST_DIRECTORY/commands"
case "$1 $2" in
  'image inspect'|'container inspect')
    if [ "$PROOF_TEST_INSPECT" = broken ]; then echo 'permission denied' >&2; exit 1; fi
    if [ -e "$PROOF_TEST_DIRECTORY/present" ]; then exit 0; fi
    if [ "$1" = image ]; then echo 'No such image' >&2; else echo 'No such container' >&2; fi
    exit 1 ;;
  'image rm'|'rm --force')
    if [ "$PROOF_TEST_REMOVE" = denied ]; then echo 'removal denied' >&2; exit 7; fi
    if [ "$PROOF_TEST_REMOVE" != ignored ]; then rm "$PROOF_TEST_DIRECTORY/present"; fi
    if [ "$PROOF_TEST_REMOVE" = after-untag ]; then exit 7; fi ;;
  *) echo unexpected >&2; exit 9 ;;
esac
`,
    { mode: 0o700 },
  );
  writeFileSync(
    join(folder, 'bin/bash'),
    '#!/bin/sh\nprintf "%s\\n" "$PROOF_TEST_LOG"\nexit "${PROOF_TEST_STATUS:-1}"\n',
    { mode: 0o700 },
  );
  process.env['PATH'] = join(folder, 'bin') + ':' + originalPath;
  process.env['PROOF_TEST_DIRECTORY'] = folder;
});
afterEach(() => {
  process.env['PATH'] = originalPath;
  for (const key of [
    'PROOF_TEST_DIRECTORY',
    'PROOF_TEST_INSPECT',
    'PROOF_TEST_REMOVE',
    'PROOF_TEST_LOG',
    'PROOF_TEST_STATUS',
  ])
    delete process.env[key];
  rmSync(folder, { recursive: true, force: true });
});

test('exact SHA refusal happens before Docker', async () => {
  await expect(preflight('a'.repeat(40))).rejects.toThrow('exact SHA mismatch');
});
test('mutants replace only the reviewed complete production file; reuse breaks both layers', () => {
  for (const fault of faults) {
    const context = join(folder, fault.name);
    mkdirSync(context);
    mutate(fault, context);
    const bytes = readFileSync(join(context, 'fault.ts'), 'utf8');
    for (const [before, after] of fault.replacements) {
      expect(before).toBeDefined();
      expect(after).toBeDefined();
      if (before && after !== undefined) {
        expect(bytes).not.toContain(before);
        if (after) expect(bytes).toContain(after);
      }
    }
  }
});
test('unknown mutation site refuses', () => {
  const fault = faults[0];
  expect(fault).toBeDefined();
  if (!fault) throw new Error('required source-binding fault absent');
  expect(() => mutate({ ...fault, replacements: [['not a production site', '']] }, folder)).toThrow(
    'mutation site changed',
  );
});
test('cleanup inspects and removes only recorded tags; registry unowned until creation', async () => {
  const attempt = new Attempt(folder);
  attempt.tags.push('owned:baseline');
  writeFileSync(join(folder, 'present'), 'yes');
  await attempt.cleanup();
  expect(readFileSync(join(folder, 'commands'), 'utf8')).toBe(
    'image inspect owned:baseline\nimage rm owned:baseline\nimage inspect owned:baseline\n',
  );
});
for (const fault of ['denied', 'ignored', 'after-untag'])
  test(`cleanup rejects ${fault} removal`, async () => {
    const attempt = new Attempt(folder);
    attempt.tags.push('owned:baseline');
    writeFileSync(join(folder, 'present'), 'yes');
    process.env['PROOF_TEST_REMOVE'] = fault;
    await expect(attempt.cleanup()).rejects.toThrow('cleanup failed');
  });
test('broken inspect is not absence and every tag still gets removal/readback', async () => {
  const attempt = new Attempt(folder);
  attempt.registryOwned = true;
  attempt.tags.push('owned:first', 'owned:second');
  process.env['PROOF_TEST_INSPECT'] = 'broken';
  process.env['PROOF_TEST_REMOVE'] = 'ignored';
  await expect(attempt.cleanup()).rejects.toThrow('permission denied');
  const commands = readFileSync(join(folder, 'commands'), 'utf8');
  expect(commands).toContain('image rm owned:first');
  expect(commands).toContain('image rm owned:second');
  expect(commands).toContain('rm --force ' + attempt.registry);
});
test('generic Docker/assertion error cannot count as production composed fault', async () => {
  const fault = faults[0];
  if (!fault) throw new Error('required source-binding fault absent');
  process.env['PROOF_TEST_LOG'] = 'AssertionError: Docker launcher broke';
  await expect(
    new Attempt(folder).smoke('fault', 'registry.invalid/be@sha256:' + 'a'.repeat(64), fault),
  ).rejects.toThrow('intended composed assertion missing');
});
test('success text with nonzero exit cannot count as green', async () => {
  process.env['PROOF_TEST_LOG'] =
    '[solver-image-smoke] composed installed Python published improved Pri, durable ready evidence and recomposed read reuse';
  await expect(new Attempt(folder).smoke('green')).rejects.toThrow('composed green missing');
});
test('primary failure survives cleanup failure and cleanup still runs', async () => {
  class FailedAttempt extends Attempt {
    override async run() {
      throw new Error('primary-client-87');
    }
    override async cleanup() {
      this.record({ cleanupAttempted: true });
      throw new Error('cleanup-denied');
    }
  }
  await expect(finish(new FailedAttempt(folder))).rejects.toThrow('primary-client-87');
  expect(readFileSync(join(folder, 'inventory.json'), 'utf8')).toContain('cleanupAttempted');
});

test('tag ownership refuses an existing tag before recording it', async () => {
  const attempt = new Attempt(folder);
  writeFileSync(join(folder, 'present'), 'yes');
  await expect(attempt.tag('existing:tag')).rejects.toThrow('tag already exists');
  expect(attempt.tags).toEqual([]);
});
test('expired work bound refuses before Docker', async () => {
  const attempt = new Attempt(folder);
  Object.defineProperty(attempt, 'deadline', { value: 0 });
  await expect(attempt.runCommand(['docker', 'build'])).rejects.toThrow('one-hour work bound');
});

test('full planned sequence derives independent mutants and restores exact baseline each time', async () => {
  writeFileSync(
    join(folder, 'bin/git'),
    '#!/bin/sh\ncase "$1" in rev-parse) printf "%040d\\n" 0 ;; status) exit 0 ;; *) exit 9 ;; esac\n',
    { mode: 0o700 },
  );
  class PlannedAttempt extends Attempt {
    readonly smokes: [string, string | undefined][] = [];
    override async runCommand(arguments_: string[]) {
      if (arguments_.includes('HostPort}}')) throw new Error('unexpected format');
      if (arguments_.some((argument) => argument.includes('HostPort'))) return '5000';
      if (arguments_.some((argument) => argument.includes('RepoDigests'))) {
        const tag = arguments_.at(-1);
        if (!tag) throw new Error('tag missing');
        return (
          '127.0.0.1:5000/wbs-be-01@sha256:' +
          (tag.endsWith(':baseline-' + this.token) ? 'a' : 'b').repeat(64)
        );
      }
      return '';
    }
    override async smoke(name: string, image?: string) {
      this.smokes.push([name, image]);
    }
  }
  // No network readiness probe: fake curl is the only curl in this local test.
  writeFileSync(join(folder, 'bin/curl'), '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  const attempt = new PlannedAttempt(folder);
  await attempt.run();
  const baseline = '127.0.0.1:5000/wbs-be-01@sha256:' + 'a'.repeat(64);
  expect(attempt.smokes.map(([name]) => name)).toEqual([
    'built-green',
    'supplied-green',
    ...faults.flatMap((fault) => [fault.name, fault.name + '-restored']),
  ]);
  for (const [name, image] of attempt.smokes)
    if (name.endsWith('-restored') || name === 'supplied-green') expect(image).toBe(baseline);
  for (const fault of faults)
    expect(readFileSync(join(folder, fault.name, 'Dockerfile'), 'utf8')).toBe(
      `FROM ${baseline}\nCOPY fault.ts /app/${fault.path}\n`,
    );
  expect(attempt.tags).toHaveLength(6);
});
