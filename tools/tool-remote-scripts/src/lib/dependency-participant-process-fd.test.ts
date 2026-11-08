import { chmod, copyFile, mkdtemp, readFile, readlink, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

test('source process executable bytes come from the captured named inode and actual descriptors close on every outcome', async () => {
  const root = await mkdtemp(join(tmpdir(), 'participant-executable-'));
  const named = join(root, 'sleep');
  const replacement = join(root, 'PRIVATE_same_bytes');
  let application: ReturnType<typeof Bun.spawn> | undefined;
  let observer: Bun.Subprocess<'ignore', 'pipe', 'pipe'> | undefined;
  try {
    await copyFile('/bin/sleep', named);
    await copyFile(named, replacement);
    await chmod(named, 0o700);
    const [originalStat, replacementStat] = await Promise.all([
      stat(named, { bigint: true }),
      stat(replacement, { bigint: true }),
    ]);
    expect(originalStat.ino).not.toBe(replacementStat.ino);
    expect(await readFile(named)).toEqual(await readFile(replacement));
    application = Bun.spawn([named, '30'], { stdout: 'ignore', stderr: 'ignore' });
    const procExecutable = `/proc/${String(application.pid)}/exe`;
    const deadline = performance.now() + 5000;
    while ((await readlink(procExecutable)) !== named) {
      if (performance.now() >= deadline) throw new Error('owned executable startup exhausted');
      await Bun.sleep(10);
    }
    const module = new URL('./dependency-participant-process.ts', import.meta.url).pathname;
    const program = `
      import * as filesystem from 'node:fs/promises';
      import { mock } from 'bun:test';
      const nativeOpen=filesystem.open;
      let mode='named',opened=0,closed=0;
      const retained=[];
      mock.module('node:fs/promises',()=>({...filesystem,open:async(path,...args)=>{
        if(path!==${JSON.stringify(procExecutable)})return nativeOpen(path,...args);
        const descriptor=await nativeOpen(mode==='replacement'?${JSON.stringify(replacement)}:path,...args);
        retained.push(descriptor);
        opened++;
        const nativeClose=descriptor.close.bind(descriptor);
        descriptor.close=async()=>{
          await nativeClose();
          try { await descriptor.stat(); }
          catch(cause){
            if(cause?.code!=='EBADF')throw cause;
            closed++;
            return;
          }
          throw new Error('native executable descriptor did not close');
        };
        if(mode==='read-error')descriptor.read=async()=>{throw new Error('PRIVATE_READ_FAILURE');};
        return descriptor;
      }}));
      const {observeParticipantProcess}=await import(${JSON.stringify(module)});
      const lifecycle=[];
      for(mode of ['named','replacement','read-error']){
        let accepted=false;
        try{
          await observeParticipantProcess(${String(application.pid)},performance.now()+10000);
          accepted=true;
        }catch(cause){
          if(!(cause instanceof Error)||cause.message!=='participant native process observation refused'||cause.cause!==undefined)throw cause;
        }
        lifecycle.push({mode,accepted,opened,closed});
      }
      process.stdout.write(JSON.stringify(lifecycle));
    `;
    observer = Bun.spawn([process.execPath, '--no-env-file', '-e', program], {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(observer.stdout).text(),
      new Response(observer.stderr).text(),
      observer.exited,
    ]);
    expect({ stderr, code }).toEqual({ stderr: '', code: 0 });
    const lifecycle: unknown = JSON.parse(stdout);
    expect(lifecycle).toEqual([
      { mode: 'named', accepted: true, opened: 1, closed: 1 },
      { mode: 'replacement', accepted: false, opened: 2, closed: 2 },
      { mode: 'read-error', accepted: false, opened: 3, closed: 3 },
    ]);
  } finally {
    observer?.kill('SIGKILL');
    application?.kill('SIGKILL');
    await Promise.all([observer?.exited, application?.exited]);
    await rm(root, { recursive: true, force: true });
  }
}, 20000);
