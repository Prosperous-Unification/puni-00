import { parseOrThrow } from '@shared/validation';

import { hashBytes, serializeCanonical } from '../evidence/content-manifest';
import {
  BunToolkitMetadata,
  type BunToolkitPlan,
  type BunToolkitRequest,
  bunToolkitRoles,
} from './bun-release';
import { readToolkitSourceSelection, type ToolkitSourceSelection } from './source-selection';

/** Fresh captured roles/closure and explicit tool-source selection; never an existing historical descriptor. */
export interface SelectedBunToolkitRequest extends BunToolkitRequest {
  readonly sourceSelection: ToolkitSourceSelection;
}

/**
 * Plan new schema3 bytes from actual current role/closure input and required source identity.
 * Historical planners keep their original formats. The reference commit agrees with the new
 * discriminant but grants no release provenance for working input. No IO/build/publication occurs.
 */
export function planSelectedBunToolkit(request: SelectedBunToolkitRequest): BunToolkitPlan {
  const metadata = parseOrThrow(BunToolkitMetadata, {
    tag: request.tag,
    sourceRevision: request.sourceRevision,
    bunVersion: request.bunVersion,
    trustedNodeModules: request.trustedNodeModules,
    trustedNodeModulesIdentity: request.trustedNodeModulesIdentity,
  });
  const sourceSelection = readToolkitSourceSelection(request.sourceSelection);
  const reference =
    sourceSelection.kind === 'committed' ? sourceSelection.revision : sourceSelection.base;
  if (metadata.sourceRevision !== reference)
    throw new Error('selected toolkit source reference differs from its source selection');
  const digests = {
    'launcher.mjs': hashBytes(request.roleBytes['launcher.mjs']),
    'snapshotter.ts': hashBytes(request.roleBytes['snapshotter.ts']),
    'validator.mjs': hashBytes(request.roleBytes['validator.mjs']),
    'prepare-activation.mjs': hashBytes(request.roleBytes['prepare-activation.mjs']),
    'prepare-relocation-activation.mjs': hashBytes(
      request.roleBytes['prepare-relocation-activation.mjs'],
    ),
  };
  const descriptor = new TextEncoder().encode(
    serializeCanonical({
      ...metadata,
      schemaVersion: 3,
      sourceSelection,
      roles: digests,
      trustedNodeModules: [...metadata.trustedNodeModules].sort(),
    }),
  );
  const checksums = new TextEncoder().encode(
    [
      ...bunToolkitRoles.map((role) => digests[role] + '  ./' + role),
      hashBytes(descriptor) + '  ./toolkit.json',
    ].join('\n') + '\n',
  );
  return { descriptor, checksums, digests };
}
