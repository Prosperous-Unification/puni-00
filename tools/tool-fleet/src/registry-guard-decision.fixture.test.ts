import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import {
  instrumentRegistryGuard,
  readRegistryGuardDecisions,
} from './registry-guard-decision.fixture';

const startup = new URL('../../../infra/platform/registry/production/startup.sh', import.meta.url);
const line = 'task8-decision 1 123.45 readonly permission-metadata first 1\n';

test('instrumentation reconstructs exact pinned production bytes and parses shell syntax', async () => {
  const original = await readFile(startup, 'utf8');
  const instrumented = instrumentRegistryGuard(original);
  expect(instrumented.originalSha256).toBe(
    '020d445290293563758ac52529abb65e7a3bb633bd75414564d411eb7824a220',
  );
  expect(instrumented.sha256).toBe(createHash('sha256').update(instrumented.source).digest('hex'));
  expect(
    instrumented.source
      .split('\n')
      .filter((entry) => !entry.endsWith('# task8-decision'))
      .join('\n'),
  ).toBe(original);
  const syntax = Bun.spawnSync(['/bin/sh', '-n'], {
    stdin: Buffer.from(instrumented.source),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(syntax.exitCode).toBe(0);
  expect(syntax.stderr.toString()).toBe('');
  expect(() => instrumentRegistryGuard(original + '\n')).toThrow();
});

test('strict trace retains only fixed decisions and marks unrelated stderr without reflecting it', () => {
  expect(readRegistryGuardDecisions('private unexpected stderr\n' + line)).toEqual({
    decisions: [
      {
        sequence: 1,
        uptime: 123.45,
        desired: 'readonly',
        reason: 'permission-metadata',
        phase: 'first',
        attempt: 1,
      },
    ],
    otherStderr: true,
  });
  expect(
    JSON.stringify(readRegistryGuardDecisions('private unexpected stderr\n' + line)),
  ).not.toContain('private');
});

for (const [name, bytes] of Object.entries({
  absent: '',
  unknown: line.replace('permission-metadata', 'private'),
  phase: line.replace(' first ', 'unknown'),
  sequence: line + line,
  trailing: line.trimEnd(),
  overbound: 'x'.repeat(256 * 1024 + 1) + '\n' + line,
  count: Array.from({ length: 257 }, (_, position) =>
    line.replace(' 1 ', ` ${String(position + 1)} `),
  ).join(''),
  desired: line.replace('readonly', 'writable'),
  attempts: line.replace('first 1', 'first 4'),
  uptime: line.replace('123.45', 'NaN'),
  allowedPhase: line.replace('readonly permission-metadata', 'writable allowed'),
  limitAttempt: line.replace('permission-metadata first 1', 'sample-limit final 1'),
  backwards: line + line.replace(' 1 ', ' 2 ').replace('123.45', '122.00'),
}))
  test('trace refuses ' + name, () => {
    expect(() => readRegistryGuardDecisions(bytes)).toThrow();
  });

/** Actual /bin/sh, files, checksum/boot/uptime; only metadata UID/GID are mapped to the dedicated fixture identity. No native mount/authority or HTTP claim. */
test('original and instrumented decision agree on valid and fixed refusal boundaries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'task8-guard-decision-'));
  try {
    const contents = join(directory, 'contents');
    const bin = join(directory, 'bin');
    await mkdir(contents);
    await mkdir(bin);
    await writeFile(
      join(bin, 'stat'),
      `#!/usr/bin/python3\nimport os,sys\na=sys.argv[1:]\nif a[:2]==['-c','%f:%u:%g:%h']:\n s=os.lstat(a[2]); print(f'{s.st_mode:x}:59001:59001:{s.st_nlink}')\n if a[2].endswith('journal.json') and os.path.exists(os.environ['TASK8_DECISION_DIR']+'/open-failure'):\n  os.unlink(os.environ['TASK8_DECISION_DIR']+'/contents/writable.permit')\n  os.unlink(os.environ['TASK8_DECISION_DIR']+'/open-failure')\nelse:os.execv('/usr/bin/stat',['stat',*a])\n`,
      { mode: 0o700 },
    );
    await writeFile(
      join(bin, 'sha256sum'),
      `#!/bin/sh\nset -eu\n/usr/bin/sha256sum "$@"\ncase "$TASK8_DECISION_FAULT" in\n final-open) : > "$TASK8_DECISION_DIR/open-failure";;\n final-read) printf 'unterminated' > "$TASK8_DECISION_DIR/contents/writable.permit";;\n final-revoked) rm "$TASK8_DECISION_DIR/contents/writable.permit";;\nesac\n`,
      { mode: 0o700 },
    );
    const canonical = '{"synthetic":"owned permission fixture"}\n';
    await writeFile(join(contents, 'journal.json'), canonical, { mode: 0o600 });
    const digest = createHash('sha256').update(canonical).digest('hex');
    const boot = (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim();
    const issued = Math.floor(Number((await readFile('/proc/uptime', 'utf8')).split(' ')[0]));
    const record = `1 ${boot} ${String(issued)} ${String(issued + 30)} ${digest} ${digest}\n`;
    const original = await readFile(startup, 'utf8');
    const instrumented = instrumentRegistryGuard(original).source;
    for (const [fault, permission, reason] of [
      ['valid', record, 'allowed'],
      ['final-open', record, 'permission-open'],
      ['final-read', record, 'permission-read'],
      ['final-revoked', record, 'permission-stat'],
      ['malformed', record.replace('1 ', '1  '), 'record-canonical'],
      ['hash', record.replaceAll(digest, 'f'.repeat(64)), 'checksum-mismatch'],
      [
        'expired',
        record.replace(
          `${String(issued)} ${String(issued + 30)}`,
          `${String(issued - 60)} ${String(issued - 30)}`,
        ),
        'record-lease-grammar',
      ],
    ] as const) {
      const outcomes = [];
      for (const source of [original, instrumented]) {
        await writeFile(join(contents, 'writable.permit'), permission, { mode: 0o600 });
        const first = source.indexOf('permits_writes() {');
        const last = source.indexOf('\numask 077', first);
        const decision = source.slice(
          source.indexOf('  desired="readonly"'),
          source.indexOf('  if test "$desired" != "$mode"'),
        );
        const script =
          'set -eu\njournal=$1\ntask8_sequence=0\n' +
          source.slice(first, last) +
          '\n' +
          decision +
          '\nprintf "%s\\n" "$desired"\n';
        const completed = Bun.spawnSync(['/bin/sh', '-c', script, 'guard', directory], {
          env: {
            PATH: bin + ':/usr/bin:/bin',
            LANG: 'C',
            TASK8_DECISION_DIR: directory,
            TASK8_DECISION_FAULT: fault,
          },
          stdout: 'pipe',
          stderr: 'pipe',
          timeout: 3000,
        });
        expect(completed.exitCode).toBe(0);
        outcomes.push(completed.stdout.toString());
        if (source === instrumented) {
          const observed = readRegistryGuardDecisions(completed.stderr.toString());
          expect(observed.decisions[0]?.reason).toBe(reason);
          expect(observed.decisions[0]?.phase).toBe(
            fault === 'valid' || fault === 'hash' || fault.startsWith('final-') ? 'final' : 'first',
          );
          expect(observed.otherStderr).toBe(fault === 'final-open');
        }
      }
      expect(outcomes[0]).toBe(outcomes[1]);
      expect(outcomes[0]).toBe(fault === 'valid' ? 'writable\n' : 'readonly\n');
    }
  } finally {
    await rm(directory, { recursive: true });
  }
});
