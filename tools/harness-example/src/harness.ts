import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { SessionUpdate } from '@agentclientprotocol/sdk';
import {
  END,
  getWriter,
  ReducedValue,
  Send,
  START,
  StateGraph,
  StateSchema,
} from '@langchain/langgraph';
import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';
import { type Type, type } from 'arktype';

import type { AcpAgent } from './acp';
import type { HarnessEvent } from './log';

/**
 * One unit of work the planner hands to one implementer. `spec` must stand
 * alone: implementers run in parallel and cannot see each other's tasks.
 */
export const Task = type({
  id: 'string',
  title: 'string',
  spec: 'string',
  file: 'string',
});
export type Task = typeof Task.infer;

/** The planner's whole answer. Bounded so a runaway plan cannot fan out without limit. */
export const Plan = type({ tasks: Task.array().atLeastLength(1).atMostLength(6) });
export type Plan = typeof Plan.infer;

/**
 * What the finish node learns about one task once both turns are done:
 * the header the revise turn had to write, and what `session/load` replayed.
 */
export const Outcome = type({
  id: 'string',
  sessionId: 'string',
  headerOk: 'boolean',
  replayedTurns: 'number',
});
export type Outcome = typeof Outcome.infer;

type Schema<T extends Type> = StandardSchemaV1<T['inferIn'], T['infer']> &
  StandardJSONSchemaV1<T['inferIn'], T['infer']>;

/**
 * Hands LangGraph an ArkType type as a plain Standard Schema object.
 *
 * ArkType implements Standard Schema and Standard JSON Schema, so the types
 * line up, but LangGraph's runtime `isStandardSchema` also requires
 * `typeof schema === 'object'` and an ArkType type is callable: `typeof` says
 * `'function'`. Measured: passing the type itself makes `new StateGraph`
 * throw `Invalid state field "prompt": must be a schema, ReducedValue, …`.
 * Exposing only `~standard` keeps ArkType's validation and JSON Schema and
 * satisfies the check.
 */
function asSchema<T extends Type>(arkType: T): Schema<T> {
  return { '~standard': arkType['~standard'] };
}

/**
 * Graph state. Two fields carry reducers because parallel branches write them:
 * `sessions` merges one `{ taskId: sessionId }` per implement branch, and
 * `outcomes` appends one row per revise branch. Without a reducer LangGraph
 * refuses the second concurrent write with `InvalidUpdateError` (see `harness.test.ts`).
 *
 * `sessions` is the whole of what the harness persists about conversations:
 * the agent keeps every transcript, the graph keeps the ids to resume them.
 */
export const HarnessState = new StateSchema({
  prompt: asSchema(type('string')),
  cwd: asSchema(type('string')),
  tasks: asSchema(Task.array()),
  sessions: new ReducedValue(asSchema(type('Record<string, string>')), {
    reducer: (current, next) => ({ ...current, ...next }),
  }),
  outcomes: new ReducedValue(asSchema(Outcome.array()), {
    reducer: (current, next) => [...current, ...next],
  }),
  summary: asSchema(type('string')),
});

/** What one `implement` branch receives from {@link Send}: a task and the directory to work in. */
const ImplementInput = new StateSchema({ task: asSchema(Task), cwd: asSchema(type('string')) });

/** What one `revise` branch receives: the task plus the session its first turn opened. */
const ReviseInput = new StateSchema({
  task: asSchema(Task),
  cwd: asSchema(type('string')),
  sessionId: asSchema(type('string')),
});

/**
 * Forwards one node's ACP updates to the graph's `custom` stream, tagged with
 * where they came from. `getWriter` is defined only when the caller streams
 * with `streamMode` including `'custom'`; under plain `invoke` nothing is
 * emitted, which is the modeled "nobody is watching" case.
 */
function reporter(node: string, task: string | null, sessionId: string) {
  const writer = getWriter();
  return (update: HarnessEvent['update']) => {
    writer?.({ node, task, sessionId, update } satisfies HarnessEvent);
  };
}

/** Counts user and agent turns in a `session/load` replay. */
function countTurns(updates: SessionUpdate[]): number {
  return updates.filter(
    (u) => u.sessionUpdate === 'user_message_chunk' || u.sessionUpdate === 'agent_message_chunk',
  ).length;
}

/**
 * plan → implement×N → revise×N → finish, every task in its own agent session.
 *
 * - `plan` opens one session, asks for JSON, and validates it with {@link Plan}.
 * - `implement` (one {@link Send} per task, run concurrently) opens a session
 *   per task, asks the agent to create the task's file, and records the
 *   session id into state.
 * - `revise` (one `Send` per task, after every implement has returned) sends a
 *   second turn into the **same** session. The prompt names the task but not
 *   the file: only an agent that remembers turn one can find it.
 * - `finish` reports each file's header and what `session/load` replayed,
 *   which is how the harness sees what the agent remembers without reading
 *   the agent's private transcript files.
 */
export function buildHarness(agent: AcpAgent) {
  return new StateGraph(HarnessState)
    .addNode('plan', async (state) => {
      const sessionId = await agent.newSession(state.cwd);
      const reply = await agent.prompt(
        sessionId,
        `PLAN. Split this request into 1 to 6 independent tasks that separate engineers can implement in parallel without talking to each other. Each task produces exactly one file. Reply with JSON only, no prose, no code fences, matching {"tasks":[{"id":"short-slug","title":"…","spec":"self-contained instructions","file":"relative/path"}]}.\n\nRequest: ${state.prompt}`,
        reporter('plan', null, sessionId),
      );
      return { tasks: Plan.assert(JSON.parse(reply)).tasks };
    })
    .addNode(
      'implement',
      async (state) => {
        const sessionId = await agent.newSession(state.cwd);
        await agent.prompt(
          sessionId,
          `IMPLEMENT ${state.task.file}\nCreate the file ${state.task.file} in the current directory.\n\n${state.task.spec}\n\nReply with one line when the file exists.`,
          reporter('implement', state.task.id, sessionId),
        );
        return { sessions: { [state.task.id]: sessionId } };
      },
      { input: ImplementInput },
    )
    .addNode('gather', () => ({}))
    .addNode(
      'revise',
      async (state) => {
        await agent.prompt(
          state.sessionId,
          `REVISE ${state.task.id}\nAdd a first line to the file you created earlier in this session. The line must be exactly: // ${state.task.id}\nDo not create any other file. Reply with the file name.`,
          reporter('revise', state.task.id, state.sessionId),
        );
        const firstLine = (await readFile(path.join(state.cwd, state.task.file), 'utf8')).split(
          '\n',
        )[0];
        const replayed = await agent.loadSession(state.sessionId, state.cwd);
        return {
          outcomes: [
            {
              id: state.task.id,
              sessionId: state.sessionId,
              headerOk: firstLine === `// ${state.task.id}`,
              replayedTurns: countTurns(replayed),
            },
          ],
        };
      },
      { input: ReviseInput },
    )
    .addNode('finish', (state) => {
      const lines = state.outcomes.map(
        (o) =>
          `${o.id.padEnd(16)} session ${o.sessionId.slice(0, 8).padEnd(8)}  header ${o.headerOk ? 'ok     ' : 'MISSING'}  replayed ${String(o.replayedTurns)} turns`,
      );
      const failed = state.outcomes.filter((o) => !o.headerOk).length;
      const headline = `${String(state.outcomes.length)} tasks, ${String(failed)} failed, in ${state.cwd}`;
      return { summary: `${headline}\n${lines.join('\n')}` };
    })
    .addEdge(START, 'plan')
    .addConditionalEdges(
      'plan',
      (state) => state.tasks.map((task) => new Send('implement', { task, cwd: state.cwd })),
      ['implement'],
    )
    .addEdge('implement', 'gather')
    .addConditionalEdges(
      'gather',
      (state) =>
        state.tasks.map((task) => {
          const sessionId = state.sessions[task.id];
          if (!sessionId) throw new Error(`no session recorded for ${task.id}`);
          return new Send('revise', { task, cwd: state.cwd, sessionId });
        }),
      ['revise'],
    )
    .addEdge('revise', 'finish')
    .addEdge('finish', END)
    .compile();
}
