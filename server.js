const fs = require("fs");
const dns = require("dns").promises;
const http = require("http");
const net = require("net");
const path = require("path");
const url = require("url");

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const GAMES_DIR = path.join(ROOT, "games");
const PROXY_DNS_TTL_MS = 5 * 60 * 1000;
const PROXY_TEXT_CACHE_TTL_MS = 30 * 1000;
const PROXY_TEXT_CACHE_MAX_BYTES = 1024 * 1024;
const PROXY_TEXT_CACHE_MAX_ITEMS = 80;
const proxyDnsCache = new Map();
const proxyTextCache = new Map();
const UV_PROXY = loadUvProxy();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".data": "application/octet-stream",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".wasm": "application/wasm",
  ".pck": "application/octet-stream",
  ".unityweb": "application/octet-stream",
  ".symbols": "application/octet-stream",
  ".mem": "application/octet-stream"
};

function loadUvProxy() {
  try {
    const { uvPath } = require("@titaniumnetwork-dev/ultraviolet");
    const { baremuxPath } = require("@mercuryworkshop/bare-mux/node");
    const epoxyPath = path.dirname(require.resolve("@mercuryworkshop/epoxy-transport"));
    const { server: wisp, logging } = require("@mercuryworkshop/wisp-js/server");
    logging.set_level(logging.ERROR);
    const routeRequest = wisp.routeRequest;

    return {
      available: true,
      routeRequest,
      routes: [
        { prefix: "/uv/", dir: uvPath },
        { prefix: "/baremux/", dir: baremuxPath },
        { prefix: "/epoxy/", dir: epoxyPath }
      ]
    };
  } catch (error) {
    console.warn(`Ultraviolet proxy engine is not ready: ${error.message}`);
    return {
      available: false,
      routeRequest: null,
      routes: []
    };
  }
}

function responseHeaders(filePath, stats, isolated = false) {
  const extension = path.extname(filePath).toLowerCase();
  const headers = {
    "Content-Type": MIME[extension] || "application/octet-stream",
    "Cache-Control": "no-store"
  };

  if (isolated) {
    headers["Cross-Origin-Opener-Policy"] = "same-origin";
    headers["Cross-Origin-Embedder-Policy"] = "require-corp";
    headers["Cross-Origin-Resource-Policy"] = "same-origin";
  }

  if (stats) headers["Content-Length"] = stats.size;
  return headers;
}

function isGameHtml(filePath) {
  return path.extname(filePath).toLowerCase().match(/^\.html?$/) && filePath.startsWith(GAMES_DIR);
}

function normalizeGameHtml(html) {
  return html.replace(/<base\s+[^>]*href=["']https?:\/\/[^"']+["'][^>]*>\s*/i, "");
}

function ensureGamesDir() {
  if (!fs.existsSync(GAMES_DIR)) {
    fs.mkdirSync(GAMES_DIR, { recursive: true });
  }
}

function titleFromFile(filePath) {
  return path
    .basename(filePath, path.extname(filePath))
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function scanGames() {
  ensureGamesDir();
  const games = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }

      if (!/\.html?$/i.test(entry.name)) continue;

      const relative = path.relative(GAMES_DIR, absolute).replace(/\\/g, "/");
      const stats = fs.statSync(absolute);
      games.push({
        id: relative.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
        title: titleFromFile(entry.name),
        file: relative,
        url: `/games/${relative.split("/").map(encodeURIComponent).join("/")}`,
        size: stats.size,
        updated: stats.mtime.toISOString()
      });
    }
  }

  walk(GAMES_DIR);
  return games.sort((a, b) => a.title.localeCompare(b.title));
}

function sendJson(res, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function sendUvConfig(res) {
  res.writeHead(200, {
    "Content-Type": "text/javascript; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(`/*global Ultraviolet*/
self.__uv$config = {
  prefix: "/service/",
  encodeUrl: Ultraviolet.codec.xor.encode,
  decodeUrl: Ultraviolet.codec.xor.decode,
  handler: "/uv/uv.handler.js",
  client: "/uv/uv.client.js",
  bundle: "/uv/uv.bundle.js",
  config: "/uv/uv.config.js",
  sw: "/uv/uv.sw.js"
};
`);
}

function sendUvWorker(res) {
  res.writeHead(200, {
    "Content-Type": "text/javascript; charset=utf-8",
    "Cache-Control": "no-store",
    "Service-Worker-Allowed": "/"
  });
  res.end(`/*global UVServiceWorker,__uv$config*/
importScripts("/uv/uv.bundle.js");
importScripts("/uv/uv.config.js?v=root-service");
importScripts(__uv$config.sw || "uv.sw.js");

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const uv = new UVServiceWorker();

self.addEventListener("fetch", (event) => {
  event.respondWith(uv.route(event) ? uv.fetch(event) : fetch(event.request));
});
`);
}

function sendUvUnavailable(res) {
  sendProxyError(res, 503, "The real proxy engine is not installed yet. Run npm install, then restart the website.");
}

function sendProxyError(res, status, message) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Proxy notice</title>
    <style>
      body{display:grid;min-height:100vh;margin:0;place-items:center;background:#061018;color:#f7fbff;font-family:system-ui,sans-serif}
      main{max-width:520px;padding:24px;text-align:center}
      strong{display:block;margin-bottom:8px;font-size:24px}
      span{color:rgba(247,251,255,.68)}
    </style>
  </head>
  <body><main><strong>Proxy could not open this page.</strong><span>${escapeHtml(message)}</span></main></body>
</html>`);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function getProxyTextCache(key) {
  const entry = proxyTextCache.get(key);
  if (!entry) return null;
  if (entry.expires <= Date.now()) {
    proxyTextCache.delete(key);
    return null;
  }
  return entry;
}

function setProxyTextCache(key, entry) {
  if (Buffer.byteLength(entry.body, "utf8") > PROXY_TEXT_CACHE_MAX_BYTES) return;
  if (proxyTextCache.size >= PROXY_TEXT_CACHE_MAX_ITEMS) {
    proxyTextCache.delete(proxyTextCache.keys().next().value);
  }
  proxyTextCache.set(key, {
    ...entry,
    expires: Date.now() + PROXY_TEXT_CACHE_TTL_MS
  });
}

function normalizeProxyTarget(rawTarget) {
  const trimmed = String(rawTarget || "").trim();
  if (!trimmed) throw new Error("Enter a URL first.");
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const target = new URL(withProtocol);
  if (!["http:", "https:"].includes(target.protocol)) {
    throw new Error("Only http and https pages are supported.");
  }
  target.hash = "";
  return target;
}

function isPrivateAddress(address) {
  if (!address) return true;
  const lowered = address.toLowerCase();
  if (lowered === "localhost" || lowered === "::1" || lowered.startsWith("fe80:") || lowered.startsWith("fc") || lowered.startsWith("fd")) return true;

  if (net.isIP(address) === 4) {
    const parts = address.split(".").map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 169 && parts[1] === 254) ||
      parts[0] === 0
    );
  }

  return false;
}

async function assertProxyTargetAllowed(target) {
  const hostname = target.hostname.toLowerCase();
  if (isPrivateAddress(hostname)) {
    throw new Error("Local and private network addresses are blocked.");
  }

  const cached = proxyDnsCache.get(hostname);
  if (cached && cached.expires > Date.now()) {
    if (!cached.allowed) throw new Error(cached.message);
    return;
  }

  let allowed = false;
  let message = "";
  try {
    const records = await dns.lookup(hostname, { all: true });
    allowed = Boolean(records.length) && records.every((record) => !isPrivateAddress(record.address));
    message = allowed ? "" : "This address resolves to a blocked network.";
  } catch {
    message = "Could not resolve this address.";
  }

  proxyDnsCache.set(hostname, {
    allowed,
    message,
    expires: Date.now() + PROXY_DNS_TTL_MS
  });

  if (!allowed) {
    throw new Error(message);
  }
}

function shouldProxyRewrite(value) {
  return value && !/^(#|data:|blob:|javascript:|mailto:|tel:)/i.test(value.trim());
}

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (match, code) => String.fromCharCode(parseInt(code, 16)));
}

function proxiedUrl(value, baseUrl) {
  if (!shouldProxyRewrite(value)) return value;
  try {
    return `/api/proxy?url=${encodeURIComponent(new URL(decodeHtmlEntities(value), baseUrl).toString())}`;
  } catch {
    return value;
  }
}

function rewriteSrcset(value, baseUrl) {
  return value
    .split(",")
    .map((part) => {
      const pieces = part.trim().split(/\s+/);
      if (!pieces[0]) return part;
      pieces[0] = proxiedUrl(pieces[0], baseUrl);
      return pieces.join(" ");
    })
    .join(", ");
}

function rewriteCssUrls(css, baseUrl) {
  return css.replace(/url\((['"]?)(.*?)\1\)/gi, (match, quote, value) => {
    if (!shouldProxyRewrite(value)) return match;
    return `url(${quote}${proxiedUrl(value, baseUrl)}${quote})`;
  });
}

function rewriteInlineStyle(value, baseUrl) {
  return rewriteCssUrls(value, baseUrl);
}

function rewriteHtml(html, baseUrl) {
  let rewritten = html.replace(/<base\b[^>]*>\s*/gi, "");
  rewritten = rewritten.replace(/<meta\b[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, "");
  rewritten = rewritten.replace(/\s(href|src|action|poster|data-src|data-original|data-lazy-src|data-background-image)=["']([^"']*)["']/gi, (match, attr, value) => {
    return ` ${attr}="${escapeHtml(proxiedUrl(value, baseUrl))}"`;
  });
  rewritten = rewritten.replace(/\s(srcset|imagesrcset)=["']([^"']*)["']/gi, (match, attr, value) => {
    return ` ${attr}="${escapeHtml(rewriteSrcset(value, baseUrl))}"`;
  });
  rewritten = rewritten.replace(/\sstyle=["']([^"']*)["']/gi, (match, value) => {
    return ` style="${escapeHtml(rewriteInlineStyle(value, baseUrl))}"`;
  });
  rewritten = rewritten.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (match, attrs, css) => {
    return `<style${attrs}>${rewriteCssUrls(css, baseUrl)}</style>`;
  });
  return rewritten;
}

function copyProxyHeaders(proxyResponse, contentType) {
  const headers = {
    "Content-Type": contentType || "application/octet-stream",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  };

  const range = proxyResponse.headers.get("content-range");
  if (range) headers["Content-Range"] = range;
  const acceptRanges = proxyResponse.headers.get("accept-ranges");
  if (acceptRanges) headers["Accept-Ranges"] = acceptRanges;
  return headers;
}

async function handleProxy(req, res, parsed) {
  if (req.method !== "GET") {
    sendProxyError(res, 405, "Only normal page loads are supported in the fast proxy.");
    return;
  }

  let target;
  try {
    target = normalizeProxyTarget(parsed.query.url);
    await assertProxyTargetAllowed(target);
  } catch (error) {
    sendProxyError(res, 400, error.message);
    return;
  }

  const cached = getProxyTextCache(target.toString());
  if (cached) {
    res.writeHead(cached.status, {
      "Content-Type": cached.contentType,
      "Cache-Control": "public, max-age=30",
      "X-Proxy-Cache": "HIT"
    });
    res.end(cached.body);
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let proxyResponse;

  try {
    proxyResponse = await fetch(target, {
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 GlistenGamesProxy/1.0",
        "Accept": req.headers.accept || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Encoding": "identity",
        ...(req.headers.range ? { Range: req.headers.range } : {})
      },
      signal: controller.signal
    });
  } catch {
    clearTimeout(timeout);
    sendProxyError(res, 502, "The remote page did not respond in time.");
    return;
  }
  clearTimeout(timeout);

  if (proxyResponse.status >= 300 && proxyResponse.status < 400 && proxyResponse.headers.get("location")) {
    const nextUrl = new URL(proxyResponse.headers.get("location"), target).toString();
    res.writeHead(proxyResponse.status, { Location: `/api/proxy?url=${encodeURIComponent(nextUrl)}` });
    res.end();
    return;
  }

  const contentType = proxyResponse.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    const html = await proxyResponse.text();
    const body = rewriteHtml(html, target);
    if (proxyResponse.ok) {
      setProxyTextCache(target.toString(), {
        status: proxyResponse.status,
        contentType: "text/html; charset=utf-8",
        body
      });
    }
    res.writeHead(proxyResponse.status, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=30",
      "X-Proxy-Cache": "MISS"
    });
    res.end(body);
    return;
  }

  if (contentType.includes("text/css")) {
    const css = await proxyResponse.text();
    const body = rewriteCssUrls(css, target);
    if (proxyResponse.ok) {
      setProxyTextCache(target.toString(), {
        status: proxyResponse.status,
        contentType: "text/css; charset=utf-8",
        body
      });
    }
    res.writeHead(proxyResponse.status, {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "public, max-age=30",
      "X-Proxy-Cache": "MISS"
    });
    res.end(body);
    return;
  }

  res.writeHead(proxyResponse.status, copyProxyHeaders(proxyResponse, contentType));
  if (proxyResponse.body) {
    const reader = proxyResponse.body.getReader();
    async function pump() {
      const { done, value } = await reader.read();
      if (done) {
        res.end();
        return;
      }
      res.write(Buffer.from(value));
      pump();
    }
    pump();
  } else {
    res.end(Buffer.from(await proxyResponse.arrayBuffer()));
  }
}

function sendFile(res, filePath, isolated = false) {
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    if (isGameHtml(filePath)) {
      fs.readFile(filePath, "utf8", (readError, html) => {
        if (readError) {
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Could not load game HTML");
          return;
        }

        const body = normalizeGameHtml(html);
        res.writeHead(200, responseHeaders(filePath, null, isolated));
        res.end(body);
      });
      return;
    }

    res.writeHead(200, responseHeaders(filePath, stats, isolated));
    fs.createReadStream(filePath).pipe(res);
  });
}

function safeResolve(base, requestPath) {
  const decodedPath = decodeURIComponent(requestPath);
  const resolved = path.resolve(base, `.${decodedPath}`);
  return resolved.startsWith(base) ? resolved : null;
}

function sendUvVendorFile(res, pathname) {
  for (const route of UV_PROXY.routes) {
    if (!pathname.startsWith(route.prefix)) continue;

    const relative = pathname.slice(route.prefix.length);
    if (!relative || relative.endsWith("/")) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return true;
    }

    const vendorFile = safeResolve(route.dir, `/${relative}`);
    if (!vendorFile) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return true;
    }

    sendFile(res, vendorFile);
    return true;
  }

  return false;
}

ensureGamesDir();

const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname || "/";

    if (pathname === "/api/games") {
      sendJson(res, { games: scanGames() });
      return;
    }

    if (pathname === "/api/proxy") {
      handleProxy(req, res, parsed);
      return;
    }

    if (pathname === "/uv/uv.config.js") {
      if (UV_PROXY.available) sendUvConfig(res);
      else sendUvUnavailable(res);
      return;
    }

    if (pathname === "/uv/sw.js") {
      if (UV_PROXY.available) sendUvWorker(res);
      else sendUvUnavailable(res);
      return;
    }

    if (pathname === "/sw.js") {
      if (UV_PROXY.available) sendUvWorker(res);
      else sendUvUnavailable(res);
      return;
    }

    if (sendUvVendorFile(res, pathname)) {
      return;
    }

    if (pathname.startsWith("/games/")) {
      const gameFile = safeResolve(GAMES_DIR, pathname.replace(/^\/games/, ""));
      if (!gameFile) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Forbidden");
        return;
      }
      sendFile(res, gameFile, true);
      return;
    }

    const sitePath = pathname === "/" ? "/index.html" : pathname;
    const file = safeResolve(ROOT, sitePath);
    if (!file) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }
    sendFile(res, file);
  });

server.on("upgrade", (req, socket, head) => {
  const pathname = url.parse(req.url || "").pathname || "";
  if (pathname === "/wisp/" && UV_PROXY.routeRequest) {
    Promise.resolve(UV_PROXY.routeRequest(req, socket, head)).catch((error) => {
      console.error(`Wisp route error: ${error.stack || error.message || error}`);
      socket.destroy();
    });
    return;
  }

  socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
  socket.destroy();
});

server.listen(PORT, () => {
  console.log(`Glisten Games is running at http://localhost:${PORT}`);
  console.log(`Drop .html games into ${GAMES_DIR}`);
  console.log(UV_PROXY.available ? "Ultraviolet proxy engine is ready" : "Ultraviolet proxy engine is not installed");
});
