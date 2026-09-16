import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  agent,
  type AgentContext,
  ndJsonStream,
  type PromptRequest,
  PROTOCOL_VERSION,
  type Stream,
} from '@agentclientprotocol/sdk';

interface Turn {
  role: 'user' | 'agent';
  text: string;
}

interface FakeSession {
  cwd: string;
  history: Turn[];
  /** The one file this session has created, which is the fact `REVISE` depends on. */
  file: string | null;
}

/**
 * An in-process ACP agent with no model behind it. It answers three prompt
 * shapes the harness sends, and its memory is the session: a `REVISE` turn
 * can only find the file it wrote if it is sent into the same session. That
 * is what makes it a fair oracle for session handling.
 */
class FakeAgent {
  private readonly sessions = new Map<string, FakeSession>();
  private nextId = 1;

  constructor(private readonly delayMs: number) {}

  newSession(cwd: string): string {
    const sessionId = `fake-${String(this.nextId++)}`;
    this.sessions.set(sessionId, { cwd, history: [], file: null });
    return sessionId;
  }

  /** Replays the session's turns as `session/update` notifications, which is what `session/load` promises. */
  async loadSession(sessionId: string, client: AgentContext): Promise<void> {
    for (const turn of this.session(sessionId).history) {
      await client.notify('session/update', {
        sessionId,
        update: {
          sessionUpdate: turn.role === 'user' ? 'user_message_chunk' : 'agent_message_chunk',
          content: { type: 'text', text: turn.text },
        },
      });
    }
  }

  async prompt(params: PromptRequest, client: AgentContext): Promise<void> {
    const session = this.session(params.sessionId);
    const text = params.prompt.map((block) => (block.type === 'text' ? block.text : '')).join('');
    session.history.push({ role: 'user', text });
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    const reply = await this.answer(session, text);
    session.history.push({ role: 'agent', text: reply });
    await client.notify('session/update', {
      sessionId: params.sessionId,
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: reply } },
    });
  }

  private session(sessionId: string): FakeSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`unknown session ${sessionId}`);
    return session;
  }

  private async answer(session: FakeSession, text: string): Promise<string> {
    if (text.startsWith('PLAN')) {
      const tasks = ['a', 'b', 'c'].map((n) => ({
        id: `task-${n}`,
        title: `Part ${n}`,
        spec: `Do ${n}`,
        file: `part-${n}.txt`,
      }));
      return JSON.stringify({ tasks });
    }
    const create = /^IMPLEMENT (\S+)/.exec(text);
    if (create) {
      const [, file] = create;
      if (!file) throw new Error('IMPLEMENT without a file');
      await writeFile(path.join(session.cwd, file), `body of ${file}\n`);
      session.file = file;
      return `wrote ${file}`;
    }
    const revise = /^REVISE (\S+)/.exec(text);
    if (revise) {
      const [, id] = revise;
      if (!id) throw new Error('REVISE without a task id');
      if (!session.file) return 'no file was created in this session';
      await writeFile(path.join(session.cwd, session.file), `// ${id}\nbody of ${session.file}\n`);
      return `revised ${session.file}`;
    }
    throw new Error(`fake agent does not understand: ${text.slice(0, 40)}`);
  }
}

/**
 * Wires a {@link FakeAgent} to an in-memory ACP stream pair and returns the
 * client end, so the harness talks to it exactly as it would to a subprocess.
 */
export function fakeAcpStream(delayMs: number): { stream: Stream; close: () => void } {
  const fake = new FakeAgent(delayMs);
  const clientToAgent = new TransformStream<Uint8Array, Uint8Array>();
  const agentToClient = new TransformStream<Uint8Array, Uint8Array>();
  const connection = agent({ name: 'fake-agent' })
    .onRequest('initialize', () => ({
      protocolVersion: PROTOCOL_VERSION,
      agentCapabilities: { loadSession: true },
    }))
    .onRequest('authenticate', () => ({}))
    .onRequest('session/new', ({ params }) => ({ sessionId: fake.newSession(params.cwd) }))
    .onRequest('session/load', async ({ params, client }) => {
      await fake.loadSession(params.sessionId, client);
      return {};
    })
    .onRequest('session/prompt', async ({ params, client }) => {
      await fake.prompt(params, client);
      return { stopReason: 'end_turn' as const };
    })
    .onNotification('session/cancel', () => {
      // Nothing runs long enough to cancel.
    })
    .connect(ndJsonStream(agentToClient.writable, clientToAgent.readable));
  return {
    stream: ndJsonStream(clientToAgent.writable, agentToClient.readable),
    close: () => {
      connection.close();
    },
  };
}
