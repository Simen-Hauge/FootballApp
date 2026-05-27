const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const Player = require('../models/Player');
const EmailCode = require('../models/EmailCode');
const { signToken } = require('../middleware/auth');
const { sendVerificationEmail } = require('../utils/email');
const { allowedGamemodesFor } = require('../utils/gamemodeFlags');
const { isReviewerEmail, isValidReviewerOtp } = require('../utils/reviewerAccount');

const CODE_TTL_MINUTES = 10;
const CODE_TTL_MS = CODE_TTL_MINUTES * 60 * 1000;
const MAX_ATTEMPTS_PER_CODE = 5;
const RESEND_COOLDOWN_MS = 30 * 1000;
// Loose RFC-pragmatic check. Real validation happens when the code email
// either delivers or bounces — this just rejects obvious garbage.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

function generateCode() {
  // 6-digit zero-padded. crypto.randomInt is unbiased, unlike Math.random.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

// Derive a display name from the local-part of an email for first-time users
// who haven't picked a name yet. "john.doe@x.com" → "John Doe".
function deriveNameFromEmail(email) {
  const local = email.split('@')[0] || 'Player';
  return local
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

// Upserts the player, marks them verified on first sign-in, and returns the
// JSON payload sent on a successful auth. Shared by both the normal OTP path
// and the App Store reviewer bypass so they produce identical-shaped sessions.
async function signInPayload(email) {
  let player = await Player.findOne({ email });
  if (!player) {
    player = await Player.create({
      email,
      name: deriveNameFromEmail(email),
      verifiedAt: new Date(),
      points: 0,
      groups: [],
    });
  } else if (!player.verifiedAt) {
    // Grandfathers pre-OTP accounts on first successful login.
    player.verifiedAt = new Date();
    await player.save();
  }

  const token = signToken(player);
  return {
    message: 'Signed in',
    token,
    player: {
      id: player._id,
      email: player.email,
      name: player.name,
      points: player.points || 0,
      enabledGamemodes: allowedGamemodesFor(player.email),
    },
  };
}

// POST /api/auth/request-code
// Body: { email }
// Always responds 200 with a generic payload so an attacker can't probe which
// emails are registered. The actual code only goes to the inbox.
exports.requestCode = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email.' });
    }

    // App Store reviewer bypass — the OTP for this email is the static value
    // in REVIEWER_OTP, pre-shared with Apple. Skip Resend (no real email is
    // ever sent to this address) and return the same generic shape regular
    // users see, so the response itself is indistinguishable.
    if (isReviewerEmail(email)) {
      return res.json({ message: 'Code sent', ttlSeconds: CODE_TTL_MS / 1000 });
    }

    // Throttle re-sends per email so a user mashing the button doesn't trigger
    // a flood from our sender domain.
    const latest = await EmailCode.findOne({ email, consumedAt: null }).sort({ createdAt: -1 });
    if (latest && Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS) {
      const waitMs = RESEND_COOLDOWN_MS - (Date.now() - latest.createdAt.getTime());
      return res
        .status(429)
        .json({ error: `Hold on — another code can be sent in ${Math.ceil(waitMs / 1000)}s.` });
    }

    const code = generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);

    // Invalidate any prior outstanding codes for this email so only the
    // newest is usable. Cleaner UX than honoring two valid codes at once.
    await EmailCode.updateMany(
      { email, consumedAt: null },
      { $set: { consumedAt: new Date() } },
    );

    await EmailCode.create({ email, codeHash, expiresAt });

    await sendVerificationEmail({ to: email, code, ttlMinutes: CODE_TTL_MINUTES });

    res.json({ message: 'Code sent', ttlSeconds: CODE_TTL_MS / 1000 });
  } catch (err) {
    console.error('❌ requestCode error:', err);
    res.status(500).json({ error: 'Could not send code. Try again in a minute.' });
  }
};

// POST /api/auth/verify-code
// Body: { email, code }
// On success: upserts Player (creates one if first sign-in), marks verified,
// issues JWT. On failure: 401 + increments the code's attempt counter.
exports.verifyCode = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || '').trim();
    if (!email || !code) {
      return res.status(400).json({ error: 'Email and code required.' });
    }

    // App Store reviewer bypass — bypass the EmailCode store entirely and
    // accept the static REVIEWER_OTP for the configured REVIEWER_EMAIL.
    if (isValidReviewerOtp(email, code)) {
      return res.json(await signInPayload(email));
    }

    const record = await EmailCode.findOne({ email, consumedAt: null }).sort({ createdAt: -1 });
    if (!record) {
      return res.status(401).json({ error: 'No active code. Request a new one.' });
    }
    if (record.expiresAt.getTime() < Date.now()) {
      return res.status(401).json({ error: 'Code expired. Request a new one.' });
    }
    if (record.attempts >= MAX_ATTEMPTS_PER_CODE) {
      // Burn the code so subsequent attempts can't guess further.
      record.consumedAt = new Date();
      await record.save();
      return res.status(401).json({ error: 'Too many attempts. Request a new code.' });
    }

    const matches = await bcrypt.compare(code, record.codeHash);
    if (!matches) {
      record.attempts += 1;
      await record.save();
      const remaining = MAX_ATTEMPTS_PER_CODE - record.attempts;
      return res
        .status(401)
        .json({ error: `Wrong code. ${remaining} ${remaining === 1 ? 'try' : 'tries'} left.` });
    }

    // Code consumed. Make sure it can't be replayed.
    record.consumedAt = new Date();
    await record.save();

    res.json(await signInPayload(email));
  } catch (err) {
    console.error('❌ verifyCode error:', err);
    res.status(500).json({ error: 'Could not verify code. Try again.' });
  }
};
