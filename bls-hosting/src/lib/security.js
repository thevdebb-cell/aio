'use strict';

const config = require('../config');

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' ws: wss:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.removeHeader('X-Powered-By');
  if (config.secureCookies) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

// Blocks cross site requests that carry a browser Origin which is not ours
function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  const allowed = new Set();
  if (config.publicUrl) allowed.add(config.publicUrl);
  allowed.add(`http://${config.host}:${config.port}`);
  allowed.add(`http://127.0.0.1:${config.port}`);
  allowed.add(`http://localhost:${config.port}`);
  const host = req.get('host');
  if (host) {
    allowed.add(`http://${host}`);
    allowed.add(`https://${host}`);
  }
  if (!allowed.has(origin.replace(/\/+$/, ''))) {
    return res.status(403).json({ error: 'Cross site request blocked' });
  }
  next();
}

function makeRateLimiter({ windowMs, max, key = (req) => req.clientIp || 'unknown', message }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, list] of hits) {
      const kept = list.filter((t) => now - t < windowMs);
      if (kept.length) hits.set(k, kept);
      else hits.delete(k);
    }
  }, windowMs).unref();

  return function rateLimit(req, res, next) {
    const now = Date.now();
    const k = key(req);
    const list = (hits.get(k) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      return res.status(429).json({ error: message || 'Too many requests  slow down' });
    }
    list.push(now);
    hits.set(k, list);
    next();
  };
}

module.exports = { securityHeaders, sameOrigin, makeRateLimiter, CSP };
