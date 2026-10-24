import {
  excludeIngressAndManagedDependencies,
  excludeManagedDependencies,
} from './lib/dependency-activation-owner';
import { runDockerCli } from './lib/docker-deadline';
import { envLayout } from './lib/env';

/** Explicit managed-fence entrypoint; no default mutation and no activation operation. */
export async function activateDependencies(args: string[]): Promise<void> {
  const operation = args.at(0);
  const sha = args.at(1);
  const environments = args.slice(2);
  if (
    !['--fence-managed', '--fence-ingress-managed'].includes(operation ?? '') ||
    sha === undefined ||
    environments.length === 0 ||
    environments.some((environment) => !['prod', 'dev'].includes(environment))
  )
    throw new Error(
      'usage: activate-dependencies <--fence-managed|--fence-ingress-managed> <full-sha> <prod|dev> [prod|dev]; managed exclusion only; activation blocked',
    );
  const exclude =
    operation === '--fence-ingress-managed'
      ? excludeIngressAndManagedDependencies
      : excludeManagedDependencies;
  const completion = await exclude({ sha, layouts: environments.map(envLayout) }, runDockerCli);
  console.log(JSON.stringify(completion));
}

if (import.meta.main) await activateDependencies(process.argv.slice(2));
