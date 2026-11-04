import { isPromise } from 'node:util/types';

/** Test-only assertion boundary: awaits the actual operation and refuses fulfillment. Retains the exact rejection, including primitive/nullish values, plus a synchronous thrower for existing toThrow matchers. */
export async function requireRejection(operation: unknown): Promise<{
  readonly cause: unknown;
  readonly throwCause: () => never;
}> {
  const pending = requirePromise(operation);
  try {
    await pending;
  } catch (cause) {
    return {
      cause,
      throwCause() {
        throw cause;
      },
    };
  }
  // Proof: removing this refusal certifies fulfilled Error/undefined/string inputs in registry-rejection.test.ts.
  throw new Error('Expected rejected operation');
}

/** Test-only explicitly awaited resolution. Preserves fulfilled values and rejected causes exactly, while refusing non-native Promise inputs before reading then. */
export async function requireResolution(operation: unknown): Promise<unknown> {
  return await requirePromise(operation);
}

function requirePromise(operation: unknown): Promise<unknown> {
  // Proof: removing native-Promise admission accepts rejecting thenables or invokes getters in registry-rejection.test.ts.
  if (!isPromise(operation)) throw new Error('Expected a native Promise operation');
  return operation;
}
