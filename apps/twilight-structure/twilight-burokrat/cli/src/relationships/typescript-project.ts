import ts from 'typescript';

import {
  assertProgramSources,
  createCompilerHost,
  type ParsedProject,
  parseProject,
  type TypeScriptSystem,
} from './typescript-compiler';

/**
 * Initial configuration selections survive lazy trusted-package materialization. Reference
 * commands retain config-only JSON ASTs and their parse diagnostics: TypeScript requires
 * options.configFile for getParsedCommandLine. They retain no source Program or checker.
 */
export interface ProjectConfiguration {
  configPath: string;
  configurationIdentity: string;
  options: ts.CompilerOptions;
  roots: readonly string[];
  references: readonly ts.ProjectReference[] | undefined;
  commands: ReadonlyMap<string, ts.ParsedCommandLine | undefined>;
}

/** Selects roots and transitive reference commands once, before another project copies packages. */
export function captureProject(
  workspace: string,
  configPath: string,
  system: TypeScriptSystem,
): ProjectConfiguration {
  const project = parseProject(workspace, configPath, system);
  const commands = new Map<string, ts.ParsedCommandLine | undefined>();
  const visit = (
    references: readonly ts.ProjectReference[] | undefined,
    resolved: readonly (ts.ResolvedProjectReference | undefined)[] | undefined,
  ): void => {
    if (references === undefined) return;
    // Proof: replacing the compiler reference census with undefined made the nested-reference
    // parity test fail with this named refusal (fault-reference-census receipt).
    if (resolved?.length !== references.length)
      throw new Error('TypeScript project reference census is incomplete');
    for (const [index, reference] of references.entries()) {
      const path = ts.resolveProjectReferencePath(reference);
      if (commands.has(path)) continue;
      const selected = resolved[index];
      commands.set(path, selected?.commandLine);
      if (selected !== undefined)
        visit(selected.commandLine.projectReferences, selected.references);
    }
  };
  visit(project.program.getProjectReferences(), project.program.getResolvedProjectReferences());
  return {
    configPath,
    configurationIdentity: project.configurationIdentity,
    options: project.options,
    roots: [...project.program.getRootFileNames()],
    references: project.program.getProjectReferences(),
    commands,
  };
}

/**
 * Reconstructs the selected configuration without recensing the growing trusted package tree.
 * Proof: replacing reconstruction with parseProject failed both root/reference wildcard tests
 * after later package materialization (fault-recensus receipt).
 */
export function reconstructProject(
  workspace: string,
  configuration: ProjectConfiguration,
  system: TypeScriptSystem,
): ParsedProject {
  const host = createCompilerHost(configuration.options, system);
  host.getParsedCommandLine = (path) => {
    // Proof: deleting this guard made the cleared-reference-map assertion fail in
    // the transitive-reference wildcard test (fault-unselected-reference receipt).
    if (!configuration.commands.has(path))
      throw new Error(`TypeScript project reference was not selected: ${path}`);
    return configuration.commands.get(path);
  };
  const program = ts.createProgram({
    host,
    rootNames: configuration.roots,
    options: configuration.options,
    projectReferences: configuration.references,
  });
  assertProgramSources(workspace, program, system);
  return {
    system,
    configPath: configuration.configPath,
    configurationIdentity: configuration.configurationIdentity,
    options: configuration.options,
    program,
    declarations: new Map(),
  };
}
