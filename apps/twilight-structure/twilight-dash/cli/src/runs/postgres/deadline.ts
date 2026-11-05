/**
 * Bounds observation without cancelling the underlying work. The resource owner
 * must still drain and dispose it; both late outcomes retain rejection observers.
 */
export function awaitCompletion<T>(work: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  const completion = Promise.withResolvers<T>();
  const abort = () => {
    completion.reject(signal.reason);
  };
  // Proof: D1 removed the listener; the deliberately released real promise resolved and the abort rejection assertion failed.
  signal.addEventListener('abort', abort, { once: true });
  Promise.resolve(work).then(
    (value) => {
      signal.removeEventListener('abort', abort);
      completion.resolve(value);
    },
    (cause: unknown) => {
      signal.removeEventListener('abort', abort);
      completion.reject(cause);
    },
  );
  // Proof: D2 removed this check; already-aborted work returned 17 instead of its original abort cause.
  if (signal.aborted) abort();
  return completion.promise;
}
