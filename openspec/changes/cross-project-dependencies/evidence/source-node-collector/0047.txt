import { assertParticipantRestorationContext } from './complete-dependency-exclusion';
import type { FinalizedParticipantRestorationContext } from './dependency-participant-preparation';
import {
  assertParticipantTransition,
  readParticipantSnapshot,
} from './dependency-participant-transition';
import {
  checkDeadline,
  freezeDeep,
  inspectRuntime,
  observeRoster,
} from './dependency-product-process';
import { decodePasses } from './dependency-product-validation';
import { ProductMetadataCleanupUnproved } from './docker-product-metadata';
import { assertSame, readFields } from './managed-cohort';
import { observeSourceInner } from './source-inner-process';
import { inspectSourceProfile, UnsupportedSourceProfile } from './source-role-profile';

const bindings = new WeakMap<FinalizedParticipantRestorationContext, string>();
const observing = new WeakSet<FinalizedParticipantRestorationContext>();
const terminal = new WeakSet<FinalizedParticipantRestorationContext>();

/**
 * Read-only whole-source observation under the original consumed activation context.
 * The same source monitor brackets raw host/inner process and listener observations.
 * The first validated complete candidate remains private even if a closing check
 * refuses; later observations cannot replace that binding for this context's lifetime;
 * returning frozen evidence grants no startup, HTTP readiness or restoration authority.
 * Unsupported launch members refuse by name; installed whole-source topology still
 * requires separate native acceptance before source startup orchestration is enabled.
 */
export async function observeSelectedSourceRoles(context: FinalizedParticipantRestorationContext) {
  // Proof: omitting terminal refusal admitted a second observation after actual cleanup transport failure; the raw cleanup consumer missed its rejection, then passed after exact restoration.
  if (terminal.has(context) || observing.has(context))
    throw new Error('source process observation refused');
  observing.add(context);
  let collecting = false;
  try {
    // Proof: omitting this call dispatched two helpers for a copied context; the raw consumer expected zero and failed, then passed after exact restoration.
    await assertParticipantRestorationContext(context);
    checkDeadline(context.deadline, 40000);
    // Proof: omitting this call dispatched two helpers with corrupted generated OpenAPI; the opening-monitor consumer expected zero and failed, then passed after exact restoration.
    await context.source.inspectRunning();
    const selected = context.participants.selected.source;
    const original = context.originals.source;
    if (selected.id !== original.id) throw new Error('source selected original differs');
    const parked = context.parkedInventory
      .filter((member) => readFields(member)['Id'] === original.id)
      .map(readParticipantSnapshot);
    if (parked.length !== 1) throw new Error('source original parked member absent');
    const runtime = await inspectRuntime(context, original.id);
    assertParticipantTransition(parked[0], runtime.native, 'start');
    const firstRoster = await observeRoster(context, original.id, runtime.pid);
    collecting = true;
    const passes = decodePasses(
      await observeSourceInner(context, original.id, firstRoster),
      firstRoster,
    );
    collecting = false;
    // Proof: omitting this readback accepted a changed closing listener inode; the raw closing-listener consumer missed its rejection, then passed after exact restoration.
    assertSame(passes[0], passes[1], 'source inner process/listener readback');
    const profile = inspectSourceProfile(passes[0], firstRoster, runtime.native);
    const identities = passes[0].processes.map(({ sockets: _sockets, ...identity }) => identity);
    const binding = JSON.stringify({
      runtime,
      roster: firstRoster,
      identities,
      profile,
      configuration: context.source.configuration,
      openapiSha256: context.source.openapiSha256,
      selected,
    });
    const first = bindings.get(context);
    if (first === undefined) bindings.set(context, binding);
    // Proof: omitting retained comparison rebound a reused application PID with a new start tick; the raw pid-reuse consumer missed its rejection, then passed after exact restoration.
    else assertSame(first, binding, 'source original whole-process binding');
    const lastRoster = await observeRoster(context, original.id, runtime.pid);
    // Proof: omitting this comparison accepted changed closing host start ticks; the raw closing-host consumer missed its rejection, then passed after exact restoration.
    assertSame(firstRoster, lastRoster, 'source host process roster readback');
    const finalRuntime = await inspectRuntime(context, original.id);
    // Proof: omitting this transition check accepted changed closing StartedAt; the raw closing-runtime consumer missed its rejection, then passed after exact restoration.
    assertParticipantTransition(runtime, finalRuntime.native, 'stable');
    // Proof: omitting this call accepted generated OpenAPI drift during collection; the raw closing-output consumer missed its rejection, then passed after exact restoration.
    await context.source.inspectRunning();
    await assertParticipantRestorationContext(context);
    return freezeDeep(
      structuredClone({
        runtime: finalRuntime,
        roster: firstRoster,
        processes: passes[0].processes,
        roles: profile.roles,
        namespaces: passes[0].processes[0].namespaces,
        localAddresses: profile.localAddresses,
      }),
    );
  } catch (cause) {
    if (collecting || cause instanceof ProductMetadataCleanupUnproved) terminal.add(context);
    if (cause instanceof UnsupportedSourceProfile) throw cause;
  } finally {
    observing.delete(context);
  }
  throw new Error('source process observation refused');
}
