// Bun's rejects matcher is typed void; awaiting it is required by these asynchronous negative tests.
/* eslint-disable @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-dynamic-delete, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/require-await */
import { spawn } from 'node:child_process';
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, test } from 'bun:test';

import {
  Attempt,
  faults,
  finish,
  mutate,
  preflight,
  readProcess,
  requireProofHost,
} from './task7-solver-image-proof';

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
    `#!/bin/sh
printf 'invocation\\t%s\\nattempt\\taaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee\\ncontainer\\twbs-solver-smoke-caller-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee\\n' "$WBS_SOLVER_SMOKE_CLEANUP_TOKEN" > "$WBS_SOLVER_SMOKE_INVENTORY/resources"
: > "$WBS_SOLVER_SMOKE_INVENTORY/attempts"
printf '%s\\n' "$PROOF_TEST_LOG"
case "\${PROOF_TEST_RECEIPT:-exact}" in
exact) printf '[solver-image-smoke] cleanup-complete %s\\n' "$WBS_SOLVER_SMOKE_CLEANUP_TOKEN" ;;
wrong) printf '[solver-image-smoke] cleanup-complete wrong-token\\n' ;;
duplicate) printf '[solver-image-smoke] cleanup-complete %s\\n' "$WBS_SOLVER_SMOKE_CLEANUP_TOKEN" "$WBS_SOLVER_SMOKE_CLEANUP_TOKEN" ;;
none) ;;
esac
exit "\${PROOF_TEST_STATUS:-1}"
`,
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
    'PROOF_TEST_RECEIPT',
  ])
    delete process.env[key];
  const retained = join(folder, 'runtime-inventory');
  if (existsSync(retained)) {
    const path = readFileSync(retained, 'utf8').trim();
    if (
      !new RegExp(
        `^/run/user/${String(process.getuid?.())}/wbs-solver-proof-inventory-[0-9a-f-]{36}$`,
      ).test(path)
    )
      throw new Error('fake test inventory ownership malformed');
    rmSync(path, { recursive: true, force: true });
  }
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

for (const receipt of ['none', 'wrong', 'duplicate'])
  test(`intended assertion with ${receipt} cleanup receipt refuses mutant acceptance`, async () => {
    const fault = faults[0];
    if (!fault) throw new Error('required source-binding fault absent');
    const path = 'apps/wbs/be-01/scripts/connected-composed-image-scenario.ts';
    const line =
      readFileSync(join(import.meta.dir, 'connected-composed-image-scenario.ts'), 'utf8')
        .split('\n')
        .findIndex((source) => source.includes(fault.assertion)) + 1;
    process.env['PROOF_TEST_LOG'] =
      `AssertionError: intended assertion\n at /app/${path}:${String(line)}:12\nregistry removal denied`;
    process.env['PROOF_TEST_RECEIPT'] = receipt;
    await expect(
      new Attempt(folder).smoke('fault', 'registry.invalid/be@sha256:' + 'a'.repeat(64), fault),
    ).rejects.toThrow('inner cleanup receipt missing or duplicated');
  });
test('intended assertion plus exact invocation cleanup receipt accepts mutant', async () => {
  const fault = faults[0];
  if (!fault) throw new Error('required source-binding fault absent');
  const path = 'apps/wbs/be-01/scripts/connected-composed-image-scenario.ts';
  const line =
    readFileSync(join(import.meta.dir, 'connected-composed-image-scenario.ts'), 'utf8')
      .split('\n')
      .findIndex((source) => source.includes(fault.assertion)) + 1;
  process.env['PROOF_TEST_LOG'] =
    `AssertionError: intended assertion\n at /app/${path}:${String(line)}:12`;
  await new Attempt(folder).smoke('fault', 'registry.invalid/be@sha256:' + 'a'.repeat(64), fault);
});

test('stalled inner cleanup retains output and recovers every later recorded resource after kill', async () => {
  const token = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const child = '11111111-2222-4333-8444-555555555555';
  const late = '66666666-7777-4888-8999-aaaaaaaaaaaa';
  const supervisor = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    detached: true,
    stdio: 'ignore',
  });
  const pid = supervisor.pid;
  if (pid === undefined) throw new Error('fake supervisor PID absent');
  const exited = new Promise<void>((resolveExit) => supervisor.once('exit', () => resolveExit()));
  const observed = readProcess(pid);
  if (observed === undefined) throw new Error('fake supervisor identity absent');

  mkdirSync(join(folder, 'store'));
  writeFileSync(
    join(folder, 'bin/timeout'),
    '#!/bin/sh\nshift 2\nexec /usr/bin/timeout --signal=TERM --kill-after=.1 "$@"\n',
    { mode: 0o700 },
  );
  writeFileSync(
    join(folder, 'bin/docker'),
    `#!/bin/sh
for argument do last="$argument"; done
printf '%s\\n' "$*" >> "$PROOF_TEST_DIRECTORY/commands"
case "$1 $2" in
'image inspect'|'container inspect')
  if [ -e "$PROOF_TEST_DIRECTORY/store/$last" ]; then exit 0; fi
  if [ "$1" = image ]; then echo 'No such image' >&2; else echo 'No such container' >&2; fi
  exit 1 ;;
'rm --force')
  case "$last" in *caller*)
    inventory="$(cat "$PROOF_TEST_DIRECTORY/runtime-inventory")"
    printf '${late}\\n' >> "$inventory/attempts"
    touch "$PROOF_TEST_DIRECTORY/store/wbs-solver-${late}"
  ;; esac
  rm "$PROOF_TEST_DIRECTORY/store/$last" ;;
'image rm') rm "$PROOF_TEST_DIRECTORY/store/$last" ;;
*) exit 9 ;;
esac
`,
    { mode: 0o700 },
  );
  writeFileSync(
    join(folder, 'bin/bash'),
    `#!/bin/sh
printf 'invocation\\t%s\\nattempt\\t${token}\\ncontainer\\twbs-solver-smoke-caller-${token}\\nimage\\twbs-be-01:solver-smoke-${token}\\n' "$WBS_SOLVER_SMOKE_CLEANUP_TOKEN" > "$WBS_SOLVER_SMOKE_INVENTORY/resources"
printf 'supervisor-starting\\t%s\\nsupervisor\\t${String(pid)}:${observed.start}\\n' "$WBS_SOLVER_SMOKE_CLEANUP_TOKEN" >> "$WBS_SOLVER_SMOKE_INVENTORY/resources"
printf '%s\\n' "$WBS_SOLVER_SMOKE_INVENTORY" > "$PROOF_TEST_DIRECTORY/runtime-inventory"
printf '${child}\\n' > "$WBS_SOLVER_SMOKE_INVENTORY/attempts"
touch "$PROOF_TEST_DIRECTORY/store/wbs-solver-smoke-caller-${token}" "$PROOF_TEST_DIRECTORY/store/wbs-solver-${child}" "$PROOF_TEST_DIRECTORY/store/wbs-be-01:solver-smoke-${token}"
printf 'stalled inner cleanup with later child and image still owned\\n'
printf 'runtime-device=%s\\n' "$(/usr/bin/stat -c %d "$WBS_SOLVER_SMOKE_INVENTORY")"
trap 'while :; do sleep 1; done' TERM
while :; do sleep 1; done
`,
    { mode: 0o700 },
  );
  try {
    const attempt = new Attempt(folder);
    Object.defineProperty(attempt, 'deadline', { value: Date.now() + 1500 });
    await expect(attempt.smoke('stalled')).rejects.toThrow(
      'inner cleanup receipt missing or duplicated',
    );
    const savedLog = readFileSync(join(folder, 'stalled.log'), 'utf8');
    expect(savedLog).toContain('stalled inner cleanup');
    expect(savedLog).not.toContain(`runtime-device=${String(statSync(folder).dev)}\n`);
    const saved = readdirSync(folder).find((name) => name.startsWith('stalled-inventory-'));
    if (saved === undefined) throw new Error('copied retained inventory missing');
    expect(readFileSync(join(folder, saved, 'resources'), 'utf8')).toContain('supervisor\t');
    expect(readFileSync(join(folder, saved, 'attempts'), 'utf8')).toBe(`${child}\n${late}\n`);
    const inventory = readFileSync(join(folder, 'inventory.json'), 'utf8');
    expect(inventory).toContain('137');
    expect(inventory).toContain('nestedRecovery');
    expect(readFileSync(join(folder, 'commands'), 'utf8')).toContain(
      `image rm wbs-be-01:solver-smoke-${token}`,
    );
    expect(readFileSync(join(folder, 'commands'), 'utf8')).toContain(
      `rm --force wbs-solver-${child}`,
    );
    expect(readFileSync(join(folder, 'commands'), 'utf8')).toContain(
      `rm --force wbs-solver-${late}`,
    );
    expect((await import('node:fs')).readdirSync(join(folder, 'store'))).toEqual([]);
    await exited;
    expect(readProcess(pid)).toBeUndefined();
  } finally {
    if (readProcess(pid) !== undefined) supervisor.kill('SIGKILL');
    await exited;
  }
});
for (const malformed of [
  'missing',
  'unreadable',
  'wrong-invocation',
  'unowned-container',
  'bad-child',
  'pending-supervisor',
  'missing-caller',
])
  test(`nested recovery refuses ${malformed} inventory`, async () => {
    const token = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    if (malformed === 'unreadable') mkdirSync(join(folder, 'resources'));
    else if (malformed !== 'missing') {
      writeFileSync(
        join(folder, 'resources'),
        `invocation\t${malformed === 'wrong-invocation' ? 'wrong' : token}\nattempt\t${token}\n${malformed === 'missing-caller' ? '' : `container\twbs-solver-smoke-caller-${token}\n`}${malformed === 'unowned-container' ? 'container\tproduction-backend\n' : malformed === 'pending-supervisor' ? `supervisor-starting\t${token}\n` : ''}`,
      );
      writeFileSync(join(folder, 'attempts'), malformed === 'bad-child' ? 'not-a-uuid\n' : '');
    }
    const diagnosis =
      malformed === 'missing'
        ? 'ENOENT'
        : malformed === 'unreadable'
          ? 'EISDIR'
          : malformed === 'wrong-invocation'
            ? 'nested inventory invocation mismatch'
            : malformed === 'unowned-container'
              ? 'nested container ownership malformed'
              : malformed === 'bad-child'
                ? 'nested admission inventory malformed'
                : malformed === 'missing-caller'
                  ? 'nested caller ownership missing'
                  : 'nested supervisor identity unavailable';
    await expect(new Attempt(folder).recoverNested(folder, token)).rejects.toThrow(diagnosis);
  });

for (const identity of ['matching', 'reused'])
  test(`nested recovery handles ${identity} detached supervisor identity safely`, async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      detached: true,
      stdio: 'ignore',
    });
    const pid = child.pid;
    if (pid === undefined) throw new Error('fake supervisor PID absent');
    const exited = new Promise<void>((resolveExit) => child.once('exit', () => resolveExit()));
    const observed = readProcess(pid);
    if (observed === undefined) throw new Error('fake supervisor start identity absent');
    const nonce = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const start = identity === 'matching' ? observed.start : String(BigInt(observed.start) + 1n);
    writeFileSync(
      join(folder, 'resources'),
      `invocation\t${nonce}\nattempt\t${nonce}\ncontainer\twbs-solver-smoke-caller-${nonce}\nsupervisor-starting\t${nonce}\nsupervisor\t${String(pid)}:${start}\n`,
    );
    writeFileSync(join(folder, 'attempts'), '');
    try {
      const attempt = new Attempt(folder);
      if (identity === 'matching') {
        await attempt.recoverNested(folder, nonce);
        await exited;
        expect(readProcess(pid)).toBeUndefined();
      } else {
        await expect(attempt.recoverNested(folder, nonce)).rejects.toThrow(
          'PID incarnation changed',
        );
        expect(readProcess(pid)?.start).toBe(observed.start);
      }
    } finally {
      if (readProcess(pid) !== undefined) child.kill('SIGKILL');
      await exited;
    }
  });

test('nested recovery refuses resource overcount before any Docker work', async () => {
  const token = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const containers = Array.from(
    { length: 10 },
    (_, index) =>
      `container\twbs-solver-11111111-2222-4333-8444-${String(index).padStart(12, '0')}\n`,
  ).join('');
  writeFileSync(
    join(folder, 'resources'),
    `invocation\t${token}\nattempt\t${token}\n${containers}`,
  );
  writeFileSync(join(folder, 'attempts'), '');
  await expect(new Attempt(folder).recoverNested(folder, token)).rejects.toThrow(
    'nested ownership exceeds smoke protocol',
  );
});

for (const written of ['admission', 'static'])
  test(`nested recovery rejects ${written} appended after caller quiescence and retains bytes`, async () => {
    const token = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const child = '11111111-2222-4333-8444-555555555555';
    const late = '66666666-7777-4888-8999-aaaaaaaaaaaa';
    mkdirSync(join(folder, 'store'));
    writeFileSync(
      join(folder, 'resources'),
      `invocation\t${token}\nattempt\t${token}\ncontainer\twbs-solver-smoke-caller-${token}\n`,
    );
    writeFileSync(join(folder, 'attempts'), `${child}\n`);
    writeFileSync(join(folder, 'store', `wbs-solver-${child}`), 'owned');
    writeFileSync(
      join(folder, 'bin/docker'),
      `#!/bin/sh
for argument do last="$argument"; done
printf '%s\\n' "$*" >> "$PROOF_TEST_DIRECTORY/commands"
case "$1 $2" in
'container inspect')
  if [ -e "$PROOF_TEST_DIRECTORY/store/$last" ]; then exit 0; fi
  echo 'No such container' >&2; exit 1 ;;
'rm --force')
  printf '${written === 'admission' ? late : `container\\twbs-solver-${late}`}\\n' >> "$PROOF_TEST_DIRECTORY/${written === 'admission' ? 'attempts' : 'resources'}"
  touch "$PROOF_TEST_DIRECTORY/store/wbs-solver-${late}"
  rm "$PROOF_TEST_DIRECTORY/store/$last" ;;
*) exit 9 ;;
esac
`,
      { mode: 0o700 },
    );
    await expect(new Attempt(folder).recoverNested(folder, token)).rejects.toThrow(
      `nested ${written} inventory changed after quiescence`,
    );
    if (written === 'admission')
      expect(readFileSync(join(folder, 'attempts'), 'utf8')).toBe(`${child}\n${late}\n`);
    else
      expect(readFileSync(join(folder, 'resources'), 'utf8')).toContain(
        `container\twbs-solver-${late}\n`,
      );
    expect(readdirSync(join(folder, 'store'))).toEqual([`wbs-solver-${late}`]);
  });

test('caller quiescence failure retains unread admissions and still cleans safe static inventory', async () => {
  const token = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  writeFileSync(
    join(folder, 'resources'),
    `invocation\t${token}\nattempt\t${token}\ncontainer\twbs-solver-smoke-caller-${token}\nimage\twbs-be-01:solver-smoke-${token}\n`,
  );
  mkdirSync(join(folder, 'attempts'));
  writeFileSync(join(folder, 'present'), 'caller still running');
  process.env['PROOF_TEST_REMOVE'] = 'denied';
  await expect(new Attempt(folder).recoverNested(folder, token)).rejects.toThrow(
    'nested admission inventory cannot be stable before caller and supervisor quiescence',
  );
  expect(statSync(join(folder, 'attempts')).isDirectory()).toBe(true);
  expect(readFileSync(join(folder, 'commands'), 'utf8')).toContain(
    `image rm wbs-be-01:solver-smoke-${token}`,
  );
});

test('smoke retains inventory changed after final snapshot before release', async () => {
  class LateAttempt extends Attempt {
    inventoryPath: string | undefined;
    override async recoverNested(inventory: string, token: string, snapshot?: string) {
      this.inventoryPath = inventory;
      const stable = await super.recoverNested(inventory, token, snapshot);
      writeFileSync(join(inventory, 'attempts'), '66666666-7777-4888-8999-aaaaaaaaaaaa\n');
      return stable;
    }
  }
  const attempt = new LateAttempt(folder);
  try {
    await expect(attempt.smoke('late')).rejects.toThrow('nested inventory changed before release');
    const inventory = attempt.inventoryPath;
    if (inventory === undefined) throw new Error('retained inventory location absent');
    expect(readFileSync(join(inventory, 'attempts'), 'utf8')).toContain(
      '66666666-7777-4888-8999-aaaaaaaaaaaa',
    );
  } finally {
    if (attempt.inventoryPath !== undefined)
      rmSync(attempt.inventoryPath, { recursive: true, force: true });
  }
});

for (const recreate of ['original', 'caller', 'child'])
  test(`recovery handles ${recreate} admission hardlink replacement`, async () => {
    const nonce = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
    const token = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const early = '11111111-2222-4333-8444-555555555555';
    const late = '66666666-7777-4888-8999-aaaaaaaaaaaa';
    const socket = `/run/user/${String(process.getuid?.())}/wbs-solver-smoke.${nonce}`;
    mkdirSync(socket, { mode: 0o700 });
    const inventory = `/run/user/${String(process.getuid?.())}/wbs-solver-proof-inventory-${nonce}`;
    mkdirSync(inventory, { mode: 0o700 });
    try {
      writeFileSync(
        join(inventory, 'resources'),
        `invocation\t${nonce}\nattempt\t${token}\ncontainer\twbs-solver-smoke-caller-${token}\ndirectory\t${socket}\n`,
      );
      writeFileSync(join(inventory, 'attempts'), `${early}\n`);
      linkSync(join(inventory, 'attempts'), join(socket, 'composed-attempts'));
      if (recreate === 'caller') unlinkSync(join(socket, 'composed-attempts'));
      mkdirSync(join(folder, 'store'));
      for (const name of [`wbs-solver-smoke-caller-${token}`, `wbs-solver-${early}`])
        writeFileSync(join(folder, 'store', name), 'owned');
      writeFileSync(
        join(folder, 'bin/docker'),
        `#!/bin/sh
for argument do last="$argument"; done
case "$1 $2" in
'container inspect')
 if [ -e "$PROOF_TEST_DIRECTORY/store/$last" ]; then exit 0; fi
 echo 'No such container' >&2; exit 1 ;;
'rm --force')
 if [ "$last" = '${recreate === 'child' ? `wbs-solver-${early}` : `wbs-solver-smoke-caller-${token}`}' ]; then
   ${recreate === 'child' ? `rm '${socket}/composed-attempts'` : ':'}
   printf '${late}\\n' >> '${socket}/composed-attempts'
   touch "$PROOF_TEST_DIRECTORY/store/wbs-solver-${late}"
 fi
 rm "$PROOF_TEST_DIRECTORY/store/$last" ;;
*) exit 9 ;;
esac
`,
        { mode: 0o700 },
      );
      const attempt = new Attempt(folder);
      if (recreate !== 'original') {
        await expect(attempt.recoverNested(inventory, nonce)).rejects.toThrow(
          'nested admission pathname diverged from retained inode',
        );
        expect(readFileSync(join(socket, 'composed-attempts'), 'utf8')).toBe(`${late}\n`);
        expect(readFileSync(join(inventory, 'attempts'), 'utf8')).toBe(`${early}\n`);
        expect(readdirSync(join(folder, 'store'))).toContain(`wbs-solver-${late}`);
        if (recreate === 'caller')
          expect(readFileSync(join(folder, 'inventory.json'), 'utf8')).toContain(
            'divergentAdmissionPath',
          );
      } else {
        await attempt.recoverNested(inventory, nonce);
        expect(readdirSync(join(folder, 'store'))).toEqual([]);
      }
    } finally {
      rmSync(socket, { recursive: true, force: true });
      rmSync(inventory, { recursive: true, force: true });
    }
  });

for (const host of ['h2puni', 'ubuntu-8gb-hel1-1'])
  test(`proof host guard accepts ${host}`, () => {
    expect(() => {
      requireProofHost(host);
    }).not.toThrow();
  });
for (const host of ['h1claw', 'pop-os', 'other', 'ubuntu-8gb-hel1-2', 'h2puni.example'])
  test(`proof host guard refuses ${host}`, () => {
    expect(() => {
      requireProofHost(host);
    }).toThrow('host must be h2puni');
  });
