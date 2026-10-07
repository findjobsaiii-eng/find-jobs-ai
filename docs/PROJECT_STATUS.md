# Project status

Last repository audit: 2026-09-28

## Production readiness work in progress

- Implemented on the current branch: consent-gated PostHog page views, reviewed product events and session replay with targeted exclusions (D-053); authoritative Convex beta engagement metrics and per-user activity; Resend delivery/engagement ingestion; Sentry event scrubbing; bilingual draft legal routes and shared footer; skip link; sitemap/robots; noindex on protected routes; and a web-to-Convex health endpoint.
- Implemented: Resend service notifications after automatic searches that produce visible matches, with Hebrew RTL content, daily/weekly/never user controls, duplicate-send protection, removal of email state during account deletion, and a separate public HTTPS origin that prevents local authentication URLs from leaking into outbound links.
- Incomplete: comprehensive accessibility remediation and axe/Lighthouse audit; verified data export; retention and backup deletion policy; complete security and production configuration verification; full browser journey tests. Self-service deletion now removes user-linked Convex data and files in scheduled batches, but shared job data, vendor logs and backups remain outside that automatic path. Data-copy requests use the owner-supplied email.
- Unknown outside the repository: production deployment of the analytics changes, Resend webhook secret/configuration, tracking-subdomain DNS verification, other vendor settings and callback URLs, hosting countries, backup/restore results, mailbox monitoring, and legal operator identity. See `docs/LAUNCH_OWNER_CHECKLIST.md`.
- The incident response outline is in `docs/INCIDENT_RESPONSE.md`; it has not been rehearsed.
- These changes are not evidence of WCAG 2.1 AA / Israeli Standard 5568 conformance or legal compliance. Legal pages are drafts pending Israeli counsel review.

This document reports what is present in the repository. It does not confirm external service configuration unless that configuration is represented and testable from the repository.

## Verified current stack

| Area                   | Verified implementation                                                |
| ---------------------- | ---------------------------------------------------------------------- |
| Frontend               | Next.js 16 App Router, React 19, TypeScript                            |
| Backend                | Convex 1.44                                                            |
| Authentication         | Convex Auth with the Auth.js Google provider                           |
| Styling                | Tailwind CSS 4, shadcn conventions, Base UI primitives                 |
| Interaction            | Motion with user reduced-motion preferences enabled                    |
| Localization           | i18next and react-i18next with English and Hebrew resources            |
| Package management     | npm with a committed `package-lock.json`                               |
| Static validation      | TypeScript, Next ESLint, Prettier, Vitest, and `next build`            |
| Continuous integration | GitHub Actions on pull requests and pushes to `main`, using Node.js 22 |
| Service email          | Resend, called only from a Convex Node action                          |

Node.js 22 or newer is documented and enforced through `package.json` engines; CI uses Node.js 22.

## URL navigation

- Implemented: App Router page ownership, URL-backed jobs tabs, nested profile
  topic paths, browser history navigation, and in-place authentication for deep
  links.
- `/` shows a standalone landing page when signed out and the job workspace when
  signed in. Protected routes keep their URL while showing the sign-in prompt.

## Verified implemented features

- Implemented: expanded bilingual reference catalogs (216 skills, 103 roles,
  34 experience areas, 57 education/qualification options); shared identities
  supersede equivalent private entries in search and profile saves. Seed/approved
  skill publication schedules paginated reference consolidation before removing
  private duplicates. Custom badges are shown on dropdown rows and selected
  experience areas/education. Saved personal education names are owner-only
  suggestions, with no redundant Add action. Production backend `famous-badger-815`
  was deployed and seeded on 2026-10-05. The repair consolidated 120 private
  duplicates, including 22 on the owner's account. A bounded production audit
  found zero matching private duplicates and zero dangling profile/resume catalog
  references; the owner's authenticated React search returns one shared React
  option. Validation: 486 tests, `npm run check`, Webpack production build, and
  React Doctor without findings.

- Implemented: resume-library uploads save original files and complete
  extracted text without changing completed profiles or running ordinary-file AI
  profile analysis. Scanned PDF transcription is saved for deep review. The
  inferred-details disclosure is removed. Explicit profile import opens editable
  onboarding fields and writes only on final approval, with ownership and
  profile-revision checks. Deep review uses every usable cached resume within
  documented account/input limits. The committed backend was deployed to
  production alongside the catalog fixes on 2026-10-05. Historical document
  reprocessing remains outside this change.
  Validation: all 473 tests, `npm run check`, the Webpack production build,
  React Doctor with no findings, and deployment to development
  `glorious-mallard-885` passed. Ordinary extraction, saved OCR text, isolated
  review drafts, explicit approval, cancellation, ownership, stale-profile
  rejection and full-text deep-review inputs are covered by automated tests.

- Implemented and deployed to production: onboarding reminder emails at 24 and 72 hours after new
  signup, with automatic cancellation on completion/deletion, one setup CTA,
  English/Hebrew templates, recipient-only unsubscribe, bounded retries and
  Resend delivery tracking. Sends are enabled in production by
  `ONBOARDING_REMINDERS_ENABLED=true`; the development flag is unset.
  Validation: `npm run check`, all 461 tests, the Webpack production build, and
  deployment to development `glorious-mallard-885` passed. Scheduler timing,
  cancellation, retries, opt-out isolation and deletion safeguards were verified
  without sending real emails.
  Production deployment to `famous-badger-815` succeeded on 2026-10-05.
  Authorized historical enrollment scanned 24 existing accounts, excluded 12,
  and enrolled 12 incomplete accounts: ten final reminders and two first
  reminders were accepted by Resend; two future final reminders retain their
  original signup-based dates. Delivery webhooks confirmed 11 delivered at the
  rollout check, with no bounces or complaints. Provider delivery does not
  verify inbox placement. Enrollment is paginated, staggered and safe to rerun.

- Implemented locally: subtle `uisfx` interaction sounds for trusted clicks,
  navigation, tabs, toggles and range-slider value changes, with an English/Hebrew mute control in public
  headers and the signed-in user menu. The browser preference persists and
  synchronizes across tabs; no startup, hover, typing or background-loop audio.
  Video controls and interactions during audible media are silent. Nine new
  tests cover trusted playback, rate limiting, saved/cross-tab mute, denied
  storage, delayed unlocks, media suppression, slider throttling and cleanup. All 445 tests and
  the Webpack production build passed. Production deployment is unverified.

- Implemented locally: responsive landing marketing video below the hero, with
  local preview images, a prominent keyboard-accessible play invitation, custom
  play/pause, mute, desktop volume, fullscreen, and a progress line without
  seeking. Controls fade during playback and remain accessible with keyboard
  focus. Loading/retry/replay states are localized. The provided R2
  MP4s are selected at activation (portrait below 768px, widescreen otherwise)
  and never autoplay or download before activation. The media origin is allowed
  explicitly by CSP. Production deployment of this change is unverified.
  Validation: `npm run check`, `npm test` (436 tests), and
  `npm run build -- --webpack` passed. Browser checks against the built site
  verified both R2 videos, pause/resume, mute/volume, progress without seeking,
  element fullscreen and full-window fallback, Escape/focus containment,
  control fading, replay, source retention on resize, Hebrew/English mobile
  layouts, and zero R2 requests before activation.
  The default Turbopack build is blocked by worker-port permissions in this
  environment. React Doctor reported no errors; warnings cover the player's
  size/complexity, the existing Motion import pattern, and lack of separate
  caption tracks (the films include on-screen Hebrew captions).
- Implemented locally: deep-review salary range card with published pay taking
  precedence over clearly labeled AI guesses. The existing review request may
  estimate gross monthly base pay for an Israeli role with no published salary;
  insufficient context remains unknown. Estimates are stored separately on the
  review and never used for filtering/scoring or written as employer salary.
  No separate AI request or salary-specific web search is added. The backend
  was deployed to production on 2026-10-04; shared salary-table estimation remains a TODO below.
  Verified: `npm run check`, `npm test` (422 tests),
  `npm run build -- --webpack`, and `npx convex dev --once` on
  `glorious-mallard-885`; Hebrew desktop and English mobile estimate previews.
  No paid AI request was made during verification.
  Salary visual refinement: bounded monthly ILS salaries inside ₪10k–₪50k use
  that common track; other ranges receive local padding, exact pay shows a point,
  and single-sided pay remains textual. Only the actual salary numbers appear.
  Desktop/mobile previews verified the band. `npm run check` passed; all 425
  tests passed on rerun after one unrelated OAuth visibility test initially
  failed (that test also passed independently).
- Implemented and deployed to production: editable experience areas in onboarding/profile,
  using the shared searchable chip picker, 14 bilingual catalog suggestions and
  owner-private custom additions. CV areas prefill the field; manual corrections
  and an empty selection survive replacement/switching CVs and drive matching
  without changing recorded experience durations or adding AI calls. Production
  catalog seeding completed on 2026-10-04. Automatic experience-area vocabulary
  curation is not implemented.
  Validation: `npm run check`, `npm test` (416 tests), and
  `npm run build -- --webpack` passed; Hebrew/English responsive component
  previews verified selection, creation and keyboard behavior. React Doctor
  reported no errors and one maintainability warning in the shared picker.

- A Next.js App Router application with a neutral root layout, a separate public
  landing experience, a protected route-group layout, Convex providers, and Motion.
- Optional PostHog page views, a reviewed semantic event allowlist, opaque
  authenticated identity, and session replay with targeted exclusions (D-053). Automatic
  interaction event capture is disabled. The owner-provided PostHog screenshot
  confirms production replay ingestion; the D-053 fidelity fix still needs a new
  live recording after rollout.
- Convex-owned beta analytics with weekly active and core-value users, rolling
  and signup-cohort retention, seven-day activation, active-day frequency,
  last-seen timestamps, semantic activity, Resend delivery events, a guarded
  beta verdict, and per-user timelines. Admin accounts are excluded from product
  signals. Data collection starts when this schema is deployed; historical
  activity is not reconstructed.
- Sentry browser and Next.js server error capture is wired, with a temporary
  `/sentry-test` button for a controlled verification event. Vercel configuration,
  browser/server source-map uploads were confirmed in the 2026-10-05 production
  build logs. Live event delivery/symbolication remains unverified.
- Google-only OAuth wiring through Convex Auth, including a first-party Next.js auth proxy, HTTP callback routes, and auth tables in the Convex schema.
- Server-only Google provider credentials with required environment validation for `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `JWT_PRIVATE_KEY`, `JWKS`, and `SITE_URL`.
- A validated public Convex client URL that rejects credentials, unexpected paths, queries, fragments, and insecure non-local origins.
- Sign-in, session-loading, OAuth-callback loading/error recovery, configuration-error, authenticated boundary, sign-out, and sign-out error UI states.
- One-time OAuth callback codes are exchanged server-side by the first-party auth proxy and removed from the browser URL before the application renders.
- Focused Vitest and React Testing Library coverage for auth boundaries, callback exchange/recovery, duplicate-submit prevention, sign-out failure recovery, URL validation, required server configuration, and English/Hebrew direction changes.
- A GitHub Actions quality gate using the committed npm lockfile and Node.js 22.
- English and Hebrew UI copy, document language/direction synchronization, and persisted language detection.
- A shared button primitive, semantic theme tokens, local font packages, responsive layout, focus styles, and reduced-motion handling.
- Resume-assisted onboarding after sign-in: users can upload one PDF/DOCX or skip directly to manual entry. Private Convex Storage, actual text extraction, and structured career parsing prefill the editable four-step onboarding form; missing details remain required before personalized jobs open.
- Completed profiles use one shared authenticated shell across Jobs and Profile, with common page width, gutters, headers, surfaces, controls, empty states, and responsive RTL/LTR behavior.
- The profile contains an owner-scoped resume library with multiple independently parsed PDF/DOCX versions, labels, notes, safe deletion, and keyboard-accessible click or drag-and-drop upload. A first CV is optional because the candidate profile can be completed manually; uploaded files do not act as a persistent matching selector.
- Versioned CV-derived career profiles include factual role history, responsibilities and explicit achievements, normalized skills by group, education, explicit languages, overlap-safe experience totals, domains, seniority, confidence, target-role candidates, and normalized Israeli location when supported.
- Effective candidate profiles preserve field-level manual overrides across CV replacement. Existing pre-CV profiles are treated as manually chosen on first import. Raw CV text and structured detail stay server-side.
- One indexed candidate profile per Convex Auth user, with server-derived ownership and Google identity fields, bounded server normalization, optional professional introduction and minimum salary, draft resume state, and created/updated/completed timestamps.
- Searchable bilingual job-title and skill catalogs, with persisted editable aliases for curated titles and bounded per-user private additions that cannot leak across accounts or inherit shared aliases.
- Google Places autocomplete for one primary Israeli city or region, with a compact selected-location summary, an accessible 5–200 km stepped radius slider (25 km by default), localized results, and a current-location action that reverse-geocodes and selects the user's city after permission. If reverse lookup fails, it falls back to a local autocomplete bias without persisting raw coordinates. Earlier multi-location drafts remain readable, but onboarding presents and replaces only the primary location.
- Multiple work-arrangement selections and up to ten language/proficiency entries, seeded in the UI with ten languages commonly useful in Israel.
- Convex tests covering unauthenticated rejection, cross-user isolation, private catalog ownership, normalization, resumable drafts, and completion enforcement, plus component tests for onboarding validation, routing, and submission behavior.
- Completed onboarding now opens the responsive JOBMITER dashboard. Incomplete profiles still open onboarding, within the existing authentication boundary.
- Google Places selections now preserve the existing Place ID/radius fields and additionally store a bounded formatted address, city, administrative area, country/code, and coordinates. Older profiles remain readable but must reconfirm location before job discovery if normalized data is absent.
- Server-owned `free`, `pro`, and `admin` policies protect provider usage. Free users only read the central jobs database and cannot enter the provider path. Paid users receive automatic searches.
- Paid profiles automatically select one target role per Israel calendar day in saved order, wrapping after the last role; shared or unsuccessful slots also advance the rotation. Each query combines curated bilingual role aliases, up to five non-generic profile skills, and a city/district/country scope selected from the saved radius. Exact normalized query criteria are claimed once per Israel calendar day across all users; a failed owning run releases its claim for retry.
- Automatic provider calls fail closed behind a kill switch, daily run/query ceilings, concurrency ceiling, and a configurable output-token cap. Provider requests allow 90 seconds and retry transient connection, timeout, rate-limit, and server failures once with no same-day scheduler retry. Searches request at most six concise candidates and retry output-token truncation once with a compact three-candidate response; usage and bounded failure diagnostics are recorded.
- Provider output is treated as untrusted. Every candidate needs a public HTTP(S) URL present in Web Search evidence, bounded structured fields, and a title and company. Source verification pins the resolved public IP, bounds redirects/time/body size, rejects private addresses, 404/410, closure markers, generic pages, and content that does not confirm the expected role and company.
- Central vacancies can own several source records. Deterministic consolidation checks domain/provider ID, canonical URLs, normalized company/title/location, and content. URL tracking noise and common formatting differences collapse while seniority and distinct cities remain separate. Transactional indexed lookups protect concurrent ingestion. Every observation is retained in an ingestion event.
- Only canonical `verified_active` or recently observed `probably_active` jobs with no hard-filter contradiction appear. Bounded background reconciliation materializes eligible per-profile matches across the entire active catalog; feed reads are indexed and are not limited to the newest 500 central jobs. Profile changes sweep both active lifecycle partitions, while job ingestion and activity changes fan one job out across completed profiles. Employer pages outrank ATS pages, job boards, and aggregators.
- Minimum required experience is a hard eligibility rule; explicit English/Hebrew ranges, `X+`, and stated minimums are normalized before matching, while unknown requirements remain eligible. Seniority, employment-type, and work-arrangement gaps remain scoring signals rather than hard exclusions.
- An hourly bounded worker rechecks due sources after a three-day cache interval. Conclusive 404/410, closure markers, redirects to generic careers pages, and passed deadlines close listings. Temporary failures preserve prior state and retry with bounded exponential backoff. Unknown, closed, and expired canonical records remain stored but are hidden from suggestions. Explicit grounded AI-open evidence can produce a probably-active job for three days when the server check is inconclusive; the rules and table are documented in the README.
- Job locations resolve through an offline GeoNames Israel locality dataset. Jobs store a stable place ID, locality centroid, and canonical English/Hebrew names; radius filtering uses Haversine distance without AI. A failed structured-city lookup falls back to the full location text. Unknown, ambiguous, and foreign locations are excluded.

- The homepage is a job feed with Suggestions / In progress tabs, clean cards for title, company, location, work model, date, summary, skills, source, and actions, a fixed logical-start profile panel, and a server-flagged floating development panel. Profile editing reuses the prefilled onboarding form.
- Owner-scoped tracking snapshots support saved jobs, applied, recruiter contact, phone screen, interview, assignment, final interview, offer, rejected, and withdrawn stages. Every card has a footer Save/status picker with colored status icons and an adjacent comment action; tracked cards expose removal as the final picker option. Choosing a new status opens an optional-comment dialog. Standalone notes do not assign a status, and removing a status preserves the snapshot, comments, and full dated timeline with an explicit removal event. Saved contains only jobs with a current status, while status-free activity can remain visible with its timeline in Suggestions. Saved displays icon-and-count filters only for statuses currently in use, hides filtering when fewer than two statuses exist, and keeps All first. Closed job postings remain in history with an unavailable label.
- An hourly internal Convex cron claims one of ten deterministic paid-user cohorts from 08:00 through 17:00 Israel time in bounded pages. A newly completed paid profile is queued immediately. Each user rotates one role per Israel day in saved order. In-flight and completed same-day query work is shared even when empty; unsuccessful slots do not schedule same-day retries. Free profiles are never queued for provider work.
- Search runs retain bounded provider diagnostics (response/parse status, incomplete or error details, output text, and a raw response excerpt). Missing structured output is recorded as a provider failure rather than silently becoming zero candidates. Catalog repair now refreshes lifecycle and best-source links for jobs that already have source records and requeues inconclusive sources for verification.
- LinkedIn signup redirect wrappers and localized/decorated job URLs are normalized to stable `www.linkedin.com/jobs/view/{id}` URLs during ingestion and again when feeds or saved-job snapshots are read.
- Admin job lists and visibility diagnostics expose resolved experience, skills, location, the normalized extraction JSON, and the original provider JSON. The default job list shows the 200 most recently discovered jobs; title and company searches use paginated full-catalog search indexes in both the Jobs tab and visibility inspector. User/job visibility inspection compares effective profile experience against both stored and text-resolved job requirements.
- The admin Token usage view shows per-day OpenAI token counts, web-search calls, and estimated USD by job search, deep review, and CV analysis. New provider responses are recorded individually, including search retries. Earlier completed search runs remain visible from stored totals; earlier deep reviews and CV analyses have no historical token records. Estimates use a dated model-rate table and are not billing data.
- During the beta/pilot, accounts without an explicit entitlement receive Pro capabilities automatically. Manual search and the development plan switch are gated server-side by `DEV_TOOLS_ENABLED=true`; an explicit Free override still refreshes database results only. Subscribed mode can run repeated manual searches without automatic daily/global quota copy or cooldowns, while still preventing concurrent runs. Development controls use the real discovery pipeline and do not seed synthetic jobs or CVs.
- Pro/admin users can request a private saved deep review from a job card. The action reverifies the shared job source, compares the role with the effective profile and up to six ready resumes, recommends an existing resume and truthful edits, identifies evidence-based strengths and gaps, and saves Web Search-backed employer/application links. Stale reviews are detected after profile or job changes; free users cannot generate or refresh them.
- An authorization-checked `/admin` operations console exposes beta decision metrics, actual search runs and provider diagnostics, durable daily scheduler decisions (including skipped reasons), preservation of queued and finished daily outcomes across repeat scheduler checks, specific provider failure categories, bounded user and job lookup, per-user activity/email/current-feed detail, run-to-job evidence, and a deterministic user/job visibility inspector. Admin membership is stored separately from plan entitlements. Opening a read-only user diagnostic records the admin actor and target user. From that user view, an admin can open a separate read-only Jobs preview that uses the selected user's real profile, preferences, matches, applications, filters, reviews, and discovery state through the same production feed helpers and components; it does not impersonate the user or expose mutation controls.

## Incomplete or unknown areas

- Live Google OAuth was reported successful after the replacement client was configured; this task did not repeat that external smoke test.
- Resume generation, automatic applications, Gmail access, embeddings, and a full ATS/CRM workflow do not exist. CV ingestion, profile creation, multi-resume management, and a deliberately lightweight application pipeline are implemented.
- There is no semantic query reuse, billing, or checkout. A paid daily attempt reuses an in-flight or completed query already claimed by another user, including empty results.
- Embedding-based duplicate detection and semantic relevance are deferred. Deterministic relevance now ranks eligible jobs by effective target/past roles, core skills, experience, location, work arrangement, and employment type.
- GeoNames coordinates are locality centroids, so radius checks are city-level approximations rather than exact workplace distances. Jobs with unresolved or ambiguous locations are hidden.
- Existing deployments need a one-time `jobMatching:dispatchAllUsers` backfill after the materialized match index is deployed. Thereafter, profile and job mutations maintain it incrementally in bounded pages; reconciliation is eventually consistent while those scheduled pages run.
- Pro/admin entitlements have no billing source. The development-only switch creates test entitlements; all users otherwise resolve to `free`.
- Production hosting, production Convex configuration, release strategy, and monitoring are not documented.
- Admin user views and Jobs previews are intentionally read-only projections. Mutation-capable impersonation is not implemented; each account-changing workflow would need to adopt actor/subject audit context before it can be enabled safely.

## Current risks

- `@convex-dev/auth` is on a `0.0.x` release and should be treated as a dependency that may introduce breaking changes during upgrades.
- Convex Auth stores browser session and refresh tokens in `localStorage` by default. This provides reload and browser-restart persistence but makes application XSS prevention a security boundary; the product owner should explicitly accept this persistence model or request a different storage policy.
- Runtime authentication readiness still depends on untracked deployment configuration and cannot be inferred from a successful build or mocked tests.
- Runtime location search depends on Google Cloud billing, Maps JavaScript API, Places API (New), Geocoding API, and correct browser/API restrictions for `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
- Runtime job discovery depends on server-only `OPENAI_API_KEY` and `OPENAI_JOB_SEARCH_MODEL` configuration and on the selected model continuing to support Responses API Web Search plus Structured Outputs.
- Source verification intentionally favors precision and can hide legitimate client-rendered or bot-protected job pages. Temporary access failures preserve prior state, but jobs eventually leave suggestions when recent activity cannot be established.
- DNS resolution is checked and the selected public address is pinned for the HTTP request, but source verification still depends on the correctness of public DNS and TLS infrastructure.
- Global ceilings are cost controls rather than billing. Production operators need monitoring, an entitlement-management process, and an incident runbook before launch.

## Next recommended milestone

Keep collecting activation and days-8–14 retention until the dashboard reaches
its minimum mature sample. If the signal is promising, run willingness-to-pay
interviews or a lightweight pricing test before building billing. Separately,
add alerting and aggregate counters before analytics volume reaches the current
bounded-query safety limits. Decide on CV retention/deletion periods.
Mutation-capable impersonation, billing, and automated applications remain
separate milestones.

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

The authenticated header now keeps Suggestions and Saved centered between the
brand and an avatar account menu. Profile, language, and sign-out actions are
grouped in that menu. The profile page uses a focused five-section navigation
with URL-backed selection and section-level editing instead of one long page.

Suggested-job cards display the deterministic relevance score out of 100 used
for ordering, together with a strong or partial match band. Strong matches are
shown first; partial matches supplement only when fewer than five strong matches
exist. Possible matches are excluded from suggestions.
Hovering or focusing the score shows the exact points earned across
role, skills, domain, experience, seniority, location, and preferences, plus
the strongest matched profile evidence. The explanation is localized in
English and Hebrew. New deep reviews use the same server match score and
requirement statuses, with AI adding explanations and resume/application advice.

Component coverage checks profile routing/edit/save, keyboard opening and Escape
focus restoration, language switching, RTL direction, and the In progress tab.
Backend tests cover owner isolation, idempotent application marking, undo,
snapshot retention after expiry, bounded daily sweep continuation, duplicate
claims, and the server-side development-tools gate. Provider calls are mocked.

The authenticated Hebrew/RTL Vite app was previously checked in the in-app browser.
Free mode refreshed the central feed twice without a cooldown, subscribed mode
showed the enabled manual-search control without quota copy, and the account was
restored to free. The current migration replaces profile hashes and inherited job
queries with `/profile/*` topic routes. No console errors or live
OpenAI provider calls occurred. Backend functions pushed successfully to the
existing development deployment; its development-tools flag is enabled.

## Local development and validation

Install dependencies and start Convex with the Next.js development server:

```sh
npm install
npm run dev
```

Local authentication uses the exact frontend origin `http://localhost:3000`.
The personal Convex development deployment `glorious-mallard-885` has its
`SITE_URL` set to that origin. It also requires `CUSTOM_AUTH_SITE_URL` on that
deployment and a matching Google callback. Production and preview deployments
must configure their own exact public origin before OAuth is used there.

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
`npm test` runs the focused unit/component suite. `npm run build` performs the
Next.js production compilation and framework type validation.

## Manual Google OAuth smoke test

These steps require an enabled Google OAuth client and a reachable Convex
development deployment. Never paste environment-variable values into issues,
logs, screenshots, or documentation.

1. Confirm the Convex deployment defines `AUTH_GOOGLE_ID`,
   `AUTH_GOOGLE_SECRET`, `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL`, and
   `CUSTOM_AUTH_SITE_URL`.
2. Set `SITE_URL` and `CUSTOM_AUTH_SITE_URL` to the exact frontend origin. For
   local development, use `http://localhost:3000` and open that same hostname in
   the browser.
3. In Google Cloud, register the frontend callback, such as
   `https://jobmiter.com/api/auth/callback/google`, as an authorized redirect URI
   and the frontend origin as an authorized JavaScript origin. Retain the old
   Convex callback until the first-party production flow has been verified.
4. Run `npm run dev`, open the frontend, and choose **Continue with Google**.
5. Complete account selection and consent. Confirm the browser returns through
   the frontend `/api/auth/callback/google` path, removes the `code` query
   parameter, and shows authenticated content.
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

The product owner subsequently reported Safari token-exchange failures even with
the first-party callback. The production callback, client ID/secret pair, and
PKCE authorization request were validated. The remaining Safari-specific risk
was Convex Auth's `Partitioned` OAuth cookie: older Safari releases do not
support CHIPS and affected releases have had partitioned-cookie regressions.
The restricted Next.js OAuth proxy now emits the PKCE and redirect cookies as
secure, HTTP-only, first-party `SameSite=Lax` cookies without `Partitioned`.
Unit tests, a production build, and a local HTTP header round trip prove this
behavior. A live Safari login remains the final post-deployment smoke test.

## Activity filtering update (2026-09-09)

Implemented: server-side 14-day verification freshness limit, fresh-source selection, cautious canonical/login redirects, matching structured JobPosting expiry, HTTP attempt metadata, and background retry queue lease advancement. Existing saved/application history and English/Hebrew inactive UI are preserved. Browser verification remains for the owner; no live-source crawl was performed during implementation.

Implemented: source provenance distinguishes successful HTTP/structured verification from provider sightings. Future discovery persists all usable cited source URLs, and an idempotent bounded repair can recover missing `jobSources` rows from canonical records, evidence, or stored provider JSON without paid searches.

## Legal UX cleanup (2026-09-23)

Implemented: legal and support pages remain linked from the global footer, sign-in shows only compact terms and privacy links, and optional analytics uses one small accept/reject banner that can be reopened from the footer. The blocking legal acceptance screen, resume-upload disclosure block, and unused marketing checkbox were removed. Resume upload no longer depends on a separate consent record. Existing consent data and schema remain intact to avoid a destructive production migration.

Implemented: development CSP includes React's required `unsafe-eval` source only when `NODE_ENV=development`; production omits it. The permissions policy allows same-origin geolocation so the **Near me** action can request browser permission while camera and microphone remain disabled.

## Hebrew search visibility

Implemented: Hebrew-first public titles/descriptions and social metadata;
homepage WebSite identity with Hebrew/English brand aliases; server-rendered
Hebrew landing content with saved English preferences applied after hydration;
page-specific legal metadata; local Hebrew font for the social-preview image.
Unknown: Google Search Console verification, sitemap submission, Google indexing,
and ranking for branded queries. These require production checks after release.

Validation: `npm run check`, all 314 tests, and `npx next build --webpack` passed.
The locally built homepage HTML contained its Hebrew content, canonical and
WebSite/WebApplication markup; Hebrew and English legal routes returned their
own titles/canonicals/locales. Browser checks covered both reading directions,
saved English preference restoration and route-specific legal titles. The Hebrew
social-preview image was visually checked. Default Turbopack builds were blocked
by this execution environment's local-port restriction.

## Combined AI and server job activity

Implemented: discovery JSON includes open/closed/unknown and exact-listing evidence
within the existing provider call. Deterministic verification takes precedence;
credible AI-open evidence may qualify an inconclusive source for three days as
probably active. Unsafe/generic/broken/mismatched sources remain excluded. Feed,
matching, admin preview, and background refresh use the combined policy, with a
localized Probably open label and separate AI/server timestamps. The README
records the decision table. Automated tests cover precedence, evidence validity,
expiry, ingestion through the feed, and closure after display.

Unknown: live-provider assessment accuracy and production rollout; mocked tests
do not establish how often a provider correctly assesses real listings.

## Visual deep review (2026-10-01)

Implemented: concise requirement checklist with met/gap/unknown semantics,
grouped importance, score ring, current job-fact tags, compared resume cards with
a highlighted recommendation, short truthful resume edits, clear application
routes, expandable explanations, and sticky/bottom collapse controls with focus
restoration. English/Hebrew, desktop/mobile, evidence disclosures, source links,
and read-only preview behavior are covered by implementation and validation.
The redesign keeps the existing explicit provider call and adds no AI call.

Validation: `npm run check`, all 340 tests, `npm run build -- --webpack`, and
development Convex deployment validation passed. Hebrew RTL and English LTR
desktop/mobile previews were checked for overflow, expandable evidence, and
sticky collapse with restored keyboard focus. React Doctor reported no errors;
two control-flow complexity warnings remain. Final Turbopack attempts were
blocked by the environment's process/port permission restriction.

Development: three old-format cached reviews were reset for the clean schema;
resume records and application history were retained. Production rollout and
live-provider output quality remain unverified; local visual checks use sample
review data and mocked tests cannot establish real-world AI assessment accuracy.

## Accurate matching and low-cost skill identities (2026-10-01)

Implemented: shared bilingual aliases and indexed onboarding skill reuse;
unfamiliar skills accepted privately without blocking; factual education and
experience evidence from the existing CV call; shared education editing;
manual overrides preserved through CV changes; qualification/proficiency checks,
conservative unknowns, and strong-first five-result near-match fallback. Feed,
notifications, admin counts and new deep reviews share matching decisions.
Cached reviews are marked stale when matching conclusions change, without
automatically requesting another paid review.

Limits: unfamiliar arbitrary synonyms are not semantically auto-merged; only
recognized explicit professional credential clauses are interpreted; missing
experience facts remain unknown, while an empty education list means no education.
Unfamiliar education field wording stays unconfirmed. Ranking thresholds need real-world
owner-reviewed calibration. No extra AI/embedding calls or new decision API were
added. Production rollout and live-provider extraction accuracy remain unverified.

Validation: `npm run check`, all 377 tests, and `npm run build -- --webpack`
passed. React Doctor reported no errors, with bounded lookup/seed-loop warnings
and an existing component-complexity warning. Default Turbopack builds remain
blocked by the environment's process/port permission restriction. Automated
frontend tests cover Hebrew/English education controls and requirement evidence;
the education editor has since had Hebrew/English desktop/mobile browser checks
using a local preview (see the follow-up below).

Development: deployed to `glorious-mallard-885`, refreshed the catalog alias
index, and dispatched a deterministic matching sweep. The subsequent read
confirmed 60 materialized eligible matches with requirement assessments and no
failed matching tasks in the inspected scheduler window. No live AI job search,
embedding request, or production deployment was run for this change.

## Education simplification (2026-10-01)

Implemented: the profile and onboarding share a regular education list with an Add
button, type selector, required Studying/Completed choice and compact remove action.
There is no collapse, optional badge or independent degree-status dropdown. The
list is authoritative; no entries excludes mandatory-degree jobs. Field matching
recognizes common Hebrew/English degree aliases from both field and credential
name, while qualification type/completion prevent diplomas or students from
passing completed-degree checks. Existing CV extraction prefills this editor and
uses no extra AI call. Unclear CV completion requires correction before profile
confirmation. User corrections remain protected through CV replacement.

Validation: npm run check, all 385 tests, a webpack production build and development
Convex deployment passed. React Doctor reported no errors and the same eight
bounded-lookup/seed-loop/existing complexity warnings. A local component preview
was checked in Hebrew RTL and English LTR on desktop and at 390px mobile width,
including adding/removing entries; neither mobile language overflowed. Preview
data is synthetic; live CV extraction accuracy remains unverified. Production
rollout remains unverified.

Development matches were recalculated after deployment without AI searches; the
inspected matching scheduler tasks all completed successfully.

Design follow-up: education now reuses the shared bordered SelectInput/TextField
and Choice controls instead of borderless inputs and custom status tabs. The soft
divided rows remain. Code checks and all 10 education/onboarding tests passed;
Hebrew/English desktop/mobile previews were checked. React Doctor reported the
same existing warnings and no errors.

Education follow-up: new entries default to Completed, unspecified CV completion
does the same in the editable draft, and known CV students remain Studying. One
name field replaces the separate credential/study-field inputs. CV field text is
included in that name when needed; edits clear the prior hidden field to prevent
contradictory matches. No AI calls or backend deployment were added for this UI
change.

Validation for the single-name/default-status follow-up: code checks and all 386
tests passed. Hebrew desktop/mobile preview confirmed one input and Completed
selected on addition; existing student entries retained their status. React
Doctor reported the same existing warnings and no errors.

Onboarding education prefill fix: an activating CV upload now clears the older
education override in an unfinished onboarding draft, while edits made after
upload and education confirmed in completed profiles remain protected. A CV also
activates when the existing manual draft has no active resume. The onboarding
form refreshes on active-CV/source-version changes and retains unsaved edits on
ordinary reactive saves. An explicit revision-guarded internal support operation
restores cached education only for an unfinished pending review.

Validation: code checks and all 392 tests passed, including first/replacement CV
prefill, edits during processing, completed-profile preservation, stale repair
rejection, and frontend draft refresh/preservation. Deployed to development
`glorious-mallard-885`; the reported test account's two education entries were
restored from cached extraction without another AI call and read back for
verification. Production was unchanged. React Doctor reported no errors; warnings
remain for bounded lookups/seeding, sequential resume operations, and component
complexity. No visual design changes or production build were required for this
behavioral fix.

## Database vocabulary and education catalog (2026-10-02)

Implemented: education names use a searchable bilingual database catalog with
free-text additions. Matching resolves skill, study-subject and qualification
aliases from the database; degree level and completion remain independent checks.
Unfamiliar terms stay private until curated, with occurrences deduplicated per
user or canonical job. The monthly cleanup considers at most 30 terms used by
at least three independent sources, makes one bounded AI request without retries,
and skips the request when there is nothing eligible. Clear existing synonyms
can be approved automatically; new concepts and uncertain proposals require the
admin Catalog review. Confirmed mappings trigger deterministic rematching.

Validation: npm run check, all 408 tests and npm run build -- --webpack passed.
Hebrew RTL and English LTR component previews were checked on desktop and at
390px mobile width, including keyboard selection and custom names retaining
spaces after blur. React Doctor reported no errors and 12 warnings for bounded
lookup/seed loops, sequential resume operations and component complexity.

Development: seeded 19 education concepts and 173 skill aliases on
glorious-mallard-885 and dispatched matching without AI. All 179 inspected
matching scheduler tasks succeeded. The monthly cron definition was accepted
by deployment; a live paid cleanup invocation has not been exercised. Visual
dashboard schedule verification was unavailable because the dashboard required
sign-in. Production was unchanged.

### Next step after observing the current matching/catalog behavior

- [ ] Plan a salary-table mechanism to estimate job pay by role, seniority,
      relevant experience, location and employment type. Prefer reliable salary
      data and cached, periodically updated estimates over per-job AI calls.
      Keep published salaries separate from estimates, record source/freshness
      and confidence, normalize currency/pay period before comparison, and
      decide how reliable estimates should exclude clearly underpaid roles for
      senior candidates. Missing/uncertain estimates must remain explicit;
      define false-exclusion safeguards before enabling filtering.
- [ ] Extract richer matching evidence from CVs: experience duration per skill,
      recency of use, and supporting employment/project examples. Keep unknown
      values explicit and avoid adding onboarding questions unless necessary.
- [ ] Make routine catalog maintenance fully automatic: approve clear new
      generic concepts as well as confirmed aliases across role/field/skill/
      education dropdowns, and reconsider uncertain terms in later bounded AI
      batches without requiring owner review. Let the inexpensive first pass
      mark difficult cases for deeper checking by a stronger model, with a
      separate bounded escalation budget and no repeated unbounded retries. Retain
      conflict checks, distinct related concepts, privacy validation and monthly
      spending limits. This is deferred until the current behavior has been
      observed; it is not implemented or scheduled as an agent follow-up.
- [ ] Before expanding automation, inspect actual search coverage, relevant and
      irrelevant feed examples, unfamiliar-term proposals and cleanup usage.
      Pay particular attention to different locations sharing the same national
      role search and to qualified users excluded by unresolved terminology.

## Production rollout (2026-10-02)

Released application commit `414af76` to main. Convex functions and schema deployed
successfully to production `famous-badger-815`; catalog seeding inserted seven
reference items and updated 110, with 19 education concepts and 173 skill aliases
verified afterwards. Deterministic rematching ran without AI calls; all 196
matching tasks in the inspected scheduler window succeeded. Vercel deployment
`dpl_7pW7MwK3maVuTV7KAxzFc376z1A5` reached Ready and serves jobmiter.com.
The live /api/health endpoint returned HTTP 200 with status ok.

Two existing production schema blockers were resolved before release. Six of 12
daily search-attempt records contained obsolete `nextAttemptAt`; a backed-up
single-table import removed only that field, with all document identities,
creation timestamps and remaining history verified unchanged. Four obsolete
deep-review cache entries used the old strengths/gaps format. After explicit
owner approval, these were backed up privately under /private/tmp and cleared;
CVs, profiles and application history were not cleared. Users regenerate those
reports through the normal review action. No transitional schema fields or
legacy readers were added.

Validation: npm run check, all 408 tests and npm run build -- --webpack passed
before release. Actual production search accuracy and the first live monthly
vocabulary cleanup remain observation items; no paid cleanup call was triggered
for deployment. Fully automatic vocabulary approval and stronger-model escalation
remain the next deferred improvements above.

## Experience-area production rollout (2026-10-04)

CV extraction now receives the public and owner-private experience-area catalog
alongside roles and skills. The existing prompt prefers equivalent canonical
area labels, avoids combining distinct areas into new labels, and still permits
new concepts when no suggestion fits the CV evidence. No separate AI call is
introduced; existing CVs are not automatically reprocessed.

Validation: `npm run check`, all 426 tests, `npm run build -- --webpack`, and
development deployment succeeded. Production Convex deployment to
`famous-badger-815` succeeded; `referenceData:seedCatalog` inserted 14 items,
updated 117 and reported 131 bootstrap entries. Live onboarding, job matching,
and paid AI testing were deliberately left to the owner as requested.

Convex reported that the project is above Free plan limits during deployment;
the owner should resolve capacity/plan limits before advertising traffic.

## Error diagnostics and query fixes (2026-10-05, local changes)

Implemented: paginated admin user summaries using stored matches; removal of the
full job/source audit from ordinary empty-feed reads; reuse of scored feed entries;
cheap lifecycle rejection before scoring stale matches; preservation of the
matching revision on active-resume deletion; completed-profile independence from
resume review; bounded education lookup text; compact bilingual cookie prompt.

Sentry now retains useful redacted exception/stack/route/digest/debug-ID data and
verified opaque user identity, clearing it on logout. Original Next server
reporting, root-layout and profile/admin-preview client reporting are covered.
The native Convex Sentry integration (Pro) still needs a production settings
check/setup to report original backend exceptions; this is separate from Next
instrumentation. Production build logs confirm the
existing browser/server source-map upload path works. Reading Sentry events with
the available token returned HTTP 403, so live event contents remain unverified.

Validation: `npm run check`, the full 503-test suite, `npm run build`
(Turbopack), and React Doctor passed; React Doctor reported no issues. A
subsequent focused test verifies automatic SDK captures retain the server digest.
Development deployment `glorious-mallard-885` accepted the backend changes.
Production rollout, commits and browser validation of these changes are pending.

## Session replay fidelity (2026-10-06, local changes)

Removed blanket text/attribute masking, restored ordinary form values and
images, and explicitly enabled inline stylesheets/font collection. Passwords,
embedded documents, canvas, hidden/file inputs and designated private regions
remain protected. Analytics still requires consent and excludes console logs,
network bodies/headers and navigation query strings. Policy/consent version
2026-10-06 reflects the recording change. Existing masked recordings cannot be
repaired. Production rollout and live replay validation remain pending.

Validation: the actual rrweb recorder preserves CSS, class/style attributes,
ordinary text/input values and images in a DOM snapshot while excluding password
values and private/embedded document contents. Consent regression tests cover
missing/declined/superseded consent, withdrawal and a deferred SDK-load race.
`npm run check`, all 510 tests, `npm run build` (Turbopack), and React Doctor
passed (no reported issues).

## Production audit repairs (2026-10-06)

Implemented and deployed to production Convex `famous-badger-815`: source-backed
requirement normalization with evidence/completeness checks; conservative source
classification and primary ATS following; explicit desired-role scope; skill OR
and conjunction reasoning; stronger seniority ranking; canonical bilingual and
regional/career-level discovery identities; truthful discovery states; bounded
location exclusion summaries; durable leased resume workers/watchdog/retry;
billing-outage circuit; requester-specific accepted/strong/partial measurements;
and indexed admin user search with shared background metric snapshots.

Frontend production deployment `dpl_4xWu79Zgdcb86iwTE2X8P6tpauG3` is Ready and
serves jobmiter.com. Its build passed with Turbopack and uploaded browser/server
Sentry source maps. `/api/health` returned `{"status":"ok"}`. Local checks and all
548 tests passed; local Webpack production build passed. React Doctor found no
React issues and five bounded sequential backend loop warnings. No browser tests
were run, following the owner's preference.

Sixty-four affected sources were rechecked, including Palantir and UpNEXT; three
legacy textless resumes, both recent schema failures and five older failed
uploads were repaired. A further 353-record source repair addresses URL
transport, page-size and inferred identity faults, recovering 89 verified active
sources. Full-feed pages now contain eight jobs with one-pass skill detection;
the production rebuild completed 3,278 matching operations with zero failures.
All 85 completed-profile feed reads succeeded; 77 contained suggestions. All 96
resumes at readback have text, with none failed or processing. Admin
search was rebuilt for all 120 accounts at final readback, and the current metric snapshot
was generated. Final coverage and older failed-upload recovery results are in
`docs/PRODUCTION_FIXES_2026-10-06.md`.

A 10,000-account backend test proves bounded admin pages/indexed lookup and
uncapped background totals. Real 10,000-user concurrency, refresh costs under
large event history, provider capacity and hiring outcomes remain unproven.
Background summaries still assemble bounded paginated history; fully incremental
counters are not implemented. No commits or pushes were made for this work.

## Sentry maintenance (2026-10-07, local changes)

Project-specific Sentry issue/event access now works with
`JOBMITER_SENTRY_AUTH_TOKEN` in the ignored project `.env.local`. Current events
confirm symbolicated client stacks and source context. Older stripped events
cannot be reconstructed; live original production server capture and the native
Convex integration remain separate verification questions.

Fixed the reproducible admin date-picker crash from cleared/partial dates and
locale-dependent keys. Explicit Retry reloads stale chunks/broken DOM; ordinary
errors retain segment retry. Added bounded sanitized HTTP/navigation breadcrumbs,
browser identification and online/visibility/translation context. Authentication
refresh failures remain reported; the old events do not establish why the network
request failed. The DOM error's root cause also remains unconfirmed.

Validation: npm run check, 562 tests, local Webpack production build and React
Doctor passed. No browser tests, production changes, commits or pushes. The daily
local Codex heartbeat is active at 09:00 Asia/Jerusalem and cannot release fixes
without explicit owner approval. Details: docs/SENTRY_TRIAGE.md.
