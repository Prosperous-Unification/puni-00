import { spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';

import {
  client,
  ndJsonStream,
  PROTOCOL_VERSION,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionUpdate,
  type Stream,
} from '@agentclientprotocol/sdk';

/**
 * The harness's view of one ACP agent: sessions are the unit of memory. The
 * agent keeps the transcript; the harness keeps only session ids.
 */
export interface AcpAgent {
  /** Opens a session rooted at `cwd` (absolute) and returns the id the agent assigned. */
  newSession(cwd: string): Promise<string>;
  /**
   * Sends one user turn into an existing session and returns the agent's text
   * for that turn. The agent already holds every earlier turn of the session,
   * so the caller sends only what is new. Every `session/update` the agent
   * emits during the turn (tool calls, thoughts, plan, usage) is handed to
   * `onUpdate` as it arrives. Throws when the turn does not end with `end_turn`.
   */
  prompt(
    sessionId: string,
    text: string,
    onUpdate?: (update: SessionUpdate) => void,
  ): Promise<string>;
  /**
   * `session/load`: the agent replays the session's history to the client as
   * `session/update` notifications before answering. This is how a harness
   * reads what an agent remembers without touching the agent's own files.
   */
  loadSession(sessionId: string, cwd: string): Promise<SessionUpdate[]>;
  close(): void;
}

/**
 * What the harness answers when the agent asks permission for a tool call.
 * This is the authority seam: a real factory decides here from policy. The
 * example allows the first allow-kind option and refuses to guess otherwise.
 */
function decidePermission(request: RequestPermissionRequest): RequestPermissionResponse {
  const allow = request.options.find(
    (option) => option.kind === 'allow_once' || option.kind === 'allow_always',
  );
  if (!allow) {
    throw new Error(
      `agent asked permission with no allow option: ${request.options.map((o) => o.kind).join(', ')}`,
    );
  }
  return { outcome: { outcome: 'selected', optionId: allow.optionId } };
}

/** Collects the text of every `agent_message_chunk` in a list of updates. */
export function agentText(updates: SessionUpdate[]): string {
  return updates
    .map((update) =>
      update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text'
        ? update.content.text
        : '',
    )
    .join('');
}

/**
 * Connects to an agent over an ACP stream and completes the `initialize`
 * handshake. Updates are routed by session id into whichever call is in
 * flight for that session, so concurrent sessions do not mix.
 */
export async function connectAcpAgent(stream: Stream, close: () => void): Promise<AcpAgent> {
  const collectors = new Map<string, (update: SessionUpdate) => void>();
  const connection = client({ name: 'harness-example' })
    .onNotification('session/update', ({ params }) => {
      collectors.get(params.sessionId)?.(params.update);
    })
    .onRequest('session/request_permission', ({ params }) => decidePermission(params))
    .connect(stream);
  const initialized = await connection.agent.request('initialize', {
    protocolVersion: PROTOCOL_VERSION,
    clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } },
  });
  if (!initialized.agentCapabilities?.loadSession) {
    throw new Error('this agent does not advertise session/load; the harness relies on it');
  }
  const collect = async <T>(
    sessionId: string,
    call: () => Promise<T>,
    onUpdate?: (update: SessionUpdate) => void,
  ): Promise<{ updates: SessionUpdate[]; answer: T }> => {
    const updates: SessionUpdate[] = [];
    collectors.set(sessionId, (update) => {
      updates.push(update);
      onUpdate?.(update);
    });
    try {
      return { updates, answer: await call() };
    } finally {
      collectors.delete(sessionId);
    }
  };
  return {
    async newSession(cwd) {
      return (await connection.agent.request('session/new', { cwd, mcpServers: [] })).sessionId;
    },
    async prompt(sessionId, text, onUpdate) {
      const { updates, answer } = await collect(
        sessionId,
        () =>
          connection.agent.request('session/prompt', {
            sessionId,
            prompt: [{ type: 'text', text }],
          }),
        onUpdate,
      );
      if (answer.stopReason !== 'end_turn') {
        throw new Error(`session ${sessionId} stopped with ${answer.stopReason}`);
      }
      return agentText(updates);
    },
    async loadSession(sessionId, cwd) {
      const { updates } = await collect(sessionId, () =>
        connection.agent.request('session/load', { sessionId, cwd, mcpServers: [] }),
      );
      return updates;
    },
    close: () => {
      connection.close();
      close();
    },
  };
}

/**
 * Spawns an ACP agent as a child process speaking newline-delimited JSON-RPC
 * over stdio, which is how every editor drives these adapters. The agent's
 * stderr is forwarded so a failing child is never silent.
 */
export function spawnAcpAgent(
  command: string,
  args: string[],
): { stream: Stream; close: () => void } {
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stderr.on('data', (chunk: Buffer) =>
    process.stderr.write(`[${command}] ${chunk.toString()}`),
  );
  // Boundary: Node streams to Web streams. `toWeb` is typed `<any>`; stdio pipes
  // carry bytes, which is what ndJsonStream reads and writes.
  const output = Writable.toWeb(child.stdin) as WritableStream<Uint8Array>;
  const input = Readable.toWeb(child.stdout) as unknown as ReadableStream<Uint8Array>;
  return { stream: ndJsonStream(output, input), close: () => void child.kill() };
}
