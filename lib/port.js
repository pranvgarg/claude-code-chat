'use strict';
const net = require('node:net');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => resolve(address.port));
    });
  });
}

function tryBind(port) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        reject(err);
      }
    });
    probe.listen(port, '127.0.0.1', () => {
      probe.close(() => resolve(true));
    });
  });
}

const MAX_SEQUENTIAL_ATTEMPTS = 20;

// Tries the preferred port, then increments sequentially (the convention
// used by Vite/CRA/Jupyter/etc.) up to MAX_SEQUENTIAL_ATTEMPTS times before
// giving up and falling back to a fully random OS-assigned port. Browser FSA
// directory-handle persistence (IndexedDB) is scoped per-origin
// (scheme+host+port), so reusing the same port across `cce stop`/`cce start`
// cycles keeps the origin stable and lets a previously granted folder handle
// keep working instead of re-prompting.
async function getPreferredPort(preferredPort) {
  for (let offset = 0; offset < MAX_SEQUENTIAL_ATTEMPTS; offset++) {
    const candidate = preferredPort + offset;
    if (candidate > 65535) break;
    if (await tryBind(candidate)) {
      return candidate;
    }
  }
  return getFreePort();
}

module.exports = { getFreePort, getPreferredPort };
