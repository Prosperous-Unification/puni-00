import { type } from 'arktype';
import { parseAllDocuments } from 'yaml';

const List = type({ apiVersion: "'v1'", kind: "'List'", items: 'unknown[]', '+': 'reject' });
const Identity = type({
  apiVersion: 'string>0',
  kind: 'string>0',
  metadata: { name: 'string>0', 'namespace?': 'string>0' },
});
const Manifest = type('Record<string,unknown>');

/** Structural decoding only; callers retain their own API, namespace and ownership policies. */
export function decodeRenderedResources(bytes: string) {
  const resources: {
    pointer: string;
    identity: typeof Identity.infer;
    manifest: Record<string, unknown>;
  }[] = [];
  function visit(manifest: unknown, pointer: string): void {
    const kind = type({ kind: 'string' }).assert(manifest).kind;
    if (kind === 'List') {
      // Proof: Task25c2a list-members omission lost native List member coordinates in the production fold.
      List.assert(manifest).items.forEach((member, index) => {
        visit(member, `${pointer}/items/${String(index)}`);
      });
    } else
      resources.push({
        pointer,
        identity: Identity.assert(manifest),
        manifest: Manifest.assert(manifest),
      });
  }
  parseAllDocuments(bytes).forEach((document, index) => {
    // Proof: Task25c2a yaml-errors removal admitted duplicate YAML keys in the structural boundary negative.
    if (document.errors.length) throw new Error('Observability source malformed rendered YAML');
    const manifest: unknown = document.toJSON();
    if (manifest !== null) visit(manifest, `/${String(index)}`);
  });
  return resources;
}
