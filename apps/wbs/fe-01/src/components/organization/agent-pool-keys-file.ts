import { type ClientReply, type createAgentPool } from '@wbs/contracts';

/** The `wbs-agent-pool-keys` v1 document a create or re-key answers once. */
export type AgentPoolKeys = Extract<
  ClientReply<typeof createAgentPool>,
  { kind: 'success' }
>['body'];

/** The file a pool's keys are saved as (`wbs-mcp-agent-surface` M7). */
export function keysFileNameOf(poolId: string): string {
  return `pool-${poolId}.keys.json`;
}

/**
 * Saves `keys` as {@link keysFileNameOf} through a blob and an anchor click,
 * the only way a page saves a file it holds. Nothing keeps the document: the
 * object URL is revoked right after the click (the download already holds the
 * blob), and the caller drops its reply. The keys are never logged, rendered,
 * cached or written to browser storage.
 *
 * @returns The file name, for the panel to say what was saved.
 */
export function downloadAgentPoolKeys(keys: AgentPoolKeys): string {
  const fileName = keysFileNameOf(keys.poolId);
  const file = new Blob([`${JSON.stringify(keys, null, 2)}\n`], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
  return fileName;
}
