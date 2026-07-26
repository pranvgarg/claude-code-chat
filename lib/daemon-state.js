const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');

function createDaemonState(filePath) {
  return {
    read() {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
      } catch (err) {
        if (err.code === 'ENOENT') {
          return null;
        }
        throw err;
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
      const platform = os.platform();
      try {
        if (platform === 'win32') {
          execSync(`tasklist /FI "PID eq ${pid}" /FO CSV`, { stdio: 'pipe' });
          return true;
        } else {
          execSync(`kill -0 ${pid}`, { stdio: 'pipe' });
          return true;
        }
      } catch {
        return false;
      }
    },
  };
}

module.exports = { createDaemonState };
