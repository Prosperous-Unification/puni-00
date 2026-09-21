/** The ownership facts a write gate reads, and nothing else a project carries. */
export interface ProjectOwnership {
  readonly ownerId: string;
  readonly restricted: boolean;
}

/**
 * Whether `actorId` may write to the project those ownership facts describe.
 *
 * Domain code because every resource and feature that writes a plan asks the
 * same question, and a resource asking a sibling resource for it is the sideways
 * import K6 forbids. Reading is deliberately not gated: an unrestricted project
 * is editable by any authenticated account, and a restricted one is readable by
 * all and writable only by its owner.
 *
 * Proof: forcing this function to return `true` made `announces nothing for a
 * write it refused` receive an `ok: true` marker instead of the expected
 * `forbidden` refusal; watched 2026-09-22.
 */
export function canEditProject(project: ProjectOwnership, actorId: string): boolean {
  return !project.restricted || project.ownerId === actorId;
}
