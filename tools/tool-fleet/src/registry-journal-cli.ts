import { statfs } from 'node:fs/promises';

import { executeRegistryCommand } from './registry-journal';

/** Read at most 64 KiB from the authenticated SSH command's stdin before parsing any request. */
async function readRequest(): Promise<unknown> {
  const reader = Bun.stdin.stream().getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      // Proof: oversized stdin command negative fails if this streaming bound is removed.
      if (bytes > 64 * 1024) throw new Error('Registry request exceeds read bound');
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/**
 * Measure the WHOLE filesystem containing `path`, not one file or directory: allocated blocks
 * include staging and every unrelated occupant, and blocks reserved from this UID do not count as
 * usable capacity. Filesystems reporting zero inodes fail the positive-inode schema validation.
 */
async function measureFilesystem(path: string) {
  const status = await statfs(path);
  return {
    allocationUnitBytes: status.bsize,
    usableBytes: (status.blocks - (status.bfree - status.bavail)) * status.bsize,
    usedBytes: (status.blocks - status.bfree) * status.bsize,
    totalInodes: status.files,
    usedInodes: status.files - status.ffree,
  };
}

/**
 * Owner-only host CLI, invoked over authenticated SSH with one journal directory argument and
 * JSON stdin. Paths and limits come from explicit trusted enrollment, never capacity claims in
 * ordinary requests. statfs measures real filesystems; verified mount identity is added by the
 * future storage adapter; this foundation does not verify mount isolation. No command starts an upload, deletes content or changes a live service.
 * Journal, registry and root measurements each cover the whole filesystem containing their path,
 * so `journalMaximumBytes` caps that whole filesystem's usage. The 1 GiB default requires a
 * dedicated bounded journal filesystem or a future independently verified quota adapter; enrolling
 * a shared filesystem's full size is only a smoke-test configuration, never isolation proof.
 */
async function main(): Promise<void> {
  const directory = process.argv.at(2);
  // Proof: --locked CLI negative fails if unknown arguments can bypass this boundary.
  if (directory === undefined || process.argv.length !== 3)
    throw new Error('Usage: registry-journal-cli.ts <owner-only-journal-directory>');
  const request = await readRequest();
  const response = await executeRegistryCommand(directory, request, {
    measureJournal: () => measureFilesystem(directory),
    measureRegistry: async (enrollment) => {
      const [registry, root] = await Promise.all([
        measureFilesystem(enrollment.registryPath),
        statfs(enrollment.rootPath),
      ]);
      return {
        usableBytes: registry.usableBytes,
        usedBytes: registry.usedBytes,
        totalInodes: registry.totalInodes,
        usedInodes: registry.usedInodes,
        maximumBytes: enrollment.maximumBytes,
        rootFreeBytes: root.bavail * root.bsize,
      };
    },
  });
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

if (import.meta.main) {
  try {
    await main();
  } catch (cause) {
    console.error(cause);
    process.exitCode = 1;
  }
}
