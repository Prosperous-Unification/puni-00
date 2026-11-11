import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, expect, it } from 'bun:test';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

for (const mode of ['success', 'sequential', 'overlap', 'resources', 'arguments'] as const) {
  it(
    'returns explicit Dash ' + mode + ' statuses without touching the executable exit code',
    () => {
      const root = mkdtempSync(join(tmpdir(), 'puni-dash-status-'));
      roots.push(root);
      const program = [
        'import{mock}from"bun:test";',
        'const source=' + JSON.stringify(new URL('./cli.ts', import.meta.url).href) + ';',
        'const resource=' +
          JSON.stringify(new URL('./resources/command.ts', import.meta.url).href) +
          ';',
        'const mode=' +
          JSON.stringify(mode) +
          ';const config=' +
          JSON.stringify(join(root, 'absent.json')) +
          ';',
        'if(mode==="resources")mock.module(resource,()=>({runResources:async()=>37}));const{runDash,runDashArguments}=await import(source);',
        'const gate=Promise.withResolvers(),entered=Promise.withResolvers();',
        'const deps={clock:{read:()=>1000},monotonic:{now:()=>0},planEnrollment:async()=>{entered.resolve();if(mode==="overlap")await gate.promise;},stdout:{write:()=>{throw new Error("unexpected stdout");}}};',
        'const plan={command:"plan-enrollment",fleet:"fleet.yaml",observation:"observation.json",output:"plan.json",node:"node",cluster:"cluster",inventorySha256:"a".repeat(64),ansibleVariablesSha256:"b".repeat(64),knownHostsSha256:"c".repeat(64)};',
        'process.exitCode=19;let report;',
        'try{if(mode==="resources"){const status=await runDash({command:"resources",action:"inspect",config},deps);report={status,after:process.exitCode};}else if(mode==="arguments"){const status=await runDashArguments(["ops","job","status","--config",config],deps);report={status,after:process.exitCode};}else if(mode==="success"){const status=await runDash(plan,deps);report={status,after:process.exitCode};}else if(mode==="sequential"){const refused=await runDash({command:"ops",words:"job status",config},deps);const between=process.exitCode;const status=await runDash(plan,deps);report={refused,status,between,after:process.exitCode};}else{let hasFinished=false;const pending=runDash(plan,deps);void pending.then(()=>{hasFinished=true;});await entered.promise;const refused=await runDash({command:"ops",words:"job status",config},deps);const between=process.exitCode;const beforeRelease=hasFinished;gate.resolve();const status=await pending;report={refused,status,beforeRelease,between,after:process.exitCode};}process.stdout.write(JSON.stringify(report));}finally{gate.resolve();process.exitCode=0;}',
      ].join('\n');
      const child = Bun.spawnSync(
        [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program],
        {
          cwd: import.meta.dir,
          env: { PATH: '/usr/bin:/bin' },
          stdout: 'pipe',
          stderr: 'pipe',
          timeout: 10000,
        },
      );
      expect(child.exitCode, child.stderr.toString()).toBe(0);
      const report: unknown = JSON.parse(child.stdout.toString());
      expect(report).toEqual(
        mode === 'resources'
          ? { status: 37, after: 19 }
          : mode === 'arguments'
            ? { status: 70, after: 19 }
            : mode === 'success'
              ? { status: 0, after: 19 }
              : mode === 'overlap'
                ? { refused: 70, status: 0, beforeRelease: false, between: 19, after: 19 }
                : { refused: 70, status: 0, between: 19, after: 19 },
      );
      if (mode !== 'success' && mode !== 'resources')
        expect(child.stderr.toString()).toContain('error: host pool ');
    },
  );
}

it('assigns the modeled native ops status only at the standalone executable', () => {
  const root = mkdtempSync(join(tmpdir(), 'puni-dash-exit-'));
  roots.push(root);
  const child = Bun.spawnSync(
    [
      process.execPath,
      '--no-env-file',
      '--config=/dev/null',
      fileURLToPath(new URL('./entrypoint.ts', import.meta.url)),
      'ops',
      'job',
      'status',
      '--config',
      join(root, 'absent.json'),
    ],
    {
      cwd: import.meta.dir,
      env: { PATH: '/usr/bin:/bin' },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 10000,
    },
  );
  expect(child.exitCode, child.stderr.toString()).toBe(70);
  expect(child.stdout.length).toBe(0);
  expect(child.stderr.toString()).toContain('error: host pool ');
});
