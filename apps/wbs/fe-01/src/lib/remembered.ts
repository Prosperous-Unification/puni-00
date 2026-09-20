import { browserPreferences } from '@/modules/preferences/composition';
import type { Claim, Remembered } from '@/modules/preferences/contract';

export type { Claim, Remembered };

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
