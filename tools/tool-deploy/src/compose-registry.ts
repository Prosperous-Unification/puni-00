import { type Tier, TIERS } from '@tools/deploy-contract';
import type { EnvLayout } from '@tools/env';
import {
  type DeploymentEnrollment,
  readDeploymentEnrollment,
  readRegistryBytes,
  type RegistryPromotionReceipt,
  verifyRegistryPromotion,
} from '@tools/registry-publication';

/** Only the image identities and environment root consumed by explicit managed selection. */
export interface ComposeRegistryPlan {
  images: Partial<Record<Tier, string>>;
  tiers: readonly Tier[];
  layout: Pick<EnvLayout, 'root'>;
}

/** Explicit managed selection requires the mandatory catalog and refuses partial managed execution. */
export async function selectComposeDeployment(
  plan: ComposeRegistryPlan,
  select = readDeploymentEnrollment,
): Promise<DeploymentEnrollment | undefined> {
  const enrollment = await select(Object.values(plan.images), `compose:${plan.layout.root}`);
  // Proof: removing only membership validation admits the equal-length duplicate/missing set in compose-registry.test.ts while its subset still fails the length check.
  if (
    enrollment !== undefined &&
    (plan.tiers.length !== TIERS.length || !TIERS.every((tier) => plan.tiers.includes(tier)))
  )
    throw new Error('Managed Compose requires all configured tiers');
  return enrollment;
}
/** Consume exactly one verified remote completion instead of running an unbound second smoke after unlock. */
export async function verifyComposeCompletion(
  output: string,
  enrollment: DeploymentEnrollment,
  images: readonly string[],
  verify = verifyRegistryPromotion,
): Promise<RegistryPromotionReceipt> {
  const receipts = output.split('\n').filter((line) => line.startsWith('PUNI_REGISTRY_COMPOSE '));
  if (receipts.length !== 1)
    throw new Error('Managed Compose omitted or repeated its verified completion');
  const completion = await verify(
    enrollment,
    JSON.parse(receipts[0].slice('PUNI_REGISTRY_COMPOSE '.length)) as unknown,
  );
  const current = completion.releases[0];
  const full = new Set(
    current.references.map(
      (reference) =>
        `${new URL(enrollment.registryUrl).host}/${reference.repository}@${reference.digest}`,
    ),
  );
  if (!images.every((image) => full.has(image)))
    throw new Error('Managed Compose completion names another candidate');
  return completion;
}
/** Bound remote diagnostic output and reap on overflow; the remote deploy retains its durable pending ownership. */
export async function runManagedCompose(host: string, command: string): Promise<string> {
  const child = Bun.spawn(['ssh', host, command], { stdout: 'pipe', stderr: 'pipe' });
  const stdout = readRegistryBytes(child.stdout, 4 * 1024 ** 2, 'Managed Compose stdout');
  const stderr = readRegistryBytes(child.stderr, 65536, 'Managed Compose stderr');
  try {
    const [code, output, diagnostic] = await Promise.all([child.exited, stdout, stderr]);
    process.stdout.write(output);
    process.stderr.write(diagnostic);
    if (code !== 0) throw new Error(`Managed Compose remote command failed (${String(code)})`);
    return new TextDecoder().decode(output);
  } catch (cause) {
    if (child.exitCode === null) child.kill('SIGKILL');
    await child.exited;
    await Promise.allSettled([stdout, stderr]);
    throw cause;
  }
}
