import { appendFile, readFile } from 'node:fs/promises';

import { executeRegistryHostAction } from './registry-maintenance-actions';

/**
 * Isolated root fixture only. Inject missing/mismatched receipts into otherwise-valid held-session
 * collect dispatches. The native spawn observer forwards every argument/return unchanged; it
 * counts only the exact pinned Distribution GC launch, without substituting any child effect.
 */
export async function proveRegistryCollectionAdmission(
  input: Parameters<typeof executeRegistryHostAction>[0],
): Promise<string> {
  if (
    input.request.action !== 'collect' ||
    process.getuid?.() !== 0 ||
    (await readFile('/root/task8-fixture/collect-proof', 'utf8')) !== 'enabled'
  )
    throw new Error('Collection proof requires fixed owned root fixture');
  let starts = 0;
  const spawn = Bun.spawn;
  // Boundary: this fixture forwards the native overloaded call with Reflect.apply unchanged; no request can select argv/environment through this observer.
  const observed = ((...arguments_: unknown[]) => {
    const command = arguments_[0];
    // Proof: moving count before spawn falsely reports a child on synchronous failure in registry-collection-observation.test.ts (modeled ports).
    // Boundary: captured Bun.spawn guarantees the returned Subprocess; Reflect.apply erases its overload type. Stdio stays opaque.
    const child = Reflect.apply(spawn, Bun, arguments_) as ReturnType<typeof spawn>;
    if (
      Array.isArray(command) &&
      command[0] === input.installed.distribution.path &&
      command[1] === 'garbage-collect'
    ) {
      // Proof: removed PID validation loses the invalid-returned-child refusal in the same exact-fixture test.
      if (!Number.isSafeInteger(child.pid) || child.pid <= 0)
        throw new Error('Native GC child identity is invalid');
      starts++;
    }
    return child;
  }) as typeof Bun.spawn;
  Bun.spawn = observed;
  try {
    for (const fault of ['absent', 'snapshot'] as const) {
      const journal = structuredClone(input.journal);
      if (fault === 'absent') journal.retirements = [];
      else {
        const receipt = journal.retirements.find(
          (receipt) => receipt.operationId === input.request.operationId,
        );
        if (receipt === undefined)
          throw new Error('Missing real retirement receipt for injected mismatch');
        receipt.snapshotId = 'f'.repeat(64);
      }
      let refused = false;
      let failure: { cause: unknown } | undefined;
      try {
        await executeRegistryHostAction({ ...input, journal });
      } catch (cause) {
        if (
          cause instanceof Error &&
          cause.message === 'GC requires the exact durable retirement receipt'
        )
          refused = true;
        else failure = { cause };
      }
      // Proof: moving this receipt after assertion hides the missing-CALL child observation in the exact-fixture test; native dispatcher witness remains separate.
      await appendFile(
        '/root/task8-fixture/collection-proof.log',
        JSON.stringify({ fault, refused, gcStarted: starts !== 0 }) + '\n',
        { mode: 0o600 },
      );
      if (failure !== undefined) throw failure.cause;
      if (!refused || starts !== 0)
        throw new Error('Collection receipt admission failed before native GC launch');
    }
    const receipt = await executeRegistryHostAction(input);
    if (starts !== 1) throw new Error('Verified collection did not launch exactly one native GC');
    await appendFile(
      '/root/task8-fixture/collection-proof.log',
      JSON.stringify({ fault: 'none', refused: false, gcStarted: true }) + '\n',
      { mode: 0o600 },
    );
    return receipt;
  } finally {
    Bun.spawn = spawn;
  }
}
