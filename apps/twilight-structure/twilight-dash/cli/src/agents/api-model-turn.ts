import {
  APICallError,
  type FinishReason,
  isStepCount,
  type LanguageModelUsage,
  type ModelMessage,
  NoOutputGeneratedError,
  type TextStreamPart,
  ToolLoopAgent,
  type ToolSet,
  toUIMessageStream,
  type UIMessageChunk,
} from 'ai';

import {
  ActivityDispatchError,
  type TurnIdentity,
  type TurnOutcome,
  type TurnReply,
  type TurnRequest,
  type Uncertainty,
  type Usage,
} from './activity-executor';
import type { ApiModelSettings } from './api-model-settings';

/** Only completed turns carry SDK messages for the caller's private conversation history. */
export type ApiModelDispatch =
  | (Extract<TurnReply, { kind: 'completed' }> & {
      readonly responseMessages: readonly ModelMessage[];
    })
  | Extract<TurnReply, { kind: 'unresolved' }>;

/** Rejects malformed SDK counts and overflowing sums rather than inventing a measurement. */
function checkCount(count: number): number {
  // Proof: removing safe-integer rejection admitted unsafe input; removing nonnegative rejection admitted negative input/output.
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('invalid SDK token count');
  return count;
}

/** SDK totals treat omitted counts as zero; only complete per-step counts establish a measurement. */
function measureUsage(steps: readonly LanguageModelUsage[]): Usage {
  let complete = true;
  let inputTokens = 0;
  let outputTokens = 0;
  for (const step of steps) {
    // Proof: ignoring either absent count measured the corresponding mixed known/missing SDK loop.
    // Proof: removing the outer input/output check admitted unsafe sums of individually safe step counts.
    if (step.inputTokens === undefined) complete = false;
    else inputTokens = checkCount(inputTokens + checkCount(step.inputTokens));
    if (step.outputTokens === undefined) complete = false;
    else outputTokens = checkCount(outputTokens + checkCount(step.outputTokens));
  }
  // Proof: substituting real SDK totalUsage measured the loop whose first step omitted input usage.
  return complete
    ? { kind: 'measured', inputTokens, outputTokens }
    : { kind: 'unknown', reason: 'provider-usage-unavailable' };
}

/**
 * Executes one admitted turn through the real SDK loop and one observed UI conversion stream.
 * The caller owns immutable validated request/identity, exclusive session dispatch, and cancellation.
 * Unresolved turns carry no history append and do not establish backend quiescence.
 * @throws {@link ActivityDispatchError} retaining known correlation and original private cause for unexpected SDK/tool failures or malformed usage.
 */
export async function runApiModelTurn(options: {
  settings: ApiModelSettings;
  identity: TurnIdentity;
  request: TurnRequest;
  history: readonly ModelMessage[];
  signal: AbortSignal;
  abort: () => void;
  onPart: (part: UIMessageChunk) => void;
}): Promise<ApiModelDispatch> {
  const { settings, identity, request, history, signal, abort, onPart } = options;
  let text = '';
  let terminal: FinishReason | undefined;
  let observerFailed = false;
  const control = { stoppedAtBudget: false, interrupted: false };
  let uncertainty: Uncertainty | undefined;
  let toolFailure: { cause: unknown } | undefined;
  const pendingTools = new Set<string>();
  const steps: LanguageModelUsage[] = [];
  const stopAtBudget = isStepCount(settings.maxSteps);
  const unresolved = (reason: Uncertainty): Extract<ApiModelDispatch, { kind: 'unresolved' }> => ({
    kind: 'unresolved',
    identity,
    reason,
    text,
    usage: { kind: 'unknown', reason: 'interrupted-before-usage' },
  });
  /** Requests local cancellation while keeping an abort exception attached to its originating failure. */
  const abortAfterFailure = (cause: unknown): { cause: unknown; didFail: boolean } => {
    try {
      abort();
      return { cause, didFail: false };
    } catch (cleanup) {
      // Proof: retaining only cleanup failed both real tool/listener combined-cause tests.
      return {
        cause: new AggregateError([cause, cleanup], 'Activity abort failed', { cause }),
        didFail: true,
      };
    }
  };
  /** Retains private tool failure before abort can replace it with an SDK abort stream. */
  const failTool = (cause: unknown): unknown => {
    // Proof: removing this abort request allowed a second SDK model dispatch after a throwing local tool.
    toolFailure = { cause: abortAfterFailure(cause).cause };
    return toolFailure.cause;
  };
  const agent = new ToolLoopAgent({
    model: settings.model,
    instructions: settings.instructions,
    tools: settings.tools,
    maxOutputTokens: settings.maxOutputTokens,
    // Proof: removing zero retries made the retryable API-call test observe three dispatches instead of one.
    maxRetries: 0,
    stopWhen: async (parameters) => {
      const shouldStop = await stopAtBudget(parameters);
      // Proof: removing the recorded positive decision changed actual budget exhaustion to uncertainty.
      if (shouldStop) control.stoppedAtBudget = true;
      return shouldStop;
    },
    /** Pinned SDK execute-tool-call awaits this callback before returning local execution output. */
    onToolExecutionEnd: ({ toolOutput }) => {
      // Proof: removing callback handling dispatched two steps instead of one with a working abort capability.
      if (toolOutput.type === 'tool-error') failTool(toolOutput.error);
    },
  });
  try {
    const streamed = await agent.stream({
      messages: [...history, { role: 'user', content: request.input }],
      abortSignal: signal,
    });
    const observed = streamed.stream.pipeThrough(
      new TransformStream<TextStreamPart<ToolSet>, TextStreamPart<ToolSet>>({
        transform(part, controller) {
          switch (part.type) {
            case 'text-delta':
              text += part.text;
              break;
            case 'finish-step':
              steps.push(part.usage);
              break;
            case 'finish':
              terminal = part.finishReason;
              break;
            case 'abort':
              control.interrupted = true;
              // Proof: forwarding the SDK abort part leaked the private caller cancellation reason in live UI parts.
              controller.enqueue({ type: 'abort' });
              return;
            case 'tool-call':
              // Proof: removing this branch lost original InvalidToolInputError/NoSuchToolError and returned uncertainty.
              if (part.invalid) throw failTool(part.error);
              pendingTools.add(part.toolCallId);
              break;
            case 'tool-result':
              pendingTools.delete(part.toolCallId);
              break;
            case 'tool-error':
              // Local errors are duplicates of the awaited callback/invalid call; SDK UI conversion redacts their text.
              // Proof: removing provider handling lost the original cause of a real provider-executed error.
              if (part.providerExecuted) throw failTool(part.error);
              break;
            case 'tool-approval-request':
              uncertainty = 'approval_required';
              break;
            case 'error':
              // Proof: bypassing either SDK classifier changed transport/empty-stream uncertainty into a thrown dispatch error.
              if (APICallError.isInstance(part.error)) uncertainty = 'transport_lost';
              else if (NoOutputGeneratedError.isInstance(part.error))
                uncertainty = 'provider_incomplete';
              else throw part.error;
              break;
          }
          controller.enqueue(part);
        },
      }),
    );
    for await (const part of toUIMessageStream({ stream: observed, tools: settings.tools })) {
      // Proof: removing listener muting invoked a throwing listener twice instead of once.
      if (!observerFailed) {
        try {
          onPart(part);
        } catch (cause) {
          observerFailed = true;
          // Proof: skipping this request left the listener-failure turn's owned signal unaborted.
          const cancellation = abortAfterFailure(cause);
          // Proof: swallowing failed abort cleanup returned observer uncertainty and lost its combined failure.
          if (cancellation.didFail) throw cancellation.cause;
        }
      }
    }
    // Proof: removing this retained exception turned a throwing local tool into interruption uncertainty.
    if (toolFailure !== undefined) throw toolFailure.cause;
    // Proof: skipping measurement at suspended tool boundaries admitted a reported negative count.
    const usage = measureUsage(steps);
    // Proof: omitting observer precedence reported interruption instead of observer_failed.
    if (observerFailed) return unresolved('observer_failed');
    if (uncertainty !== undefined) return unresolved(uncertainty);
    // Proof: removing interruption classification changed actual abort-after-dispatch to provider_incomplete.
    if (control.interrupted || signal.aborted) return unresolved('interrupted');
    // Proof: removing pending-input handling changed a real client-only tool to provider_incomplete.
    if (pendingTools.size > 0) return unresolved('tool_input_required');
    let finish: TurnOutcome['finish'];
    switch (terminal) {
      // Proof: deleting the incomplete-terminal return completed partial/other/error SDK streams as end_turn.
      case undefined:
      case 'other':
      case 'error':
        return unresolved('provider_incomplete');
      case 'stop':
        finish = 'end_turn';
        break;
      // Proof: mapping length to max_steps failed the distinct-limit test.
      case 'length':
        finish = 'output_truncated';
        break;
      case 'content-filter':
        finish = 'refused';
        break;
      case 'tool-calls':
        // Proof: removing budget evidence completed tool-calls without an invoked budget stop as max_steps.
        if (!control.stoppedAtBudget) return unresolved('provider_incomplete');
        finish = 'max_steps';
        break;
      default:
        // Proof: removing rejection completed an impossible trusted finish reason with an undefined finish.
        throw new Error('invalid SDK terminal reason');
    }
    return {
      kind: 'completed',
      identity,
      outcome: { text, finish, usage },
      responseMessages: await streamed.responseMessages,
    };
  } catch (cause) {
    // Proof: retrying abort for known tool/listener failures nested the cleanup cause; omitting the correlated throw lost identity.
    const failure =
      toolFailure !== undefined
        ? toolFailure.cause
        : observerFailed
          ? cause
          : abortAfterFailure(cause).cause;
    throw new ActivityDispatchError(identity, failure);
  }
}
