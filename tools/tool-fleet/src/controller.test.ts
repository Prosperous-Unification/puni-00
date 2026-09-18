import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { describe, expect, it } from 'bun:test';

import {
  buildController,
  type CommandOutput,
  controllerBuilderName,
  type ControllerBuildLock,
  type RunCommand,
} from './controller';

const lock: ControllerBuildLock = {
  image: 'registry.example.test/fleet-controller:1.0.0',
  digest: `sha256:${'a'.repeat(64)}`,
  builder: { name: 'docker.io/moby/buildkit:v0.33.0', digest: `sha256:${'c'.repeat(64)}` },
  kubectl: { url: 'https://example.test/kubectl', sha256: 'b'.repeat(64) },
};
const builderName = controllerBuilderName(lock.builder);
const lockedInspection = `Name: ${builderName}\nDriver Options: image="${lock.builder.name}@${lock.builder.digest}"\n`;
const matchingIndex = JSON.stringify({ schemaVersion: 2, manifests: [{ digest: lock.digest }] });

function output(exitCode: number, stdout = '', stderr = ''): CommandOutput {
  return { exitCode, stdout: Buffer.from(stdout), stderr: Buffer.from(stderr) };
}

/** A Docker/tar double answering by subcommand; each override replaces one answer. */
function fakeRun(
  overrides: Partial<Record<'inspect' | 'create' | 'build' | 'tar', CommandOutput>> = {},
): { run: RunCommand; commands: string[][] } {
  const commands: string[][] = [];
  const run: RunCommand = (command) => {
    commands.push([...command]);
    const step = command[0] === 'tar' ? 'tar' : command[2];
    if (step === 'inspect') return overrides.inspect ?? output(0, lockedInspection);
    if (step === 'create') return overrides.create ?? output(0);
    if (step === 'build') return overrides.build ?? output(0);
    if (step === 'tar') return overrides.tar ?? output(0, matchingIndex);
    throw new Error(`unexpected command ${command.join(' ')}`);
  };
  return { run, commands };
}

describe('buildController', () => {
  it('builds reproducibly on the locked builder with the locked kubectl', async () => {
    const root = await scratchAsync('tool-fleet-controller-');
    const { run, commands } = fakeRun();
    await buildController(root, lock, run);
    const build = commands.find((command) => command[2] === 'build');
    expect(build?.[build.indexOf('--builder') + 1]).toBe(builderName);
    expect(build).toContain('SOURCE_DATE_EPOCH=0');
    expect(build).toContain('--provenance=false');
    expect(build).toContain('--sbom=false');
    expect(build).toContain(
      `type=docker,dest=${join(root, 'dist/tool-fleet/controller.oci')},name=${lock.image},oci-mediatypes=true,rewrite-timestamp=true`,
    );
    expect(build).toContain('KUBECTL_URL=https://example.test/kubectl');
    expect(build).toContain(`KUBECTL_SHA256=${'b'.repeat(64)}`);
    expect(commands.some((command) => command[2] === 'create')).toBe(false);
  });

  it('creates the locked builder when it is absent', async () => {
    const root = await scratchAsync('tool-fleet-controller-');
    const { run, commands } = fakeRun({
      inspect: output(1, '', `ERROR: no builder "${builderName}" found`),
    });
    await buildController(root, lock, run);
    expect(commands.find((command) => command[2] === 'create')).toEqual([
      'docker',
      'buildx',
      'create',
      '--name',
      builderName,
      '--driver',
      'docker-container',
      '--driver-opt',
      `image=${lock.builder.name}@${lock.builder.digest}`,
    ]);
  });

  it('refuses a builder running another BuildKit image', async () => {
    const root = await scratchAsync('tool-fleet-controller-');
    const { run, commands } = fakeRun({
      inspect: output(0, `Driver Options: image="moby/buildkit:latest"\n`),
    });
    expect(buildController(root, lock, run)).rejects.toThrow(/does not run .*buildx rm/);
    expect(commands.some((command) => command[2] === 'build')).toBe(false);
  });

  it('rejects an unreadable builder inspection', async () => {
    const root = await scratchAsync('tool-fleet-controller-');
    const { run, commands } = fakeRun({
      inspect: output(1, '', 'Cannot connect to the Docker daemon'),
    });
    expect(buildController(root, lock, run)).rejects.toThrow(
      /Cannot inspect buildx builder.*Docker daemon/,
    );
    expect(commands.some((command) => command[2] === 'create')).toBe(false);
  });

  it('rejects a failed builder creation', async () => {
    const root = await scratchAsync('tool-fleet-controller-');
    const { run, commands } = fakeRun({
      inspect: output(1, '', `ERROR: no builder "${builderName}" found`),
      create: output(1, '', 'injected create failure'),
    });
    expect(buildController(root, lock, run)).rejects.toThrow(
      /Cannot create buildx builder.*injected create failure/,
    );
    expect(commands.some((command) => command[2] === 'build')).toBe(false);
  });

  it('rejects a failed Docker build before artifact inspection', async () => {
    const root = await scratchAsync('tool-fleet-controller-');
    const { run, commands } = fakeRun({ build: output(42, '', 'injected Docker failure') });
    expect(buildController(root, lock, run)).rejects.toThrow(
      /Docker build failed.*injected Docker failure/,
    );
    expect(commands.some((command) => command[0] === 'tar')).toBe(false);
  });

  it('rejects a built artifact whose manifest differs from the lock', async () => {
    const root = await scratchAsync('tool-fleet-controller-');
    const { run } = fakeRun({
      tar: output(
        0,
        JSON.stringify({ schemaVersion: 2, manifests: [{ digest: `sha256:${'b'.repeat(64)}` }] }),
      ),
    });
    expect(buildController(root, lock, run)).rejects.toThrow(/does not match lock/);
  });

  it('rejects a failed OCI index inspection', async () => {
    const root = await scratchAsync('tool-fleet-controller-');
    const { run } = fakeRun({ tar: output(43, '', 'injected tar failure') });
    expect(buildController(root, lock, run)).rejects.toThrow(
      /Cannot inspect controller OCI index.*injected tar failure/,
    );
  });

  it('rejects malformed OCI index JSON', async () => {
    const root = await scratchAsync('tool-fleet-controller-');
    const { run } = fakeRun({ tar: output(0, '{') });
    expect(buildController(root, lock, run)).rejects.toThrow(/OCI index is not valid JSON/);
  });

  it('rejects an OCI index without required manifest state', async () => {
    const root = await scratchAsync('tool-fleet-controller-');
    const { run } = fakeRun({ tar: output(0, JSON.stringify({ schemaVersion: 2 })) });
    expect(buildController(root, lock, run)).rejects.toThrow(/OCI index is invalid.*manifests/);
  });
});
