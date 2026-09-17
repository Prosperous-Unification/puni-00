import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { readToolchain } from './contracts';
import type { CommandRequest } from './production-apply';

/** Require the complete source-free unit before Terragrunt can evaluate HCL or invoke hooks. */
export async function readTerragruntConfig(root: string): Promise<string> {
  const lock = await readToolchain(join(root, 'infra/versions/toolchain.json'));
  const source = await readFile(join(root, 'infra/terraform/terragrunt.hcl'), 'utf8');
  const expected = `terragrunt_version_constraint = "= ${lock.binaries.terragrunt.version}"\nterraform_version_constraint  = "= ${lock.binaries.terraform.version}"\n`;
  if (source !== expected) {
    // Proof: removing this guard made the injected run_cmd HCL production-reader negative fail.
    throw new Error('Terragrunt configuration differs from the locked source-free unit');
  }
  return createHash('sha256').update(source).digest('hex');
}

/** Build one unit command without implicit initialization, retries, or wrapped JSON output. */
export async function buildTerragruntRequest(
  root: string,
  arguments_: readonly string[],
  expectedConfigSha256: string,
): Promise<CommandRequest> {
  if ((await readTerragruntConfig(root)) !== expectedConfigSha256) {
    // Proof: removing this guard made the wrong-reviewed-config-digest command-builder negative fail.
    throw new Error('Terragrunt configuration differs from the reviewed SHA-256');
  }
  if (
    !['init', 'validate', 'plan', 'show', 'state', 'output', 'apply', 'import', 'fmt'].includes(
      arguments_[0] ?? '',
    )
  ) {
    // Proof: removing this guard made the direct-destroy command-builder negative fail.
    throw new Error('Unsupported fleet Terragrunt engine command');
  }
  return {
    executable: 'terragrunt',
    cwd: join(root, 'infra/terraform'),
    // Proof: removing each no-auto-init/retry or raw-stdout flag made the builder negative fail.
    arguments: [
      'run',
      '--config',
      join(root, 'infra/terraform/terragrunt.hcl'),
      '--no-auto-init',
      '--no-auto-retry',
      '--tf-forward-stdout',
      '--',
      ...arguments_,
    ],
  };
}

/** Verify both executable files and refuse ambient overrides before selecting Terraform explicitly. */
export async function lockTerragruntRequest(
  root: string,
  request: CommandRequest,
  resolve: (name: string) => string | null = (name) => Bun.which(name),
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<CommandRequest> {
  for (const name of Object.keys(environment)) {
    if (
      name.startsWith('TG_') ||
      name.startsWith('TERRAGRUNT_') ||
      name.startsWith('TF_CLI_ARGS') ||
      name.startsWith('TF_VAR_') ||
      name.startsWith('TF_LOG') ||
      name === 'TF_REATTACH_PROVIDERS' ||
      [
        'TF_CLI_CONFIG_FILE',
        'TF_WORKSPACE',
        'TF_DATA_DIR',
        'TF_PLUGIN_CACHE_DIR',
        'TF_LOG',
        'TF_LOG_PATH',
      ].includes(name)
    ) {
      // Proof: removing this guard made the alternate engine/config/argument environment negatives fail.
      throw new Error(`Unsupported infrastructure execution override: ${name}`);
    }
  }
  const lock = await readToolchain(join(root, 'infra/versions/toolchain.json'));
  const executables: string[] = [];
  for (const name of ['terragrunt', 'terraform'] as const) {
    const executable = resolve(name);
    if (executable === null) {
      // Proof: removing this guard made the missing-tool resolver negative lose its required refusal.
      throw new Error(`Locked ${name} executable is unavailable`);
    }
    const expected =
      name === 'terraform'
        ? lock.binaries.terraform.executableSha256
        : lock.binaries.terragrunt.sha256;
    if (
      createHash('sha256')
        .update(await readFile(executable))
        .digest('hex') !== expected
    ) {
      // Proof: removing this guard made the tampered Terragrunt/Terraform executable negatives fail.
      throw new Error(`${name} executable differs from the locked SHA-256`);
    }
    if (((await stat(executable)).mode & 0o111) === 0) {
      // Proof: removing this guard made the valid-bytes/non-executable engine negative fail.
      throw new Error(`${name} is not executable`);
    }
    executables.push(executable);
  }
  return {
    ...request,
    // Proof: removing the explicit CLI configuration made the implicit-config boundary test fail.
    environment: { ...environment, TF_CLI_CONFIG_FILE: '/dev/null', TF_IN_AUTOMATION: '1' },
    executable: executables[0],
    // Proof: removing --tf-path made the explicit-engine runner negative fail.
    arguments: ['run', '--tf-path', executables[1], ...request.arguments.slice(1)],
  };
}
