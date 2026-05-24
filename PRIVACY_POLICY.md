# FootyGuru — Privacy Policy

> Replace the bracketed placeholders before publishing. The factual sections
> below are accurate to the app as it stands today — if you add analytics,
> crash reporting, ads, or in-app purchases later, this document needs to be
> updated **and** the App Store Connect privacy labels re-submitted.

**Effective date:** [DATE WHEN YOU PUBLISH]
**Controller / contact:** [YOUR NAME OR COMPANY], [JURISDICTION — e.g. "Norway"]
**Privacy questions:** [privacy@footyguru.com — or your real address]

---

## 1. Summary

FootyGuru is a football match-prediction app. We collect the **minimum data
needed to let you sign in, save your predictions, and compete inside groups**.
We don't show ads, we don't sell or share your data with advertisers, and we
don't track you across other apps or websites.

## 2. What we collect

| Data | Why we need it | When collected |
|------|----------------|----------------|
| Email address | Sign-in (we send a one-time code to verify it's yours) and to identify your account. | When you sign in. |
| Display name | Shown to other members of your prediction groups. We auto-derive a name from your email; you can change it any time. | When you sign in. |
| Predictions | The score and first-scorer picks you make for matches. | When you save a prediction. |
| Group memberships and ownership | So we know which groups you're in and which you own. | When you create or join a group. |
| Points earned | Computed from your predictions vs. real match results. | Awarded automatically when matches finish. |
| Session token | A signed token stored on your device that keeps you logged in. | Issued at sign-in; stored locally in iOS Keychain / Android Keystore. |

We do **not** collect: location, contacts, photos, camera, microphone, health
data, financial data, browsing or search history, device advertising IDs,
contacts, or precise device identifiers.

## 3. How we use it

- **Run the app**: sign you in, show your predictions and groups, compute and
  display points and leaderboards.
- **Communicate with you about the app**: send sign-in codes by email. We
  don't send marketing emails.
- **Keep the service secure**: rate-limit sign-in attempts, prevent abuse,
  investigate suspected fraud.

We do not use your data for **advertising, profiling beyond app
functionality, or sale to third parties**.

## 4. Third parties we share data with

We share only the minimum data required, and only with the providers below.
Each operates under their own privacy terms.

| Provider | What we share | Purpose | Where |
|----------|---------------|---------|-------|
| Resend ([resend.com](https://resend.com)) | Your email address (so the code can be sent to it). | Delivering sign-in codes. | US |
| MongoDB Atlas ([mongodb.com](https://www.mongodb.com)) | All account, prediction, and group data. | Database hosting. | [REGION — set this to whatever you picked in Atlas, e.g. "Europe (Ireland)"] |
| Render ([render.com](https://render.com)) | Server traffic (API requests, no payload storage by them). | Application hosting. | [REGION — e.g. "Frankfurt"] |
| football-data.org | Nothing about you. They send match data **to** us; we don't send user data to them. | Live match data. | EU |

We do not share data with advertisers, analytics providers, or data brokers,
because we don't use any.

## 5. How long we keep it

- **Account data, predictions, group memberships**: kept while your account
  exists. Deleted immediately when you delete your account (see §7).
- **One-time sign-in codes**: expire and are auto-deleted 10 minutes after
  they're sent.
- **Server logs**: retained by our hosting providers per their standard
  policies (typically up to 30 days); these contain IP addresses and request
  metadata but not your prediction content.
- **Database backups**: retained for up to [BACKUP RETENTION — typically 7 days
  on Atlas free tier; check your plan] for disaster recovery. Deleted account
  data may persist in backups for that window before being overwritten.

## 6. Where your data is processed

Your data is stored and processed in **[REGIONS — list whatever Atlas region
+ Render region you've actually picked, e.g. "the United States and Ireland"]**.
If you're outside those regions, you're consenting to this international
transfer when you use the app. We rely on the legal mechanisms our providers
publish (e.g. EU Standard Contractual Clauses) for any required transfers.

## 7. Your rights

You can:

- **Access** your data: most of it is visible to you inside the app
  (predictions, group memberships, name, email).
- **Update** your display name from the Profile screen.
- **Delete** your account and everything tied to it directly from the app:
  Profile → Danger zone → Delete my account. This wipes your profile,
  predictions, group memberships, and ownership of any groups (groups you own
  are either handed off to the next-ranked member or deleted if you were the
  only member).
- **Export** your data: not available in-app today. Email us at
  [privacy@footyguru.com] and we'll send you a copy within 30 days.

If you're in the EU, UK, California, or another jurisdiction with statutory
privacy rights (GDPR, UK-GDPR, CCPA/CPRA), you also have the right to lodge a
complaint with your local data protection authority.

## 8. Children

FootyGuru is not intended for anyone under **13**. We don't knowingly collect
data from children under 13. If you believe a child under 13 has provided us
data, email [privacy@footyguru.com] and we'll delete it.

## 9. Security

- All traffic between the app and our server uses HTTPS (TLS).
- Sign-in codes are stored as bcrypt hashes, never in plaintext.
- Session tokens are stored on your device using iOS Keychain or Android
  Keystore.
- We don't store passwords because we don't use them.

No system is perfectly secure. If you suspect your account is compromised,
sign out from all sessions by deleting the app (which clears the session
token) and contact us.

## 10. Changes to this policy

If we change this policy materially, we'll update the Effective date above
and surface a notice in the app at next sign-in. Continuing to use FootyGuru
after a change means you accept the updated policy.

## 11. Contact

Questions about this policy or your data: **[privacy@footyguru.com]**.
