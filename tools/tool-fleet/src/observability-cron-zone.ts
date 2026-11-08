import zones from './observability-cron-zones.json';

// Proof: Task54 catalogue-dependency dropping Europe/Kyiv added a false knowledge blocker in native valid-unsupported controls.
const catalogue = new Set(zones);

export type CronTimeZone =
  | { readonly kind: 'absent' }
  | { readonly kind: 'known'; readonly name: string }
  | { readonly kind: 'outside-catalogue'; readonly name: string };

/** Applies Kubernetes1.36.4 fresh timeZone component/Local predicates without a host lookup.
 * Source: https://github.com/kubernetes/kubernetes/blob/v1.36.4/pkg/apis/batch/validation/validation.go (validateTimeZone).
 * Membership is the exact598-name Go1.26.0 zoneinfo.zip catalogue, SHA256 9c76a97bdff88983c7c9b70516d4a7c38aa8cd0cac2f176c6e8b967a80c09037.
 * A miss is outside pinned knowledge, not universal invalidity (right/UTC can resolve through host fallback).
 * Absence stays absent; malformed components, empty and case-insensitive Local throw. No implicit UTC or runtime equality.
 */
export function readCronTimeZone(name: string | undefined): CronTimeZone {
  if (name === undefined) return { kind: 'absent' };
  // Proof: Task54 zone-Local removal admitted mixed-case Local; zone-components bypass admitted six malformed native zone variants.
  if (
    name.toLowerCase() === 'local' ||
    name
      .split('/')
      .some(
        (part) =>
          part === '.' ||
          part === '..' ||
          part.startsWith('-') ||
          !/^[A-Za-z.\-_0-9+]{1,14}$/.test(part),
      )
  )
    throw new Error('Cron timeZone malformed');
  return { kind: catalogue.has(name) ? 'known' : 'outside-catalogue', name };
}
