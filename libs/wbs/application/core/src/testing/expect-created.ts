/** Narrows a test fixture write whose premise requires successful work package creation. */
export function expectCreated<T extends object>(created: T | string): T {
  if (typeof created === 'string')
    throw new Error(`fixture work package creation refused: ${created}`);
  return created;
}
