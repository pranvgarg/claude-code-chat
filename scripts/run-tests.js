#!/usr/bin/env node
'use strict';
// Zero-dependency test runner: collects test/cli/*.test.js (tracked in git)
// plus any *.test.js directly under test/ (gitignored, run locally) and
// spawns `node --test <files>` so `npm test` doesn't depend on the shell's
// glob expansion (which behaves differently across shells/platforms).
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.join(__dirname, '..');
const testDir = path.join(repoRoot, 'test');
const cliDir = path.join(testDir, 'cli');

function collect(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.test.js'))
    .map((f) => path.join(dir, f))
    .sort();
}

const files = [...collect(cliDir), ...collect(testDir)];

if (!files.length) {
  console.error('No test files found under test/cli or test/.');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], {
  stdio: 'inherit',
  cwd: repoRoot
});

process.exit(result.status == null ? 1 : result.status);
