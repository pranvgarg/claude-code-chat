#!/usr/bin/env node
'use strict';
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { getFreePort } = require('../lib/port.js');
const { createDaemonState } = require('../lib/daemon-state.js');
const { createStaticServer } = require('../lib/static-server.js');

const ROOT_DIR = path.join(__dirname, '..');
const STATE_DIR = process.env.CCE_STATE_DIR || path.join(os.homedir(), '.cce');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const LOG_FILE = path.join(STATE_DIR, 'cce.log');
const state = createDaemonState(STATE_FILE);

function usage() {
  console.log('Usage: cce [start|stop|status]');
}

function runChildServer(port) {
  const server = createStaticServer(ROOT_DIR);
  server.listen(port, '127.0.0.1');
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
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

  const port = await getFreePort();
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const logFd = fs.openSync(LOG_FILE, 'a');

  const child = spawn(process.execPath, [__filename, `--internal-serve=${port}`], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  child.on('error', (err) => {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  });
  child.unref();

  state.write({ pid: child.pid, port, startedAt: Date.now() });

  if (!process.env.CCE_NO_OPEN) {
    await openBrowser(`http://localhost:${port}`);
  }

  console.log(`Started Claude Code Explorer at http://localhost:${port} (pid ${child.pid})`);
}

function stop() {
  const existing = state.read();
  if (!existing || !state.isAlive(existing.pid)) {
    console.log('Not running.');
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
    runChildServer(port);
    return;
  }

  const command = args[0] || 'start';
  if (command === 'start') await start();
  else if (command === 'stop') stop();
  else if (command === 'status') status();
  else usage();
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
