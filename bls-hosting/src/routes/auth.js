'use strict';

const express = require('express');
const config = require('../config');
const auth = require('../lib/auth');
const codes = require('../lib/codes');
const portal = require('../portal');
const { audit } = require('../lib/db');
const { makeRateLimiter } = require('../lib/security');

const router = express.Router();

const loginLimiter = makeRateLimiter({
  windowMs: config.loginWindowMinutes * 60000,
  max: config.loginMaxAttempts + 4,
  message: 'Too many tries  wait a few minutes',
});

router.get('/portal', (req, res) => {
  res.json({
    tiles: portal.TILES,
    contacts: portal.CONTACTS,
    vpnMessage: portal.VPN_MESSAGE,
    notice: portal.NOTICE,
    brand: 'BLS.Hosting',
  });
});

router.get('/auth/me', (req, res) => {
  if (!req.session) return res.json({ signedIn: false });
  res.json({
    signedIn: true,
    role: req.session.role,
    scope: req.session.scope,
    label: req.session.label,
    deploymentId: req.session.deployment_id,
    csrf: req.session.csrf,
    expiresAt: req.session.expires_at,
  });
});

router.post('/auth/login', loginLimiter, (req, res) => {
  const ip = req.clientIp;
  const gate = auth.attemptState(ip);
  if (gate.locked) {
    audit({ action: 'auth.locked', detail: `ip ${ip}`, ip, actor: 'anonymous', role: 'anonymous' });
    return res.status(429).json({
      error: `Too many wrong codes  locked for ${config.loginWindowMinutes} minutes`,
    });
  }

  const code = String((req.body && req.body.code) || '');
  if (!code.trim()) return res.status(400).json({ error: 'Enter an access code' });

  const matched = codes.verifyCode(code);
  if (!matched) {
    auth.recordAttempt(ip, false);
    const left = Math.max(0, gate.left - 1);
    audit({ action: 'auth.fail', detail: `ip ${ip}`, ip, actor: 'anonymous', role: 'anonymous' });
    return res.status(401).json({
      error: left > 0 ? `Wrong access code  ${left} tries left` : 'Wrong access code  locked now',
    });
  }

  auth.recordAttempt(ip, true);
  const session = auth.createSession(req, res, matched);
  audit({
    actor: `${matched.label} (${matched.role})`,
    role: matched.role,
    action: 'auth.login',
    detail: `scope ${matched.scope}`,
    ip,
  });
  res.json({
    signedIn: true,
    role: matched.role,
    scope: matched.scope,
    label: matched.label,
    deploymentId: matched.deployment_id,
    csrf: session.csrf,
  });
});

router.post('/auth/logout', (req, res) => {
  if (req.session) auth.log(req, 'auth.logout');
  auth.destroySession(req, res);
  res.json({ signedIn: false });
});

module.exports = router;
