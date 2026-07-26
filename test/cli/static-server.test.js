const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const crypto = require('node:crypto');
const { createStaticServer } = require('../../lib/static-server.js');

function makeFixtureDir() {
  const dir = path.join(os.tmpdir(), `cce-static-${crypto.randomUUID()}`);
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), '<html><body>hi</body></html>');
  fs.writeFileSync(path.join(dir, 'assets', 'app.js'), 'console.log(1);');
  return dir;
}

function startServer(rootDir) {
  return new Promise((resolve) => {
    const server = createStaticServer(rootDir);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function request(port, rawPath) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: rawPath }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({
        status: res.statusCode,
        contentType: res.headers['content-type'],
        body,
      }));
    }).on('error', reject);
  });
}

test('serves index.html at root', async () => {
  const dir = makeFixtureDir();
  const server = await startServer(dir);
  const port = server.address().port;

  const res = await request(port, '/');
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /hi/);

  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('serves nested files with correct content-type', async () => {
  const dir = makeFixtureDir();
  const server = await startServer(dir);
  const port = server.address().port;

  const res = await request(port, '/assets/app.js');
  assert.strictEqual(res.status, 200);
  assert.match(res.contentType, /javascript/);
  assert.match(res.body, /console\.log/);

  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('returns 404 for missing files', async () => {
  const dir = makeFixtureDir();
  const server = await startServer(dir);
  const port = server.address().port;

  const res = await request(port, '/does-not-exist.txt');
  assert.strictEqual(res.status, 404);

  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('blocks path traversal outside rootDir', async () => {
  const dir = makeFixtureDir();
  const server = await startServer(dir);
  const port = server.address().port;

  // Sent as a raw request path so Node's http client does not normalize
  // the ".." segments away before the request reaches our handler.
  const res = await request(port, '/%2e%2e/%2e%2e/%2e%2e/etc/passwd');
  assert.notStrictEqual(res.status, 200);

  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
