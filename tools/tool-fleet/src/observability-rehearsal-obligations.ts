import type { Toolchain } from './contracts';
import { labHelperRoles } from './k3d-creation';
import { referenceHelper } from './k3d-helper-images';

interface ImageLink {
  path: 'infra/versions/toolchain.json';
  coordinate: string;
  role: string;
  name: string;
  digest: string;
  match: 'exact' | 'repository-digest';
}
/** Inventory linkage only: the repository AND digest must match; existing strict pin guards are unchanged. */
export function linkRehearsalImage(image: string, lock: Toolchain): ImageLink[] {
  const links: ImageLink[] = [];
  const add = (
    pin: Toolchain['runtimeImages']['k3dNode'],
    coordinate: string,
    allowUntagged: boolean,
  ) => {
    // Proof: Task37 helper-linkage weakening linked foreign repository/digest pairs; selected helper negative failed.
    const exact = image === `${pin.name}@${pin.digest}`;
    const repository = pin.name.replace(/:[^/:]+$/, '');
    // Proof: Task25c2b image-repository/image-digest weakenings linked foreign repositories or changed digests.
    const untagged =
      allowUntagged && repository !== pin.name && image === `${repository}@${pin.digest}`;
    if (exact || untagged)
      links.push({
        path: 'infra/versions/toolchain.json',
        coordinate,
        role: pin.role,
        name: pin.name,
        digest: pin.digest,
        match: exact ? 'exact' : 'repository-digest',
      });
  };
  for (const [name, pin] of Object.entries(lock.runtimeImages))
    add(pin, `/runtimeImages/${name}`, false);
  for (const [chart, pin] of Object.entries(lock.charts))
    pin.images.forEach((image, index) => {
      add(image, `/charts/${chart}/images/${String(index)}`, true);
    });
  if ('k3dHelpers' in lock)
    for (const helper of labHelperRoles) {
      const selected = lock.k3dHelpers[helper.role];
      add(
        { role: helper.role, name: selected.name, digest: selected.manifestDigest },
        `/k3dHelpers/${helper.role}`,
        false,
      );
    }
  return links;
}
interface Provenance {
  files: readonly { path: string; sha256: string }[];
  generator: { files: readonly { path: string; sha256: string }[] };
}
interface Origin {
  basis: 'selected-git' | 'runner-implementation';
  path: string;
  sha256: string;
  coordinate: string;
}
/** Declared roles/actions keep missing runtime realization visible, without synthetic identities or demand. */
export interface RehearsalObligation {
  role: string;
  image: string | null;
  digest: string | null;
  temporary: boolean | null;
  origins: Origin[];
  unresolved: string[];
  realization: 'unobserved';
}
/** Existing Fleet source contracts identify these obligations; no provider or runner is simulated. */
export function readRehearsalObligations(
  lock: Toolchain,
  provenance: Provenance,
): RehearsalObligation[] {
  function origin(basis: Origin['basis'], path: string, coordinate: string): Origin {
    const file = (basis === 'selected-git' ? provenance.files : provenance.generator.files).find(
      (file) => file.path === path,
    );
    // Proof: Task25c2b helper-origin omission hid a missing object-store source coordinate.
    if (file === undefined) throw new Error(`Rehearsal obligation origin absent: ${path}`);
    return { basis, ...file, coordinate };
  }
  const source = (path: string, coordinate: string) => origin('selected-git', path, coordinate);
  const implementation = (name: string, coordinate: string) =>
    origin('runner-implementation', `tools/tool-fleet/src/${name}.ts`, coordinate);
  const pinOrigin = (coordinate: string) => source('infra/versions/toolchain.json', coordinate);
  const runner = (symbol: string) => implementation('k3d-lab', symbol);
  const role = (
    name: string,
    origins: Origin[],
    unresolved: string[],
    image: string | null = null,
    digest: string | null = null,
    temporary: boolean | null = null,
  ): RehearsalObligation => ({
    role: name,
    image,
    digest,
    temporary,
    origins,
    unresolved,
    realization: 'unobserved',
  });
  const obligations = [
    role(
      'node-system',
      [
        source('infra/local/platform.k3d.yaml', '/image'),
        pinOrigin('/runtimeImages/k3dNode'),
        runner('upLab'),
      ],
      [
        'actual rendered topology and runner-input equality',
        'k3s bundled system Pods, images, lifecycle and writable-state realization',
      ],
      `${lock.runtimeImages.k3dNode.name}@${lock.runtimeImages.k3dNode.digest}`,
      lock.runtimeImages.k3dNode.digest,
      false,
    ),
    role(
      'registry',
      [pinOrigin('/runtimeImages/registry'), runner('upLab')],
      ['actual registry identity, mount ownership and writable-state realization'],
      `${lock.runtimeImages.registry.name}@${lock.runtimeImages.registry.digest}`,
      lock.runtimeImages.registry.digest,
      false,
    ),
    ...labHelperRoles.map((helper) =>
      role(
        helper.role,
        [
          implementation('k3d-creation', `labHelperRoles/${helper.role}`),
          runner('upLab'),
          ...('k3dHelpers' in lock ? [pinOrigin(`/k3dHelpers/${helper.role}`)] : []),
        ],
        [
          ...('k3dHelpers' in lock ? [] : ['historical source has no reviewed helper selection']),
          'exact pulled digest and realized role count',
          helper.temporary
            ? 'every serial tools create/mount/destroy lifecycle and writer demand'
            : 'load-balancer realization and writer demand',
        ],
        'k3dHelpers' in lock ? referenceHelper(lock.k3dHelpers[helper.role]) : null,
        'k3dHelpers' in lock ? lock.k3dHelpers[helper.role].manifestDigest : null,
        helper.temporary,
      ),
    ),
    role(
      'object-store-import',
      [
        source('infra/versions/object-store.json', 'readObjectStoreLock input'),
        pinOrigin('/runtimeImages/objectStore'),
        implementation('object-store-image', 'importObjectStore'),
        runner('preparePlatformObjectStore'),
      ],
      [
        'retained archive binding, validation/copy/import/unpack lifecycle',
        'exact owned node IDs and containerd import/alias equality',
      ],
      `${lock.runtimeImages.objectStore.name}@${lock.runtimeImages.objectStore.digest}`,
      lock.runtimeImages.objectStore.digest,
    ),
    role(
      'bootstrap-tls',
      [implementation('backup-identity', 'createBackupIdentity')],
      [
        'host openssl executable/version unpinned',
        'certificate process and private output lifecycle unobserved',
      ],
    ),
    role(
      'bootstrap-material',
      [implementation('backup-identity', 'provisionBackupIdentity')],
      [
        'namespace applications and credential creation are declared actions',
        'actual namespace definitions, Secret identities and writer lifecycle unobserved',
      ],
    ),
    role(
      'cluster-marker',
      [runner('bootstrapCluster')],
      [
        'dynamic immutable ConfigMap creation; cluster/lab identity and realized definition unobserved',
      ],
    ),
    role(
      'trusted-workload-label',
      [runner('bootstrapCluster')],
      [
        'puni-trusted-workload ConfigMap lab-label mutation; actual ownership and resulting definition unobserved',
      ],
    ),
    role(
      'local-path-provisioning',
      [
        source('infra/platform/storage/local/storage-class.yaml', '/provisioner'),
        pinOrigin('/runtimeImages/k3dNode'),
      ],
      [
        'bundled provisioner and generated helper image/digest, Pod shape, provisioning/deletion and host writer lifecycle unobserved',
      ],
    ),
  ];
  for (const name of ['acmeSolver', 'startupApiCheck']) {
    const pin = lock.charts.certManager.images.find((image) => image.role === name);
    // Proof: Task25c2b helper-role omission silently dropped the absent acmeSolver lock role.
    if (pin === undefined) throw new Error(`Rehearsal helper locked role absent: ${name}`);
    obligations.push(
      role(
        `cert-manager-${name}`,
        [
          pinOrigin(
            `/charts/certManager/images/${String(lock.charts.certManager.images.indexOf(pin))}`,
          ),
        ],
        [
          'available pin is not evidence of an enabled or realized helper',
          'effective solver/startup Pod, concurrency, hooks and lifecycle unobserved',
        ],
        `${pin.name}@${pin.digest}`,
        pin.digest,
      ),
    );
  }
  obligations.push(
    role(
      'velero-restore-transfer',
      [pinOrigin('/charts/velero')],
      [
        'generated restore/transfer/helper image-role mapping, Pods, concurrency and lifecycle unobserved',
      ],
    ),
    role(
      'solver-host',
      [
        source('infra/local/platform.k3d.yaml', '/volumes'),
        pinOrigin('/binaries/solverBun'),
        runner('upLab'),
      ],
      [
        'mounted host solver process, executable binding, startup and writable-state realization unobserved',
      ],
    ),
  );
  // Proof: Task25c2b helper-hidden filtering lost the required serial-tools lifecycle obligation.
  return obligations;
}
