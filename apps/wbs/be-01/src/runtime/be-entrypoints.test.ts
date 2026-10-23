import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

const source = new URL('../', import.meta.url);

for (const entrypoint of ['main.ts', 'dev/main.ts']) {
  test(`${entrypoint} forwards both organization authorities and supervises failure before exit one`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'wbs-be-supervision-'));
    const marker = join(directory, 'disposed');
    const preload = join(directory, 'preload.ts');
    writeFileSync(join(directory, 'wbs-solver-launcher'), 'fixture');
    const modulePath = (path: string) => JSON.stringify(new URL(path, source).pathname);
    writeFileSync(
      preload,
      `
import { mock } from 'bun:test';
import { appendFileSync } from 'node:fs';
import { createBackgroundFailure } from ${modulePath('runtime/be-supervisor.ts')};
const failure = createBackgroundFailure();
failure.report(new Error('controlled immediate background failure'));
mock.module(${modulePath('boot.ts')}, () => ({ bootBe01: (options: {
  emailDelivery: { kind: string; from: string };
  organizationDnsResolvers: readonly string[];
  organizationDomainProofScheduling: string;
}) => {
  if (JSON.stringify(options.emailDelivery) !== JSON.stringify({ kind: 'smtp', from: 'fixture@example.test' }) ||
      JSON.stringify(options.organizationDnsResolvers) !== JSON.stringify(['10.0.0.53']) ||
      options.organizationDomainProofScheduling !== 'disabled')
    throw new Error('entrypoint omitted organization runtime configuration');
  return Promise.resolve({
  backgroundFailure: failure.source,
  stop: async () => {
    appendFileSync(${JSON.stringify(marker)}, 'started\\n');
    await Bun.sleep(5);
    appendFileSync(${JSON.stringify(marker)}, 'joined\\n');
  },
}); } }));
mock.module(${modulePath('controller/oidc-options.ts')}, () => ({ oidcRouteOptionsFromEnv: () => { throw new Error('unexpected OIDC composition'); } }));
mock.module(${modulePath('config.ts')}, () => ({ loadConfig: () => ({ LOG_LEVEL: 'error', AUTH_MODE: 'local', emailDelivery: { kind: 'smtp', from: 'fixture@example.test' }, organizationDnsResolvers: ['10.0.0.53'], ORGANIZATION_DOMAIN_PROOF_SCHEDULING: 'disabled' }) }));
mock.module(${modulePath('module/solver-launcher/check.ts')}, () => ({ installSolverLauncher: () => ({ solverLauncher: { readRuntimeVersion: () => 'fixture' } }) }));
mock.module(${modulePath('module/solver-supervisor/check.ts')}, () => ({ installSolverSupervisor: () => ({ spawner: () => { throw new Error('unexpected solver spawn'); } }) }));
mock.module(${modulePath('dev/local-solver-spawner.ts')}, () => ({
  solverBinDirectory: () => ${JSON.stringify(directory)},
  localSolverCapabilities: () => ({}),
  createLocalSolverSpawner: () => () => { throw new Error('unexpected local solver spawn'); },
}));
`,
    );
    try {
      const child = Bun.spawn(
        [process.execPath, '--preload', preload, new URL(entrypoint, source).pathname],
        {
          env: { ...process.env, HOSTNAME: 'supervision-test' },
          stdout: 'ignore',
          stderr: 'pipe',
        },
      );
      const [exit, errors] = await Promise.all([child.exited, new Response(child.stderr).text()]);
      expect(errors).toBe('');
      expect(exit).toBe(1);
      expect(existsSync(marker)).toBe(true);
      expect(readFileSync(marker, 'utf8')).toBe('started\njoined\n');
    } finally {
      rmSync(directory, { recursive: true });
    }
  });
}
