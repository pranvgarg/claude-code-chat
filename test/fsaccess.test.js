'use strict';

// node:test unit tests for the pure sessionsFromFileList helper.
// We load fsaccess.js in a minimal stub environment (no DOM, no IDB, no FSA).
// The helper is exposed as CCE.fsaccess._sessionsFromFileList.

const { test } = require('node:test');
const assert = require('node:assert/strict');

// ---- minimal browser-like globals so the IIFE doesn't throw ----
const g = globalThis;
if (!g.location) {
  g.location = { protocol: 'file:', host: '', hostname: '' };
}
// No indexedDB, no showDirectoryPicker — that's fine; we only test the helper.

require('../assets/js/core/fsaccess.js');

const { _sessionsFromFileList } = globalThis.CCE.fsaccess;

// Helper to build a fake file entry
function fakeFile(relPath) {
  return {
    webkitRelativePath: relPath,
    name: relPath.split('/').pop(),
    text: function () { return Promise.resolve('{}'); }
  };
}

test('returns session for valid projects/<folder>/<uuid>.jsonl path', function () {
  var files = [
    fakeFile('dot-claude/projects/my-project/abc123.jsonl')
  ];
  var sessions = _sessionsFromFileList(files);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, 'abc123');
  assert.equal(sessions[0].projectFolder, 'my-project');
});

test('ignores non-jsonl files', function () {
  var files = [
    fakeFile('dot-claude/projects/my-project/notes.txt'),
    fakeFile('dot-claude/projects/my-project/abc123.jsonl')
  ];
  var sessions = _sessionsFromFileList(files);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, 'abc123');
});

test('ignores files not under projects/', function () {
  var files = [
    fakeFile('dot-claude/settings/something.jsonl'),
    fakeFile('dot-claude/projects/proj/abc.jsonl')
  ];
  var sessions = _sessionsFromFileList(files);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, 'abc');
});

test('ignores files nested deeper than direct child of projectFolder', function () {
  var files = [
    fakeFile('dot-claude/projects/proj/sub/abc.jsonl')
  ];
  var sessions = _sessionsFromFileList(files);
  assert.equal(sessions.length, 0);
});

test('skips paths containing a SKIP_DIR segment', function () {
  var skipDirs = ['cache', 'backups', 'file-history', 'debug',
                  'sessions', 'session-env', 'node_modules'];
  skipDirs.forEach(function (dir) {
    var files = [
      fakeFile('dot-claude/projects/' + dir + '/abc.jsonl')
    ];
    var sessions = _sessionsFromFileList(files);
    assert.equal(sessions.length, 0, 'should skip dir: ' + dir);
  });
});

test('handles multiple sessions across different projects', function () {
  var files = [
    fakeFile('root/projects/proj-a/session1.jsonl'),
    fakeFile('root/projects/proj-a/session2.jsonl'),
    fakeFile('root/projects/proj-b/session3.jsonl'),
    fakeFile('root/other/proj-c/session4.jsonl')  // no 'projects' segment
  ];
  var sessions = _sessionsFromFileList(files);
  assert.equal(sessions.length, 3);
  var ids = sessions.map(function (s) { return s.id; }).sort();
  assert.deepEqual(ids, ['session1', 'session2', 'session3']);
});

test('works with relPath property instead of webkitRelativePath', function () {
  var f = {
    relPath: 'root/projects/proj/uuid-abc.jsonl',
    name: 'uuid-abc.jsonl',
    text: function () { return Promise.resolve(''); }
  };
  var sessions = _sessionsFromFileList([f]);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, 'uuid-abc');
});

test('returns empty array for empty file list', function () {
  assert.deepEqual(_sessionsFromFileList([]), []);
});
