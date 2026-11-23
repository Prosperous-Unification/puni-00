import { serialize } from 'node:v8';

import type { ChainAccess, ResolvedPlanInputReads } from '@wbs/core';

import { captureReadEpoch, type Drizzle, type ReadEpoch } from './db';

type AvailableEpoch = Extract<ReadEpoch, { readonly kind: 'available' }>;
type CapturedRows = Omit<ResolvedPlanInputReads, 'workPackage'>;

interface RetainedRows {
  readonly rows: CapturedRows;
  readonly fingerprint: string;
  readonly bytes: number;
}

interface RetainedEpoch {
  readonly key: string;
  readonly entries: Map<string, RetainedRows>;
  bytes: number;
}

/** One capture's ephemeral turn; only plain detached rows survive its return. */
export interface CurrentInputTurn {
  read(workPackage: ResolvedPlanInputReads['workPackage']): ResolvedPlanInputReads | undefined;
  remember(reads: ResolvedPlanInputReads): void;
}

/**
 * Reuses independently fingerprinted current rows on an identical owned readonly snapshot.
 * Settings/package DTOs are supplied freshly and excluded from retained rows. Main/TEMP
 * evidence belongs to the physical owner, never the pool wrapper, revision or event cursor.
 * Each owner retains at most32 packages and8MiB of serialized input; actual heap size may differ.
 * Insertion/read clones isolate both callers.
 * Historical/connected readers do not use this optional cache. Weak identities retain no client.
 */
export class CurrentPlanInputMemo {
  private readonly epochs = new WeakMap<object, RetainedEpoch>();
  private readonly fingerprints = new WeakMap<ResolvedPlanInputReads, string>();

  /** Declines optional reuse for unsupported owners; a configured capture seam must bypass this method. */
  observeIn(
    db: Drizzle,
    workPackageId: string,
    access: ChainAccess | undefined,
  ): CurrentInputTurn | null {
    const epoch = captureReadEpoch(db);
    if (epoch.kind === 'unavailable') return null;
    const key = keyOf(epoch);
    let retained = this.epochs.get(epoch.owner);
    if (retained?.key !== key) {
      retained = { key, entries: new Map(), bytes: 0 };
      this.epochs.set(epoch.owner, retained);
    }
    const address = JSON.stringify([
      access?.kind === 'scoped' ? access.scope.organizationId : null,
      workPackageId,
    ]);
    const selected = retained;
    return {
      read: (workPackage) => {
        const entry = selected.entries.get(address);
        if (entry === undefined) return undefined;
        removeEntry(selected.entries, address);
        selected.entries.set(address, entry);
        // Proof: read-clone omission let the second capture's888 overwrite the next estimate12 (V114).
        const reads = { ...structuredClone(entry.rows), workPackage };
        // Proof: omitting fresh workPackage from both fingerprint payloads hid a changed startDate (V114 settings-fingerprint).
        this.fingerprints.set(reads, fingerprintOf({ workPackage, rows: entry.fingerprint }));
        return reads;
      },
      remember: (reads) => {
        const after = captureReadEpoch(db);
        // Proof: publication-epoch omission accepted a real TEMP DDL change during a capture turn (V114).
        if (after.kind !== 'available' || after.owner !== epoch.owner || keyOf(after) !== key)
          throw new Error('current input snapshot evidence changed during capture');
        const { workPackage, ...rows } = reads;
        // Proof: row-fingerprint replacing these bytes with an empty object hid an estimate12→99 edit (V114).
        const encoded = serialize(rows);
        const fingerprint = new Bun.CryptoHasher('sha256').update(encoded).digest('hex');
        this.fingerprints.set(reads, fingerprintOf({ workPackage, rows: fingerprint }));
        const preceding = selected.entries.get(address);
        if (preceding !== undefined) selected.bytes -= preceding.bytes;
        removeEntry(selected.entries, address);
        selected.entries.set(address, {
          // Proof: insert-clone omission let the initial capture's999 overwrite the retained estimate12 (V114).
          rows: structuredClone(rows),
          fingerprint,
          bytes: encoded.length,
        });
        selected.bytes += encoded.length;
        for (const [oldest, entry] of selected.entries) {
          // Proof: package-bound retained33 packages; byte-bound retained9MiB despite the count limit (V114 finite consumer omissions).
          if (selected.entries.size <= 32 && selected.bytes <= 8 * 1024 * 1024) break;
          removeEntry(selected.entries, oldest);
          selected.bytes -= entry.bytes;
        }
      },
    };
  }

  /** Independent complete input evidence, including the freshly resolved work-package settings. */
  evidenceOf(reads: ResolvedPlanInputReads): string | undefined {
    return this.fingerprints.get(reads);
  }
}

function keyOf(epoch: AvailableEpoch): string {
  // Proof: commit-invalidation retained20 instead of21 after a same-revision edit; temp-invalidation retained20 instead of200 after a readonly TEMP shadow (V114).
  return JSON.stringify([epoch.version, epoch.schema, epoch.tempSchema, epoch.changes]);
}

function removeEntry(entries: Map<string, RetainedRows>, address: string): void {
  // eslint-disable-next-line drizzle/enforce-delete-with-where -- entries is a typed in-memory Map; this boundary cannot issue SQL.
  entries.delete(address);
}

function fingerprintOf(value: unknown): string {
  return new Bun.CryptoHasher('sha256').update(serialize(value)).digest('hex');
}
