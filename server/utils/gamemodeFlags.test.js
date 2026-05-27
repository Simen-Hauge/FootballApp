const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { allowedGamemodesFor, PUBLIC_GAMEMODES, ALL_GAMEMODES } = require('./gamemodeFlags');

let originalAllowlist;

beforeEach(() => {
  originalAllowlist = process.env.FRIENDS_FAMILY_EMAILS;
});

afterEach(() => {
  if (originalAllowlist === undefined) {
    delete process.env.FRIENDS_FAMILY_EMAILS;
  } else {
    process.env.FRIENDS_FAMILY_EMAILS = originalAllowlist;
  }
});

describe('allowedGamemodesFor', () => {
  test('with no allowlist set, every user gets world-cup only', () => {
    delete process.env.FRIENDS_FAMILY_EMAILS;
    assert.deepEqual(allowedGamemodesFor('anyone@example.com'), PUBLIC_GAMEMODES);
  });

  test('with empty allowlist, every user gets world-cup only', () => {
    process.env.FRIENDS_FAMILY_EMAILS = '';
    assert.deepEqual(allowedGamemodesFor('me@example.com'), PUBLIC_GAMEMODES);
  });

  test('allowlisted email gets every gamemode', () => {
    process.env.FRIENDS_FAMILY_EMAILS = 'friend@example.com';
    assert.deepEqual(allowedGamemodesFor('friend@example.com'), ALL_GAMEMODES);
  });

  test('non-allowlisted email still gets public-only even when allowlist is populated', () => {
    process.env.FRIENDS_FAMILY_EMAILS = 'friend@example.com';
    assert.deepEqual(allowedGamemodesFor('stranger@example.com'), PUBLIC_GAMEMODES);
  });

  test('comma-separated list is parsed', () => {
    process.env.FRIENDS_FAMILY_EMAILS = 'a@x.com,b@x.com,c@x.com';
    assert.deepEqual(allowedGamemodesFor('b@x.com'), ALL_GAMEMODES);
    assert.deepEqual(allowedGamemodesFor('d@x.com'), PUBLIC_GAMEMODES);
  });

  test('whitespace/newline-separated list is parsed', () => {
    process.env.FRIENDS_FAMILY_EMAILS = 'a@x.com\nb@x.com c@x.com';
    assert.deepEqual(allowedGamemodesFor('a@x.com'), ALL_GAMEMODES);
    assert.deepEqual(allowedGamemodesFor('c@x.com'), ALL_GAMEMODES);
  });

  test('comparison is case-insensitive and trims whitespace', () => {
    process.env.FRIENDS_FAMILY_EMAILS = 'Friend@Example.com';
    assert.deepEqual(allowedGamemodesFor('FRIEND@example.COM'), ALL_GAMEMODES);
    assert.deepEqual(allowedGamemodesFor('  friend@example.com  '), ALL_GAMEMODES);
  });

  test('null/empty caller falls through to public', () => {
    process.env.FRIENDS_FAMILY_EMAILS = 'friend@example.com';
    assert.deepEqual(allowedGamemodesFor(null), PUBLIC_GAMEMODES);
    assert.deepEqual(allowedGamemodesFor(''), PUBLIC_GAMEMODES);
    assert.deepEqual(allowedGamemodesFor(undefined), PUBLIC_GAMEMODES);
  });

  test('returned arrays are independent copies — mutation does not leak', () => {
    const first = allowedGamemodesFor('anyone@example.com');
    first.push('mutated');
    const second = allowedGamemodesFor('anyone@example.com');
    assert.deepEqual(second, PUBLIC_GAMEMODES);
  });
});
