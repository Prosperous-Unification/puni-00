import { decodeSourceStartupRequest, type SourceStartupRequest } from './source-startup-profile';

/** Encode only a previously decoded explicit source request; expected record bytes never come from a live participant. */
export function createSourceStartupAdmission(
  source: SourceStartupRequest,
  manifest: { readonly name: string; readonly sha256: string },
) {
  const selected = decodeSourceStartupRequest(source);
  if (manifest.sha256 !== selected.pins.manifestSha256)
    throw new Error('source startup admission manifest differs');
  return {
    ...('expectedProfile' in selected
      ? {
          expectedProfile: selected.expectedProfile,
          puniSelectionContents: selected.puniSelectionContents,
        }
      : {}),
    pins: selected.pins,
    runtimeReference: selected.runtimeReference,
    manifest: { ...manifest },
  };
}
