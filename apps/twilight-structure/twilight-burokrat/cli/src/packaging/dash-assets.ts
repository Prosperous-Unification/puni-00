import { posix } from 'node:path';

import ts from 'typescript';

import type { SourceFiles } from '../policy/source-files';

const dash = 'apps/twilight-structure/twilight-dash/cli/src/';
const format = dash + 'runs/sqlite/format.ts';
const renderer = dash + 'activation/units/render.ts';
const migrationNames = [
  '0001-run-store',
  '0002-runtime-authority',
  '0003-execution-history',
  '0004-runtime-recovery',
  '0006-runtime-write',
  '0005-identity-keys',
];
const sqlPaths = migrationNames.flatMap((name) =>
  ['migration.sql', 'down.sql'].map((file) => './migrations/' + name + '/' + file),
);
const templatePaths = ['observation.service.tmpl', 'observation.timer.tmpl'];

/**
 * Replace only the fourteen reviewed Dash text reads with captured UTF8 string literals.
 * The fixed module/call/import contract refuses drift, shadowing and reader aliases; no
 * captured code executes and unrelated expressions retain their original source bytes.
 * Fatal UTF8 preserves BOM, CRLF and Unicode; invalid UTF8 deliberately refuses instead
 * of inheriting readFileSync's replacement decoding. Regular captured files are required.
 * Callers must not globally rewrite emitted strings to normalize compiler metadata paths.
 * This is a package build transform, not runtime filesystem or release authentication.
 * Only captured paths, modes and bytes are consumed; source-kind admission belongs to its producer.
 */
export function embedDashAssets(source: SourceFiles, path: string, bytes: Uint8Array): Uint8Array {
  // Proof: c28-assets-fixed-module; injected fault failed `leaves other modules untouched without reading the captured asset roster`; restoration passed.
  if (path !== format && path !== renderer) return bytes;
  // Proof: c28-assets-module-utf8; Invalid UTF8 is inside an otherwise valid source comment; injected fault failed `refuses malformed UTF8 module bytes before source parsing`; restoration passed.
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const parsed = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const program = ts.createProgram(
    [path],
    { noLib: true, noResolve: true },
    {
      getSourceFile: (selected) => (selected === path ? parsed : undefined),
      getDefaultLibFileName: () => '',
      writeFile: () => {
        throw new Error('Dash asset binding unexpectedly requested emit');
      },
      getCurrentDirectory: () => '/',
      getDirectories: () => [],
      fileExists: (selected) => selected === path,
      readFile: (selected) => (selected === path ? text : undefined),
      getCanonicalFileName: (selected) => selected,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => '\n',
    },
  );
  // Proof: c28-assets-syntax; injected fault failed `refuses malformed-syntax before captured text substitution`; restoration passed.
  if (program.getSyntacticDiagnostics(parsed).length !== 0)
    throw new Error('Dash asset module has malformed syntax: ' + path);
  const checker = program.getTypeChecker();
  const declarations = new Map<string, ts.ImportSpecifier>();
  const imports = new Set(
    path === format
      ? ['node:crypto:createHash', 'node:fs:readFileSync']
      : ['node:fs:readFileSync', 'node:path:isAbsolute,join,resolve,sep', 'arktype:type'],
  );
  for (const statement of parsed.statements) {
    // Proof: c28-assets-reexport; injected fault failed `refuses export-loader outside the fixed module IO contract`; restoration passed.
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined)
      throw new Error('Dash asset module cannot re-export loaders: ' + path);
    if (!ts.isImportDeclaration(statement)) continue;
    const clause = statement.importClause,
      bindings = clause?.namedBindings;
    if (
      // Proof: c28-assets-import-shape; injected fault failed `refuses type-only-reader-import before captured text substitution`; restoration passed.
      statement.attributes !== undefined ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      clause === undefined ||
      clause.phaseModifier !== undefined ||
      clause.name !== undefined ||
      bindings === undefined ||
      !ts.isNamedImports(bindings) ||
      bindings.elements.some((binding) => binding.propertyName !== undefined || binding.isTypeOnly)
    )
      throw new Error('Dash asset module changed its fixed imports: ' + path);
    const signature =
      statement.moduleSpecifier.text +
      ':' +
      bindings.elements
        .map((binding) => binding.name.text)
        .toSorted()
        .join(',');
    // Proof: c28-assets-import-roster; injected fault failed `refuses wrapper-reader outside the fixed module IO contract`; restoration passed.
    if (!imports.delete(signature))
      throw new Error('Dash asset module has an unexpected or duplicate import: ' + signature);
    for (const declaration of bindings.elements)
      if (declaration.name.text === 'readFileSync' || declaration.name.text === 'join')
        declarations.set(declaration.name.text, declaration);
  }
  const reader = declarations.get('readFileSync'),
    join = declarations.get('join');
  // Proof: c28-assets-import-complete; injected fault failed `refuses missing-fixed-import before captured text substitution`; restoration passed.
  if (imports.size !== 0 || reader === undefined || (path === renderer && join === undefined))
    throw new Error('Dash asset module is missing its fixed imports or IO bindings: ' + path);
  const readerSymbol = checker.getSymbolAtLocation(reader.name),
    joinSymbol = join === undefined ? undefined : checker.getSymbolAtLocation(join.name);
  // Proof: c28-assets-symbol-presence; injected fault failed `refuses unresolved compiler binding identities rather than equating absent symbols`; restoration passed.
  if (readerSymbol === undefined || (path === renderer && joinSymbol === undefined))
    throw new Error('Dash asset module IO binding did not resolve: ' + path);
  const allowed = new Set<ts.Node>([reader.name, ...(join === undefined ? [] : [join.name])]);
  const expected = new Set(path === format ? sqlPaths : templatePaths);
  const edits: { readonly start: number; readonly end: number; readonly path: string }[] = [];
  const isImportMeta = (node: ts.Node, property: 'url' | 'dir'): boolean =>
    ts.isPropertyAccessExpression(node) &&
    node.name.text === property &&
    ts.isMetaProperty(node.expression) &&
    node.expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
    node.expression.name.text === 'meta';
  function inspect(node: ts.Node): void {
    // Proof: c28-assets-dynamic-loader; Extra dynamic fs/promises reader is independent of the fixed reader-symbol census; injected fault failed `refuses dynamic-reader outside the fixed module IO contract`; restoration passed.
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
      throw new Error('Dash asset module cannot dynamically import: ' + path);
    if (
      ts.isIdentifier(node) &&
      // Proof: c28-assets-ambient-loaders; injected fault failed `refuses bun-reader outside the fixed module IO contract` and 3 additional named controls; restoration passed.
      ['require', 'eval', 'Function', 'Bun', 'process', 'globalThis', 'global'].includes(node.text)
    )
      throw new Error('Dash asset module cannot add ambient loaders: ' + node.text);
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'readFileSync'
    ) {
      if (
        // Proof: c28-assets-reader-arguments; injected fault failed `refuses reader-type-arguments before captured text substitution`; restoration passed.
        checker.getSymbolAtLocation(node.expression) !== readerSymbol ||
        node.arguments.length !== 2 ||
        node.typeArguments !== undefined
      )
        throw new Error('Dash asset reader binding or arguments changed: ' + path);
      const location = node.arguments.at(0),
        encoding = node.arguments.at(1);
      if (
        // Proof: c28-assets-encoding; injected fault failed `refuses encoding source read contract drift` and 1 additional named controls; restoration passed.
        location === undefined ||
        encoding === undefined ||
        !ts.isStringLiteral(encoding) ||
        encoding.text !== 'utf8'
      )
        throw new Error('Dash asset reader encoding changed: ' + path);
      let relative: string;
      if (path === format) {
        if (
          // Proof: c28-assets-url-arguments; injected fault failed `refuses sql-url-type-arguments before captured text substitution`; restoration passed.
          !ts.isNewExpression(location) ||
          !ts.isIdentifier(location.expression) ||
          location.expression.text !== 'URL' ||
          checker.getSymbolAtLocation(location.expression) !== undefined ||
          location.typeArguments !== undefined ||
          location.arguments?.length !== 2
        )
          throw new Error('Dash SQL URL binding or arguments changed: ' + path);
        const name = location.arguments.at(0),
          base = location.arguments.at(1);
        if (
          // Proof: c28-assets-url-base; injected fault failed `refuses sql-base-expression before captured text substitution`; restoration passed.
          name === undefined ||
          !ts.isStringLiteral(name) ||
          base === undefined ||
          !isImportMeta(base, 'url')
        )
          throw new Error('Dash SQL path expression changed: ' + path);
        relative = name.text;
        allowed.add(location.expression);
      } else {
        if (
          // Proof: c28-assets-join-arguments; injected fault failed `refuses template-type-arguments before captured text substitution`; restoration passed.
          !ts.isCallExpression(location) ||
          !ts.isIdentifier(location.expression) ||
          location.expression.text !== 'join' ||
          checker.getSymbolAtLocation(location.expression) !== joinSymbol ||
          location.arguments.length !== 2 ||
          location.typeArguments !== undefined
        )
          throw new Error('Dash template path binding or arguments changed: ' + path);
        const base = location.arguments.at(0),
          name = location.arguments.at(1);
        if (
          // Proof: c28-assets-join-base; injected fault failed `refuses template-base-expression before captured text substitution`; restoration passed.
          base === undefined ||
          !isImportMeta(base, 'dir') ||
          name === undefined ||
          !ts.isStringLiteral(name)
        )
          throw new Error('Dash template path expression changed: ' + path);
        relative = name.text;
        allowed.add(location.expression);
      }
      // Proof: c28-assets-read-roster; injected fault failed `refuses duplicate-call source read contract drift`; restoration passed.
      if (!expected.delete(relative))
        throw new Error('Dash asset read is unexpected or duplicated: ' + relative);
      allowed.add(node.expression);
      edits.push({
        start: node.getStart(parsed),
        end: node.end,
        path: posix.join(posix.dirname(path), relative),
      });
    }
    ts.forEachChild(node, inspect);
  }
  inspect(parsed);
  // Proof: c28-assets-read-complete; injected fault failed `refuses missing-call source read contract drift`; restoration passed.
  if (expected.size !== 0)
    throw new Error('Dash asset module is missing fixed reads: ' + [...expected].join(', '));
  function inspectBindings(node: ts.Node): void {
    if (
      ts.isIdentifier(node) &&
      (node.text === 'readFileSync' || node.text === 'URL' || node.text === 'join') &&
      !allowed.has(node)
    ) {
      const property =
        node.text === 'join' &&
        ts.isPropertyAccessExpression(node.parent) &&
        node.parent.name === node;
      // Proof: c28-assets-reference-census; injected fault failed `refuses reader-reference-alias before captured text substitution` and 1 additional named controls; restoration passed.
      if (!property)
        throw new Error('Dash asset IO binding has an unexpected reference: ' + node.text);
    }
    ts.forEachChild(node, inspectBindings);
  }
  inspectBindings(parsed);
  const entries = new Map(source.readSnapshot().entries.map((entry) => [entry.path, entry]));
  let transformed = text;
  for (const edit of edits.toReversed()) {
    const entry = entries.get(edit.path);
    // Proof: c28-assets-regular; injected fault failed `refuses symlink captured asset before a usable bundle`; restoration passed.
    if (entry === undefined || (entry.mode !== '100644' && entry.mode !== '100755'))
      throw new Error('Dash asset is not a captured regular file: ' + edit.path);
    // Proof: c28-assets-text-utf8; injected fault failed `refuses invalid-utf8 captured asset before a usable bundle`; restoration passed.
    // Proof: c28-assets-text-bom; injected fault failed `preserves BOM CRLF Unicode and compiler-normalization canaries in the final built artifact`; restoration passed.
    const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      source.readFile(edit.path),
    );
    transformed =
      transformed.slice(0, edit.start) + JSON.stringify(content) + transformed.slice(edit.end);
  }
  return Buffer.from(transformed);
}
