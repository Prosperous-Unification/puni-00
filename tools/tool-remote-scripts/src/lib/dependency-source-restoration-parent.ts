import { rm } from 'node:fs/promises';

import { expect, test } from 'bun:test';

import {
  assertRestorationCases,
  readRestorationProfile,
  type RestorationCase,
  type RestorationGroup,
} from '../fixtures/participant-restoration-profile';
import { SOURCE_RESTORATION_CASES } from '../fixtures/participant-source-restoration-cases';
import { createReadinessByteTransportFixture } from '../fixtures/product-readiness-byte-transport';

let policyReserved = false;

/** Owns one fixed original child. Unknown policy custody or unsafe retirement refuses every later valid shared-helper case. */
export async function runRestorationParentCase(scenario: RestorationCase): Promise<void> {
  const profile = readRestorationProfile(scenario.kind);
  const original = SOURCE_RESTORATION_CASES.find(({ kind }) => kind === scenario.kind);
  if (original?.name !== scenario.name) throw new Error('restoration selected case differs');
  const isPolicy = profile.group === 'policy';
  const horizon = isPolicy ? performance.now() + profile.abortMs : undefined;
  if (policyReserved) throw new Error('policy original invocation remains reserved');
  if (isPolicy) {
    policyReserved = true;
  }
  const peer = await createReadinessByteTransportFixture();
  const environment: NodeJS.ProcessEnv = { ...peer.environment, FORCE_COLOR: '0' };
  delete environment['SOURCE_RESTORATION_PROOF'];
  let isSettled = false;
  try {
    const remaining = horizon === undefined ? profile.abortMs : horizon - performance.now();
    if (!Number.isFinite(remaining) || remaining <= 0)
      throw new Error('policy parent horizon exhausted before spawn');
    const child = Bun.spawn(
      [
        process.execPath,
        'test',
        'test/dependency-source-restoration-model-child.test.ts',
        '-t',
        `^${scenario.name}$`,
        `--timeout=${String(profile.modelMs)}`,
      ],
      {
        cwd: new URL('../..', import.meta.url).pathname,
        env: environment,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        signal: AbortSignal.timeout(Math.ceil(remaining)),
        killSignal: 'SIGKILL',
      },
    );
    const terminal = await Promise.allSettled([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    const failures: unknown[] = [];
    for (const receipt of terminal)
      if (receipt.status === 'rejected') failures.push(receipt.reason);
    if (failures.length > 0)
      throw new AggregateError(
        failures,
        `source restoration child settlement unproved; peer retained at ${peer.directory}`,
      );
    const [exit, stdout, stderr] = terminal;
    if (
      exit.status !== 'fulfilled' ||
      stdout.status !== 'fulfilled' ||
      stderr.status !== 'fulfilled'
    )
      throw new Error('source restoration child settlement unproved');
    process.stderr.write(stderr.value);
    if ((exit.value !== 0 && exit.value !== 1) || child.signalCode !== null)
      throw new Error(
        `source restoration child custody unproved; peer retained at ${peer.directory}`,
      );
    isSettled = true;
    // This receipt follows the ORIGINAL child exit and both EOF joins, with
    // normal exit0/1 and null signal; an outcome line alone proves no custody.
    process.stderr.write(
      `SOURCE_RESTORATION_INNER_CUSTODY: ${JSON.stringify({ name: scenario.name, exitCode: exit.value, signal: null, stdoutEof: true, stderrEof: true })}\n`,
    );
    expect(exit.value).toBe(0);
    expect(child.signalCode).toBeNull();
    expect(stdout.value).toMatch(/^bun test v[^\n]+\n$/);
    expect(stderr.value).toMatch(/\b1 pass\b/);
    expect(stderr.value).toMatch(/\b0 fail\b/);
    expect(stderr.value).not.toMatch(/^\s*\d+ (?:skip|todo)\b|^\((?:skip|todo)\)/m);
    expect(
      [...stderr.value.matchAll(/^\(pass\) (.+) \[[0-9.]+ms\]$/gm)].map((match) => match[1]),
    ).toEqual([scenario.name]);
  } finally {
    if (isSettled) {
      await rm(peer.directory, { recursive: true });
      if (isPolicy) policyReserved = false;
    }
  }
}

/** Registers only one complete validated owner; the model child remains the fixed existing import-only entry. */
export function registerRestorationParent(
  group: RestorationGroup,
  cases: readonly RestorationCase[],
): void {
  assertRestorationCases(group, cases);
  for (const scenario of cases)
    test(
      `isolated ${scenario.name}`,
      () => runRestorationParentCase(scenario),
      readRestorationProfile(scenario.kind).parentMs,
    );
}
