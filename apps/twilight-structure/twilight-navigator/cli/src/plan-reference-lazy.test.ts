import { closeSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { currentExportFixture } from './testing/current-export-fixtures';
import { scratchDirectory } from './testing/run-twin';
for (const versions of [
  [13, 14, 13],
  [7, 11, 7],
  [12, 12],
  [15, 16, 15],
  [13, 15, 14, 16],
])
  test(
    'historical/current decoder graphs are selected lazily and reused: ' + versions.join(','),
    async () => {
      const scratch = scratchDirectory();
      for (const version of versions)
        if (version === 15 || version === 16)
          writeFileSync(
            join(scratch.path, 'current-' + String(version) + '.json'),
            JSON.stringify(await currentExportFixture(version)),
          );
      const transcript = join(scratch.path, 'child.log');
      const descriptor = openSync(transcript, 'wx', 0o600);
      try {
        const script = `
import {mock} from 'bun:test';
const contracts=await import('@wbs/contracts');
const counts={eleven:0,twelve:0,frozen:0,current:0};let frozenDeclaration;
const original13=contracts.planDocumentV13;const frozen13=new Proxy(original13,{get(target,key,receiver){if(key==='or')return(...args)=>{frozenDeclaration=target.or(...args);return frozenDeclaration;};return Reflect.get(target,key,receiver);}});
const original11=contracts.createLegacyPlanDocumentV11;const original12=contracts.createLegacyPlanDocumentV12;const originalRequest=contracts.requestSchema;const declaration=contracts.planDocument;
mock.module('@wbs/contracts',()=>({...contracts,planDocumentV13:frozen13,createLegacyPlanDocumentV11:()=>{counts.eleven++;return original11();},createLegacyPlanDocumentV12:()=>{counts.twelve++;return original12();},requestSchema:(shape,...options)=>{if(shape===declaration)counts.current++;if(shape===frozenDeclaration)counts.frozen++;return originalRequest(shape,...options);}}));
const before=process.memoryUsage().rss;const importedAt=performance.now();
const {runPlanReference}=await import(${JSON.stringify(join(import.meta.dir, 'plan-reference.ts'))});
const imported={counts:{...counts},rss:process.memoryUsage().rss,ms:performance.now()-importedAt};
const directory=${JSON.stringify(scratch.path)};const fs=await import('node:fs');fs.writeFileSync(directory+'/requirements.md','Requirements\\n');
const readings=[];
for(const [index,version] of ${JSON.stringify(versions)}.entries()){const output=directory+'/'+String(index);fs.mkdirSync(output);const started=performance.now();await runPlanReference({command:'plan-reference',export:version===15||version===16?directory+'/current-'+String(version)+'.json':version===12?'openspec/changes/wbs-work-packages/fixtures/legacy-document12-connected.txt':'apps/twilight-structure/twilight-navigator/cli/src/fixtures/plan-export.v'+String(version)+'.json',repository:'repo',change:'change',planningCommit:'1'.repeat(40),sourceBase:'2'.repeat(40),requirements:directory+'/requirements.md',output});readings.push({version,counts:{...counts},rss:process.memoryUsage().rss,heap:process.memoryUsage().heapUsed,ms:performance.now()-started});}
console.log(JSON.stringify({before,imported,readings}));
`;
        const child = Bun.spawn({
          cmd: [process.execPath, '--tsconfig-override', 'tsconfig.base.json', '-e', script],
          cwd: join(import.meta.dir, '../../../../..'),
          stdout: descriptor,
          stderr: descriptor,
        });
        const exitCode = await child.exited;
        expect(exitCode, readFileSync(transcript, 'utf8')).toBe(0);
        const profile = JSON.parse(readFileSync(transcript, 'utf8')) as {
          imported: { counts: { eleven: number; twelve: number; frozen: number; current: number } };
          readings: {
            counts: { eleven: number; twelve: number; frozen: number; current: number };
          }[];
        };
        expect(profile.imported.counts).toEqual({ eleven: 0, twelve: 0, frozen: 0, current: 0 });
        const expected = { eleven: 0, twelve: 0, frozen: 0, current: 0 };
        for (const [index, reading] of profile.readings.entries()) {
          const version = versions.at(index);
          if (version === undefined) throw new Error('profile version missing');
          if (version <= 11) expected.eleven = 1;
          else if (version === 12) {
            expected.eleven = 1;
            expected.twelve = 1;
          } else if (version === 13 || version === 14) expected.frozen = 1;
          else expected.current = 1;
          expect(reading.counts).toEqual(expected);
        }
        process.stdout.write(
          'Navigator selected-decoder profile ' + JSON.stringify(profile) + '\n',
        );
      } finally {
        closeSync(descriptor);
        scratch.remove();
      }
    },
    60_000,
  );
