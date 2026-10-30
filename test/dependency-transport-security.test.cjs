// Bounded local regression probes; no app bootstrap, database, provider or flood.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { createRequire } = require('node:module');
const { once } = require('node:events');
const { join, dirname } = require('node:path');
const { io: connect } = require('socket.io-client');

const nestRequire = createRequire(
  require.resolve('@nestjs/platform-socket.io'),
);
const socketRequire = createRequire(nestRequire.resolve('socket.io'));
const engineRequire = createRequire(socketRequire.resolve('engine.io'));
const { Server } = nestRequire('socket.io');
const { Decoder, Encoder, PacketType } = socketRequire('socket.io-parser');
const { Receiver, Sender } = engineRequire('ws');
const { Polling } = require(
  join(dirname(socketRequire.resolve('engine.io')), 'transports/polling.js'),
);

test('lockfile has patched versions for every nested copy', () => {
  const lock = require('../package-lock.json');
  const expected = require('../package.json').overrides;
  for (const [name, version] of Object.entries(expected)) {
    const copies = Object.entries(lock.packages).filter(([path]) =>
      path.endsWith(`node_modules/${name}`),
    );
    assert.ok(copies.length > 0, name);
    for (const [path, pkg] of copies) assert.equal(pkg.version, version, path);
  }
  assert.equal(engineRequire('ws/package.json').version, expected.ws);
});

for (const packet of ['50-["probe"]', '5100-["probe"]']) {
  test(`decoder rejects invalid attachment count: ${packet}`, () => {
    const decoder = new Decoder();
    try {
      assert.throws(() => decoder.add(packet), /attachments/);
      assert.throws(() => decoder.add(Buffer.from([1])), /not reconstructing/);
    } finally {
      decoder.destroy();
    }
  });
}

test('ordinary binary event still decodes exactly once', () => {
  const decoder = new Decoder();
  const decoded = [];
  decoder.on('decoded', (value) => decoded.push(value));
  try {
    for (const packet of new Encoder().encode({
      type: PacketType.EVENT,
      nsp: '/',
      data: ['media', Buffer.from('ok')],
    }))
      decoder.add(packet);
    assert.equal(decoded.length, 1);
    assert.equal(decoded[0].data[1].toString(), 'ok');
  } finally {
    decoder.destroy();
  }
});

test('invalid binary polling request ends its response', () => {
  const polling = new Polling({ _query: { EIO: '4' } });
  let errors = 0;
  let status;
  let ended = false;
  polling.on('error', () => errors++);
  const response = {
    writeHead(code) {
      status = code;
      return this;
    },
    end() {
      ended = true;
    },
  };
  polling.onDataRequest(
    { headers: { 'content-type': 'application/octet-stream' } },
    response,
  );
  assert.equal(status, 400);
  assert.equal(ended, true);
  assert.equal(errors, 1);
  assert.equal(polling.dataReq, undefined);
});

test('Engine.IO rejects protocol mismatch before upgrading a session', () => {
  const engine = new (socketRequire('engine.io').Server)();
  engine.clients.synthetic = { protocol: 4, transport: { name: 'polling' } };
  let result;
  engine.verify(
    {
      _query: { sid: 'synthetic', EIO: '3', transport: 'websocket' },
      headers: {},
    },
    true,
    (error, context) => {
      result = { error, context };
    },
  );
  assert.ok(result.error);
  delete engine.clients.synthetic;
  engine.close();
});

test('ws stops fragmented input with only three tiny test frames', async () => {
  // Low threshold only inside this receiver fixture; production uses upstream defaults.
  const receiver = new Receiver({ maxFragments: 2 });
  const failure = new Promise((resolve) => receiver.once('error', resolve));
  for (let i = 0; i < 3; i++) {
    const frame = Sender.frame(Buffer.from([1]), {
      fin: false,
      opcode: i === 0 ? 2 : 0,
      mask: false,
      rsv1: false,
      readOnly: true,
    });
    receiver.write(Buffer.concat(frame));
  }
  const error = await failure;
  assert.match(error.message, /fragments/i);
  receiver.destroy();
});

for (const mode of ['polling', 'websocket', 'upgrade']) {
  test(
    `4.8.1 client: ${mode}, events, binary ack, disconnect and reconnect`,
    { timeout: 10000 },
    async (t) => {
      const http = createServer();
      const server = new Server(http);
      let connected;
      let connections = 0;
      server.on('connection', (socket) => {
        connected = socket;
        connections++;
        socket.join('test-room');
        socket.on('echo', (value, ack) => ack(value));
      });
      await new Promise((resolve) => http.listen(0, '127.0.0.1', resolve));
      const client = connect(`http://127.0.0.1:${http.address().port}`, {
        autoConnect: false,
        transports: mode === 'upgrade' ? ['polling', 'websocket'] : [mode],
        upgrade: mode === 'upgrade',
        reconnectionDelay: 10,
        randomizationFactor: 0,
      });
      t.after(async () => {
        client.disconnect();
        await new Promise((resolve) => server.close(resolve));
      });
      const opened = once(client, 'connect');
      let upgraded;
      if (mode === 'upgrade')
        client.io.once('open', () => {
          upgraded = once(client.io.engine, 'upgrade');
        });
      client.connect();
      await opened;
      if (upgraded) await upgraded;
      assert.equal(
        client.io.engine.transport.name,
        mode === 'polling' ? 'polling' : 'websocket',
      );
      const echo = await client
        .timeout(3000)
        .emitWithAck('echo', Buffer.from('media'));
      assert.equal(Buffer.from(echo).toString(), 'media');
      const changed = once(client, 'plan_status_changed');
      server.to('test-room').emit('plan_status_changed', {});
      assert.deepEqual((await changed)[0], {});
      const reconnected = once(client, 'connect');
      connected.conn.close();
      await reconnected;
      assert.equal(connections, 2);
      const community = once(client, 'community_changed');
      server.to('test-room').emit('community_changed', {});
      await community;
      assert.equal(
        await client.timeout(3000).emitWithAck('echo', 'after reconnect'),
        'after reconnect',
      );
      // Verify upstream ws guardrails remain enabled on the actual server.
      assert.ok(server.engine.ws.options.maxFragments > 0);
      assert.ok(server.engine.ws.options.maxBufferedChunks > 0);
    },
  );
}
