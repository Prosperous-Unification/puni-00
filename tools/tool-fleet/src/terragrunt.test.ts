import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { readToolchain } from './contracts';
import { buildTerragruntRequest, lockTerragruntRequest, readTerragruntConfig } from './terragrunt';

const root = join(import.meta.dir, '../../..');
const config = await readFile(join(root, 'infra/terraform/terragrunt.hcl'), 'utf8');
const hash = (source: string) => createHash('sha256').update(source).digest('hex');

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'fleet-terragrunt-'));
  await mkdir(join(directory, 'infra/terraform'), { recursive: true });
  await mkdir(join(directory, 'infra/versions'), { recursive: true });
  const toolchain = await readToolchain(join(root, 'infra/versions/toolchain.json'));
  const executables = {
    terragrunt: join(directory, 'terragrunt'),
    terraform: join(directory, 'terraform'),
  };
  for (const name of ['terragrunt', 'terraform'] as const) {
    await writeFile(executables[name], name, { mode: 0o700 });
  }
  toolchain.binaries.terragrunt.sha256 = hash('terragrunt');
  toolchain.binaries.terraform.executableSha256 = hash('terraform');
  await writeFile(join(directory, 'infra/versions/toolchain.json'), JSON.stringify(toolchain));
  await writeFile(join(directory, 'infra/terraform/terragrunt.hcl'), config);
  const resolve = (name: string) =>
    name === 'terragrunt' ? executables.terragrunt : executables.terraform;
  return { directory, executables, resolve };
}

test('binds the source-free unit and explicit no-retry, no-auto-init JSON command boundary', async () => {
  const sha256 = await readTerragruntConfig(root);
  const request = await buildTerragruntRequest(root, ['show', '-json', '/reviewed.tfplan'], sha256);
  expect(request.executable).toBe('terragrunt');
  expect(request.arguments).toContain('--no-auto-init');
  expect(request.arguments).toContain('--no-auto-retry');
  expect(request.arguments).toContain('--tf-forward-stdout');
  expect(request.arguments.slice(request.arguments.indexOf('--') + 1)).toEqual([
    'show',
    '-json',
    '/reviewed.tfplan',
  ]);
  expect(buildTerragruntRequest(root, ['show'], '0'.repeat(64))).rejects.toThrow(
    /configuration.*reviewed/i,
  );
  expect(buildTerragruntRequest(root, ['destroy'], sha256)).rejects.toThrow(/unsupported/i);
});

test('rejects missing, changed, and executable HCL configuration before command execution', async () => {
  const { directory } = await fixture();
  const path = join(directory, 'infra/terraform/terragrunt.hcl');
  await writeFile(path, config + '\nlocals { injected = run_cmd("touch", "/tmp/unsafe") }\n');
  expect(readTerragruntConfig(directory)).rejects.toThrow(/source-free/i);
  await Bun.file(path).delete();
  expect(readTerragruntConfig(directory)).rejects.toThrow();
});

test('requires both exact executable identities and rejects ambient execution overrides', async () => {
  const { directory, executables, resolve } = await fixture();
  const request = await buildTerragruntRequest(
    directory,
    ['state', 'pull'],
    await readTerragruntConfig(directory),
  );
  const locked = await lockTerragruntRequest(directory, request, resolve, {});
  expect(locked.executable).toBe(executables.terragrunt);
  expect(locked.arguments).toContain(executables.terraform);
  expect(locked.arguments).toContain('--tf-path');
  expect(locked.environment?.['TF_CLI_CONFIG_FILE']).toBe('/dev/null');
  for (const name of [
    'TG_TF_PATH',
    'TERRAGRUNT_CONFIG',
    'TF_CLI_ARGS_apply',
    'TF_CLI_CONFIG_FILE',
    'TF_WORKSPACE',
    'TF_VAR_nodes',
    'TF_REATTACH_PROVIDERS',
    'TF_LOG_PROVIDER',
  ]) {
    expect(
      lockTerragruntRequest(directory, request, resolve, { [name]: 'unreviewed' }),
    ).rejects.toThrow(/override/i);
  }
  expect(lockTerragruntRequest(directory, request, () => null, {})).rejects.toThrow(/unavailable/i);
  for (const name of ['terragrunt', 'terraform'] as const) {
    await writeFile(executables[name], 'tampered');
    expect(lockTerragruntRequest(directory, request, resolve, {})).rejects.toThrow(/SHA-256/i);
    await writeFile(executables[name], name);
  }
  await chmod(executables.terraform, 0o600);
  expect(lockTerragruntRequest(directory, request, resolve, {})).rejects.toThrow(/executable/i);
});
