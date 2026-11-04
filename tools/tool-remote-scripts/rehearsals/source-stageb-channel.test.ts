import { rejects } from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { Duplex, PassThrough, Writable } from 'node:stream';

import { expect, test } from 'bun:test';

import { sourceChannelRequest } from './source-participant-profile';
import {
  encodeSourceFrame,
  SourceChannelFailure,
  SourceFrameTransport,
  SourceProviderSession,
  SourceStageBChannel,
  SourceTransportBudget,
} from './source-stageb-channel';

const owned = {
  format: 'isolated-ci-owned-source',
  version: 1,
  id: 'a'.repeat(64),
  name: 'wbs-dev-src',
  created: '2026-10-24T00:00:00.000Z',
  imageId: `sha256:${'a'.repeat(64)}`,
  reference: `fixture/source@sha256:${'a'.repeat(64)}`,
  nonce: 'b'.repeat(32),
  sourceSha: 'c'.repeat(40),
  manifestSha256: 'd'.repeat(64),
  dependencySha256: 'e'.repeat(64),
  configurationSha256: 'f'.repeat(64),
} as const;
const request = (sequence = 1) =>
  sourceChannelRequest(owned.nonce, sequence, 'acknowledge-source-start');
const reply = (sequence = 1) => ({ ...request(sequence), status: 'acknowledged' });

function streams(deadline = performance.now() + 1500) {
  const input = new PassThrough();
  const output = new PassThrough();
  const budget = new SourceTransportBudget();
  const transport = new SourceFrameTransport({ input, output, budget, deadline });
  return { input, output, budget, transport, deadline };
}

/** Inert child only reads/writes fixed inherited framing descriptors, never product/provider code. */
function childChannel(
  mode: 'fragment' | 'wrong-sequence' | 'silent' | 'blocked-write' | 'truncated' | 'stdout-only',
) {
  const program = `
    import { readSync, writeSync } from 'node:fs';
    const mode = ${JSON.stringify(mode)};
    // Independent inert sentinels prove FD3/4 remain separate from framing FD5/6.
    for (const fd of [3,4]) { const token=Buffer.alloc(1);if(readSync(fd,token)!==1||token[0]!==fd)process.exit(73); }
    writeSync(2, 'sentinels-read\\n');
    if (mode === 'blocked-write') { setInterval(() => {}, 1000); }
    else {
      const exact = (length) => { const bytes = Buffer.alloc(length); let offset=0;
        while (offset < length) { const count=readSync(5, bytes, offset, length-offset); if(!count) process.exit(74); offset+=count; }
        return bytes; };
      const prefix=exact(4); const received=JSON.parse(exact(prefix.readUInt32BE()).toString());
      writeSync(2,'request-read\\n');
      if(mode === 'silent') setInterval(() => {},1000);
      else if(mode === 'truncated') {writeSync(6,Buffer.from([0,0]));process.exit(0);}
      else {
        const body=Buffer.from(JSON.stringify({...received,sequence:received.sequence+(mode==='wrong-sequence'?1:0),status:'acknowledged'}));
        const frame=Buffer.alloc(body.length+4);frame.writeUInt32BE(body.length);body.copy(frame,4);
        if(mode==='stdout-only') writeSync(1,frame);
        else if(mode==='fragment') { for(const byte of frame) writeSync(6,Buffer.from([byte])); }
        else writeSync(6,frame);
        writeSync(2,'reply-written\\n');setInterval(() => {},1000);
      }
    }
  `;
  const child = spawn(process.execPath, ['-e', program], {
    stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe', 'pipe', 'pipe'],
  });
  for (const fd of [3, 4]) {
    const sentinel = child.stdio[fd];
    if (!(sentinel instanceof Duplex)) throw new Error('inert sentinel pipe absent');
    sentinel.end(Buffer.from([fd]));
  }
  const outgoing = child.stdio.at(5);
  const incoming = child.stdio.at(6);
  if (!(outgoing instanceof Duplex) || !(incoming instanceof Duplex))
    throw new Error('owned inert child private pipes absent');
  const deadline = performance.now() + 3500;
  const controller = new AbortController();
  const transport = new SourceFrameTransport({
    input: incoming,
    output: outgoing,
    budget: new SourceTransportBudget(),
    deadline,
    signal: controller.signal,
  });
  let diagnostics = '';
  child.stderr?.on('data', (chunk) => {
    diagnostics += String(chunk);
  });
  const channel = new SourceStageBChannel(transport, owned, child, deadline);
  return {
    child,
    channel,
    transport,
    outgoing,
    incoming,
    deadline,
    controller,
    diagnostics: () => diagnostics,
  };
}

/** Fallback only settles this test's exact child; it cannot satisfy the channel join oracle. */
async function fallback(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = once(child, 'close');
  child.kill('SIGKILL');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      closed,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('owned inert child fallback failed to join'));
        }, 1000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

test('length-prefixed private frames charge body and prefix to the shared budget', () => {
  const budget = new SourceTransportBudget();
  const frame = encodeSourceFrame({ version: 1 }, budget);
  expect(frame.readUInt32BE(0)).toBe(13);
  expect(frame.subarray(4).toString()).toBe('{"version":1}');
  expect(budget.bytes).toBe(17);
  budget.charge(128 * 2 ** 20 - 17);
  expect(() => encodeSourceFrame(null, budget)).toThrow('raw budget exceeded');
  expect(budget.bytes).toBe(128 * 2 ** 20);
});

test('JSON body ceiling includes exact eight MiB and refuses its next byte', () => {
  expect(
    encodeSourceFrame('x'.repeat(8 * 2 ** 20 - 2), new SourceTransportBudget()).readUInt32BE(),
  ).toBe(8 * 2 ** 20);
  expect(() => encodeSourceFrame('x'.repeat(8 * 2 ** 20 - 1), new SourceTransportBudget())).toThrow(
    'frame length refused',
  );
  expect(() => encodeSourceFrame(undefined, new SourceTransportBudget())).toThrow('JSON absent');
});

test('provider consumes split and coalesced private frames with exact sequence', async () => {
  const io = streams();
  const provider = new SourceProviderSession(io.transport, owned);
  try {
    const first = encodeSourceFrame(request(), new SourceTransportBudget());
    const stop = sourceChannelRequest(owned.nonce, 2, 'stop-join-owned-source');
    const stopped = {
      ...stop,
      status: 'stopped',
      proof: {
        sourceStopped: true,
        processesAbsent: true,
        listenersClosed: true,
        helpersJoined: true,
      },
    };
    const second = encodeSourceFrame(stop, new SourceTransportBudget());
    io.input.write(first.subarray(0, 2));
    io.input.write(Buffer.concat([first.subarray(2), second]));
    expect(await provider.request(io.deadline)).toEqual(request());
    await provider.reply(reply(), io.deadline);
    expect(await provider.request(io.deadline)).toEqual(stop);
    await provider.reply(stopped, io.deadline);
    expect(io.budget.bytes).toBe(
      first.length +
        second.length +
        encodeSourceFrame(reply(), new SourceTransportBudget()).length +
        encodeSourceFrame(stopped, new SourceTransportBudget()).length,
    );
  } finally {
    io.transport.close();
  }
});

for (const [name, bytes] of [
  ['zero length', Buffer.from([0, 0, 0, 0])],
  ['invalid UTF8', Buffer.from([0, 0, 0, 1, 255])],
  ['invalid JSON', Buffer.from([0, 0, 0, 1, 123])],
  ['truncated prefix', Buffer.from([0, 0])],
  ['truncated body', Buffer.from([0, 0, 0, 3, 123])],
] as const) {
  test(`provider refuses ${name} before dispatch`, async () => {
    const io = streams();
    const provider = new SourceProviderSession(io.transport, owned);
    let effects = 0;
    try {
      io.input.end(bytes);
      await rejects(
        provider.request(io.deadline).then(() => {
          effects++;
        }),
      );
      expect(effects).toBe(0);
    } finally {
      io.transport.close();
    }
  });
}

test('oversized announced body is refused before a valid padded request can dispatch', async () => {
  const io = streams();
  const provider = new SourceProviderSession(io.transport, owned);
  const json = JSON.stringify(request());
  const body = Buffer.from(json + ' '.repeat(8 * 2 ** 20 + 1 - json.length));
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(body.length);
  let effects = 0;
  try {
    io.input.end(Buffer.concat([prefix, body]));
    await rejects(
      provider.request(io.deadline).then(() => {
        effects++;
      }),
      new RegExp('frame length refused'),
    );
    expect(effects).toBe(0);
    expect(io.budget.bytes).toBe(4);
  } finally {
    io.transport.close();
  }
});

for (const [name, corrupt] of [
  ['nonce', { ...request(), nonce: 'c'.repeat(32) }],
  ['version', { ...request(), version: 2 }],
  ['sequence', request(2)],
  ['operation', { ...request(), operation: 'arbitrary-command' }],
  ['target', { ...request(), target: '/unowned' }],
] as const) {
  test(`provider rejects wrong ${name} before dispatch`, async () => {
    const io = streams();
    const provider = new SourceProviderSession(io.transport, owned);
    let effects = 0;
    try {
      io.input.write(encodeSourceFrame(corrupt, new SourceTransportBudget()));
      await rejects(
        provider.request(io.deadline).then(() => {
          effects++;
        }),
      );
      expect(effects).toBe(0);
    } finally {
      io.transport.close();
    }
  });
}

test('provider rejects replay and cannot accept a reply without a pending request', async () => {
  const io = streams();
  const provider = new SourceProviderSession(io.transport, owned);
  try {
    io.input.write(encodeSourceFrame(request(), new SourceTransportBudget()));
    await provider.request(io.deadline);
    await provider.reply(reply(), io.deadline);
    io.input.write(encodeSourceFrame(request(), new SourceTransportBudget()));
    await rejects(provider.request(io.deadline));
    await rejects(provider.reply(reply(2), io.deadline));
  } finally {
    io.transport.close();
  }
});

test('inherited FD5/6 exchange accepts fragmented reply and joins its exact owned child', async () => {
  const io = childChannel('fragment');
  try {
    let received: unknown;
    try {
      received = await io.channel.exchange(request(), io.deadline - 500);
    } catch (cause) {
      throw new Error('inert framing child: ' + io.diagnostics(), { cause });
    }
    expect(received).toEqual(reply());
    await io.channel.closeAndJoin(io.deadline);
    expect(io.child.signalCode !== null || io.child.exitCode !== null).toBe(true);
    expect(io.incoming.destroyed).toBe(true);
    expect(io.outgoing.destroyed).toBe(true);
  } finally {
    await fallback(io.child);
  }
});

for (const mode of ['wrong-sequence', 'truncated'] as const) {
  test(`inherited child ${mode} reply permanently refuses later exchanges`, async () => {
    const io = childChannel(mode);
    try {
      await rejects(
        io.channel.exchange(request(), io.deadline - 500),
        new RegExp(
          mode === 'wrong-sequence' ? 'Source profile evidence refused' : 'truncated frame',
        ),
      );
      await rejects(io.channel.exchange(request(), io.deadline - 500), new RegExp('terminal'));
      await io.channel.closeAndJoin(io.deadline);
    } finally {
      await fallback(io.child);
    }
  });
}

test('read cancellation joins owned child without refreshing total deadline', async () => {
  const io = childChannel('silent');
  try {
    const pending = io.channel.exchange(request(), io.deadline - 500);
    io.controller.abort();
    await rejects(pending);
    await io.channel.closeAndJoin(io.deadline);
    await rejects(io.channel.exchange(request(), io.deadline), new RegExp('terminal'));
  } finally {
    await fallback(io.child);
  }
});

test('actual backpressured write deadline cancels its owned streams', async () => {
  const input = new PassThrough();
  const output = new Writable({
    write(_chunk, _encoding, _callback) {
      /* Intentionally held test writer until destroy. */
    },
  });
  const maximum = performance.now() + 1500;
  const io = new SourceFrameTransport({
    input,
    output,
    budget: new SourceTransportBudget(),
    deadline: maximum,
  });
  try {
    await rejects(io.write(request(), performance.now() + 50), new RegExp('deadline'));
    expect(input.destroyed).toBe(true);
    expect(output.destroyed).toBe(true);
  } finally {
    io.close();
  }
});

test('overlap visibly refuses and terminates the pending exchange', async () => {
  const io = childChannel('silent');
  try {
    const first = io.channel.exchange(request(), io.deadline - 500);
    const settled = first.catch((cause: unknown) => cause);
    await rejects(io.channel.exchange(request(2), io.deadline - 500), new RegExp('overlapping'));
    expect(await settled).toBeInstanceOf(Error);
    await io.channel.closeAndJoin(io.deadline);
  } finally {
    await fallback(io.child);
  }
});

test('cleanup failure retains primary privately and never permits a later exchange', async () => {
  const io = childChannel('wrong-sequence');
  try {
    await rejects(io.channel.exchange(request(), io.deadline - 500));
    const failure = await io.channel
      .closeAndJoin(performance.now() - 1)
      .catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(SourceChannelFailure);
    if (!(failure instanceof SourceChannelFailure)) throw new Error('private failure absent');
    expect(failure.primary).toBeDefined();
    expect(failure.cleanup).toHaveLength(1);
    await rejects(io.channel.exchange(request(), io.deadline - 500), new RegExp('terminal'));
  } finally {
    await fallback(io.child);
  }
});

test('actual inherited pipe backpressure is cancelled at the shorter write deadline', async () => {
  const io = childChannel('blocked-write');
  try {
    const pending = io.transport.write('x'.repeat(8 * 2 ** 20 - 2), performance.now() + 80);
    expect(io.outgoing.writableLength).toBeGreaterThan(0);
    await rejects(pending, new RegExp('deadline'));
    expect(io.outgoing.destroyed).toBe(true);
    await io.channel.closeAndJoin(io.deadline);
  } finally {
    await fallback(io.child);
  }
});

for (const mode of ['silent', 'stdout-only'] as const) {
  test(`inherited ${mode} cannot bypass the absolute private read deadline`, async () => {
    const io = childChannel(mode);
    try {
      await rejects(
        io.channel.exchange(request(), performance.now() + 100),
        new RegExp('deadline'),
      );
      await io.channel.closeAndJoin(io.deadline);
      expect(io.child.signalCode !== null || io.child.exitCode !== null).toBe(true);
    } finally {
      await fallback(io.child);
    }
  });
}

test('an exchange cannot extend the original channel deadline', async () => {
  const io = childChannel('silent');
  try {
    await rejects(io.channel.exchange(request(), io.deadline + 1), new RegExp('deadline refused'));
    await io.channel.closeAndJoin(io.deadline);
  } finally {
    await fallback(io.child);
  }
});

test('finite refused reply consumes sequence but keeps successful lifecycle phase unchanged', async () => {
  const io = streams();
  const provider = new SourceProviderSession(io.transport, owned);
  try {
    io.input.write(encodeSourceFrame(request(), new SourceTransportBudget()));
    await provider.request(io.deadline);
    await provider.reply({ ...request(), status: 'refused', reason: 'ownership' }, io.deadline);
    io.input.write(encodeSourceFrame(request(2), new SourceTransportBudget()));
    expect(await provider.request(io.deadline)).toEqual(request(2));
    await provider.reply(reply(2), io.deadline);
    io.input.write(encodeSourceFrame(request(3), new SourceTransportBudget()));
    await rejects(provider.request(io.deadline), new RegExp('Source profile evidence refused'));
  } finally {
    io.transport.close();
  }
});

/** Holds only the return of actual completed transport IO, never supplies an invented frame. */
function completionBarrier() {
  let completed: () => void = () => {
    throw new Error('completion latch uninitialized');
  };
  let release: () => void = () => {
    throw new Error('release latch uninitialized');
  };
  const reached = new Promise<void>((resolve) => {
    completed = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { reached, held, completed, release };
}

test('client completed real reply cannot escape after overlapping exchange poisons its continuation', async () => {
  const io = childChannel('fragment');
  const gate = completionBarrier();
  const read = io.transport.read.bind(io.transport);
  io.transport.read = async (deadline) => {
    const raw = await read(deadline);
    gate.completed();
    await gate.held;
    return raw;
  };
  try {
    const first = io.channel.exchange(request(), io.deadline - 500);
    const outcome = first.then(
      () => 'escaped',
      () => 'refused',
    );
    await gate.reached;
    await rejects(io.channel.exchange(request(2), io.deadline - 500), /overlapping/);
    gate.release();
    expect(await outcome).toBe('refused');
    await io.channel.closeAndJoin(io.deadline);
  } finally {
    gate.release();
    await fallback(io.child);
  }
});

test('provider completed real request cannot dispatch after overlapping request poisons its continuation', async () => {
  const io = streams();
  const provider = new SourceProviderSession(io.transport, owned);
  const gate = completionBarrier();
  const read = io.transport.read.bind(io.transport);
  io.transport.read = async (deadline) => {
    const raw = await read(deadline);
    gate.completed();
    await gate.held;
    return raw;
  };
  let effects = 0;
  try {
    io.input.write(encodeSourceFrame(request(), new SourceTransportBudget()));
    const first = provider.request(io.deadline).then(
      () => {
        effects++;
        return 'escaped';
      },
      () => 'refused',
    );
    await gate.reached;
    await rejects(provider.request(io.deadline), /overlapping/);
    gate.release();
    expect(await first).toBe('refused');
    expect(effects).toBe(0);
  } finally {
    gate.release();
    io.transport.close();
  }
});

test('provider completed real reply write cannot commit after overlapping reply poisons its continuation', async () => {
  const io = streams();
  const provider = new SourceProviderSession(io.transport, owned);
  const gate = completionBarrier();
  const write = io.transport.write.bind(io.transport);
  io.transport.write = async (raw, deadline) => {
    await write(raw, deadline);
    gate.completed();
    await gate.held;
  };
  try {
    io.input.write(encodeSourceFrame(request(), new SourceTransportBudget()));
    await provider.request(io.deadline);
    const first = provider.reply(reply(), io.deadline).then(
      () => 'committed',
      () => 'refused',
    );
    await gate.reached;
    await rejects(provider.reply(reply(), io.deadline), /without request/);
    gate.release();
    expect(await first).toBe('refused');
  } finally {
    gate.release();
    io.transport.close();
  }
});

test('owned child error is a private primary failure without an uncaught event or false join', async () => {
  const io = childChannel('silent');
  const cause = new Error('inert owned child control failed');
  try {
    expect(() => io.child.emit('error', cause)).not.toThrow();
    expect(() => io.child.emit('error', new Error('later inert child error'))).not.toThrow();
    await rejects(io.channel.exchange(request(), io.deadline - 500));
    const failure = await io.channel
      .closeAndJoin(performance.now() - 1)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SourceChannelFailure);
    if (!(failure instanceof SourceChannelFailure)) throw new Error('private failure absent');
    expect(failure.primary).toBe(cause);
    expect(failure.cleanup).toHaveLength(1);
    expect(io.incoming.destroyed).toBe(true);
    expect(io.outgoing.destroyed).toBe(true);
  } finally {
    await fallback(io.child);
  }
});

test('provider completed request rechecks poisoned transport even without a session overlap', async () => {
  const io = streams();
  const provider = new SourceProviderSession(io.transport, owned);
  const gate = completionBarrier();
  const read = io.transport.read.bind(io.transport);
  io.transport.read = async (deadline) => {
    const raw = await read(deadline);
    gate.completed();
    await gate.held;
    return raw;
  };
  try {
    io.input.write(encodeSourceFrame(request(), new SourceTransportBudget()));
    const first = provider.request(io.deadline).then(
      () => 'escaped',
      () => 'refused',
    );
    await gate.reached;
    io.transport.refuse(new Error('inert transport cancelled'));
    gate.release();
    expect(await first).toBe('refused');
  } finally {
    gate.release();
    io.transport.close();
  }
});

test('provider completed reply rechecks its shorter deadline before committing phase', async () => {
  const io = streams();
  const provider = new SourceProviderSession(io.transport, owned);
  const gate = completionBarrier();
  const write = io.transport.write.bind(io.transport);
  io.transport.write = async (raw, deadline) => {
    await write(raw, deadline);
    gate.completed();
    await gate.held;
  };
  try {
    io.input.write(encodeSourceFrame(request(), new SourceTransportBudget()));
    await provider.request(io.deadline);
    const deadline = performance.now() + 40;
    const first = provider.reply(reply(), deadline).then(
      () => 'committed',
      () => 'refused',
    );
    await gate.reached;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, Math.max(0, deadline - performance.now() + 2));
    });
    gate.release();
    expect(await first).toBe('refused');
  } finally {
    gate.release();
    io.transport.close();
  }
});

test('owned failed spawn rejects privately and close remains an independent join observation', async () => {
  const child = spawn(import.meta.dir + '/absent-inert-channel-child', [], { stdio: 'ignore' });
  let closed = false;
  child.once('close', () => {
    closed = true;
  });
  const hasClosed = () => closed;
  const io = streams();
  const channel = new SourceStageBChannel(io.transport, owned, child, io.deadline);
  try {
    const failure: unknown = await channel
      .exchange(request(), io.deadline - 100)
      .catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).toHaveProperty('code', 'ENOENT');
    expect(io.input.destroyed).toBe(true);
    expect(io.output.destroyed).toBe(true);
    await channel.closeAndJoin(io.deadline);
    expect(hasClosed()).toBe(true);
    await rejects(channel.exchange(request(), io.deadline), /terminal/);
  } finally {
    if (!hasClosed()) await fallback(child);
    io.transport.close();
  }
});

test('fatal UTF8 refuses a replacement character inside otherwise valid JSON text', async () => {
  const io = streams();
  try {
    io.input.end(Buffer.from([0, 0, 0, 3, 34, 255, 34]));
    await rejects(io.transport.read(io.deadline));
  } finally {
    io.transport.close();
  }
});

test('raw transport refuses malformed JSON independently of request semantics', async () => {
  const io = streams();
  try {
    io.input.end(Buffer.from([0, 0, 0, 1, 123]));
    await rejects(io.transport.read(io.deadline), SyntaxError);
  } finally {
    io.transport.close();
  }
});

test('shared accounting refuses invalid byte counts before changing its accepted total', () => {
  const budget = new SourceTransportBudget();
  for (const bytes of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER]) {
    expect(() => {
      budget.charge(bytes);
    }).toThrow('raw budget exceeded');
    expect(budget.bytes).toBe(0);
  }
});

test('transport construction refuses nonfinite or already expired original bounds', () => {
  for (const deadline of [NaN, Infinity, performance.now() - 1]) {
    const input = new PassThrough();
    const output = new PassThrough();
    try {
      expect(
        () =>
          new SourceFrameTransport({
            input,
            output,
            budget: new SourceTransportBudget(),
            deadline,
          }),
      ).toThrow('deadline refused');
    } finally {
      input.destroy();
      output.destroy();
    }
  }
});

test('shared wire budget refuses the actual write before its output consumer runs', async () => {
  let writes = 0;
  const output = new Writable({
    write(_chunk, _encoding, callback) {
      writes++;
      callback();
    },
  });
  const input = new PassThrough();
  const budget = new SourceTransportBudget();
  budget.charge(128 * 2 ** 20 - 1);
  const transport = new SourceFrameTransport({
    input,
    output,
    budget,
    deadline: performance.now() + 1000,
  });
  try {
    await rejects(transport.write(request()), /raw budget exceeded/);
    expect(writes).toBe(0);
  } finally {
    transport.close();
  }
});

test('outbound oversized JSON never reaches the actual write consumer', async () => {
  let writes = 0;
  const output = new Writable({
    write(_chunk, _encoding, callback) {
      writes++;
      callback();
    },
  });
  const input = new PassThrough();
  const transport = new SourceFrameTransport({
    input,
    output,
    budget: new SourceTransportBudget(),
    deadline: performance.now() + 1000,
  });
  try {
    await rejects(transport.write('x'.repeat(8 * 2 ** 20 - 1)), /frame length refused/);
    expect(writes).toBe(0);
  } finally {
    transport.close();
  }
});

for (const mode of ['expired', 'extended', 'nonfinite'] as const) {
  test(`buffered transport refuses ${mode} deadline before any wire read or return`, async () => {
    const io = streams();
    try {
      io.input.write(encodeSourceFrame(request(), new SourceTransportBudget()));
      const deadline =
        mode === 'expired'
          ? performance.now() - 1
          : mode === 'extended'
            ? io.deadline + 1
            : Infinity;
      await rejects(io.transport.read(deadline), /deadline refused/);
      expect(io.budget.bytes).toBe(0);
    } finally {
      io.transport.close();
    }
  });
}

test('write timer closes owned IO by its bound even when the writer never completes', async () => {
  const input = new PassThrough();
  let release: ((cause: Error) => void) | undefined;
  const output = new Writable({
    write(_chunk, _encoding, callback) {
      release = callback;
    },
  });
  const transport = new SourceFrameTransport({
    input,
    output,
    budget: new SourceTransportBudget(),
    deadline: performance.now() + 1000,
  });
  const pending = transport
    .write(request(), performance.now() + 25)
    .catch((cause: unknown) => cause);
  try {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 60);
    });
    const cancelled = input.destroyed && output.destroyed;
    transport.refuse(new Error('test fallback closes only stalled owned streams'));
    if (release === undefined) throw new Error('stalled writer was not entered');
    release(new Error('test fallback releases only its owned stalled writer'));
    await pending;
    expect(cancelled).toBe(true);
  } finally {
    transport.close();
  }
});

test('client request decoder refuses a wrong nonce before any transport write', async () => {
  const io = childChannel('silent');
  let writes = 0;
  const write = io.transport.write.bind(io.transport);
  io.transport.write = async (raw, deadline) => {
    writes++;
    await write(raw, deadline);
  };
  try {
    await rejects(
      io.channel.exchange({ ...request(), nonce: 'c'.repeat(32) }, performance.now() + 80),
    );
    expect(writes).toBe(0);
    await io.channel.closeAndJoin(io.deadline);
  } finally {
    await fallback(io.child);
  }
});

test('provider reply decoder refuses wrong correlation before any response write', async () => {
  const io = streams();
  const provider = new SourceProviderSession(io.transport, owned);
  let writes = 0;
  const write = io.transport.write.bind(io.transport);
  io.transport.write = async (raw, deadline) => {
    writes++;
    await write(raw, deadline);
  };
  try {
    io.input.write(encodeSourceFrame(request(), new SourceTransportBudget()));
    await provider.request(io.deadline);
    await rejects(provider.reply(reply(2), io.deadline));
    expect(writes).toBe(0);
  } finally {
    io.transport.close();
  }
});

test('client overlap is refused before a second transport write', async () => {
  const io = childChannel('silent');
  let writes = 0;
  const write = io.transport.write.bind(io.transport);
  io.transport.write = async (raw, deadline) => {
    writes++;
    await write(raw, deadline);
  };
  try {
    const first = io.channel
      .exchange(request(), io.deadline - 500)
      .catch((cause: unknown) => cause);
    await rejects(io.channel.exchange(request(), performance.now() + 80));
    await first;
    expect(writes).toBe(1);
    await io.channel.closeAndJoin(io.deadline);
  } finally {
    await fallback(io.child);
  }
});

test('provider overlap is refused before a second transport read', async () => {
  const io = streams(performance.now() + 100);
  const provider = new SourceProviderSession(io.transport, owned);
  let reads = 0;
  const read = io.transport.read.bind(io.transport);
  io.transport.read = async (deadline) => {
    reads++;
    return read(deadline);
  };
  try {
    const first = provider.request(io.deadline).catch((cause: unknown) => cause);
    await rejects(provider.request(io.deadline));
    await first;
    expect(reads).toBe(1);
  } finally {
    io.transport.close();
  }
});

test('owned child kill failure cannot replace its first error or masquerade as joined cleanup', async () => {
  const io = childChannel('silent');
  const primary = new Error('first inert child error');
  const cleanup = new Error('inert kill control failed');
  const kill = io.child.kill.bind(io.child);
  try {
    io.child.kill = () => {
      throw cleanup;
    };
    expect(() => io.child.emit('error', primary)).not.toThrow();
    io.child.kill = kill;
    const failure: unknown = await io.channel
      .closeAndJoin(io.deadline)
      .catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(SourceChannelFailure);
    if (!(failure instanceof SourceChannelFailure))
      throw new Error('private cleanup failure absent');
    expect(failure.primary).toBe(primary);
    expect(failure.cleanup).toContain(cleanup);
  } finally {
    io.child.kill = kill;
    await fallback(io.child);
  }
});

test('abort dispatch immediately cancels buffered private IO before it can return', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const controller = new AbortController();
  const transport = new SourceFrameTransport({
    input,
    output,
    budget: new SourceTransportBudget(),
    deadline: performance.now() + 1000,
    signal: controller.signal,
  });
  try {
    input.write(encodeSourceFrame(request(), new SourceTransportBudget()));
    controller.abort();
    expect(input.destroyed).toBe(true);
    expect(output.destroyed).toBe(true);
    await rejects(transport.read(), /cancelled/);
  } finally {
    transport.close();
  }
});

test('channel constructor cannot extend its transport original cleanup bound', async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  const io = streams(performance.now() + 500);
  try {
    expect(() => new SourceStageBChannel(io.transport, owned, child, io.deadline + 1000)).toThrow(
      'deadline refused',
    );
  } finally {
    io.transport.close();
    await fallback(child);
  }
});

test('caller mutation of endpoint configuration cannot refresh the captured original deadline', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const endpoints = {
    input,
    output,
    budget: new SourceTransportBudget(),
    deadline: performance.now() + 500,
  };
  const transport = new SourceFrameTransport(endpoints);
  try {
    endpoints.deadline += 1000;
    input.write(encodeSourceFrame(request(), new SourceTransportBudget()));
    await rejects(transport.read(endpoints.deadline), /deadline refused/);
    expect(endpoints.budget.bytes).toBe(0);
  } finally {
    transport.close();
  }
});

/** Actual inert child close precedes the independent supplied stream's gated async destroy. */
async function independentEndpoint(side: 'input' | 'output' = 'input') {
  const gate = completionBarrier();
  let finish: ((cause?: Error | null) => void) | undefined;
  const held = new PassThrough({
    destroy(_cause, callback) {
      finish = callback;
      gate.completed();
    },
  });
  const input = side === 'input' ? held : new PassThrough();
  const output = side === 'output' ? held : new PassThrough();
  const deadline = performance.now() + 1000;
  const transport = new SourceFrameTransport({
    input,
    output,
    budget: new SourceTransportBudget(),
    deadline,
  });
  const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
  const closed = once(child, 'close');
  const channel = new SourceStageBChannel(transport, owned, child, deadline);
  await closed;
  let released = false;
  const release = (cause?: Error) => {
    if (released) return;
    if (finish === undefined) throw new Error('owned endpoint destroy was not entered');
    released = true;
    finish(cause);
  };
  return { gate, held, input, output, transport, child, channel, deadline, release };
}

test.each(['input', 'output'] as const)(
  'closed child cannot prove join while independent %s destroy is still pending',
  async (side) => {
    const io = await independentEndpoint(side);
    let status = 'pending';
    const pending = io.channel.closeAndJoin(io.deadline).then(
      () => {
        status = 'joined';
      },
      () => {
        status = 'refused';
      },
    );
    try {
      await io.gate.reached;
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      expect(status).toBe('pending');
      expect(io.held.closed).toBe(false);
      io.release();
      await pending;
      expect(status).toBe('joined');
      expect(io.input.closed).toBe(true);
      expect(io.output.closed).toBe(true);
    } finally {
      io.release();
      await pending;
      await fallback(io.child);
    }
  },
);

test.each(['input', 'output'] as const)(
  'delayed %s endpoint destroy error remains a cleanup failure beside the original primary',
  async (side) => {
    const io = await independentEndpoint(side);
    const primary = new Error('inert original wire failure');
    const cleanup = new Error('inert endpoint destroy failed');
    try {
      io.transport.refuse(primary);
      const pending = io.channel.closeAndJoin(io.deadline).catch((cause: unknown) => cause);
      await io.gate.reached;
      io.release(cleanup);
      const failure: unknown = await pending;
      expect(failure).toBeInstanceOf(SourceChannelFailure);
      if (!(failure instanceof SourceChannelFailure))
        throw new Error('endpoint cleanup failure absent');
      expect(failure.primary).toBe(primary);
      expect(failure.cleanup).toContain(cleanup);
      expect(io.input.closed).toBe(true);
      expect(io.output.closed).toBe(true);
    } finally {
      io.release();
      await fallback(io.child);
    }
  },
);

test('an endpoint without close evidence is unproved at the same original join deadline', async () => {
  const io = await independentEndpoint();
  let fallbackReleased = false;
  const fallbackTimer = setTimeout(
    () => {
      fallbackReleased = true;
      io.release();
    },
    Math.max(0, io.deadline - performance.now() + 40),
  );
  try {
    const pending = io.channel.closeAndJoin(io.deadline).catch((cause: unknown) => cause);
    await io.gate.reached;
    const failure: unknown = await pending;
    expect(failure).toBeInstanceOf(SourceChannelFailure);
    if (!(failure instanceof SourceChannelFailure))
      throw new Error('unproved endpoint join absent');
    expect(fallbackReleased).toBe(false);
    expect(
      failure.cleanup.some(
        (cause) => cause instanceof Error && cause.message.includes('join deadline'),
      ),
    ).toBe(true);
    expect(io.input.closed).toBe(false);
    await rejects(io.channel.exchange(request(), io.deadline), /terminal/);
  } finally {
    clearTimeout(fallbackTimer);
    io.release();
    await fallback(io.child);
  }
});

test('endpoint record replacement cannot redirect owned IO budget cancellation or closure', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const budget = new SourceTransportBudget();
  const controller = new AbortController();
  const replacementInput = new PassThrough();
  const replacementOutput = new PassThrough();
  const replacementBudget = new SourceTransportBudget();
  const replacementController = new AbortController();
  const endpoints = {
    input,
    output,
    budget,
    signal: controller.signal,
    deadline: performance.now() + 1000,
  };
  const transport = new SourceFrameTransport(endpoints);
  let writes = 0;
  let replacementWrites = 0;
  output.on('data', () => {
    writes++;
  });
  replacementOutput.on('data', () => {
    replacementWrites++;
  });
  const inputClosed = once(input, 'close');
  const outputClosed = once(output, 'close');
  try {
    endpoints.input = replacementInput;
    endpoints.output = replacementOutput;
    endpoints.budget = replacementBudget;
    endpoints.signal = replacementController.signal;
    await transport.write(request());
    expect(writes).toBe(1);
    expect(replacementWrites).toBe(0);
    expect(budget.bytes).toBeGreaterThan(0);
    expect(replacementBudget.bytes).toBe(0);
    input.write(encodeSourceFrame(request(), new SourceTransportBudget()));
    replacementInput.write(encodeSourceFrame(request(2), new SourceTransportBudget()));
    expect(await transport.read()).toEqual(request());
    replacementController.abort();
    expect(input.destroyed).toBe(false);
    expect(output.destroyed).toBe(false);
    controller.abort();
    transport.close();
    await Promise.all([inputClosed, outputClosed]);
    expect(input.closed).toBe(true);
    expect(output.closed).toBe(true);
    expect(replacementInput.destroyed).toBe(false);
    expect(replacementOutput.destroyed).toBe(false);
  } finally {
    transport.close();
    input.destroy();
    output.destroy();
    replacementInput.destroy();
    replacementOutput.destroy();
  }
});

test.serial(
  'completed endpoint and child joins cannot return after the selected logical deadline',
  async () => {
    const original = Object.getOwnPropertyDescriptor(performance, 'now');
    const now = performance.now.bind(performance);
    let offset = 0;
    const io = streams(now() + 1000);
    const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
    const closed = once(child, 'close');
    const channel = new SourceStageBChannel(io.transport, owned, child, io.deadline);
    await closed;
    const actualClosed = io.transport.endpointSettlement;
    Object.defineProperty(io.transport, 'endpointSettlement', {
      get: () =>
        actualClosed.then(() => {
          offset = 2000;
        }),
    });
    Object.defineProperty(performance, 'now', { configurable: true, value: () => now() + offset });
    try {
      const failure: unknown = await channel
        .closeAndJoin(io.deadline)
        .catch((cause: unknown) => cause);
      expect(failure).toBeInstanceOf(SourceChannelFailure);
      if (!(failure instanceof SourceChannelFailure))
        throw new Error('expired join continuation was accepted');
      expect(
        failure.cleanup.some(
          (cause) => cause instanceof Error && cause.message.includes('deadline refused'),
        ),
      ).toBe(true);
      expect(io.input.closed).toBe(true);
      expect(io.output.closed).toBe(true);
    } finally {
      if (original === undefined) {
        expect(Reflect.deleteProperty(performance, 'now')).toBe(true);
      } else Object.defineProperty(performance, 'now', original);
      io.transport.close();
      await fallback(child);
    }
  },
);
