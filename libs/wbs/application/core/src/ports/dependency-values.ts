/** A finish-to-start edge as it is stored: either end may be a parent. */
export interface StoredDependency {
  id: string;
  projectId: string;
  predecessorId: string;
  successorId: string;
}
