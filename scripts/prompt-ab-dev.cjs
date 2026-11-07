/* Explicit, one-shot local debug capture/replay. Not an HTTP route or app feature. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
function assertLocal() {
  if (process.env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST)
    || process.env.DB_DATABASE !== 'nemorydb' || path.resolve(process.cwd()) !== root)
    throw Error('Only the existing local development process is allowed');
}
function directory(id) {
  if (!/^t\d{2}(?:-[a-z0-9]+)?$/.test(id)) throw Error('Invalid case id');
  return path.join(root, '.tmp/prompt-ab', id);
}
function write(dir, file, data) { fs.writeFileSync(path.join(dir, file), JSON.stringify(data, null, 2)); }
function plain(request) {
  const clone = JSON.parse(JSON.stringify(request));
  delete clone.onToken;
  delete clone.timing;
  if (clone.runtime) delete clone.runtime.signal;
  return clone;
}
function matchesCurrent(request, expectedText) {
  const current = request.messages?.filter(m => m.role === 'user' && !m.content.startsWith('[RESPONSE_TASK]\n')).at(-1);
  return request.runtime?.outputPurpose === 'tier_response' && current?.content.includes(expectedText);
}
function arm(ai, id, expectedText) {
  assertLocal();
  if (expectedText.length < 40 || ai.__promptAbArmed) throw Error('Unsafe or concurrent capture');
  const dir = directory(id);
  if (fs.existsSync(dir)) throw Error('Case already exists; never overwrite/retry implicitly');
  fs.mkdirSync(dir, { recursive: true });
  const original = ai.executeResponse;
  ai.__promptAbArmed = { id, original };
  ai.executeResponse = async function (request) {
    if (!matchesCurrent(request, expectedText))
      return original.call(this, request);
    // Restore before any await: unrelated/auxiliary calls never inherit the hook.
    this.executeResponse = original;
    delete this.__promptAbArmed;
    const capture = plain(request);
    write(dir, 'B-request.json', capture);
    write(dir, 'state.json', { status: 'B-running', userId: request.userId, mode: request.mode, model: request.model });
    try {
      const result = await original.call(this, request);
      write(dir, 'B-response.json', result);
      write(dir, 'state.json', { status: 'B-complete', userId: request.userId, traceId: request.accounting.traceId });
      return result;
    } catch (error) {
      write(dir, 'state.json', { status: 'B-failed', message: error?.message });
      throw error;
    }
  };
  return { armed: id, directory: dir };
}
function armFrozenNative(ai, id, expectedText) {
  assertLocal();
  if (expectedText.length < 40 || ai.__promptAbArmed) throw Error('Unsafe or concurrent capture');
  const dir = directory(id);
  const frozen = JSON.parse(fs.readFileSync(path.join(dir, 'A-request.json'), 'utf8'));
  if (fs.existsSync(path.join(dir, 'A-state.json')) || fs.existsSync(path.join(dir, 'A-response.json')))
    throw Error('Variant already started');
  const original = ai.executeResponse;
  ai.__promptAbArmed = { id, original };
  ai.executeResponse = async function(request) {
    if (!matchesCurrent(request, expectedText)) return original.call(this, request);
    this.executeResponse = original;
    delete this.__promptAbArmed;
    if (request.userId !== frozen.userId || request.mode !== frozen.mode || request.model !== frozen.model
      || JSON.stringify(request.response) !== JSON.stringify(frozen.response))
      throw Error('Native copy must retain owner, mode, model and response contract');
    fs.closeSync(fs.openSync(path.join(dir, 'A-state.json'), 'wx'));
    const execution = { ...frozen, onToken: request.onToken, timing: request.timing,
      accounting: request.accounting, runtime: { ...frozen.runtime, signal: request.runtime?.signal } };
    write(dir, 'A-native-request.json', plain(request));
    write(dir, 'A-execution-request.json', plain(execution));
    write(dir, 'A-state.json', { status:'running', native:true, userId:request.userId, traceId:request.accounting.traceId });
    try {
      const result = await original.call(this, execution);
      write(dir, 'A-response.json', result);
      write(dir, 'A-state.json', { status:'complete', native:true, userId:request.userId, traceId:request.accounting.traceId });
      return result;
    } catch(error) {
      write(dir, 'A-state.json', { status:'failed', native:true, message:error?.message });
      throw error;
    }
  };
  return {armed:id, nativeFrozenVariant:'A', paidCalls:0};
}
function disarm(ai, id) {
  assertLocal();
  if (ai.__promptAbArmed?.id !== id) throw Error('Armed case mismatch');
  ai.executeResponse = ai.__promptAbArmed.original;
  delete ai.__promptAbArmed;
  return { disarmed:id, paidCalls:0 };
}
function prepare(id) {
  assertLocal();
  const dir = directory(id);
  if (!fs.existsSync(path.join(dir, 'B-response.json'))) throw Error('Wait for completed native B');
  if (fs.existsSync(path.join(dir, 'A-state.json'))) throw Error('Control already started');
  const request = JSON.parse(fs.readFileSync(path.join(dir, 'B-request.json'), 'utf8'));
  if (request.messages.some(m => m.mediaIds?.length)) throw Error('Initial harness supports text-only cases');
  const baselinePath = require.resolve('./prompt-ab-baseline.cjs');
  delete require.cache[baselinePath];
  const { baseline } = require(baselinePath);
  const result = baseline(request);
  write(dir, 'A-request.json', result.request);
  write(dir, 'manifest.json', result.manifest);
  return { prepared: id, task: result.manifest.task, replacements: result.manifest.replacements.map(r => r.name), unchangedMessages: result.manifest.unchangedMessageIndexes };
}
function prepareRepeat(id, sourceId) {
  assertLocal();
  const dir = directory(id);
  const source = directory(sourceId);
  if (fs.existsSync(dir)) throw Error('Repeat already exists');
  for (const file of ['A-request.json', 'B-request.json', 'A-response.json', 'B-response.json', 'manifest.json'])
    if (!fs.existsSync(path.join(source, file))) throw Error('Original pair incomplete');
  fs.mkdirSync(dir, { recursive: true });
  for (const file of ['A-request.json', 'B-request.json', 'manifest.json'])
    fs.copyFileSync(path.join(source, file), path.join(dir, file));
  write(dir, 'state.json', { status: 'paired-repeat-prepared', sourceId, native: false });
  return { prepared: id, sourceId, paidCalls: 0 };
}
async function replay(ai, id, variant = 'A') {
  assertLocal();
  if (!['A', 'B'].includes(variant)) throw Error('Invalid variant');
  const dir = directory(id);
  if (fs.existsSync(path.join(dir, variant + '-response.json'))) throw Error('Variant already completed');
  const request = JSON.parse(fs.readFileSync(path.join(dir, variant + '-request.json'), 'utf8'));
  const file = path.join(dir, variant + '-state.json');
  // Exclusive claim precedes paid work; interruption never permits an automatic repeat.
  const claim = fs.openSync(file, 'wx');
  fs.closeSync(claim);
  const traceId = `prompt-ab-${id}-${variant}-${crypto.randomUUID()}`;
  request.onToken = () => {};
  request.accounting = { traceId, operation: 'prompt_ab_control_response', cycleComplete: true };
  write(dir, variant + '-state.json', { status: 'running', traceId, userId: request.userId });
  try {
    // Same live service/provider/access-to-credits lifecycle, no domain saving,
    // memory extraction or frontend action delivery for the control response.
    const result = await ai.executeResponse(request);
    write(dir, variant + '-response.json', result);
    write(dir, variant + '-state.json', { status: 'complete', traceId, userId: request.userId });
    return { complete: id, variant, traceId, credits: result.credits };
  } catch (error) {
    write(dir, variant + '-state.json', { status: 'failed', traceId, message: error?.message });
    throw error;
  }
}
module.exports = { arm, armFrozenNative, disarm, prepare, prepareRepeat, replay };
