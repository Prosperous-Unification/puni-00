/**
 * A load read's refusal in the reader's words. The two organization refusals
 * say what to do; anything else (a request boundary refusal) is a read that
 * failed.
 */
export function loadRefusalWords(error: string): string {
  switch (error) {
    case 'no_active_organization':
      return 'Choose an organization to see its people’s load.';
    case 'not_a_member':
      return 'You are no longer a member of this organization.';
    default:
      return 'The load could not be read. Try again.';
  }
}
