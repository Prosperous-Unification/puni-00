import { $ as bun$ } from 'bun';

export class ShellError extends Error {
  override name = 'ShellError' as const;
  constructor(
    message: string,
    public readonly exitCode: number,
    public readonly stdout: string,
    public readonly stderr: string,
  ) {
    super(message);
  }
}

export interface ShellResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function $(
  strings: TemplateStringsArray,
  ...values: Bun.ShellExpression[]
): Promise<ShellResult> {
  try {
    const out = await bun$(strings, ...values).quiet();
    return {
      exitCode: out.exitCode,
      stdout: out.stdout.toString(),
      stderr: out.stderr.toString(),
    };
  } catch (err) {
    const e = err as {
      exitCode?: number;
      stdout?: { toString(): string };
      stderr?: { toString(): string };
      message?: string;
    };
    const code = e.exitCode ?? 1;
    throw new ShellError(
      e.message ?? `command failed with exit ${String(code)}`,
      code,
      e.stdout ? e.stdout.toString() : '',
      e.stderr ? e.stderr.toString() : '',
    );
  }
}
