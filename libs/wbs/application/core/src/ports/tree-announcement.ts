/**
 * Announces a project's complete tree through the supplying scope's collector.
 * Composition passes the resource instance so its method retains its receiver.
 *
 * Proof: restoring the concrete work-item import directly or through this port's
 * re-export made the committed K6 boundary oracle fail with
 * `concrete work-item resource edge remains`; watched 2026-10-16. Commands and
 * candidate patches: `openspec/changes/tree-announcement-port-boundary/verify.md`.
 */
export interface TreeAnnouncement {
  /** Publishes the current tree through the already composed announcement path. */
  announceTreeNow(projectId: string): Promise<void>;
}
