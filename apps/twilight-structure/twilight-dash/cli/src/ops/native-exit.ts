import { constants } from 'node:os';

const nativeSignals: ReadonlyMap<string, number> = new Map(Object.entries(constants.signals));
type Termination =
  | { readonly kind: 'confirmed'; readonly status: number }
  | { readonly kind: 'unconfirmed'; readonly cause: Error };

/** Decode observed native fields, including Bun1.4.4's named signals and its documented numeric form. */
export function readTermination(code: unknown, signal: unknown): Termination {
  // Proof: bypassing absent-signal qualification confirmed both identities in native-exit.test.ts.
  if (signal === null) {
    // Proof: removing the code check confirmed string37 in native-exit.test.ts.
    // Proof: removing individual integer/range checks admitted 1.5, -1 and 256 in native-exit.test.ts.
    if (typeof code === 'number' && Number.isInteger(code) && code >= 0 && code <= 255)
      return { kind: 'confirmed', status: code };
    // Proof: bypassing absent-code qualification confirmed both identities in native-exit.test.ts.
  } else if (code === null) {
    const number = typeof signal === 'string' ? nativeSignals.get(signal) : signal;
    // Proof: removing the signal check confirmed signal0 in native-exit.test.ts.
    // Proof: removing individual integer/range checks admitted 1.5, 0 and 128 in native-exit.test.ts.
    if (typeof number === 'number' && Number.isInteger(number) && number > 0 && number < 128)
      return { kind: 'confirmed', status: 128 + number };
  }
  return { kind: 'unconfirmed', cause: new Error('native exit identity is invalid') };
}
