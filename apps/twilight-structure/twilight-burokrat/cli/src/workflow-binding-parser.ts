import {
  argument,
  command,
  constant,
  type InferValue,
  object,
  option,
  or,
  parseSync,
  string,
  text,
  type ValueParser,
} from '@optique/core';

/** The existing comma-list shorthand; parsing reads no filesystem or environment. */
const steps: ValueParser<'sync', readonly string[]> = {
  mode: 'sync',
  metavar: 'STEPS',
  placeholder: ['step'],
  format: (codes) => codes.join(','),
  parse(value) {
    const codes = value.split(',');
    if (
      value === '--steps' ||
      value === '--manifest' ||
      codes.some((code) => !/^\S+$/u.test(code)) ||
      new Set(codes).size !== codes.length
    )
      return { success: false, error: [text('expected unique nonempty step codes')] };
    return { success: true, value: codes };
  },
};
const path = () => string({ metavar: 'FILE', pattern: /^(?!-)(?!\s*$)[\s\S]+$/u });

/** One shared typed source grammar for both root dispatch and the exported command helper. */
export const workflowBindingParser = command(
  'workflow-binding',
  object({
    command: constant('validate workflow-binding'),
    file: argument(path()),
    catalogue: or(
      object({ kind: constant('steps'), steps: option('--steps', steps) }),
      object({ kind: constant('manifest'), file: option('--manifest', path()) }),
    ),
  }),
  { brief: [text('Validate a workflow binding and print its digest.')] },
);

/** Applicability input is selected exactly once, with typed paths or decoded step codes. */
export type WorkflowBindingRequest = InferValue<typeof workflowBindingParser>;

/** The complete grammar shown by the command module's refusal and root help. */
export const workflowBindingUsage =
  'usage: twilight-burokrat validate workflow-binding <file> (--steps <comma-list> | --manifest <file>)';

/** Parses the complete command without process exits, terminal output, filesystem or environment reads. */
export function parseWorkflowBindingRequest(args: readonly string[]) {
  return parseSync(command('validate', workflowBindingParser), args);
}
