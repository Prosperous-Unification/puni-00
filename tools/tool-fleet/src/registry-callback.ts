/** Invoke immediately and adopt the callback outcome into a fresh native Promise; synchronous throws become exact rejections. Native resolution flattens thenables, represented by Awaited on the callable overload while the implementation keeps unknown outcomes opaque. Registry ports and test adapters preserve their async-call contract without invented awaited I/O. */
export function invokeRegistryCallback<T>(run: () => T): Promise<Awaited<T>>;
export function invokeRegistryCallback(run: () => unknown): Promise<unknown> {
  // Proof: Promise.try reuses native inputs; direct/deferred invocation loses fresh identity, exact rejection or immediate callback cases in registry-callback.test.ts.
  return new Promise((resolve) => {
    // Proof: omitted/duplicated invocation fails the immediate-once/value witnesses; native resolution retains foreign-thenable/getter failures.
    resolve(run());
  });
}
