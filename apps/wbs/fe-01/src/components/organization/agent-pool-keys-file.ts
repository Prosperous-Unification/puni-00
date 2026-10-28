import { type ClientReply, type createAgentPool } from '@wbs/contracts';

/** The `wbs-agent-pool-keys` v1 document a create or re-key answers once. */
export type AgentPoolKeys = Extract<
  ClientReply<typeof createAgentPool>,
  { kind: 'success' }
>['body'];

/**
 * A pool's keys as one file the page can save, and save again, until the
 * admin is done with it: the blob and the object URL that names it. It holds
 * the document's bytes only, never the parsed document or its text.
 */
export interface AgentPoolKeysFile {
  readonly fileName: string;
  readonly blob: Blob;
  readonly url: string;
}

/** The file a pool's keys are saved as (`wbs-mcp-agent-surface` M7). */
export function keysFileNameOf(poolId: string): string {
  return `pool-${poolId}.keys.json`;
}

/**
 * Turns `keys` into {@link AgentPoolKeysFile}. The caller drops the reply
 * right after, so the blob is the only copy the page holds; it must hand the
 * file to {@link closeAgentPoolKeysFile} when the admin is done or the panel
 * goes away.
 */
export function openAgentPoolKeysFile(keys: AgentPoolKeys): AgentPoolKeysFile {
  const blob = new Blob([`${JSON.stringify(keys, null, 2)}\n`], {
    type: 'application/json;charset=utf-8',
  });
  return { fileName: keysFileNameOf(keys.poolId), blob, url: URL.createObjectURL(blob) };
}

/**
 * Saves `file` through an anchor click, the only way a page saves a file it
 * holds. The anchor is attached for the click, which some browsers require,
 * and removed after. The URL is not revoked here: a browser may still be
 * reading it, and a save that did not happen (a cancelled dialog, a blocked
 * automatic download) is answered by saving again.
 */
export function saveAgentPoolKeysFile(file: AgentPoolKeysFile): void {
  const anchor = document.createElement('a');
  anchor.href = file.url;
  anchor.download = file.fileName;
  anchor.hidden = true;
  // Proof: 2026-10-28, clicking a detached anchor failed `creates a pool,
  // downloads its keys exactly once…` (attached: [false]).
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
  }
}

/** Releases `file`: its object URL is revoked, and the blob goes with the last reference. */
export function closeAgentPoolKeysFile(file: AgentPoolKeysFile): void {
  URL.revokeObjectURL(file.url);
}
