import type { ReleaseEffects } from './execute';
import type { JournalRecord, ReleaseJournal } from './journal';
import {
  type FluxUnit,
  K8S_TIERS,
  type K8sTier,
  type ObservedLease,
  type ReleaseIdentity,
  type ReleaseRequest,
} from './release';

/** A migration folder as one backend image carries it. */
export interface FakeMigration {
  name: string;
  hash: string;
  downSha256: string;
}

type EffectName = keyof ReleaseEffects;

/**
 * In-memory model of the WBS namespaces for executor tests. It enforces the property the
 * transaction exists for: at most one writer (a backend pod or a schema Job) at any instant,
 * and no schema Job while the backend runs.
 */
export class FakeCluster implements ReleaseEffects {
  readonly uid = 'uid-lab';
  backendReplicas = 1;
  images: Record<K8sTier, string>;
  record: ReleaseIdentity;
  approved: string[];
  writesOpen = true;
  fluxSuspended = false;
  fluxRevision: string;
  lease: (ObservedLease & { version: number }) | null = null;
  /** Fake wall clock in ms; tests advance it to expire Leases. */
  now = 1_000_000;
  readonly leaseDurationSeconds = 20;
  /** Manifests each deploy-repository revision pins; resuming Flux applies the served one. */
  readonly sourceImages = new Map<string, ReleaseIdentity>();
  applied: string[];
  /** Rows written through the open write path, tagged with the schema they were written under. */
  rows: string[] = [];
  readonly migrationsByImage = new Map<string, FakeMigration[]>();
  readonly unhealthy = new Set<string>();
  /** Effects that throw once when called, keyed by name. */
  readonly faults = new Map<EffectName, Error>();
  /** Effects that throw on every call. */
  readonly brokenEffects = new Set<EffectName>();
  readonly calls: EffectName[] = [];
  migrationJobRuns = 0;
  maxConcurrentWriters = 0;

  constructor(current: ReleaseIdentity, applied: string[], fluxRevision: string) {
    this.images = { ...current.images };
    this.record = current;
    this.approved = [current.images.backend];
    this.applied = [...applied];
    this.fluxRevision = fluxRevision;
  }

  private enter(name: EffectName): void {
    this.calls.push(name);
    const fault = this.faults.get(name);
    if (fault !== undefined) {
      this.faults.delete(name);
      throw fault;
    }
    if (this.brokenEffects.has(name)) throw new Error(`${name} is broken`);
  }

  /** F6 admission: a backend-image pod starts only if its digest is in `solverImages`. */
  private admit(image: string): void {
    if (!this.approved.includes(image)) throw new Error(`admission denied ${image}`);
  }

  private writerJob(): void {
    const writers = this.backendReplicas + 1;
    this.maxConcurrentWriters = Math.max(this.maxConcurrentWriters, writers);
    if (this.backendReplicas > 0) throw new Error('schema Job started while the backend runs');
  }

  private migrationsOf(image: string): FakeMigration[] {
    const migrations = this.migrationsByImage.get(image);
    if (migrations === undefined) throw new Error(`no migrations modelled for ${image}`);
    return migrations;
  }

  /** A write through the public path; refused while fenced or while no backend serves. */
  write(row: string): void {
    if (!this.writesOpen || this.backendReplicas === 0) throw new Error('writes are closed');
    this.rows.push(row);
  }

  observeCluster(request: ReleaseRequest) {
    this.enter('observeCluster');
    if (request.flux !== null && request.recovers === null && this.fluxSuspended)
      throw new Error('flux already suspended');
    return Promise.resolve({
      uid: this.uid,
      current: this.record,
      approvedBackendImages: this.approved,
    });
  }
  readonly clock = (): number => this.now;

  /** Leaves a Lease as a process that has since died would have. */
  seedLease(holder: string, journal: string | null, parked: string | null = null): void {
    this.lease = {
      holder,
      renewedAtMs: this.now,
      durationSeconds: this.leaseDurationSeconds,
      parked,
      journal,
      version: 1,
    };
  }

  readLease() {
    this.enter('readLease');
    return Promise.resolve(
      this.lease === null ? null : { ...this.lease, version: String(this.lease.version) },
    );
  }
  createLease(holder: string, journalPath: string) {
    this.enter('createLease');
    if (this.lease !== null) throw new Error('AlreadyExists');
    this.seedLease(holder, journalPath);
    return Promise.resolve();
  }
  takeoverLease(holder: string, version: string, journalPath: string) {
    this.enter('takeoverLease');
    if (this.lease === null || String(this.lease.version) !== version) throw new Error('Conflict');
    this.lease = {
      holder,
      renewedAtMs: this.now,
      durationSeconds: this.leaseDurationSeconds,
      parked: null,
      journal: journalPath,
      version: this.lease.version + 1,
    };
    return Promise.resolve();
  }
  renewLease(holder: string) {
    this.enter('renewLease');
    if (this.lease?.holder !== holder) {
      throw new Error(`Lease is held by ${this.lease?.holder ?? 'nobody'}`);
    }
    this.lease = { ...this.lease, renewedAtMs: this.now, version: this.lease.version + 1 };
    return Promise.resolve();
  }
  parkLease(holder: string, phase: string) {
    this.enter('parkLease');
    if (this.lease?.holder === holder) {
      this.lease = { ...this.lease, parked: phase, version: this.lease.version + 1 };
    }
    return Promise.resolve();
  }
  releaseLease(holder: string) {
    this.enter('releaseLease');
    if (this.lease !== null && this.lease.holder !== holder) throw new Error('foreign lease');
    this.lease = null;
    return Promise.resolve();
  }
  admitBackendImages(images: readonly string[]) {
    this.enter('admitBackendImages');
    this.approved = [...images];
    return Promise.resolve();
  }
  suspendFlux() {
    this.enter('suspendFlux');
    this.fluxSuspended = true;
    return Promise.resolve();
  }
  fluxSourceRevision() {
    this.enter('fluxSourceRevision');
    return Promise.resolve(this.fluxRevision);
  }
  /** Resuming applies whatever the source serves, exactly as Flux would. */
  resumeFlux(_unit: FluxUnit, revision: string) {
    this.enter('resumeFlux');
    if (this.fluxRevision !== revision) {
      throw new Error(`Flux source is at ${this.fluxRevision}, not ${revision}`);
    }
    this.fluxSuspended = false;
    const served = this.sourceImages.get(this.fluxRevision);
    if (served !== undefined) this.images = { ...served.images };
    return Promise.resolve();
  }
  manualFluxResumeCommand(unit: FluxUnit, revision: string) {
    return `revert ${unit.gitRepository} to ${revision}, then resume ${unit.kustomization}`;
  }
  closeWrites() {
    this.enter('closeWrites');
    this.writesOpen = false;
    return Promise.resolve();
  }
  reopenWrites() {
    this.enter('reopenWrites');
    this.writesOpen = true;
    return Promise.resolve();
  }
  drainGateway() {
    this.enter('drainGateway');
    return Promise.resolve();
  }
  stopWriter() {
    this.enter('stopWriter');
    this.backendReplicas = 0;
    return Promise.resolve();
  }
  capture(releaseId: string, image: string) {
    this.enter('capture');
    this.admit(image);
    this.writerJob();
    const folders = this.migrationsOf(image);
    const pending = folders.filter((m) => !this.applied.includes(m.name));
    return Promise.resolve({
      capture: {
        baseline: this.applied.at(-1) ?? 'none',
        applied: this.applied.map((name) => ({ name, hash: `hash-${name}` })),
        pending: pending.map((m) => ({ name: m.name, downSha256: m.downSha256 })),
      },
      snapshot: { path: `/data/snapshots/${releaseId}.sqlite`, sha256: 'f'.repeat(64) },
    });
  }
  migrate(_releaseId: string, image: string) {
    this.enter('migrate');
    this.admit(image);
    this.writerJob();
    this.migrationJobRuns++;
    for (const m of this.migrationsOf(image)) {
      if (!this.applied.includes(m.name)) this.applied.push(m.name);
    }
    return Promise.resolve([...this.applied]);
  }
  observeDownMigrations(_releaseId: string, image: string) {
    this.enter('observeDownMigrations');
    this.admit(image);
    return Promise.resolve(
      this.migrationsOf(image).map((m) => ({ name: m.name, downSha256: m.downSha256 })),
    );
  }
  rollbackSchema(_releaseId: string, image: string, baseline: string) {
    this.enter('rollbackSchema');
    this.admit(image);
    this.writerJob();
    const keep = baseline === 'none' ? 0 : this.applied.indexOf(baseline) + 1;
    this.applied = this.applied.slice(0, keep);
    return Promise.resolve([...this.applied]);
  }
  manualReopenCommand(releaseId: string) {
    return `reopen writes and delete the Lease of ${releaseId}`;
  }
  manualSchemaCommand(releaseId: string, _image: string, baseline: string) {
    return `kubectl --context lab create -f /state/wbs-manual-rollback-${releaseId}.json # --to=${baseline}`;
  }
  rolloutBackend(image: string) {
    this.enter('rolloutBackend');
    this.admit(image);
    this.images.backend = image;
    this.backendReplicas = 1;
    if (this.unhealthy.has(image)) throw new Error(`backend ${image} never became ready`);
    return Promise.resolve();
  }
  rolloutTiers(identity: ReleaseIdentity) {
    this.enter('rolloutTiers');
    this.admit(identity.images.backend);
    for (const tier of K8S_TIERS) this.images[tier] = identity.images[tier];
    this.backendReplicas = 1;
    if (this.unhealthy.has(identity.images.backend)) throw new Error('backend never became ready');
    return Promise.resolve();
  }
  smoke() {
    this.enter('smoke');
    return Promise.resolve();
  }
  persistRelease(identity: ReleaseIdentity) {
    this.enter('persistRelease');
    this.record = identity;
    return Promise.resolve();
  }
  reconcileDesired() {
    this.enter('reconcileDesired');
    return Promise.resolve();
  }
}

/** Raised by {@link memoryJournal} to model the coordinator process dying right after a write. */
export class CrashSignal extends Error {}

/** A journal whose durable copy is a JSON string; `crashAfter` kills the "process" once. */
export function memoryJournal(): ReleaseJournal & {
  crashAfter: string | null;
  stored: string | null;
} {
  return {
    path: '/state/release.json',
    crashAfter: null,
    stored: null,
    read() {
      return this.stored === null ? null : (JSON.parse(this.stored) as JournalRecord);
    },
    write(record: JournalRecord) {
      this.stored = JSON.stringify(record);
      if (this.crashAfter === record.state.phase) {
        this.crashAfter = null;
        throw new CrashSignal(`crashed after ${record.state.phase}`);
      }
    },
  };
}
