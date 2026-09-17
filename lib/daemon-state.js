'use strict';
const fs = require('node:fs');
const path = require('node:path');

function createDaemonState(filePath) {
  return {
    read() {
      let content;
      try {
        content = fs.readFileSync(filePath, 'utf-8');
      } catch (err) {
        if (err.code === 'ENOENT') {
          return null;
        }
        throw err;
      }
      try {
        return JSON.parse(content);
      } catch (err) {
        // Corrupt/truncated state file (e.g. crash mid-write) — treat as
        // absent rather than bricking start/stop/status with a raw parse error.
        return null;
      }
    },

    write(obj) {
      const dir = path.dirname(filePath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf-8');
    },

    clear() {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        if (err.code !== 'ENOENT') {
          throw err;
        }
      }
    },

    isAlive(pid) {
      try {
        process.kill(pid, 0);
        return true;
      } catch (err) {
        if (err.code === 'ESRCH') return false;
        if (err.code === 'EPERM') return true;
        return false;
      }
    },
  };
}

module.exports = { createDaemonState };
