const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { isReviewerEmail, isValidReviewerOtp } = require('./reviewerAccount');

let originalEmail;
let originalOtp;

beforeEach(() => {
  originalEmail = process.env.REVIEWER_EMAIL;
  originalOtp = process.env.REVIEWER_OTP;
});

afterEach(() => {
  restore('REVIEWER_EMAIL', originalEmail);
  restore('REVIEWER_OTP', originalOtp);
});

function restore(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe('isReviewerEmail', () => {
  test('returns false when no env vars are set', () => {
    delete process.env.REVIEWER_EMAIL;
    delete process.env.REVIEWER_OTP;
    assert.equal(isReviewerEmail('appstore-reviewer@footyguru.app'), false);
  });

  test('returns false when only REVIEWER_EMAIL is set (bypass needs both)', () => {
    process.env.REVIEWER_EMAIL = 'reviewer@footyguru.app';
    delete process.env.REVIEWER_OTP;
    assert.equal(isReviewerEmail('reviewer@footyguru.app'), false);
  });

  test('returns false when only REVIEWER_OTP is set (bypass needs both)', () => {
    delete process.env.REVIEWER_EMAIL;
    process.env.REVIEWER_OTP = '123456';
    assert.equal(isReviewerEmail('anyone@x.com'), false);
  });

  test('matches case-insensitively and ignores surrounding whitespace', () => {
    process.env.REVIEWER_EMAIL = 'Reviewer@FootyGuru.app';
    process.env.REVIEWER_OTP = '123456';
    assert.equal(isReviewerEmail('REVIEWER@footyguru.APP'), true);
    assert.equal(isReviewerEmail('  reviewer@footyguru.app  '), true);
  });

  test('non-matching email returns false even when both vars are set', () => {
    process.env.REVIEWER_EMAIL = 'reviewer@footyguru.app';
    process.env.REVIEWER_OTP = '123456';
    assert.equal(isReviewerEmail('someone-else@x.com'), false);
  });

  test('null/empty caller returns false', () => {
    process.env.REVIEWER_EMAIL = 'reviewer@footyguru.app';
    process.env.REVIEWER_OTP = '123456';
    assert.equal(isReviewerEmail(null), false);
    assert.equal(isReviewerEmail(undefined), false);
    assert.equal(isReviewerEmail(''), false);
  });
});

describe('isValidReviewerOtp', () => {
  test('returns false when no env vars are set', () => {
    delete process.env.REVIEWER_EMAIL;
    delete process.env.REVIEWER_OTP;
    assert.equal(isValidReviewerOtp('anyone@x.com', '123456'), false);
  });

  test('matching email + matching code → true', () => {
    process.env.REVIEWER_EMAIL = 'reviewer@footyguru.app';
    process.env.REVIEWER_OTP = '424242';
    assert.equal(isValidReviewerOtp('reviewer@footyguru.app', '424242'), true);
  });

  test('matching email but wrong code → false', () => {
    process.env.REVIEWER_EMAIL = 'reviewer@footyguru.app';
    process.env.REVIEWER_OTP = '424242';
    assert.equal(isValidReviewerOtp('reviewer@footyguru.app', '000000'), false);
  });

  test('right code but wrong email → false (code is per-email, not global)', () => {
    process.env.REVIEWER_EMAIL = 'reviewer@footyguru.app';
    process.env.REVIEWER_OTP = '424242';
    assert.equal(isValidReviewerOtp('attacker@x.com', '424242'), false);
  });

  test('code comparison is strict equality after trim (no case folding)', () => {
    process.env.REVIEWER_EMAIL = 'reviewer@footyguru.app';
    process.env.REVIEWER_OTP = '424242';
    assert.equal(isValidReviewerOtp('reviewer@footyguru.app', '  424242  '), true);
    // The OTP is numeric in practice; this test is here so a future refactor
    // that adds alpha doesn't silently start case-folding it.
    process.env.REVIEWER_OTP = 'ABC123';
    assert.equal(isValidReviewerOtp('reviewer@footyguru.app', 'abc123'), false);
    assert.equal(isValidReviewerOtp('reviewer@footyguru.app', 'ABC123'), true);
  });

  test('empty/null code → false', () => {
    process.env.REVIEWER_EMAIL = 'reviewer@footyguru.app';
    process.env.REVIEWER_OTP = '424242';
    assert.equal(isValidReviewerOtp('reviewer@footyguru.app', ''), false);
    assert.equal(isValidReviewerOtp('reviewer@footyguru.app', null), false);
    assert.equal(isValidReviewerOtp('reviewer@footyguru.app', undefined), false);
  });

  test('only one env var set → bypass disabled, returns false', () => {
    process.env.REVIEWER_EMAIL = 'reviewer@footyguru.app';
    delete process.env.REVIEWER_OTP;
    assert.equal(isValidReviewerOtp('reviewer@footyguru.app', '424242'), false);

    delete process.env.REVIEWER_EMAIL;
    process.env.REVIEWER_OTP = '424242';
    assert.equal(isValidReviewerOtp('reviewer@footyguru.app', '424242'), false);
  });
});
