import { Buffer } from 'node:buffer';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

import { isFilesystemFailure } from './filesystem-failure';
import { LintActivationRefusal } from './lint-activation';
import type { BunToolkit } from './policy/toolkit';
import { anchorPath } from './validator-paths';

export interface PushAuditContext {
  readonly activationRoot: string | undefined;
  readonly callerDirectory: string;
  readonly candidateRoot: string;
  readonly toolkit: Pick<BunToolkit, 'tag' | 'digest'>;
}

function isWithin(root: string, path: string): boolean {
  const offset = relative(root, path);
  return (
    offset === '' || (offset !== '..' && !offset.startsWith('..' + sep) && !isAbsolute(offset))
  );
}

/**
 * Distinguish wholly absent audit configuration from configured required authority. The exact
 * one-LF release record belongs to the configured archive root, beside selected.json, and joins
 * its operator-owned compatibility assertion to an already verified installed current toolkit.
 * Full activation/closure validation still belongs to the selected lint launcher. Stable trusted
 * archive metadata is a premise; these filesystem reads do not claim hostile-writer atomicity.
 * @throws LintActivationRefusal for configured path, physical placement or complete-record failures.
 * Unexpected implementation failures retain their original identity.
 */
export function readPushAudit(context: PushAuditContext): 'inactive' | 'configured' {
  const configured = context.activationRoot;
  if (configured === undefined || configured === '') return 'inactive';
  try {
    const root = realpathSync.native(anchorPath(configured, context.callerDirectory));
    const release = realpathSync.native(join(root, 'toolkit-release'));
    // Proof: removing only archive containment made
    // `refuses a release symlink outside archive before role execution`
    // receive 0 instead of 78; candidate exclusion remained.
    // Proof: removing only candidate exclusion made
    // `refuses a candidate release even when the configured archive contains that candidate`
    // receive 0 instead of 78; archive containment remained.
    if (!isWithin(root, release) || isWithin(context.candidateRoot, release))
      throw new LintActivationRefusal('push audit toolkit release escapes its archive authority');
    // Proof: removing regular-file refusal made
    // `refuses a FIFO release before its owned valid-record feeder can supply bytes`
    // receive 0 instead of 78 after actual feeder readiness/PID prerequisites.
    if (!statSync(release).isFile())
      throw new LintActivationRefusal('push audit toolkit release is not a regular file');
    const expected = Buffer.from(context.toolkit.tag + ' ' + context.toolkit.digest + '\n');
    // Proof: omitting this complete-record comparison made
    // `refuses the whole release record with wrong digest before role execution`
    // receive 0 instead of 78; no separate tag/LF/UTF-8 proof is claimed.
    if (!readFileSync(release).equals(expected))
      throw new LintActivationRefusal(
        'push audit toolkit release differs from the installed toolkit',
      );
    return 'configured';
  } catch (cause) {
    if (cause instanceof LintActivationRefusal) throw cause;
    // Proof: omitting filesystem conversion made
    // `refuses a nonempty missing root instead of returning optional inactivity`
    // throw actual ENOENT instead of modeled 78; unreadability is separate.
    if (isFilesystemFailure(cause))
      throw new LintActivationRefusal('cannot read configured push audit authority', { cause });
    throw cause;
  }
}
