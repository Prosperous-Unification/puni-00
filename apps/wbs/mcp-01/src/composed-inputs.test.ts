import {CfWorkerJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/cfworker';
import type {JsonSchemaType} from '@modelcontextprotocol/sdk/validation';
import {documentFromShapes,httpShapes} from '@wbs/contracts';
import {expect,it} from 'bun:test';

import {type OpenApiDocument,toolsFromDocument} from './openapi-tools';

/** Control only one body in an actual emitted registry; retain its real exclusion policy. */
function deriveComposedBody(schema:unknown,parameters:readonly unknown[]=[]){
  const emitted=documentFromShapes(httpShapes),paths={...emitted.paths};
  delete paths['/api/organization/step-bindings'];
  const path=parameters.length===0?'/api/composed':'/api/composed/{id}';
  const fixture={...emitted,paths:{...paths,[path]:{post:{operationId:'composeBody',parameters,requestBody:{content:{'application/json':{schema}}}}}}};
  // The explicit fixture controls parsed JSON at the public document boundary.
  const tools=toolsFromDocument(fixture as OpenApiDocument);
  const tool=tools.find(tool=>tool.name==='composeBody');
  if(tool===undefined)throw new Error('controlled composition tool is absent');
  return tool;
}

it('MCP preserves root object composition constraints through the actual SDK validator',()=>{
  const schema={type:'object',properties:{left:{type:'string'},right:{type:'string'},blocked:{type:'boolean'}},oneOf:[{required:['left']},{required:['right']}],not:{required:['blocked']},additionalProperties:false};
  const validator=new CfWorkerJsonSchemaValidator();
  const original=validator.getValidator(schema as JsonSchemaType);
  expect(original({left:'one'}).valid).toBe(true);
  expect(original({left:'one',right:'two'}).valid).toBe(false);
  expect(original({left:'one',blocked:true}).valid).toBe(false);
  const tool=deriveComposedBody(schema);
  const derived=validator.getValidator(tool.inputSchema as JsonSchemaType);
  expect(derived({left:'one'}).valid).toBe(true);
  expect(derived({left:'one',right:'two'}).valid).toBe(false);
  expect(derived({left:'one',blocked:true}).valid).toBe(false);
});

it('MCP refuses opaque body constraints combined with flattened URL inputs',()=>{
  const schema={type:'object',properties:{payload:{type:'string'}},anyOf:[{required:['payload']}],additionalProperties:false};
  expect(()=>deriveComposedBody(schema,[{name:'id',in:'path',required:true,schema:{type:'string'}}])).toThrow('cannot preserve body constraints alongside URL inputs');
});

it('MCP refuses a scalar alternative instead of advertising it as an object input',()=>{
  expect(()=>deriveComposedBody({anyOf:[{type:'object',properties:{name:{type:'string'}}},{type:'string'}]})).toThrow('no application/json object schema');
});

it('MCP detects a URL and body name collision hidden inside an object alternative',()=>{
  const schema={type:'object',anyOf:[{type:'object',properties:{id:{type:'string'}}}]};
  expect(()=>deriveComposedBody(schema,[{name:'id',in:'path',required:true,schema:{type:'string'}}])).toThrow('"id" is declared as both a path input and a body input');
});

it('MCP refuses empty composition alternatives before exposing tools',()=>{
  expect(()=>deriveComposedBody({type:'object',anyOf:[]})).toThrow('empty anyOf');
});
