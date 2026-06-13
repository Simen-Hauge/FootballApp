const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const controller = require('../controllers/AuthController');

const router = express.Router();

// Key by `email` body field when present, otherwise IP — that way one user
// can't share a key with a different one just because they're behind the
// same NAT, and IP-only fallback still catches abuse on the unauthenticated
// surface. Bodies are already parsed by express.json upstream.
function keyByEmailOrIp(req) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  return email || ipKeyGenerator(req.ip);
}

// Tight limits. These are unauthenticated surfaces; tighten now, loosen later
// if real usage data says so.
const requestCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByEmailOrIp,
  message: { error: 'Too many code requests. Wait a few minutes and try again.' },
});

const verifyCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByEmailOrIp,
  message: { error: 'Too many attempts. Wait a few minutes and try again.' },
});

router.post('/request-code', requestCodeLimiter, controller.requestCode);
router.post('/verify-code', verifyCodeLimiter, controller.verifyCode);

module.exports = router;
