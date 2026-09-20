import ts from 'typescript';

/** The artifact kinds Twilight Bureaucrat holds a template for in slice B5. */
export type TemplateId = 'feature-service' | 'module' | 'repository' | 'resource-service';

/** Whether a template describes one file or a whole module directory. */
export type TemplateSubject = 'file' | 'directory';

/** The kind a file name declares, by the suffix rule K1 asks for. */
export type FileKind = 'feature' | 'repository' | 'resource';

/**
 * What one requirement checks, as data the registry states and the verifier consumes.
 *
 * The verifier has exactly one handler per member and reads nothing else, so a template that drops
 * a requirement drops its check and a template that states one gains it. That is what keeps the
 * record Twilight Dash instantiates and the record Twilight Bureaucrat verifies the same record.
 */
export type TemplateConstraint =
  | { readonly kind: 'name-suffix'; readonly suffix: string }
  | { readonly kind: 'one-kind-per-file' }
  | { readonly kind: 'declares-one'; readonly tag: string }
  | { readonly kind: 'imports-no-kind'; readonly kinds: readonly FileKind[] }
  | { readonly kind: 'sibling-test' }
  | { readonly kind: 'required-file'; readonly path: string }
  | { readonly kind: 'index-sections'; readonly path: string; readonly sections: readonly string[] }
  | { readonly kind: 'kind-file-present' }
  | { readonly kind: 'test-present' }
  | { readonly kind: 'files-stay-in-module'; readonly allowedDirectories: readonly string[] }
  | { readonly kind: 'kind-files-follow-their-template' };

/**
 * One file a template prescribes. `content` is the skeleton Twilight Dash instantiates; it carries
 * `<name>` and `<Name>` placeholders and is therefore not valid TypeScript until it is filled in.
 */
export interface TemplateFile {
  /** The path inside the artifact, with `<name>` standing for the module's name. */
  readonly path: string;
  readonly required: boolean;
  readonly content: string;
}

/** One checkable statement about a generated artifact. */
export interface TemplateRequirement {
  /** Stable and quoted in findings: `module.contract`, `feature.capability`. */
  readonly id: string;
  readonly statement: string;
  /** The rules of the code organization design this requirement partly serves: `K1`, `K9`. */
  readonly rules: readonly string[];
  /** What the verifier checks for this requirement. */
  readonly constraint: TemplateConstraint;
}

export interface Template {
  readonly id: TemplateId;
  /** The version a consumer policy will pin. Bumped whenever a requirement or a skeleton changes. */
  readonly version: string;
  readonly subject: TemplateSubject;
  readonly generates: string;
  readonly files: readonly TemplateFile[];
  readonly requirements: readonly TemplateRequirement[];
}

/** What the verifier saw. A finding is never downgraded by a mode: templates carry no policy. */
export interface TemplateFinding {
  readonly requirementId: string;
  /** A candidate-relative path. */
  readonly path: string;
  readonly message: string;
}

export interface TemplateVerification {
  readonly schemaVersion: 1;
  readonly templateId: TemplateId;
  readonly templateVersion: string;
  /** The candidate-relative file or directory that was judged. */
  readonly subject: string;
  readonly conforms: boolean;
  readonly findings: readonly TemplateFinding[];
  /**
   * Always false: a verification binds no evidence, no authority and no validator identity, exactly
   * as a rule verdict does not. Only `lint-ci` certifies.
   */
  readonly certifies: false;
}

/** One candidate file the verifier judges, with its text already decoded. */
export interface ArtifactFile {
  /** Candidate-relative, as the candidate snapshot spells it. */
  readonly path: string;
  /** The path inside the artifact: the name under a module directory, the file name for a file. */
  readonly relativePath: string;
  readonly text: string;
}

const KindNames: readonly FileKind[] = ['feature', 'repository', 'resource'];

export function fileNameOf(path: string): string {
  const separator = path.lastIndexOf('/');
  return separator === -1 ? path : path.slice(separator + 1);
}

/**
 * Every kind a file name declares, read from its dot-separated segments. Two declarations are a K1
 * violation, so the list is returned whole rather than reduced to the first match. A test file
 * declares the kind of the file it proves: `browser-storage.repository.test.ts` is a repository.
 */
export function declaredKinds(path: string): FileKind[] {
  const name = fileNameOf(path);
  const base = name.endsWith('.test.ts')
    ? name.slice(0, -'.test.ts'.length)
    : name.endsWith('.ts')
      ? name.slice(0, -'.ts'.length)
      : name;
  const segments = new Set(base.split('.').slice(1));
  return KindNames.filter((kind) => segments.has(kind));
}

const scanner = new Bun.Transpiler({ loader: 'ts' });

/**
 * Every import specifier the file states, parsed rather than matched.
 *
 * `Bun.Transpiler.scanImports` is the scanner `resolveValidatorArtifactPaths` already trusts in
 * `policy/trust.ts`. It reports a side-effect import and a re-export, which a regular expression
 * over `from '…'` misses, and it ignores import text inside a comment or a string, which such an
 * expression reports. **A purely type-only import is elided by the transpiler and is therefore
 * invisible here**; a type-only dependency on a repository is left to the K3 graph rule, which
 * reads the type graph. Observed on 2026-09-20.
 * @throws Error naming the file when it does not parse.
 */
export function importSpecifiers(text: string, path: string): string[] {
  try {
    return scanner.scanImports(text).map((record) => record.path);
  } catch (cause) {
    // Proof: returning no imports here made `refuses a file that does not parse` lose its
    // `cannot scan the imports` refusal and receive empty stderr. Observed 2026-09-20.
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`cannot scan the imports of ${path}: ${detail}`, { cause });
  }
}

/**
 * Returns actual line comments in source order, including comments inside template interpolations.
 * Traversing tokens includes comments in otherwise empty blocks; literal text is never scanned.
 */
export function lineComments(text: string): string[] {
  const source = ts.createSourceFile(
    'declarations.ts',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const comments = new Map<number, string>();

  function collect(ranges: readonly ts.CommentRange[] | undefined): void {
    for (const range of ranges ?? []) {
      if (range.kind === ts.SyntaxKind.SingleLineCommentTrivia) {
        comments.set(range.pos, text.slice(range.pos, range.end));
      }
    }
  }

  function visit(node: ts.Node): void {
    collect(ts.getLeadingCommentRanges(text, node.getFullStart()));
    collect(ts.getTrailingCommentRanges(text, node.getEnd()));
    for (const child of node.getChildren(source)) visit(child);
  }

  visit(source);
  return [...comments].sort(([left], [right]) => left - right).map(([, comment]) => comment);
}

/**
 * Every value a declaration tag states, one per line comment that is exactly the declaration.
 *
 * The tag is a line comment, `// @capability plan-editing`, and deliberately not a JSDoc tag:
 * `jsdoc/check-tag-names` refuses an unknown tag inside a JSDoc block, observed on 2026-09-20 as
 * `Invalid JSDoc tag name "capability"`. A line comment is a declaration, not symbol knowledge, so
 * it belongs beside the module index comment rather than in the JSDoc rule R3 governs. Only a real
 * line comment counts: see {@link lineComments}.
 */
export function taggedValues(text: string, tag: string): string[] {
  const declaration = new RegExp(`^//[ \\t]*@${tag}[ \\t]+(\\S+)$`);
  const values: string[] = [];
  // Proof: scanning raw source with a multiline regular expression made `counts a declaration
  // tag only when it is a real line comment` report 2 tags instead of 0. Observed 2026-09-20.
  for (const comment of lineComments(text)) {
    const match = declaration.exec(comment.trimEnd());
    if (match !== null) values.push(match[1]);
  }
  return values;
}
