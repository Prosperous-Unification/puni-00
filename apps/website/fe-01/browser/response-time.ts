/** The one approved response-time promise: the chat receipt's email contact sentence. */
export const approvedResponsePromise = 'PUNI will contact you by email within 4 hours.';

/**
 * W11 for a captured page's visible text: a person reads every request and replies by email, so
 * no page states a response time except {@link approvedResponsePromise}, exactly as written.
 * Returns the first other promise, or null.
 */
export function findResponseTimePromise(text: string): string | null {
  return /within \d+ (hours|days)/i.exec(text.replaceAll(approvedResponsePromise, ''))?.[0] ?? null;
}
