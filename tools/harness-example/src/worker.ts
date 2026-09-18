import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { type } from 'arktype';

import { connectAcpAgent } from './acp';
import { fakeAcpStream } from './fake-acp-agent';
import { buildHarness } from './harness';

const WorkerEnvironment = type({
  PUNI_RUN_ID: /^[a-z0-9][a-z0-9-]{0,39}$/,
  PUNI_WORKSPACE: /^\/.+/,
  PUNI_SCENARIO: "'complete' | 'exhaust-memory' | 'exhaust-disk'",
  PUNI_HOLD_SECONDS: /^\d{1,4}$/,
});

export type WorkerEnvironment = typeof WorkerEnvironment.infer;

/** One JSON line on stdout; the node's log agent ships it, but completion never waits on that. */
export type WorkerEvent =
  | { readonly event: 'synthetic-start'; readonly runId: string; readonly pod: string }
  | { readonly event: 'synthetic-heartbeat'; readonly runId: string; readonly second: number }
  | { readonly event: 'synthetic-cancelled'; readonly runId: string; readonly signal: string }
  | {
      readonly event: 'synthetic-complete';
      readonly runId: string;
      readonly files: readonly { readonly name: string; readonly sha256: string }[];
    }
  | { readonly event: 'synthetic-exhausting'; readonly runId: string; readonly bytes: number };

/** Decode the worker's environment once; anything missing or malformed throws. */
export function decodeWorkerEnvironment(environment: Record<string, string | undefined>) {
  const decoded = WorkerEnvironment({
    PUNI_RUN_ID: environment['PUNI_RUN_ID'],
    PUNI_WORKSPACE: environment['PUNI_WORKSPACE'],
    PUNI_SCENARIO: environment['PUNI_SCENARIO'],
    PUNI_HOLD_SECONDS: environment['PUNI_HOLD_SECONDS'],
  });
  if (decoded instanceof type.errors) {
    throw new Error(`synthetic worker environment is invalid: ${decoded.summary}`);
  }
  return decoded;
}

/**
 * Run the fake ACP harness once in `workspace` and return the digests of what it wrote.
 *
 * The workspace must be empty: a pod the Job controller starts again gets a fresh scratch
 * volume, so a non-empty one means two runs share a directory. Throws unless all three
 * files exist and each was revised in its own session.
 */
export async function runSyntheticSession(
  runId: string,
  workspace: string,
  delayMs: number,
): Promise<readonly { name: string; sha256: string }[]> {
  if ((await readdir(workspace)).length > 0) {
    // Proof: with this guard removed, worker.test.ts's reused-workspace negative completed.
    throw new Error(`synthetic workspace ${workspace} is not empty`);
  }
  const { stream, close } = fakeAcpStream(delayMs);
  const agent = await connectAcpAgent(stream, close);
  try {
    const final = await buildHarness(agent).invoke({
      prompt: `synthetic ${runId}`,
      cwd: workspace,
    });
    if (!final.outcomes.every((outcome) => outcome.headerOk)) {
      throw new Error('synthetic session lost a revision: a turn left its session');
    }
  } finally {
    agent.close();
  }
  const names = (await readdir(workspace)).sort();
  return Promise.all(
    names.map(async (name) => ({
      name,
      sha256: createHash('sha256')
        .update(await readFile(path.join(workspace, name)))
        .digest('hex'),
    })),
  );
}

function emit(event: WorkerEvent): void {
  console.log(JSON.stringify(event));
}

/**
 * Worker Job entrypoint for fleet infrastructure drills only. It proves scheduling,
 * cancellation, eviction and limits; it is not Twilight's worker contract, and the fake
 * agent never asks for permission, so nothing here authorizes fleet or production effects.
 */
async function main(): Promise<void> {
  const environment = decodeWorkerEnvironment(process.env);
  const runId = environment.PUNI_RUN_ID;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      // Cancellation is a controlled exit: the Job records it and the authority decides.
      emit({ event: 'synthetic-cancelled', runId, signal });
      process.exit(143);
    });
  }
  emit({ event: 'synthetic-start', runId, pod: process.env['HOSTNAME'] ?? 'unknown' });
  for (let second = 1; second <= Number(environment.PUNI_HOLD_SECONDS); second += 1) {
    await Bun.sleep(1000);
    emit({ event: 'synthetic-heartbeat', runId, second });
  }
  if (environment.PUNI_SCENARIO === 'exhaust-memory') {
    const retained: Buffer[] = [];
    for (;;) {
      retained.push(Buffer.alloc(16 * 1024 * 1024, 1));
      emit({ event: 'synthetic-exhausting', runId, bytes: retained.length * 16 * 1024 * 1024 });
      await Bun.sleep(50);
    }
  }
  if (environment.PUNI_SCENARIO === 'exhaust-disk') {
    const chunk = Buffer.alloc(8 * 1024 * 1024, 1);
    for (let index = 0; ; index += 1) {
      await writeFile(path.join(environment.PUNI_WORKSPACE, `fill-${String(index)}`), chunk);
      emit({ event: 'synthetic-exhausting', runId, bytes: (index + 1) * chunk.length });
      await Bun.sleep(50);
    }
  }
  const files = await runSyntheticSession(runId, environment.PUNI_WORKSPACE, 200);
  emit({ event: 'synthetic-complete', runId, files });
}

if (import.meta.main) await main();
