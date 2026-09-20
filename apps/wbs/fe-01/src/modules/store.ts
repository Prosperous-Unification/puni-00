/**
 * What every stateful frontend service exposes, and the only way delivery reads
 * one — rule F2 of the code organization design.
 *
 * Two members and no more. A component subscribes and reads; it never receives a
 * setter, because the whole point of the split is that the decision about what
 * changes lives in the service.
 *
 * **The stability rule.** `snapshot` answers the *same object* on every call
 * until something inside it has changed, and a *different* object on the first
 * call after it has. Both halves are load-bearing and each fails its own way: a
 * snapshot rebuilt on every call makes `useSyncExternalStore` re-render on every
 * check and, inside a render, throws "getSnapshot should be cached"; a snapshot
 * left identical after a real change makes the screen ignore the change,
 * silently, with no error anywhere. The comparison a service makes is per field
 * and by identity, not deep.
 *
 * Function-typed properties rather than method signatures, because that is what
 * they are — closures in an object literal — and because a method signature
 * makes `@typescript-eslint/unbound-method` fire at every caller that passes one
 * as a bare function, which is exactly how `useSyncExternalStore` takes them.
 *
 * Created by packet 040.6 as its first user, which is the batch assumption
 * "one shared store contract, created by its first user".
 */
export interface Store<T> {
  /** Registers a listener and answers the way to drop it. */
  readonly subscribe: (onChange: () => void) => () => void;
  /** The current value. The same object until something in it changed. */
  readonly snapshot: () => T;
}
