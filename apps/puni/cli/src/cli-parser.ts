import { command, type InferValue, map, message, or } from '@optique/core';
import { run } from '@optique/run';
import { parser as burokratParser } from '@puni/burokrat/grammar';
import { findRefusal as findDashRefusal, parser as dashParser } from '@puni/dash/grammar';
import { parser as navigatorParser } from '@puni/navigator/grammar';

import { burokrat, dash, findNamespace, navigator } from './namespaces';

/** The installed command tree; provider grammars retain their typed request shapes. */
export const parser = or(
  map(
    command(navigator.name, navigatorParser, {
      aliases: navigator.aliases,
      brief: message`Planning (aliases: nav, n).`,
    }),
    (request) => ({ tool: 'navigator' as const, request }),
  ),
  map(
    command(burokrat.name, burokratParser, {
      aliases: burokrat.aliases,
      brief: message`Static rules and repository admission (aliases: bur, b).`,
    }),
    (request) => ({ tool: 'burokrat' as const, request }),
  ),
  map(
    command(dash.name, dashParser, {
      aliases: dash.aliases,
      brief: message`Execution and operations (alias: d).`,
    }),
    (request) => ({ tool: 'dash' as const, request }),
  ),
);

/** One typed operation selected through its canonical namespace or an alias. */
export type Command = InferValue<typeof parser>;

/** Discovery printed, or a parsed operation; parsing never executes the operation. */
export type Invocation =
  { readonly kind: 'printed' } | { readonly kind: 'command'; readonly command: Command };

/** A refused command line, with the selected namespace's established usage status. */
export class UsageRefusal extends Error {
  override readonly name = 'UsageRefusal';

  constructor(
    message: string,
    readonly exitCode: 1 | 2 | 64,
  ) {
    super(message);
  }
}

function readExitCode(args: readonly string[]): 1 | 2 | 64 {
  // Proof: ignoring help's namespace fails the Burokrat and non-release Dash ops help-status cases.
  const words = args[0] === 'help' ? args.slice(1) : args;
  const tool = findNamespace(words[0]);
  if (tool === 'burokrat') return 1;
  if (tool !== 'dash') return 2;
  // Proof: returning 1 for ops fails "d ops unknown refuses before an operation".
  return words[1] === 'ops' && words[2] !== 'release' ? 64 : 1;
}

/**
 * Redact original argv tokens simultaneously, so one operand cannot alter another's match.
 * Token boundaries retain ordinary prose when an alias is a short word such as n.
 * Proof: bypassing replacement fails the inline-value process test; sequential quoted
 * replacement fails "redacts overlapping operands from the original diagnostic in one pass".
 */
function redactOperands(reason: string, args: readonly string[]): string {
  const candidates = new Set<string>();
  args.forEach((token) => {
    if (token.trim().length > 0) candidates.add(token);
    const equals = token.indexOf('=');
    if (token.startsWith('-') && equals >= 0) {
      const value = token.slice(equals + 1);
      if (value.trim().length > 0) candidates.add(value);
    }
  });
  const alternatives = [...candidates]
    .sort((left, right) => right.length - left.length)
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'));
  if (alternatives.length === 0) return reason;
  const operands = new RegExp(
    '(?<![\\p{L}\\p{N}_-])(?:' + alternatives.join('|') + ')(?![\\p{L}\\p{N}_-])',
    'gu',
  );
  return reason.replace(operands, '<argument>');
}

function formatRefusal(args: readonly string[], diagnostic: string): string {
  // Redact before extracting/normalizing: operands may contain Error:, newlines or terminal controls.
  // Proof: normalization first leaks the sentinel in the multiline and diagnostic-marker process tests.
  const redacted = redactOperands(diagnostic, args);
  const marker = redacted.lastIndexOf('Error: ');
  const reason = (marker < 0 ? redacted : redacted.slice(marker + 'Error: '.length))
    // Proof: disabling flag redaction and control stripping emits ESC in the malformed-flag process test.
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  // Proof: removing this guard fails "throws when the parser exits without its required diagnostic".
  if (reason.length === 0) throw new Error('the CLI parser refused without a diagnostic');
  const tool = findNamespace(args[args[0] === 'help' ? 1 : 0]);
  const prefix = tool ?? '<navigator|burokrat|dash>';
  return `usage: puni ${prefix} (${reason})`;
}

/** The controlled end of help/completion output, never an operation failure. */
class Printed extends Error {
  override readonly name = 'Printed';
}

/**
 * Parse the installed PUNI grammar with injected output. Discovery returns without an operation;
 * malformed input throws one plain {@link UsageRefusal} before any runtime is imported.
 *
 * Proof: importing a provider runtime, reading Date.now or calling fetch fails the
 * "loads no provider runtime, clock or network" subprocess discovery tests.
 *
 * @throws UsageRefusal for an invalid command line; trusted parser faults propagate unchanged.
 */
export function readInvocation(
  args: readonly string[],
  write: (chunk: string) => void,
): Invocation {
  let diagnostic = '';
  try {
    const parsed = run(parser, {
      programName: 'puni',
      args,
      stdout: write,
      stderr: (chunk) => {
        diagnostic += chunk;
      },
      // Proof: dropping onExit fails "owns the one-line process refusal" in a subprocess.
      onExit: (code) => {
        throw code === 0
          ? new Printed()
          : new UsageRefusal(formatRefusal(args, diagnostic), readExitCode(args));
      },
      // Proof: removing either override fails "keeps discovery bytes stable" under forced color/narrow columns.
      colors: false,
      maxWidth: 120,
      aboveError: 'none',
      help: 'both',
      completion: 'command',
    });
    // Proof: dropping this call fails the production-profile and account-outcomes coherence tests.
    if (parsed.tool === 'dash') {
      const refusal = findDashRefusal(parsed.request);
      if (refusal !== undefined)
        throw new UsageRefusal(`usage: puni dash (${refusal})`, readExitCode(args));
    }
    return { kind: 'command', command: parsed };
  } catch (cause) {
    // Proof: dropping the controlled exit fails "root help names canonical namespaces".
    if (cause instanceof Printed) return { kind: 'printed' };
    throw cause;
  }
}
