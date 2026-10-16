/**
 * Announces a project's complete tree through the supplying scope's collector.
 * Composition passes the resource instance so its method retains its receiver.
 */
export interface TreeAnnouncement {
  /** Publishes the current tree through the already composed announcement path. */
  announceTreeNow(projectId: string): Promise<void>;
}
