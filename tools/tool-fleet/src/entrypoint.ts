import { join } from 'node:path';

const command = process.argv[2];
const root = join(import.meta.dir, '../../..');
const toolchainPath = join(root, 'infra/versions/toolchain.json');

switch (command) {
  case 'check':
    {
      const [{ readToolchain }, { validatePlatform }] = await Promise.all([
        import('./contracts'),
        import('./platform'),
      ]);
      await Promise.all([readToolchain(toolchainPath), validatePlatform(root)]);
    }
    break;
  case 'build':
    {
      const [{ readToolchain }, { buildController }] = await Promise.all([
        import('./contracts'),
        import('./controller'),
      ]);
      const toolchain = await readToolchain(toolchainPath);
      await buildController(root, {
        image: toolchain.controller.image,
        digest: toolchain.controller.digest,
        builder: toolchain.controller.builder,
        kubectl: toolchain.binaries.kubectl,
      });
    }
    break;
  case 'lab':
    await (await import('./lab')).runVmLab(process.argv.slice(3), root);
    break;
  case 'plan':
    await (await import('./cli')).runPlan(process.argv.slice(3));
    break;
  case 'terragrunt-plan':
    await (await import('./cli')).runTerragruntPlan(process.argv.slice(3), root);
    break;
  case 'terragrunt-destroy-plan':
    await (await import('./cli')).runTerragruntDestroyPlan(process.argv.slice(3), root);
    break;
  case 'discover':
    await (await import('./discover')).runDiscover(process.argv.slice(3), root);
    break;
  case 'apply': {
    const [{ runApply }, { createProductionApplyDependencies }] = await Promise.all([
      import('./cli'),
      import('./production-apply'),
    ]);
    await runApply(process.argv.slice(3), (plan, planPath) =>
      createProductionApplyDependencies(root, plan, planPath),
    );
    break;
  }
  default:
    throw new Error(`Unknown tool-fleet command: ${command}`);
}
