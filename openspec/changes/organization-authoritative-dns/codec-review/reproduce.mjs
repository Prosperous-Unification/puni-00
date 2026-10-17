import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { log } from 'node:console';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const require = createRequire(process.cwd() + '/package.json');
const packet = require('dns-packet');
const message = require('dns-message');

const owner = '_wbs-verification.example.com';
const ordinary = Buffer.from(
  '123480000001000000000000' +
    '115f7762732d766572696669636174696f6e076578616d706c6503636f6d00' +
    '00100001',
  'hex',
);
assert.equal(packet.decode(ordinary).questions[0].name, owner);
const ambiguous = Buffer.from(ordinary);
ambiguous[30] = 11;
ambiguous[38] = 46;
assert.equal(packet.decode(ambiguous).questions[0].name, owner);
assert.equal(packet.name.decode(ambiguous, 12, { mail: true }), '_wbs-verification.example\\.com');
log('dns-packet: two different wire label sequences decode to identical exact-owner string');
log('dns-packet: exported name.decode mail option preserves escaped dot distinction');

const excessive = Buffer.from('123480000000ffff00000000', 'hex');
const NativeArray = globalThis.Array;
const allocations = [];
const observedArray = new Proxy(NativeArray, {
  construct(target, arguments_, receiver) {
    if (typeof arguments_[0] === 'number') allocations.push(arguments_[0]);
    return Reflect.construct(target, arguments_, receiver);
  },
});
const codecModule = { exports: {} };
runInNewContext(readFileSync('node_modules/dns-packet/index.js', 'utf8'), {
  module: codecModule,
  exports: codecModule.exports,
  require: createRequire(require.resolve('dns-packet')),
  Array: observedArray,
});
assert.throws(() => codecModule.exports.decode(excessive));
assert.ok(allocations.includes(65_535));
log('dns-packet: oversized header allocated 65535-entry section before rejecting short packet');

const malformedNs = Buffer.from(
  '123480000000000100000000' + '00' + '000200010000003c0001' + '016100',
  'hex',
);
const acceptedNs = packet.decode(malformedNs);
assert.equal(acceptedNs.answers[0].data, 'a');
assert.equal(packet.decode.bytes, malformedNs.length - 2);
log('dns-packet: NS RDLENGTH=1 consumed three-byte name beyond declared RDATA without rejecting');

const cyclic = Buffer.from('123480000001000000000000c00c00100001', 'hex');
assert.throws(() => packet.decode(cyclic), /bad pointer/);
assert.equal(message.decode(cyclic).questions[0].name, '.');
log('dns-packet: cyclic compression rejected; dns-message: same cyclic name accepted as root');

const tooLong = Buffer.concat([
  Buffer.from('123480000001000000000000', 'hex'),
  ...Array.from({ length: 5 }, () => Buffer.concat([Buffer.from([63]), Buffer.alloc(63, 97)])),
  Buffer.from('0000100001', 'hex'),
]);
assert.throws(() => packet.decode(tooLong), /name too long/);
assert.equal(message.decode(tooLong).questions[0].name.length, 319);
log('dns-message: 321-byte expanded name accepted; dns-packet rejects name-length violation');

for (const path of [
  'node_modules/dns-packet/index.js',
  'node_modules/dns-message/dist/dns-message.mjs',
]) {
  log(`${path} sha256=${createHash('sha256').update(readFileSync(path)).digest('hex')}`);
}
