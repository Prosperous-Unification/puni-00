import { writeFileSync } from 'node:fs';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Test-only preload for one actual Burokrat child. Captures its complete real verdict before
 * changing transport bytes and the child's actual exit status; native process ownership and
 * stdout EOF stay with that child. The supervisor exclusively owns the marker namespace.
 */
export function injectVerdictFault(fault: string, marker: string): void {
  const stdout = process.stdout;
  const own = Object.getOwnPropertyDescriptor(stdout, 'write');
  const chunks: Buffer[] = [];
  stdout.write = (chunk: string | Uint8Array): boolean => {
    chunks.push(Buffer.from(chunk));
    return true;
  };
  process.once('beforeExit', () => {
    if (own === undefined) Reflect.deleteProperty(stdout, 'write');
    else Object.defineProperty(stdout, 'write', own);
    const original = Buffer.concat(chunks);
    const verdict: unknown = JSON.parse(original.toString('utf8'));
    if (!isRecord(verdict)) throw Error('Verdict fault requires an actual Burokrat record');
    let altered: Record<string, unknown> | string;
    switch (fault) {
      case 'verdict-preflight-empty':
        altered = '';
        break;
      case 'verdict-preflight-malformed':
        altered = '{';
        break;
      case 'verdict-preflight-shape':
        altered = '{}';
        break;
      case 'verdict-run-foreign':
        altered = { ...verdict, candidate: 'b'.repeat(64) };
        break;
      case 'verdict-run-unevaluated':
        altered = {
          ...verdict,
          allowed: false,
          unevaluated: [{ ruleId: 'PERF-THRESHOLD', reason: 'injected missing measurement' }],
        };
        break;
      default:
        throw Error('Unknown Burokrat verdict fault: ' + fault);
    }
    if (typeof altered !== 'string') process.exitCode = altered['allowed'] === false ? 1 : 0;
    writeFileSync(
      marker,
      JSON.stringify({
        fault,
        originalBytes: original.length,
        selectedExitCode: process.exitCode,
      }) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
    stdout.write(typeof altered === 'string' ? altered : JSON.stringify(altered));
  });
}
