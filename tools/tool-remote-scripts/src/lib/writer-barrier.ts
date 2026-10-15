import { open, readFile, stat, unlink } from 'node:fs/promises';

import type { BackendSnapshot } from './backend-maintenance';
import { writeNewMigrationCapture } from './migration-capture-file';
import type { Color } from './state';

/** Immutable outgoing image bound to the exact container observed before writer stop. */
export interface WriterImage {
  containerId: string;
  image: string;
  imageId: string;
}

/** Durable recovery identity, captured before the outgoing writer is stopped. */
export interface WriterIntent {
  candidate: string;
  sha: string;
  from: Color | null;
  to: Color;
  outgoingId: string | null;
  /** Null denotes a proven first installation with no outgoing writer. */
  rollback: WriterImage | null;
  databaseHostPath?: string;
  idleId?: string | null;
  snapshots?: { imageId: string; application: BackendSnapshot; maintenance: BackendSnapshot };
  maintenance?: {
    identity: string;
    imageId: string;
    application: BackendSnapshot;
    maintenance: BackendSnapshot;
  };
  capture?: { path: string; sha256: string; databasePath: string; target: string; attempt: string };
}

const boundaries = ['stop', 'exposure', 'migration', 'maintenance'] as const;
function markerPath(
  root: string,
  boundary: 'stop' | 'exposure' | 'migration' | 'maintenance',
): string {
  return `${root}/be-writer-${boundary}.json`;
}

/** Any retained boundary requires attended recovery, including malformed bytes. */
export async function assertNoWriterBarrier(root: string): Promise<void> {
  // Proof: omitting the directory check admitted an absent trusted state root;
  // `an absent trusted state directory cannot mean no interrupted transition` failed.
  if (!(await stat(root)).isDirectory()) throw new Error('writer state root is not a directory');
  for (const boundary of boundaries) {
    const path = markerPath(root, boundary);
    try {
      await readFile(path);
    } catch (cause) {
      // Only an absent marker is a clean transition; unreadable trusted state refuses.
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') continue;
      throw new Error(`cannot inspect writer barrier ${path}; explicit recovery required`, {
        cause,
      });
    }
    // Proof: removing this refusal admitted the malformed exposure marker in
    // `a malformed or unreadable marker never admits an ordinary retry`.
    throw new Error(`retained writer barrier ${path}; explicit recovery required`);
  }
}

/** Exclusively publishes and syncs intent before either destructive or exposing IO. */
export async function writeWriterBarrier(
  root: string,
  boundary: 'stop' | 'exposure' | 'migration' | 'maintenance',
  intent: WriterIntent,
): Promise<void> {
  await writeNewMigrationCapture(markerPath(root, boundary), `${JSON.stringify(intent)}\n`);
}

/** Called only after the recorded candidate commit; directory sync makes removal durable. */
export async function clearWriterBarrier(
  root: string,
  hasMigration = false,
  hasMaintenance = false,
): Promise<void> {
  for (const boundary of boundaries) {
    if (boundary === 'migration' && !hasMigration) continue;
    if (boundary === 'maintenance' && !hasMaintenance) continue;
    await unlink(markerPath(root, boundary));
  }
  const directory = await open(root, 'r');
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}
