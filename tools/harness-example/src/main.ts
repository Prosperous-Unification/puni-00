import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { connectAcpAgent, spawnAcpAgent } from './acp';
import { fakeAcpStream } from './fake-acp-agent';
import { buildHarness } from './harness';
import { type HarnessEvent, LineCoalescer } from './log';
import { readLatestPrompt } from './prompts';

/**
 * The smallest runnable harness with sessions: a prompt in, one agent session
 * per task, two turns per session, N files out, and every step on stdout.
 *
 * ```sh
 * bunx nx run harness-example:run -- --fake "anything"   # in-process fake agent, no network
 * bunx nx run harness-example:run -- "csv to json cli"   # Claude Code over ACP, your `claude` login
 * bunx nx run harness-example:run -- --file-prompt       # prompt = highest-numbered file in input-prompts/
 * ```
 *
 * `--file-prompt` reads `tools/harness-example/input-prompts/<number>.<name>`
 * and takes the largest number (see {@link readLatestPrompt}); it cannot be
 * combined with a prompt on the command line, because two prompts is no prompt.
 *
 * The run is streamed with two LangGraph modes: `custom` carries every ACP
 * update each node forwarded (tool calls, text, usage), `updates` marks each
 * node's completion with what it wrote to state. The real path spawns
 * `claude-agent-acp`, the ACP adapter around the Claude Agent SDK, and speaks
 * JSON-RPC to it over stdio. Files land in `tmp/harness-example/<timestamp>/`.
 * A missing prompt is an error rather than a default: there is nothing
 * sensible to build from nothing.
 */
async function promptFromFile(): Promise<string> {
  const { file, text } = await readLatestPrompt(path.resolve(import.meta.dir, '../input-prompts'));
  console.log(`prompt from input-prompts/${file}`);
  return text;
}

async function main(argv: string[]): Promise<void> {
  const fake = argv.includes('--fake');
  const fromFile = argv.includes('--file-prompt');
  const words = argv.filter((arg) => arg !== '--fake' && arg !== '--file-prompt').join(' ');
  if (fromFile && words) throw new Error('--file-prompt and a command-line prompt are exclusive');
  if (!fromFile && !words)
    throw new Error('usage: main.ts [--fake] (--file-prompt | "<what to build>")');
  const prompt = fromFile ? await promptFromFile() : words;
  const cwd = path.resolve(`tmp/harness-example/${String(Date.now())}`);
  await mkdir(cwd, { recursive: true });
  const { stream, close } = fake ? fakeAcpStream(300) : spawnAcpAgent('bunx', ['claude-agent-acp']);
  const agent = await connectAcpAgent(stream, close);
  const started = Date.now();
  const log = new LineCoalescer();
  const print = (lines: string[]) => {
    for (const line of lines) console.log(line);
  };
  try {
    const run = await buildHarness(agent).stream(
      { prompt, cwd },
      { streamMode: ['updates', 'custom'] },
    );
    for await (const [mode, chunk] of run) {
      const elapsed = Date.now() - started;
      if (mode === 'custom') {
        // Boundary: the custom channel carries whatever nodes wrote; ours write HarnessEvent.
        print(log.push(chunk as HarnessEvent, elapsed));
      } else {
        for (const [node, written] of Object.entries(chunk as Record<string, unknown>)) {
          // A node's pending text belongs before its completion line; a Send
          // branch's key carries its task id, which the update chunk does not,
          // so flush everything this node has open.
          print(log.flushAll().filter((line) => line.includes(`  ${node}`)));
          console.log(
            `${String(elapsed).padStart(6)}ms  ${`■ ${node} done`.padEnd(22)} ${JSON.stringify(written).slice(0, 160)}`,
          );
        }
      }
    }
    print(log.flushAll());
  } finally {
    agent.close();
  }
}

await main(process.argv.slice(2));
