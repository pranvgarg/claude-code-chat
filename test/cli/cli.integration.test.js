const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const net = require('node:net');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawnSync, spawn } = require('node:child_process');
const { getFreePort } = require('../../lib/port.js');

const CLI = path.join(__dirname, '..', '..', 'bin', 'cce.js');

function tmpStateDir() {
  return path.join(os.tmpdir(), `cce-test-${crypto.randomUUID()}`);
}

function readStateFile(stateDir) {
  const file = path.join(stateDir, 'state.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

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

test('cce start/status/stop full cycle', async () => {
  const stateDir = tmpStateDir();
  const env = { ...process.env, CCE_STATE_DIR: stateDir, CCE_NO_OPEN: '1' };

  const startResult = spawnSync(process.execPath, [CLI, 'start'], { env, encoding: 'utf8' });
  assert.strictEqual(startResult.status, 0, startResult.stderr);

  const runningState = await waitFor(() => readStateFile(stateDir), 3000);
  assert.strictEqual(typeof runningState.port, 'number');
  assert.strictEqual(typeof runningState.pid, 'number');

  const response = await get(runningState.port, '/');
  assert.strictEqual(response.status, 200);
  assert.match(response.body, /<html/i);

  const statusResult = spawnSync(process.execPath, [CLI, 'status'], { env, encoding: 'utf8' });
  assert.match(statusResult.stdout, /Running at http:\/\/localhost:/);

  const stopResult = spawnSync(process.execPath, [CLI, 'stop'], { env, encoding: 'utf8' });
  assert.match(stopResult.stdout, /Stopped/);

  await waitFor(() => !fs.existsSync(path.join(stateDir, 'state.json')), 2000);
  await assert.rejects(() => get(runningState.port, '/'));

  fs.rmSync(stateDir, { recursive: true, force: true });
});

test('cce start reports failure (not success) when the child exits immediately', async () => {
  const stateDir = tmpStateDir();
  const occupiedPort = await getFreePort();

  // Hold the port open so the child server's own listen() fails with
  // EADDRINUSE and the child exits right away — this is the exact
  // condition the exitCode/signalCode check added after the ready-wait
  // in start() must catch (regression for commit 1096351).
  const blocker = net.createServer();
  await new Promise((resolve) => blocker.listen(occupiedPort, '127.0.0.1', resolve));

  try {
    const env = {
      ...process.env,
      CCE_STATE_DIR: stateDir,
      CCE_NO_OPEN: '1',
      CCE_TEST_FORCE_PORT: String(occupiedPort),
    };
    const startResult = spawnSync(process.execPath, [CLI, 'start'], { env, encoding: 'utf8' });

    assert.notStrictEqual(startResult.status, 0);
    assert.match(startResult.stderr, /failed to start/i);
    assert.strictEqual(readStateFile(stateDir), null);
  } finally {
    await new Promise((resolve) => blocker.close(resolve));
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('cce stop refuses to signal a pid whose recorded port is not responding', async () => {
  const stateDir = tmpStateDir();
  fs.mkdirSync(stateDir, { recursive: true });

  // A real, currently-alive process standing in for a recycled pid, plus a
  // port nothing is listening on — stop() must not send SIGTERM here
  // (regression for the PID-recycle finding: a bare pid check is not proof
  // of ownership).
  const bystander = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
  await new Promise((resolve) => bystander.once('spawn', resolve));

  const freePort = await getFreePort();
  fs.writeFileSync(
    path.join(stateDir, 'state.json'),
    JSON.stringify({ pid: bystander.pid, port: freePort, startedAt: Date.now() }),
    'utf8'
  );

  try {
    const env = { ...process.env, CCE_STATE_DIR: stateDir, CCE_NO_OPEN: '1' };
    const stopResult = spawnSync(process.execPath, [CLI, 'stop'], { env, encoding: 'utf8' });

    assert.match(stopResult.stdout, /isn't responding/i);
    assert.strictEqual(readStateFile(stateDir), null);
    // The bystander must still be alive — proof stop() did not signal it.
    assert.doesNotThrow(() => process.kill(bystander.pid, 0));
  } finally {
    bystander.kill('SIGKILL');
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

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

test('unknown command still exits 1', () => {
  const r = spawnSync(process.execPath, [CLI, 'bogus'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
});
