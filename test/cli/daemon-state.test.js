const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { createDaemonState } = require('../../lib/daemon-state.js');

function tmpStateFile() {
  return path.join(os.tmpdir(), `cce-daemon-state-${crypto.randomUUID()}.json`);
}

test('write/read round-trips and clear removes the file', () => {
  const file = tmpStateFile();
  const state = createDaemonState(file);

  assert.strictEqual(state.read(), null);

  state.write({ pid: 12345, port: 4317, startedAt: 1000 });
  const loaded = state.read();
  assert.deepStrictEqual(loaded, { pid: 12345, port: 4317, startedAt: 1000 });

  state.clear();
  assert.strictEqual(state.read(), null);
  assert.strictEqual(fs.existsSync(file), false);
});

test('write creates parent directories as needed', () => {
  const dir = path.join(os.tmpdir(), `cce-daemon-dir-${crypto.randomUUID()}`);
  const file = path.join(dir, 'nested', 'state.json');
  const state = createDaemonState(file);

  state.write({ pid: 1, port: 2, startedAt: 3 });
  assert.strictEqual(fs.existsSync(file), true);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('isAlive reflects real process liveness', () => {
  const file = tmpStateFile();
  const state = createDaemonState(file);

  assert.strictEqual(state.isAlive(process.pid), true);

  // Spawn a short-lived child, wait for it to exit, then confirm its pid
  // reads back as dead — this is a deterministic way to get a pid that
  // definitely does not exist without guessing numbers.
  const child = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
  assert.strictEqual(child.status, 0);
  assert.strictEqual(state.isAlive(child.pid), false);
});
