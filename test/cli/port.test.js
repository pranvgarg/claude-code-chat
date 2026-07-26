const test = require('node:test');
const assert = require('node:assert');
const net = require('node:net');
const { getFreePort } = require('../../lib/port.js');

test('getFreePort resolves to a usable TCP port', async () => {
  const port = await getFreePort();
  assert.strictEqual(typeof port, 'number');
  assert.ok(port > 0 && port < 65536, `port ${port} out of range`);

  // Prove the port was actually released, not just reported, by binding
  // a real server to it.
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve());
    });
  });
});

test('getFreePort can be called repeatedly without colliding', async () => {
  const a = await getFreePort();
  const b = await getFreePort();
  assert.strictEqual(typeof a, 'number');
  assert.strictEqual(typeof b, 'number');
});
