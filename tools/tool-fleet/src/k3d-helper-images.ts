import { type } from 'arktype';

const digest = /^sha256:[a-f0-9]{64}$/;
const Image = type({
  indexDigest: digest,
  manifestDigest: digest,
  configDigest: digest,
  os: "'linux'",
  arch: "'amd64'",
  '+': 'reject',
});
/** Reviewed k3d provider selection; content provenance is retained with the source lock. */
export const K3dHelpers = type({
  provider: "'k3d'",
  version: "'v5.9.0'",
  sourceRevision: "'15dd1e2dbd62c53ed990fce9b7332335e8cb053c'",
  serverlb: Image.merge({ '+': 'reject', name: "'ghcr.io/k3d-io/k3d-proxy'" }),
  tools: Image.merge({ '+': 'reject', name: "'ghcr.io/k3d-io/k3d-tools'" }),
  '+': 'reject',
});
export type K3dHelpers = typeof K3dHelpers.infer;
/** Select the child manifest; the config identity is never an executable reference. */
export function referenceHelper(image: K3dHelpers['serverlb'] | K3dHelpers['tools']): string {
  return `${image.name}@${image.manifestDigest}`;
}
/** Owned values passed to both ordinary and witnessed k3d invocations. */
export function helperEnvironment(selection: K3dHelpers) {
  return {
    K3D_IMAGE_LOADBALANCER: referenceHelper(selection.serverlb),
    K3D_IMAGE_TOOLS: referenceHelper(selection.tools),
  };
}
export const ImageObservation = type({
  name: 'string>0',
  id: digest,
  os: 'string>0',
  arch: 'string>0',
  repoDigests: 'string[]',
  volumes: 'string[]',
  '+': 'reject',
});
export type ImageObservation = typeof ImageObservation.infer;
/** Refuse a local helper whose independently selected config/platform/reference does not match. */
export function requireHelperImage(selection: K3dHelpers, observation: ImageObservation): void {
  const selected = [selection.serverlb, selection.tools].find(
    (image) => referenceHelper(image) === observation.name,
  );
  if (
    observation.id !== selected?.configDigest ||
    observation.os !== selected.os ||
    observation.arch !== selected.arch ||
    !observation.repoDigests.includes(referenceHelper(selected))
  )
    // Proof: Task37 preimage-identity bypass failed config/platform/reference caller negatives before direct creation.
    throw new Error('Selected helper image identity differs');
}
