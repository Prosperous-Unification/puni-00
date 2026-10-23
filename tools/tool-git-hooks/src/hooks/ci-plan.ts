import { selectRuntimeProjects } from './ci-runtime-selection';
import { selectChanges } from './ci-selection';
import { selectTestFiles, type TestSelection } from './ci-test-selection';

/** Immutable PR execution plan; empty runtime partitions are explicit, never inferred from failure. */
export interface GatePlan {
  schemaVersion: 1;
  base: string;
  head: string;
  mode: 'docs' | 'affected';
  twilight: 'run' | 'skip';
  projects: string[];
  workspaceProjects: string[];
  twilightProjects: string[];
  reasons: string[];
  tests: TestSelection[];
}

/** Produces the single plan shared by scope selection and each PR execution job. */
export async function createGatePlan(
  repository: string,
  base: string,
  head: string,
): Promise<GatePlan> {
  const selection = selectChanges(repository, base, head);
  if (selection.scope === 'docs') {
    return {
      schemaVersion: 1,
      base,
      head,
      mode: 'docs',
      twilight: 'skip',
      projects: [],
      workspaceProjects: [],
      twilightProjects: [],
      reasons: selection.reasons,
      tests: [],
    };
  }
  const runtime = await selectRuntimeProjects(repository, selection);
  const projects = [...runtime.projects].sort();
  if (
    new Set(projects).size !== projects.length ||
    projects.some((project) => !/^[a-zA-Z0-9@_./-]+$/.test(project))
  ) {
    throw new Error('Runtime selection contains duplicate or unsupported Nx project names');
  }
  const twilightProjects: string[] = projects.filter(
    (project) => project === 'twilight-burokrat' || project === 'twilight-dash',
  );
  const workspaceProjects = projects.filter((project) => !twilightProjects.includes(project));
  return {
    schemaVersion: 1,
    base,
    head,
    mode: 'affected',
    twilight: twilightProjects.length > 0 ? 'run' : 'skip',
    projects,
    workspaceProjects,
    twilightProjects,
    reasons: [...selection.reasons, ...runtime.reasons],
    tests: projects.map((project) => selectTestFiles(repository, selection, project)),
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const base = args.at(0);
  const head = args.at(1);
  const repository = args.at(2);
  if (args.length !== 3 || base === undefined || head === undefined || repository === undefined) {
    throw new Error('Usage: ci-plan.ts <base-sha> <head-sha> <repository>');
  }
  process.stdout.write(`${JSON.stringify(await createGatePlan(repository, base, head))}\n`);
}
