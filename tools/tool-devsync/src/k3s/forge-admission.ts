/**
 * The forge admission parameters (`wbs-solver/puni-trusted-workload`) as a lab owns them.
 *
 * Roots are derived, never edited in place: the committed base roots, every environment's claimed
 * root, and the solver runtime directory while any environment exists. Claims are keyed by slug in
 * an annotation, so `down` releases a root even when its Pod is already gone. Every write replaces
 * the object at the `resourceVersion` it was planned from and retries on a conflict, so two
 * concurrent `dev-env` runs cannot drop each other's roots.
 */

export const TRUSTED_WORKLOAD = 'puni-trusted-workload';
export const TRUSTED_WORKLOAD_NAMESPACE = 'wbs-solver';
export const SOLVER_NODE_PATH = '/run/puni/solver';
const LAB_LABEL = 'puni.dev/lab-id';
const OWNERS_ANNOTATION = 'puni.dev/forge-root-owners';
const BASE_ANNOTATION = 'puni.dev/forge-base-roots';
const FLUX_NAME_LABEL = 'kustomize.toolkit.fluxcd.io/name';
const FLUX_SSA_ANNOTATION = 'kustomize.toolkit.fluxcd.io/ssa';
const DEFAULT_ATTEMPTS = 5;

export interface ForgeAdmission {
  readonly forgeImage: string;
  readonly baseRoots: readonly string[];
  /** Slug → exact worktree node path. */
  readonly owners: Readonly<Partial<Record<string, string>>>;
}

export type ForgeAdmissionChange =
  | { readonly kind: 'claim'; readonly slug: string; readonly root: string; readonly image: string }
  | { readonly kind: 'release'; readonly slug: string }
  | { readonly kind: 'restore'; readonly slug: string; readonly previous: ForgeAdmission };

/** Where the parameters live; `replace` answers `conflict` when the object moved on. */
export interface ForgeAdmissionStore {
  read(): Promise<unknown>;
  replace(object: Record<string, unknown>): Promise<'replaced' | 'conflict'>;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function recordOf(input: unknown, what: string): Record<string, unknown> {
  if (!isRecord(input)) throw new Error(`${TRUSTED_WORKLOAD} lacks ${what}`);
  return input;
}

function splitRoots(value: string): readonly string[] {
  return value.split(',').filter((root) => root !== '');
}

/** The roots the admission must list for a given state. */
export function rootsOf(state: ForgeAdmission): readonly string[] {
  const claimed = Object.values(state.owners).filter((root) => root !== undefined);
  return [
    ...new Set([...state.baseRoots, ...claimed, ...(claimed.length > 0 ? [SOLVER_NODE_PATH] : [])]),
  ];
}

/**
 * Decode the ConfigMap a lab owns.
 *
 * @throws When another lab or no lab owns it, when Flux applies it without create-once (Flux
 * would then revert the forge fields on its next reconcile), or when a field is malformed.
 */
export function decodeForgeAdmission(configMap: unknown, labId: string): ForgeAdmission {
  const metadata = recordOf(recordOf(configMap, 'an object')['metadata'], 'metadata');
  const labels = isRecord(metadata['labels']) ? metadata['labels'] : {};
  const annotations = isRecord(metadata['annotations']) ? metadata['annotations'] : {};
  // Proof: with this comparison removed, `up` patched parameters that had lost the lab label
  // instead of refusing (live k3d, 2026-09-18), and `refuses parameters another lab owns` failed.
  if (labels[LAB_LABEL] !== labId) {
    throw new Error(
      `${TRUSTED_WORKLOAD_NAMESPACE}/${TRUSTED_WORKLOAD} is not owned by this lab; outside a lab, ` +
        'forge roots and images are reviewed changes to infra/platform/policy, not something dev-env writes',
    );
  }
  // Proof: with this check removed, `refuses a Flux-applied ConfigMap without create-once` failed;
  // live, Flux reverted a dev-env root on its next reconcile once the annotation was dropped
  // (k3s-platform verify.md, F9 review).
  if (
    labels[FLUX_NAME_LABEL] !== undefined &&
    annotations[FLUX_SSA_ANNOTATION] !== 'IfNotPresent'
  ) {
    throw new Error(
      `Flux Kustomization ${JSON.stringify(labels[FLUX_NAME_LABEL])} applies ${TRUSTED_WORKLOAD} without ` +
        `${FLUX_SSA_ANNOTATION}: IfNotPresent, so it would revert the forge fields dev-env writes`,
    );
  }
  const data = recordOf(recordOf(configMap, 'an object')['data'], 'data');
  const forgeImage = data['forgeImage'];
  const roots = data['forgeWorktreeRoots'];
  if (typeof forgeImage !== 'string' || typeof roots !== 'string') {
    throw new Error(`${TRUSTED_WORKLOAD} lacks forgeImage or forgeWorktreeRoots`);
  }
  const ownersText = annotations[OWNERS_ANNOTATION];
  const baseText = annotations[BASE_ANNOTATION];
  if ((ownersText === undefined) !== (baseText === undefined)) {
    throw new Error(
      `${TRUSTED_WORKLOAD} carries only one of ${OWNERS_ANNOTATION} and ${BASE_ANNOTATION}`,
    );
  }
  if (typeof ownersText !== 'string' || typeof baseText !== 'string') {
    // First write on this lab: whatever is listed now is the committed base.
    return { forgeImage, baseRoots: splitRoots(roots), owners: {} };
  }
  const decoded: unknown = JSON.parse(ownersText);
  if (!isRecord(decoded)) throw new Error(`${OWNERS_ANNOTATION} is not a slug-to-root object`);
  const owners: Record<string, string> = {};
  for (const [slug, root] of Object.entries(decoded)) {
    if (typeof root !== 'string')
      throw new Error(`${OWNERS_ANNOTATION} maps ${slug} to a non-path`);
    owners[slug] = root;
  }
  return { forgeImage, baseRoots: splitRoots(baseText), owners };
}

/**
 * Plan one change.
 *
 * @throws When a claim brings a different image while another environment holds the one image
 * the forge admits.
 */
export function planForgeAdmission(
  state: ForgeAdmission,
  change: ForgeAdmissionChange,
): ForgeAdmission {
  const others = Object.fromEntries(
    Object.entries(state.owners).filter(([slug]) => slug !== change.slug),
  );
  switch (change.kind) {
    case 'claim': {
      const holders = Object.keys(others);
      // Proof: ignoring other holders failed `refuses a second forge image while another
      // environment holds the first`; the forge would then deny that environment's next Pod.
      if (holders.length > 0 && state.forgeImage !== change.image) {
        throw new Error(
          `environment ${holders.join(', ')} runs forge image ${state.forgeImage}; the forge admits one image, ` +
            `so recreate it from the same deploy/dev-src/Dockerfile before starting ${change.slug}`,
        );
      }
      return {
        ...state,
        forgeImage: change.image,
        owners: { ...others, [change.slug]: change.root },
      };
    }
    case 'release':
      return { ...state, owners: others };
    case 'restore': {
      const previous: string | undefined = change.previous.owners[change.slug];
      return {
        ...state,
        forgeImage:
          Object.keys(others).length === 0 ? change.previous.forgeImage : state.forgeImage,
        owners: previous === undefined ? others : { ...others, [change.slug]: previous },
      };
    }
  }
}

/** The replacement object, carrying the `resourceVersion` it was planned from. */
export function encodeForgeAdmission(
  configMap: Record<string, unknown>,
  state: ForgeAdmission,
): Record<string, unknown> {
  const metadata = recordOf(configMap['metadata'], 'metadata');
  if (typeof metadata['resourceVersion'] !== 'string' || metadata['resourceVersion'] === '') {
    // An empty resourceVersion makes a replace unconditional, which is exactly the lost update
    // this module exists to prevent.
    throw new Error(`${TRUSTED_WORKLOAD} was read without a resourceVersion`);
  }
  return {
    ...configMap,
    metadata: {
      ...metadata,
      annotations: {
        ...(isRecord(metadata['annotations']) ? metadata['annotations'] : {}),
        [OWNERS_ANNOTATION]: JSON.stringify(state.owners),
        [BASE_ANNOTATION]: state.baseRoots.join(','),
      },
    },
    data: {
      ...recordOf(configMap['data'], 'data'),
      forgeImage: state.forgeImage,
      forgeWorktreeRoots: rootsOf(state).join(','),
    },
  };
}

/**
 * Read, plan and conditionally replace, retrying a bounded number of times on a conflict.
 *
 * @returns The state before and after the applied change.
 * @throws After `attempts` conflicts, or on any refusal from decode or plan.
 */
export async function updateForgeAdmission(
  store: ForgeAdmissionStore,
  labId: string,
  change: ForgeAdmissionChange,
  attempts = DEFAULT_ATTEMPTS,
): Promise<{ readonly before: ForgeAdmission; readonly after: ForgeAdmission }> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const configMap = recordOf(await store.read(), 'an object');
    const before = decodeForgeAdmission(configMap, labId);
    const after = planForgeAdmission(before, change);
    // Proof: dropping the resourceVersion from the replacement (an unconditional write) failed
    // `keeps both roots when two claims race`; live, two concurrent `up`s kept both roots only
    // with it (k3s-platform verify.md, F9 review).
    if ((await store.replace(encodeForgeAdmission(configMap, after))) === 'replaced') {
      return { before, after };
    }
  }
  throw new Error(
    `${TRUSTED_WORKLOAD} kept changing; gave up after ${String(attempts)} conflicting writes`,
  );
}
