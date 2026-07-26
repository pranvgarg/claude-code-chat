const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

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
