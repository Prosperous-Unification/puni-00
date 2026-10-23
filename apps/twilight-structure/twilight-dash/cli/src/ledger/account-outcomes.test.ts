import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { runDash } from '../cli';
import type { EfficiencyBreakdown } from './efficiency-breakdown';
import {
  claudeLine,
  codexRollout,
  fixtureRepository,
  period,
  rateCardJson,
  slug,
  toolResultLine,
} from './fixtures.test-support';

interface Setup {
  repository: string;
  claude: string;
  codex: string;
  card: string;
  parent: string;
}

function setup(): Setup {
  const repository = fixtureRepository(scratchSync('ledger-repo'));
  const claude = scratchSync('ledger-claude');
  mkdirSync(claude, { recursive: true });
  writeFileSync(
    join(claude, 'session-a.jsonl'),
    `${[
      claudeLine({}),
      claudeLine({}),
      claudeLine({
        requestId: 'req-2',
        gitBranch: 'feat/c',
        timestamp: '2026-10-17T12:00:00.000Z',
      }),
      claudeLine({ requestId: 'req-3', gitBranch: 'main', timestamp: '2026-10-17T13:00:00.000Z' }),
    ].join('\n')}\n`,
  );
  writeFileSync(
    join(claude, 'session-b.jsonl'),
    `${[
      claudeLine({ sessionId: 'session-b', requestId: 'req-b1', gitBranch: 'feat/q' }),
      toolResultLine('session-b', `https://github.com/${slug}/pull/11`),
      claudeLine({
        sessionId: 'session-b',
        requestId: 'req-b2',
        gitBranch: 'feat/q',
        message: { model: 'codex-auto-review', usage: { input_tokens: 1, output_tokens: 1 } },
      }),
    ].join('\n')}\n`,
  );
  const codex = scratchSync('ledger-codex');
  mkdirSync(join(codex, '2026', '10', '16'), { recursive: true });
  writeFileSync(
    join(codex, '2026', '10', '16', 'rollout-1.jsonl'),
    codexRollout({ counts: [{ input: 1000, cached: 800, output: 30 }] }),
  );
  const card = join(scratchSync('ledger-card'), 'card.json');
  mkdirSync(join(card, '..'), { recursive: true });
  writeFileSync(card, rateCardJson());
  const parent = scratchSync('ledger-out');
  mkdirSync(parent, { recursive: true });
  return { repository, claude, codex, card, parent };
}

function argv(set: Setup, output: string, extra: string[] = []): string[] {
  return [
    'account-outcomes',
    '--repository',
    set.repository,
    '--since',
    period.since,
    '--until',
    period.until,
    '--rate-card',
    set.card,
    '--output',
    output,
    '--claude-projects',
    set.claude,
    '--codex-sessions',
    set.codex,
    ...extra,
  ];
}

const deps = {
  planEnrollment: () => Promise.resolve(),
  clock: { read: () => 0 },
  monotonic: { now: () => 0 },
  stdout: { write: () => true },
};

async function refusal(run: Promise<void>): Promise<string> {
  try {
    await run;
  } catch (cause) {
    return cause instanceof Error ? cause.message : String(cause);
  }
  throw new Error('expected a refusal');
}

test('writes a reproducible breakdown with attribution, remainder and blended figure', async () => {
  const set = setup();
  const output = join(set.parent, 'run-1');
  let printed = '';
  await runDash(argv(set, output), {
    ...deps,
    stdout: { write: (text: string) => (printed += text) },
  });
  expect(readdirSync(output).sort()).toEqual([
    'efficiency-breakdown.json',
    'efficiency-breakdown.md',
    'harness-usage.json',
  ]);
  expect(statSync(join(output, 'efficiency-breakdown.json')).mode & 0o777).toBe(0o600);
  const breakdown = JSON.parse(
    readFileSync(join(output, 'efficiency-breakdown.json'), 'utf8'),
  ) as EfficiencyBreakdown;
  // Three outcomes in the period: PR 10 (plan/x with feat/a, feat/b), PR 11 (feat/c), the hand merge.
  expect(breakdown.acceptedOutcomes).toBe(3);
  expect(breakdown.unreadableLines).toBe(0);
  // One Fable row = 10*10 + 20*12.5 + 10*20 + 1000*0.25 + 20*50 micros = 1,800 micros.
  const fable = 10 * 10 + 20 * 12.5 + 10 * 20 + 1000 * 0.25 + 20 * 50;
  // Codex row: 200 input*2 + 800 cached*0.2 + 30 output*10 = 860 micros.
  const codex = 200 * 2 + 800 * 0.2 + 30 * 10;
  expect(breakdown.pricedMicros).toBe(4 * fable + codex);
  const byPr = new Map(breakdown.outcomes.map((outcome) => [outcome.pullRequest, outcome]));
  expect(byPr.get(10)?.micros).toBe(fable + codex); // req-1 on feat/a (member of plan/x) and the Codex row on feat/b
  expect(byPr.get(11)?.micros).toBe(fable + fable); // req-2 on feat/c by branch, req-b1 by pull-request reference
  expect(byPr.get(11)?.rules).toEqual({ 'pull-request-reference': 1, branch: 1 });
  expect(breakdown.unattributedMicrosByReason['on-default-branch']).toBe(fable);
  expect(breakdown.unpriced).toEqual([
    {
      harness: 'claude-code',
      model: 'codex-auto-review',
      reason: 'unknown-model',
      rows: 1,
      tokens: { input: 1, cacheWrite: 0, cacheWriteExtended: 0, cacheRead: 0, output: 1 },
    },
  ]);
  expect(breakdown.blendedMicrosPerOutcome).toBe(Math.round((4 * fable + codex) / 3));
  expect(breakdown.coverage).toBe(
    Math.round(((3 * fable + codex) / (4 * fable + codex)) * 10000) / 10000,
  );
  expect(printed).toMatch(
    /^account-outcomes: 3 accepted outcomes, priced 0\.01 USD, blended 0\.00 USD per outcome, coverage \d+\.\d%, unpriced rows 1\n$/,
  );
  const markdown = readFileSync(join(output, 'efficiency-breakdown.md'), 'utf8');
  expect(markdown).toContain('| Accepted outcomes | 3 |');
  expect(markdown).toContain('codex-auto-review | unknown-model');
  const second = join(set.parent, 'run-2');
  await runDash(argv(set, second), deps);
  expect(readFileSync(join(second, 'efficiency-breakdown.json'), 'utf8')).toBe(
    readFileSync(join(output, 'efficiency-breakdown.json'), 'utf8'),
  );
});

test('the output already exists refuses and writes nothing', async () => {
  const set = setup();
  const output = join(set.parent, 'exists');
  mkdirSync(output);
  expect(await refusal(runDash(argv(set, output), deps))).toMatch(/output directory must be new/);
  expect(readdirSync(output)).toEqual([]);
});

test('grammar refuses before reading: unknown, duplicate, valueless, missing, inverted period', async () => {
  const set = setup();
  const output = join(set.parent, 'never');
  const unknown = await refusal(runDash(argv(set, output, ['--bogus', 'x']), deps));
  expect(unknown).toMatch(/^usage: dash account-outcomes/);
  const duplicate = await refusal(runDash(argv(set, output, ['--since', period.since]), deps));
  expect(duplicate).toMatch(/^usage/);
  const valueless = await refusal(runDash([...argv(set, output).slice(0, -1)], deps));
  expect(valueless).toMatch(/^usage/);
  const missing = await refusal(
    runDash(['account-outcomes', '--repository', set.repository], deps),
  );
  expect(missing).toMatch(/^usage/);
  const inverted = argv(set, output).map((value) =>
    value === period.until ? '2026-10-01T00:00:00Z' : value,
  );
  expect(await refusal(runDash(inverted, deps))).toMatch(/--until must be after --since/);
  expect(existsSync(output)).toBe(false);
});
