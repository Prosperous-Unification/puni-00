import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'bun:test';
import ts from 'typescript';

const coreRoot = fileURLToPath(new URL('../..', import.meta.url));
const coreSource = `${coreRoot}src/`;
const configPath = `${coreRoot}tsconfig.lib.json`;

/**
 * One owner a group of files may not reach, and where its contracts live now.
 *
 * Each row is a preparation of
 * `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md`: the
 * first two are preparations 4 and 5 (no use case imports Authentication or the
 * HTTP endpoint for a principal); the third and fourth are the same rule
 * re-scoped to the Bounded replay sweep module's own directory once its
 * `retention-timer.ts` and `retention-sweep.ts` (now
 * `bounded-replay-sweep.feature.ts`) moved out of `use-cases/` and stopped
 * being covered by the first two rows' `path.startsWith('use-cases/')` — a
 * directory row rather than the single-file one this replaces, since the
 * module also holds `retention-job.ts`, which never carried a principal type
 * but should not gain one unnoticed either; the fifth is preparation 3 (Plan
 * document reads markers through a port, not through the Calendar marker
 * resource).
 *
 * Proof: importing `type { Identity } from '../../http/endpoint'` into the
 * module's `retention-timer.ts` failed this suite with both a module-specifier
 * and an identifier violation — `"module/bounded-replay-sweep/retention-timer.ts:
 * '../../http/endpoint' reaches http/endpoint.ts"` and `"…: Identity reaches
 * http/endpoint.ts"` — against an expected empty array, 0 pass and 1 fail
 * (2026-09-23).
 * Proof: importing `type { AuthenticatedUser } from '../../service/auth.service'`
 * into the same file, independently, failed this suite with only
 * `"module/bounded-replay-sweep/retention-timer.ts: '../../service/auth.service'
 * reaches service/auth.service.ts"` — no `http/endpoint.ts` entry — against an
 * expected empty array, 0 pass and 1 fail (2026-09-23). Deleting the new
 * `service/auth.service.ts` row while leaving the HTTP-endpoint fault above in
 * place leaves that fault's two violations unchanged, so this second fault is
 * what proves the Authentication row independently.
 *
 * The sixth and seventh rows are preparation 4's other half re-scoped to the
 * Realtime module's own directory once `replay.ts` (now `realtime.feature.ts`)
 * moved out of `use-cases/` and stopped being covered by the first two rows'
 * `path.startsWith('use-cases/')` — a new directory row rather than a renamed
 * single-file one, since no row ever targeted a single Realtime file, and the
 * module also holds `gateway-broadcaster.ts`, `replay-buffer.ts` and
 * `replay-orchestrator.ts`, none of which carried a principal type before but
 * should not gain one unnoticed either.
 *
 * Proof: importing `type { Identity } from '../../http/endpoint'` into the
 * Realtime module's `gateway-broadcaster.ts` failed this suite with both a
 * module-specifier and an identifier violation — `"module/realtime/gateway-broadcaster.ts:
 * '../../http/endpoint' reaches http/endpoint.ts"` and `"…: Identity reaches
 * http/endpoint.ts"` — against an expected empty array, 0 pass and 1 fail
 * (2026-09-23).
 * Proof: importing `type { AuthenticatedUser } from '../../service/auth.service'`
 * into the same file, independently, failed this suite with only
 * `"module/realtime/gateway-broadcaster.ts: '../../service/auth.service'
 * reaches service/auth.service.ts"` — no `http/endpoint.ts` entry — against an
 * expected empty array, 0 pass and 1 fail (2026-09-23). Deleting the new
 * Realtime `service/auth.service.ts` row while leaving the Realtime
 * HTTP-endpoint fault above in place leaves that fault's two violations
 * unchanged, so this second fault is what proves the Realtime Authentication
 * row independently.
 *
 * The eighth and ninth rows are preparation 4's other half re-scoped to the
 * Plan import module's own directory once `import.service.ts` (now
 * `plan-import.feature.ts`) moved out of `service/` — a directory row, since
 * the module also holds `prepare-import.ts`, which never carried a principal
 * type before but should not gain one unnoticed either. Neither of these two
 * files ever imported `service/auth.service.ts` or `http/endpoint.ts` before
 * this move; the row is added for the same reason the other module rows were,
 * not because a violation existed.
 *
 * Proof (2026-09-23): importing `type { Identity } from '../../http/endpoint'`
 * into `plan-import.feature.ts` failed this suite with both the module-specifier
 * and `Identity` violations reaching `http/endpoint.ts` (0 pass, 1 fail).
 * Proof (2026-09-23): independently importing `type { AuthenticatedUser } from
 * '../../service/auth.service'` into the same file failed this suite with only
 * the `service/auth.service.ts` violation and no `http/endpoint.ts` entry
 * (0 pass, 1 fail).
 *
 * The tenth through thirteenth rows are the same rule re-scoped to
 * Authentication's own new real file path: once `auth.service.ts` moved to
 * `module/authentication/authentication.feature.ts`, the four existing rows
 * above (targeting the compatibility shim `service/auth.service.ts`) no
 * longer catch a direct import of the module's own real path, only an import
 * that still goes through the shim. The fourteenth row is preparation 4's own
 * half re-scoped to Authentication's own directory (it must not import the
 * HTTP endpoint for a principal either).
 *
 * Proof (2026-09-23): importing `type { AuthenticatedUser } from
 * '../module/authentication/authentication.feature'` into `use-cases/run-command-batch.ts`
 * failed this suite with `"use-cases/run-command-batch.ts:
 * '../module/authentication/authentication.feature' reaches
 * module/authentication/authentication.feature.ts"` (0 pass, 1 fail) — reproduced
 * with the four pre-existing `service/auth.service.ts` rows unchanged, proving the gap
 * they leave.
 * Proof (2026-09-23): independently importing `type { AuthenticatedUser } from
 * '../authentication/authentication.feature'` into
 * `module/bounded-replay-sweep/retention-timer.ts` failed this suite with
 * `"module/bounded-replay-sweep/retention-timer.ts: '../authentication/authentication.feature'
 * reaches module/authentication/authentication.feature.ts"` (0 pass, 1 fail).
 * Proof (2026-09-23): independently importing the same type into
 * `module/realtime/gateway-broadcaster.ts` failed this suite with
 * `"module/realtime/gateway-broadcaster.ts: '../authentication/authentication.feature' reaches
 * module/authentication/authentication.feature.ts"` (0 pass, 1 fail).
 * Proof (2026-09-23): independently importing the same type into
 * `module/plan-import/plan-import.feature.ts` failed this suite with
 * `"module/plan-import/plan-import.feature.ts: '../authentication/authentication.feature'
 * reaches module/authentication/authentication.feature.ts"` (0 pass, 1 fail).
 * Proof (2026-09-23): importing `type { Identity } from '../../http/endpoint'` into
 * `module/authentication/authentication.feature.ts` itself failed this suite with both a
 * module-specifier and an identifier violation — `"module/authentication/authentication.feature.ts:
 * '../../http/endpoint' reaches http/endpoint.ts"` and `"…: Identity reaches http/endpoint.ts"`
 * (0 pass, 1 fail).
 *
 * The fifteenth through seventeenth rows are the same three rules re-scoped
 * to the Saved plans module's own directory once `save-plan.ts` moved out of
 * `use-cases/` and stopped being covered by the first two rows'
 * `path.startsWith('use-cases/')`: the module's own use case takes its
 * principal type from `@wbs/contracts`, never from Authentication or the HTTP
 * endpoint, and `saved-plans.feature.ts`, `saved-plan-integrity.ts` and
 * `saved-plan-schedule.ts` never did either. The Authentication row is spelt
 * twice, once for the compatibility shim and once for the module's real path,
 * because the module-specifier route does not follow a shim's re-export.
 *
 * Proof (2026-09-23): prepending the bare import `import '../../service/auth.service';`
 * to `module/saved-plans/save-plan.ts` failed this suite with exactly one violation,
 * `"module/saved-plans/save-plan.ts: '../../service/auth.service' reaches
 * service/auth.service.ts"` (0 pass, 1 fail).
 * Proof (2026-09-23): independently prepending
 * `import '../authentication/authentication.feature';` to the same file failed this suite
 * with exactly one violation, `"module/saved-plans/save-plan.ts:
 * '../authentication/authentication.feature' reaches
 * module/authentication/authentication.feature.ts"` (0 pass, 1 fail).
 * Proof (2026-09-23): independently prepending `import '../../http/endpoint';` to the same
 * file failed this suite with exactly one violation, `"module/saved-plans/save-plan.ts:
 * '../../http/endpoint' reaches http/endpoint.ts"` (0 pass, 1 fail).
 *
 * The eighteenth row is the fifth row re-scoped to the Plan document module's
 * own directory once `plan-document.ts` moved to
 * `module/plan-document/plan-document.resource.ts`: the fifth row's
 * `path === 'service/plan-document.ts'` now names only the compatibility shim,
 * so the moved resource, and every other file of its module, would otherwise
 * be free to read markers through the Calendar marker resource again.
 *
 * Proof (2026-09-23): prepending the bare import
 * `import '../../service/calendar-marker.service';` to
 * `module/plan-document/plan-document.resource.ts` failed this suite with exactly one
 * violation, `"module/plan-document/plan-document.resource.ts:
 * '../../service/calendar-marker.service' reaches service/calendar-marker.service.ts"`
 * (0 pass, 1 fail); with this row deleted the same import left the suite passing (1 pass).
 *
 * The nineteenth row follows the Calendar marker resource into its own module:
 * once `service/calendar-marker.service.ts` became a compatibility re-export of
 * `module/calendar-marker/calendar-marker.resource.ts`, a `CalendarMarkerService`
 * named through the `@wbs/core` barrel resolves to the moved file without
 * passing through the shim, so the fifth and eighteenth rows stopped seeing it.
 *
 * Proof (2026-09-24): prepending `import type { CalendarMarkerService } from '../../index';`
 * and `export type BarrelMarkers = CalendarMarkerService;` to
 * `module/plan-document/plan-document.resource.ts` failed this suite with exactly one
 * violation, `"module/plan-document/plan-document.resource.ts: CalendarMarkerService
 * reaches module/calendar-marker/calendar-marker.resource.ts"` (0 pass, 1 fail); with this
 * row deleted the same two lines left the suite passing (1 pass), and before the move they
 * were reported against `service/calendar-marker.service.ts`.
 *
 * The twentieth through twenty-second rows are the first three rules
 * re-scoped to the Plan commands module's own directory once
 * `run-command-batch.ts` moved out of `use-cases/` and stopped being covered
 * by the first two rows' `path.startsWith('use-cases/')`: the module's own use
 * case takes its principal type from `@wbs/contracts`, never from
 * Authentication or the HTTP endpoint, and `plan-commands.feature.ts` never
 * did either. The Authentication row is spelt twice, once for the
 * compatibility shim and once for the module's real path, as for Saved plans.
 *
 * Proof (2026-09-24): with the move made and these three rows absent, prepending the bare
 * import `import '../../service/auth.service';` to `module/plan-commands/run-command-batch.ts`
 * left this suite passing (1 pass). With the rows, the same import failed it with exactly one
 * violation, `"module/plan-commands/run-command-batch.ts: '../../service/auth.service' reaches
 * service/auth.service.ts"` (0 pass, 1 fail).
 * Proof (2026-09-24): independently prepending
 * `import '../authentication/authentication.feature';` to the same file failed this suite
 * with exactly one violation, `"module/plan-commands/run-command-batch.ts:
 * '../authentication/authentication.feature' reaches
 * module/authentication/authentication.feature.ts"` (0 pass, 1 fail).
 * Proof (2026-09-24): independently prepending `import '../../http/endpoint';` to the same
 * file failed this suite with exactly one violation, `"module/plan-commands/run-command-batch.ts:
 * '../../http/endpoint' reaches http/endpoint.ts"` (0 pass, 1 fail).
 */
const routes = [
  { reaches: 'service/auth.service.ts', from: (path: string) => path.startsWith('use-cases/') },
  { reaches: 'http/endpoint.ts', from: (path: string) => path.startsWith('use-cases/') },
  {
    reaches: 'service/auth.service.ts',
    from: (path: string) => path.startsWith('module/bounded-replay-sweep/'),
  },
  {
    reaches: 'http/endpoint.ts',
    from: (path: string) => path.startsWith('module/bounded-replay-sweep/'),
  },
  {
    reaches: 'service/calendar-marker.service.ts',
    from: (path: string) => path === 'service/plan-document.ts',
  },
  {
    reaches: 'service/auth.service.ts',
    from: (path: string) => path.startsWith('module/realtime/'),
  },
  {
    reaches: 'http/endpoint.ts',
    from: (path: string) => path.startsWith('module/realtime/'),
  },
  {
    reaches: 'service/auth.service.ts',
    from: (path: string) => path.startsWith('module/plan-import/'),
  },
  {
    reaches: 'http/endpoint.ts',
    from: (path: string) => path.startsWith('module/plan-import/'),
  },
  {
    reaches: 'module/authentication/authentication.feature.ts',
    from: (path: string) => path.startsWith('use-cases/'),
  },
  {
    reaches: 'module/authentication/authentication.feature.ts',
    from: (path: string) => path.startsWith('module/bounded-replay-sweep/'),
  },
  {
    reaches: 'module/authentication/authentication.feature.ts',
    from: (path: string) => path.startsWith('module/realtime/'),
  },
  {
    reaches: 'module/authentication/authentication.feature.ts',
    from: (path: string) => path.startsWith('module/plan-import/'),
  },
  {
    reaches: 'http/endpoint.ts',
    from: (path: string) => path.startsWith('module/authentication/'),
  },
  {
    reaches: 'service/auth.service.ts',
    from: (path: string) => path.startsWith('module/saved-plans/'),
  },
  {
    reaches: 'module/authentication/authentication.feature.ts',
    from: (path: string) => path.startsWith('module/saved-plans/'),
  },
  {
    reaches: 'http/endpoint.ts',
    from: (path: string) => path.startsWith('module/saved-plans/'),
  },
  {
    reaches: 'service/calendar-marker.service.ts',
    from: (path: string) => path.startsWith('module/plan-document/'),
  },
  {
    reaches: 'module/calendar-marker/calendar-marker.resource.ts',
    from: (path: string) => path.startsWith('module/plan-document/'),
  },
  {
    reaches: 'service/auth.service.ts',
    from: (path: string) => path.startsWith('module/plan-commands/'),
  },
  {
    reaches: 'module/authentication/authentication.feature.ts',
    from: (path: string) => path.startsWith('module/plan-commands/'),
  },
  {
    reaches: 'http/endpoint.ts',
    from: (path: string) => path.startsWith('module/plan-commands/'),
  },
] as const;

function underSrc(fileName: string): string {
  return fileName.startsWith(coreSource) ? fileName.slice(coreSource.length) : fileName;
}

/** Every TypeScript file of the core, as a path under `src`. */
async function scannedSources(): Promise<readonly string[]> {
  return (await readdir(coreSource, { recursive: true }))
    .filter((path) => path.endsWith('.ts'))
    .map((path) => path.replaceAll('\\', '/'))
    .sort();
}

/**
 * The core compiled as one program, with its own `tsconfig.lib.json` options.
 *
 * Both throws are load-bearing: without the real options there are no path
 * mappings, `@wbs/contracts` does not resolve, and every symbol this rule asks
 * about comes back unresolved — which reads as an empty violation list.
 */
function coreProgram(rootNames: readonly string[]): ts.Program {
  const read = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
  // Proof: pointing `configPath` at `tsconfig.absent.json` threw
  // `Cannot read file '…/tsconfig.absent.json'.` and failed the assertion, 0 pass and 1 fail (2026-09-22).
  if (read.error !== undefined) {
    throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, ' '));
  }
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, coreRoot);
  // Proof: `"module": "invalid"` in the real tsconfig.lib.json threw `refused tsconfig.lib.json: 6046`
  // and failed the assertion, 0 pass and 1 fail; with this throw deleted the same malformed option left
  // the assertion passing on unresolved symbols, 1 pass and 0 fail (2026-09-22).
  if (parsed.errors.length > 0) {
    throw new Error(
      `refused tsconfig.lib.json: ${parsed.errors.map((each) => each.code).join(', ')}`,
    );
  }
  return ts.createProgram({
    rootNames: rootNames.map((path) => `${coreSource}${path}`),
    options: { ...parsed.options, noEmit: true },
  });
}

/** The end of an alias chain, and every symbol passed through on the way. */
function aliasChain(checker: ts.TypeChecker, symbol: ts.Symbol): readonly ts.Symbol[] {
  const chain = [symbol];
  let current = symbol;
  while ((current.flags & ts.SymbolFlags.Alias) !== 0) {
    const next = checker.getAliasedSymbol(current);
    if (chain.includes(next)) break;
    chain.push(next);
    current = next;
  }
  return chain;
}

function declarationFiles(symbol: ts.Symbol): readonly string[] {
  return (symbol.declarations ?? []).map((each) => underSrc(each.getSourceFile().fileName));
}

/** Every module specifier of a node that introduces one. */
function moduleSpecifierOf(node: ts.Node): ts.Expression | undefined {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return node.moduleSpecifier;
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
    return node.argument.literal;
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    return node.moduleReference.expression;
  }
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    return node.arguments[0];
  }
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'require'
  ) {
    return node.arguments[0];
  }
  return undefined;
}

/**
 * Every checked route by which one of {@link routes}' consumers reaches the owner
 * file it may not depend on.
 *
 * **Proven coverage: exactly the forms with a watched negative**, each named with
 * the fault of the 040.6 C packet's section 6 that watches it. Every question
 * compares declaration files of **resolved identities**, never spelling.
 *
 * - A module specifier resolving to a forbidden file: a relative named import (3)
 *   and a bare side-effect import (7).
 * - An identifier whose alias chain passes through a forbidden file: a named import
 *   of a name that file declares (1, 2) and the same through the `@wbs/core` barrel
 *   (8).
 * - A type-only namespace import used as a qualified type (4).
 * - A value namespace of the forbidden file read by element access (5).
 * - A `typeof import(...)` indexed by a string literal (6).
 * - A value namespace of a **forwarding barrel** read by element access, by property
 *   access, and destructured plain or renamed (10 to 13).
 * - A namespace of a **narrow forwarding file** read by a `const`-typed literal key
 *   (18), destructured through a computed property name (19), read as an
 *   indexed-access type through a type-alias key (20), keyed by `keyof typeof` from a
 *   widened `string` (21), and keyed by a **finite union** (22).
 * - A forwarded **primitive-valued** export read as an indexed-access type (24) and
 *   by a `const`-keyed element access (25).
 *
 * The second selection route — the base module's export symbol for every literal
 * member name the key type can be — exists because a forwarded
 * `export const TOKEN_TTL_SECONDS` selects to `number`, which declares nothing.
 *
 * **Unverified here.** The implementation also resolves a dynamic `import(...)`
 * specifier, an `import x = require(...)` reference, a renamed import, a `default`
 * re-export, an `export * as ns` re-export and a multi-hop re-export chain, and this
 * packet supplies **no probe for any of them**, so nothing here shows that it does.
 * `ports/event-port-boundaries.test.ts` watches those forms against **its own** port
 * contracts; that is evidence about that rule, not this one.
 *
 * **Residuals observed returning `[]` here, with the type check at exit 0.** A
 * selection whose **base** no longer resolves to a module:
 * `(markers as unknown as Record<string, unknown>)['CalendarMarkerService']` erases
 * the namespace's identity before anything is selected out of it, so neither route
 * opens (23). A third file re-exporting an owner's own re-export of a **contracts**
 * declaration, which resolves to the contracts declaration and leaves nothing of the
 * owner to reach (9).
 *
 * **Limits by analysis, not measured here.** Value-binding indirection
 * (`export const actor = user` consumed as a named import), a structural copy of a
 * contract, and a duplicate or merged declaration of the same shape are
 * declaration-side problems a reference rule cannot decide; packet B records the same
 * limits for its own rule after five rounds. They belong to the kind rules K2 to K6
 * of `docs/superpowers/specs/2026-09-19-code-organization-design.md`.
 */
function sidewaysUses(paths: readonly string[]): readonly string[] {
  const program = coreProgram(paths);
  const checker = program.getTypeChecker();
  for (const route of routes) {
    // Proof: changing one row's `reaches` to `service/absent.service.ts` threw
    // `the program holds no service/absent.service.ts` and failed the assertion, 0 pass and 1 fail (2026-09-22).
    if (program.getSourceFile(`${coreSource}${route.reaches}`) === undefined) {
      throw new Error(`the program holds no ${route.reaches}`);
    }
  }
  const reached: string[] = [];

  for (const path of paths) {
    const file = program.getSourceFile(`${coreSource}${path}`);
    // Proof: appending `'ports/missing.ts'` to what `scannedSources` returns threw
    // `the program holds no ports/missing.ts` and failed the assertion, 0 pass and 1 fail (2026-09-22).
    if (file === undefined) throw new Error(`the program holds no ${path}`);
    const owners = routes.filter((route) => route.reaches !== path && route.from(path));
    if (owners.length === 0) continue;

    const report = (owner: string, how: string): void => {
      reached.push(`${path}: ${how} reaches ${owner}`);
    };
    const ownerIn = (files: readonly string[]): readonly string[] =>
      owners.map((route) => route.reaches).filter((owner) => files.includes(owner));

    /**
     * Every declaration file the checker resolves this node's own identity to.
     *
     * This is the whole of the member rule, and it enumerates no syntax: a
     * selection out of a module is judged by what the checker says the selection
     * **is**. A literal key, a `const` key with a literal type, a computed binding
     * property and an indexed-access type through a type alias all resolve to the
     * same member symbol, so none of them needs a branch of its own. Two review
     * rounds got past an enumeration of literal spellings; identity has nothing to
     * enumerate. It is not sufficient alone — see {@link selectedNames} for the
     * primitive-valued export this route loses.
     */
    const resolvedDeclarations = (node: ts.Node): readonly string[] => {
      const files: string[] = [];
      const add = (symbol: ts.Symbol | undefined): void => {
        if (symbol !== undefined)
          files.push(...aliasChain(checker, symbol).flatMap(declarationFiles));
      };
      add(checker.getSymbolAtLocation(node));
      const seen = new Set<ts.Type>();
      const walk = (type: ts.Type): void => {
        if (seen.has(type)) return;
        seen.add(type);
        add(type.aliasSymbol);
        add(type.getSymbol());
        // A union or intersection carries no symbol of its own, so the identity that matters is in
        // its constituents: `markers[key]` with `key: 'A' | 'B'` resolves to `typeof A | typeof B`.
        if (type.isUnionOrIntersection()) for (const constituent of type.types) walk(constituent);
      };
      walk(checker.getTypeAtLocation(node));
      return files;
    };

    /**
     * Every member name a selection's **key type** can literally be.
     *
     * The type of a selection is not always enough to find the export it names: a
     * forwarded `export const TOKEN_TTL_SECONDS` selects to `number`, a primitive
     * with no declaration of its own, so the type route loses it (round 4). The key
     * is asked instead, by type and not by syntax — a string literal, a `const`
     * binding whose type is that literal, or any literal constituent of a union all
     * answer the same way — and the name is then resolved back to the base module's
     * export symbol.
     */
    const selectedNames = (node: ts.Node): readonly string[] => {
      const names: string[] = [];
      const addLiterals = (type: ts.Type): void => {
        if (type.isUnionOrIntersection()) {
          for (const constituent of type.types) addLiterals(constituent);
          return;
        }
        if (type.isStringLiteral()) names.push(type.value);
      };
      if (ts.isPropertyAccessExpression(node)) names.push(node.name.text);
      else if (ts.isElementAccessExpression(node)) {
        addLiterals(checker.getTypeAtLocation(node.argumentExpression));
      } else if (ts.isIndexedAccessTypeNode(node)) {
        addLiterals(checker.getTypeAtLocation(node.indexType));
      } else if (ts.isBindingElement(node)) {
        const selected = node.propertyName ?? node.name;
        if (ts.isIdentifier(selected) || ts.isStringLiteralLike(selected))
          names.push(selected.text);
        else if (ts.isComputedPropertyName(selected)) {
          addLiterals(checker.getTypeAtLocation(selected.expression));
        }
      }
      return names;
    };

    /** Where the base module's export of that name is finally declared. */
    const memberDeclarations = (baseType: ts.Type, name: string): readonly string[] => {
      const member = checker.getPropertyOfType(baseType, name);
      return member === undefined
        ? []
        : aliasChain(checker, member).flatMap((each) => declarationFiles(each));
    };

    /** What an object binding pattern is destructuring, as a type. */
    const patternBaseType = (pattern: ts.ObjectBindingPattern): ts.Type => {
      const parent = pattern.parent;
      const source =
        ts.isVariableDeclaration(parent) || ts.isParameter(parent)
          ? (parent.initializer ?? parent.type)
          : undefined;
      return checker.getTypeAtLocation(source ?? pattern);
    };

    /** The file a type's symbol is declared in, when that symbol is a module. */
    const moduleFileOfType = (type: ts.Type): string | undefined => {
      const symbol = type.aliasSymbol ?? type.getSymbol();
      if (symbol === undefined) return undefined;
      const chain = aliasChain(checker, symbol);
      const end = chain[chain.length - 1] ?? symbol;
      const declaration = end.declarations?.find((each) => ts.isSourceFile(each));
      return declaration === undefined ? undefined : underSrc(declaration.getSourceFile().fileName);
    };

    const visit = (node: ts.Node): void => {
      const specifier = moduleSpecifierOf(node);
      if (specifier !== undefined) {
        const moduleSymbol = checker.getSymbolAtLocation(specifier);
        if (moduleSymbol !== undefined) {
          const chain = aliasChain(checker, moduleSymbol);
          const end = chain[chain.length - 1] ?? moduleSymbol;
          for (const owner of ownerIn(declarationFiles(end))) {
            report(owner, specifier.getText());
          }
        }
      }
      if (ts.isIdentifier(node)) {
        const symbol = checker.getSymbolAtLocation(node);
        if (symbol !== undefined) {
          const hops = aliasChain(checker, symbol).flatMap((each) => declarationFiles(each));
          for (const owner of ownerIn(hops)) report(owner, node.getText());
        }
      }
      /**
       * A selection whose base is any module: the base may be an owner, and the
       * thing selected may be declared in one. Both are asked, neither is spelled.
       */
      const selectionBase = ts.isBindingElement(node)
        ? ts.isObjectBindingPattern(node.parent)
          ? patternBaseType(node.parent)
          : undefined
        : ts.isIndexedAccessTypeNode(node)
          ? checker.getTypeAtLocation(node.objectType)
          : ts.isElementAccessExpression(node) || ts.isPropertyAccessExpression(node)
            ? checker.getTypeAtLocation(node.expression)
            : undefined;
      if (selectionBase !== undefined) {
        const from = moduleFileOfType(selectionBase);
        if (from !== undefined) {
          for (const owner of ownerIn([from])) report(owner, node.getText());
          for (const owner of ownerIn(resolvedDeclarations(node))) report(owner, node.getText());
          for (const name of selectedNames(node)) {
            for (const owner of ownerIn(memberDeclarations(selectionBase, name))) {
              report(owner, node.getText());
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return [...new Set(reached)].sort();
}

describe('the no-sideways type routes of the 040.6 map', () => {
  it('rejects the checked sideways-type import routes', async () => {
    // Proof: seventeen injected routes each failed this assertion with `wbs-core:typecheck` at exit 0.
    // In `service/plan-document.ts`: its pre-move `CalendarMarkerListOutcome` import; a type-only namespace
    // of the marker service used as a qualified type; a value namespace of it read by element access; a
    // `typeof import(…)` indexed access; a bare side-effect import of it; and a `@wbs/core` barrel import of
    // `CalendarMarkerOutcome`, which only the marker service declares. Through a namespace of `index.ts`,
    // which forwards the owner: `core['CalendarMarkerService']`, `core.CalendarMarkerService`,
    // `const { CalendarMarkerService } = core` and its renamed form. Through a narrow file forwarding only
    // `CalendarMarkerService`: `markers[key]` with `const key = 'CalendarMarkerService'`,
    // `const { ['CalendarMarkerService']: held } = markers`,
    // `(typeof import('./replay-orchestrator'))[MarkerKey]`, a `keyof typeof` key from a widened `string`,
    // and a finite-union key (`key: 'CalendarMarkerService' | 'ReplayOrchestrator'`). Through the same file
    // forwarding the primitive `TOKEN_TTL_SECONDS`, from `use-cases/replay.ts`:
    // `(typeof import('../service/replay-orchestrator'))['TOKEN_TTL_SECONDS']` and a `const`-keyed element
    // access of it. Each is reported as `<file>: <specifier or expression> reaches <owner>`. Two further
    // injections were watched **passing** and are not prevented: that namespace's module identity cast away
    // first (`markers as unknown as Record<string, unknown>`), and a third file re-exporting the owner's own
    // re-export of a contracts declaration, which resolves to the contracts declaration and leaves nothing
    // of the owner to reach (2026-09-22).
    expect(sidewaysUses(await scannedSources())).toEqual([]);
  }, 120_000);
});
