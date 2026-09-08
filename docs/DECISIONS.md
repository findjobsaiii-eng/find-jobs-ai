# Technical decisions

This log contains decisions that can be verified from committed files. Unresolved choices are listed separately and are not treated as approved.

## Verified decisions

### D-001: React, Vite, TypeScript, and Convex form the application stack

Status: Accepted

Evidence: `package.json`, `vite.config.ts`, `src/`, and `convex/`.

The frontend uses React with TypeScript and Vite. Convex provides the backend and generated client API.

### D-002: npm is the package manager

Status: Accepted

Evidence: `package-lock.json` and the npm commands documented in `README.md`.

### D-003: Google is the only configured authentication provider

Status: Accepted

Evidence: `convex/auth.ts` configures the Auth.js Google provider; no other provider is configured.

Authentication is hosted in Convex Auth. Callback routes are registered in `convex/http.ts`, and the Convex Auth tables are included in `convex/schema.ts`.

### D-004: English and Hebrew are first-class interface languages

Status: Accepted

Evidence: `src/i18n/`, the locale resources, and the frontend conventions in `AGENTS.md`.

The document language and direction follow the selected language. New interface copy belongs in the locale resources, and layouts must support both left-to-right and right-to-left directions.

### D-005: Code is organized by application role and product feature

Status: Accepted

Evidence: `AGENTS.md` and the current `src/` structure.

Application providers live under `src/app/`, shared primitives under `src/components/ui/`, product code under `src/features/`, translations under `src/i18n/`, and shared utilities under `src/lib/`.

### D-006: Local validation uses TypeScript, ESLint, Prettier, and Vite

Status: Accepted

Evidence: scripts in `package.json`.

`npm run check` is the normal static-quality gate. `npm run build` is also required before handing off substantial frontend work.

### D-007: Authentication tests use Vitest and React Testing Library

Status: Accepted

Evidence: `vitest.config.ts`, `src/test/setup.ts`, and the colocated `*.test.ts`
and `*.test.tsx` files.

The test suite focuses on authentication behavior and boundaries: callback
exchange and recovery, URL/configuration validation, authenticated versus
unauthenticated rendering, duplicate actions, sign-out failures, and LTR/RTL
behavior. Live Google OAuth remains a documented manual smoke test because it
depends on external credentials, consent, and deployment configuration.

### D-008: GitHub Actions is the repository quality gate

Status: Accepted

Evidence: `.github/workflows/ci.yml`.

Pull requests and pushes to `main` run on Node.js 22, install from the committed
lockfile with `npm ci`, run `npm run check`, run the test suite, verify formatting
explicitly, and create a production build. Deployment automation is intentionally
outside this workflow.

### D-009: Google OAuth credentials are explicit server-only configuration

Status: Accepted

Evidence: `convex/convex.config.ts`, `convex/auth.ts`, and
`convex/authEnvironment.ts`.

The Google provider reads `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` from the
Convex server environment. Required auth configuration fails closed when missing
or blank, and `SITE_URL` must be a safe origin. Credential values must not be
exposed through `VITE_` variables, client code, logs, or repository
documentation.

### D-010: Candidate profiles are one-to-one with server-derived auth users

Status: Accepted

Evidence: `convex/schema.ts`, `convex/candidateProfiles.ts`, and
`convex/candidateProfiles.test.ts`.

Each candidate profile stores the Convex Auth user ID and is looked up through
the `by_userId` index. Public profile functions take no ownership or identity
arguments: they derive the authenticated user on the server, reject missing
sessions, and return or mutate only that user's indexed document. Google email,
display name, and image are copied only from the server-side auth user record.

Draft profile fields are optional so onboarding can resume. Server-side
normalization applies bounded text, list, numeric, and enum validation; the
completion mutation additionally requires every onboarding field and records a
completion timestamp. The frontend uses four steps and persists progress before
advancing.

### D-011: Shared reference data is curated; user additions remain private

Status: Accepted

Evidence: `convex/referenceData.ts`, `convex/referenceCatalogData.ts`, and
`convex/schema.ts`.

Target job titles and skills are selected from a bilingual searchable catalog.
An authenticated user may add a missing value, but that value is normalized,
deduplicated, bounded, and visible only to its owner. It is never promoted to the
shared catalog automatically. This avoids both shared spam and a moderation
queue in the MVP. OpenAI and embeddings are not needed for this workflow.

### D-013: Google Places browser access uses a restricted public key

Status: Accepted

Evidence: `src/lib/google-maps.ts`,
`src/features/profile/google-places-multi-select.tsx`, and `README.md`.

The Places widget loads lazily only on the location step using
`VITE_GOOGLE_MAPS_API_KEY`. The value is necessarily public in the browser and
must be protected with exact HTTP-referrer and API restrictions in Google Cloud.
The official widget owns autocomplete sessions, accessibility behavior, and
Google attribution. Google Places is the single source of location options; the
app does not maintain a parallel locality table or import pipeline. OpenAI and
embeddings are not involved in location search.

Onboarding presents one primary Google Place and a separate radius control. New
selections use the 5, 10, 15, 25, 40, 60, or 100 km presets and default to 25 km.
The existing array storage is retained for compatibility with earlier drafts,
and the server continues accepting previously stored 50 km and 200 km radii. A
selection also stores bounded formatted address, city, administrative area,
country/code, coordinates, and radius for server-side search. Older profiles
without this normalized contract must reconfirm location before discovery; the
server never silently broadens their search to the whole country.

### D-012: Development data may be reset instead of migrated

Status: Accepted while the product remains pre-production

Evidence: `AGENTS.md`.

Until a production-data milestone is explicitly declared, breaking schema
changes should favor the clean target model and reset affected development data
when needed. Do not add compatibility or migration machinery solely to preserve
disposable development records. Production data will require an explicit
migration and rollback policy before this decision changes.

### D-014: A minimal job feed and shared profile editor

Status: Accepted (updated 2026-09-07)

The authenticated homepage is a Suggestions / In progress feed. The floating
logical-start profile panel contains CV replacement, profile editing, language,
and sign-out. New users enter through CV-first onboarding; the existing detailed
form remains available for later corrections through the owner-scoped save
mutation. Temporary search filters, completion cards, placeholder tools, and
mobile navigation have been removed.

### D-015: Job discovery uses bounded Responses API Web Search with strict output

Status: Accepted

Evidence: `convex/jobDiscoveryActions.ts`, `convex/openAIJobProvider.ts`,
`convex/jobDiscoveryModel.ts`, `convex/jobDiscovery.ts`, and `convex/schema.ts`.

Job discovery runs in a Convex server action using
the official OpenAI JavaScript SDK. The model is required server configuration
under `OPENAI_JOB_SEARCH_MODEL`; `gpt-5.6-luna` is the initial cost-conscious
recommendation because current official documentation lists Web Search support.
The Responses API call uses the Web Search tool, strict Zod-backed Structured
Outputs, an output-token limit, a tool-call limit, no response storage, and no
automatic SDK retries.

Application code creates one deterministic query for each unique target role,
capped at five. Shared query identity contains the role and normalized location;
personal skills, experience, salary, languages, and work preferences are applied
later as database filters. Candidate name, email, profile summary, and other
identifying text are excluded.

An exact query fingerprint is claimed once per Israel calendar day across all
users. Plan and global enforcement are defined in D-016.

Every provider record is validated again server-side. A posting must have a
public HTTP(S) source URL that occurs in returned Web Search sources, plus a
non-empty title and company. Missing facts remain null or empty, and salary is
shown only when present. The original structured provider record and bounded
verified source text are persisted for audit and future extraction improvements.
Provider candidates do not become visible until the quality lifecycle in D-017
succeeds.

### D-016: Search entitlement and provider usage are server-enforced

Status: Accepted

Evidence: `convex/jobSearchPolicy.ts`, `convex/jobSearchRuntimeConfig.ts`,
`convex/jobDiscovery.ts`, and the usage tables in `convex/schema.ts`.

All users default to `free`; active, unexpired server-side entitlements select
`pro` or `admin`. Free users have no provider-search path. Their discovery action
returns central-database results before loading provider configuration or a
search profile. Paid automatic searches remain behind the global kill switch and
daily run/query/concurrency limits.

Each unique normalized role-and-location query is atomically claimed once per
Israel calendar day across all users. A claim records its owning run so an older
failure cannot clear a newer claim. Failures release their own claim for retry.
Only one active run per user is allowed and stale reservations recover after ten
minutes.

The development-only entitlement switch and manual action require
`DEV_TOOLS_ENABLED=true`. Manual paid searches may be repeated and bypass the
automatic day claim and global run/query ceilings for testing. They still enforce
one active run and record usage. Free-mode refresh remains provider-free. The UI
does not expose cooldown or quota copy.

### D-017: Job visibility is precision-first and source-owned

Status: Accepted

Evidence: `convex/jobSourceVerification.ts`, `convex/jobQuality.ts`,
`convex/jobGeography.ts`, `convex/jobDiscovery.ts`, and the `jobs` and
`jobSources` tables.

A Web Search result is untrusted. The server pins a validated public DNS address,
uses strict time/body/redirect bounds, rejects private destinations, generic
pages, HTTP 404/410, closure markers, and pages that do not confirm the expected
role and company. HTML is reduced to bounded plain text for verification, stored
as raw source evidence, and never rendered. Only `verified_active` and bounded
`probably_active` canonical jobs are displayable.

Sources rank: employer careers page, employer ATS, established job board, then
aggregator. Consolidation uses domain/provider ID, canonical final/source URL,
and an indexed company/title/location key, with content and requirement guards.
URLs discard known tracking, referral, session, and fragment noise but preserve
unknown query identifiers. Company normalization removes only conservative legal
suffixes. Title normalization aligns casing, punctuation, hyphens, and a small
set of formatting variants while preserving seniority. Resolved GeoNames IDs
make Hebrew and English location labels equivalent. The lookup and insert share
one Convex transaction, so concurrent imports conflict and retry instead of
creating two canonical rows. `jobIngestionEvents` preserves every source payload,
content hash, provider key, timestamp, and merge reason. Embedding-based merging
remains deferred.

The central job row also stores the original provider JSON alongside extracted
fields. Hard exclusions cover target role, radius,
work arrangement, employment type, required experience, required language,
explicit monthly ILS salary conflict, and explicit foreign work authorization.
Location names resolve against a generated GeoNames Israel dataset only when one
locality is unambiguous. The job stores that locality's centroid and stable
GeoNames ID; Haversine distance then applies the user's radius without AI.
Unresolved, ambiguous, and foreign locations fail closed. This is city-level
precision, not a workplace-address promise. Internal scoring, semantic matching,
and embeddings are deliberately deferred until real result data can validate
their value.

### D-018: Daily discovery shares the bounded search pipeline

Status: Accepted

An hourly cron targets an internal mutation which scans completed profiles in
pages of five. It queues only paid profiles and records one attempt per Israel
calendar day. Free profiles are skipped before scheduling.
Internal Node workers process a page sequentially and schedule continuation;
profile failures do not abort the rest of the page. Completion schedules the
next eligible run through the hourly sweep. A plan with several unique target
roles generates one query per role, capped at five. Shared query claims prevent
another user from repeating that provider query on the same day. The kill switch,
global automatic limits, and provider accounting still apply.
Only internal helpers may accept scheduler-selected user IDs. The public manual
action derives identity and requires the server `DEV_TOOLS_ENABLED` flag, which
operators must enable only on development deployments.

### D-019: Application tracking stores an owner-scoped snapshot

Status: Accepted

“Sent résumé” creates one application per user/job and excludes it from that
user's suggestions. The server verifies an eligible owned match and snapshots
the posting; clients cannot supply posting contents or user identity. In progress
keeps the snapshot after source expiry. Undo removes only the caller's marker.
This records an application and never submits a résumé. Interview stages and
tracking pagination beyond the latest 100 applications remain future work.

### D-020: Job activity is cached, conservative, and historical

Status: Accepted

Evidence: `convex/jobActivityPolicy.ts`, `convex/jobActivity.ts`,
`convex/jobActivityActions.ts`, `convex/jobSourceVerification.ts`, and
`convex/crons.ts`.

Fresh verification is cached for three days. An hourly worker leases and checks
at most 20 due sources, and follows with another bounded batch when necessary.
Conclusive 404/410 responses, explicit English/Hebrew closure text, redirects to
a generic careers page, or a passed application deadline produce `closed` or
`expired` when all available sources support that conclusion. Direct generic
pages and missing role/company evidence remain inconclusive.

HTTP 403/429/5xx, timeouts, DNS failures, and transport errors do not close a
previously active source. They record the failed attempt, preserve the last good
state, and retry with exponential backoff from six hours to seven days. A source
observed within 14 days can be `probably_active` while awaiting recheck. A job
without conclusive recent evidence becomes `unknown`; after 45 days without a
provider observation it becomes `expired`. Unknown, closed, and expired jobs are
hidden from suggestions and retained in storage. Application snapshots remain
visible and are hydrated with an unavailable flag from the current canonical
job. Development-only authenticated diagnostics expose source count, canonical
ID, timestamps, activity, and merge/closure reasons.

### D-021: CV-derived data and user overrides produce one effective profile

Status: Accepted

Evidence: `convex/resumeProfileModel.ts`, `convex/resumes.ts`,
`convex/resumeActions.ts`, `src/features/profile/resume-onboarding.tsx`, and
`convex/jobDiscovery.ts`.

Store every CV as an owner-scoped version with its private file, extracted text,
validated structured result, confidence, and normalized summary fields. Keep a
separate compact CV career representation on the candidate profile. Discovery
reads the effective candidate fields; it never reparses the raw CV per job.

Manual profile saves record explicit override fields. Reprocessing replaces the
CV-derived representation and updates only effective fields without overrides.
Treat completed profiles created before this model as fully manual during their
first CV import. Missing location remains missing and blocks the final review;
other absent noncritical details do not force a long questionnaire. Calculate
employment duration and overlap, skill deduplication, and Israel location
resolution deterministically. OpenAI structures factual CV text and proposes at
most five career-consistent target roles.

### D-022: Materialize complete active-catalog matches incrementally

Status: Accepted

Evidence: `convex/jobMatching.ts`, `convex/jobDiscovery.ts`,
`convex/candidateProfiles.ts`, `convex/resumes.ts`, and
`convex/jobActivity.ts`.

Do not compute suggestions from a fixed newest-jobs window. Materialize only
eligible user/job pairs in `jobMatches`, keyed by the candidate profile's
`updatedAt` revision, and read the highest scores through a compound Convex
index. A profile change scans both active lifecycle partitions using chained
32-row cursor pages. A new, changed, reverified, or closed job takes the inverse
path and is evaluated against completed profiles in chained 12-row pages.
Application tracking removes the current match immediately; undo reevaluates
only that user/job pair.

This performs expensive matching outside the reactive feed query, never uses an
unbounded collect, and includes older jobs for as long as their lifecycle is
active. Negative pairs are deleted rather than materialized, limiting storage to
actual suggestions plus stale prior-revision positives. Reconciliation is
eventually consistent during its scheduled page chain. Existing environments
must invoke the internal `jobMatching:dispatchAllUsers` dispatcher once after
deployment; normal operation is mutation-driven and does not rescan every user
and every job on an hourly cron.

Shared provider-query identity uses the normalized role, Google Place ID, and
country code, never localized address text. Human-readable provider queries use
the canonical English GeoNames locality when resolvable. This lets Hebrew and
English profiles reuse the same underlying search claim while keeping provider
queries readable.

## URL-based workspace navigation

Status: Accepted

Use React Router browser history for page paths and query parameters for jobs
views: `/profile` and `/?tab=in-progress`. Keep transient form, pending, and
feedback state in React. Preserve the tab in the profile query for deterministic
Save/Cancel destinations across refreshes. The router mounts inside the profile
gate, after OAuth callback processing, so callback-code cleanup cannot leave
stale router search parameters. Static production hosting requires SPA fallback.

## Pending decisions

### P-003: Node.js version enforcement

Status: Pending

The README requires Node.js 22 or newer, but the repository does not enforce that requirement through an engine constraint or version-manager file.

### P-004: Deployment and release model

Status: Pending

The repository does not document production hosting, environments, release promotion, monitoring, or rollback policy.

### P-006: Browser session persistence policy

Status: Pending

Convex Auth currently uses its default browser storage, which persists session
and refresh tokens in `localStorage`. This supports refresh and browser-restart
persistence but places greater weight on XSS prevention. The product owner must
decide whether that tradeoff is acceptable before production launch.

### P-008: Semantic retrieval

Status: Pending

Query/job embeddings and exact workplace coordinates need separate cost and
quality decisions before implementation.
