import { assertParticipantRestorationContext } from './complete-dependency-exclusion';
import type { FinalizedParticipantRestorationContext } from './dependency-participant-preparation';
import { restoreSolverUnderOwner } from './dependency-solver-restoration';
import type { InstalledAuthorityObservation } from './installed-authorities';
import { assertSame } from './managed-cohort';
import type { SolverPorts, SolverRestorePorts } from './solver-host';

type RestoredSolver = Awaited<ReturnType<typeof restoreSolverUnderOwner>>;
type SolverRestorationPhase =
  { readonly state: 'attempted' } | { readonly state: 'ready'; readonly solver: RestoredSolver };

/** Effect accounting belongs to the original consumed context; summaries cannot recreate this phase. */
const restorations = new WeakMap<FinalizedParticipantRestorationContext, SolverRestorationPhase>();

/** Internal transports keep their declared socket signature; the runtime boundary refuses its absence before effects. */
function hasRestorationSocket(ports: SolverPorts): ports is SolverRestorePorts {
  return 'connectSocket' in ports && typeof ports.connectSocket === 'function';
}

function projectAuthorityIdentity(authority: InstalledAuthorityObservation) {
  return {
    format: authority.format,
    version: authority.version,
    activation: authority.activation,
    sourceSha: authority.sourceSha,
    writerManifestSha256: authority.writerManifestSha256,
    hostMachineIdSha256: authority.hostMachineIdSha256,
    bootId: authority.bootId,
    launchConfigurationSha256: authority.launchConfigurationSha256,
    files: authority.files,
    tuple: authority.solver.tuple,
    scope: authority.scope,
  };
}

/** Rechecks the same retained activation barriers; no observation recreates their original authority. */
async function inspectPreparedBarriers(
  context: FinalizedParticipantRestorationContext,
  removed: ReadonlySet<string>,
): Promise<void> {
  // Proof: grouped omission here and at entry admitted the present case's spread
  // copy; its expected refusal was undefined. Exact restoration passed.
  await assertParticipantRestorationContext(context);
  await context.storage.evidence.inspect();
  context.artifact.verify();
  await context.storage.stores.inspect();
  await context.source.inspectCold();
  await context.parked.inspect(removed);
}

/** Admits only the actual solver transition while retaining every original static identity and empty store opener set. */
async function inspectPreparedParticipants(
  context: FinalizedParticipantRestorationContext,
  solver: RestoredSolver | null,
): Promise<void> {
  const removed = solver === null ? new Set<string>() : solver.removed;
  await inspectPreparedBarriers(context, removed);
  if (solver !== null) await solver.inspectReady();
  const observed = await context.observeAuthorities();
  // Proof: omitting this grouped equality accepted raw boot drift; authority-drift
  // expected an Error and received undefined, then passed after exact restoration.
  assertSame(
    {
      ...projectAuthorityIdentity(context.authorities),
      solver: solver === null ? context.authorities.solver : { phase: 'running' },
      databaseOpeners: [],
    },
    {
      ...projectAuthorityIdentity(observed),
      solver: solver === null ? observed.solver : { phase: observed.solver.phase },
      databaseOpeners: observed.databaseOpeners,
    },
    'solver restoration original installed authority and phase',
  );
  // The actual observer binds the same effective unit/process/tuple. The
  // retained primitive brackets that census without rebinding its first identity.
  if (solver !== null) await solver.inspectReady();
  // Proof: omitting this closing check accepted late source restart-policy drift;
  // late-source received no refusal, then passed after exact restoration.
  await inspectPreparedBarriers(context, removed);
}

/**
 * Restores only the pinned solver after actual activation finalizers, under the
 * same consumed context, owner and absolute deadline. Products, ingress and
 * controllers remain fenced. The actual primitive return is retained privately;
 * this closed summary grants no later effect. Failure is terminal and preserves
 * current storage and durable recovery evidence without automatic rollback.
 * @throws one sanitized refusal for absent transport, expired/reused context or
 * changed activation/authority/readiness; private diagnostics are not disclosed.
 */
export async function restoreSolverForPreparedParticipants(
  context: FinalizedParticipantRestorationContext,
): Promise<{
  readonly state: 'solver-ready-participants-fenced';
  readonly exposure: 'closed';
  readonly controllers: 'fenced';
}> {
  try {
    // Proof: the grouped entry/barrier admission omission let the present case's
    // copied context return readiness; exact restoration restored its refusal.
    await assertParticipantRestorationContext(context);
    // Proof: omitting terminal accounting let the absent case repair its socket
    // and wrongly succeed; expected Error was undefined, then restoration passed.
    if (restorations.has(context)) throw new Error('solver restoration already attempted');
    restorations.set(context, { state: 'attempted' });
    const ports = context.ports.solver;
    // Proof: omitting this early check entered the actual primitive in absent:
    // expected zero primitive calls, received one; exact restoration passed.
    if (!hasRestorationSocket(ports)) throw new Error('solver restoration socket transport absent');
    await inspectPreparedParticipants(context, null);
    const solver = await restoreSolverUnderOwner(
      context.owner,
      context.layouts,
      context.request.solver,
      ports,
      context.deadline,
      context.originalPolicy,
      {
        parked: context.parked,
        intent: context.solverIntent,
        installed: context.authorities.solver.tuple,
      },
    );
    await inspectPreparedParticipants(context, solver);
    restorations.set(context, { state: 'ready', solver });
    return { state: 'solver-ready-participants-fenced', exposure: 'closed', controllers: 'fenced' };
  } catch {
    throw new Error('solver participant restoration refused');
  }
}
