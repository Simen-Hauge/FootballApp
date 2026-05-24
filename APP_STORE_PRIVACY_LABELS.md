# App Store Connect — App Privacy ("Nutrition Labels") Checklist

Step-by-step answers for the App Privacy form in App Store Connect
(App → App Privacy → Edit). Accurate to FootyGuru's current data practices.

**If you add any of these, come back and update both this file and the form:**
crash reporting (Sentry), analytics (PostHog, Mixpanel, Firebase, etc.), ads,
in-app purchases, push notifications with rich metadata, social login (Sign in
with Apple/Google), or any third-party SDK that collects data.

---

## Step 1 — "Does your app collect any data?"

Select **Yes**.

## Step 2 — For each data type, configure how it's used

Apple groups data into categories. You only fill in the categories you
actually collect. **FootyGuru collects exactly three.**

### A. Contact Info → Email Address

| Field | Answer |
|-------|--------|
| Is data collected? | **Yes** |
| Used for tracking? | **No** |
| Linked to the user's identity? | **Yes** |
| Purposes (select all that apply) | **App Functionality** only |

> Rationale: email is the account identifier and the channel for sending the
> one-time sign-in code. We don't use it for marketing or analytics.

### B. User Content → Other User Content

| Field | Answer |
|-------|--------|
| Is data collected? | **Yes** |
| Used for tracking? | **No** |
| Linked to the user's identity? | **Yes** |
| Purposes | **App Functionality** only |

> Covers: predictions (match scores, first-scorer picks), group memberships,
> group ownership, display name, points totals. All of it exists to make the
> core feature of the app work.

### C. Identifiers → User ID

| Field | Answer |
|-------|--------|
| Is data collected? | **Yes** |
| Used for tracking? | **No** |
| Linked to the user's identity? | **Yes** |
| Purposes | **App Functionality** only |

> Rationale: every Player has an internal `_id` and a JWT-encoded session
> token. The token sits on-device (iOS Keychain) and is sent on every API
> request so the server knows who's asking. Not used for cross-app tracking.

## Step 3 — Data NOT collected (for the record — don't fill anything in for these)

Apple's form is opt-in per category. **Leave these categories untouched.**
Listing them here so you can answer review questions confidently:

- Health & Fitness — not collected
- Financial Info — not collected
- Location (Precise or Coarse) — not collected
- Sensitive Info — not collected
- Contacts — not collected
- Browsing History — not collected
- Search History — not collected
- Other Identifiers (Device ID, Advertising Data) — not collected
- Purchases — not collected (no IAP)
- Usage Data (Product Interaction, Advertising Data, Other) — not collected
- Diagnostics (Crash Data, Performance Data) — **not collected today**.
  Add this category if you add Sentry or any crash-reporting SDK.
- Surroundings, Body — not collected
- Other Data — not collected

## Step 4 — Privacy policy URL

In **App Information → General Information → Privacy Policy URL**, paste the
public URL where [PRIVACY_POLICY.md](PRIVACY_POLICY.md) is hosted. Apple
requires this to be a working URL at submission time.

Easiest hosting options:
- **GitHub Pages** — free; commit the policy as `docs/index.md`, enable Pages
  on the repo, get `https://<you>.github.io/<repo>/`.
- **Render static site** — free tier; point at the same repo.
- **Your domain** — once you own `footyguru.com`, host as
  `https://footyguru.com/privacy`.

## Step 5 — Optional but recommended

In App Store Connect:

- **App Review Notes**: paste a short sentence explaining that sign-in uses
  an email OTP and reviewers should use the test account credentials provided
  in the demo account fields. This avoids them getting stuck on the verify
  step waiting for an email.
- **Demo Account**: create one real account (e.g. `apple-review@footyguru.com`
  on your domain) and pre-verify it. Provide the email + a way for them to
  read the OTP (either point to a mailbox you've created, or — easier — add a
  small dev backdoor that returns a known code for that one email; remove
  after launch).

## Step 6 — Save & submit

After saving the privacy form, App Store Connect will refuse a new binary
submission until the labels match. Re-check after any third-party SDK addition.

---

## Quick "did anything change?" checklist

Run this before every submission:

- [ ] Did you add or remove an SDK? (`mobile/package.json` diff vs. last submit)
- [ ] Did you add a new server endpoint that stores something new on the Player?
- [ ] Did you wire up push notifications? (changes Identifiers and possibly
      Diagnostics)
- [ ] Did you add Sign in with Apple / Google? (changes Identifiers usage —
      still "App Functionality" only, but Apple wants accuracy)
- [ ] Did you add analytics, crash reporting, or A/B testing?
- [ ] Did you start exporting data to a CRM or marketing tool? (would change
      tracking + purposes)

If any of those is "yes", update [PRIVACY_POLICY.md](PRIVACY_POLICY.md) and the App
Store Connect labels **before** uploading the next build.
