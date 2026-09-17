#!/usr/bin/env node
'use strict';
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { getFreePort, getPreferredPort } = require('../lib/port.js');

// Fixed so the served origin (http://localhost:DEFAULT_PORT) stays stable
// across `cce stop`/`cce start` cycles — the browser's File System Access
// directory-handle persistence (IndexedDB) is scoped per-origin, so a
// changing port would force the user to re-pick their ~/.claude folder
// every restart. Falls back to a random free port only if this one's taken.
const DEFAULT_PORT = 61489;
const { createDaemonState } = require('../lib/daemon-state.js');
const { createStaticServer } = require('../lib/static-server.js');

const ROOT_DIR = path.join(__dirname, '..');
const STATE_DIR = process.env.CCE_STATE_DIR || path.join(os.homedir(), '.cce');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const LOG_FILE = path.join(STATE_DIR, 'cce.log');
const state = createDaemonState(STATE_FILE);

function usage() {
  console.log('Usage: cce [start|stop|status] [--help] [--version]');
  console.log('  start    Serve the explorer on http://localhost and open the browser');
  console.log('  stop     Stop the background server');
  console.log('  status   Show whether the server is running');
}

function isValidPort(port) {
  return Number.isInteger(port) && port > 0 && port <= 65535;
}

function runChildServer(port) {
  const server = createStaticServer(ROOT_DIR, { allow: ['index.html', 'assets'] });
  server.listen(port, '127.0.0.1', () => {
    if (process.send) process.send('ready');
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

function waitForChildReady(child, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.removeListener('message', onMessage);
      child.removeListener('exit', onExit);
      resolve();
    };
    const onMessage = (msg) => {
      if (msg === 'ready') finish();
    };
    const onExit = () => finish();
    const timer = setTimeout(finish, timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
    child.on('message', onMessage);
    child.on('exit', onExit);
  });
}

function probePort(port, timeoutMs) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function openBrowser(url) {
  try {
    const { default: open } = await import('open');
    await open(url);
  } catch (err) {
    console.error('Could not open browser automatically:', err.message);
  }
}

async function start() {
  const existing = state.read();
  if (existing && state.isAlive(existing.pid)) {
    console.log(`Already running at http://localhost:${existing.port} (pid ${existing.pid})`);
    return;
  }

  // CCE_TEST_FORCE_PORT: test-only escape hatch letting the integration
  // suite pin the child's port (e.g. to a pre-occupied one) so the
  // child-exit-during-start failure path is deterministically reproducible.
  // Unset in normal use; production behavior is unaffected.
  const port = process.env.CCE_TEST_FORCE_PORT
    ? Number(process.env.CCE_TEST_FORCE_PORT)
    : await getPreferredPort(DEFAULT_PORT);
  if (!isValidPort(port)) {
    console.error(`Invalid port: ${port}`);
    process.exit(1);
  }
  if (!process.env.CCE_TEST_FORCE_PORT && port !== DEFAULT_PORT) {
    console.warn(
      `Port ${DEFAULT_PORT} is in use — falling back to ${port}. `
      + 'If your browser previously granted access to a ~/.claude folder, '
      + 'that permission is tied to the port and may not carry over this run.'
    );
  }
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const logFd = fs.openSync(LOG_FILE, 'a');

  const child = spawn(process.execPath, [__filename, `--internal-serve=${port}`], {
    detached: true,
    stdio: ['ignore', logFd, logFd, 'ipc'],
  });
  child.on('error', (err) => {
    fs.closeSync(logFd);
    console.error('Failed to start server:', err.message);
    process.exit(1);
  });

  await waitForChildReady(child, 5000);

  if (child.exitCode !== null || child.signalCode !== null) {
    let detail = '';
    try {
      detail = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').slice(-5).join('\n');
    } catch {
      // ignore — log file may not exist or be readable
    }
    fs.closeSync(logFd);
    console.error(
      `Server failed to start (exited with code ${child.exitCode}, signal ${child.signalCode}).`
      + (detail ? `\nLast log output:\n${detail}` : '')
    );
    process.exit(1);
  }

  fs.closeSync(logFd);
  if (child.channel) child.disconnect();
  child.unref();

  state.write({ pid: child.pid, port, startedAt: Date.now() });

  if (!process.env.CCE_NO_OPEN) {
    await openBrowser(`http://localhost:${port}`);
  }

  console.log(`Started Claude Code Explorer at http://localhost:${port} (pid ${child.pid})`);
}

async function stop() {
  const existing = state.read();
  if (!existing || !state.isAlive(existing.pid)) {
    console.log('Not running.');
    state.clear();
    return;
  }
  // The pid alone isn't enough to prove it's our server: pids get recycled
  // by the OS, and this state file can outlive a reboot. Require the
  // recorded port to actually be answering before signaling the pid.
  const responding = await probePort(existing.port, 500);
  if (!responding) {
    console.log(
      `Recorded server (pid ${existing.pid}, port ${existing.port}) isn't responding — `
      + 'not sending a stop signal, since the pid may have been recycled by an unrelated process. Clearing stale state.'
    );
    state.clear();
    return;
  }
  process.kill(existing.pid, 'SIGTERM');
  state.clear();
  console.log(`Stopped (was pid ${existing.pid}, port ${existing.port}).`);
}

function status() {
  const existing = state.read();
  if (existing && state.isAlive(existing.pid)) {
    console.log(`Running at http://localhost:${existing.port} (pid ${existing.pid})`);
  } else {
    console.log('Not running.');
    if (existing) state.clear();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const internalFlag = args.find((a) => a.startsWith('--internal-serve='));
  if (internalFlag) {
    const port = Number(internalFlag.split('=')[1]);
    if (!isValidPort(port)) {
      console.error(`Invalid --internal-serve port: ${internalFlag.split('=')[1]}`);
      process.exit(1);
    }
    runChildServer(port);
    return;
  }

  const command = args[0] || 'start';
  if (command === '--help' || command === '-h') { usage(); return; }
  if (command === '--version' || command === '-v') { console.log(require('../package.json').version); return; }
  if (command === 'start') await start();
  else if (command === 'stop') await stop();
  else if (command === 'status') status();
  else {
    usage();
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
