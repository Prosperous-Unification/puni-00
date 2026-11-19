/// <reference types="bun-types" />
import {afterEach} from 'bun:test';

import {openMemorySourceFixture,type MemorySource} from '../source';

const sources=new Map<MemorySource,{closing:Promise<void>|undefined}>();

/** Actual empty source for explicit route/test compositions; it authors no catalogue identity or authority. */
export function openTestSource():MemorySource{
  const {source}=openMemorySourceFixture();
  return ownTestSource(source);
}

/** Registers the exact source created by an authored fixture; failed closes remain retained. */
export function ownTestSource(source:MemorySource):MemorySource{
  if(!sources.has(source))sources.set(source,{closing:undefined});
  return source;
}

afterEach(async()=>{
  const failures:unknown[]=[];
  for(const [source,owner] of sources){
    owner.closing??=Promise.resolve().then(()=>source.close());
    try{await owner.closing;sources.delete(source);}
    catch(cause:unknown){failures.push(cause);}
  }
  if(failures.length>0)throw new AggregateError(failures,'explicit test source closes failed',{cause:failures.at(-1)});
});
