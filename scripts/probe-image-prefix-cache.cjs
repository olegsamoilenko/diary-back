// Isolated provider diagnostic. Dry run by default; --run makes the listed paid calls.
// Synthetic data only. Does not import the app, access its DB, or debit user credits.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { get_encoding } = require('tiktoken');

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const runId = process.argv.find((arg) => arg.startsWith('--run-id='))?.slice(9) || crypto.randomUUID();
if (!/^[a-f0-9-]{36}$/.test(runId)) throw new Error('Invalid diagnostic run id');
const marker = { mode: 'explicit' };

// Valid 512x512 RGB PNG fixture: four coloured squares, no external image service.
function imageFixture() {
  const crc = (bytes) => {
    let n = 0xffffffff;
    for (const b of bytes) {
      n ^= b;
      for (let i = 0; i < 8; i++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
    }
    return (n ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc(body));
    return Buffer.concat([size, body, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(512, 0); header.writeUInt32BE(512, 4);
  header[8] = 8; header[9] = 2;
  const pixels = Buffer.alloc(512 * (1 + 512 * 3));
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      const offset = y * 1537 + 1 + x * 3;
      pixels[offset] = x < 256 ? 240 : 30;
      pixels[offset + 1] = y < 256 ? 200 : 50;
      pixels[offset + 2] = 100;
    }
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(pixels)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const encoding = get_encoding('o200k_base');
let prefix = `Synthetic cache diagnostic ${runId}. Return only the JSON object {"ok":true}. The following fictional observations are reference data.\n`;
let n = 0;
while (encoding.encode(prefix).length < 2500) {
  prefix += `Observation ${++n}: area ${n % 7}, reading ${(n * 13) % 97}, duration ${n % 23} minutes; status recorded.\n`;
}
const prefixTokens = encoding.encode(prefix).length;
encoding.free();
const image = imageFixture();
const imageUrl = `data:image/png;base64,${image.toString('base64')}`;

const kinds = process.argv.includes('--image-only') ? ['image'] : ['text', 'image'];
let cases = kinds.flatMap((kind) =>
  ['json-baseline', 'json-identical-repeat', 'plain-format-only-change'].map((step) => {
    const content = [{ type: 'text', text: 'Return the requested JSON object.' }];
    if (kind === 'image') content.push({ type: 'image_url', image_url: { url: imageUrl, detail: 'high' } });
    return {
      name: `${kind}/${step}`,
      payload: {
        model: 'gpt-5.6-terra', service_tier: 'default', store: false,
        reasoning_effort: 'medium', max_completion_tokens: 256,
        stream: true, stream_options: { include_usage: true },
        prompt_cache_key: `nemory-probe:${runId}:${kind}`,
        prompt_cache_options: { mode: 'explicit' },
        ...(step.startsWith('plain') ? {} : { response_format: { type: 'json_object' } }),
        messages: [
          { role: 'system', content: [{ type: 'text', text: prefix, prompt_cache_breakpoint: marker }] },
          { role: 'user', content },
        ],
      },
    };
  }),
);
if (process.argv.includes('--shape-only')) {
  const shapeEncoding = get_encoding('o200k_base');
  const replacements = new Map();
  const syntheticText = (original) => {
    const hash = sha(original);
    if (!replacements.has(hash)) {
      const target = shapeEncoding.encode(original).length;
      const block = replacements.size + 1;
      const header = `Synthetic diagnostic ${runId} block ${block}. Return only JSON {"ok":true}. Reference data follows.\n`;
      const filler = Array.from({ length: target }, (_, i) => ` Area ${i % 13}: ${(i * 17) % 89} units.`).join('');
      replacements.set(hash, new TextDecoder().decode(shapeEncoding.decode(shapeEncoding.encode(header + filler).slice(0, target))));
    }
    return replacements.get(hash);
  };
  const load = (name) => {
    const payload = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '.tmp', 'ai-requests', name), 'utf8'));
    payload.prompt_cache_key = `nemory-probe:${runId}:shape`;
    payload.max_completion_tokens = 256;
    for (const message of payload.messages) {
      if (typeof message.content === 'string') message.content = syntheticText(message.content);
      for (const part of Array.isArray(message.content) ? message.content : []) {
        if (part.type === 'text') part.text = syntheticText(part.text);
        if (part.type === 'image_url') part.image_url.url = imageUrl;
      }
    }
    return payload;
  };
  const entry = load('2026-09-20T19-46-33-404Z-entry-ca57f3d9.json');
  const dialog = load('2026-09-20T19-47-03-083Z-dialog-18bac634.json');
  shapeEncoding.free();
  cases = [
    { name: 'shape/entry', payload: entry },
    { name: 'shape/entry-identical-repeat', payload: entry },
    { name: 'shape/dialog', payload: dialog },
    { name: 'shape/dialog-identical-repeat', payload: dialog },
  ];
  if (process.argv.includes('--app-adapter')) {
    cases = [cases[0], cases[2], cases[3]];
    if (process.argv.includes('--input-boundaries')) {
      const next = structuredClone(dialog);
      next.messages.push(
        { role: 'assistant', content: [{ type: 'text', text: 'Synthetic previous reply.', prompt_cache_breakpoint: marker }] },
        { role: 'user', content: 'Synthetic next question. Return JSON {"ok":true}.' },
      );
      cases = [cases[0], cases[1], { name: 'growth/next-dialog', payload: next }, { name: 'growth/repeat', payload: next }];
      if (process.argv.includes('--growth-series')) {
        cases = cases.slice(0, 3);
        for (let turn = 2; turn <= 3; turn++) {
          const grown = structuredClone(cases.at(-1).payload);
          grown.messages.push(
            { role: 'assistant', content: [{ type: 'text', text: `Synthetic reply ${turn}. Recorded observations remain unchanged.`, prompt_cache_breakpoint: marker }] },
            { role: 'user', content: `Synthetic follow-up ${turn}. Return JSON {"ok":true}.` },
          );
          const assistants = grown.messages.filter(m => m.role === 'assistant');
          for (const old of assistants.slice(0, -2)) for (const block of old.content) delete block.prompt_cache_breakpoint;
          cases.push({ name: `growth/dialog-${turn + 1}`, payload: grown });
        }
      }
    }
  } else if (process.argv.includes('--isolate') || process.argv.includes('--responses')) {
    const changedTask = structuredClone(entry);
    changedTask.messages[3].content = 'A different synthetic task. Return only JSON {"ok":true}.';
    const changedSource = structuredClone(entry);
    changedSource.messages[4].content[0].text = 'A different synthetic entry. Return only JSON {"ok":true}.';
    cases = [
      { name: 'isolate/warm-entry', payload: entry },
      { name: 'isolate/change-task-after-marker', payload: changedTask },
      { name: 'isolate/change-source-after-marker', payload: changedSource },
    ];
    if (process.argv.includes('--responses')) cases = cases.slice(0, 2);
  }
}
const plan = {
  runId, mode: process.argv.includes('--shape-only') ? 'synthetic-text-and-image-matching-message-shape' : 'synthetic',
  ...(process.argv.includes('--shape-only') ? {} : { prefixTokensEstimate: prefixTokens, prefixSha256: sha(prefix) }),
  imageBytes: image.length, imageSha256: sha(image),
  requests: cases.map(({ name, payload }) => ({
    name, payloadSha256: sha(JSON.stringify(payload)),
    responseFormat: payload.response_format ?? null, cacheKey: payload.prompt_cache_key,
  })),
};

async function main() {
  console.log(JSON.stringify(plan, null, 2));
  if (!process.argv.includes('--run')) {
    console.log(`DRY RUN: no API calls. --run executes exactly ${cases.length} paid requests, without retries.`);
    return;
  }
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');
  const { OpenAI } = require('openai');
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: 'https://api.openai.com/v1', maxRetries: 0, timeout: 60000 });
  const output = path.resolve(__dirname, '..', '.tmp', `image-prefix-probe-${runId}${process.argv.includes('--responses') ? '-responses' : process.argv.includes('--isolate') ? '-isolate' : ''}.jsonl`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({ plan }) + '\n', { flag: 'wx' });
  let comparisonResponseId;
  for (const test of cases) {
    const startedAt = new Date().toISOString();
    const useResponses = process.argv.includes('--responses');
    let payload = useResponses ? {
      model: test.payload.model, service_tier: 'default', store: false, stream: true,
      reasoning: { effort: 'medium' }, max_output_tokens: 256,
      text: { format: { type: 'json_object' } },
      prompt_cache_key: test.payload.prompt_cache_key,
      prompt_cache_options: { mode: 'explicit', ...(comparisonResponseId ? { comparison_response_id: comparisonResponseId } : {}) },
      input: test.payload.messages.map((message) => ({
        role: message.role,
        content: typeof message.content === 'string' ? message.content : message.content.map((part) =>
          part.type === 'image_url'
            ? { type: 'input_image', image_url: part.image_url.url, detail: part.image_url.detail }
            : { ...part, type: 'input_text' }),
      })),
    } : test.payload;
    if (process.argv.includes('--app-adapter')) {
      if (!useResponses) throw new Error('--app-adapter requires --responses');
      require('ts-node/register/transpile-only');
      payload = require('../src/ai/utils/openai-responses').toResponsesRequest(test.payload);
      if (process.argv.includes('--input-boundaries')) {
        let pending = false;
        for (const message of payload.input) {
          if (message.role === 'assistant') {
            for (const block of Array.isArray(message.content) ? message.content : []) {
              if (block.prompt_cache_breakpoint) {
                pending = true;
                delete block.prompt_cache_breakpoint;
              }
            }
          } else if (pending) {
            const blocks = typeof message.content === 'string' ? [{ type: 'input_text', text: message.content }] : message.content;
            message.content = process.argv.includes('--nonempty-boundary')
              ? blocks.map((block, i) => i === blocks.length - 1 ? { ...block, prompt_cache_breakpoint: marker } : block)
              : [{ type: 'input_text', text: '', prompt_cache_breakpoint: marker }, ...blocks];
            pending = false;
          }
        }
        payload.prompt_cache_options.comparison_response_id = comparisonResponseId;
      }
    }
    const { data: stream, response } = await (useResponses ? client.responses.create(payload) : client.chat.completions.create(payload)).withResponse();
    let usage = null, responseId = null, returnedModel = null, finishReason = null;
    let diagnostics = null;
    for await (const part of stream) {
      if (useResponses) {
        if (part.response) {
          responseId = part.response.id; returnedModel = part.response.model;
          if (part.response.usage) usage = part.response.usage;
          if (part.response.prompt_cache_diagnostics) diagnostics = part.response.prompt_cache_diagnostics;
          finishReason = part.response.status;
        }
        continue;
      }
      responseId = part.id; returnedModel = part.model;
      if (part.usage) usage = part.usage;
      if (part.choices?.[0]?.finish_reason) finishReason = part.choices[0].finish_reason;
    }
    const result = {
      name: test.name, startedAt, completedAt: new Date().toISOString(),
      requestId: response.headers.get('x-request-id'), responseId, returnedModel,
      finishReason, usage, ...(useResponses ? { diagnostics } : {}),
    };
    fs.appendFileSync(output, JSON.stringify(result) + '\n');
    console.log(JSON.stringify(result));
    if (!usage) throw new Error('Missing usage: stopping before further paid requests');
    comparisonResponseId = responseId;
    if (test !== cases.at(-1)) await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  console.log(`Saved: ${output}`);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
