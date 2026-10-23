import { SaxesParser } from 'saxes';

/** What one `<testcase>` of a JUnit report says happened. */
export type CaseOutcome = 'passed' | 'skipped' | 'failed';

/** One `<testcase>` of a JUnit report. */
export interface JUnitCase {
  readonly name: string;
  /** The path the runner named the file with, relative to the run's working directory. */
  readonly file: string;
  readonly outcome: CaseOutcome;
}

interface ParsedJUnitCase extends JUnitCase {
  readonly suites: readonly (string | undefined)[];
}

/** One Bun case with ordered describe ancestry, excluding its outer source-file suite. */
export interface BunJUnitCase extends JUnitCase {
  readonly titlePath: readonly string[];
}

/** The elements Bun writes inside a `<testcase>`, and what each one says happened. */
const OUTCOME_ELEMENT = new Map<string, CaseOutcome>([
  ['error', 'failed'],
  ['failure', 'failed'],
  ['skipped', 'skipped'],
]);

/**
 * Every test case of one JUnit report.
 *
 * Well-formedness is `saxes`'s job, not this reader's: a hand-written tokenizer
 * twice accepted malformed reports — a garbage declaration, a duplicate
 * attribute, an unterminated attribute value, a malformed comment, an unknown
 * entity, CDATA outside the root — and manufactured a passing citation from
 * each, and a coverage ledger that cannot fail is worse than none. `saxes`
 * parses XML 1.0 strictly and streaming; everything it reports through its
 * `error` event is refused here with its own message and position.
 *
 * What is left is the STRUCTURE of a Bun JUnit report, which no XML parser
 * knows: a `testsuites` root, `testcase` directly inside a `testsuite`, an
 * outcome element directly inside its `testcase` and nothing else there, and a
 * `name` and a `file` on every case. Namespaces are refused rather than
 * resolved — the parser runs with `xmlns: false`, so a prefix binds to nothing
 * and a qualified `x:failure` would otherwise read as an unknown element and
 * turn a failing case into a passing one.
 *
 * Its limits, stated: it trusts `saxes` for well-formedness and for entity
 * expansion; it does not validate the JUnit schema beyond the rules above, so an
 * unknown element outside a `testcase` is accepted; and a document with no XML
 * declaration at all is well-formed XML and is accepted.
 *
 * @throws when the document is not well-formed XML 1.0, has a root other than
 * `testsuites`, carries a doctype, a CDATA section or a processing instruction,
 * uses a qualified name or an `xmlns` attribute, puts a `testcase` outside a
 * `testsuite`, puts an outcome element outside a `testcase`, puts any other
 * element inside a `testcase`, holds a `testcase` with no `name` or no `file`,
 * repeats an outcome element (including the same kind), or holds no test case at all.
 */
function parseJUnitReport(xml: string): readonly ParsedJUnitCase[] {
  const parser = new SaxesParser({ xmlns: false, fileName: 'the JUnit report' });
  const cases: ParsedJUnitCase[] = [];
  const suites: (string | undefined)[] = [];
  /** The element names still open, outermost first. */
  const open: string[] = [];
  let malformed: Error | undefined;
  let hasOutcome = false;

  parser.on('error', (cause) => {
    malformed ??= cause;
  });
  // Proof (D-4): replacing this handler with a no-op failed "refuses a document type declaration"
  // because the report returned one passing case instead of throwing (2026-09-20).
  parser.on('doctype', () => {
    throw parser.makeError('has a document type declaration');
  });
  // Proof (D-5): replacing this handler with a no-op failed "refuses a CDATA section" because
  // the report did not throw; the outside-root CDATA case failed too (2026-09-20).
  parser.on('cdata', () => {
    throw parser.makeError('has a CDATA section');
  });
  // Proof (D-6): replacing this handler with a no-op failed "refuses a processing instruction
  // after the declaration" because the report returned one passing case (2026-09-20).
  parser.on('processinginstruction', (instruction) => {
    throw parser.makeError(`has a processing instruction <?${instruction.target}?>`);
  });
  parser.on('opentag', (tag) => {
    // Proof (D-7): deleting this guard failed "refuses a namespaced element name" with the later
    // unsupported-element refusal instead of the qualified-name refusal (2026-09-20).
    if (tag.name.includes(':')) {
      throw parser.makeError(`has a qualified element name <${tag.name}>`);
    }
    // A Map and not `tag.attributes[…]`: `noUncheckedIndexedAccess` is off, so an
    // index read types as `string` and the absent-attribute tests below would be
    // `no-unnecessary-condition` lint errors rather than the guards they are.
    const attributes = new Map(Object.entries(tag.attributes));
    for (const attribute of attributes.keys()) {
      // Proof (D-8): deleting this guard failed "refuses an xmlns attribute" because the report
      // returned one passing case instead of throwing (2026-09-20).
      if (attribute === 'xmlns') {
        throw parser.makeError(`has an xmlns attribute on <${tag.name}>`);
      }
      // Proof (D-9): deleting this guard failed "refuses a namespaced attribute name" because the
      // report returned one passing case instead of throwing (2026-09-20).
      if (attribute.includes(':')) {
        throw parser.makeError(`has a qualified attribute name ${attribute} on <${tag.name}>`);
      }
    }
    const parent = open.at(-1);
    // Proof (D-10): deleting this guard failed "refuses a report whose root is not testsuites"
    // with the later testcase-parent refusal instead of the root refusal (2026-09-20).
    if (parent === undefined && tag.name !== 'testsuites') {
      throw parser.makeError(`root is <${tag.name}>, not <testsuites>`);
    }
    // Proof (D-11): deleting this guard failed "refuses a testcase whose parent is not a
    // testsuite" because the report returned one passing case; the nested testcase failed too
    // (2026-09-20).
    if (tag.name === 'testcase' && parent !== 'testsuite') {
      throw parser.makeError(
        `holds a <testcase> inside <${parent ?? 'nothing'}>, not inside <testsuite>`,
      );
    }
    // Proof (D-12): deleting this guard failed "refuses an outcome element outside a testcase"
    // with the later no-testcase refusal instead of the parent refusal (2026-09-20).
    if (OUTCOME_ELEMENT.has(tag.name) && parent !== 'testcase') {
      throw parser.makeError(
        `holds a <${tag.name}> inside <${parent ?? 'nothing'}>, not inside <testcase>`,
      );
    }
    // Proof (D-13): deleting this guard failed both "refuses an unsupported element inside a
    // testcase" and "refuses a testcase hidden inside an outcome element" because each report
    // returned a passing case instead of throwing (2026-09-20).
    if (open.includes('testcase') && !OUTCOME_ELEMENT.has(tag.name)) {
      throw parser.makeError(`holds an unsupported <${tag.name}> inside a <testcase>`);
    }
    if (tag.name === 'testsuite') suites.push(attributes.get('name'));
    if (tag.name === 'testcase') {
      const title = attributes.get('name');
      // Proof (D-14): deleting this guard failed "refuses a testcase that names no test" with a
      // returned case whose name was undefined (2026-09-20).
      if (title === undefined) throw parser.makeError('holds a <testcase> with no name');
      const file = attributes.get('file');
      // Proof (D-15): deleting this guard failed "refuses a testcase that names no file" with a
      // returned case whose file was undefined (2026-09-20).
      if (file === undefined) throw parser.makeError('holds a <testcase> with no file');
      hasOutcome = false;
      cases.push({ name: title, file, outcome: 'passed', suites: [...suites] });
    }
    // The owner is the case last pushed: an outcome element's parent is a
    // `testcase` (checked above) and `testcase` elements cannot nest, so the
    // enclosing case is the most recent one.
    const outcome = OUTCOME_ELEMENT.get(tag.name);
    // Proof (D-2): deleting this assignment failed the real-Bun-report case because its skipped
    // and failed cases were returned as passed; both coverage-outcome cases failed too
    // (2026-09-20).
    if (outcome !== undefined) {
      // Proof: removing this guard accepted TEST-AXES-151's repeated/conflicting outcomes and the devsync regression.
      if (hasOutcome) throw parser.makeError('has a duplicate outcome in a testcase');
      hasOutcome = true;
      cases[cases.length - 1] = { ...cases[cases.length - 1], outcome };
    }
    open.push(tag.name);
  });
  // Proof (D-17): replacing this handler with a no-op failed the passing-citation case because a
  // later testcase appeared inside the still-open prior testcase; four other cases failed too
  // (2026-09-20).
  parser.on('closetag', () => {
    if (open.at(-1) === 'testsuite') suites.pop();
    open.pop();
  });

  parser.write(xml).close();
  // Proof (D-3): deleting this rethrow failed the second-root case because one passing case was
  // returned; nineteen other malformed-document cases failed too (2026-09-20).
  if (malformed !== undefined) throw malformed;
  // Proof (D-16): deleting this guard failed "refuses a report that holds no testcase" because
  // the reader returned an empty array (2026-09-20).
  // Proof (E-4): an otherwise valid API report with no testcase made the coverage command refuse
  // it with `the JUnit report:1:0: holds no testcase` (2026-09-20).
  if (cases.length === 0) throw parser.makeError('holds no testcase');
  return cases;
}

/** Existing devsync case shape; describe ancestry remains available through {@link readBunJUnitReport}.
 * @throws when XML structure or outcomes are malformed, including repeated outcome elements.
 */
export function readJUnitReport(xml: string): readonly JUnitCase[] {
  return parseJUnitReport(xml).map(({ name, file, outcome }) => ({ name, file, outcome }));
}

/** Full Bun title identity, preserving nested suite names without parsing classname delimiters.
 * @throws when XML is malformed or a nested suite omits its required Bun describe name.
 */
export function readBunJUnitReport(xml: string): readonly BunJUnitCase[] {
  return parseJUnitReport(xml).map(({ name, file, outcome, suites }) => {
    // Proof: dropping ancestry collapsed TEST-AXES-150's real nested same-leaf cases.
    const ancestry = suites.slice(1).map((suite) => {
      // Proof: removing this guard lost TEST-AXES-151's named absent-suite refusal; canonical serialization refused later.
      if (suite === undefined) throw new Error('Bun JUnit nested suite name is absent');
      return suite;
    });
    return { name, file, outcome, titlePath: [...ancestry, name] };
  });
}
