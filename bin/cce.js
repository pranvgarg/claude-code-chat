#!/usr/bin/env node
'use strict';
const path = require('node:path');

// Keep the served origin stable between runs. The browser's File System Access
// directory-handle persistence is scoped per origin, including the port.
const DEFAULT_PORT = 61489;
const { createStaticServer } = require('../lib/static-server.js');

const ROOT_DIR = path.join(__dirname, '..');

function usage() {
  console.log('Usage: cce [--help] [--version]');
  console.log('  Run with no command to serve in the foreground and open the browser.');
  console.log('  Press Ctrl+C in the terminal to stop the server.');
}

async function openBrowser(url) {
  try {
    const { default: open } = await import('open');
    await open(url);
  } catch (err) {
    console.error('Could not open browser automatically:', err.message);
  }
}

// Foreground mode: `cce` with no command. Serves in this process, prints the
// URL, opens the browser, and stays up until Ctrl+C (SIGINT) or SIGTERM.
async function serveForeground() {
  const port = Number(process.env.CCE_PORT || DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid CCE_PORT: ${process.env.CCE_PORT}`);
  }
  const server = createStaticServer(ROOT_DIR, { allow: ['index.html', 'assets'] });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const url = `http://localhost:${port}`;
  console.log(`Claude Code Explorer running at ${url}`);
  console.log('Press Ctrl+C to stop.');
  if (!process.env.CCE_NO_OPEN) await openBrowser(url);
  const shutdown = () => {
    console.log('\nStopping.');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command) { await serveForeground(); return; }
  if (command === '--help' || command === '-h') { usage(); return; }
  if (command === '--version' || command === '-v') { console.log(require('../package.json').version); return; }
  else {
    console.error(`Unknown command: ${command}`);
    usage();
    process.exitCode = 1;
  }
}

main().catch((err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(
      `Port ${process.env.CCE_PORT || DEFAULT_PORT} is already in use. `
      + 'Stop the existing CCE terminal with Ctrl+C, then run cce again.'
    );
  } else {
    console.error('Error:', err.message);
  }
  process.exit(1);
});
