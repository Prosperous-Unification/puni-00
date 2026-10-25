import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';

import { type } from 'arktype';

import { readTrustedEnrollment } from './registry-enrollment';

const Identity = type('string > 0');
const Artifact = type({
  path: Identity.narrow(isAbsolute),
  sha256: /^[0-9a-f]{64}$/,
  '+': 'reject',
});
const Catalog = type({
  schemaVersion: '1',
  managed: type({
    authority: Identity,
    registryId: Identity,
    product: Identity,
    environment: Identity,
    target: Identity,
    enrollment: Artifact,
    'publication?': Artifact,
    '+': 'reject',
  }).array(),
  '+': 'reject',
});
type InstalledReader = (path: string) => Promise<unknown>;

async function readCatalog(read: InstalledReader) {
  const catalog = Catalog(await read('/etc/puni/registry-deployments.json'));
  if (catalog instanceof type.errors) throw new Error('Malformed registry selection catalog');
  const keys = new Set<string>();
  for (const entry of catalog.managed) {
    const endpoint = new URL(`https://${entry.authority}`);
    if (
      endpoint.host !== entry.authority ||
      endpoint.pathname !== '/' ||
      endpoint.search !== '' ||
      endpoint.hash !== '' ||
      endpoint.username !== '' ||
      endpoint.password !== ''
    )
      throw new Error('Noncanonical registry authority in selection catalog');
    const key = JSON.stringify([entry.authority, entry.target, entry.product, entry.environment]);
    if (keys.has(key)) throw new Error('Duplicate registry selection catalog mapping');
    keys.add(key);
  }
  return catalog;
}

async function readPinnedEnrollment(
  pin: typeof Artifact.infer,
  entry: (typeof Catalog.infer)['managed'][number],
  read: InstalledReader,
  deployment: boolean,
) {
  const enrollment = await read(pin.path);
  if (createHash('sha256').update(JSON.stringify(enrollment)).digest('hex') !== pin.sha256)
    throw new Error('Installed registry enrollment digest mismatch');
  const identity = type({
    registryId: Identity,
    registryUrl: Identity,
    product: Identity,
    'environment?': Identity,
    'target?': Identity,
  })(enrollment);
  if (
    identity instanceof type.errors ||
    identity.registryId !== entry.registryId ||
    identity.product !== entry.product ||
    new URL(identity.registryUrl).host !== entry.authority ||
    (deployment && (identity.environment !== entry.environment || identity.target !== entry.target))
  )
    throw new Error('Installed registry enrollment identity differs from catalog');
  return enrollment;
}

/**
 * Every installed mutating entrypoint requires the root-owned fixed catalog, including unmanaged
 * hosts. An environment selector may choose a matching installed enrollment but cannot erase it.
 */
export async function selectDeploymentEnrollment(
  images: readonly string[],
  target: string | null,
  env: NodeJS.ProcessEnv = process.env,
  read: InstalledReader = readTrustedEnrollment,
): Promise<unknown> {
  const catalog = await readCatalog(read);
  const authorities = new Set(images.map((image) => image.split('/')[0]));
  const managed = catalog.managed.filter((entry) => authorities.has(entry.authority));
  const selected = env['REGISTRY_DEPLOYMENT_ENROLLMENT'];
  if (managed.length === 0) {
    // Proof: replacing all images with foreign refs bypassed selection for an installed managed target.
    if (catalog.managed.some((entry) => entry.target === target))
      throw new Error('Installed managed target cannot become unmanaged');
    if (selected !== undefined)
      throw new Error('Deployment selection does not match managed images');
    return undefined;
  }
  const matching = managed.filter((entry) => entry.target === target);
  if (matching.length === 0)
    throw new Error('Managed deployment target is missing or differs from catalog');
  const candidates =
    selected === undefined
      ? matching
      : matching.filter((entry) => entry.enrollment.path === selected);
  if (candidates.length !== 1)
    throw new Error('Deployment selection is missing, ambiguous or foreign');
  return readPinnedEnrollment(candidates[0].enrollment, candidates[0], read, true);
}

/** Publication and copy use the same complete installed universe before any legacy writer selection. */
export async function selectPublicationEnrollment(
  registry: string,
  env: NodeJS.ProcessEnv,
  read: InstalledReader = readTrustedEnrollment,
  target?: string,
): Promise<unknown> {
  const catalog = await readCatalog(read);
  const authority = new URL(registry).host;
  if (
    target !== undefined &&
    catalog.managed.some((entry) => entry.target === target && entry.authority !== authority)
  )
    throw new Error('Publication registry differs from installed managed target');
  const managed = catalog.managed.filter(
    (entry) => entry.authority === authority && (target === undefined || entry.target === target),
  );
  const selected = env['REGISTRY_PUBLICATION_ENROLLMENT'];
  if (managed.length === 0) {
    if (selected !== undefined) throw new Error('Publication selection does not match catalog');
    return undefined;
  }
  const candidates = [
    ...new Map(
      managed
        .filter(
          (entry) =>
            entry.publication !== undefined &&
            (selected === undefined || entry.publication.path === selected),
        )
        .map((entry) => [entry.publication?.path, entry]),
    ).values(),
  ];
  if (candidates.length !== 1)
    throw new Error('Publication selection is missing, ambiguous or foreign');
  const entry = candidates[0];
  if (entry.publication === undefined) throw new Error('Managed publication enrollment is missing');
  return readPinnedEnrollment(entry.publication, entry, read, false);
}

/** Explicit owner-history initialization selects a trusted installed target without inventing image refs. */
export async function selectEnvironmentEnrollment(
  target: string,
  env: NodeJS.ProcessEnv = process.env,
  read: InstalledReader = readTrustedEnrollment,
): Promise<unknown> {
  const catalog = await readCatalog(read);
  const selected = env['REGISTRY_DEPLOYMENT_ENROLLMENT'];
  const matching = catalog.managed.filter(
    (entry) =>
      entry.target === target && (selected === undefined || entry.enrollment.path === selected),
  );
  if (matching.length !== 1)
    throw new Error('Installed environment selection is missing, ambiguous or foreign');
  return readPinnedEnrollment(matching[0].enrollment, matching[0], read, true);
}
