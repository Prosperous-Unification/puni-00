import { join } from 'node:path';

import { createLaunch } from '@shared/bun-startup';
import { expect, test } from 'bun:test';

function execute(program: string): unknown {
  const child = Bun.spawnSync(
    [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program],
    {
      cwd: import.meta.dir,
      env: { PATH: '/usr/bin:/bin' },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 15000,
    },
  );
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  return JSON.parse(child.stdout.toString());
}
const cli = new URL('./cli.ts', import.meta.url).href;
const capture =
  'import{mock}from"bun:test";mock.module(' +
  JSON.stringify(cli) +
  ',()=>({runDash:async(_request,deps)=>{await Promise.resolve();process.stdout.write(JSON.stringify(deps.helperPrefix));return 0;},runFleetPlan:()=>{throw new Error("unused fleet");}}));';
test('PUNI heavy dispatch appends canonical dash to the selected protected helper prefix', () => {
  const prefix = createLaunch(process.execPath, '/opt/selected PUNI/puni.mjs');
  const observed = execute(
    capture +
      'const{executeRequest}=await import(' +
      JSON.stringify(new URL('./runtime-facade.ts', import.meta.url).href) +
      ');await executeRequest({command:"resources",action:"inspect",config:"/unused"},{clock:{read:()=>0},monotonic:{now:()=>0},environment:{},write:()=>{},helperPrefix:' +
      JSON.stringify(prefix) +
      '});',
  );
  expect(observed).toEqual([...prefix, 'dash']);
});
test('standalone Dash composes its own protected installed helper without another namespace', () => {
  const entrypoint = join(import.meta.dir, 'entrypoint.ts');
  const observed = execute(
    capture +
      'process.argv=[process.execPath,' +
      JSON.stringify(entrypoint) +
      ',"resources","inspect","--config","/unused"];await import(' +
      JSON.stringify(new URL('./entrypoint.ts', import.meta.url).href) +
      ');',
  );
  expect(observed).toEqual(createLaunch(process.execPath, entrypoint));
});
test('resources resolves the selected helper lazily through its composed native factory', () => {
  const prefix = createLaunch(process.execPath, '/opt/selected Dash/entrypoint.mjs');
  const program =
    'import{mock}from"bun:test";mock.module(' +
    JSON.stringify(new URL('./resources/command.ts', import.meta.url).href) +
    ',()=>({runResources:async(_request,_clock,_write,_connect,resolveLock)=>{const lock=await resolveLock();process.stdout.write(JSON.stringify(lock.helperPrefix));return 0;}}));const{runDash}=await import(' +
    JSON.stringify(cli) +
    ');await runDash({command:"resources",action:"inspect",config:"/unused"},{clock:{read:()=>0},monotonic:{now:()=>0},stdout:{write:()=>{}},planEnrollment:()=>{},helperPrefix:' +
    JSON.stringify(prefix) +
    '});';
  expect(execute(program)).toEqual(prefix);
});
test('resources commands that ignore the factory do not resolve a native lock', () => {
  const program =
    'import{mock}from"bun:test";mock.module(' +
    JSON.stringify(new URL('./resources/command.ts', import.meta.url).href) +
    ',()=>({runResources:async()=>0}));const{runDash}=await import(' +
    JSON.stringify(cli) +
    ');const status=await runDash({command:"resources",action:"inspect",config:"/unused"},{clock:{read:()=>0},monotonic:{now:()=>0},stdout:{write:()=>{}},planEnrollment:()=>{},helperPrefix:[]});process.stdout.write(JSON.stringify({status}));';
  expect(execute(program)).toEqual({ status: 0 });
});
