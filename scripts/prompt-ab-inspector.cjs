/* Uses the already-running local inspector; never starts/restarts a backend. */
const WS = require('ws');
const path = require('node:path');
async function main() {
  const [action, id, expectedText] = process.argv.slice(2);
  if (!['probe', 'arm', 'arm-native-A', 'disarm', 'prepare', 'repeat-prepare', 'replay', 'replay-B'].includes(action)) throw Error('Unknown action');
  const pages = await (await fetch('http://127.0.0.1:9229/json/list')).json();
  if (pages.length !== 1) throw Error('Expected exactly one local backend inspector');
  const ws = new WS(pages[0].webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  let next = 0;
  const pending = new Map();
  ws.on('message', data => {
    const item = JSON.parse(data);
    const waiter = pending.get(item.id);
    if (!waiter) return;
    pending.delete(item.id);
    if (item.error || item.result?.exceptionDetails) waiter.reject(Error(JSON.stringify(item.error || item.result.exceptionDetails)));
    else waiter.resolve(item.result);
  });
  const call = (method, params) => new Promise((resolve, reject) => {
    const callId = ++next; pending.set(callId, { resolve, reject });
    ws.send(JSON.stringify({ id: callId, method, params }));
  });
  const req = `process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')`;
  try {
    let reference = await call('Runtime.evaluate', { expression: `${req}('./scripts/prompt-ab-service-ref.cjs').get()` });
    if (!reference.result.objectId) {
      const proto = await call('Runtime.evaluate', { expression: `${req}('./src/ai/ai.service.ts').AiService.prototype` });
      const objects = await call('Runtime.queryObjects', { prototypeObjectId: proto.result.objectId });
      reference = await call('Runtime.callFunctionOn', { objectId: objects.objects.objectId,
        functionDeclaration: `function(){if(this.length!==1)throw Error('Ambiguous AiService');${req}('./scripts/prompt-ab-service-ref.cjs').set(this[0]);return this[0]}` });
    }
    const method = action === 'probe'
      ? `function(){const u=new URL(this.openai.baseURL);return {instances:1,ready:!!this.subscriptionUsageService,providerDestination:u.origin+u.pathname,localMode:process.env.NODE_ENV,armedCase:this.__promptAbArmed?.id??null}}`
      : `function(action,id,text){const loader=${req};const file=loader.resolve('./scripts/prompt-ab-dev.cjs');delete loader.cache[file];const mod=loader(file);return action==='disarm'?mod.disarm(this,id):action==='prepare'?mod.prepare(id):action==='repeat-prepare'?mod.prepareRepeat(id,text):action==='arm'?mod.arm(this,id,text):action==='arm-native-A'?mod.armFrozenNative(this,id,text):mod.replay(this,id,action==='replay-B'?'B':'A')}`;
    const result = await call('Runtime.callFunctionOn', {
      objectId: reference.result.objectId,
      functionDeclaration: method,
      arguments: [{ value: action }, { value: id }, { value: expectedText }],
      awaitPromise: true, returnByValue: true,
    });
    console.log(JSON.stringify(result.result.value));
  } finally { ws.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
