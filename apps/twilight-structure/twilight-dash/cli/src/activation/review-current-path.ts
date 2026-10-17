export interface CurrentPathNode {
  readonly kind: 'file' | 'directory' | 'symlink';
}
/**
 * Walks retained POSIX components before parent normalization. The caller owns grammar,
 * finite-work accounting, target admission and miss policy. No host path operation occurs.
 */
export function walkRetainedCurrent<Node extends CurrentPathNode>(
  requestedPath: string,
  ports: {
    lookup(path: string): Node | undefined;
    readLink(path: string, node: Node, remaining: readonly string[]): string;
    step(depth: number): void;
    expand(resolved: readonly string[], target: string, remaining: readonly string[]): void;
    reject(reason: 'escape' | 'ancestor', path: string): never;
  },
): { path: string; node: Node | undefined } {
  const resolved: string[] = [];
  const remaining = requestedPath.split('/');
  while (remaining.length > 0) {
    ports.step(resolved.length + 1);
    const component = remaining.shift();
    if (component === undefined) throw new Error('retained component absent');
    if (component === '' || component === '.') continue;
    if (component === '..') {
      // Proof: ancestor-escape omission loses `component walk resolves` (named RED in final fault ledger).
      if (resolved.pop() === undefined) ports.reject('escape', requestedPath);
      continue;
    }
    const path = [...resolved, component].join('/');
    const node = ports.lookup(path);
    if (node === undefined) return { path: requestedPath, node: undefined };
    if (node.kind === 'symlink') {
      const target = ports.readLink(path, node, remaining);
      ports.expand(resolved, target, remaining);
      const parts = target.split('/');
      remaining.unshift(...parts);
      continue;
    }
    // Proof: ancestor-file omission loses `component walk resolves` (named RED in final fault ledger).
    if (node.kind === 'file' && remaining.length > 0) ports.reject('ancestor', path);
    resolved.push(component);
  }
  const path = resolved.join('/');
  return { path, node: ports.lookup(path) };
}
