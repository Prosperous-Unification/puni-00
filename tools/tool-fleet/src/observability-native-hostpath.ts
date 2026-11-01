import { isDeepStrictEqual } from 'node:util';

import { type } from 'arktype';

// Proof: Task60 body-type widened this shared enum; unknown type's malformed-first assertion failed.
const HostType = type(
  "''|'DirectoryOrCreate'|'Directory'|'FileOrCreate'|'File'|'Socket'|'CharDevice'|'BlockDevice'",
);
// Proof: Task60 body-path/body-closed admitted relative paths/unknown keys; both malformed-first assertions failed.
const HostPathBody = type({ path: /^\/[^\0]*$/, 'type?': HostType, '+': 'reject' });
/** Native source mount grammar is closed; observed/default workload decoders keep their separate strict grammar. */
// Proof: fix1-mount-propagation-enum widening admitted a malformed propagation marker.
export const HostPathMount = type({
  name: 'string>0',
  mountPath: 'string>0',
  'readOnly?': 'boolean',
  'subPath?': 'string',
  'subPathExpr?': 'string',
  'mountPropagation?': "'None'|'HostToContainer'|'Bidirectional'",
  '+': 'reject',
});
const HostContainer = type({ name: 'string>0', 'volumeMounts?': HostPathMount.array() });
/** The global native prepass reads only host identities before lifecycle or claim expansion; other supplied state stays available to the full inventory decoder. */
export const HostPathWorkload = type({
  containers: HostContainer.array().atLeastLength(1),
  'initContainers?': HostContainer.array(),
  'volumes?': type({ name: 'string>0', 'hostPath?': 'unknown' }).array(),
});
// Proof: Task60 policy-mount-closed/policy-mode/policy-propagation admitted malformed policy tuples; exact malformed-policy assertions failed.
const ReaderMount = type({
  role: "'containers'|'initContainers'",
  container: 'string>0',
  mountPath: 'string>0',
  readOnly: 'true',
  'mountPropagation?': "'None'|'HostToContainer'",
  '+': 'reject',
});
/** Closed source authorization preserves declared identity; it is never an enforcement or byte-growth claim. */
// Proof: Task60 policy-references/policy-row-closed admitted empty references/unknown row keys; malformed-policy assertions failed.
export const ReadOnlyHostPath = type({
  name: 'string>0',
  path: /^\/[^\0]*$/,
  'type?': HostType,
  mounts: ReaderMount.array().atLeastLength(1),
  '+': 'reject',
});
/** Read-only source tuples include every application and init reference, with no defaulted type or propagation. */
export interface ReadOnlyHostPathPolicy {
  readonly name: string;
  readonly path: string;
  readonly type?: typeof HostType.infer;
  readonly mounts: readonly (typeof ReaderMount.infer)[];
}
interface HostMount {
  readonly name: string;
  readonly mountPath: string;
  readonly readOnly?: boolean;
  readonly subPath?: string;
  readonly subPathExpr?: string;
  readonly mountPropagation?: 'None' | 'HostToContainer' | 'Bidirectional';
}
interface HostSpec {
  readonly volumes?: readonly {
    readonly name: string;
    readonly hostPath?: unknown;
    readonly [source: string]: unknown;
  }[];
  readonly containers: readonly {
    readonly name: string;
    readonly volumeMounts?: readonly HostMount[];
  }[];
  readonly initContainers?: readonly {
    readonly name: string;
    readonly volumeMounts?: readonly HostMount[];
  }[];
}
/** Decode host bodies and, only for host-bearing Pods, require unique app/init consumer names and one declaration per mount.
 * Claim-template names come from the validated source inventory; they supply reference context without invented volumes or bounds.
 * Modes/propagation are validated by the source mount schema; no runtime state is inferred. */
export function readHostPathConsumers(
  spec: HostSpec,
  refuse: (reason: string) => never,
  claimTemplateNames: readonly string[] = [],
) {
  const consumers = (spec.volumes ?? []).flatMap((volume) => {
    if (volume.hostPath === undefined) return [];
    // Proof: Task60 volume-mixed/volume-unique removals exposed an earlier claim collision instead of the late malformed-source diagnostic.
    if (
      Object.keys(volume).some(
        (field) => !['name', 'hostPath', 'unsupportedKind'].includes(field),
      ) ||
      spec.volumes?.filter((candidate) => candidate.name === volume.name).length !== 1
    )
      refuse('workload-volume-unsupported');
    const body = HostPathBody(volume.hostPath);
    // Proof: Task60 body-errors removal hid a missing path behind unsupported recovery; malformed-first assertion failed.
    if (body instanceof type.errors) return refuse('workload-volume-unsupported');
    const mounts = (['containers', 'initContainers'] as const).flatMap((role) =>
      (spec[role] ?? []).flatMap((container) =>
        (container.volumeMounts ?? [])
          .filter((mount) => mount.name === volume.name)
          .map((mount) => ({
            role,
            container: container.name,
            mountPath: mount.mountPath,
            readOnly: mount.readOnly ?? ('absent' as const),
            ...(mount.mountPropagation === undefined
              ? {}
              : { mountPropagation: mount.mountPropagation }),
            ...(mount.subPath === undefined ? {} : { subPath: mount.subPath }),
            ...(mount.subPathExpr === undefined ? {} : { subPathExpr: mount.subPathExpr }),
          })),
      ),
    );
    // Proof: Task60 mount-path removal hid a relative host target behind unsupported recovery; malformed-first assertion failed.
    if (mounts.some((mount) => !/^\/[^\0]*$/.test(mount.mountPath)))
      refuse('workload-mount-unknown');
    // Proof: Task60 mount-unique removal hid duplicate references; cross-volume-target removal also hid target collisions across volume names, failing malformed-first assertions.
    if (
      (['containers', 'initContainers'] as const).some((role) =>
        (spec[role] ?? []).some((container) =>
          container.volumeMounts?.some(
            (mount) =>
              mount.name === volume.name &&
              container.volumeMounts?.filter((reference) => reference.mountPath === mount.mountPath)
                .length !== 1,
          ),
        ),
      )
    )
      refuse('workload-mount-unknown');
    return [
      {
        name: volume.name,
        path: body.path,
        ...(body.type === undefined ? {} : { type: body.type }),
        mounts,
      },
    ];
  });
  // Proof: Task60 roster-scope corruption validated no-host input early and changed its existing claim-collision diagnostic; the production-reader control failed.
  if (consumers.length > 0) {
    const containers = [...spec.containers, ...(spec.initContainers ?? [])];
    // Proof: Task60 round1 consumer-name-unique removal let an earlier claim collision hide duplicate app/init and cross-role names; all three native-reader negatives failed.
    if (new Set(containers.map((container) => container.name)).size !== containers.length)
      refuse('workload-container-duplicate');
    const declarations = [
      ...(spec.volumes ?? []).map((volume) => volume.name),
      ...claimTemplateNames,
    ];
    const names = new Set(declarations);
    if (
      // Proof: Task60 roster-unique removal let an earlier claim collision hide unreferenced duplicate declarations; the malformed-first assertion failed.
      names.size !== declarations.length ||
      (['containers', 'initContainers'] as const).some((role) =>
        (spec[role] ?? []).some((container) =>
          // Proof: Task60 roster-unknown removal let an earlier claim collision hide a later absent-volume reference; the malformed-first assertion failed.
          container.volumeMounts?.some((mount) => !names.has(mount.name)),
        ),
      )
    )
      refuse('workload-mount-unknown');
  }
  return consumers;
}

/** Compare complete source tuples as sets after rejecting duplicate references; no partial match can authorize a host volume. */
// Proof: Task60 shared-matcher corruption admitted writable, changed-path/type and extra-reference tuples through actual native and normalizer paths; their assertions failed.
export function matchesHostPathPolicy(
  fact: ReturnType<typeof readHostPathConsumers>[number],
  policy: ReadOnlyHostPathPolicy,
) {
  const order = (mounts: readonly { role: string; container: string; mountPath: string }[]) =>
    [...mounts].sort((left, right) =>
      JSON.stringify([left.role, left.container, left.mountPath]).localeCompare(
        JSON.stringify([right.role, right.container, right.mountPath]),
      ),
    );
  return (
    fact.name === policy.name &&
    fact.path === policy.path &&
    fact.type === policy.type &&
    isDeepStrictEqual(order(fact.mounts), order(policy.mounts))
  );
}
