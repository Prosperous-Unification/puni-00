import { createHash } from 'node:crypto';

import { type } from 'arktype';

import { decodeRetainedToolchain, type Toolchain } from './contracts';
import { sumCapacity } from './observability-capacity';
import { deriveSelectedCapacityInputs } from './observability-generated-capacity';
import { expandNativeCohorts } from './observability-native-cohorts';
import type { RehearsalCronJobHorizons } from './observability-native-cronjob';
import type {
  NativeSourceContract,
  RehearsalTopologyEvidence,
} from './observability-native-daemon';
import { deriveRehearsalNativeCosts } from './observability-native-ordinal';
import { hashRehearsalFiles } from './observability-parity-rehearsal';
import {
  prepareRehearsalInventory,
  readRehearsalSource,
} from './observability-rehearsal-inventory';
import type { ObservabilitySourceIndex } from './observability-source-render';
import type { SelectedCapacitySource } from './observability-source-resources';

const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const SHA256 = /^[a-f0-9]{64}$/;
// Proof: Task58 selection-shape widening admitted a coherently malformed revision in the retained-reader binding negative.
const Selection = type({ sourceRevision: /^[a-f0-9]{40}$/, artifactSHA256: SHA256 });
const Packet = Selection.and({ files: type({ path: 'string>0', sha256: SHA256 }).array() });
// Proof: Task58 enablement-map fault admitted an array as absent defaults; the enabled-defaults negative failed.
const Mapping = type('Record<string,unknown>').narrow((record) => !Array.isArray(record));
const Declaration = type({
  metadata: { namespace: 'string>0', name: 'string>0' },
  spec: { values: Mapping },
});
// Proof: Task58 enablement-boolean widening lost the explicit-null Boolean refusal before selection.
const Switch = type({ 'enabled?': 'boolean' });
const defaultChart = {
  name: 'kubePrometheusStack',
  version: '91.4.1',
  sha256: '1bd5e7a88e758ed3ec22db0fe6e72b1352f3f0e7e5a93c79979f7edf361becdb',
} as const;
const generatedAPIs: Readonly<Record<string, string>> = {
  Elasticsearch: 'elasticsearch.k8s.elastic.co/v1',
  Kibana: 'kibana.k8s.elastic.co/v1',
  Prometheus: 'monitoring.coreos.com/v1',
  Alertmanager: 'monitoring.coreos.com/v1',
};

/** The independent packet artifact commits its complete ordered files list, which authenticates the lock separately from bootstrap coordinates. */
export interface RehearsalCapacityContract extends NativeSourceContract {
  readonly packet: typeof Packet.infer;
}
/** Exact retained lock bytes and declared scenario evidence; no decoded lock or observed runtime assertion is accepted. */
export interface RehearsalCapacityOptions {
  readonly runtimeLock: string;
  readonly bootstrap?: Parameters<typeof readRehearsalSource>[4];
  readonly topology?: RehearsalTopologyEvidence;
  readonly horizons?: RehearsalCronJobHorizons;
}
function bindRuntimeLock(contract: RehearsalCapacityContract, runtimeLock: string) {
  const packet = Packet.assert(contract.packet);
  const selection = Selection.assert(contract.provenance);
  const bytes = type('string>0').assert(runtimeLock);
  const coordinates = packet.files.filter((file) => file.path === 'infra/versions/toolchain.json');
  // Proof: Task58 packet-coordinate/revision/artifact/hash faults each failed the precise packet-lock production negatives.
  if (
    coordinates.length !== 1 ||
    packet.sourceRevision !== selection.sourceRevision ||
    packet.artifactSHA256 !== selection.artifactSHA256 ||
    hash(bytes) !== coordinates[0].sha256
  )
    throw new Error('Generated rehearsal packet lock binding differs');
  // Proof: Task63 commitment-guard removal admitted coherent lock/file-row substitution; the retained-reader packet commitment negative failed.
  if (hashRehearsalFiles(packet.files) !== packet.artifactSHA256)
    throw new Error('Generated rehearsal packet files commitment differs');
  return { runtime: { bytes, sha256: coordinates[0].sha256 }, packet: structuredClone(packet) };
}

function selectGeneratedSource(source: ReturnType<typeof readRehearsalSource>, lock: Toolchain) {
  const monitoring = source.releases.filter((release) => release.chart === 'kubePrometheusStack');
  const enablement = monitoring.map((release) => {
    const declaration = Declaration.assert(release.declaration);
    const switches = ['prometheus', 'alertmanager', 'prometheusOperator'].map((role) => {
      const branch = Mapping.assert(declaration.spec.values[role]);
      const enabled = Switch.assert(branch).enabled;
      const pinned = lock.charts.kubePrometheusStack;
      // Proof: Task58 enablement-pin removal admitted a changed chart hash; the pinned-default negative failed.
      if (pinned.version !== defaultChart.version || pinned.sha256 !== defaultChart.sha256)
        throw new Error('Generated rehearsal enablement default pin differs');
      return {
        role,
        // Switch.assert rejects null/nonboolean input before this pinned absent-only default.
        ...(enabled === undefined
          ? { value: true, origin: 'pinned-chart-default' as const }
          : { value: enabled, origin: 'explicit' as const }),
        pointer: `${release.entry.pointer}/spec/values/${role}/enabled`,
        chart: defaultChart,
      };
    });
    return { release, declaration, switches };
  });
  const instances = enablement
    .filter(({ switches }) => switches[0].value && switches[1].value && !switches[2].value)
    .map(({ release, declaration, switches }) => ({
      namespace: declaration.metadata.namespace,
      environment: type("'dev'|'prod'").assert(
        Mapping.assert(declaration.spec.values['commonLabels'])['puni.dev/telemetry-instance'],
      ),
      releaseOwner: release.owner,
      pointer: release.entry.pointer,
      frame: release.entry.source,
      enablement: switches,
    }));
  const controllers = enablement.filter(
    ({ switches }) => !switches[0].value && !switches[1].value && switches[2].value,
  );
  const eck = source.releases.filter((release) => release.chart === 'eckOperator');
  // Proof: Task58 instance-environment removal admitted two prod labels; source-derived selection failed.
  if (
    monitoring.length !== 3 ||
    instances.length !== 2 ||
    controllers.length !== 1 ||
    controllers[0].release.owner !== 'observability/prometheus-controller' ||
    eck.length !== 1 ||
    eck[0].owner !== 'observability/eck-operator' ||
    new Set(instances.map((instance) => instance.namespace)).size !== 2 ||
    new Set(instances.map((instance) => instance.environment)).size !== 2
  )
    throw new Error('Generated rehearsal instance/provider selection differs');
  // Proof: Task58 extra-release removal hid a coherent unrelated application declaration; its production negative failed.
  if (
    source.releases.filter(
      (release) => release.chart === 'elasticsearch' || release.chart === 'kibana',
    ).length !== 4
  )
    throw new Error('Generated rehearsal extra application release');
  const indexed: ObservabilitySourceIndex = {};
  for (const release of source.releases) indexed[release.owner] = {};
  for (const { entry, manifest } of source.resources) {
    if (entry.releaseOwner !== null)
      indexed[entry.releaseOwner][`${entry.kind}:${entry.namespace ?? '_'}:${entry.name}`] =
        manifest;
  }
  const selected: SelectedCapacitySource = { instances, releases: source.releases };
  const inventory = source.inventory.frames
    .filter((frame) => frame.owner.startsWith('release/'))
    .map((frame) => ({ ...frame, owner: frame.owner.slice('release/'.length) }));
  return {
    selected,
    indexed,
    inventory,
    instances,
    providers: {
      eck: { owner: eck[0].owner, frame: eck[0].entry.source },
      prometheus: {
        owner: controllers[0].release.owner,
        frame: controllers[0].release.entry.source,
        enablement: controllers[0].switches,
      },
    },
  };
}

const conditions = [
  'fresh-unchanged-single-CR-controller-generation',
  'no-prior-or-adopted-children',
  'no-forced-deletion-or-lost-node-execution',
  'no-second-replacements-repeated-or-uncertain-creations',
  'no-scale-template-provider-changes-or-hidden-history',
  'unchanged-claim-reuse-with-no-additional-or-unrelated-claims',
] as const;

function deriveCapacityCosts(
  source: ReturnType<typeof readRehearsalSource>,
  contract: RehearsalCapacityContract,
  options: RehearsalCapacityOptions,
  bound: ReturnType<typeof bindRuntimeLock> & { lock: Toolchain },
) {
  const native = deriveRehearsalNativeCosts(
    source,
    contract,
    bound.lock,
    options.topology,
    // Proof: Task58 horizon-forwarding omission admitted changed selection in the canonical companion test.
    options.horizons,
  );
  const selection = selectGeneratedSource(source, bound.lock);
  // Proof: Task58 generated-trait-dependency substitution lost all eight actual retained traits.
  const traits = deriveSelectedCapacityInputs(selection.selected, selection, bound.runtime);
  const generatedTraits = traits.map((trait) => {
    const views = source.resources.filter(
      ({ entry }) => `${entry.kind}:${entry.namespace ?? '_'}:${entry.name}` === trait.identity,
    );
    const view = views[0];
    // Proof: Task58 resource-api removal admitted a foreign API with an independently declared namespaced scope.
    if (
      views.length !== 1 ||
      view.entry.apiVersion !== generatedAPIs[trait.kind] ||
      view.entry.scope !== 'Namespaced' ||
      view.entry.releaseOwner !== trait.source.owner ||
      view.entry.source.frameSHA256 !== trait.source.sha256
    )
      throw new Error('Generated rehearsal resource binding differs');
    return {
      ...trait,
      // Proof: Task58 source-snapshot omission let a borrowed prepared view mutate returned binding; canonical companion failed.
      binding: structuredClone({
        resource: view.entry,
        manifest: view.manifest,
        instance: selection.instances.find((instance) => instance.namespace === trait.namespace),
      }),
    };
  });
  const generated = source.resources.filter(({ entry }) =>
    Object.hasOwn(generatedAPIs, entry.kind),
  );
  // Proof: Task58 extra-resource removal hid an additional selected CR; source-derived selection failed.
  if (generated.length !== generatedTraits.length)
    throw new Error('Generated rehearsal resource selection differs');
  const generatedLifecycles = generatedTraits.map((trait) => ({
    owner: trait.identity,
    scenario: 'conditional-fresh-single-generation-initial-and-first-replacement' as const,
    conditions: [...conditions],
    maximumPodSlots: trait.perReplica === null ? null : 2,
    claimReuse: 'conditional-unchanged-owner-namespace-role-template-ordinal' as const,
    observedPodIdentity: 'unobserved' as const,
    observedClaimIdentity: 'unobserved' as const,
    runtimeObserved: false as const,
    source: trait.binding,
  }));
  const generatedEntries = generatedTraits.flatMap((trait) => {
    // Proof: Task58 null-trait dependency fault failed the uncharged unsupported production-reader case.
    if (trait.perReplica === null) return [];
    // Proof: Task58 replacement-omission fault lost eight full replacement slots in the production reader.
    const pods = expandNativeCohorts(
      {
        identity: `Generated:${trait.identity}`,
        namespace: trait.namespace,
        name: trait.identity,
        model: trait.perReplica,
        source: trait.source,
      },
      1,
    ).map((charge) => ({
      ...charge,
      owner: trait.identity,
      coordinate: 'logical-generated-slot' as const,
    }));
    const claims = trait.claims.map((claim) => ({
      identity: `GeneratedClaim:${trait.source.owner}/${trait.namespace}/${trait.role}/${claim.name}/0`,
      owner: trait.identity,
      kind: 'claim' as const,
      memoryMiB: 0,
      cpuMilli: 0,
      // Proof: Task58 claim-double-charge fault doubled reused logical storage; exact generated totals failed.
      diskMiB: claim.requestedMiB,
      source: { ...trait.source, pointer: claim.sourcePointer },
      coordinate: 'logical-generated-claim-slot' as const,
      claim: {
        owner: trait.source.owner,
        namespace: trait.namespace,
        role: trait.role,
        template: claim.name,
        ordinal: 0,
        actualPVC: 'unobserved' as const,
        reuse: 'conditional-unchanged-claim' as const,
      },
    }));
    return [...pods, ...claims];
  });
  const covered = new Set(
    generatedTraits.filter((trait) => trait.perReplica !== null).map((trait) => trait.identity),
  );
  const blockers = [
    // Proof: Task58 generic-blocker-overreach fault erased an unsupported owner obligation; null-trait test failed.
    ...native.blockers.filter(
      (blocker) =>
        !(covered.has(blocker.owner) && blocker.missingFact === 'provider-or-unclassified-demand'),
    ),
    ...generatedTraits.flatMap((trait) =>
      [
        ...trait.missingFacts,
        // Proof: Task58 generation-conditions omission lost explicit history/new-claim exclusions; logical-claims test failed.
        ...conditions,
        'startup-load-recovery-cap-sufficiency',
        'whole-attempt-history-and-enforcement',
        'backing-devices-and-writers',
      ].map((missingFact) => ({ owner: trait.identity, missingFact })),
    ),
  ];
  const generatedKnownContributions = sumCapacity(generatedEntries);
  // Proof: Task58 combined-sum omission lost generated amounts from the native-preserving total.
  const knownContributions = sumCapacity([...native.entries, ...generatedEntries]);
  const closure = {
    native,
    sourceInventorySHA256: native.sourceInventorySHA256,
    packet: bound.packet,
    runtime: bound.runtime,
    selection,
    generatedTraits,
    generatedLifecycles,
    generatedEntries,
    generatedKnownContributions,
    knownContributions,
    blockers,
    conditions,
  };
  return {
    native,
    generatedTraits,
    generatedLifecycles,
    generatedEntries,
    generatedKnownContributions,
    knownContributions,
    blockers,
    closureSHA256: hash(JSON.stringify(closure)),
    state: 'incomplete' as const,
    creationAuthority: false as const,
    runtimeAuthority: false as const,
  };
}

/** Validate the retained packet lock and full source once, then add conditional generated costs to exact native facts.
 * Logical cohorts reserve two full Pods and one unchanged claim per selected persistent slot; they observe no operator maximum,
 * Pod/PVC identity, effective template, generation/history, startup sufficiency or physical enforcement.
 * Unsupported traits remain null and uncharged. Missing/malformed binding state throws before incomplete classifications.
 */
export function readRehearsalCapacityCosts(
  stages: Parameters<typeof readRehearsalSource>[0],
  expansions: Parameters<typeof readRehearsalSource>[1],
  contract: RehearsalCapacityContract,
  options: RehearsalCapacityOptions,
) {
  const binding = bindRuntimeLock(contract, options.runtimeLock);
  const bound = {
    ...binding,
    lock: decodeRetainedToolchain(Buffer.from(binding.runtime.bytes), binding.runtime.sha256),
  };
  const source = readRehearsalSource(stages, expansions, contract, bound.lock, options.bootstrap);
  return deriveCapacityCosts(source, contract, options, bound);
}

/** Prepare the canonical packet once with the original five arguments and reuse its private validated views and lock binding. */
export async function deriveObservabilityRehearsalCapacityCosts(
  ...input: [...Parameters<typeof prepareRehearsalInventory>, horizons?: RehearsalCronJobHorizons]
) {
  const [root, tools, request, directory, helmArchive, horizons] = input;
  const prepared = await prepareRehearsalInventory(root, tools, request, directory, helmArchive);
  const { source, runtimeLock, packet } = prepared.capacityEvidence;
  const contract = { ...prepared.inventory, packet };
  const options = { runtimeLock, topology: prepared.topologyEvidence, horizons };
  return {
    ...deriveCapacityCosts(source, contract, options, {
      ...bindRuntimeLock(contract, runtimeLock),
      lock: prepared.lock,
    }),
    sourceInventorySHA256: prepared.inventory.inventorySHA256,
    provenance: prepared.inventory.provenance,
    obligations: prepared.inventory.obligations,
  };
}
