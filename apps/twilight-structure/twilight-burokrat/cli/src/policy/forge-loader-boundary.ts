import { createHash } from 'node:crypto';

import ts from 'typescript';

export const forgeRuntimeLoaderPath = 'apps/puni/cli/src/packaging/forge-runtime-loader.ts';
const auditedSource =
  "import { createHash } from 'node:crypto';\n\n/**\n * Load a copied byte snapshot already authenticated by the caller's selected archive boundary.\n * The digest names that snapshot and its module-cache identity; it grants no public provenance.\n * No source pathname is reopened by import, and no caller-supplied URL is accepted.\n */\nexport async function loadForgeRuntime(\n  bytes: Uint8Array,\n  expectedSha256: string,\n): Promise<unknown> {\n  const retained = Uint8Array.from(bytes);\n  const sha256 = createHash('sha256').update(retained).digest('hex');\n  if (sha256 !== expectedSha256)\n    throw new Error('retained Forge runtime bytes differ from their authenticated digest');\n  const moduleURL =\n    'data:text/javascript;sha256=' + sha256 + ';base64,' + Buffer.from(retained).toString('base64');\n  return await import(moduleURL);\n}\n";

/** Exact source-owned runtime asset capability; candidate paths/digests never nominate authority. */
export interface ForgeRuntimeLoad {
  readonly kind: 'retained-forge-core';
  readonly sourcePath: typeof forgeRuntimeLoaderPath;
  readonly sourceSha256: string;
  readonly emittedSha256: string;
  readonly role: 'puni.mjs';
  readonly importCalls: 1;
  readonly payloadFormat: 'puni-forge-runtime';
  readonly payloadVersion: 1;
  readonly cacheIdentity: 'sha256-data-url';
}
export interface AuditedForgeLoader {
  readonly sourceSha256: string;
}

/** Admit only the producer's exact full source at its exact captured path and package profile. */
export function readForgeLoaderBoundary(
  path: string,
  source: Uint8Array,
  packagePrograms: boolean,
): AuditedForgeLoader | undefined {
  if (path !== forgeRuntimeLoaderPath) return undefined;
  if (!packagePrograms) throw new Error('Forge runtime loader requires the PUNI package root role');
  const expected = Buffer.from(auditedSource);
  if (!Buffer.from(source).equals(expected))
    throw new Error('Forge runtime loader differs from producer-audited source');
  return { sourceSha256: createHash('sha256').update(expected).digest('hex') };
}

/** Find exactly the one authenticated opaque import; all other AST nodes retain generic checks. */
export function readForgeLoaderImport(parsed: ts.SourceFile): ts.CallExpression {
  const found: ts.CallExpression[] = [];
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const specifier = node.arguments.at(0);
      if (
        node.arguments.length !== 1 ||
        specifier === undefined ||
        !ts.isIdentifier(specifier) ||
        specifier.text !== 'moduleURL'
      )
        throw new Error('Forge runtime loader emitted an unaudited import shape');
      found.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  const call = found.at(0);
  if (found.length !== 1 || call === undefined)
    throw new Error('Forge runtime loader must contain exactly one audited import call');
  return call;
}
