import { dirname, join } from 'node:path';

import {
  createWritePermit,
  measureFilesystem,
  measureVerifiedFilesystem,
  registryRenewalSeconds,
  requireFreshCapacity,
} from './registry-capacity';
import type { RegistryEnrollment } from './registry-journal';
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
 * Owner-only host CLI, invoked over authenticated SSH with one journal directory argument and
 * JSON stdin. Paths and limits come from explicit trusted enrollment, never capacity claims in
 * ordinary requests. statfs measures real filesystems; verified mount identity is added by the
 * storage adapter. No command starts an upload, deletes content or changes a live service.
 */
async function main(): Promise<void> {
  const directory = process.argv.at(2);
  // Proof: --locked CLI negative fails if unknown arguments can bypass this boundary.
  const monitor = process.argv.at(3) === '--monitor';
  if (
    directory === undefined ||
    (process.argv.length !== 3 && !(monitor && process.argv.length === 4))
  )
    throw new Error('Usage: registry-journal-cli.ts <owner-only-journal-directory>');
  const request = monitor ? { command: 'check-capacity' } : await readRequest();
  const identities = join(dirname(directory), 'identities');
  const registryPath = join(dirname(dirname(directory)), 'registry', 'contents');
  const measureRegistry = async (enrollment: RegistryEnrollment) => {
    if (enrollment.registryPath !== registryPath || enrollment.rootPath !== '/')
      throw new Error('Enrollment paths differ from fixed authority layout');
    const measuredAt = Date.now();
    const [registry, root] = await Promise.all([
      measureVerifiedFilesystem(registryPath, join(identities, 'registry.receipt')),
      measureFilesystem('/'),
    ]);
    if (
      enrollment.storageId !== registry.identity ||
      enrollment.maximumBytes !== registry.maximumBytes
    )
      throw new Error('Registry enrollment identity or capacity differs from verified storage');
    return requireFreshCapacity(
      {
        measuredAt,
        capacity: {
          maximumBytes: enrollment.maximumBytes,
          usableBytes: registry.usableBytes,
          usedBytes: registry.usedBytes,
          totalInodes: registry.totalInodes,
          usedInodes: registry.usedInodes,
          rootFreeBytes: root.availableBytes,
        },
      },
      Date.now(),
    );
  };
  let current: RegistryEnrollment | undefined;
  const permit = createWritePermit(
    directory,
    async () => {
      if (current === undefined) throw new Error('Missing measured enrollment');
      return measureRegistry(current);
    },
    registryPath,
  );
  do {
    const response = await executeRegistryCommand(directory, request, {
      permit,
      measureJournal: async (enrollment) => {
        current = enrollment;
        const measured = await measureVerifiedFilesystem(
          directory,
          join(identities, 'journal.receipt'),
        );
        if (enrollment.journalMaximumBytes !== measured.maximumBytes)
          throw new Error('Journal enrollment capacity differs from verified storage');
        return {
          usableBytes: measured.usableBytes,
          allocationUnitBytes: measured.allocationUnitBytes,
          usedBytes: measured.usedBytes,
          totalInodes: measured.totalInodes,
          usedInodes: measured.usedInodes,
        };
      },
      measureRegistry: async (enrollment) => {
        current = enrollment;
        return measureRegistry(enrollment);
      },
    });
    process.stdout.write(
      `${JSON.stringify(monitor ? { revision: response.state.revision, fenced: response.state.fenced, reason: response.state.fenceReason } : response)}\n`,
    );
    if (monitor) await Bun.sleep(registryRenewalSeconds * 1000);
  } while (monitor);
}

if (import.meta.main) {
  try {
    await main();
  } catch (cause) {
    console.error(cause);
    process.exitCode = 1;
  }
}
