process.env.NODE_PATH = (process.env.NODE_PATH || '') + ':/usr/lib/node_modules:/usr/lib/nodejs';
require('module').Module._initPaths();
process.env.APP_PATH = process.env.APP_PATH || __dirname;

var http = require('http');
var fs = require('fs');
var path = require('path');
var Service = require('webos-service');

var service = new Service('io.strem.tvr.server');
var ready = false;
var pendingMessages = [];

// Keep the service alive indefinitely
service.activityManager.create('keepAlive', function() {});

// Register the start method — responds once the HTTP server is listening
service.register('start', function(message) {
    if (ready) {
        message.respond({ ready: true });
    } else {
        pendingMessages.push(message);
    }
});

// Static file serving
var wwwDir = path.join(__dirname, 'www');
var mimeTypes = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon', '.gif': 'image/gif', '.webp': 'image/webp',
    '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
    '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.json': 'application/json',
    '.map': 'application/json', '.txt': 'text/plain', '.mp3': 'audio/mpeg'
};

function serveStatic(req, urlPath, res, next) {
    // Reject path traversal
    var filePath = path.join(wwwDir, urlPath === '/' ? 'index.html' : urlPath);
    if (filePath.indexOf(wwwDir) !== 0) return next();

    fs.stat(filePath, function(err, stat) {
        if (err || !stat.isFile()) return next();
        var ext = path.extname(filePath).toLowerCase();
        // ETag + no-cache: the browser keeps files in its HTTP cache and revalidates with a cheap 304,
        // which also lets Chromium reuse its compiled JS/wasm code cache across app launches.
        var etag = '"' + stat.size.toString(16) + '-' + stat.mtime.getTime().toString(16) + '"';
        if (req.headers['if-none-match'] === etag) {
            res.writeHead(304, { 'ETag': etag });
            return res.end();
        }
        res.writeHead(200, {
            'Content-Type': mimeTypes[ext] || 'application/octet-stream',
            'Content-Length': stat.size,
            'Cache-Control': 'no-cache',
            'ETag': etag
        });
        var stream = fs.createReadStream(filePath);
        stream.on('error', function() { try { res.end(); } catch (_) {} });
        stream.pipe(res);
    });
}

var proxyAgent = new http.Agent({ keepAlive: true });

// The UI is served before server.js finishes loading, so early GETs retry until :11470 is up (~20s max)
function proxyToStreaming(req, res, attempt) {
    attempt = attempt || 0;
    var idempotent = req.method === 'GET' || req.method === 'HEAD';
    var opts = { hostname: '127.0.0.1', port: 11470, path: req.url, method: req.method, headers: req.headers, agent: proxyAgent };
    var proxy = http.request(opts, function(proxyRes) {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
    });
    proxy.on('error', function(err) {
        if (err.code === 'ECONNREFUSED' && idempotent && attempt < 80 && !res.headersSent) {
            return setTimeout(function() { proxyToStreaming(req, res, attempt + 1); }, 250);
        }
        if (!res.headersSent) res.writeHead(502);
        res.end();
    });
    if (idempotent) proxy.end();
    else req.pipe(proxy);
}

// Point the streaming server at the bundled ffmpeg binaries.
// HLS remux/transcode requires ffmpeg+ffprobe; without these the streaming
// server's /hlsv2/* endpoints return 500 "no ffmpeg found".
process.env.FFMPEG_BIN = path.join(__dirname, 'bin', 'ffmpeg');
process.env.FFPROBE_BIN = path.join(__dirname, 'bin', 'ffprobe');

// Single server: static files first, then proxy to streaming server
http.createServer(function(req, res) {
    var urlPath = req.url.split('?')[0];
    serveStatic(req, urlPath, res, function() { proxyToStreaming(req, res); });
}).listen(8081, function() { // 8081, not 8080: the stock io.strem.tv service may still hold 8080
    ready = true;
    // Respond to any start calls that arrived before the server was ready
    pendingMessages.forEach(function(msg) { msg.respond({ ready: true }); });
    pendingMessages = [];
    // Load the streaming server only after the UI is reachable, so the TV fetches/compiles the frontend in parallel.
    // If another Stremio service already runs one on :11470, reuse it instead of crashing with EADDRINUSE.
    require('net').connect(11470, '127.0.0.1')
        .on('connect', function() { this.destroy(); })
        .on('error', function() { require('./server.js'); applyTorrentProfile(0); });
});

// Stremio's "fast" torrent profile (same values the desktop app offers). The server default stops seeking
// peers at 2.5 MB/s with 55 connections, too low for 4K; the Theater UI has no setting for it.
var TORRENT_PROFILE = JSON.stringify({
    btMaxConnections: 200,
    btHandshakeTimeout: 20000,
    btRequestTimeout: 4000,
    btDownloadSpeedSoftLimit: 4194304,
    btDownloadSpeedHardLimit: 39321600,
    btMinPeersForStable: 10
});

function applyTorrentProfile(attempt) {
    var req = http.request({ hostname: '127.0.0.1', port: 11470, path: '/settings', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(TORRENT_PROFILE) } }, function(res) { res.resume(); });
    req.on('error', function() {
        if (attempt < 60) setTimeout(function() { applyTorrentProfile(attempt + 1); }, 500);
    });
    req.end(TORRENT_PROFILE);
}
