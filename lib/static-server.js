'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function contentTypeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function resolveSafePath(rootDir, requestUrl) {
  const pathname = decodeURIComponent(requestUrl.split('?')[0]);
  const resolved = path.normalize(path.join(rootDir, pathname));
  const rootWithSep = rootDir.endsWith(path.sep) ? rootDir : rootDir + path.sep;
  if (resolved !== rootDir && !resolved.startsWith(rootWithSep)) {
    return null;
  }
  return resolved;
}

function createStaticServer(rootDir) {
  return http.createServer((req, res) => {
    const hostHeader = (req.headers.host || '').split(':')[0];
    if (hostHeader !== 'localhost' && hostHeader !== '127.0.0.1') {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end('Method Not Allowed');
      return;
    }

    let target = resolveSafePath(rootDir, req.url);
    if (!target) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    fs.stat(target, (statErr, stat) => {
      if (!statErr && stat.isDirectory()) {
        target = path.join(target, 'index.html');
      }

      fs.readFile(target, (readErr, data) => {
        if (readErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': contentTypeFor(target) });
        res.end(req.method === 'HEAD' ? undefined : data);
      });
    });
  });
}

module.exports = { createStaticServer };
