const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const crypto = require('node:crypto');
const net = require('node:net');
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

function rawRequest(port, requestText) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, '127.0.0.1', () => sock.write(requestText));
    let data = '';
    sock.on('data', (c) => { data += c; });
    sock.on('end', () => resolve(data));
    sock.on('error', reject);
  });
}

function requestFull(port, rawPath, headers) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: rawPath, headers: headers || {} }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', reject);
  });
}

test('does not serve files outside the allow-list (dotfiles, package.json)', async () => {
  const dir = makeFixtureDir();
  fs.mkdirSync(path.join(dir, '.git'));
  fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/main');
  fs.writeFileSync(path.join(dir, 'package.json'), '{}');
  const server = await startServer(dir);
  const port = server.address().port;
  assert.strictEqual((await request(port, '/.git/HEAD')).status, 404);
  assert.strictEqual((await request(port, '/package.json')).status, 404);
  assert.strictEqual((await request(port, '/assets/app.js')).status, 200);
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('does not follow symlinks that escape rootDir', async () => {
  if (process.platform === 'win32') return;
  const dir = makeFixtureDir();
  const outside = path.join(os.tmpdir(), `cce-outside-${crypto.randomUUID()}`);
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'SECRET');
  fs.symlinkSync(outside, path.join(dir, 'assets', 'link'));
  const server = await startServer(dir);
  const port = server.address().port;
  const res = await request(port, '/assets/link/secret.txt');
  assert.strictEqual(res.status, 404);
  assert.doesNotMatch(res.body, /SECRET/);
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

test('returns 400 on malformed percent-encoding and keeps serving', async () => {
  const dir = makeFixtureDir();
  const server = await startServer(dir);
  const port = server.address().port;
  const raw = await rawRequest(port, 'GET /%zz HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
  assert.match(raw, /^HTTP\/1\.1 400/);
  assert.strictEqual((await request(port, '/')).status, 200);
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('sets cache and safety headers and answers 304 to If-Modified-Since', async () => {
  const dir = makeFixtureDir();
  const server = await startServer(dir);
  const port = server.address().port;
  const first = await requestFull(port, '/assets/app.js');
  assert.strictEqual(first.headers['content-length'], String(Buffer.byteLength('console.log(1);')));
  assert.strictEqual(first.headers['x-content-type-options'], 'nosniff');
  assert.ok(first.headers['last-modified']);
  const again = await requestFull(port, '/assets/app.js', { 'If-Modified-Since': first.headers['last-modified'] });
  assert.strictEqual(again.status, 304);
  assert.strictEqual(again.body, '');
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('HEAD returns headers without a body, POST returns 405, foreign Host returns 403', async () => {
  const dir = makeFixtureDir();
  const server = await startServer(dir);
  const port = server.address().port;
  const head = await rawRequest(port, 'HEAD /index.html HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
  assert.match(head, /^HTTP\/1\.1 200/);
  assert.doesNotMatch(head, /<html>/);
  const post = await rawRequest(port, 'POST / HTTP/1.1\r\nHost: localhost\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
  assert.match(post, /^HTTP\/1\.1 405/);
  const evil = await rawRequest(port, 'GET / HTTP/1.1\r\nHost: evil.com\r\nConnection: close\r\n\r\n');
  assert.match(evil, /^HTTP\/1\.1 403/);
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
