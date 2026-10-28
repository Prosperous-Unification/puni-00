import {
  type acquireRuntimeAuthority,
  type applyRuntimeCommands,
  type Client,
  ClientConfigurationError,
  clientFromShapes,
  type ClientInput,
  type ClientReply,
  type ClientTransport,
  type lookupRuntimeReceipt,
  type readRuntimeState,
  runtimeCommandShapes,
} from '@wbs/contracts';

/** Shared validated reply and original body; preflight, pre-inspection cancellation and body faults can lack capture. */
export interface RuntimeExchange<Reply> {
  readonly reply: Reply;
  readonly response: null | {
    readonly status: number;
    readonly bytes: Uint8Array;
  };
}

/** Injected receiver operations; schema validation does not establish durable receipt correspondence. */
export interface RuntimeClient {
  readState(
    input: ClientInput<typeof readRuntimeState>,
  ): Promise<RuntimeExchange<ClientReply<typeof readRuntimeState>>>;
  acquireAuthority(
    input: ClientInput<typeof acquireRuntimeAuthority>,
  ): Promise<RuntimeExchange<ClientReply<typeof acquireRuntimeAuthority>>>;
  applyCommands(
    input: ClientInput<typeof applyRuntimeCommands>,
  ): Promise<RuntimeExchange<ClientReply<typeof applyRuntimeCommands>>>;
  lookupReceipt(
    input: ClientInput<typeof lookupRuntimeReceipt>,
  ): Promise<RuntimeExchange<ClientReply<typeof lookupRuntimeReceipt>>>;
}

/**
 * Captures the injected transport's actual Response before shared validation consumes it.
 * Each invocation owns its capture and client, including concurrent calls. Configuration
 * faults throw ClientConfigurationError; capture faults follow the shared transport failure.
 */
export function createRuntimeClient(transport: ClientTransport): RuntimeClient {
  // Proof: W1 removed this guard; absent/non-callable configuration stopped throwing at construction.
  if (typeof transport !== 'function')
    throw new ClientConfigurationError('Runtime client requires a callable transport');

  async function exchange<Reply>(
    invoke: (client: Client<typeof runtimeCommandShapes>) => Promise<Reply>,
  ): Promise<RuntimeExchange<Reply>> {
    // Proof: W6/W7 moved this slot outside the call; failed neighbors inherited bytes and overlapping success captured another call's 404.
    let response: RuntimeExchange<Reply>['response'] = null;
    const client = clientFromShapes(runtimeCommandShapes, async (shape, input) => {
      const received = await transport(shape, input);
      // Proof: W2 removed this guard; parsed-only replies became modeled transport failures instead of configuration errors (diagnostic boundary).
      if (!(received instanceof Response))
        throw new ClientConfigurationError('Runtime transport requires an actual Response');
      // Proof: W8-cancel-before-capture removed this branch; the finite real-stream race observed clone before cancel and failed.
      if (input.signal?.aborted) return received;
      const status = received.status;
      const clone = received.clone();
      // Proof: W3/W4 lost literal bytes through empty capture/reserialization; W8-no-await-capture consumed the original while capture remained held.
      const bytes = new Uint8Array(await clone.arrayBuffer());
      response = { status, bytes };
      return received;
    });
    const reply = await invoke(client);
    return { reply, response };
  }

  return {
    readState: (input) => exchange((client) => client.readRuntimeState(input)),
    acquireAuthority: (input) => exchange((client) => client.acquireRuntimeAuthority(input)),
    applyCommands: (input) => exchange((client) => client.applyRuntimeCommands(input)),
    lookupReceipt: (input) => exchange((client) => client.lookupRuntimeReceipt(input)),
  };
}
