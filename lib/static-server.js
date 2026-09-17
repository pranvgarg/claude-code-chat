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

const DEFAULT_ALLOW = ['index.html', 'assets'];

function contentTypeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function send(res, status, headers, body) {
  res.writeHead(status, Object.assign({ 'X-Content-Type-Options': 'nosniff' }, headers));
  res.end(body);
}

function plain(res, status, text) {
  send(res, status, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': Buffer.byteLength(text) }, text);
}

// Returns the requested path relative to root (no leading slash) or null.
// Rejects anything whose first segment is not allow-listed and any '..'.
function resolveRelative(requestUrl, allow) {
  let pathname;
  try {
    pathname = decodeURIComponent(requestUrl.split('?')[0]);
  } catch (err) {
    return { error: 400 };
  }
  if (pathname === '/' || pathname === '') pathname = '/index.html';
  const segments = pathname.split(/[\\/]+/).filter((s) => s && s !== '.');
  if (segments.some((s) => s === '..')) return { error: 404 };
  if (!segments.length || !allow.includes(segments[0])) return { error: 404 };
  return { rel: segments.join(path.sep) };
}

function isInside(realRoot, realPath) {
  return realPath === realRoot || realPath.startsWith(realRoot + path.sep);
}

function createStaticServer(rootDir, options) {
  const allow = (options && options.allow) || DEFAULT_ALLOW;
  const realRoot = fs.realpathSync(rootDir);

  return http.createServer((req, res) => {
    const hostHeader = (req.headers.host || '').split(':')[0];
    if (hostHeader !== 'localhost' && hostHeader !== '127.0.0.1') {
      plain(res, 403, 'Forbidden');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      plain(res, 405, 'Method Not Allowed');
      return;
    }
    const resolved = resolveRelative(req.url || '/', allow);
    if (resolved.error === 400) { plain(res, 400, 'Bad Request'); return; }
    if (resolved.error) { plain(res, 404, 'Not Found'); return; }

    const target = path.join(realRoot, resolved.rel);
    fs.realpath(target, (realErr, real) => {
      if (realErr || !isInside(realRoot, real)) { plain(res, 404, 'Not Found'); return; }
      fs.stat(real, (statErr, stat) => {
        if (statErr || !stat.isFile()) { plain(res, 404, 'Not Found'); return; }
        const lastModified = new Date(Math.floor(stat.mtimeMs / 1000) * 1000).toUTCString();
        const ims = req.headers['if-modified-since'];
        if (ims && !Number.isNaN(Date.parse(ims)) && Date.parse(ims) >= Date.parse(lastModified)) {
          send(res, 304, { 'Last-Modified': lastModified, 'Cache-Control': 'no-cache' }, undefined);
          return;
        }
        fs.readFile(real, (readErr, data) => {
          if (readErr) { plain(res, 404, 'Not Found'); return; }
          send(res, 200, {
            'Content-Type': contentTypeFor(real),
            'Content-Length': data.length,
            'Last-Modified': lastModified,
            'Cache-Control': 'no-cache',
          }, req.method === 'HEAD' ? undefined : data);
        });
      });
    });
  });
}

module.exports = { createStaticServer, resolveRelative, DEFAULT_ALLOW };
