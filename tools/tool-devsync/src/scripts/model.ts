import type { JsonObject } from './configuration';

export type Location =
  | { readonly kind: 'file' }
  | { readonly kind: 'property'; readonly path: readonly (string | number)[] };
export type Runtime = 'bun' | 'node' | 'shell' | 'python' | 'external' | 'unknown';
export interface Context {
  readonly source: string;
  readonly location: readonly (string | number)[];
  readonly settings: JsonObject;
}
export type Target =
  | {
      readonly usage: 'program' | 'configuration';
      readonly kind: 'file';
      readonly path: string;
      readonly sha256: string;
    }
  | {
      readonly usage: 'program' | 'configuration';
      readonly kind: 'unavailable';
      readonly path: string;
      readonly reason: 'missing-or-ignored';
    }
  | { readonly usage: 'program' | 'configuration'; readonly kind: 'outside'; readonly path: string }
  | {
      readonly usage: 'program' | 'configuration';
      readonly kind: 'symlink' | 'gitlink';
      readonly path: string;
    };
export interface Consumer {
  readonly id: string;
  readonly source: string;
  readonly location: Location;
  readonly kind: 'entrypoint' | 'command' | 'reference';
  readonly body:
    | { readonly kind: 'file'; readonly sha256: string }
    | { readonly kind: 'command' | 'reference'; readonly text: string };
  readonly bodyDigest: string;
  readonly digest: string;
  readonly observedRuntime: Runtime;
  readonly invocation:
    | { readonly kind: 'argv'; readonly argv: readonly string[] }
    | { readonly kind: 'unresolved'; readonly reason: string };
  readonly resolution:
    { readonly kind: 'resolved' } | { readonly kind: 'unresolved'; readonly reason: string };
  readonly context: readonly Context[];
  readonly targets: readonly Target[];
}
