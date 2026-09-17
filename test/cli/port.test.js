const test = require('node:test');
const assert = require('node:assert');
const net = require('node:net');
const { getFreePort, getPreferredPort } = require('../../lib/port.js');

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

test('getPreferredPort returns the preferred port when it is free', async () => {
  const preferred = await getFreePort();
  const result = await getPreferredPort(preferred);
  assert.strictEqual(result, preferred);
});

test('getPreferredPort falls back to a free port when the preferred one is occupied', async () => {
  const preferred = await getFreePort();
  const blocker = net.createServer();
  await new Promise((resolve) => blocker.listen(preferred, '127.0.0.1', resolve));

  try {
    const result = await getPreferredPort(preferred);
    assert.notStrictEqual(result, preferred);
    assert.strictEqual(typeof result, 'number');
  } finally {
    await new Promise((resolve) => blocker.close(resolve));
  }
});

test('getPreferredPort called twice in a row returns the same port (stable origin across restarts)', async () => {
  const preferred = await getFreePort();
  const a = await getPreferredPort(preferred);
  const b = await getPreferredPort(preferred);
  assert.strictEqual(a, preferred);
  assert.strictEqual(b, preferred);
});

test('getPreferredPort increments sequentially past occupied ports (Vite/CRA/Jupyter convention)', async () => {
  const preferred = await getFreePort();
  const blockerA = net.createServer();
  const blockerB = net.createServer();
  await new Promise((resolve) => blockerA.listen(preferred, '127.0.0.1', resolve));
  await new Promise((resolve) => blockerB.listen(preferred + 1, '127.0.0.1', resolve));

  try {
    const result = await getPreferredPort(preferred);
    assert.strictEqual(result, preferred + 2);
  } finally {
    await new Promise((resolve) => blockerA.close(resolve));
    await new Promise((resolve) => blockerB.close(resolve));
  }
});
