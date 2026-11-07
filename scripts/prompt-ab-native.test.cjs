const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { armFrozenNative } = require('./prompt-ab-dev.cjs');
process.env.NODE_ENV = 'development'; process.env.DB_HOST = 'localhost'; process.env.DB_DATABASE = 'nemorydb';
const anchor = 'Synthetic source only for the isolated native comparison test.';
function fixture() {
  const id = 't98-native' + crypto.randomUUID().replaceAll('-', '');
  const dir = path.resolve(__dirname,'../.tmp/prompt-ab',id);
  fs.mkdirSync(dir,{recursive:true});
  const request = {userId:142,mode:'checkin',model:'test-model',response:{format:'text',stream:true},runtime:{outputPurpose:'tier_response'},accounting:{traceId:'frozen'},messages:[{role:'system',content:'Frozen rules'},{role:'user',content:anchor}]};
  fs.writeFileSync(path.join(dir,'A-request.json'),JSON.stringify(request));
  return {id,dir,request};
}
test('native comparison preserves frozen messages but streams and bills the current native call, then restores service',async()=>{
  const f=fixture(); let delivered='', seen;
  const original=async r=>{seen=r;r.onToken?.('visible');return {fullText:'answer'};};
  const ai={executeResponse:original}; armFrozenNative(ai,f.id,anchor);
  await ai.executeResponse({...f.request,messages:[{role:'user',content:anchor},{role:'user',content:'Unrelated current source'}]});
  assert.ok(ai.__promptAbArmed,'Historical mention must not trigger capture');
  const native={...f.request,messages:[{role:'system',content:'New live history'},{role:'user',content:anchor}],accounting:{traceId:'native-trace'},onToken:x=>{delivered+=x;}};
  await ai.executeResponse(native);
  assert.equal(delivered,'visible'); assert.equal(seen.accounting.traceId,'native-trace');
  assert.deepEqual(seen.messages,f.request.messages); assert.equal(ai.executeResponse,original); assert.equal(ai.__promptAbArmed,undefined);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.dir,'A-state.json'))).status,'complete');
  assert.throws(()=>armFrozenNative(ai,f.id,anchor),/already started/);
});
test('a different owner is rejected before any provider call and the wrapper is restored',async()=>{
  const f=fixture(); let calls=0; const original=async()=>{calls++;}; const ai={executeResponse:original};
  armFrozenNative(ai,f.id,anchor);
  await assert.rejects(ai.executeResponse({...f.request,userId:999}),/retain owner/);
  assert.equal(calls,0); assert.equal(ai.executeResponse,original); assert.equal(ai.__promptAbArmed,undefined);
});
