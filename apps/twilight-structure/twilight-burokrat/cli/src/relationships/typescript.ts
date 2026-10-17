import type { RelationshipRequest } from '../contracts/records';
import { createTrustedSystem } from './trusted-files';
import { extractTypeScriptRelationshipsWithPolicy } from './typescript-core';

export type {
  ExtractorIdentity,
  ImportKind,
  PublicDeclarationSelector,
  ResolvedDeclaration,
  TypeScriptImportSelector,
  TypeScriptRelationships,
  TypeScriptReverseEdgeSelector,
} from './typescript-core';

/** Extracts resolved imports, provider reverse edges and transitive public declaration surfaces. */
export function extractTypeScriptRelationships(
  workspace: string,
  request: RelationshipRequest['typescript'],
  trustedModules: string,
): ReturnType<typeof extractTypeScriptRelationshipsWithPolicy> {
  const system = createTrustedSystem(workspace, trustedModules);
  return extractTypeScriptRelationshipsWithPolicy(
    workspace,
    request,
    {
      compilerLibraryDirectory: system.compilerLibraryDirectory,
      useCaseSensitiveFileNames: system.useCaseSensitiveFileNames,
      pathKind: (path) =>
        system.directoryExists(path) ? 'directory' : system.fileExists(path) ? 'file' : 'absent',
      readFile: (path) => system.readFile(path),
      readDirectory: (path, extensions, exclude, include, depth) =>
        system.readDirectory(path, extensions, exclude, include, depth),
      getDirectories: (path) => system.getDirectories(path),
      realpath: (path) => system.realpath(path),
      getCurrentDirectory: () => system.getCurrentDirectory(),
    },
    { kind: 'legacy' },
  );
}
