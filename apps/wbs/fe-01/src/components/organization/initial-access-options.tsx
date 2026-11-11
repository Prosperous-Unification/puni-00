import type { listInvitations } from '@wbs/contracts';
import { type ClientReply } from '@wbs/contracts';

/** The bounded initial-access selection shared by invitation and join-approval forms. */
export type InitialRoleId = Extract<
  ClientReply<typeof listInvitations>,
  { kind: 'success' }
>['body']['invitations'][number]['initialRoleId'];
const choices = [
  { id: 'org-admin', name: 'Organization admin' },
  { id: 'org-viewer', name: 'Organization viewer' },
  { id: 'project-contributor', name: 'Project contributor' },
  { id: 'project-viewer', name: 'Project viewer' },
] as const;

/** Describes an explicit initial grant or membership without an initial grant. */
export function readInitialAccessName(roleId: InitialRoleId): string {
  return roleId === null
    ? 'No initial access'
    : /* Proof: initial-role-metadata: removed/changed production boundary.
       * throws for impossible role metadata instead of displaying an absent role label
       * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
      (choices.find((choice) => choice.id === roleId)?.name ?? failInitialRole(roleId));
}

/** Values come only from this finite select; an impossible DOM option reaches the error boundary. */
export function readInitialRoleId(value: string): InitialRoleId {
  if (value === '') return null;
  const selected = choices.find((choice) => choice.id === value);
  /* Proof: initial-dom-diagnostic: removed/changed production boundary.
   * reports impossible DOM selection at its actual bounded reader
   * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
  if (selected === undefined) return failInitialRole(value);
  return selected.id;
}
function failInitialRole(value: string): never {
  throw new Error('Unexpected initial access option: ' + value);
}

/** Both administration forms offer the same four catalogue roles or no initial access. */
export function InitialAccessOptions(): React.JSX.Element {
  return (
    <>
      <option value="">No initial access</option>
      {choices.map((choice) => (
        <option key={choice.id} value={choice.id}>
          {choice.name}
        </option>
      ))}
    </>
  );
}
