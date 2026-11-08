import { chmod, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { createReadinessByteTransportFixture } from '../fixtures/product-readiness-byte-transport';

for (const fault of ['none', 'missing', 'resolution', 'content', 'identity', 'mode'] as const)
  test(`readiness byte peer ${fault} preserves exact local startup mapping`, async () => {
    const fixture = await createReadinessByteTransportFixture();
    const path = fixture.environment.READINESS_MODEL_DOCKER;
    const environment = { ...fixture.environment };
    try {
      if (fault === 'missing') delete (environment as NodeJS.ProcessEnv)['READINESS_MODEL_DOCKER'];
      if (fault === 'resolution') environment.PATH = '/usr/bin:/bin';
      if (fault === 'content') await writeFile(path, '#!/bin/sh\nexit 0\n');
      if (fault === 'identity') {
        const contents = await readFile(path);
        await rename(path, path + '.original');
        await writeFile(path, contents, { flag: 'wx', mode: 0o700 });
      }
      if (fault === 'mode') await chmod(path, 0o755);
      const validator = new URL('../fixtures/product-readiness-byte-transport.ts', import.meta.url)
        .pathname;
      const transport = new URL('./docker-exec.ts', import.meta.url).pathname;
      const pid = join(fixture.directory, 'pid');
      const receipt = join(fixture.directory, 'receipt');
      const nonce = 'readinessPeer';
      await writeFile(
        receipt,
        ['SESSION', nonce, '70001', '70001', '70001', '80001', 'DONE', nonce, '2'].join('\0') +
          '\0',
      );
      const child = Bun.spawn(
        [
          process.execPath,
          '-e',
          `
        import {assertReadinessByteTransportFixture} from ${JSON.stringify(validator)};
        import {runDockerExec} from ${JSON.stringify(transport)};
        await assertReadinessByteTransportFixture();
        const frames=[];
        await runDockerExec(['--',${JSON.stringify(nonce)},${JSON.stringify(receipt)},${JSON.stringify(pid)}],
          ${JSON.stringify(nonce)},token=>{frames.push(token);return token==='2'&&frames.at(-3)==='DONE';},AbortSignal.timeout(4000));
        const childPid=Number(await Bun.file(${JSON.stringify(pid)}).text());
        let absent=false;
        try{process.kill(childPid,0);}catch(cause){if(cause.code!=='ESRCH')throw cause;absent=true;}
        if(!absent)throw new Error('owned healthy byte peer remains');
        process.stdout.write(JSON.stringify(frames));
      `,
        ],
        {
          env: environment,
          stdin: 'ignore',
          stdout: 'pipe',
          stderr: 'pipe',
          killSignal: 'SIGKILL',
        },
      );
      try {
        const [stdout, stderr, code] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ]);
        if (fault === 'none') {
          expect({ stderr, code }).toEqual({ stderr: '', code: 0 });
          expect(JSON.parse(stdout)).toEqual([
            'SESSION',
            nonce,
            '70001',
            '70001',
            '70001',
            '80001',
            'DONE',
            nonce,
            '2',
            'REAPED',
            nonce,
          ]);
        } else {
          expect(code).not.toBe(0);
          expect(stderr).toContain('local readiness byte peer');
          expect(await Bun.file(pid).exists()).toBe(false);
        }
      } finally {
        child.kill('SIGKILL');
        await child.exited;
      }
    } finally {
      await rm(fixture.directory, { recursive: true });
    }
  }, 10000);

for (const fault of ['ack', 'eof'] as const)
  test(`readiness byte peer refuses missing ${fault} and joins before fallback watchdog`, async () => {
    const fixture = await createReadinessByteTransportFixture();
    const nonce = 'readinessPeer';
    const receipt = join(fixture.directory, 'receipt');
    await writeFile(receipt, 'DONE\0' + nonce + '\0' + '2\0');
    const child = Bun.spawn(
      [
        fixture.environment.READINESS_MODEL_DOCKER,
        '--',
        nonce,
        receipt,
        join(fixture.directory, 'pid'),
      ],
      {
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
        killSignal: 'SIGKILL',
      },
    );
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, 7000);
    try {
      await child.stdin.write(`ACK ${fault === 'ack' ? 'wrong' : nonce}\n`);
      if (fault === 'ack') await child.stdin.end();
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(code).not.toBe(0);
      expect(stderr).toBe('');
      expect(stdout).not.toContain('REAPED');
      if (fault === 'eof') expect(child.signalCode).toBe('SIGALRM');
      else expect(code).toBe(77);
    } finally {
      clearTimeout(timer);
      child.kill('SIGKILL');
      await child.exited;
      await rm(fixture.directory, { recursive: true });
    }
  }, 10000);
