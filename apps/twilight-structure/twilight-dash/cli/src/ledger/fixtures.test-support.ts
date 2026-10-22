import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Shared test fixtures for the ledger: transcripts, rollouts, a card and a merge history. */
export const slug = 'Example-Org/example-repo';

export function claudeLine(
  overrides: Record<string, unknown> & { usage?: Record<string, unknown> },
): string {
  const { usage, ...rest } = overrides;
  return JSON.stringify({
    type: 'assistant',
    sessionId: 'session-a',
    requestId: 'req-1',
    timestamp: '2026-10-16T10:00:00.000Z',
    version: '2.1.303',
    gitBranch: 'feat/a',
    cwd: '/repo',
    message: {
      model: 'claude-fable-5-1',
      usage: {
        input_tokens: 10,
        cache_creation_input_tokens: 30,
        cache_read_input_tokens: 1000,
        output_tokens: 20,
        cache_creation: { ephemeral_5m_input_tokens: 20, ephemeral_1h_input_tokens: 10 },
        ...usage,
      },
    },
    ...rest,
  });
}

export function toolResultLine(sessionId: string, text: string): string {
  return JSON.stringify({
    type: 'user',
    sessionId,
    timestamp: '2026-10-16T10:00:01.000Z',
    message: { role: 'user', content: [{ type: 'tool_result', content: text }] },
  });
}

export function codexRollout(input: {
  id?: string;
  branch?: string | null;
  model?: string;
  counts: { input: number; cached: number; write?: number; output: number; timestamp?: string }[];
  breakTotal?: boolean;
  repeatLast?: boolean;
  fallCached?: boolean;
  extraLines?: string[];
}): string {
  const lines: string[] = [];
  const git =
    input.branch === null ? {} : { git: { branch: input.branch ?? 'feat/b', commit_hash: 'abc' } };
  lines.push(
    JSON.stringify({
      timestamp: '2026-10-16T09:00:00.000Z',
      type: 'session_meta',
      payload: { id: input.id ?? 'codex-1', cwd: '/repo', cli_version: '0.162.1', ...git },
    }),
  );
  lines.push(
    JSON.stringify({
      timestamp: '2026-10-16T09:00:01.000Z',
      type: 'turn_context',
      payload: { model: input.model ?? 'gpt-6-sol' },
    }),
  );
  let total = {
    input_tokens: 0,
    cached_input_tokens: 0,
    cache_write_input_tokens: 0,
    output_tokens: 0,
    reasoning_output_tokens: 0,
    total_tokens: 0,
  };
  input.counts.forEach((count, index) => {
    const last = {
      input_tokens: count.input,
      cached_input_tokens: count.cached,
      cache_write_input_tokens: count.write ?? 0,
      output_tokens: count.output,
      reasoning_output_tokens: 0,
      total_tokens: count.input + count.output,
    };
    total = {
      input_tokens: total.input_tokens + last.input_tokens,
      cached_input_tokens: total.cached_input_tokens + last.cached_input_tokens,
      cache_write_input_tokens: total.cache_write_input_tokens + last.cache_write_input_tokens,
      output_tokens: total.output_tokens + last.output_tokens,
      reasoning_output_tokens: 0,
      total_tokens: total.total_tokens + last.total_tokens,
    };
    const reported =
      input.breakTotal && index === input.counts.length - 1
        ? { ...total, total_tokens: total.total_tokens + 1 }
        : total;
    const event = (usage: typeof total) =>
      JSON.stringify({
        timestamp: count.timestamp ?? `2026-10-16T09:1${String(index)}:00.000Z`,
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: { total_token_usage: usage, last_token_usage: last },
          rate_limits: {},
        },
      });
    lines.push(event(reported));
    if (input.repeatLast && index === input.counts.length - 1) lines.push(event(reported));
    if (input.fallCached && index === input.counts.length - 1) {
      lines.push(
        event({
          ...reported,
          cached_input_tokens: reported.cached_input_tokens - 1,
          input_tokens: reported.input_tokens + 1,
        }),
      );
    }
  });
  lines.push(...(input.extraLines ?? []));
  return `${lines.join('\n')}\n`;
}

export function rateCardJson(): string {
  return JSON.stringify({
    schemaVersion: 1,
    currency: 'USD',
    unit: 'perMillionTokens',
    entries: [
      {
        provider: 'anthropic',
        model: 'claude-fable-5-1',
        prices: {
          input: 10,
          cacheWrite: 12.5,
          cacheWriteExtended: 20,
          cacheRead: 0.25,
          output: 50,
        },
        source: 'https://example.test/anthropic',
        accessedAt: '2026-10-22',
      },
      {
        provider: 'anthropic',
        model: 'claude-no-extended',
        prices: { input: 10, cacheWrite: 12.5, cacheRead: 1, output: 50 },
        source: 'https://example.test/anthropic',
        accessedAt: '2026-10-22',
      },
      {
        provider: 'openai',
        model: 'gpt-6-sol',
        prices: { input: 2, cacheWrite: 2.5, cacheRead: 0.2, output: 10 },
        source: 'https://example.test/openai',
        accessedAt: '2026-10-22',
      },
    ],
  });
}

function git(repository: string, argv: string[]): string {
  const run = Bun.spawnSync(['git', '-C', repository, ...argv], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.test',
      GIT_COMMITTER_NAME: 'Fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.test',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
    },
  });
  if (run.exitCode !== 0)
    throw new Error(`fixture git ${argv.join(' ')} failed: ${run.stderr.toString()}`);
  return run.stdout.toString();
}

function commitAt(repository: string, message: string, epochSeconds: number, file: string): void {
  writeFileSync(join(repository, file), `${message}\n`);
  git(repository, ['add', '-A']);
  const stamp = `${String(epochSeconds)} +0000`;
  Bun.spawnSync(['git', '-C', repository, 'commit', '-q', '--no-verify', '-m', message], {
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: stamp,
      GIT_COMMITTER_DATE: stamp,
      GIT_AUTHOR_NAME: 'Fixture',
      GIT_AUTHOR_EMAIL: 'f@example.test',
      GIT_COMMITTER_NAME: 'Fixture',
      GIT_COMMITTER_EMAIL: 'f@example.test',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
    },
  });
}

function mergeAt(repository: string, branch: string, number: number, epochSeconds: number): void {
  const stamp = `${String(epochSeconds)} +0000`;
  const run = Bun.spawnSync(
    [
      'git',
      '-C',
      repository,
      'merge',
      '--no-ff',
      '--no-verify',
      '-q',
      '-m',
      `Merge pull request #${String(number)} from ${slug.split('/')[0] ?? ''}/${branch}`,
      branch,
    ],
    {
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: stamp,
        GIT_COMMITTER_DATE: stamp,
        GIT_AUTHOR_NAME: 'Fixture',
        GIT_AUTHOR_EMAIL: 'f@example.test',
        GIT_COMMITTER_NAME: 'Fixture',
        GIT_COMMITTER_EMAIL: 'f@example.test',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  if (run.exitCode !== 0) throw new Error(`fixture merge failed: ${run.stderr.toString()}`);
}

/**
 * A repository whose `main` merged PR 10 from `plan/x` at 2026-10-17T00:00Z after `plan/x` merged
 * PR 8 from `feat/a` and PR 9 from `feat/b`, then PR 11 from `feat/c` at 2026-10-18T00:00Z, then
 * a hand-written merge of `feat/d` at 2026-10-19T00:00Z, and PR 12 from `feat/e` outside the
 * period at 2026-10-25T00:00Z.
 */
export function fixtureRepository(repository: string): string {
  mkdirSync(repository, { recursive: true });
  git(repository, ['init', '-q', '-b', 'main']);
  git(repository, ['remote', 'add', 'origin', `git@github.com:${slug}.git`]);
  const day = 86400;
  const base = Date.UTC(2026, 9, 15) / 1000;
  commitAt(repository, 'root', base, 'README.md');
  git(repository, ['switch', '-q', '-c', 'plan/x']);
  git(repository, ['switch', '-q', '-c', 'feat/a']);
  commitAt(repository, 'a', base + 3600, 'a.txt');
  git(repository, ['switch', '-q', 'plan/x']);
  mergeAt(repository, 'feat/a', 8, base + 7200);
  git(repository, ['switch', '-q', '-c', 'feat/b']);
  commitAt(repository, 'b', base + 10800, 'b.txt');
  git(repository, ['switch', '-q', 'plan/x']);
  mergeAt(repository, 'feat/b', 9, base + 14400);
  git(repository, ['switch', '-q', 'main']);
  mergeAt(repository, 'plan/x', 10, base + 2 * day);
  git(repository, ['switch', '-q', '-c', 'feat/c']);
  commitAt(repository, 'c', base + 2 * day + 3600, 'c.txt');
  git(repository, ['switch', '-q', 'main']);
  mergeAt(repository, 'feat/c', 11, base + 3 * day);
  git(repository, ['switch', '-q', '-c', 'feat/d']);
  commitAt(repository, 'd', base + 3 * day + 3600, 'd.txt');
  git(repository, ['switch', '-q', 'main']);
  const stamp = `${String(base + 4 * day)} +0000`;
  Bun.spawnSync(
    [
      'git',
      '-C',
      repository,
      'merge',
      '--no-ff',
      '--no-verify',
      '-q',
      '-m',
      'Merge branch feat/d by hand',
      'feat/d',
    ],
    {
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: stamp,
        GIT_COMMITTER_DATE: stamp,
        GIT_AUTHOR_NAME: 'Fixture',
        GIT_AUTHOR_EMAIL: 'f@example.test',
        GIT_COMMITTER_NAME: 'Fixture',
        GIT_COMMITTER_EMAIL: 'f@example.test',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
      },
    },
  );
  git(repository, ['switch', '-q', '-c', 'feat/e']);
  commitAt(repository, 'e', base + 9 * day, 'e.txt');
  git(repository, ['switch', '-q', 'main']);
  mergeAt(repository, 'feat/e', 12, base + 10 * day);
  return repository;
}

export const period = { since: '2026-10-15T00:00:00Z', until: '2026-10-22T00:00:00Z' };
