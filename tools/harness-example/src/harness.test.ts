import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'bun:test';

import { connectAcpAgent } from './acp';
import { fakeAcpStream } from './fake-acp-agent';
import { buildHarness } from './harness';
import { describeUpdate, type HarnessEvent } from './log';

const DELAY_MS = 300;

async function runOnce() {
  const cwd = await mkdtemp(path.join(tmpdir(), 'harness-example-'));
  const { stream, close } = fakeAcpStream(DELAY_MS);
  const agent = await connectAcpAgent(stream, close);
  const started = Date.now();
  const final = await buildHarness(agent).invoke({ prompt: 'x', cwd });
  return { final, cwd, elapsedMs: Date.now() - started };
}

describe('buildHarness', () => {
  it('gives every task its own session and revises through it', async () => {
    const { final, cwd } = await runOnce();
    expect(final.tasks.map((t) => t.id)).toEqual(['task-a', 'task-b', 'task-c']);
    expect(Object.keys(final.sessions).sort()).toEqual(['task-a', 'task-b', 'task-c']);
    expect(new Set(Object.values(final.sessions)).size).toBe(3);
    expect((await readdir(cwd)).sort()).toEqual(['part-a.txt', 'part-b.txt', 'part-c.txt']);
    // Proof: with `revise` sending its turn into `await agent.newSession(cwd)`
    // instead of `state.sessionId` (the harness forgetting the session), this
    // failed on `Expected: true · Received: false`: the fake agent's fresh
    // session had no file to revise. And with `sessions`' ReducedValue replaced
    // by a plain schema, `invoke` threw before any assertion: `InvalidUpdateError:
    // Invalid update for channel "sessions" with values
    // [{"task-a":"fake-2"},{"task-b":"fake-3"},{"task-c":"fake-4"}]: LastValue can
    // only receive one value per step`. Both watched 2026-09-12.
    expect(final.outcomes.every((o) => o.headerOk)).toBe(true);
    expect(final.outcomes.map((o) => o.replayedTurns)).toEqual([4, 4, 4]);
    expect(final.summary).toStartWith('3 tasks, 0 failed');
  });

  it('runs the implement branches in parallel', async () => {
    const { elapsedMs } = await runOnce();
    // One plan turn, then two fan-outs of three turns each: 900ms if the
    // branches overlap, 2100ms if they run one after another.
    // Proof: with every `prompt` in `connectAcpAgent` chained behind one shared
    // promise (the shape of an accidental global lock in the client), this
    // failed on `Expected: < 1200 · Received: 2142`. Watched 2026-09-12.
    expect(elapsedMs).toBeLessThan(4 * DELAY_MS);
  });
});

describe('buildHarness stream', () => {
  it('forwards every agent update tagged with its node and task', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'harness-example-'));
    const { stream, close } = fakeAcpStream(DELAY_MS);
    const agent = await connectAcpAgent(stream, close);
    const events: HarnessEvent[] = [];
    const run = await buildHarness(agent).stream({ prompt: 'x', cwd }, { streamMode: ['custom'] });
    for await (const [, chunk] of run) events.push(chunk as HarnessEvent);
    const said = (node: string, task: string) =>
      events
        .filter((e) => e.node === node && e.task === task)
        .map((e) => describeUpdate(e.update))
        .filter((line): line is string => line !== null);
    // Proof: with `connectAcpAgent`'s collector keeping updates for the return
    // value but never calling `onUpdate`, the first assertion failed on
    // `expect(received).toEqual(expected) · - Expected - 3 · + Received + 1`:
    // the stream carried no event for implement/task-a. Watched 2026-09-13.
    expect(said('implement', 'task-a')).toEqual(['says  wrote part-a.txt']);
    expect(said('revise', 'task-a')).toEqual(['says  revised part-a.txt']);
    expect(events.filter((e) => e.node === 'plan').map((e) => e.task)).toEqual([null]);
    expect(new Set(events.map((e) => e.task)).size).toBe(4);
  });
});
