type Invocation =
  | { mode: 'serial'; operands: string[]; forwarded: string[] }
  | {
      mode: 'whole-cli';
      reason: 'forwarded arguments' | 'repository suppressions';
      operands: string[];
      forwarded: string[];
    };

interface Group {
  name: string;
  files: string[];
}

export function readInvocation(root: string, arguments_: readonly string[]): Invocation;
export function discoverFiles(root: string, operands: readonly string[]): Promise<string[]>;
export function groupFiles(root: string, files: readonly string[]): Group[];
