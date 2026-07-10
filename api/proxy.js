const dns = require("dns").promises;
const net = require("net");

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sendProxyError(res, status, message) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Proxy error</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f7f9fb; color: #17202a; font-family: system-ui, sans-serif; }
      main { max-width: 520px; padding: 28px; border: 1px solid #d9e1ea; border-radius: 8px; background: white; box-shadow: 0 24px 60px rgba(15, 23, 42, .08); }
      h1 { margin: 0 0 10px; font-size: 22px; }
      p { margin: 0; color: #5b6675; line-height: 1.5; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(status)} Proxy error</h1>
      <p>${escapeHtml(message)}</p>
    </main>
  </body>
</html>`);
}

function normalizeProxyTarget(value) {
  if (!value) throw new Error("Enter a URL first.");
  const url = new URL(String(value));
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only normal http and https pages can be proxied.");
  }
  return url;
}

function isPrivateIp(address) {
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
  if (net.isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
  }
  return false;
}

async function assertProxyTargetAllowed(url) {
  if (url.hostname === "localhost" || url.hostname.endsWith(".localhost")) {
    throw new Error("Local addresses cannot be proxied.");
  }
  if (net.isIP(url.hostname) && isPrivateIp(url.hostname)) {
    throw new Error("Private addresses cannot be proxied.");
  }
  const records = await dns.lookup(url.hostname, { all: true });
  if (!records.length || records.some((record) => isPrivateIp(record.address))) {
    throw new Error("That address cannot be proxied.");
  }
}

function shouldProxyRewrite(value) {
  return value && !/^(#|data:|blob:|javascript:|mailto:|tel:)/i.test(String(value).trim());
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
  return String(value)
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
  return String(css).replace(/url\((['"]?)(.*?)\1\)/gi, (match, quote, value) => {
    if (!shouldProxyRewrite(value)) return match;
    return `url(${quote}${proxiedUrl(value, baseUrl)}${quote})`;
  });
}

function rewriteHtml(html, baseUrl) {
  let rewritten = String(html).replace(/<base\b[^>]*>\s*/gi, "");
  rewritten = rewritten.replace(/<meta\b[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, "");
  rewritten = rewritten.replace(/\s(href|src|action|poster|data-src|data-original|data-lazy-src|data-background-image)=["']([^"']*)["']/gi, (match, attr, value) => {
    return ` ${attr}="${escapeHtml(proxiedUrl(value, baseUrl))}"`;
  });
  rewritten = rewritten.replace(/\s(srcset|imagesrcset)=["']([^"']*)["']/gi, (match, attr, value) => {
    return ` ${attr}="${escapeHtml(rewriteSrcset(value, baseUrl))}"`;
  });
  rewritten = rewritten.replace(/\sstyle=["']([^"']*)["']/gi, (match, value) => {
    return ` style="${escapeHtml(rewriteCssUrls(value, baseUrl))}"`;
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

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    sendProxyError(res, 405, "Only normal page loads are supported in the Vercel proxy.");
    return;
  }

  let target;
  try {
    target = normalizeProxyTarget(req.query.url);
    await assertProxyTargetAllowed(target);
  } catch (error) {
    sendProxyError(res, 400, error.message);
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
    res.statusCode = proxyResponse.status;
    res.setHeader("Location", `/api/proxy?url=${encodeURIComponent(nextUrl)}`);
    res.end();
    return;
  }

  const contentType = proxyResponse.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    const html = await proxyResponse.text();
    res.statusCode = proxyResponse.status;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(rewriteHtml(html, target));
    return;
  }

  if (contentType.includes("text/css")) {
    const css = await proxyResponse.text();
    res.statusCode = proxyResponse.status;
    res.setHeader("Content-Type", "text/css; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(rewriteCssUrls(css, target));
    return;
  }

  res.statusCode = proxyResponse.status;
  Object.entries(copyProxyHeaders(proxyResponse, contentType)).forEach(([key, value]) => res.setHeader(key, value));
  res.end(Buffer.from(await proxyResponse.arrayBuffer()));
};
