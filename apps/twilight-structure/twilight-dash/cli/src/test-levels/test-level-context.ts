/** Independently admitted installed toolchain locations; the selected candidate supplies none of these paths. */
export interface TestLevelAssets {
  readonly nodeModules: string;
  readonly playwrightEntrypoint: string;
  readonly viteEntrypoint: string;
  readonly nxEntrypoint: string;
}

/** Exact independent Burokrat child response, decoded by the evidence consumer before use. */
export interface TestLevelJudgment {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Actual shared execution port supplied by the command owner, including retained process channels and fresh judge scratch. */
export interface TestLevelJudgeExecution {
  spawn(
    argv: string[],
    cwd: string,
    environment: Record<string, string>,
    output: { stdout: 'pipe'; stderr: 'pipe' },
  ): Bun.Subprocess;
  capture<Value>(pending: Promise<Value>): Promise<Value>;
  retainFailure(cause: unknown): void;
  isCancellation(cause: unknown): boolean;
  assertChildResult(child: Bun.Subprocess, exitCode: number): void;
  createJudgeDirectory(temporaryDirectory: string): string;
}

/** Protected asynchronous Burokrat child capability; the actual shared command owner supplies execution. */
export interface TestLevelJudge {
  identity(
    execution: TestLevelJudgeExecution,
    repository: string,
    revision: string,
  ): Promise<TestLevelJudgment>;
  performance(
    execution: TestLevelJudgeExecution,
    repository: string,
    revision: string,
    rulePolicy: string,
    evidence?: string,
  ): Promise<TestLevelJudgment>;
}

/** The executable captures this selection before provider import or operation awaits. */
export interface TestLevelContext {
  readonly runtime: string;
  readonly callerDirectory: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly assets: TestLevelAssets;
  readonly judge: TestLevelJudge;
}

/** Snapshot only execution inputs; actual judge capabilities retain their selected provider receiver. */
export function retainTestLevelContext(context: TestLevelContext): TestLevelContext {
  const judge = context.judge;
  const identity = judge.identity.bind(judge);
  const performance = judge.performance.bind(judge);
  return {
    runtime: context.runtime,
    callerDirectory: context.callerDirectory,
    environment: { ...context.environment },
    assets: { ...context.assets },
    judge: {
      identity,
      performance,
    },
  };
}
