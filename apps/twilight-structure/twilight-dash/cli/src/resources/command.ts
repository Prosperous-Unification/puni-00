import { readFileSync } from 'node:fs';

import type { WallClock } from '../clock';
import type { ApiKey, McpEndpoint } from '../mcp/machine-token';
import type { WbsTools } from '../mcp/wbs-tools';
import {
  type CreationRequest,
  linuxHostFacts,
  loadResourceConfiguration,
  ResourceRuntime,
  ResourceWbsUnavailable,
} from './runtime';

/**
 * Parse the complete resource CLI grammar before reading credentials or opening the ledger.
 * `connect` opens WBS's tools for the configured MCP endpoint and key; it is called once, and
 * the tools are closed before the command returns.
 */
export async function runResources(
  argv: readonly string[],
  clock: WallClock,
  write: (text: string) => unknown,
  connect: (endpoint: McpEndpoint, key: ApiKey) => WbsTools,
): Promise<number> {
  const action = argv.at(0);
  const tail = argv.slice(1);
  const actions = ['init', 'create', 'exec', 'run', 'inspect', 'cleanup', 'sweep', 'sync', 'watch'];
  if (action === undefined || !actions.includes(action))
    throw new Error(
      'resources requires init, create, exec, run, inspect, cleanup, sweep, sync, or watch',
    );
  const separator = tail.indexOf('--');
  const flags = separator < 0 ? tail : tail.slice(0, separator);
  const command = separator < 0 ? [] : tail.slice(separator + 1);
  const allowed = new Set([
    '--config',
    ...(['create', 'exec'].includes(action) ? ['--request'] : []),
    ...(['run', 'inspect', 'cleanup'].includes(action) ? ['--use'] : []),
    ...(action === 'cleanup' ? ['--revision', '--incarnation', '--reason'] : []),
  ]);
  const values = new Map<string, string>();
  for (let index = 0; index < flags.length; index += 2) {
    const name = flags[index];
    const value = flags[index + 1];
    if (!name || !allowed.has(name) || values.has(name) || !value || value.startsWith('--'))
      throw new Error('invalid resource command flags');
    values.set(name, value);
  }
  const required = (name: string): string => {
    const value = values.get(name);
    if (!value) throw new Error(`resources requires ${name}`);
    return value;
  };
  const config = required('--config');
  if (['create', 'exec'].includes(action)) required('--request');
  if (['run', 'cleanup'].includes(action)) required('--use');
  if (action === 'cleanup') {
    required('--incarnation');
    required('--reason');
    if (!/^[1-9]\d*$/.test(required('--revision'))) throw new Error('invalid resource revision');
  }
  if (['exec', 'run'].includes(action) !== command.length > 0)
    throw new Error('resources exec/run requires -- followed by a command');
  const configuration = loadResourceConfiguration(config);
  const runtime =
    action === 'init'
      ? ResourceRuntime.initialize(configuration, clock, linuxHostFacts)
      : ResourceRuntime.open(configuration, clock);
  const report = (value: unknown): void => {
    write(`${JSON.stringify(value)}\n`);
  };
  const tools = connect(configuration.endpoint, configuration.credential);
  const cancellation = new AbortController();
  const cancel = (): void => {
    cancellation.abort();
  };
  process.once('SIGTERM', cancel);
  process.once('SIGINT', cancel);
  try {
    if (action === 'init') {
      report({
        initialized: true,
        root: configuration.root,
        authorityId: configuration.authorityId,
        coverage: 'linux-cooperating-managed-commands',
      });
      return 0;
    }
    if (action === 'inspect') {
      const id = values.get('--use');
      report(id === undefined ? runtime.list() : runtime.inspect(id));
      return 0;
    }
    if (action === 'create' || action === 'exec') {
      let request: unknown;
      try {
        request = JSON.parse(readFileSync(required('--request'), 'utf8'));
      } catch {
        throw new Error('resource request file unreadable or malformed');
      }
      // ResourceRuntime.create validates this untrusted JSON once at its public boundary.
      const use = await runtime.create(request as CreationRequest, tools);
      report(use);
      if (action === 'create') return 0;
      try {
        return await runtime.run(use.id, command, cancellation.signal);
      } finally {
        const latest = runtime.inspect(use.id);
        if (!latest.sealed && latest.state !== 'released')
          runtime.requestCleanup(
            latest.id,
            latest.revision,
            latest.incarnation,
            'managed session ended',
          );
        runtime.sweep();
        report(runtime.inspect(use.id));
      }
    }
    if (action === 'run') {
      const id = required('--use');
      try {
        return await runtime.run(id, command, cancellation.signal);
      } finally {
        const latest = runtime.inspect(id);
        if (!latest.sealed && latest.state !== 'released')
          runtime.requestCleanup(
            latest.id,
            latest.revision,
            latest.incarnation,
            'managed command ended',
          );
        runtime.sweep();
        report(runtime.inspect(id));
      }
    }
    if (action === 'cleanup') {
      report(
        runtime.requestCleanup(
          required('--use'),
          Number(required('--revision')),
          required('--incarnation'),
          required('--reason'),
        ),
      );
      report(runtime.sweep());
      return 0;
    }
    if (action === 'sweep') {
      report(runtime.sweep());
      return 0;
    }
    if (action === 'sync') {
      await runtime.synchronize(tools);
      report({ cursor: runtime.requestCursor(), pendingEvents: runtime.outbox().length });
      return 0;
    }
    while (!cancellation.signal.aborted) {
      report(runtime.sweep());
      try {
        await runtime.synchronize(tools);
      } catch (cause) {
        // WBS unavailable is a durable retry obligation; refusals and malformed trusted replies
        // stop the controller.
        if (!(cause instanceof ResourceWbsUnavailable)) throw cause;
        report({ publication: 'pending', reason: 'WBS unavailable; durable outbox retained' });
      }
      await Bun.sleep(1000);
    }
    return 0;
  } finally {
    process.removeListener('SIGTERM', cancel);
    process.removeListener('SIGINT', cancel);
    runtime.close();
    await tools.close();
  }
}
