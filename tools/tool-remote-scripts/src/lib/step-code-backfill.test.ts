import { describe, expect, it } from 'bun:test';

import { backfillStepCodesCommand, runStepCodeBackfill } from './step-code-backfill';

describe('backfillStepCodesCommand', () => {
  it('runs the stable backfill entrypoint in the incoming container', () => {
    expect(backfillStepCodesCommand('be-01-green')).toEqual([
      'exec',
      'be-01-green',
      'bun',
      'run',
      'src/backfill-step-codes-cli.ts',
    ]);
  });
});

describe('runStepCodeBackfill', () => {
  it('answers what the CLI printed when it succeeds', async () => {
    const ran: string[][] = [];
    const printed = await runStepCodeBackfill('be-01-green', async (args) => {
      ran.push(args);
      return await Promise.resolve('step codes backfilled: 2\n');
    });
    expect(printed).toBe('step codes backfilled: 2\n');
    expect(ran).toEqual([backfillStepCodesCommand('be-01-green')]);
  });

  /**
   * Proof: with the rejection caught and the swap carried on (the catch
   * answering `''` instead of throwing), this case failed on
   * `Expected path: "message"` — the swap would have committed a deploy
   * whose backfill never ran; watched 2026-09-27.
   */
  it('fails the swap loudly, naming the command that finishes the job by hand', async () => {
    let caught: unknown;
    try {
      await runStepCodeBackfill('be-01-green', () =>
        Promise.reject(new Error('docker exec be-01-green … failed: no such table: step')),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toHaveProperty(
      'message',
      'step-code backfill failed on be-01-green; the new colour is serving with uncoded steps. ' +
        'Finish it by hand: docker exec be-01-green bun run src/backfill-step-codes-cli.ts',
    );
  });
});
