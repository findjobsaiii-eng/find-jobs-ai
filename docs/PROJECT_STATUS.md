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
- Resume-first onboarding after sign-in: one PDF/DOCX upload, private Convex Storage, actual text extraction, structured career parsing, at least five seconds of analysis feedback, a compact role/strength/seniority/location review, and direct entry to personalized jobs. The full four-step form remains the profile editor.
- Completed profiles use one shared authenticated shell across Jobs and Profile, with common page width, gutters, headers, surfaces, controls, empty states, and responsive RTL/LTR behavior.
- The profile contains an owner-scoped resume library with multiple independently parsed PDF/DOCX versions, labels, notes, active-resume selection, safe replacement/deletion, and keyboard-accessible click or drag-and-drop upload. The first CV remains required to create the initial profile.
- Versioned CV-derived career profiles include factual role history, responsibilities and explicit achievements, normalized skills by group, education, explicit languages, overlap-safe experience totals, domains, seniority, confidence, target-role candidates, and normalized Israeli location when supported.
- Effective candidate profiles preserve field-level manual overrides across CV replacement. Existing pre-CV profiles are treated as manually chosen on first import. Raw CV text and structured detail stay server-side.
- One indexed candidate profile per Convex Auth user, with server-derived ownership and Google identity fields, bounded server normalization, draft resume state, and created/updated/completed timestamps.
- Searchable bilingual job-title and skill catalogs, with persisted editable aliases for curated titles and bounded per-user private additions that cannot leak across accounts or inherit shared aliases.
- Google Places autocomplete for one primary Israeli city or region, with a compact selected-location summary, accessible 5–100 km radius presets (25 km by default), localized results, and optional current-location search bias that does not persist coordinates. Earlier multi-location drafts remain readable, but onboarding presents and replaces only the primary location.
- Multiple work-arrangement selections and up to ten language/proficiency entries, seeded in the UI with ten languages commonly useful in Israel.
- Convex tests covering unauthenticated rejection, cross-user isolation, private catalog ownership, normalization, resumable drafts, and completion enforcement, plus component tests for onboarding validation, routing, and submission behavior.
- Completed onboarding now opens the responsive Worky dashboard. Incomplete profiles still open onboarding, within the existing authentication boundary.
- Google Places selections now preserve the existing Place ID/radius fields and additionally store a bounded formatted address, city, administrative area, country/code, and coordinates. Older profiles remain readable but must reconfirm location before job discovery if normalized data is absent.
- Server-owned `free`, `pro`, and `admin` policies protect provider usage. Free users only read the central jobs database and cannot enter the provider path. Paid users receive automatic searches.
- Paid profiles generate one shared query per unique target role, capped at five. Each query combines curated bilingual role aliases, up to five non-generic profile skills, and a city/district/country scope selected from the saved radius. Exact normalized query criteria are claimed once per Israel calendar day across all users; a failed owning run releases its claim for retry.
- Automatic provider calls fail closed behind a kill switch, daily run/query ceilings, concurrency ceiling, and a configurable output-token cap. SDK retries remain disabled and usage is recorded.
- Provider output is treated as untrusted. Every candidate needs a public HTTP(S) URL present in Web Search evidence, bounded structured fields, and a title and company. Source verification pins the resolved public IP, bounds redirects/time/body size, rejects private addresses, 404/410, closure markers, generic pages, and content that does not confirm the expected role and company.
- Central vacancies can own several source records. Deterministic consolidation checks domain/provider ID, canonical URLs, normalized company/title/location, and content. URL tracking noise and common formatting differences collapse while seniority and distinct cities remain separate. Transactional indexed lookups protect concurrent ingestion. Every observation is retained in an ingestion event.
- Only canonical `verified_active` or recently observed `probably_active` jobs with no hard-filter contradiction appear. Bounded background reconciliation materializes eligible per-profile matches across the entire active catalog; feed reads are indexed and are not limited to the newest 500 central jobs. Profile changes sweep both active lifecycle partitions, while job ingestion and activity changes fan one job out across completed profiles. Employer pages outrank ATS pages, job boards, and aggregators.
- An hourly bounded worker rechecks due sources after a three-day cache interval. Conclusive 404/410, closure markers, redirects to generic careers pages, and passed deadlines close listings. Temporary failures preserve prior state and retry with bounded exponential backoff. Unknown, closed, and expired records remain stored but are hidden from suggestions.
- Job locations resolve through an offline GeoNames Israel locality dataset. Jobs store a stable place ID, locality centroid, and canonical English/Hebrew names; radius filtering uses Haversine distance without AI. A failed structured-city lookup falls back to the full location text. Unknown, ambiguous, and foreign locations are excluded.

- The homepage is a job feed with Suggestions / In progress tabs, clean cards for title, company, location, work model, date, summary, skills, source, and actions, a fixed logical-start profile panel, and a server-flagged floating development panel. Profile editing reuses the prefilled onboarding form.
- Owner-scoped application snapshots persist “Sent résumé” status, support undo, and survive recommendation expiry. Closed jobs remain in history with an unavailable label. This does not send a résumé or implement interview stages.
- An hourly internal Convex cron claims one of ten deterministic paid-user cohorts from 08:00 through 17:00 Israel time in bounded pages. A newly completed paid profile is queued immediately for its first attempt that day. Free profiles are never queued for provider work.
- Manual search and the development plan switch are gated server-side by `DEV_TOOLS_ENABLED=true`. Free mode refreshes database results only. Subscribed mode can run repeated manual searches without automatic daily/global quota copy or cooldowns, while still preventing concurrent runs. Development controls use the real discovery pipeline and do not seed synthetic jobs or CVs.
- Pro/admin users can request a private saved deep review from a job card. The action reverifies the shared job source, compares the role with the effective profile and up to six ready resumes, recommends an existing resume and truthful edits, identifies evidence-based strengths and gaps, and saves Web Search-backed employer/application links. Stale reviews are detected after profile or job changes; free users cannot generate or refresh them.

## Incomplete or unknown areas

- Live Google OAuth was reported successful after the replacement client was configured; this task did not repeat that external smoke test.
- Resume generation, automatic applications, Gmail access, embeddings, and multi-stage application workflow do not exist. CV ingestion, profile creation, and multi-resume management are implemented.
- There is no semantic query reuse, billing, or checkout. A paid daily attempt may reuse a query already claimed by another user.
- Embedding-based duplicate detection and semantic relevance are deferred. Deterministic relevance now ranks eligible jobs by effective target/past roles, core skills, experience, location, work arrangement, and employment type.
- GeoNames coordinates are locality centroids, so radius checks are city-level approximations rather than exact workplace distances. Jobs with unresolved or ambiguous locations are hidden.
- Existing deployments need a one-time `jobMatching:dispatchAllUsers` backfill after the materialized match index is deployed. Thereafter, profile and job mutations maintain it incrementally in bounded pages; reconciliation is eventually consistent while those scheduled pages run.
- Pro/admin entitlements have no billing source. The development-only switch creates test entitlements; all users otherwise resolve to `free`.
- Production hosting, production Convex configuration, release strategy, and monitoring are not documented.

## Current risks

- `@convex-dev/auth` is on a `0.0.x` release and should be treated as a dependency that may introduce breaking changes during upgrades.
- The documented Node.js requirement is not machine-enforced, which can lead to local and CI version drift.
- Convex Auth stores browser session and refresh tokens in `localStorage` by default. This provides reload and browser-restart persistence but makes application XSS prevention a security boundary; the product owner should explicitly accept this persistence model or request a different storage policy.
- Runtime authentication readiness still depends on untracked deployment configuration and cannot be inferred from a successful build or mocked tests.
- Runtime location search depends on Google Cloud billing, Maps JavaScript API, Places API (New), and correct browser/API restrictions for `VITE_GOOGLE_MAPS_API_KEY`.
- Runtime job discovery depends on server-only `OPENAI_API_KEY` and `OPENAI_JOB_SEARCH_MODEL` configuration and on the selected model continuing to support Responses API Web Search plus Structured Outputs.
- Source verification intentionally favors precision and can hide legitimate client-rendered or bot-protected job pages. Temporary access failures preserve prior state, but jobs eventually leave suggestions when recent activity cannot be established.
- DNS resolution is checked and the selected public address is pinned for the HTTP request, but source verification still depends on the correctness of public DNS and TLS infrastructure.
- Global ceilings are cost controls rather than billing. Production operators need monitoring, an entitlement-management process, and an incident runbook before launch.

## Next recommended milestone

Add operational monitoring for CV extraction, scheduled discovery, and activity
verification. After real-world extraction data exists, add an admin-only view for
low-confidence fields and decide on CV retention/deletion periods. Billing and
automated applications remain separate milestones.

## Job discovery verification

Focused automated coverage verifies that free discovery creates no provider run
or usage, shared paid queries run once per day, failed claims retry, repeated
manual paid searches remain available, daily scheduling excludes free users,
central persistence and deduplication work, GeoNames radius matching fails
closed, localized place labels are deterministic, localized Google place text
does not change shared-search identity, and catalog reconciliation continues
beyond one bounded page. Automated tests never call the real OpenAI API.

A live paid development search requires an authenticated completed profile and
every server variable named in the README. Free-mode refresh is safe to repeat
and never calls OpenAI. No live provider call is claimed unless the subscribed
button is deliberately used and aggregate usage is observed.

## Dashboard verification

Component coverage checks profile routing/edit/save, keyboard opening and Escape
focus restoration, language switching, RTL direction, and the In progress tab.
Backend tests cover owner isolation, idempotent application marking, undo,
snapshot retention after expiry, bounded daily sweep continuation, duplicate
claims, and the server-side development-tools gate. Provider calls are mocked.

The authenticated Hebrew/RTL development app was checked in the in-app browser.
Free mode refreshed the central feed twice without a cooldown, subscribed mode
showed the enabled manual-search control without quota copy, and the account was
restored to free. `/?tab=in-progress` and `/profile?tab=in-progress` survived
navigation and Cancel returned to the selected tab. No console errors or live
OpenAI provider calls occurred. Backend functions pushed successfully to the
existing development deployment; its development-tools flag is enabled.

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
