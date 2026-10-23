import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { claudeLine, codexRollout, period, slug, toolResultLine } from './fixtures.test-support';
import { importHarnessUsage } from './harness-usage';

function claudeDirectory(lines: string[], name = 'session-a.jsonl'): string {
  const directory = scratchSync('ledger-claude');
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, name), `${lines.join('\n')}\n`);
  return directory;
}

function codexDirectory(rollout: string): string {
  const directory = scratchSync('ledger-codex');
  mkdirSync(join(directory, '2026', '10', '16'), { recursive: true });
  writeFileSync(join(directory, '2026', '10', '16', 'rollout-1.jsonl'), rollout);
  return directory;
}

test('a streamed response repeats its usage and counts once', () => {
  const directory = claudeDirectory([claudeLine({}), claudeLine({}), claudeLine({})]);
  const usage = importHarnessUsage({
    claudeProjects: [directory],
    codexSessions: [],
    period,
    repositorySlug: slug,
  });
  expect(usage.rows).toHaveLength(1);
  expect(usage.rows[0]?.tokens).toEqual({
    input: 10,
    cacheWrite: 20,
    cacheWriteExtended: 10,
    cacheRead: 1000,
    output: 20,
  });
  expect(usage.rows[0]?.branch).toBe('feat/a');
  expect(usage.rows[0]?.harnessVersion).toBe('2.1.303');
});

test('a repeated request id that disagrees refuses naming the path and line', () => {
  const inputs = claudeDirectory([
    claudeLine({}),
    claudeLine({ usage: { cache_read_input_tokens: 999 } }),
  ]);
  expect(() =>
    importHarnessUsage({
      claudeProjects: [inputs],
      codexSessions: [],
      period,
      repositorySlug: slug,
    }),
  ).toThrow(/repeated request id with different usage: .*session-a\.jsonl":2$/);
  const shrinking = claudeDirectory([claudeLine({}), claudeLine({ usage: { output_tokens: 19 } })]);
  expect(() =>
    importHarnessUsage({
      claudeProjects: [shrinking],
      codexSessions: [],
      period,
      repositorySlug: slug,
    }),
  ).toThrow(/repeated request id with different usage/);
});

test('subagent transcripts under a session directory are read too', () => {
  const directory = claudeDirectory([claudeLine({})]);
  mkdirSync(join(directory, 'session-a', 'subagents'), { recursive: true });
  writeFileSync(
    join(directory, 'session-a', 'subagents', 'agent-1.jsonl'),
    `${claudeLine({ requestId: 'req-sub', sessionId: 'session-a', isSidechain: true })}\n`,
  );
  const usage = importHarnessUsage({
    claudeProjects: [directory],
    codexSessions: [],
    period,
    repositorySlug: slug,
  });
  expect(usage.rows).toHaveLength(2);
});

test('synthetic entries without a request id are dropped only when empty', () => {
  const empty = claudeDirectory([
    JSON.stringify({
      type: 'assistant',
      sessionId: 's',
      timestamp: '2026-10-16T10:00:00Z',
      version: '2.1.303',
      message: { model: '<synthetic>', usage: { input_tokens: 0, output_tokens: 0 } },
    }),
  ]);
  expect(
    importHarnessUsage({ claudeProjects: [empty], codexSessions: [], period, repositorySlug: slug })
      .rows,
  ).toHaveLength(0);
  const bearing = claudeDirectory([
    JSON.stringify({
      type: 'assistant',
      sessionId: 's',
      timestamp: '2026-10-16T10:00:00Z',
      version: '2.1.303',
      message: { model: 'claude-fable-5-1', usage: { input_tokens: 5, output_tokens: 0 } },
    }),
  ]);
  expect(() =>
    importHarnessUsage({
      claudeProjects: [bearing],
      codexSessions: [],
      period,
      repositorySlug: slug,
    }),
  ).toThrow(/usage but no request id/);
});

test('rows outside the period and pull request references are handled per session', () => {
  const directory = claudeDirectory([
    claudeLine({ timestamp: '2026-10-01T00:00:00.000Z' }),
    claudeLine({ requestId: 'req-2', timestamp: '2026-10-16T12:00:00.000Z' }),
    toolResultLine(
      'session-a',
      `https://github.com/${slug}/pull/11 created; see also github.com/Other/repo/pull/99`,
    ),
  ]);
  const usage = importHarnessUsage({
    claudeProjects: [directory],
    codexSessions: [],
    period,
    repositorySlug: slug,
  });
  expect(usage.rows.map((row) => row.requestId)).toEqual(['req-2']);
  expect(usage.sessions).toEqual([
    { harness: 'claude-code', sessionId: 'session-a', pullRequestReferences: [11] },
  ]);
});

test('Codex rows are the advance of the cumulative counter and repeated events count once', () => {
  const directory = codexDirectory(
    codexRollout({
      counts: [
        { input: 1000, cached: 800, write: 50, output: 30 },
        { input: 500, cached: 500, output: 10 },
      ],
      repeatLast: true,
    }),
  );
  const usage = importHarnessUsage({
    claudeProjects: [],
    codexSessions: [directory],
    period,
    repositorySlug: slug,
  });
  expect(usage.rows).toHaveLength(2);
  expect(usage.rows[0]).toMatchObject({
    harness: 'codex',
    model: 'gpt-6-sol',
    branch: 'feat/b',
    sessionId: 'codex-1',
    tokens: { input: 200, cacheWrite: 50, cacheWriteExtended: 0, cacheRead: 800, output: 30 },
  });
  expect(usage.rows[1]?.tokens).toEqual({
    input: 0,
    cacheWrite: 0,
    cacheWriteExtended: 0,
    cacheRead: 500,
    output: 10,
  });
});

test('a Codex category that falls without a restart refuses naming the rollout', () => {
  const directory = codexDirectory(
    codexRollout({ counts: [{ input: 10, cached: 5, output: 1 }], fallCached: true }),
  );
  expect(() =>
    importHarnessUsage({
      claudeProjects: [],
      codexSessions: [directory],
      period,
      repositorySlug: slug,
    }),
  ).toThrow(/cumulative usage fell without a restart: .*rollout-1\.jsonl":4$/);
});

test('an absent directory and a missing field refuse; a line that is not JSON is reported, not fatal', () => {
  expect(() =>
    importHarnessUsage({
      claudeProjects: [join(scratchSync('ledger-none'), 'absent')],
      codexSessions: [],
      period,
      repositorySlug: slug,
    }),
  ).toThrow(/missing or unreadable/);
  const torn = claudeDirectory([
    claudeLine({}),
    '{"type":"assistant","sessionId":"session-a","requestId":"req-torn","message":{"model":"claude-fable-5-1","usage":{"input_tokens":5',
  ]);
  const usage = importHarnessUsage({
    claudeProjects: [torn],
    codexSessions: [],
    period,
    repositorySlug: slug,
  });
  expect(usage.rows).toHaveLength(1);
  expect(usage.unreadableLines).toEqual([{ path: join(torn, 'session-a.jsonl'), line: 2 }]);
  const missing = claudeDirectory([
    JSON.stringify({
      type: 'assistant',
      sessionId: 's',
      requestId: 'r',
      timestamp: '2026-10-16T10:00:00Z',
      version: '2.1.303',
      message: { model: 'claude-fable-5-1' },
    }),
  ]);
  expect(() =>
    importHarnessUsage({
      claudeProjects: [missing],
      codexSessions: [],
      period,
      repositorySlug: slug,
    }),
  ).toThrow(/malformed: .*:1$/);
});
