import { rejects } from 'node:assert/strict';
import { createServer } from 'node:net';

import { expect, test } from 'bun:test';

import { probeParticipantTcp } from './dependency-participant-tcp';

test('startup TCP transport joins an actual owned connection and treats only refused connect as pending', async () => {
  let bytes = 0;
  const server = createServer((socket) => {
    socket.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0 }, resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('owned TCP address absent');
  const deadline = performance.now() + 60000;
  try {
    expect(
      await probeParticipantTcp('127.0.0.1', address.port, deadline, performance.now() + 10000),
    ).toBe('connected');
    expect(bytes).toBe(0);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((failure) => {
        if (failure === undefined) resolve();
        else reject(failure);
      }),
    );
  }
  expect(
    await probeParticipantTcp('127.0.0.1', address.port, deadline, performance.now() + 10000),
  ).toBe('not-listening');
  await rejects(
    probeParticipantTcp(
      '127.0.0.1',
      address.port,
      performance.now() + 41000,
      performance.now() + 100,
    ),
  );
});

test('startup TCP socket faults are hard refusals and exact local close precedes every ordinary return', async () => {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0 }, resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('owned lifecycle server absent');
  const module = new URL('./dependency-participant-tcp.ts', import.meta.url).pathname;
  const program = `
    import * as net from 'node:net';
    import {mock} from 'bun:test';
    const nativeCreate=net.createConnection;
    const unused=net.createServer();
    await new Promise(resolve=>unused.listen({host:'127.0.0.1',port:0},resolve));
    const unusedAddress=unused.address();
    if(unusedAddress===null||typeof unusedAddress==='string')throw new Error('closed fixture port absent');
    const refusedPort=unusedAddress.port;
    await new Promise((resolve,reject)=>unused.close(cause=>cause===undefined?resolve():reject(cause)));
    let mode='delayed-close',created=0,closed=0,cleanup,sawLateRefusal=false;
    const held=[];
    const nativeTimer=globalThis.setTimeout;
    globalThis.setTimeout=(callback,delay,...args)=>nativeTimer(callback,(mode==='late-connect'||mode==='late-refused')&&delay>=900&&delay<=1100?delay+1000:delay,...args);
    let controller=new AbortController();
    mock.module('node:net',()=>({...net,createConnection:(...args)=>{
      const socket=(mode==='delayed-close'||mode==='connected-unproved')?nativeCreate(...args):new net.Socket();
      held.push(socket);created++;socket.once('close',()=>closed++);
      if(mode==='late-refused')socket.once('error',cause=>{sawLateRefusal=cause?.code==='ECONNREFUSED';});
      const destroy=socket.destroy.bind(socket);
      if(mode==='delayed-close'){
        let scheduled=false;
        socket.destroy=()=>{if(!scheduled){scheduled=true;setTimeout(destroy,50);}return socket;};
      }else if(mode==='cancel'||mode==='socket-timeout'){
        const connectTimer=setTimeout(()=>socket.connect(...args),30);
        socket.once('close',()=>clearTimeout(connectTimer));
        setTimeout(()=>mode==='cancel'?controller.abort():socket.emit('timeout'),10);
      }
      else if(mode==='malformed-close')setTimeout(destroy,5);
      else if(mode==='destroy-error'){
        socket.destroy=()=>{destroy();throw new Error('PRIVATE_DESTROY_FAILURE');};
        setTimeout(()=>socket.emit('error',Object.assign(new Error('PRIVATE_REFUSAL'),{code:'ECONNREFUSED'})),5);
      }else if(mode==='unproved'||mode==='connected-unproved'){
        socket.destroy=()=>socket;
        if(mode==='unproved')setTimeout(()=>socket.emit('error',Object.assign(new Error('PRIVATE_EARLY_FAILURE'),{code:'ECONNRESET'})),5);
        cleanup=()=>new Promise(resolve=>{socket.once('close',resolve);socket.destroy=destroy;destroy();});
      }else if(mode==='late-connect'||mode==='late-refused'){
        const target=mode==='late-refused'?{...args[0],port:refusedPort}:args[0];
        const connectTimer=setTimeout(()=>socket.connect(target),1500);
        socket.once('close',()=>clearTimeout(connectTimer));
      }else if(mode==='timeout'){
        const connectTimer=setTimeout(()=>socket.connect(...args),1600);
        socket.once('close',()=>clearTimeout(connectTimer));
      }else if(mode==='malformed-error'){
        setTimeout(()=>socket.emit('error',{code:'ECONNREFUSED',message:'PRIVATE_MALFORMED_ERROR'}),5);
      }else if(mode!=='admission'){
        const codes={reset:'ECONNRESET',unreachable:'EHOSTUNREACH',network:'ENETUNREACH',access:'EACCES',unknown:'PRIVATE_UNKNOWN'};
        setTimeout(()=>socket.emit('error',Object.assign(new Error('PRIVATE_SOCKET_ERROR'),{code:codes[mode]})),5);
      }
      return socket;
    }}));
    const {probeParticipantTcp,ParticipantTcpCleanupUnproved}=await import(${JSON.stringify(module)});
    const lifecycle=[];
    for(mode of ['delayed-close','cancel','socket-timeout','reset','unreachable','network','access','unknown','malformed-error','destroy-error','malformed-close','late-connect','late-refused','timeout','connected-unproved','unproved']){
      const beforeCreated=created,beforeClosed=closed;controller=new AbortController();sawLateRefusal=false;
      let outcome;
      const started=performance.now();
      try{outcome=await probeParticipantTcp('127.0.0.1',${String(address.port)},performance.now()+60000,performance.now()+10000,controller.signal);}
      catch(cause){
        if(!(cause instanceof Error)||cause.cause!==undefined)throw cause;
        if(cause instanceof ParticipantTcpCleanupUnproved)outcome='cleanup-unproved';
        else{if(cause.message!=='participant startup TCP refused')throw cause;outcome='refused';}
      }
      const expected=(mode==='unproved'||mode==='connected-unproved')?'cleanup-unproved':mode==='delayed-close'?'connected':'refused';
      if(outcome!==expected)throw new Error('unexpected TCP outcome '+mode+':'+String(outcome));
      const elapsed=performance.now()-started;
      if(mode==='delayed-close'&&closed-beforeClosed!==1)throw new Error('ordinary return preceded exact close');
      if((mode==='late-connect'||mode==='late-refused')&&(elapsed<1400||elapsed>1900))throw new Error('late event fixture did not deliver');
      if(mode==='late-refused'&&!sawLateRefusal)throw new Error('late refusal fixture did not refuse');
      if(mode==='timeout'&&(elapsed<900||elapsed>1400))throw new Error('fixed attempt bound missed');
      if((mode==='unproved'||mode==='connected-unproved')&&(elapsed<900||elapsed>1400))throw new Error('first-refusal close bound missed');
      lifecycle.push({mode,outcome,created:created-beforeCreated,closed:closed-beforeClosed});
      if(cleanup){await cleanup();cleanup=undefined;}
    }
    mode='admission';
    const admissionCreated=created;
    const cancelled=new AbortController();cancelled.abort();
    const now=performance.now();
    for(const [host,port,deadline,cutoff,signal] of [
      ['127.0.0.1',${String(address.port)},now+41000,now+100,undefined],
      ['127.0.0.1',${String(address.port)},NaN,now+10000,undefined],
      ['127.0.0.1',${String(address.port)},now+60000,now+30000,undefined],
      ['127.0.0.1',${String(address.port)},now+120000,now+30001,undefined],
      ['127.0.0.1',${String(address.port)},now+60000,NaN,undefined],
      ['127.0.0.1',${String(address.port)},now+60000,now,undefined],
      ['127.0.0.1',0,now+60000,now+10000,undefined],
      ['127.0.0.1',${String(address.port)},now+60000,now+10000,cancelled.signal],
      ['localhost',${String(address.port)},now+60000,now+10000,undefined],
      ['0.0.0.0',${String(address.port)},now+60000,now+10000,undefined],
      ['::ffff:127.0.0.1',${String(address.port)},now+60000,now+10000,undefined],
      ['fe80::1%eth0',${String(address.port)},now+60000,now+10000,undefined],
    ]){
      let refused=false;
      try{await probeParticipantTcp(host,port,deadline,cutoff,signal);}
      catch(cause){if(!(cause instanceof Error)||cause.message!=='participant startup TCP refused')throw cause;refused=true;}
      if(!refused||created!==admissionCreated)throw new Error('startup admission created a socket');
    }
    process.stdout.write(JSON.stringify(lifecycle));
  `;
  const child = Bun.spawn([process.execPath, '--no-env-file', '-e', program], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect({ stderr, code }).toEqual({ stderr: '', code: 0 });
    const lifecycle: unknown = JSON.parse(stdout);
    expect(lifecycle).toEqual([
      { mode: 'delayed-close', outcome: 'connected', created: 1, closed: 1 },
      ...[
        'cancel',
        'socket-timeout',
        'reset',
        'unreachable',
        'network',
        'access',
        'unknown',
        'malformed-error',
        'destroy-error',
        'malformed-close',
        'late-connect',
        'late-refused',
        'timeout',
      ].map((mode) => ({ mode, outcome: 'refused', created: 1, closed: 1 })),
      { mode: 'connected-unproved', outcome: 'cleanup-unproved', created: 1, closed: 0 },
      { mode: 'unproved', outcome: 'cleanup-unproved', created: 1, closed: 0 },
    ]);
  } finally {
    child.kill('SIGKILL');
    await child.exited;
    await new Promise<void>((resolve, reject) =>
      server.close((failure) => {
        if (failure === undefined) resolve();
        else reject(failure);
      }),
    );
  }
}, 20000);

test('startup TCP refuses actual late close when cleanup timer delivery is delayed', async () => {
  const module = new URL('./dependency-participant-tcp.ts', import.meta.url).pathname;
  const program = `
    import * as net from 'node:net';
    import {mock} from 'bun:test';
    const nativeCreate=net.createConnection;
    const nativeTimer=globalThis.setTimeout;
    const server=net.createServer();
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen({host:'127.0.0.1',port:0},resolve);});
    const address=server.address();
    if(address===null||typeof address==='string')throw Error('owned address absent');
    const unused=net.createServer();
    await new Promise(resolve=>unused.listen({host:'127.0.0.1',port:0},resolve));
    const refused=unused.address();
    if(refused===null||typeof refused==='string')throw Error('owned refused address absent');
    await new Promise((resolve,reject)=>unused.close(cause=>cause===undefined?resolve():reject(cause)));
    let mode='connected',firstDestroy,observedClose,actualCloses=0;
    let refusedCode;
    mock.module('node:net',()=>({...net,createConnection:(...args)=>{
      const socket=nativeCreate(...args);
      const destroy=socket.destroy.bind(socket);
      const on=socket.on.bind(socket);
      on('close',()=>{actualCloses++;});
      on('error',cause=>{if(mode==='pending')refusedCode=cause.code;});
      if(mode==='connected'){
        socket.destroy=(...values)=>{
          if(firstDestroy===undefined){firstDestroy=performance.now();nativeTimer(()=>destroy(...values),1500);}
          return socket;
        };
      }else{
        socket.destroy=(...values)=>{
          firstDestroy??=performance.now();
          return destroy(...values);
        };
      }
      socket.on=(event,listener)=>{
        if(event!=='close')return on(event,listener);
        return on(event,(...values)=>{
          const deliver=()=>{observedClose=performance.now();listener(...values);};
          if(mode==='pending')nativeTimer(deliver,1500);else deliver();
        });
      };
      return socket;
    }}));
    globalThis.setTimeout=(callback,delay,...args)=>nativeTimer(callback,
      delay!==undefined&&delay>=800&&delay<=1100?delay+1200:delay,...args);
    const {probeParticipantTcp,ParticipantTcpCleanupUnproved}=await import(${JSON.stringify(module)});
    const outcomes=[];
    try{
      for(mode of ['connected','pending']){
        firstDestroy=undefined;observedClose=undefined;
        const before=actualCloses;
        let outcome;
        try{outcome=await probeParticipantTcp('127.0.0.1',mode==='connected'?address.port:refused.port,
          performance.now()+60000,performance.now()+10000);}
        catch(cause){
          if(!(cause instanceof ParticipantTcpCleanupUnproved))throw cause;
          outcome='cleanup-unproved';
        }
        if(firstDestroy===undefined||observedClose===undefined||observedClose-firstDestroy<1400)
          throw Error('late close fault was not delivered');
        if(actualCloses!==before+1)throw Error('actual socket was not closed');
        if(mode==='pending'&&refusedCode!=='ECONNREFUSED')throw Error('actual pending connection was not refused');
        if(outcome!=='cleanup-unproved')throw Error('late close became ordinary '+mode+':'+outcome);
        outcomes.push(mode+':'+outcome);
      }
      process.stdout.write(JSON.stringify(outcomes));
    }finally{
      await new Promise((resolve,reject)=>server.close(cause=>cause===undefined?resolve():reject(cause)));
    }
  `;
  const child = Bun.spawn([process.execPath, '--no-env-file', '-e', program], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect({ stderr, code }).toEqual({ stderr: '', code: 0 });
    expect(JSON.parse(stdout)).toEqual(['connected:cleanup-unproved', 'pending:cleanup-unproved']);
  } finally {
    child.kill('SIGKILL');
    await child.exited;
  }
}, 15000);
