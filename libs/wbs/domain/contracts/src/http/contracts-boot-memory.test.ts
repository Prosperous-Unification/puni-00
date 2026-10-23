import { describe, expect, it } from 'bun:test';

import { commandParserRefusal } from './command-parser-refusal';

/**
 * What loading every HTTP shape costs a fresh process, over arktype alone: the
 * shapes are compiled at import, and mcp-01 builds its tools from all of them
 * at boot inside a 512 Mi pod (`tools/tool-deploy` manifest). Slice 4 of
 * `wbs-measure-budgets` pushed that boot past the limit (OOMKilled in the k3s
 * rehearsal) because 210 refusal arms each repeated the command-kind
 * enumeration; design D47 collapses them.
 *
 * Measured in a child process so this test's own imports do not count. The
 * bound sits between the measured cost after the fix (370 MB on the laptop)
 * and before it.
 *
 * Proof: with `commandParserRefusal`'s 132 arms and the batch refusals' 78
 * restored, this case read 756 MB (684 MB with the parser arms alone
 * restored); watched 2026-10-23.
 */
const MOST_SHAPE_LOAD_MB = 500;

describe('the HTTP shapes at load', () => {
  it('bounds the memory the contracts take to load', async () => {
    const shapes = new URL('./shapes.ts', import.meta.url).pathname;
    const script = `
      await import('arktype');
      const before = process.memoryUsage().rss;
      await import(${JSON.stringify(shapes)});
      console.log('load_mb=' + String(Math.round((process.memoryUsage().rss - before) / 1e6)));
    `;
    const child = Bun.spawn([process.execPath, '-e', script], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, NODE_ENV: 'production' },
    });
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0) throw new Error(`loading the shapes failed: ${err}`);
    // Only the marked line: a runner may print its own lines (coverage) too.
    const loadMb = Number(/load_mb=(\d+)/.exec(out)?.[1]);
    expect({ out, finite: Number.isFinite(loadMb) }).toMatchObject({ finite: true });
    expect(loadMb).toBeLessThan(MOST_SHAPE_LOAD_MB);
  }, 60_000);
});

describe('the collapsed parser refusal', () => {
  // Proof: with the codes' enumeration made `'string'`, this case admitted
  // `not_a_code`; watched 2026-10-23.
  it('admits a known code with its context and refuses an unknown code or kind', () => {
    const admits = (value: unknown): boolean => {
      const checked = commandParserRefusal.validator['~standard'].validate(value);
      if (checked instanceof Promise)
        throw new Error('the parser refusal validates asynchronously');
      return checked.issues === undefined;
    };
    expect(admits({ error: 'invalid_budget', at: 0, kind: 'setBudget' })).toBe(true);
    expect(admits({ error: 'expected_object' })).toBe(true);
    expect(admits({ error: 'not_a_code', at: 0, kind: 'setBudget' })).toBe(false);
    expect(admits({ error: 'invalid_budget', at: 0, kind: 'not_a_kind' })).toBe(false);
    expect(admits({ error: 'invalid_budget', at: 'first', kind: 'setBudget' })).toBe(false);
  });
});
