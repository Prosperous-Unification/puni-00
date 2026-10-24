import { readFile } from 'node:fs/promises';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

test('initializer CLI defaults to dry run and execute is exclusive', async () => {
  const directory = scratchSync('edge-policy-cli-');
  const run = async (argv: string[]) => {
    const child = Bun.spawn(
      [process.execPath, `${import.meta.dir}/initialize-edge-policy.ts`, ...argv],
      {
        env: { ...process.env, WBS_EDGE_STATE: directory },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    return {
      code: await child.exited,
      stdout: await new Response(child.stdout).text(),
      stderr: await new Response(child.stderr).text(),
    };
  };
  expect(await run([])).toMatchObject({ code: 0 });
  expect(await Bun.file(`${directory}/edge-policy.json`).exists()).toBe(false);
  expect(await run(['--execute', '--execute'])).toMatchObject({ code: 1 });
  expect(await run(['--execute'])).toMatchObject({ code: 0 });
  const bytes = await readFile(`${directory}/edge-policy.json`, 'utf8');
  expect(await run(['--execute'])).toMatchObject({ code: 1 });
  expect(await readFile(`${directory}/edge-policy.json`, 'utf8')).toBe(bytes);
});
