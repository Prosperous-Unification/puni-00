import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { describe, expect, it } from 'bun:test';

import { buildController, type RunCommand } from './controller';

const expectedDigest = `sha256:${'a'.repeat(64)}`;

function output(exitCode: number, stdout = '', stderr = '') {
  return {
    exitCode,
    stdout: Buffer.from(stdout),
    stderr: Buffer.from(stderr),
  };
}

describe('buildController', () => {
  it('rejects a failed Docker build before artifact inspection', async () => {
    const root = await scratchAsync('tool-fleet-controller-');
    const runCommand: RunCommand = () => output(42, '', 'injected Docker failure');
    expect(buildController(root, expectedDigest, runCommand)).rejects.toThrow(
      /Docker build failed.*injected Docker failure/,
    );
  });

  it('rejects a built artifact whose manifest differs from the lock', async () => {
    const root = await scratchAsync('tool-fleet-controller-');
    let invocation = 0;
    const runCommand: RunCommand = () => {
      invocation += 1;
      if (invocation === 1) return output(0);
      return output(
        0,
        JSON.stringify({
          schemaVersion: 2,
          manifests: [{ digest: `sha256:${'b'.repeat(64)}` }],
        }),
      );
    };
    expect(buildController(root, expectedDigest, runCommand)).rejects.toThrow(
      /does not match lock/,
    );
    expect(invocation).toBe(2);
    expect(join(root, 'dist/tool-fleet/controller.oci')).toContain('controller.oci');
  });

  it('rejects a failed OCI index inspection', async () => {
    const root = await scratchAsync('tool-fleet-controller-');
    let invocation = 0;
    const runCommand: RunCommand = () => {
      invocation += 1;
      return invocation === 1 ? output(0) : output(43, '', 'injected tar failure');
    };
    expect(buildController(root, expectedDigest, runCommand)).rejects.toThrow(
      /Cannot inspect controller OCI index.*injected tar failure/,
    );
  });

  it('rejects malformed OCI index JSON', async () => {
    const root = await scratchAsync('tool-fleet-controller-');
    let invocation = 0;
    const runCommand: RunCommand = () => {
      invocation += 1;
      return invocation === 1 ? output(0) : output(0, '{');
    };
    expect(buildController(root, expectedDigest, runCommand)).rejects.toThrow(
      /OCI index is not valid JSON/,
    );
  });

  it('rejects an OCI index without required manifest state', async () => {
    const root = await scratchAsync('tool-fleet-controller-');
    let invocation = 0;
    const runCommand: RunCommand = () => {
      invocation += 1;
      return invocation === 1 ? output(0) : output(0, JSON.stringify({ schemaVersion: 2 }));
    };
    expect(buildController(root, expectedDigest, runCommand)).rejects.toThrow(
      /OCI index is invalid.*manifests/,
    );
  });

  it('passes the locked kubectl artifact into the controller build', async () => {
    const root = await scratchAsync('tool-fleet-controller-');
    const commands: string[][] = [];
    const runCommand: RunCommand = (command) => {
      commands.push([...command]);
      return commands.length === 1
        ? output(0)
        : output(0, JSON.stringify({ schemaVersion: 2, manifests: [{ digest: expectedDigest }] }));
    };
    await buildController(root, expectedDigest, runCommand, {
      url: 'https://example.test/kubectl',
      sha256: 'b'.repeat(64),
    });
    expect(commands[0]).toContain('KUBECTL_URL=https://example.test/kubectl');
    expect(commands[0]).toContain(`KUBECTL_SHA256=${'b'.repeat(64)}`);
  });
});
