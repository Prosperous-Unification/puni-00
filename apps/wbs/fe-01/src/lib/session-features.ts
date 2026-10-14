import type { SessionFeatures } from '@wbs/contracts';
import { createContext, useContext } from 'react';

/**
 * The deployment features the session read reported, or `null` when the
 * backend did not report them (one older than `session-features`).
 *
 * `null` keeps the reads a feature's surfaces issue, and their refusals still
 * render the modelled states; a reported `false` means the surface renders its
 * "not active" state without asking. Outside {@link SessionFeaturesProvider}
 * the value is `null`, so a surface rendered alone keeps asking.
 */
const SessionFeaturesContext = createContext<SessionFeatures | null>(null);

/** Supplies what `App`'s session read reported to every signed-in surface. */
export const SessionFeaturesProvider = SessionFeaturesContext.Provider;

/**
 * Whether a surface may issue `feature`'s reads: true unless the session read
 * reported the feature off for this deployment.
 */
export function useFeatureReachable(feature: keyof SessionFeatures): boolean {
  return useContext(SessionFeaturesContext)?.[feature] ?? true;
}
