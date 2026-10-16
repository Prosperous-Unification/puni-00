import { type } from '@shared/validation';

import { compareCanonicalText } from './content-manifest';

const ConformanceTarget = type({
  executor: "'nx:run-commands'",
  'cache?': 'false',
  'inputs?': type(["'default'", "'^production'"]).or(
    type(["'default'", "'^production'", "'{workspaceRoot}/apps/wbs/be-01/drizzle'"]),
  ),
  options: type({ command: 'string', cwd: 'string', forwardAllArgs: 'false' }).onUndeclaredKey(
    'reject',
  ),
}).onUndeclaredKey('reject');

/**
 * Decodes only the reviewed Nx envelope and exact literal Bun selectors, without reading candidate bytes.
 * SQLite's exact third input is dependency metadata; it never selects a test.
 * Preserves the existing level-facts refusal text and validation order for both callers.
 * @throws when the target envelope, project root, literal command or unique selection is unsupported.
 */
export function decodeConformanceSelection(targets: object, projectRoot: string): string[] {
  // Proof: TEST-AXES-102 caught envelope/cwd/SQLite-root, grammar/end, duplicate and prefix/order faults through Browser CLI.
  const target = 'test:conformance' in targets ? targets['test:conformance'] : undefined;
  // Proof: [TEST-AXES-082] failed when executor/cache/inputs/forwarding schemas were widened,
  // either closed-key rule or the required-shape check was removed, or cwd/root checks
  // were disabled. Invalid envelopes emitted facts or lost the named target refusal.
  if (
    !ConformanceTarget.allows(target) ||
    target.options.cwd !== projectRoot ||
    (target.inputs?.length === 3 && projectRoot !== 'libs/wbs/adapters/store-sqlite')
  )
    throw new Error('level facts Conformance target is unsupported');
  // Proof: restoring bare-filter parsing and literal binding let [TEST-AXES-083]'s
  // nested-decoy case emit incomplete facts. Removing prefix normalization failed
  // [TEST-AXES-081]'s successful literal-source inspection assertion.
  const pathPattern =
    '\\./(?:[A-Za-z0-9_][A-Za-z0-9._-]*/)*[A-Za-z0-9_][A-Za-z0-9._-]*\\.test\\.ts';
  const commandPattern = new RegExp(
    `^bun test (${pathPattern}(?: ${pathPattern})*) --timeout=[1-9][0-9]*(?![\\s\\S])`,
  );
  const command = commandPattern.exec(target.options.command);
  // Proof: disabling this guard lost [TEST-AXES-083]'s named command refusal; removing
  // the true end constraint let a trailing timeout suffix and a newline emit facts.
  if (command === null) throw new Error('level facts Conformance command is unsupported');
  const selectors = target.options.command.slice(
    'bun test '.length,
    target.options.command.lastIndexOf(' --timeout='),
  );
  // Proof: removing this sort reversed the two committed overlaps and failed [TEST-AXES-081].
  const files = selectors
    .split(' ')
    .map((path) => `${projectRoot}/${path.slice(2)}`)
    .sort(compareCanonicalText);
  // Proof: removing this comparison let duplicate selectors emit facts in [TEST-AXES-083].
  if (new Set(files).size !== files.length)
    throw new Error('level facts Conformance command is unsupported');
  return files;
}
