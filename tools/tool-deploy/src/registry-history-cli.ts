import { isAbsolute } from 'node:path';

import {
  type ComposeSourceConfiguration,
  initializeComposeHistory,
  withLock,
} from '@tools/compose-registry';
import {
  type DeploymentEnrollment,
  readEnvironmentEnrollment,
  readRegistryBytes,
  readTrustedEnrollment,
  verifyRegistryPromotion,
} from '@tools/registry-publication';
import { type } from 'arktype';

import { inheritFirstStartHistory, initializeFirstStartHistory } from './k8s/registry-first-start';
import { readKubernetesSource } from './k8s/registry-reader';

const Path = type('string > 0').narrow(isAbsolute);
const Command = type({
  protocol: "'registry-history/1'",
  command: "'initialize'|'transfer'",
  target: 'string > 0',
  '+': 'reject',
});
const Configuration = type({
  schemaVersion: '1',
  environments: type
    .or(
      {
        kind: "'kubernetes'",
        target: 'string > 0',
        firstStartPath: Path,
        releasePath: Path,
        source: 'unknown',
        '+': 'reject',
      },
      { kind: "'compose'", target: 'string > 0', source: 'unknown', '+': 'reject' },
    )
    .array(),
  '+': 'reject',
});
export interface HistoryCommandPorts {
  read: (path: string) => Promise<unknown>;
  select: (target: string) => Promise<DeploymentEnrollment>;
}

/** Installed initialization uses fixed root-owned configuration plus the shared mandatory selection catalog. */
export async function executeHistoryCommand(
  input: unknown,
  ports: HistoryCommandPorts = { read: readTrustedEnrollment, select: readEnvironmentEnrollment },
): Promise<void> {
  const request = Command(input);
  if (request instanceof type.errors) throw new Error('Malformed registry history command');
  const configuration = Configuration(await ports.read('/etc/puni/registry-history.json'));
  if (configuration instanceof type.errors)
    throw new Error('Malformed installed registry history configuration');
  const entries = configuration.environments.filter(
    (environment) => environment.target === request.target,
  );
  if (entries.length !== 1) throw new Error('Missing or ambiguous installed history source');
  const entry = entries[0];
  const enrollment = await ports.select(request.target);
  if (enrollment.target !== entry.target) throw new Error('History enrollment target differs');
  const scope = {
    registryId: enrollment.registryId,
    product: enrollment.product,
    environment: enrollment.environment,
    target: enrollment.target,
  };
  if (entry.kind === 'kubernetes') {
    const source = type({
      clusterUid: 'string > 0',
      namespaces: type({ name: 'string > 0', uid: 'string > 0' }).array(),
      releaseRecord: { namespace: 'string > 0', name: "'wbs-release'" },
    })(entry.source);
    if (
      source instanceof type.errors ||
      !entry.target.startsWith(`k8s:${source.clusterUid}/`) ||
      !entry.target.endsWith(`/${source.releaseRecord.namespace}`) ||
      entry.target
        .split('/')
        .slice(1)
        .some((name) => !source.namespaces.some((namespace) => namespace.name === name))
    )
      throw new Error('Kubernetes history source identity differs from target');
    if (request.command === 'initialize')
      await initializeFirstStartHistory(entry.firstStartPath, scope, async () => {
        const inventory = await readKubernetesSource(entry.source);
        if (inventory.currentImages === undefined)
          throw new Error('First-install source omitted release history evidence');
        return inventory;
      });
    else
      await inheritFirstStartHistory(entry.firstStartPath, entry.releasePath, (history) =>
        verifyRegistryPromotion(enrollment, {
          ...scope,
          authorityRevision: history.authorityRevision,
          releases: history.releases,
          promotion: history.promotion,
        }),
      );
  } else {
    if (request.command !== 'initialize')
      throw new Error('Compose owns its existing state and has no first-start transfer');
    const source = type({ root: Path })(entry.source);
    if (source instanceof type.errors || entry.target !== `compose:${source.root}`)
      throw new Error('Compose history source identity differs from target');
    // Boundary: initializeComposeHistory delegates complete source validation to readComposeSource before any write.
    await withLock(`${source.root}/state/deploy.lock`, () =>
      initializeComposeHistory(scope, entry.source as ComposeSourceConfiguration),
    );
  }
}
if (import.meta.main) {
  const input = await readRegistryBytes(Bun.stdin.stream(), 65536, 'Registry history command');
  await executeHistoryCommand(JSON.parse(new TextDecoder().decode(input)) as unknown);
  process.stdout.write('{"protocol":"registry-history/1","status":"complete"}\n');
}
