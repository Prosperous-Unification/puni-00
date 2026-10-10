/**
 * The deploy smoke check's answer: the validated text, unchanged.
 *
 * Pure domain code rather than a service, as the backend module map decided:
 * delivery calls it directly and constructs nothing.
 */
export function echoSmokeText(text: string): string {
  return text;
}
