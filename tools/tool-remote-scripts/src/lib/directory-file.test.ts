import {
  closeSync,
  constants,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { mkdir } from 'node:fs/promises';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { renameDirectoryFileNoReplace } from './directory-file';

for (const [platform, architecture] of [
  ['darwin', 'arm64'],
  ['linux', 'arm64'],
] as const) {
  test(`native site creation refuses unsupported ${platform}/${architecture} before creation`, async () => {
    const directory = scratchSync('site-native-platform-');
    const parent = `${directory}/caddy`;
    await mkdir(parent);
    const program = `
      import {openSync,closeSync,constants,existsSync} from 'node:fs';
      Object.defineProperty(process,'platform',{value:${JSON.stringify(platform)}});
      Object.defineProperty(process,'arch',{value:${JSON.stringify(architecture)}});
      const {openDirectoryFile}=await import(${JSON.stringify(`${import.meta.dir}/directory-file.ts`)});
      const descriptor=openSync(${JSON.stringify(parent)},constants.O_RDONLY|constants.O_DIRECTORY);
      let refused=false;
      try {openDirectoryFile(descriptor,'private',constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW);}
      catch(cause){if(!String(cause).includes('requires Linux x64'))throw cause;refused=true;}
      finally{closeSync(descriptor);}
      if(!refused || existsSync(${JSON.stringify(`${parent}/private`)}))throw new Error('unsupported ABI reached native creation');
    `;
    await runArchiveChild(program);
  });
}

function withArchiveDirectory(run: (directory: number, root: string) => void): void {
  const root = scratchSync('archive-relative-');
  const directory = openSync(root, constants.O_RDONLY | constants.O_DIRECTORY);
  try {
    run(directory, root);
  } finally {
    closeSync(directory);
  }
}

test('no-replace moves exact inode and bytes and leaves source ENOENT', () => {
  withArchiveDirectory((directory, root) => {
    writeFileSync(root + '/source', Buffer.from([0, 10, 255, 42]));
    const original = lstatSync(root + '/source', { bigint: true });
    renameDirectoryFileNoReplace(directory, 'source', 'archive');
    const archived = lstatSync(root + '/archive', { bigint: true });
    expect([archived.dev, archived.ino]).toEqual([original.dev, original.ino]);
    expect(readFileSync(root + '/archive')).toEqual(Buffer.from([0, 10, 255, 42]));
    expect(() => lstatSync(root + '/source')).toThrow('ENOENT');
  });
});

test('no-replace collision preserves both original inodes and bytes', () => {
  withArchiveDirectory((directory, root) => {
    writeFileSync(root + '/source', 'retained source');
    writeFileSync(root + '/archive', 'foreign archive');
    const source = lstatSync(root + '/source', { bigint: true });
    const target = lstatSync(root + '/archive', { bigint: true });
    expect(() => {
      renameDirectoryFileNoReplace(directory, 'source', 'archive');
    }).toThrow('no-replace rename failed');
    expect(lstatSync(root + '/source', { bigint: true }).ino).toBe(source.ino);
    expect(lstatSync(root + '/archive', { bigint: true }).ino).toBe(target.ino);
    expect(readFileSync(root + '/source', 'utf8')).toBe('retained source');
    expect(readFileSync(root + '/archive', 'utf8')).toBe('foreign archive');
  });
});

for (const replacement of ['directory', 'symlink'] as const) {
  test(`no-replace retained parent survives ${replacement} pathname replacement`, () => {
    const root = scratchSync('archive-parent-');
    mkdirSync(root + '/selected');
    mkdirSync(root + '/foreign');
    writeFileSync(root + '/selected/source', 'selected bytes');
    writeFileSync(root + '/foreign/source', 'foreign source');
    writeFileSync(root + '/foreign/archive', 'foreign archive');
    const original = lstatSync(root + '/selected/source', { bigint: true });
    const directory = openSync(root + '/selected', constants.O_RDONLY | constants.O_DIRECTORY);
    try {
      renameSync(root + '/selected', root + '/retained');
      if (replacement === 'directory') renameSync(root + '/foreign', root + '/selected');
      else symlinkSync(root + '/foreign', root + '/selected');
      renameDirectoryFileNoReplace(directory, 'source', 'archive');
      expect(lstatSync(root + '/retained/archive', { bigint: true }).ino).toBe(original.ino);
      expect(readFileSync(root + '/retained/archive', 'utf8')).toBe('selected bytes');
      expect(() => lstatSync(root + '/retained/source')).toThrow('ENOENT');
      expect(readFileSync(root + '/selected/source', 'utf8')).toBe('foreign source');
      expect(readFileSync(root + '/selected/archive', 'utf8')).toBe('foreign archive');
    } finally {
      closeSync(directory);
    }
  });
}

for (const name of ['', '.', '..', 'nested/name', '/absolute', 'source\0tail']) {
  for (const operand of ['source', 'target'] as const) {
    test(`no-replace rejects malformed ${operand} ${JSON.stringify(name)} before native mutation`, () => {
      withArchiveDirectory((directory, root) => {
        writeFileSync(root + '/source', 'selected source');
        expect(() => {
          renameDirectoryFileNoReplace(
            directory,
            operand === 'source' ? name : 'source',
            operand === 'target' ? name : 'archive',
          );
        }).toThrow('requires single basenames');
        expect(readFileSync(root + '/source', 'utf8')).toBe('selected source');
        expect(() => lstatSync(root + '/archive')).toThrow('ENOENT');
      });
    });
  }
}

for (const descriptor of [-1, -100, 0.5, NaN, Infinity, 2147483648, 4294967296]) {
  test(`no-replace rejects descriptor outside nonnegative native i32: ${String(descriptor)}`, () => {
    expect(() => {
      renameDirectoryFileNoReplace(descriptor, 'source', 'archive');
    }).toThrow('requires native directory descriptor');
  });
}

test('no-replace refuses real syscall failures without reporting a move', () => {
  withArchiveDirectory((directory, root) => {
    expect(() => {
      renameDirectoryFileNoReplace(directory, 'missing', 'archive');
    }).toThrow('no-replace rename failed');
    writeFileSync(root + '/source', 'source bytes');
    const file = openSync(root + '/source', constants.O_RDONLY);
    try {
      expect(() => {
        renameDirectoryFileNoReplace(file, 'source', 'archive');
      }).toThrow('no-replace rename failed');
    } finally {
      closeSync(file);
    }
    expect(readFileSync(root + '/source', 'utf8')).toBe('source bytes');
    expect(() => lstatSync(root + '/archive')).toThrow('ENOENT');
  });
});

async function runArchiveChild(program: string): Promise<void> {
  const child = Bun.spawn([process.execPath, '-e', program], { stdout: 'pipe', stderr: 'pipe' });
  const stdout = new Response(child.stdout).text();
  const stderr = new Response(child.stderr).text();
  try {
    const [code, output, errors] = await Promise.all([child.exited, stdout, stderr]);
    expect({ code, output, errors }).toEqual({ code: 0, output: '', errors: '' });
  } finally {
    await Promise.allSettled([child.exited, stdout, stderr]);
  }
}

for (const [platform, architecture] of [
  ['darwin', 'arm64'],
  ['linux', 'arm64'],
] as const) {
  test(`no-replace refuses unsupported ${platform}/${architecture} before loading optional symbol`, async () => {
    const root = scratchSync('archive-abi-');
    writeFileSync(root + '/source', 'retained source');
    await runArchiveChild(`
      import {openSync,closeSync,constants,readFileSync,existsSync} from 'node:fs';
      Object.defineProperty(process,'platform',{value:${JSON.stringify(platform)}});
      Object.defineProperty(process,'arch',{value:${JSON.stringify(architecture)}});
      const {renameDirectoryFileNoReplace}=await import(${JSON.stringify(import.meta.dir + '/directory-file.ts')});
      const directory=openSync(${JSON.stringify(root)},constants.O_RDONLY|constants.O_DIRECTORY);
      let refused=false;
      try { renameDirectoryFileNoReplace(directory,'source','archive'); }
      catch(cause) { if(!String(cause).includes('requires Linux x64')) throw cause; refused=true; }
      finally {closeSync(directory);}
      if(!refused || existsSync(${JSON.stringify(root + '/archive')}) || readFileSync(${JSON.stringify(root + '/source')},'utf8')!=='retained source') throw new Error('unsupported ABI reached rename');
    `);
  });
}

for (const fault of ['missing-symbol', 'load-failure'] as const) {
  test(`optional renameat2 ${fault} preserves old open and replacing rename`, async () => {
    const root = scratchSync('archive-symbol-');
    await runArchiveChild(`
    import * as ffi from 'bun:ffi';
    import {mock} from 'bun:test';
    import {openSync,closeSync,constants,writeFileSync,readFileSync,existsSync} from 'node:fs';
    const load=ffi.dlopen;
    let optionalLoads=0;
    mock.module('bun:ffi',()=>({...ffi,dlopen:(library,definitions)=>{
      if('renameat2' in definitions){
        optionalLoads++;
        if(${JSON.stringify(fault)} === 'missing-symbol') return load(library,{puni_archive_missing_symbol:definitions.renameat2});
        throw new Error('injected renameat2 load failure');
      }
      return load(library,definitions);
    }}));
    const {openDirectoryFile,renameDirectoryFile,renameDirectoryFileNoReplace}=await import(${JSON.stringify(import.meta.dir + '/directory-file.ts')});
    if(optionalLoads!==0)throw new Error('optional symbol loaded during import');
    const directory=openSync(${JSON.stringify(root)},constants.O_RDONLY|constants.O_DIRECTORY);
    try {
      for(const phase of ['before','after']) {
        const descriptor=openDirectoryFile(directory,'source',constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY);
        try{writeFileSync(descriptor,phase);}finally{closeSync(descriptor);}
        writeFileSync(${JSON.stringify(root + '/archive')},'replaced bytes');
        renameDirectoryFile(directory,'source','archive');
        if(readFileSync(${JSON.stringify(root + '/archive')},'utf8')!==phase)throw new Error('old replacing rename broken');
        if(phase==='before') {
          writeFileSync(${JSON.stringify(root + '/source')},'retained source');
          let refused=false;
          try{renameDirectoryFileNoReplace(directory,'source','optional-archive');}
          catch(cause){if(!String(cause).includes(${JSON.stringify(fault === 'missing-symbol' ? 'puni_archive_missing_symbol' : 'injected renameat2 load failure')}))throw cause;refused=true;}
          if(!refused || optionalLoads!==1 || existsSync(${JSON.stringify(root + '/optional-archive')}) || readFileSync(${JSON.stringify(root + '/source')},'utf8')!=='retained source')throw new Error('missing symbol did not refuse');
          renameDirectoryFile(directory,'source','archive');
        }
      }
    } finally {closeSync(directory);}
  `);
  });
}
