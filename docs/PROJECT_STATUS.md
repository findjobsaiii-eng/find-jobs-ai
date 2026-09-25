# Project status

Last repository audit: 2026-09-24

## Production readiness work in progress

- Implemented on the current branch: consent-gated PostHog page views, Sentry event scrubbing, bilingual draft legal routes and shared footer, skip link, sitemap/robots, noindex on protected routes, a web-to-Convex health endpoint, and a Convex record of terms/privacy acceptance with a separate marketing choice. CV upload checks acceptance server-side.
- Implemented: Resend service notifications after automatic searches that produce visible matches, with Hebrew RTL content, daily/weekly/never user controls, duplicate-send protection, removal of email state during account deletion, and a separate public HTTPS origin that prevents local authentication URLs from leaking into outbound links.
- Incomplete: comprehensive accessibility remediation and axe/Lighthouse audit; verified data export; retention and backup deletion policy; complete security and production configuration verification; full browser journey tests. Self-service deletion now removes user-linked Convex data and files in scheduled batches, but shared job data, vendor logs and backups remain outside that automatic path. Data-copy requests use the owner-supplied email.
- Unknown outside the repository: production vendor settings and callback URLs, hosting countries, backup/restore results, mailbox monitoring, and legal operator identity. See `docs/LAUNCH_OWNER_CHECKLIST.md`.
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

- A Next.js App Router application with a neutral root layout, a separate public
  landing experience, a protected route-group layout, Convex providers, and Motion.
- Optional PostHog browser initialization for anonymous page views and client-side
  navigation. Automatic interaction capture and session recording are disabled;
  deployment configuration and live ingestion remain unverified.
- Sentry browser and Next.js server error capture is wired, with a temporary
  `/sentry-test` button for a controlled verification event. Vercel configuration,
  source-map uploads, and live event delivery remain unverified.
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
- Paid profiles generate one shared query per unique target role, capped at five. Each query combines curated bilingual role aliases, up to five non-generic profile skills, and a city/district/country scope selected from the saved radius. Exact normalized query criteria are claimed once per Israel calendar day across all users; a failed owning run releases its claim for retry.
- Automatic provider calls fail closed behind a kill switch, daily run/query ceilings, concurrency ceiling, and a configurable output-token cap. Provider requests allow 90 seconds and retry transient connection, timeout, rate-limit, and server failures once before the existing scheduler-level retry takes over. Searches request at most six concise candidates and retry output-token truncation once with a compact three-candidate response; usage and bounded failure diagnostics are recorded.
- Provider output is treated as untrusted. Every candidate needs a public HTTP(S) URL present in Web Search evidence, bounded structured fields, and a title and company. Source verification pins the resolved public IP, bounds redirects/time/body size, rejects private addresses, 404/410, closure markers, generic pages, and content that does not confirm the expected role and company.
- Central vacancies can own several source records. Deterministic consolidation checks domain/provider ID, canonical URLs, normalized company/title/location, and content. URL tracking noise and common formatting differences collapse while seniority and distinct cities remain separate. Transactional indexed lookups protect concurrent ingestion. Every observation is retained in an ingestion event.
- Only canonical `verified_active` or recently observed `probably_active` jobs with no hard-filter contradiction appear. Bounded background reconciliation materializes eligible per-profile matches across the entire active catalog; feed reads are indexed and are not limited to the newest 500 central jobs. Profile changes sweep both active lifecycle partitions, while job ingestion and activity changes fan one job out across completed profiles. Employer pages outrank ATS pages, job boards, and aggregators.
- Minimum required experience is a hard eligibility rule; explicit English/Hebrew ranges, `X+`, and stated minimums are normalized before matching, while unknown requirements remain eligible. Seniority, employment-type, and work-arrangement gaps remain scoring signals rather than hard exclusions.
- An hourly bounded worker rechecks due sources after a three-day cache interval. Conclusive 404/410, closure markers, redirects to generic careers pages, and passed deadlines close listings. Temporary failures preserve prior state and retry with bounded exponential backoff. Unknown, closed, and expired records remain stored but are hidden from suggestions.
- Job locations resolve through an offline GeoNames Israel locality dataset. Jobs store a stable place ID, locality centroid, and canonical English/Hebrew names; radius filtering uses Haversine distance without AI. A failed structured-city lookup falls back to the full location text. Unknown, ambiguous, and foreign locations are excluded.

- The homepage is a job feed with Suggestions / In progress tabs, clean cards for title, company, location, work model, date, summary, skills, source, and actions, a fixed logical-start profile panel, and a server-flagged floating development panel. Profile editing reuses the prefilled onboarding form.
- Owner-scoped tracking snapshots support saved jobs, applied, recruiter contact, phone screen, interview, assignment, final interview, offer, rejected, and withdrawn stages. Every card has a footer Save/status picker with colored status icons and an adjacent comment action; tracked cards expose removal as the final picker option. Choosing a new status opens an optional-comment dialog. Standalone notes do not assign a status, and removing a status preserves the snapshot, comments, and full dated timeline with an explicit removal event. Saved contains only jobs with a current status, while status-free activity can remain visible with its timeline in Suggestions. Saved displays icon-and-count filters only for statuses currently in use, hides filtering when fewer than two statuses exist, and keeps All first. Closed job postings remain in history with an unavailable label.
- An hourly internal Convex cron claims one of ten deterministic paid-user cohorts from 08:00 through 17:00 Israel time in bounded pages. A newly completed paid profile is queued immediately. Same-day query work is reused only when that profile already has a visible match; empty or skipped discovery retries after 15 minutes up to three attempts per day. Free profiles are never queued for provider work.
- Search runs retain bounded provider diagnostics (response/parse status, incomplete or error details, output text, and a raw response excerpt). Missing structured output is recorded as a provider failure rather than silently becoming zero candidates. Catalog repair now refreshes lifecycle and best-source links for jobs that already have source records and requeues inconclusive sources for verification.
- LinkedIn signup redirect wrappers and localized/decorated job URLs are normalized to stable `www.linkedin.com/jobs/view/{id}` URLs during ingestion and again when feeds or saved-job snapshots are read.
- Admin job lists and visibility diagnostics expose resolved experience, skills, location, the normalized extraction JSON, and the original provider JSON. User/job visibility inspection compares effective profile experience against both stored and text-resolved job requirements.
- During the beta/pilot, accounts without an explicit entitlement receive Pro capabilities automatically. Manual search and the development plan switch are gated server-side by `DEV_TOOLS_ENABLED=true`; an explicit Free override still refreshes database results only. Subscribed mode can run repeated manual searches without automatic daily/global quota copy or cooldowns, while still preventing concurrent runs. Development controls use the real discovery pipeline and do not seed synthetic jobs or CVs.
- Pro/admin users can request a private saved deep review from a job card. The action reverifies the shared job source, compares the role with the effective profile and up to six ready resumes, recommends an existing resume and truthful edits, identifies evidence-based strengths and gaps, and saves Web Search-backed employer/application links. Stale reviews are detected after profile or job changes; free users cannot generate or refresh them.
- An authorization-checked `/admin` operations console exposes daily overview metrics, actual search runs and provider diagnostics, durable daily scheduler decisions (including skipped reasons), bounded user and job lookup, per-user job-visibility funnels, run-to-job evidence, and a deterministic user/job visibility inspector. Admin membership is stored separately from plan entitlements. Opening a read-only user diagnostic records the admin actor and target user. From that user view, an admin can open a separate read-only Jobs preview that uses the selected user's real profile, preferences, matches, applications, filters, reviews, and discovery state through the same production feed helpers and components; it does not impersonate the user or expose mutation controls.

## Incomplete or unknown areas

- Live Google OAuth was reported successful after the replacement client was configured; this task did not repeat that external smoke test.
- Resume generation, automatic applications, Gmail access, embeddings, and a full ATS/CRM workflow do not exist. CV ingestion, profile creation, multi-resume management, and a deliberately lightweight application pipeline are implemented.
- There is no semantic query reuse, billing, or checkout. A paid daily attempt may reuse a query already claimed by another user.
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

Add alerting and aggregate counters for high-volume operational reporting, then
extend the admin console with CV extraction confidence and source-verification
queues. Decide on CV retention/deletion periods. Mutation-capable impersonation,
billing, and automated applications remain separate milestones.

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
for ordering, together with a strong, partial, or possible match band. A score
below 58 no longer hides an otherwise eligible professional opportunity.
Hovering or focusing the score shows the exact points earned across
role, skills, domain, experience, seniority, location, and preferences, plus
the strongest matched profile evidence. The explanation is localized in
English and Hebrew and remains separate from the optional AI deep-review score.

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
