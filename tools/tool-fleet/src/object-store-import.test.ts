import { describe, expect, it } from 'bun:test';

import type { RunCommand } from './controller';
import { importObjectStore } from './object-store-image';

const lock = {
  image: 'docker.io/puni-local/object-store:release',
  digest: `sha256:${'a'.repeat(64)}`,
};
const reference = `docker.io/puni-local/object-store@${lock.digest}`;
function createRunner(fault?: 'missing' | 'source' | 'alias' | 'import') {
  const commands: string[][] = [];
  const run: RunCommand = (command) => {
    commands.push([...command]);
    const code = fault === 'import' && command[1] === 'image' ? 42 : 0;
    const name = command.at(-1)?.replace('name==', '');
    if (name === undefined) throw new Error('Test command has no target');
    const wrong =
      (fault === 'source' && name === lock.image) || (fault === 'alias' && name === reference);
    const stdout = command.includes('ls')
      ? `REF TYPE DIGEST SIZE\n${fault === 'missing' && name === lock.image ? '' : `${name} manifest ${wrong ? `sha256:${'b'.repeat(64)}` : lock.digest} 1MiB`}`
      : '';
    return {
      exitCode: code,
      stdout: Buffer.from(stdout),
      stderr: Buffer.from('injected boundary failure'),
    };
  };
  return { run, commands };
}
describe('local object store digest distribution', () => {
  for (const fault of ['missing', 'source', 'alias', 'import'] as const) {
    it(`refuses ${fault} before accepting distribution`, () => {
      const { run } = createRunner(fault);
      expect(() => {
        importObjectStore('/owned/image.oci', lock, 'owned', 'k3d-owned-server-0', 'k3d', run);
      }).toThrow();
    });
  }
  it('registers and verifies the digest alias in the node CRI namespace', () => {
    const { run, commands } = createRunner();
    importObjectStore('/owned/image.oci', lock, 'owned', 'k3d-owned-server-0', 'k3d', run);
    expect(commands).toEqual([
      ['k3d', 'image', 'import', '/owned/image.oci', '--cluster', 'owned', '--mode', 'direct'],
      [
        'docker',
        'exec',
        'k3d-owned-server-0',
        'ctr',
        '-n',
        'k8s.io',
        'images',
        'ls',
        `name==${lock.image}`,
      ],
      [
        'docker',
        'exec',
        'k3d-owned-server-0',
        'ctr',
        '-n',
        'k8s.io',
        'images',
        'tag',
        '--force',
        lock.image,
        reference,
      ],
      [
        'docker',
        'exec',
        'k3d-owned-server-0',
        'ctr',
        '-n',
        'k8s.io',
        'images',
        'ls',
        `name==${reference}`,
      ],
    ]);
  });
});
