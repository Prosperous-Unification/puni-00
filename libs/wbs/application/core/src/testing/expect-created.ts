/** Narrows a test fixture write whose premise requires successful project creation. */
export function expectCreated<T extends object>(created: T | string): T {
  if (typeof created === 'string') throw new Error(`fixture project creation refused: ${created}`);
  return created;
}
