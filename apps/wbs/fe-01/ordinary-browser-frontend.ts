import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { spawn } from 'bun';

interface ViteExit {
  exitCode: number;
  signalCode: NodeJS.Signals | null;
}

interface SelectedVite {
  exited: Promise<ViteExit>;
  stop(signal: 'SIGINT' | 'SIGTERM'): void;
  settled: boolean;
  stopAttempted: boolean;
  joinFailed: boolean;
}

/**
 * Builds and previews this frontend with its installed Vite under the current Bun.
 *
 * PORT is required from the admitted service environment; Vite retains its own
 * port validation and normal configuration. Cancellation joins the selected
 * direct child and never admits preview after a cancelled build. The outer
 * service owner retains descendant cleanup and the existing readiness deadline.
 * An operation failure is tagged separately, including an actual thrown
 * undefined. Stop/join cleanup failures retain their own observation order.
 * An operation primary remains the aggregate cause; cleanup-only failure is
 * explicit and does not invent an operation primary.
 */
async function serveFrontend(): Promise<void> {
  const cwd = dirname(fileURLToPath(import.meta.url));
  const vite = resolve(cwd, '../../../node_modules/vite/bin/vite.js');
  let primary: { failure: unknown } | undefined;
  const cleanupFailures: unknown[] = [];
  const lifetime: {
    selected: SelectedVite | undefined;
    cancellation: 'SIGINT' | 'SIGTERM' | undefined;
  } = { selected: undefined, cancellation: undefined };

  const stopSelected = (): void => {
    const selected = lifetime.selected;
    if (selected === undefined || selected.settled || selected.stopAttempted) return;
    selected.stopAttempted = true;
    try {
      selected.stop(lifetime.cancellation ?? 'SIGTERM');
    } catch (failure) {
      cleanupFailures.push(failure);
    }
  };
  const isCancelled = (): boolean => lifetime.cancellation !== undefined;
  const interrupt = (): void => {
    lifetime.cancellation ??= 'SIGINT';
    stopSelected();
  };
  const terminate = (): void => {
    lifetime.cancellation ??= 'SIGTERM';
    stopSelected();
  };

  // Cancellation is installed before the first asynchronous child observation.
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);

  const runVite = async (argv: string[]): Promise<ViteExit> => {
    const child = spawn([process.execPath, vite, ...argv], {
      cwd,
      env: process.env,
      stdin: 'ignore',
      stdout: 'inherit',
      stderr: 'inherit',
    });
    const stop = child.kill.bind(child);
    const current: SelectedVite = {
      exited: child.exited.then((exitCode) => {
        current.settled = true;
        return { exitCode, signalCode: child.signalCode };
      }),
      stop,
      settled: false,
      stopAttempted: false,
      joinFailed: false,
    };
    lifetime.selected = current;
    if (isCancelled()) stopSelected();
    let observed: ViteExit;
    try {
      observed = await current.exited;
    } catch (failure) {
      current.joinFailed = true;
      throw failure;
    }
    lifetime.selected = undefined;
    return observed;
  };

  let exitCode = 0;
  try {
    const port = process.env['PORT'];
    if (port === undefined || port === '') throw new Error('Ordinary frontend requires PORT');
    if (!isCancelled()) {
      const build = await runVite(['build', '--minify=false']);
      exitCode = build.exitCode;
      if (build.signalCode !== null && build.exitCode === 0) {
        throw new Error(`Ordinary frontend build has signal ${build.signalCode} with zero exit`);
      }
      if (build.exitCode === 0 && !isCancelled()) {
        const preview = await runVite([
          'preview',
          '--host',
          'localhost',
          '--port',
          port,
          '--strictPort',
        ]);
        exitCode = preview.exitCode;
        if (preview.signalCode !== null && preview.exitCode === 0) {
          throw new Error(
            `Ordinary frontend preview has signal ${preview.signalCode} with zero exit`,
          );
        }
      }
    }
  } catch (failure) {
    primary = { failure };
  } finally {
    stopSelected();
    const selected = lifetime.selected;
    if (selected !== undefined && !selected.joinFailed) {
      try {
        await selected.exited;
      } catch (failure) {
        cleanupFailures.push(failure);
      }
    }
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', terminate);
  }
  if (primary !== undefined) {
    throw new AggregateError(
      [primary.failure, ...cleanupFailures],
      'Ordinary frontend operation failed',
      { cause: primary.failure },
    );
  }
  if (cleanupFailures.length !== 0) {
    throw new AggregateError(cleanupFailures, 'Ordinary frontend cleanup failed', {
      cause: cleanupFailures[0],
    });
  }
  process.exitCode =
    exitCode !== 0
      ? exitCode
      : lifetime.cancellation === 'SIGINT'
        ? 130
        : lifetime.cancellation === 'SIGTERM'
          ? 143
          : 0;
}

await serveFrontend();
