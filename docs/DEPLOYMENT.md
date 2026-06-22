# Deployment runbook — RepRounds → Google Play

This is the operator checklist for the **manual / dashboard** steps that can't live in
the repo. The in-repo scaffolding (tests, CI/CD workflows, `[env.production]`,
env-driven app config) is already wired — see "What's already in the repo" at the
bottom. Work top-to-bottom; items marked **REPLACE_ME** correspond to placeholders
committed in config files.

> ⚠️ **Gate to confirm first.** Personal Google Play developer accounts created after
> **2023-11-13** must run a **closed test with ≥12 testers for ≥14 continuous days**
> before the Production track unlocks. If that applies, plan Internal → Closed (2 weeks)
> → Production. Organization accounts are exempt. Check in Play Console before committing
> to a launch date.

---

## 1. GitHub — branch protection & secrets

**Branch protection** (Settings → Branches → add rule for `main`):
- Require a pull request before merging.
- Require status check **`Typecheck & test`** (the `CI` workflow) to pass.
- Block direct pushes to `main`.

**Repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Used by | How to get it |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | `deploy-backend.yml` | Cloudflare dashboard → My Profile → API Tokens → "Edit Cloudflare Workers" template |
| `CLOUDFLARE_ACCOUNT_ID` | `deploy-backend.yml` | Cloudflare dashboard → Workers overview (right sidebar) |
| `PROD_DATABASE_URL` | `deploy-backend.yml` (migrate step) | Prod Neon connection string (§2) |
| `EXPO_TOKEN` | `release-mobile.yml` | expo.dev → Account → Access tokens |
| `GOOGLE_PLAY_KEY_BASE64` | `release-mobile.yml` | `base64 -w0 google-play-key.json` of the Play service-account JSON (§6) |

Also create a GitHub **Environment** named `production` (Settings → Environments) so the
backend deploy can be gated/observed; the workflow already references it.

---

## 2. Neon — production database

1. Create a dedicated **production** Neon database (separate project, or a non-ephemeral
   branch distinct from dev). Keep it separate from the PR-preview branches the existing
   `neon_workflow.yml` creates.
2. Copy its pooled connection string → this is `PROD_DATABASE_URL` (GitHub secret above)
   and the source for the prod Hyperdrive config in §3.
3. First-time data load (run locally with the prod URL):
   ```bash
   DATABASE_URL="<prod>" pnpm --filter backend db:migrate
   DATABASE_URL="<prod>" pnpm --filter backend db:seed
   ```

---

## 3. Cloudflare — production Worker, Hyperdrive, R2

1. **Hyperdrive (prod):**
   ```bash
   wrangler hyperdrive create reprounds-prod --connection-string="<PROD_DATABASE_URL>"
   ```
   Paste the returned id into `backend/wrangler.toml` → `[[env.production.hyperdrive]] id`
   (replaces `REPLACE_WITH_PROD_HYPERDRIVE_ID`).
2. **Secrets (prod env):**
   ```bash
   wrangler secret put JWT_SECRET --env production        # fresh 32+ char random value
   wrangler secret put GOOGLE_CLIENT_ID --env production   # the Web OAuth client id (§4)
   ```
3. **R2 public URL:** enable public access (or attach a custom domain) on the
   `ma-fitness-exercises` bucket, then set the real URL in
   `[env.production.vars].R2_PUBLIC_BASE_URL` (replaces `pub-REPLACE_ME.r2.dev`).
   Push images: `pnpm --filter backend r2:upload` (needs `CF_ACCOUNT_ID`,
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`).
4. **(Recommended)** Map the prod Worker to a custom domain (e.g. `api.reprounds.app`).
   Whatever origin you choose goes into `frontend/eas.json` → production
   `EXPO_PUBLIC_API_URL` (replaces `https://REPLACE_WITH_PROD_API_ORIGIN`).
5. First deploy is automatic on merge to `main` via `deploy-backend.yml`. To deploy by
   hand: `pnpm --filter backend deploy:production`.

---

## 4. Google Cloud — OAuth for production

> The #1 production sign-in failure is a missing SHA-1. With **Play App Signing**, the
> installed app is signed by **Google's** key, not your upload/EAS key.

1. **Web OAuth client** (already exists — id `548195273503-...apps.googleusercontent.com`).
   This single value is: the backend `GOOGLE_CLIENT_ID` (token audience) **and** the app's
   `webClientId`. Confirm it's the one set in §3.2 and in `frontend/eas.json`.
2. **Android OAuth client** for package `com.reprounds.app`, with **both** SHA-1s:
   - Play App Signing certificate SHA-1 — Play Console → Setup → App signing.
   - EAS/upload key SHA-1 — `cd frontend && eas credentials` (Android → keystore).
3. **OAuth consent screen:** set app name, support email, logo, privacy policy + terms
   URLs. Basic `email`/`profile`/`openid` scopes are non-sensitive (no Google review
   needed), but the screen must be **Published / In production** for external users.

---

## 5. RevenueCat + Play subscriptions (release blocker)

1. **Play Console:** create the app (§6), then define subscription products / base plans
   (e.g. monthly + annual "Pro"). Products require the app to exist and one uploaded build.
2. **Play Developer API:** create a Google Cloud service account, grant it the Play Console
   permissions RevenueCat requires, and enable **Real-time Developer Notifications**
   (Pub/Sub) so renewals/cancellations sync.
3. **RevenueCat dashboard:** create project + Android app, add the Play service-account
   credentials, define entitlement `pro`, build an offering, and map it to the Play
   products. Copy the **Android public SDK key** → `frontend/eas.json`
   `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` (replaces `REPLACE_WITH_REVENUECAT_ANDROID_SDK_KEY`).
   The app already reads this in `src/context/SubscriptionContext.tsx`.
4. **Verify** a real purchase with a Play **license tester** account: entitlement `pro`
   unlocks in-app and the transaction appears in RevenueCat.

---

## 6. Google Play Console — submission

1. Create the app; enroll in **Play App Signing** (let EAS manage the upload key).
   Place the Play service-account JSON at `frontend/google-play-key.json` locally (it's
   git-ignored) and as the `GOOGLE_PLAY_KEY_BASE64` CI secret. **Never commit it.**
2. **Store listing:** title, short + full description, icon, feature graphic, phone
   screenshots, category, contact details.
3. **Required policy forms:** Privacy Policy URL (host one — covers Google account data +
   RevenueCat), Data safety, Content rating, Target audience, Ads declaration, App access
   (give reviewers a working Google test account or note that Sign-In is required + how).
4. **Release flow:** push a tag (`git tag v1.0.0 && git push --tags`) → `release-mobile.yml`
   builds the AAB on EAS and submits to the track in `eas.json` (`alpha` = Closed testing).
   Verify sign-in, prod API calls, and a subscription purchase → run the Closed test
   (§7) → promote to **Production** and submit for review.

---

## 7. Closed testing (the 12-tester / 14-day gate)

Required before Production unlocks on personal accounts created after 2023-11-13.
**Internal testing does not count — it must be a Closed track.** `eas.json` already
targets `alpha` (Closed testing).

**Prerequisites (the clock can't start until these are done):** §1–§6 above — prod
backend live (§2–3), production OAuth + SHA-1 so testers can sign in (§4), RevenueCat
wired if you want purchase testing (§5), and all Play content declarations (§6.3).

**Steps:**
1. Play Console → Testing → **Closed testing** → create/confirm the `alpha` track (or note
   its track ID and match `eas.json` to it).
2. Build a tester list. Easiest is a **Google Group**: create one, add it as the track's
   tester list, then add the 12+ people as group members. (Email lists work too but are
   fiddlier to edit.)
3. Recruit **≥12 real testers**, each with a distinct Google account. Options: friends/
   family, or reciprocal testing communities (e.g. r/googleplaydeveloper testing threads).
   Each tester must **open the opt-in link on their device, accept, and install** — Google
   counts a tester as opted-in only after they join.
4. Push the first release tag to ship the build to the closed track; confirm each tester
   can install + sign in.
5. **Keep ≥12 testers opted in for 14 continuous days.** Play Console shows a live
   "X / 12 testers · Y / 14 days" tracker. If someone leaves the group/uninstalls and you
   drop below 12, the counter stalls — keep a couple of spares.
6. After 14 days at ≥12 testers, Play Console surfaces **"Apply for production access."**
   Submit it (Google reviews, usually a few days), then promote the closed release to
   **Production**.

> Exact wording/thresholds have shifted over time — follow the live tracker in Play
> Console as the source of truth.

---

## What's already in the repo (done in code)

- **Tests:** Vitest in `shared` (1RM/volume) + `backend` (JWT, Google ID-token, auth
  middleware); Jest in `frontend` (env config). Run with `pnpm -r test`.
- **CI/CD:** `.github/workflows/ci.yml` (PR checks), `deploy-backend.yml` (migrate +
  deploy `--env production` on merge), `release-mobile.yml` (EAS build + submit on `v*` tag).
- **Backend prod env:** `[env.production]` block in `backend/wrangler.toml` +
  `deploy:production` / `deploy:production:no-migrate` scripts.
- **Env-aware app:** `frontend/src/lib/config.ts` resolves API origin + Google web client
  id from `EXPO_PUBLIC_*`; per-profile values in `frontend/eas.json`. Hardcoded dev URLs
  removed from `src/lib/api.ts` and `app/_layout.tsx`.
- **Secret hygiene:** `google-play-key.json` added to `.gitignore`.
