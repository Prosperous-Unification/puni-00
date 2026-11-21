import { DiBag } from 'di-bag';

import type { AcceptedPlanReferenceExports, AcceptedPlanReferenceRequirements } from './contract';
import { acceptedPlanReferenceModule } from './module';

/** Installs the reference feature over the host's current WBS writer and clock. */
export function installAcceptedPlanReference({
  source,
  clock,
}: AcceptedPlanReferenceRequirements): AcceptedPlanReferenceExports {
  const bag = DiBag.createBuilder()
    .withInstalledModules([acceptedPlanReferenceModule])
    .withServices({
      source: DiBag.createProvider(() => source, { factoryReturnKind: 'sync-value' }),
      clock: DiBag.createProvider(() => clock, { factoryReturnKind: 'sync-value' }),
    })
    .buildContainer();
  return { acceptedPlanReferences: bag.resolve('acceptedPlanReferences') };
}
