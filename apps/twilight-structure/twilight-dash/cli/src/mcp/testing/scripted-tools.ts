import type { ToolAnswer, WbsTools } from '../wbs-tools';

/** One tool call a {@link scriptedTools} fake received. */
export interface ToolCall {
  readonly name: string;
  readonly input: Readonly<Record<string, unknown>>;
}

/**
 * A fake WBS behind mcp-01: records every call and answers with `answer`, whose rejection is the
 * call's. `closed` counts {@link WbsTools.close} calls.
 */
export function scriptedTools(
  answer: (call: ToolCall, index: number) => ToolAnswer | Promise<ToolAnswer>,
): WbsTools & { readonly calls: ToolCall[]; readonly closed: () => number } {
  const calls: ToolCall[] = [];
  let closed = 0;
  return {
    calls,
    closed: () => closed,
    call: async (name, input) => {
      const call = { name, input: structuredClone(input) };
      calls.push(call);
      return answer(call, calls.length - 1);
    },
    close: () => {
      closed += 1;
      return Promise.resolve();
    },
  };
}
