import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, expect, it } from 'bun:test';

import { readReadiness } from './hold-readiness';
import {
  createDecision,
  formatIdentity,
  readDecision,
  releaseHold,
  verifyHold,
} from './hold-token';
import { createHold } from './hold-token';
import { identifySelf } from './process-identity';
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
function path() {
  const root = mkdtempSync(join(tmpdir(), 'puni hold decision '));
  roots.push(root);
  return join(root, 'hold.ready');
}
for (const kind of ['ready', 'cancelled', 'retired'] as const)
  it('publishes an immutable tagged ' + kind + ' decision with a complete identity', () => {
    const file = path(),
      identity = identifySelf(),
      decision = createDecision(file, kind, identity);
    expect(readFileSync(file, 'utf8')).toBe(kind + ' ' + formatIdentity(identity));
    expect(readDecision(file)).toEqual(decision);
    expect(decision.kind).toBe(kind);
    expect(decision.identity).toEqual(identity);
    expect(verifyHold(decision)).toBe('present');
    expect(() => createDecision(file, kind, identity)).toThrow();
    releaseHold(decision);
    expect(readDecision(file)).toBe(undefined);
  });
for (const prefix of ['', 'unknown ', 'ready ready ', '\ufeffready '])
  it('refuses an untagged or malformed decision prefix ' + JSON.stringify(prefix), () => {
    const file = path();
    writeFileSync(file, prefix + formatIdentity(identifySelf()), { mode: 0o600 });
    expect(() => readDecision(file)).toThrow();
  });
it('preserves the original tagged decision witness when its same inode bytes change', () => {
  const file = path(),
    decision = createDecision(file, 'ready', identifySelf());
  writeFileSync(file, 'retired ' + formatIdentity(decision.identity));
  expect(() => verifyHold(decision)).toThrow();
  expect(() => releaseHold(decision)).toThrow();
  expect(readDecision(file)?.kind).toBe('retired');
});

for (const kind of ['cancelled', 'retired'] as const)
  it('never admits a ' + kind + ' decision as Ready', () => {
    const decisionFile = path(),
      holdFile = decisionFile.slice(0, -6),
      identity = identifySelf();
    createHold(holdFile, identity);
    createDecision(decisionFile, kind, identity);
    captureReadiness('readiness-kind-' + kind, holdFile, decisionFile, identity);
    expect(() => readReadiness(holdFile, identity)).toThrow('readiness does not match');
  });
it('requires exact complete birth for tagged Ready observation', () => {
  const decisionFile = path(),
    holdFile = decisionFile.slice(0, -6),
    identity = identifySelf();
  expect(readReadiness(holdFile, identity)).toEqual({ kind: 'pending', reason: 'hold-absent' });
  createHold(holdFile, identity);
  expect(readReadiness(holdFile, identity)).toEqual({ kind: 'pending', reason: 'decision-absent' });
  const ready = createDecision(decisionFile, 'ready', identity);
  expect(readReadiness(holdFile, identity).kind).toBe('ready');
  expect(() =>
    readReadiness(holdFile, { ...identity, start: String(BigInt(identity.start) + 1n) }),
  ).toThrow('recorded birth');
  releaseHold(ready);
});

for (const removed of ['hold', 'ready'] as const)
  it(
    'refuses Ready when the ' +
      removed +
      ' snapshot is removed between observation and verification',
    () => {
      const decisionFile = path(),
        holdFile = decisionFile.slice(0, -6),
        identity = identifySelf();
      createHold(holdFile, identity);
      createDecision(decisionFile, 'ready', identity);
      const program = [
        'import{mock}from"bun:test";const fs=await import("node:fs"),tokens=await import(' +
          JSON.stringify(new URL('./hold-token.ts', import.meta.url).href) +
          '),read=tokens.readDecision;',
        'await mock.module(' +
          JSON.stringify(new URL('./hold-token.ts', import.meta.url).href) +
          ',()=>({...tokens,readDecision(path){const decision=read(path);if(decision!==undefined)fs.unlinkSync(' +
          JSON.stringify(removed === 'hold' ? holdFile : decisionFile) +
          ');return decision;}}));',
        'const module=await import(' +
          JSON.stringify(new URL('./hold-readiness.ts', import.meta.url).href) +
          ');let observation;try{observation=module.readReadiness(' +
          JSON.stringify(holdFile) +
          ',' +
          JSON.stringify(identity) +
          ');}catch(cause){observation={kind:"refused",message:cause.message};}process.stdout.write(JSON.stringify(observation,(_key,value)=>typeof value==="bigint"?value.toString():value));',
      ].join('\n');
      new Bun.Transpiler({ loader: 'ts' }).transformSync(program);
      const capture = process.env['PUNI_HOLDER_R5_CAPTURE'];
      if (capture !== undefined) {
        mkdirSync(capture, { recursive: true, mode: 0o700 });
        writeFileSync(
          join(capture, 'readiness-' + removed + '-input.json'),
          JSON.stringify(
            {
              program,
              holdFile,
              decisionFile,
              identity,
              hold: readFileSync(holdFile, 'utf8'),
              ready: readFileSync(decisionFile, 'utf8'),
            },
            null,
            2,
          ),
          { flag: 'wx', mode: 0o600 },
        );
      }
      const child = Bun.spawnSync(
        [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program],
        { stdout: 'pipe', stderr: 'pipe', timeout: 3000 },
      );
      if (capture !== undefined)
        writeFileSync(
          join(capture, 'readiness-' + removed + '-output.json'),
          JSON.stringify(
            {
              exitCode: child.exitCode,
              stdout: child.stdout.toString(),
              stderr: child.stderr.toString(),
            },
            null,
            2,
          ),
          { flag: 'wx', mode: 0o600 },
        );
      expect(child.exitCode, child.stderr.toString()).toBe(0);
      expect(JSON.parse(child.stdout.toString())).toEqual({
        kind: 'refused',
        message: 'guard readiness changed during observation',
      });
    },
  );

function captureReadiness(
  name: string,
  holdFile: string,
  decisionFile: string,
  expected: ReturnType<typeof identifySelf>,
): void {
  const capture = process.env['PUNI_HOLDER_R5_CAPTURE'];
  if (capture === undefined) return;
  mkdirSync(capture, { recursive: true, mode: 0o700 });
  writeFileSync(
    join(capture, name + '-input.json'),
    JSON.stringify(
      {
        holdFile,
        decisionFile,
        expected,
        hold: readFileSync(holdFile, 'utf8'),
        decision: readFileSync(decisionFile, 'utf8'),
      },
      null,
      2,
    ),
    { flag: 'wx', mode: 0o600 },
  );
}
for (const foreign of ['hold', 'ready'] as const)
  it(
    'refuses an independently foreign ' +
      foreign +
      ' birth while the other readiness witness matches',
    () => {
      const decisionFile = path(),
        holdFile = decisionFile.slice(0, -6),
        expected = identifySelf(),
        changed = { ...expected, start: String(BigInt(expected.start) + 1n) };
      createHold(holdFile, foreign === 'hold' ? changed : expected);
      createDecision(decisionFile, 'ready', foreign === 'ready' ? changed : expected);
      captureReadiness('readiness-birth-' + foreign, holdFile, decisionFile, expected);
      expect(() => readReadiness(holdFile, expected)).toThrow('recorded birth');
    },
  );
