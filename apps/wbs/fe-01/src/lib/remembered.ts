import { browserPreferences } from '@/modules/preferences/composition';
import type { Claim, Remembered } from '@/modules/preferences/contract';

export type { Claim, Remembered };

/**
 * A remembered answer as it stood at the instant it was asked for, and whether a
 * live runtime was there to answer.
 *
 * `persists: false` is the visible degradation rule R5 asks for when the page
 * has no live runtime: `value` is then the caller's own documented default —
 * exactly what an unread key already produces — and nothing was read, dropped or
 * written. A caller that shows `value` either way still has the answer to "is
 * this being remembered" in its hands, rather than a default it cannot tell
 * apart from a stored one.
 */
export interface Recalled<T> {
  readonly value: T;
  readonly persists: boolean;
}

/**
 * The store for one key, judged by one guard — the preferences service's now.
 *
 * Kept as a free function at this path because the layout module builds a store
 * per project id and imports it here, and an extraction that renamed every call
 * site would be a diff nobody can review against "no behaviour changed". The
 * knowledge moved; the spelling did not.
 */
export function remembered<T>(
  key: string,
  isValid: (claimed: unknown) => claimed is T,
): Remembered<T> {
  return browserPreferences.json(key, isValid);
}

/** The same store for a key written as **bare text** rather than as JSON. */
export function rememberedText<T extends string>(
  key: string,
  isValid: (stored: string) => stored is T,
): Remembered<T> {
  return browserPreferences.text(key, isValid);
}
