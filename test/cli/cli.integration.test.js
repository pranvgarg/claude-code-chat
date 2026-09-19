const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const http = require('node:http');
const { spawnSync, spawn } = require('node:child_process');

const CLI = path.join(__dirname, '..', '..', 'bin', 'cce.js');

async function waitFor(fn, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = fn();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('waitFor timed out');
}

function get(port, pathname) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: pathname }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

test('--help, -h and --version exit 0 and print usage/version', () => {
  const pkg = require('../../package.json');
  for (const flag of ['--help', '-h']) {
    const r = spawnSync(process.execPath, [CLI, flag], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /Usage: cce/);
  }
  const v = spawnSync(process.execPath, [CLI, '--version'], { encoding: 'utf8' });
  assert.strictEqual(v.status, 0, v.stderr);
  assert.strictEqual(v.stdout.trim(), pkg.version);
});

test('background lifecycle commands are removed', () => {
  for (const command of ['start', 'stop', 'status']) {
    const r = spawnSync(process.execPath, [CLI, command], { encoding: 'utf8' });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, new RegExp('Unknown command: ' + command));
  }
});

test('help explains the stable foreground lifecycle', () => {
  const r = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' });
  assert.match(r.stdout, /foreground/i);
  assert.match(r.stdout, /Ctrl\+C/);
  assert.doesNotMatch(r.stdout, /cce \[(?:start|stop|status)/i);
});

test('unknown command still exits 1', () => {
  const r = spawnSync(process.execPath, [CLI, 'bogus'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
});

test('no-arg run serves in the foreground until SIGINT', async () => {
  const env = { ...process.env, CCE_NO_OPEN: '1' };
  const child = spawn(process.execPath, [CLI], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  const port = await waitFor(() => { const m = /localhost:(\d+)/.exec(out); return m ? Number(m[1]) : null; }, 5000);
  const res = await get(port, '/');
  assert.strictEqual(res.status, 200);
  assert.match(out, /Ctrl\+C/);
  const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));
  child.kill('SIGINT');
  const e = await exited;
  assert.strictEqual(e.code, 0);
  const after = await get(port, '/').catch(() => ({ status: 'closed' }));
  assert.strictEqual(after.status, 'closed');
});
