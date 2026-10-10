import { solveBrowserCheck } from '@website/contracts';

import type { BrowserChallenge } from './build-contract';

/** Solves a challenge; null when no number matches. Rejects when solving is impossible here. */
export type BrowserCheckSolver = (challenge: BrowserChallenge) => Promise<number | null>;

/** The performance measure each browser solve records, read by the browser regression. */
export const browserCheckMeasure = 'puni-browser-check';

/**
 * Solves in a Web Worker, so the page stays responsive. A browser without Worker support (the
 * constructor throws) solves on the main thread instead; a worker that fails rejects. Records the
 * end-to-end time as the `puni-browser-check` performance measure.
 */
export const solveInBrowser: BrowserCheckSolver = (challenge) => {
  const startedAt = performance.now();
  const record = (number: number | null) => {
    performance.measure(browserCheckMeasure, {
      start: startedAt,
      end: performance.now(),
      detail: { maxnumber: challenge.maxnumber },
    });
    return number;
  };
  let worker: Worker;
  try {
    worker = new Worker(new URL('./browser-check.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    // No Worker support: the same synchronous solve on the main thread.
    return Promise.resolve().then(() =>
      record(solveBrowserCheck(challenge.salt, challenge.challenge, challenge.maxnumber)),
    );
  }
  return new Promise((resolve, reject) => {
    worker.addEventListener('message', (event: MessageEvent<unknown>) => {
      worker.terminate();
      const answer = event.data;
      if (
        typeof answer !== 'object' ||
        answer === null ||
        !('number' in answer) ||
        (answer.number !== null && typeof answer.number !== 'number')
      ) {
        reject(new Error('Browser check worker answered malformed data'));
        return;
      }
      resolve(record(answer.number));
    });
    worker.addEventListener('error', () => {
      worker.terminate();
      reject(new Error('Browser check worker failed'));
    });
    worker.postMessage({
      salt: challenge.salt,
      challenge: challenge.challenge,
      maxnumber: challenge.maxnumber,
    });
  });
};
