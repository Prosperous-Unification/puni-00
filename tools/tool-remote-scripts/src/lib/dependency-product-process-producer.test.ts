import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

test('local fixed supervisor producer and production byte transport exchange ACK and REAPED', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'product-producer-'));
  try {
    const docker = join(directory, 'docker');
    await Bun.write(
      docker,
      '#!/bin/sh\n[ "$1" = "--" ] || exit 75\nshift\nexec /usr/bin/setsid "$@"\n',
    );
    await chmod(docker, 0o700);
    const transport = new URL('./docker-exec.ts', import.meta.url).pathname;
    const producer = new URL('./mount-exec-program.ts', import.meta.url).pathname;
    const source = `
      import { runDockerExec } from ${JSON.stringify(transport)};
      import { SUPERVISOR_PROGRAM } from ${JSON.stringify(producer)};
      const nonce = 'localProducerProof';
      const frames = [];
      await runDockerExec(
        ['--', '/bin/busybox', 'sh', '-c', SUPERVISOR_PROGRAM, '--', nonce,
          'printf "DONE\\\\000%s\\\\0002\\\\000" "$1"'],
        nonce,
        (token) => {
          frames.push(token);
          return token === '2' && frames.at(-3) === 'DONE' && frames.at(-2) === nonce;
        },
        AbortSignal.timeout(5000),
      );
      if (frames[0] !== 'SESSION' || frames.at(-2) !== 'REAPED' || frames.at(-1) !== nonce)
        throw new Error('local producer transcript incomplete');
    `;
    const child = Bun.spawn([process.execPath, '-e', source], {
      env: { ...process.env, PATH: `${directory}:/usr/bin:/bin` },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      killSignal: 'SIGKILL',
    });
    const [stdout, stderr, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(stdout).toBe('');
    expect(stderr).toBe('');
    expect(exit).toBe(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 10000);
