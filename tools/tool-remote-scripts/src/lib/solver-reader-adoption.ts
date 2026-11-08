import { createHash } from 'node:crypto';
import type { BigIntStats } from 'node:fs';
import { closeSync, constants, fstatSync, fsyncSync } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { hostname, userInfo } from 'node:os';
import { dirname, join } from 'node:path';

import { openDirectoryFile } from './directory-file';
import { assertNoEdgeOwner } from './edge-admission';
import { initializeOrdinaryEdgePolicy } from './edge-policy';
import { withExistingCanonicalLock } from './lock';
import { readClosed, readInteger, readString } from './managed-cohort';
import {
  assertOrigin,
  captureSolverReaderArtifact,
  readPrivateReceipt,
  type SolverReaderArtifact,
  type SolverReaderArtifactObservation,
  type SolverReaderLayout,
} from './solver-reader-preparation';
import {
  captureTransitionDirectory,
  decodeSolverReaderTransition,
  publishSolverReader,
  retainOriginalTransitionReader,
  runTransitionChild,
  sameTransitionIdentity,
  type SolverReaderTransition,
  type SolverReaderTransitionConstruction,
  writeTransitionBytes,
} from './solver-reader-transition';

/** Closed selected parent roles; production paths remain fixed by the installer. */
export const ADOPTION_PARENTS = [
  'home',
  'cache',
  'local',
  'lib',
  'readerParent',
  'configParent',
  'unitParent',
  'state',
  'privateSolverCache',
] as const;
type AdoptionParent = (typeof ADOPTION_PARENTS)[number];
/** Original selected directory identity; account ownership is independently mandatory. */
export interface ParentSelection {
  readonly device: string;
  readonly inode: string;
  readonly mode: number;
}
/** Administrative scope selected independently; never a reusable admission credential. */
export interface SolverReaderAdoption extends SolverReaderTransition {
  readonly format: 'legacy-reader-adoption-selection';
  readonly version: 1;
  readonly attemptId: string;
  readonly parents: Readonly<Record<AdoptionParent, ParentSelection>>;
  readonly config: Omit<SolverReaderArtifact, 'path'>;
  readonly unit: Omit<SolverReaderArtifact, 'path'>;
}
/** Fixed production destinations; isolated test layouts are unavailable from CLI selection. */
export interface SolverReaderAdoptionLayout extends SolverReaderLayout {
  readonly config: string;
  readonly unit: string;
  readonly parents: Readonly<Record<AdoptionParent, string>>;
}

/** Decodes the entire closed administrative selection once and reconstructs nested identities. */
export function decodeSolverReaderAdoption(value: unknown): SolverReaderAdoption {
  const fields = readClosed(value, [
    'format',
    'version',
    'attemptId',
    'target',
    'oldBun',
    'oldReader',
    'reader',
    'parents',
    'config',
    'unit',
  ]);
  const attemptId = readString(fields['attemptId']);
  if (
    fields['format'] !== 'legacy-reader-adoption-selection' ||
    fields['version'] !== 1 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(attemptId)
  )
    // Proof: selection-identity fault made solver-reader-adoption.test.ts `boundary identity` fail (1); restored passed (0). Boundary classification only; downstream refusal remains.
    throw new Error('invalid legacy adoption selection identity');
  const transition = decodeSolverReaderTransition({
    target: fields['target'],
    oldBun: fields['oldBun'],
    oldReader: fields['oldReader'],
    reader: fields['reader'],
  });
  const selected = readClosed(fields['parents'], [...ADOPTION_PARENTS]);
  const parent = (name: AdoptionParent): ParentSelection => {
    const identity = readClosed(selected[name], ['device', 'inode', 'mode']);
    const device = readString(identity['device']);
    const inode = readString(identity['inode']);
    const mode = readInteger(identity['mode']);
    if (
      !/^[0-9]+$/.test(device) ||
      !/^[1-9][0-9]*$/.test(inode) ||
      mode < 0 ||
      mode > 0o777 ||
      (mode & 0o002) !== 0 ||
      (mode & 0o700) !== 0o700
    )
      // Proof: safe-parent fault made solver-reader-adoption.test.ts `boundary unsafe-parent` fail (1); restored passed (0). Boundary classification only; downstream refusal remains.
      throw new Error('unsafe selected adoption parent');
    return { device, inode, mode };
  };
  const pin = (input: unknown) => {
    const selected = readClosed(input, ['sha256', 'byteLength']);
    return decodeSolverReaderTransition({ ...transition, oldReader: selected }).oldReader;
  };
  return {
    ...transition,
    format: 'legacy-reader-adoption-selection',
    version: 1,
    attemptId,
    parents: {
      home: parent('home'),
      cache: parent('cache'),
      local: parent('local'),
      lib: parent('lib'),
      readerParent: parent('readerParent'),
      configParent: parent('configParent'),
      unitParent: parent('unitParent'),
      state: parent('state'),
      privateSolverCache: parent('privateSolverCache'),
    },
    config: pin(fields['config']),
    unit: pin(fields['unit']),
  };
}

/** Only a genuine absent path qualifies; permission, alias and malformed-state failures propagate. */
async function requireAbsent(path: string): Promise<void> {
  try {
    await lstat(path);
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return;
    throw cause;
  }
  // Proof: genuine-absence fault made solver-reader-adoption.test.ts `refuses policy before|refuses lock before` fail (1); restored passed (0). Boundary classification only; downstream refusal remains.
  throw new Error(`legacy adoption requires absent path: ${path}`);
}

/** Retains exact private evidence under the already selected staging directory. */
async function retainAdoptionObservation(
  name: string,
  value: unknown,
  staging: string,
  original: BigIntStats,
  afterWrite?: () => Promise<void>,
): Promise<SolverReaderArtifactObservation> {
  const directory = await open(
    staging,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    const verify = async () => {
      if (
        !sameTransitionIdentity(original, await directory.stat({ bigint: true })) ||
        !sameTransitionIdentity(original, await lstat(staging, { bigint: true }))
      )
        // Proof: private-observation-parent fault made solver-reader-adoption.test.ts `exact custody refuses terminal-parent-rebound` fail (1); restored passed (0). Boundary classification only; downstream refusal remains.
        throw new Error('legacy adoption observation parent changed');
    };
    await verify();
    const descriptor = openDirectoryFile(
      directory.fd,
      name,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    );
    const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
    let created: BigIntStats;
    try {
      created = fstatSync(descriptor, { bigint: true });
      writeTransitionBytes(descriptor, bytes);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    await afterWrite?.();
    const observation = await captureSolverReaderArtifact(join(staging, name));
    if (
      observation.device !== String(created.dev) ||
      observation.inode !== String(created.ino) ||
      observation.mode !== 0o600 ||
      observation.uid !== String(original.uid) ||
      observation.gid !== String(original.gid) ||
      observation.artifact.byteLength !== bytes.length ||
      observation.artifact.sha256 !== createHash('sha256').update(bytes).digest('hex')
    )
      // Proof: private-observation-readback fault made solver-reader-adoption.test.ts `exact custody refuses terminal-inode` fail (1); restored passed (0).
      throw new Error('legacy adoption observation readback differs');
    await verify();
    await directory.sync();
    await verify();
    return observation;
  } finally {
    await directory.close();
  }
}

/** Exact attempt-created staging identity transported only by the observed execution coordinator. */
export function decodeAdoptionStagingIdentity(
  value: unknown,
): ParentSelection & { readonly uid: string; readonly gid: string } {
  const fields = readClosed(value, ['device', 'inode', 'mode', 'uid', 'gid']);
  const device = readString(fields['device']);
  const inode = readString(fields['inode']);
  const uid = readString(fields['uid']);
  const gid = readString(fields['gid']);
  if (
    !/^[0-9]+$/.test(device) ||
    !/^[1-9][0-9]*$/.test(inode) ||
    !/^[0-9]+$/.test(uid) ||
    !/^[0-9]+$/.test(gid) ||
    fields['mode'] !== 0o700
  )
    // Proof: created-staging-shape fault made solver-reader-adoption.test.ts `boundary created-staging-shape` fail (1); restored passed (0). Boundary classification only; downstream refusal remains.
    throw new Error('invalid created adoption staging identity');
  return { device, inode, uid, gid, mode: 0o700 };
}

/** Adopts one exact pre-policy tuple; partial publication retains evidence and never retries or inverses. */
export async function adoptLegacySolverReader(
  input: unknown,
  selectionDigest: string,
  layout: SolverReaderAdoptionLayout,
  construction: SolverReaderTransitionConstruction & {
    readonly staging: ParentSelection & { readonly uid: string; readonly gid: string };
  },
): Promise<void> {
  const selection = decodeSolverReaderAdoption(input);
  // Proof: selection-digest fault made solver-reader-adoption.test.ts `boundary selection-digest` fail (1); restored passed (0).
  if (!/^[0-9a-f]{64}$/.test(selectionDigest)) throw new Error('invalid adoption selection digest');
  const account = userInfo();
  if (
    hostname() !== selection.target.hostname ||
    account.username !== selection.target.account.name ||
    account.uid !== selection.target.account.uid ||
    account.gid !== selection.target.account.gid
  )
    // Proof: target fault made solver-reader-adoption.test.ts `refuses target before` fail (1); restored passed (0).
    throw new Error('legacy adoption target/account differs');
  if (
    selection.reader.path !== join(layout.staging, 'reader') ||
    dirname(layout.staging) !== layout.parents.privateSolverCache ||
    dirname(layout.reader) !== layout.parents.readerParent ||
    dirname(layout.bun) !== layout.parents.readerParent ||
    dirname(layout.config) !== layout.parents.configParent ||
    dirname(layout.unit) !== layout.parents.unitParent ||
    layout.state !== layout.parents.state
  )
    // Proof: fixed-layout fault made solver-reader-adoption.test.ts `boundary fixed-layout` fail (1); restored passed (0). Boundary classification only; downstream refusal remains.
    throw new Error('legacy adoption fixed layout differs');
  const clock = construction.clock ?? { now: () => performance.now() };
  const deadline = clock.now() + 180000;
  const checkpoint = () => {
    // Proof: deadline fault made solver-reader-adoption.test.ts `boundary deadline` fail (1); restored passed (0). Boundary classification only; downstream refusal remains.
    if (clock.now() >= deadline) throw new Error('legacy adoption deadline expired');
  };
  const assertParents = async () => {
    checkpoint();
    for (const name of ADOPTION_PARENTS) {
      const path = layout.parents[name];
      const selected = selection.parents[name];
      const observed = await captureTransitionDirectory(
        path,
        account.uid,
        name === 'privateSolverCache',
      );
      if (
        String(observed.dev) !== selected.device ||
        String(observed.ino) !== selected.inode ||
        Number(observed.mode & 0o7777n) !== selected.mode ||
        observed.gid !== BigInt(account.gid)
      )
        // Proof: selected-parents fault made solver-reader-adoption.test.ts `refuses parent before` fail (1); restored passed (0).
        throw new Error(`legacy adoption selected parent changed: ${name}`);
    }
  };
  await assertParents();
  const selectedState = await open(
    layout.state,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    const originalParent = await selectedState.stat({ bigint: true });
    const statePin = selection.parents.state;
    if (
      String(originalParent.dev) !== statePin.device ||
      String(originalParent.ino) !== statePin.inode ||
      Number(originalParent.mode & 0o7777n) !== statePin.mode ||
      originalParent.uid !== BigInt(account.uid) ||
      originalParent.gid !== BigInt(account.gid)
    ) {
      // Proof: original-selected-parent fault made solver-reader-adoption.test.ts `selected parent replacement during original open` fail (1); restored passed (0). Boundary classification only; downstream refusal remains.
      throw new Error('legacy adoption original selected state changed');
    }
    const openingStaging = await captureTransitionDirectory(layout.staging, account.uid, true);
    const expectedStaging = decodeAdoptionStagingIdentity(construction.staging);
    if (
      String(openingStaging.dev) !== expectedStaging.device ||
      String(openingStaging.ino) !== expectedStaging.inode ||
      String(openingStaging.uid) !== expectedStaging.uid ||
      String(openingStaging.gid) !== expectedStaging.gid ||
      Number(openingStaging.mode & 0o7777n) !== expectedStaging.mode
    )
      // Proof: created-staging fault made solver-reader-adoption.test.ts `exact custody refuses created-staging` fail (1); restored passed (0).
      throw new Error('legacy adoption created staging changed');
    const capture = async (artifact: SolverReaderArtifact, installed: boolean) => {
      const observed = await captureSolverReaderArtifact(artifact.path);
      const mode =
        artifact.path === layout.config
          ? 0o600
          : artifact.path === layout.unit
            ? 0o644
            : installed
              ? 0o755
              : observed.mode;
      if (
        observed.artifact.sha256 !== artifact.sha256 ||
        observed.artifact.byteLength !== artifact.byteLength ||
        observed.mode !== mode ||
        observed.uid !== String(account.uid) ||
        observed.gid !== String(account.gid) ||
        (await realpath(artifact.path)) !== artifact.path
      )
        // Proof: artifact-pins fault made solver-reader-adoption.test.ts `refuses config-pin before` fail (1); restored passed (0).
        throw new Error(`legacy adoption selected artifact differs: ${artifact.path}`);
      return observed;
    };
    const oldBun = { path: layout.bun, ...selection.oldBun };
    const oldReader = { path: layout.reader, ...selection.oldReader };
    const openingBun = await capture(oldBun, true);
    const openingReader = await capture(oldReader, true);
    const otherOriginals = await Promise.all(
      [
        { path: layout.config, ...selection.config },
        { path: layout.unit, ...selection.unit },
      ].map(async (artifact) => ({ artifact, opening: await capture(artifact, true) })),
    );
    const originals = [
      { artifact: oldBun, opening: openingBun },
      { artifact: oldReader, opening: openingReader },
      ...otherOriginals,
    ];
    const opening = originals.map((original) => original.opening);
    const openingCandidate = await capture(selection.reader, false);
    const assertObservation = async (
      artifact: SolverReaderArtifact,
      original: SolverReaderArtifactObservation,
      installed: boolean,
    ) => {
      if (JSON.stringify(await capture(artifact, installed)) !== JSON.stringify(original))
        // Proof: original-artifact fault made solver-reader-adoption.test.ts `exact custody refuses original-reader-inode` fail (1); restored passed (0).
        throw new Error(`legacy adoption original artifact changed: ${artifact.path}`);
    };
    const assertOriginals = async (published: boolean) => {
      await assertParents();
      if (
        !sameTransitionIdentity(
          openingStaging,
          await captureTransitionDirectory(layout.staging, account.uid, true),
        )
      )
        throw new Error('legacy adoption staging replaced');
      for (const original of originals) {
        if (published && original.artifact.path === layout.reader) continue;
        await assertObservation(original.artifact, original.opening, true);
      }
      await assertObservation(selection.reader, openingCandidate, false);
    };
    await requireAbsent(join(layout.state, 'edge-policy.json'));
    await assertNoEdgeOwner(layout.state);
    await requireAbsent(join(layout.state, 'edge.lock'));
    const retainedReader = await retainOriginalTransitionReader(
      oldReader,
      openingReader,
      openingBun,
      layout.staging,
      openingStaging,
      checkpoint,
    );
    const evidence = [...retainedReader];
    evidence.push(
      await retainAdoptionObservation(
        'opening.json',
        {
          format: 'legacy-reader-adoption-opening',
          version: 1,
          attemptId: selection.attemptId,
          selectionDigest,
          originals: opening,
          parents: selection.parents,
          staging: {
            device: String(openingStaging.dev),
            inode: String(openingStaging.ino),
            mode: Number(openingStaging.mode & 0o7777n),
          },
        },
        layout.staging,
        openingStaging,
      ),
    );
    const assertEvidence = async () => {
      for (const original of evidence)
        if (
          JSON.stringify(await captureSolverReaderArtifact(original.artifact.path)) !==
          JSON.stringify(original)
        )
          // Proof: retained-evidence fault made solver-reader-adoption.test.ts `exact custody refuses original-evidence` fail (1); restored passed (0).
          throw new Error('legacy adoption original evidence changed');
    };
    await assertOriginals(false);
    await construction.observe?.('before-lock');
    if (!sameTransitionIdentity(originalParent, await lstat(layout.state, { bigint: true })))
      // Proof: selected-parent-before-create fault made solver-reader-adoption.test.ts `exact custody refuses parent-before-lock` fail (1); restored passed (0).
      throw new Error('legacy adoption selected parent changed before lock creation');
    const created = openDirectoryFile(
      selectedState.fd,
      'edge.lock',
      constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    );
    let lock: BigIntStats;
    try {
      lock = fstatSync(created, { bigint: true });
      if (
        !lock.isFile() ||
        (lock.mode & 0o7777n) !== 0o600n ||
        lock.uid !== BigInt(account.uid) ||
        lock.gid !== BigInt(account.gid) ||
        lock.size !== 0n
      )
        // Proof: created-lock-mode fault made solver-reader-adoption.test.ts `created lock unsafe mode` fail (1); restored passed (0). Boundary classification only; downstream refusal remains.
        throw new Error('legacy adoption created lock metadata differs');
      fsyncSync(created);
      await selectedState.sync();
    } finally {
      closeSync(created);
    }
    const parent = originalParent;
    await construction.observe?.('created-lock');
    const receiptPath = join(layout.staging, 'origin.json');
    await initializeOrdinaryEdgePolicy(
      layout.state,
      { attemptId: selection.attemptId, receiptPath },
      { parent, lock },
    );
    await construction.observe?.('initialized');
    const origin = { state: layout.state, receiptPath, attemptId: selection.attemptId };
    const receipt = await readPrivateReceipt(origin);
    const receiptObservation = await captureSolverReaderArtifact(receiptPath);
    await withExistingCanonicalLock(join(layout.state, 'edge.lock'), async (descriptor) => {
      if (
        !sameTransitionIdentity(lock, fstatSync(descriptor, { bigint: true })) ||
        receipt.lock.device !== String(lock.dev) ||
        receipt.lock.inode !== String(lock.ino) ||
        receipt.parent.device !== String(parent.dev) ||
        receipt.parent.inode !== String(parent.ino)
      )
        // Proof: created-lock-binding fault made solver-reader-adoption.test.ts `exact custody refuses rebound-lock-receipt` fail (1); restored passed (0).
        throw new Error('legacy adoption created namespace differs from origin');
      const recheck = async (published: boolean) => {
        await assertOriginals(published);
        await assertEvidence();
        // Proof: original-policy fault made solver-reader-adoption.test.ts `exact custody refuses policy-inode` fail (1); restored passed (0).
        await assertOrigin(receipt, descriptor);
        if (
          JSON.stringify(await captureSolverReaderArtifact(receiptPath)) !==
          JSON.stringify(receiptObservation)
        )
          // Proof: receipt-continuity fault made solver-reader-adoption.test.ts `exact custody refuses receipt-inode-late` fail (1); restored passed (0).
          throw new Error('legacy adoption original receipt changed');
      };
      await recheck(false);
      for (const mode of ['legacy', 'required']) {
        await runTransitionChild(
          [layout.bun, selection.reader.path, `--check-controller-admission-inherited=${mode}`],
          layout.state,
          descriptor,
          deadline,
          construction,
        );
        await construction.observe?.(`staged-${mode}`);
        await recheck(false);
      }
      const installed = await publishSolverReader({
        selection,
        layout,
        construction,
        capture,
        assertObservation,
        recheckOriginals: () => recheck(false),
      });
      for (const mode of ['legacy', 'required']) {
        await runTransitionChild(
          [layout.bun, layout.reader, `--check-controller-admission-inherited=${mode}`],
          layout.state,
          descriptor,
          deadline,
          construction,
        );
        await construction.observe?.(`installed-${mode}`);
        await recheck(true);
        await assertObservation({ ...selection.reader, path: layout.reader }, installed, true);
      }
      await retainAdoptionObservation(
        'complete.json',
        {
          format: 'legacy-reader-adoption-complete',
          staging: expectedStaging,
          version: 1,
          selectionDigest,
          attemptId: selection.attemptId,
          installed,
          receipt: receiptObservation,
        },
        layout.staging,
        openingStaging,
        () => construction.observe?.('terminal-written') ?? Promise.resolve(),
      );
      await recheck(true);
      await assertObservation({ ...selection.reader, path: layout.reader }, installed, true);
    });
  } finally {
    await selectedState.close();
  }
}
