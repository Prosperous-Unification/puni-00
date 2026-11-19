import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createLaunch } from '@shared/bun-startup';

/** Required actual command execution; Burokrat never creates a competing native/signal owner. */
interface JudgeExecution {
  spawn(argv: string[], cwd: string, environment: Record<string, string>, output: {stdout: 'pipe'; stderr: 'pipe'}): Bun.Subprocess;
  capture<Value>(pending: Promise<Value>): Promise<Value>;
  retainFailure(cause: unknown): void;
  isCancellation(cause:unknown):boolean;
  assertChildResult(child:Bun.Subprocess,exitCode:number):void;
  createJudgeDirectory(temporaryDirectory: string): string;
}

/** Independently authenticated delivered worker snapshot and actual captured host invocation inputs. */
export interface PerformanceJudgeSelection {
  readonly runtime: string;
  readonly temporaryDirectory: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly worker: {readonly bytes: Uint8Array; readonly sha256: string};
}

interface Judgment {readonly exitCode: number; readonly stdout: string; readonly stderr: string}
export interface PerformanceJudge {
  identity(execution: JudgeExecution, repository: string, revision: string): Promise<Judgment>;
  performance(execution: JudgeExecution, repository: string, revision: string, policy: string, evidence?: string): Promise<Judgment>;
}

/**
 * Snapshot independently selected Burokrat bytes once and execute only closed judging operations.
 * Fresh trusted cwd, protected Bun startup, actual native children and numeric/EOF capture belong
 * to the shared command owner. This helper never grants provenance from its own digest or removes
 * scratch before that owner confirms complete cleanup.
 */
export function createPerformanceJudge(selection: PerformanceJudgeSelection): PerformanceJudge {
  const runtime = selection.runtime, temporaryDirectory = selection.temporaryDirectory;
  const environment = {...selection.environment};
  const worker = Uint8Array.from(selection.worker.bytes), expected = selection.worker.sha256;
  if (createHash('sha256').update(worker).digest('hex') !== expected)
    throw new Error('Performance judge worker differs from its authenticated snapshot');
  async function invoke(execution: JudgeExecution, operands: readonly string[]): Promise<Judgment> {
    const directory = execution.createJudgeDirectory(temporaryDirectory);
    try {
      const entrypoint = join(directory, 'performance-judge.mjs');
      writeFileSync(entrypoint, worker, {flag: 'wx', mode: 0o600});
      const child = execution.spawn([...createLaunch(runtime, entrypoint), ...operands], directory, {
        PATH: environment['PATH'] ?? '/usr/bin:/bin', HOME: directory,
        TMPDIR: temporaryDirectory, LANG: 'C.UTF-8',
      }, {stdout: 'pipe', stderr: 'pipe'});
      const exit = execution.capture(child.exited);
      const stdout = child.stdout;
      if (!(stdout instanceof ReadableStream)) throw new Error('Performance judge stdout pipe is absent');
      const output = execution.capture(new Response(stdout).text());
      const stderr = child.stderr;
      if (!(stderr instanceof ReadableStream)) throw new Error('Performance judge stderr pipe is absent');
      const errors = execution.capture(new Response(stderr).text());
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const [exitCode, outputText, errorText] = await Promise.race([
          Promise.all([exit, output, errors]),
          new Promise<never>((_accept, reject) => {
            timeout = setTimeout(() => reject(new Error('Performance judge request timed out')), 30_000);
          }),
        ]);
        execution.assertChildResult(child,exitCode);
        return {exitCode, stdout: outputText, stderr: errorText};
      } finally { if (timeout !== undefined) clearTimeout(timeout); }
    } catch (cause) {
      if(execution.isCancellation(cause))throw cause;
      execution.retainFailure(cause);
      throw new Error('Performance judge request failed; retained ' + directory, {cause});
    }
  }
  return {
    identity: (execution, repository, revision) => invoke(execution, ['identity', repository, revision]),
    performance: (execution, repository, revision, policy, evidence) => invoke(execution,
      ['performance', repository, revision, policy, ...(evidence === undefined ? [] : [evidence])]),
  };
}
