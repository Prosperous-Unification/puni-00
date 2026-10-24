import type {
  CalendarMarkerView,
  ClaimsRead,
  ExternalSystemView,
  PersonView,
  PlanRead,
  ProjectApi,
  ServiceView,
  StepView,
  TagView,
  TeamView,
  WorkItemTypeView,
} from './wbs-api';

export type RefreshResource = 'tree' | 'steps' | 'directory' | 'markers' | 'claims';
export const ALL_RESOURCES: readonly RefreshResource[] = [
  'tree',
  'steps',
  'directory',
  'markers',
  'claims',
];

/** Unknown events may affect any resource; narrowing is a claim about known events only. */
export function resourcesFor(changed?: string | null): readonly RefreshResource[] {
  // Every claim, release, reap and cascade announces the tree, and a removed
  // work item takes its claims (`wbs-claim-display` C3).
  // Proof: answering `['tree']` here failed `refreshes the tree and claims after
  // a claim, release or reap` and four more cases across `plan-refresh`,
  // `plan-feed.resource` and `optimization-integration`; watched 2026-10-23.
  if (changed === 'tree_replaced') return ['tree', 'claims'];
  // Stays the tree's: the claims read does not need the engine.
  // Proof: removing `plan_unavailable` made its peer-refetch test ask for
  // `[tree, steps, directory, markers]`, expected the one `tree` resource.
  if (changed === 'plan_unavailable') return ['tree'];
  // A heartbeat moved a lease and nothing else. An fe-01 without this line
  // reads every resource per heartbeat per viewer, so it deploys before be-01
  // publishes the event (C5).
  // Proof: this line removed made `refreshes claims alone for a heartbeat`
  // (`plan-refresh.test.ts`) receive all five resources, expected
  // `['claims']`; watched 2026-10-23.
  if (changed === 'claims_changed') return ['claims'];
  if (
    changed === 'step_added' ||
    changed === 'step_renamed' ||
    changed === 'step_updated' ||
    changed === 'step_removed'
  ) {
    return ['tree', 'steps'];
  }
  if (changed === 'calendar_markers_changed') return ['markers'];
  // Bookings in a project above moved (`share-people-across-projects`): this
  // plan's dates may have, and nothing it names or lists did.
  // Proof: this line removed made `refetches only the tree when bookings
  // above move` (`plan-refresh.test.ts`) ask for every resource; re-watched
  // 2026-10-11.
  if (changed === 'elsewhere_changed') return ['tree'];
  return ALL_RESOURCES;
}

/** Vocabularies install as a group so a failed member cannot leave mixed labels. */
export interface DirectoryRead {
  teams: TeamView[];
  tags: TagView[];
  services: ServiceView[];
  workItemTypes: WorkItemTypeView[];
  externalSystems: ExternalSystemView[];
  people: PersonView[];
}

/**
 * A claims read as installed: be-01's `readAt` beside `installedAt`, the
 * monotonic instant (the owner's `monotonicNow`) its answer arrived in, which is
 * the turn it installs in. A lease's time left is `leaseExpiresAt − (readAt +
 * elapsed since installedAt)`, so the browser's wall clock never enters (C6).
 */
export interface InstalledClaims extends ClaimsRead {
  installedAt: number;
}

export interface ResourceRead<T> {
  desired: number;
  reading: boolean;
  installed: { generation: number; value: T } | null;
  failure: { generation: number; cause: unknown } | null;
}

export interface RefreshFailure {
  resource: RefreshResource;
  cause: unknown;
}

export type RefreshOutcome =
  | { status: 'installed' }
  | { status: 'failed'; failures: readonly RefreshFailure[] }
  | { status: 'disposed' };

export interface PlanRefreshSnapshot {
  tree: ResourceRead<PlanRead>;
  steps: ResourceRead<readonly StepView[]>;
  directory: ResourceRead<DirectoryRead>;
  markers: ResourceRead<readonly CalendarMarkerView[]>;
  claims: ResourceRead<InstalledClaims>;
  staleResources: readonly RefreshResource[];
  /** A covered anchor, replaced only by an explicit full resynchronization. */
  baseline: { seq: number; epoch: number } | null;
  acknowledged: number;
}

interface Obligation {
  resource: RefreshResource;
  generation: number;
}

interface Waiter {
  obligations: readonly Obligation[];
  resolve: (outcome: RefreshOutcome) => void;
}

interface ResourceControl {
  invalidate(): number;
  start(): void;
  fail(cause: unknown): void;
  installedGeneration(): number;
  failure(): ResourceRead<unknown>['failure'];
}

/**
 * One resource's generations. A running read cannot satisfy an invalidation
 * received after it started; the later desired generation causes a trailing read.
 */
function resourceRead<T>(
  load: () => Promise<T>,
  canRead: () => boolean,
  isDisposed: () => boolean,
  changed: () => void,
): ResourceControl & { snapshot(): ResourceRead<T> } {
  let reading = false;
  let attempted = 0;
  let desired = 0;
  let installed: ResourceRead<T>['installed'] = null;
  let failure: ResourceRead<T>['failure'] = null;

  async function read(generation: number): Promise<void> {
    let answer: { ok: true; value: T } | { ok: false; cause: unknown };
    try {
      answer = { ok: true, value: await load() };
    } catch (cause) {
      answer = { ok: false, cause };
    }
    if (isDisposed()) return;
    reading = false;
    // Proof: accepting a superseded response changed installed generation1 to2
    // while its covering read was held in `does not install or complete a superseded read`.
    if (generation === desired) {
      if (answer.ok) {
        installed = { generation, value: answer.value };
        failure = null;
      } else {
        failure = { generation, cause: answer.cause };
      }
    }
    changed();
    // Proof: removing this continuation left one request instead of two in
    // `installs B with a trailing read without a third invalidation`.
    start();
  }

  function start(): void {
    if (isDisposed() || !canRead() || reading || attempted >= desired) return;
    attempted = desired;
    reading = true;
    void read(attempted);
  }

  return {
    invalidate() {
      desired += 1;
      return desired;
    },
    start,
    fail(cause) {
      failure = { generation: desired, cause };
      attempted = desired;
    },
    installedGeneration: () => installed?.generation ?? 0,
    failure: () => failure,
    snapshot: () => ({ desired, reading, installed, failure }),
  };
}

export interface PlanRefresh {
  /** Establishes an anchored baseline, coalescing concurrent resync requests. */
  initialize(): Promise<RefreshOutcome>;
  invalidate(invalidation: {
    resources: readonly RefreshResource[];
    seq?: number;
  }): Promise<RefreshOutcome>;
  getSnapshot(): PlanRefreshSnapshot;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

/**
 * The part of the HTTP client a refresh owner reads through: the plan feed's
 * private repository port.
 *
 * The five resources and nothing else — the tree, the steps, the six
 * vocabularies of the grouped directory, the calendar markers and the claims. A refresh
 * owner can write nothing and cannot reach another project's catalogue entry.
 * The project composition root (`modules/project/composition.ts`) supplies it
 * from the one client; delivery never sees it (rule K2).
 */
export type PlanReadRoutes = Pick<
  ProjectApi,
  | 'tree'
  | 'steps'
  | 'listTeams'
  | 'listTags'
  | 'listServices'
  | 'listWorkItemTypes'
  | 'listExternalSystems'
  | 'listPeople'
  | 'listCalendarMarkers'
  | 'readClaims'
>;

/**
 * Owns reads for one project/API lifetime. React consumes installed generations;
 * no transport promise, URL cache or unrelated resource decides their authority.
 * See openspec/changes/plan-refresh/design.md for bootstrap and sequence coverage.
 *
 * Every read looks its route up when it is made, so a client whose method is
 * replaced after the owner is built is read through the replacement.
 *
 * Claims never gate the baseline: they are read beside the anchored reads, and
 * a failed claims read (an older be-01 answers 404) leaves the plan installed
 * with claims stale (C12).
 */
export function createPlanRefresh({
  projectId,
  routes,
  monotonicNow,
}: {
  projectId: string;
  routes: PlanReadRoutes;
  /** A monotonic clock in milliseconds; production passes `performance.now`. */
  monotonicNow: () => number;
}): PlanRefresh {
  let disposed = false;
  const isDisposed = (): boolean => disposed;
  let unsequencedAllowed = false;
  let baseline: PlanRefreshSnapshot['baseline'] = null;
  let acknowledged = -1;
  let received = -1;
  let epoch = 0;
  let initializing: Promise<RefreshOutcome> | null = null;
  let requestedBaseline = 0;
  const listeners = new Set<() => void>();
  const waiters = new Set<Waiter>();
  const events = new Map<number, readonly Obligation[]>();
  const tree = resourceRead(
    () => routes.tree(projectId),
    () => true,
    () => disposed,
    publish,
  );
  const steps = resourceRead(
    () => routes.steps(projectId),
    () => unsequencedAllowed,
    () => disposed,
    publish,
  );
  const directory = resourceRead(
    async (): Promise<DirectoryRead> => {
      const [teams, tags, services, workItemTypes, externalSystems, people] = await Promise.all([
        routes.listTeams(),
        routes.listTags(),
        routes.listServices(),
        routes.listWorkItemTypes(),
        routes.listExternalSystems(),
        routes.listPeople(),
      ]);
      return { teams, tags, services, workItemTypes, externalSystems, people };
    },
    () => unsequencedAllowed,
    () => disposed,
    publish,
  );
  const markers = resourceRead(
    () => routes.listCalendarMarkers(projectId),
    () => unsequencedAllowed,
    () => disposed,
    publish,
  );
  const claims = resourceRead(
    async (): Promise<InstalledClaims> => {
      const read = await routes.readClaims(projectId);
      return { ...read, installedAt: monotonicNow() };
    },
    // Readable at any time, anchored or not: a claims read is a complete
    // snapshot that no sequence covers (C20), and a claim the installed tree
    // lacks is simply not drawn (C11).
    // Proof: `() => unsequencedAllowed` here left `reads claims during an
    // initialize whose anchor fails` `pending`, expected `installed`, and
    // `reads claims, not the tree, for heartbeats while unanchored` timed out
    // waiting for an anchor; watched 2026-10-23.
    () => true,
    () => disposed,
    publish,
  );
  // Proof: replacing these per-resource generations with one host-wide generation made the
  // mounted held-step overlap test lose "Renamed step" while its no-competing control passed.
  // Proof: `claims: tree` (claims sharing the tree's generation) failed all four
  // `claims as a refresh resource` cases, among them a heartbeat reading
  // `['tree']` and a held claims read never reading; watched 2026-10-23.
  const resources: Record<RefreshResource, ResourceControl> = {
    tree,
    steps,
    directory,
    markers,
    claims,
  };
  let snapshot: PlanRefreshSnapshot = capture();

  function capture(): PlanRefreshSnapshot {
    return {
      tree: tree.snapshot(),
      steps: steps.snapshot(),
      directory: directory.snapshot(),
      markers: markers.snapshot(),
      claims: claims.snapshot(),
      staleResources: ALL_RESOURCES.filter((name) => resources[name].failure() !== null),
      baseline,
      acknowledged,
    };
  }

  function isCovered(obligation: Obligation): boolean {
    return resources[obligation.resource].installedGeneration() >= obligation.generation;
  }

  function outcomeOf(obligations: readonly Obligation[]): RefreshOutcome | null {
    const failures: RefreshFailure[] = [];
    for (const obligation of obligations) {
      if (isCovered(obligation)) continue;
      const failure = resources[obligation.resource].failure();
      if (failure === null || failure.generation < obligation.generation) return null;
      failures.push({ resource: obligation.resource, cause: failure.cause });
    }
    return failures.length === 0 ? { status: 'installed' } : { status: 'failed', failures };
  }

  function publish(): void {
    if (isDisposed()) return;
    for (;;) {
      const next = events.get(acknowledged + 1);
      if (!next?.every(isCovered)) break;
      acknowledged += 1;
      events.delete(acknowledged);
    }
    // Proof: acknowledging tree.seq here resumed at1 rather than0 in the real
    // API/stream `does not resume past unseen marker B` reconnect scenario.
    // Clearing freshness here instead failed `keeps failed markers stale` on
    // expected ['markers'], received []. Freshness belongs to each resource.
    snapshot = capture();
    for (const listener of listeners) listener();
    for (const waiter of waiters) {
      const outcome = outcomeOf(waiter.obligations);
      if (outcome === null) continue;
      waiters.delete(waiter);
      waiter.resolve(outcome);
    }
  }

  function request(names: readonly RefreshResource[], seq?: number): Promise<RefreshOutcome> {
    if (isDisposed()) return Promise.resolve({ status: 'disposed' });
    const obligations = [...new Set(names)].map((resource) => ({
      resource,
      generation: resources[resource].invalidate(),
    }));
    // Claims never hold the stream acknowledgment (`wbs-claim-display` C20): a
    // claims read is a complete snapshot, so a later one covers whatever an
    // acknowledged event changed, and its failure stays visible as claims'
    // own stale state. An older be-01 without the claims read would otherwise
    // pin every reconnect to the baseline.
    // Proof: recording claims obligations here held `resumes past tree events
    // while claims fail` (`plan-refresh-stream.test.ts`) at acknowledged 0,
    // expected 2; watched 2026-10-23.
    if (seq !== undefined && seq > acknowledged)
      events.set(
        seq,
        obligations.filter((obligation) => obligation.resource !== 'claims'),
      );
    const pending = new Promise<RefreshOutcome>((resolve) => {
      waiters.add({ obligations, resolve });
    });
    for (const obligation of obligations) resources[obligation.resource].start();
    publish();
    return pending;
  }

  async function establish(): Promise<RefreshOutcome> {
    unsequencedAllowed = false;
    // Proof: reading markers before this anchor left Launch absent in the real
    // API/stream `does not use a marker response captured before the initial tree anchor`.
    const anchored = await request(['tree']);
    if (anchored.status !== 'installed') {
      if (anchored.status === 'failed') {
        // Not claims: they read without the anchor, so the tree's failure is
        // not theirs.
        for (const name of ['steps', 'directory', 'markers'] as const)
          resources[name].fail(anchored.failures);
        publish();
      }
      return anchored;
    }
    if (isDisposed()) return { status: 'disposed' };
    const anchor = tree.snapshot().installed;
    if (anchor === null) throw new Error('a completed tree read has no installed anchor');
    unsequencedAllowed = true;
    // Not awaited: the baseline stands without claims, which keep their own
    // failure and stale state.
    // Proof: claims folded into the awaited request below made `anchors the
    // baseline without claims when the claims read is refused` initialize
    // `failed`, expected `installed`, and left `draws the plan with the stale
    // notice when an older be-01 answers 404 for claims`
    // (`plan-read-and-write.test.tsx`) with no rows, expected `['010']`;
    // watched 2026-10-23.
    void request(['claims']);
    const completed = await request(['steps', 'directory', 'markers']);
    if (completed.status !== 'installed') return completed;
    if (isDisposed()) return { status: 'disposed' };
    epoch += 1;
    baseline = { seq: anchor.value.seq, epoch };
    acknowledged = Math.max(acknowledged, anchor.value.seq);
    received = Math.max(received, acknowledged);
    for (const seq of events.keys()) if (seq <= acknowledged) events.delete(seq);
    publish();
    return { status: 'installed' };
  }

  function initialize(): Promise<RefreshOutcome> {
    if (isDisposed()) return Promise.resolve({ status: 'disposed' });
    // Proof: joining without retaining a later gap left After gap undefined in
    // `retains a new sequence gap ... while an anchored resync is reading markers`.
    requestedBaseline += 1;
    if (initializing !== null) return initializing;
    const establishPending = async (): Promise<RefreshOutcome> => {
      for (;;) {
        const requested = requestedBaseline;
        const outcome = await establish();
        if (isDisposed() || requested === requestedBaseline) return outcome;
      }
    };
    initializing = establishPending().finally(() => {
      initializing = null;
    });
    return initializing;
  }

  return {
    initialize,
    invalidate({ resources: names, seq }) {
      if (isDisposed()) return Promise.resolve({ status: 'disposed' });
      // A claims-only invalidation never escalates to a resynchronisation:
      // claims need no anchor, and a heartbeat per agent must not become a
      // tree read while the anchor is failing (`plan-refresh` delta).
      // Proof: without `!claimsOnly`, `reads claims, not the tree, for
      // heartbeats while unanchored` read the tree again (`['tree']`, expected
      // none); watched 2026-10-23.
      const claimsOnly = names.length > 0 && names.every((name) => name === 'claims');
      if (!unsequencedAllowed && initializing === null && !claimsOnly) return initialize();
      if (seq !== undefined) {
        if (seq <= acknowledged) return Promise.resolve({ status: 'installed' });
        const gap = seq > received + 1;
        received = Math.max(received, seq);
        // Proof: keeping only the known tree scope left Missed marker undefined
        // in `recovers an unseen sequence gap ... without another frame`; the real
        // API/stream `covers an unseen marker ...` also lost Launch with that fault.
        if (gap) return initialize();
      }
      return request(names, seq);
    },
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (isDisposed()) return () => undefined;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      // Proof: removing disposal changed snapshot identity after both late resolve
      // and late reject in `ends pending obligations on disposal`.
      disposed = true;
      listeners.clear();
      for (const waiter of waiters) waiter.resolve({ status: 'disposed' });
      waiters.clear();
    },
  };
}
