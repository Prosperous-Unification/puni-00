import { solveBrowserCheck } from '@website/contracts';

/**
 * Solves one browser check off the main thread: receives `{ salt, challenge, maxnumber }` and
 * posts back `{ number }`, null when no number in range matches.
 */
globalThis.addEventListener('message', (event: MessageEvent<unknown>) => {
  const request = event.data;
  if (
    typeof request !== 'object' ||
    request === null ||
    !('salt' in request) ||
    typeof request.salt !== 'string' ||
    !('challenge' in request) ||
    typeof request.challenge !== 'string' ||
    !('maxnumber' in request) ||
    typeof request.maxnumber !== 'number'
  )
    throw new Error('Browser check worker received a malformed request');
  const number = solveBrowserCheck(request.salt, request.challenge, request.maxnumber);
  // A dedicated worker's postMessage takes one argument; the DOM typings only know Window's.
  (globalThis as unknown as { postMessage(message: unknown): void }).postMessage({ number });
});
