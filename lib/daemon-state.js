const fs = require('node:fs');
const path = require('node:path');

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
