import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {expect,test} from 'bun:test';
import * as domain from '../index';
import {buildScheduleBody} from '../saved-plan-schedule-body';
import {schedule,SCHEDULE_ALGORITHM_ID} from '../schedule';
import {readSavedConnectedScheduleBody} from './versioned-schedule';

interface Capture {name:string;path:string;sha256:string;bytes:number;version:number}
const captures=JSON.parse(readFileSync(new URL('../../../../../../openspec/changes/wbs-work-packages/fixtures/legacy-schedule-captures.json',import.meta.url),'utf8')) as {records:Capture[]};
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
function load(capture:Capture) {const bytes=readFileSync(new URL('../../../../../../'+capture.path,import.meta.url),'utf8');expect(hash(bytes)).toBe(capture.sha256);expect(Buffer.byteLength(bytes)).toBe(capture.bytes);return {bytes,body:JSON.parse(bytes)};}
function readPlain(body:unknown,version:number) {
 const reader:unknown=Reflect.get(domain,'readSavedPlainScheduleBody');
 expect(typeof reader).toBe('function');
 if(typeof reader!=='function')throw new Error('plain schedule reader absent');
 return reader(body,version) as {version:number;algorithmId:string;slices:Record<string,Record<string,unknown>>;workItems:unknown};
}
for(const capture of captures.records.filter(capture=>capture.version===1)) test('projects genuine '+capture.name+' into three with exact timing and original identity',()=>{
 const {bytes,body}=load(capture);const original=JSON.stringify(body);const current=readPlain(body,1);
 expect(current.version).toBe(3);expect(current.algorithmId).toBe(body.algorithmId);expect(current.workItems).toEqual(body.workItems);
 const key='w\u0000';const {boundBy,elsewhereHolder,...timing}=body.slices[key];const {boundBy:floor,elsewhereHolder:holder,...currentTiming}=current.slices[key];
 expect<unknown>(currentTiming).toEqual(timing);expect<unknown>(floor).toBe(boundBy==='projectStart'?'workPackageStart':boundBy);
 expect(holder).toEqual(elsewhereHolder===undefined?undefined:{workPackageId:elsewhereHolder.projectId,workItemId:elsewhereHolder.workItemId});
 expect(JSON.stringify(body)).toBe(original);expect(hash(bytes)).toBe(capture.sha256);
 expect(readPlain(current,3)).toEqual(current);
});
test('projects genuine connected two into four retaining exact preselection packet bytes',()=>{
 const capture=captures.records.find(capture=>capture.version===2);if(capture===undefined)throw new Error('connected2 absent');
 const {bytes,body}=load(capture);const original=JSON.stringify(body);const current=readSavedConnectedScheduleBody(body);
 expect(current.version).toBe(4);expect(current.algorithmId).toBe(body.algorithmId);expect(current.workItems).toEqual(body.workItems);
 expect(current.connection.targetWorkPackageId).toBe(body.connection.targetProjectId);
 expect(current.connection.idleWorkPackages).toEqual(body.connection.idleProjects);
 expect(current.connection.stages.map(stage=>stage.stageBytes)).toEqual(body.connection.stages.map((stage:{stageBytes:string})=>stage.stageBytes));
 expect(current.connection.stages.map(stage=>stage.workPackageId)).toEqual(body.connection.stages.map((stage:{projectId:string})=>stage.projectId));
 expect(current.connection.stages.map(stage=>stage.format)).toEqual(body.connection.stages.map((stage:{format:string})=>stage.format));
 for(const [key,slice] of Object.entries(body.slices) as [string,Record<string,unknown>][]) {
  const {boundBy,...timing}=slice;const {boundBy:floor,...currentTiming}=current.slices[key];expect<unknown>(currentTiming).toEqual(timing);expect<unknown>(floor).toBe(boundBy==='projectStart'?'workPackageStart':boundBy);
 }
 expect(JSON.stringify(body)).toBe(original);expect(hash(bytes)).toBe(capture.sha256);
 expect(readSavedConnectedScheduleBody(current)).toEqual(current);
});
test('current plain writer emits three and preserves engine timing arithmetic',()=>{
 const planned=schedule([{id:'w',parentId:null,position:0,frozenNumber:null,priority:null}],[],[{workItemId:'w',stepId:null,days:1,personId:null,width:1,poolIds:[]}]);
 const body=buildScheduleBody(planned,'2026-11-09',SCHEDULE_ALGORITHM_ID);
 expect(body.version).toBe(3);expect(body.slices['w\u0000']['boundBy']).toBe('workPackageStart');expect(body.workItems['w'].startsOn).toBe('2026-11-09');
 expect(readPlain(body,3)).toEqual(body);
});
test('plain schedule versions refuse mixed owned names and unknown headers',()=>{
 const capture=captures.records.find(capture=>capture.name==='legacy-schedule1-elsewhere');if(capture===undefined)throw new Error('elsewhere1 absent');
 const {body}=load(capture);const key='w\u0000';
 expect(()=>readPlain({...body,version:3},1)).toThrow('version');
 expect(()=>readPlain(body,5)).toThrow('version');
 expect(()=>readPlain({...body,slices:{[key]:{...body.slices[key],elsewhereHolder:{...body.slices[key].elsewhereHolder,workPackageId:'mixed'}}}},1)).toThrow();
 expect(()=>readPlain({...body,version:3},3)).toThrow();
});

test('legacy connected questions keep original hashes and packet bytes after projection',()=>{
 const capture=captures.records.find(capture=>capture.name==='legacy-schedule2-questions');if(capture===undefined)throw new Error('question fixture absent');
 const {bytes,body}=load(capture);const current=readSavedConnectedScheduleBody(body);
 const old=body.connection.stages[0].variants.time;const stage=current.connection.stages[0];const ready=stage.variants?.time;
 if(ready?.state!=='ready')throw new Error('ready original question lost');
 expect(ready.candidate.question).toEqual({...old.candidate.question,projectId:undefined,workPackageId:old.candidate.question.projectId});
 expect('projectId' in ready.candidate.question).toBe(false);
 expect(ready.candidate.question.stageBytes).toBe(old.candidate.question.stageBytes);
 expect(ready.candidate.question.inputHash).toBe(old.candidate.question.inputHash);
 expect(ready.candidate.question.questionHash).toBe(old.candidate.question.questionHash);
 expect(stage.stageBytes).toBe(body.connection.stages[0].stageBytes);
 expect(domain.readSavedCanonicalStage(stage.format,stage.stageBytes).workPackageId).toBe(stage.workPackageId);
 expect(hash(bytes)).toBe(capture.sha256);
});
test('legacy schedule decoding refuses wrong packet format mixed names and altered original question identity',()=>{
 const capture=captures.records.find(capture=>capture.name==='legacy-schedule2-questions');if(capture===undefined)throw new Error('question fixture absent');
 const {body}=load(capture);
 const wrong=structuredClone(body);wrong.connection.stages[0].format='connected-stage-v2';expect(()=>readSavedConnectedScheduleBody(wrong)).toThrow('shape');
 const mixed=structuredClone(body);const packet=JSON.parse(mixed.connection.stages[0].stageBytes);packet.workPackageId=packet.projectId;mixed.connection.stages[0].stageBytes=JSON.stringify(packet);expect(()=>readSavedConnectedScheduleBody(mixed)).toThrow('stage_shape');
 const altered=structuredClone(body);altered.connection.stages[0].variants.time.candidate.question.stageBytes+=' ';expect(()=>readSavedConnectedScheduleBody(altered)).toThrow('question_identity');
});
test('fresh connected writer refuses projected legacy packets rather than relabelling their question hashes',()=>{
 const capture=captures.records.find(capture=>capture.name==='legacy-schedule2-questions');if(capture===undefined)throw new Error('question fixture absent');
 const {body}=load(capture);const projected=readSavedConnectedScheduleBody(body);
 const input=domain.readSavedPlanInput(JSON.parse(readFileSync(new URL('../../../../../../openspec/changes/wbs-work-packages/fixtures/legacy-input10-connected.txt',import.meta.url),'utf8')),10);
 const history=input.dependencyHistory;
 if(history.kind!=='connected')throw new Error('connected history absent');
 const planned:domain.Schedule={workItems:new Map(Object.entries(projected.workItems)),slices:new Map(Object.entries(projected.slices).map(([key,slice])=>[key,{...slice,capacityPredecessorIds:[...slice.capacityPredecessorIds]}])),waitingForPerson:projected.waitingForPerson,waitingForCapacity:projected.waitingForCapacity,eventsVisited:0};
 expect(()=>domain.buildConnectedScheduleBody(planned,'2026-10-01',history,projected.connection)).toThrow('fresh_stage_format');
});

test('earliest plain one retains later-field absence and validates any present lateBy',()=>{
 const capture=captures.records.find(capture=>capture.name==='legacy-schedule1-first-writer');if(capture===undefined)throw new Error('earliest1 fixture absent');
 const {body}=load(capture);const key='w\u0000';expect(Object.hasOwn(body.slices[key],'lateBy')).toBe(false);
 const current=readPlain(body,1);expect(Object.hasOwn(current.slices[key],'lateBy')).toBe(false);
 expect(()=>readPlain({...body,slices:{[key]:{...body.slices[key],lateBy:'invalid'}}},1)).toThrow('shape');
 expect(()=>readPlain({...current,slices:{[key]:{...current.slices[key],lateBy:'invalid'}}},3)).toThrow('shape');
});
