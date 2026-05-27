// App Store reviewer bypass.
//
// Apple's reviewer needs a working test login, but FootyGuru is OTP-only —
// there's no password to share. The clean alternative is a single, pre-shared
// email + OTP pair stored in env vars:
//
//   REVIEWER_EMAIL=appstore-reviewer@footyguru.app
//   REVIEWER_OTP=123456
//
// When a request hits /api/auth/request-code for REVIEWER_EMAIL the server
// short-circuits the Resend call (no email is ever sent) and returns the same
// generic success payload regular users see. When /api/auth/verify-code is
// called with that same email + REVIEWER_OTP, sign-in goes through without an
// EmailCode lookup.
//
// Both env vars must be set for the bypass to activate; either missing and
// the reviewer email behaves like any other email (i.e. the bypass is off).
// Rate limits still apply normally — same throttling as every other email.
//
// Security model: the static OTP only works for that one specific email.
// Brute-force surface is 5 attempts (rate-limited) against 1,000,000 codes
// per request-code window. Rotate REVIEWER_OTP after each App Store
// submission cycle to keep the credential fresh.

function normaliseEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

function reviewerEmail() {
  const raw = process.env.REVIEWER_EMAIL;
  if (!raw) return null;
  return normaliseEmail(raw);
}

function reviewerOtp() {
  const raw = process.env.REVIEWER_OTP;
  if (!raw) return null;
  return String(raw).trim();
}

function isBypassConfigured() {
  return reviewerEmail() !== null && reviewerOtp() !== null;
}

function isReviewerEmail(email) {
  if (!isBypassConfigured()) return false;
  return normaliseEmail(email) === reviewerEmail();
}

function isValidReviewerOtp(email, code) {
  if (!isBypassConfigured()) return false;
  if (normaliseEmail(email) !== reviewerEmail()) return false;
  return String(code || '').trim() === reviewerOtp();
}

module.exports = { isReviewerEmail, isValidReviewerOtp };
