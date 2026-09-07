# Project status

Last repository audit: 2026-09-07

This document reports what is present in the repository. It does not confirm external service configuration unless that configuration is represented and testable from the repository.

## Verified current stack

| Area                   | Verified implementation                                                |
| ---------------------- | ---------------------------------------------------------------------- |
| Frontend               | React 19, TypeScript, Vite 8                                           |
| Backend                | Convex 1.44                                                            |
| Authentication         | Convex Auth with the Auth.js Google provider                           |
| Styling                | Tailwind CSS 4, shadcn conventions, Base UI primitives                 |
| Interaction            | Motion with user reduced-motion preferences enabled                    |
| Localization           | i18next and react-i18next with English and Hebrew resources            |
| Package management     | npm with a committed `package-lock.json`                               |
| Static validation      | TypeScript, ESLint, Prettier, Vitest, and the Vite production build    |
| Continuous integration | GitHub Actions on pull requests and pushes to `main`, using Node.js 22 |

The README requires Node.js 22 or newer. The repository does not currently contain a Node version manager file or a `package.json` engine constraint.

## URL navigation

- Implemented: profile path, URL-backed jobs tabs, native profile links, browser
  history navigation, and direct-link rendering behind authentication/onboarding.
- Unknown: production host SPA fallback; configure before deploying page URLs.

## Verified implemented features

- A Vite/React application shell with Convex and Motion providers.
- Google-only OAuth wiring through Convex Auth, including HTTP callback routes and auth tables in the Convex schema.
- Server-only Google provider credentials with required environment validation for `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `JWT_PRIVATE_KEY`, `JWKS`, and `SITE_URL`.
- A validated public Convex client URL that rejects credentials, unexpected paths, queries, fragments, and insecure non-local origins.
- Sign-in, session-loading, OAuth-callback loading/error recovery, configuration-error, authenticated boundary, sign-out, and sign-out error UI states.
- One-time OAuth callback codes are held only in memory during exchange and removed from the browser URL before the network exchange begins.
- Focused Vitest and React Testing Library coverage for auth boundaries, callback exchange/recovery, duplicate-submit prevention, sign-out failure recovery, URL validation, required server configuration, and English/Hebrew direction changes.
- A GitHub Actions quality gate using the committed npm lockfile and Node.js 22.
- English and Hebrew UI copy, document language/direction synchronization, and persisted language detection.
- A shared button primitive, semantic theme tokens, local font packages, responsive layout, focus styles, and reduced-motion handling.
- A secure, four-step candidate-profile onboarding flow after sign-in, with read-only Google identity, field validation, progress, Back/Continue/Save draft/Finish actions, duplicate-submit protection, and responsive LTR/RTL behavior.
- One indexed candidate profile per Convex Auth user, with server-derived ownership and Google identity fields, bounded server normalization, draft resume state, and created/updated/completed timestamps.
- Searchable bilingual job-title and skill catalogs, with bounded per-user private additions that cannot leak across accounts or become shared automatically.
- Google Places autocomplete for one primary Israeli city or region, with a compact selected-location summary, accessible 5–100 km radius presets (25 km by default), localized results, and optional current-location search bias that does not persist coordinates. Earlier multi-location drafts remain readable, but onboarding presents and replaces only the primary location.
- Multiple work-arrangement selections and up to ten language/proficiency entries, seeded in the UI with ten languages commonly useful in Israel.
- Convex tests covering unauthenticated rejection, cross-user isolation, private catalog ownership, normalization, resumable drafts, and completion enforcement, plus component tests for onboarding validation, routing, and submission behavior.
- Completed onboarding now opens the responsive Worky dashboard. Incomplete profiles still open onboarding, within the existing authentication boundary.
- Google Places selections now preserve the existing Place ID/radius fields and additionally store a bounded formatted address, city, administrative area, country/code, and coordinates. Older profiles remain readable but must reconfirm location before job discovery if normalized data is absent.
- Server-owned `free`, `pro`, and `admin` policies, durable usage records, idempotent reservations, one-active-run enforcement, stale-run recovery, and atomic per-day global counters protect provider usage. The browser cannot provide entitlements, counters, reset times, or overrides.
- Exact eligible results reuse completed searches for 24 hours without fresh quota. A sufficient set of eligible central jobs is also reused before provider access. Cache and central reuse are written to the ledger with zero provider/token use.
- Fresh provider calls fail closed behind a kill switch, daily run/query ceilings, concurrency ceiling, per-plan rolling windows, and a configurable output-token cap. SDK retries remain disabled. A failed attempt consumes quota only after provider-start is recorded.
- Provider output is treated as untrusted. Every candidate needs a public HTTP(S) URL present in Web Search evidence, bounded structured fields, and a title and company. Source verification pins the resolved public IP, bounds redirects/time/body size, rejects private addresses, 404/410, closure markers, generic pages, and content that does not confirm the expected role and company.
- Central vacancies can own several source records. Deterministic consolidation checks final URL, provider job ID, normalized source URL, company/title/location, and content hash, while requirement and external-ID safeguards reduce unsafe merges. The best verified source follows employer, employer ATS, established job board, then aggregator priority.
- Only canonical `verified_active` jobs with a verified source, no hard-filter contradiction, and an explainable relevance score of at least 70 appear. Per-user match records store exclusion reasons, score components, and concise match reasons.

- The homepage is a job feed with Suggestions / In progress tabs, a fixed logical-start profile panel, and a server-flagged floating development panel. Profile editing reuses the prefilled onboarding form.
- Owner-scoped application snapshots persist “Sent résumé” status, support undo, and survive recommendation expiry. This does not send a résumé or implement interview stages.
- An hourly internal Convex cron claims daily-due completed profiles in bounded pages. Sequential workers share the existing discovery, cache, quota, verification, and usage pipeline. Per-user attempt records prevent duplicate sweeps and record safe outcomes.
- Manual search is gated server-side by `DEV_TOOLS_ENABLED=true`; unset/false hides the panel and rejects direct action calls. Configure it only on development deployments.

## Incomplete or unknown areas

- Live Google OAuth was reported successful after the replacement client was configured; this task did not repeat that external smoke test.
- No CV upload, resume generation, automatic applications, Gmail access, embeddings, or multi-stage application workflow exists.
- There is no semantic query reuse, periodic job-activity recheck, billing, checkout, or deep per-user AI review. Daily attempts remain subject to plan and global limits; a daily attempt does not guarantee fresh provider work.
- Embedding-based duplicate detection and semantic relevance are deferred. Current bounded similarity is deterministic normalized token overlap after hard filtering; it does not claim model-derived semantic understanding.
- Radius filtering is conservative: jobs without trusted coordinates must match the saved city/region text (or be compatible remote roles). Exact geospatial distance requires trusted job coordinates in a later milestone.
- Pro/admin entitlements have no product UI or billing source. Only trusted server-side records can grant them; all users otherwise resolve to `free`.
- Production hosting, production Convex configuration, release strategy, and monitoring are not documented.

## Current risks

- `@convex-dev/auth` is on a `0.0.x` release and should be treated as a dependency that may introduce breaking changes during upgrades.
- The documented Node.js requirement is not machine-enforced, which can lead to local and CI version drift.
- Convex Auth stores browser session and refresh tokens in `localStorage` by default. This provides reload and browser-restart persistence but makes application XSS prevention a security boundary; the product owner should explicitly accept this persistence model or request a different storage policy.
- Runtime authentication readiness still depends on untracked deployment configuration and cannot be inferred from a successful build or mocked tests.
- Runtime location search depends on Google Cloud billing, Maps JavaScript API, Places API (New), and correct browser/API restrictions for `VITE_GOOGLE_MAPS_API_KEY`.
- Runtime job discovery depends on server-only `OPENAI_API_KEY` and `OPENAI_JOB_SEARCH_MODEL` configuration and on the selected model continuing to support Responses API Web Search plus Structured Outputs.
- Source verification intentionally favors precision and can hide legitimate client-rendered, bot-protected, or temporarily unavailable job pages. Verified sources expire from display after seven days because periodic revalidation is not implemented yet.
- DNS resolution is checked and the selected public address is pinned for the HTTP request, but source verification still depends on the correctness of public DNS and TLS infrastructure.
- Plan limits and global ceilings are policy controls rather than billing. Production operators need monitoring, an entitlement-management process, and an incident runbook before launch.

## Next recommended milestone

Add a bounded source-reverification workflow and operational monitoring for
scheduled discovery. After real-world false-positive/false-negative data exists,
evaluate whether a separately metered embedding model materially improves the
deterministic duplicate and relevance gates. Billing, CV ingestion, and
automated applications remain separate milestones.

## Job discovery verification

Focused automated coverage verifies unauthenticated/incomplete-profile
rejection, concurrent reservation serialization, seven-day free-plan quota,
cache reuse without fresh consumption, the global kill switch, unknown/inactive
visibility exclusion, multi-source consolidation, hard-filter exclusion, and
the mocked OpenAI boundary rejecting postings whose URLs are absent from Web
Search evidence. Automated tests never call the real OpenAI API.

A single live development search requires an authenticated completed profile
with normalized location and every server variable named in the README. Start
the app, open **Development tools** and choose **Search for new jobs**, and record only aggregate counts and
safe usage metadata. Do not record the API key, generated queries, raw provider
output, or private profile data. No live provider call is claimed unless that
check is performed.

For this audit, the local app and Google redirect loaded successfully, but the
isolated test browser had no authenticated Google session. No account details
were entered and no live OpenAI search was started (live-search count: 0).

## Dashboard verification

Component coverage checks profile routing/edit/save, keyboard opening and Escape
focus restoration, language switching, RTL direction, and the In progress tab.
Backend tests cover owner isolation, idempotent application marking, undo,
snapshot retention after expiry, bounded daily sweep continuation, duplicate
claims, and the server-side development-tools gate. Provider calls are mocked.

Desktop English and 390 px Hebrew/English fixture previews were visually checked,
including profile-menu placement, tab switching, and absence of horizontal
overflow. The live app opened at sign-in, so no authenticated live job search was
triggered. Backend functions pushed successfully to the existing development
deployment; its development-tools flag is enabled.

## Local development and validation

Install dependencies and start Convex with the Vite development server:

```sh
npm install
npm run dev
```

Local authentication uses the exact frontend origin
`http://localhost:5173`. Vite is configured with port `5173` and strict port
handling, so it exits with a clear error instead of switching to another port
when `5173` is occupied. The Convex development deployment's `SITE_URL` must
remain `http://localhost:5173`, and local testing must use the `localhost`
hostname rather than a different hostname or port.

If startup reports that port `5173` is already in use, return to the terminal
running the existing local app and stop it with `Ctrl+C`. Then restart with
`npm run dev`. Do not start a second local instance on `5174`, because that
origin is intentionally rejected by Convex Auth.

Run the available checks:

```sh
npm run typecheck
npm run lint
npm run format:check
npm run check
npm test
npm run build
```

`npm run check` combines type checking, linting, and formatting verification.
`npm test` runs the focused unit/component suite. `npm run build` repeats type
checking and creates the production frontend bundle.

## Manual Google OAuth smoke test

These steps require an enabled Google OAuth client and a reachable Convex
development deployment. Never paste environment-variable values into issues,
logs, screenshots, or documentation.

1. Confirm the Convex deployment defines `AUTH_GOOGLE_ID`,
   `AUTH_GOOGLE_SECRET`, `JWT_PRIVATE_KEY`, `JWKS`, and `SITE_URL`.
2. Set `SITE_URL` to the exact frontend origin. For local development, use
   `http://localhost:5173` and open that same hostname in the browser.
3. In Google Cloud, register
   `https://YOUR-DEPLOYMENT.convex.site/api/auth/callback/google` as an authorized
   redirect URI and the frontend origin as an authorized JavaScript origin.
4. Run `npm run dev`, open the frontend, and choose **Continue with Google**.
5. Complete account selection and consent. Confirm the browser returns to the
   frontend, removes the `code` query parameter, and shows authenticated content.
6. Refresh the page and confirm the authenticated session remains active.
7. Sign out, refresh again, and confirm authenticated content is no longer
   accessible.
8. Repeat the visible auth states in English and Hebrew, confirming LTR and RTL
   direction respectively.
9. Cancel or deny a Google attempt and confirm the app presents a recoverable
   authentication error without displaying credentials or a callback code.
10. With a new authenticated user, confirm onboarding appears, Google email is
    read-only, draft progress survives refresh, and Finish routes to the
    authenticated application screen.
11. Repeat onboarding in English/LTR and Hebrew/RTL at mobile and desktop widths.
12. Search for a job title, skill, and city; add a missing title or skill and
    confirm it remains available after refresh. Confirm work arrangement allows
    multiple selections and languages can be added and removed.
13. Confirm Google Places suggestions are limited to Israel and appear in the
    selected interface language. Type without selecting a suggestion and confirm
    validation appears, then select one place, change its radius, refresh, and
    confirm both values persist. Confirm **Change location** preserves the radius
    and **Clear location** removes the selection. Try **Near me**, allow and deny
    browser permission in separate checks, and confirm neither path blocks manual
    search.

The product owner subsequently reported that the replacement Google OAuth client
completed the live flow successfully. This repository audit did not repeat that
external account-level smoke test; automated auth coverage remains in place.
