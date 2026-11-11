import { findIncoherence, isReleaseCommand, UsageRefusal } from './cli-parser';
import type { Monotonic, WallClock } from './clock';
import type { Request } from './grammar-facade';
import type { FetchLike } from './mcp/machine-token';

export { monotonicClock, wallClock } from './clock';
export type { Request } from './grammar-facade';

/**
 * Ports composed by the executable. Lightweight token/pool operations use these network,
 * output and timing ports. Release children inherit native IO/environment; heavy commands
 * retain their existing native adapters. helperPrefix is the selected protected PUNI launch,
 * without a namespace, so generated pool helpers can append canonical dash/mcp/token.
 */
export interface Context {
  readonly clock: WallClock;
  readonly monotonic: Monotonic;
  readonly send: FetchLike;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly write: (text: string) => unknown;
  readonly helperPrefix: readonly string[];
}

/**
 * Execute one typed Dash request after shared coherence validation, without argv parsing.
 * Only the selected branch loads its handlers; MCP token does not load the heavy CLI graph.
 * Numeric status is returned after completion; executable global status remains caller-owned.
 * @throws UsageRefusal before operation IO for cross-option incoherence; operation failures
 * retain the provider's existing errors and native ownership behavior.
 */
export async function executeRequest(request: Request, context: Context): Promise<number> {
  // Proof: dash-facade-typed-no-argv; reparsing ambient argv failed `keeps the actual typed MCP path import-safe against the heavy command graph`; restoration passed.
  // Proof: dash-facade-light-import; eagerly importing cli failed the same actual MCP canary test; restoration passed.
  // Proof: dash-facade-release-coherence; skipping release coherence failed `refuses typed production dev-fast before opening even an absent release configuration`; restoration passed.
  // Proof: dash-facade-account-coherence; skipping account coherence failed `refuses typed account coherence before opening its input or composing heavy effects`; restoration passed.
  const refusal = findIncoherence(request);
  if (refusal !== undefined) throw new UsageRefusal(refusal);
  // Proof: dash-facade-release-selection; bypassing this branch failed `returns the actual release adapter status while retaining its inherited native IO contract`; restoration passed.
  if (isReleaseCommand(request)) {
    const { runOpsCommand } = await import('./ops/release');
    // Proof: dash-facade-release-status; replacing the returned adapter status with zero failed `returns the actual release adapter status while retaining its inherited native IO contract`; restoration passed.
    return await runOpsCommand(request, context.write);
  }
  if (request.command === 'mcp') {
    const { runMcpCommand } = await import('./mcp/token-command');
    // Proof: dash-facade-mcp-await; dropping await failed `executes typed MCP with its supplied ports and only the fresh header map`; restoration passed.
    await runMcpCommand(request, {
      // Proof: dash-facade-mcp-port; replacing this port with a rejecting transport failed the same actual typed MCP test; restoration passed.
      send: context.send,
      monotonic: context.monotonic,
      sleep: context.sleep,
      environment: context.environment,
      write: context.write,
    });
    return 0;
  }
  if (request.command === 'pool') {
    const { runPoolCommand, systemPoolFiles } = await import('./mcp/pool-import');
    // Proof: dash-facade-pool-await; dropping await failed `generates pool helpers through the selected protected PUNI prefix and canonical dash namespace` before its controlled network release; restoration passed.
    await runPoolCommand(request, {
      send: context.send,
      write: context.write,
      // Proof: dash-facade-pool-protected-prefix and dash-facade-pool-canonical-namespace; dropping startup protection or dash separately failed the actual generated pool-helper test; both restorations passed.
      helper: [...context.helperPrefix, 'dash'],
      sleep: context.sleep,
      files: systemPoolFiles,
    });
    return 0;
  }
  const { runDash, runFleetPlan } = await import('./cli');
  // Proof: dash-facade-heavy-status; normalizing the native status to zero failed `forwards actual heavy ops status without reparsing the typed command`; restoration passed.
  return await runDash(request, {
    clock: context.clock,
    monotonic: context.monotonic,
    planEnrollment: runFleetPlan,
    stdout: { write: context.write },
  });
}
