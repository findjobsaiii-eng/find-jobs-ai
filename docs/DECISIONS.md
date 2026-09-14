# Technical decisions

This log contains decisions that can be verified from committed files. Unresolved choices are listed separately and are not treated as approved.

## Verified decisions

### D-001: Next.js App Router, React, TypeScript, and Convex form the application stack

Status: Accepted

Evidence: `package.json`, `next.config.ts`, `src/app/`, and `convex/`.

The frontend uses Next.js App Router with React and TypeScript. Convex provides the backend, authentication session, reactive data, and generated client API. Vitest still uses Vite internally as its supported test transform; Vite is no longer the application server, router, or production bundler.

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

### D-006: Local validation uses TypeScript, Next.js ESLint, Prettier, Vitest, and the Next production build

Status: Accepted

Evidence: scripts in `package.json`.

`npm run check` is the normal static-quality gate. `npm test` covers focused behavior, and `npm run build` is also required before handing off substantial frontend work.

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
exposed through `NEXT_PUBLIC_` variables, client code, logs, or repository
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
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. The value is necessarily public in the browser and
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
and sign-out. New users may upload a CV or continue manually, then review the
same detailed four-step form with extracted values prefilled and editable before
job discovery begins. The owner-scoped save mutation persists progress and later
corrections. Temporary search filters, completion cards, placeholder tools, and
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
capped at five. D-024 defines the current query composition and shared identity.
Candidate name, email, profile summary, and other identifying text are excluded.

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

During the beta/pilot, users without an explicit entitlement resolve to `pro`.
An active, unexpired server-side entitlement overrides that pilot default, so
development tools can still force `free` and test both experiences. Free users
have no provider-search path. Their discovery action
returns central-database results before loading provider configuration or a
search profile. Paid automatic searches remain behind the global kill switch and
daily run/query/concurrency limits.

Each exact normalized query criterion set is atomically claimed once per
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
precision, not a workplace-address promise. Semantic matching and embeddings
remain deferred until real result data can validate their value. Deterministic
internal scoring was added later and is governed by D-022.

### D-018: Daily discovery shares the bounded search pipeline

Status: Accepted

An hourly cron targets an internal mutation which scans completed profiles in
pages of five. D-024 defines the Israel-time cohort schedule. It queues only
paid profiles and records one attempt per Israel calendar day. Free profiles are
skipped before scheduling.
Internal Node workers process a page sequentially and schedule continuation;
profile failures do not abort the rest of the page. A plan with several unique target
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

Shared provider-query identity follows D-024. Canonical GeoNames locality labels
keep Hebrew and English profiles on the same city-scoped search criteria.

## Pending decisions

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

### D-023: Resume upload seeds the profile; the saved profile drives matching

Status: Accepted

Evidence: `convex/resumes.ts`, `convex/schema.ts`, `src/features/profile/resume-library.tsx`, and `src/features/dashboard/authenticated-shell.tsx`.

A candidate may keep several independently parsed resumes, each with its own private storage object, extracted career data, display label, and optional organizational note. Resume upload is an onboarding input: extraction seeds the candidate profile, and the saved candidate profile—not a selected resume—is the source used for job discovery and matching. The resume library therefore does not expose an active badge, a “use for matching” action, or replacement behavior that implies the profile continuously follows a file. Deleting the resume that originally seeded a profile removes the file and its private extraction record without clearing or replacing the saved profile data.

`candidateProfiles.activeResumeId` remains internal lineage for the onboarding source and older stored records. It must not be presented as a user-selectable matching source. Additional uploads are stored as documents and do not change the completed profile.

The first resume remains mandatory for CV-first onboarding. Resume-library controls appear only after a candidate has a completed profile.

### D-024: Curated role aliases and radius-aware daily discovery

Status: Accepted

Evidence: `convex/referenceCatalogData.ts`, `convex/referenceData.ts`,
`convex/jobDiscoveryModel.ts`, `convex/dailyDiscovery.ts`, and `convex/crons.ts`.

Persist aliases on curated job-title catalog rows and include the canonical
English label, canonical Hebrew label, and aliases in provider discovery.
User-created private titles keep an empty alias list, since
unreviewed personal terms must not alter shared catalog semantics. One query per
target role combines at most six title variants, at most five non-generic skills
from the effective profile, and one geographic alternative group. Radii through
25 km use canonical GeoNames city labels, radii through 75 km use the Israeli
district, and larger radii use Israel. Candidate identity and free text remain
excluded. The normalized role, aliases, skills, scope, radius band, and country
form the shared daily fingerprint.

Split eligible paid users deterministically into ten stable cohorts. The hourly
cron processes cohort 0 at 08:00 Israel time through cohort 9 at 17:00, using
Israel time-zone conversion so daylight-saving changes do not shift the product
schedule. Completing a paid profile, activating a parsed resume, or switching a
development account to paid queues an immediate attempt when no attempt exists
for that Israel calendar day. The same daily-attempt record prevents the
immediate path and cohort path from duplicating work. Free users remain excluded
from every provider-search scheduler.

### D-025: Deep job reviews are explicit, private, and evidence-backed

Status: Accepted

Evidence: `convex/jobReviewActions.ts`, `convex/jobReviews.ts`,
`convex/schema.ts`, and `src/features/dashboard/job-deep-review.tsx`.

Deep review is an explicit Pro/admin action, never part of background matching.
Before calling the model, the action reverifies the current best source and
updates the shared job lifecycle. It sends the effective candidate profile and
a bounded set of owned, ready resume text to the server-side model. The result
is stored once per user/job and includes a match percentage, factual strengths,
requirement gaps, a recommended existing resume, truthful tailoring changes,
application guidance, and interview topics. A request ID prevents stale or
concurrent calls from overwriting a newer review.

Employer and direct-application URLs are persisted only when they are the
verified current source or appear in the model's Web Search evidence. Reviews
are private to their owner, survive reloads, and are marked stale when the
profile revision or job content changes. Free users may retain read access to a
previously generated review but cannot generate or refresh one.

### D-026: Match bands expose the deterministic ranking score

Status: Accepted

Evidence: `convex/jobQuality.ts`, `convex/jobDiscovery.ts`, and
`src/features/dashboard/job-match-score.tsx`.

The score shown on suggestion cards is the same deterministic 100-point score
used to order the feed. It is presented as points out of 100 rather than a
probability. Its components are role (35), skills and
platforms (25), professional domain (15), experience requirements (10),
seniority (7), location (5), and work preferences (3). The accessible
hover/focus explanation shows earned points and profile evidence without
inventing negative deductions. Hard eligibility rules run before ranking, so
closed jobs and jobs that conflict with required location, professional field,
salary, language, or work authorization never receive a visible score. A score
of 58 or higher is a strong match,
45–57 is a partial match, and a lower score is a possible match. These bands
describe ordering quality and do not hide a job that passed all hard activity,
freshness, location, professional, and history rules. Experience, seniority,
employment type, and work-arrangement gaps lower the score but remain visible
as stretch opportunities instead of acting as hard exclusions. Historical
application snapshots keep the band optional so existing saved records remain
readable.

### D-027: Job views live in the header and profile topics use App Router paths

Status: Accepted

Evidence: `src/app/page.tsx`, `src/app/(app)/profile/`,
`src/features/dashboard/authenticated-shell.tsx`, and
`src/features/profile/profile-overview.tsx`.

The authenticated header presents the two primary job views, Suggestions and
Saved, as direct links to `/` and `/?tab=in-progress`. The previous In progress
data remains intact and is presented as saved jobs in the interface. Profile,
language, and sign-out actions live in one accessible account popover anchored
to the candidate avatar; the display name is hidden below the desktop
breakpoint.

The profile route presents one topic at a time. Professional details use
`/profile`; preferences, languages, and resumes use nested paths beneath it so a
refresh, direct link, or browser history entry preserves context. Editable
sections open directly with their own Save and Cancel controls. The section
navigation becomes a horizontally scrollable control on narrow screens, and
unsaved edits require confirmation before changing sections.

### D-028: Public and authenticated experiences have separate App Router layouts

Status: Accepted (2026-09-09)

Evidence: `src/app/layout.tsx`, `src/app/page.tsx`,
`src/app/(app)/layout.tsx`, and `src/features/dashboard/app-routes.tsx`.

The root layout contains only global providers and metadata. `/` chooses between
the standalone landing page and the authenticated job workspace after the
Convex Auth session resolves, preventing a signed-out landing-page flash for
returning users. Protected routes share the `(app)` layout and show a sign-in
prompt in place when signed out, without replacing the requested URL. Google
OAuth receives a sanitized copy of the complete current URL as its return
destination, so successful authentication reveals the originally requested
route. Convex ownership checks remain mandatory because a client layout is a UX
boundary, not an authorization boundary.

## Job activity freshness (2026-09-09)

Reuse canonical lifecycle and per-source verification. A deterministic source check is strong positive evidence only when the same job has a future structured `validThrough`, a recent structured/page publication date, or a job-specific application action. HTTP 200 and matching title/company alone produce `unknown`. Strong evidence is active for 3 days, then probably active through day 14. After day 14, server-side display eligibility excludes the job regardless of cached lifecycle; unknown jobs are hidden. The background verifier derives expired after 45 days without discovery or successful active verification. Web-search rediscovery is not authoritative activity evidence; it updates sightings and schedules verification but cannot reopen a source by itself.

HTTP 404/410, expanded English/Hebrew closure text, an expired matching JobPosting `validThrough`, a changed job identifier, and a generic redirect without the expected role are closure evidence. Login/challenge pages and transient errors preserve prior strong status and back off retries without refreshing its evidence time. Query-ID canonical redirects remain eligible only when the returned job has strong activity evidence. Verification remains internal, hourly and incremental (20 sources per action, three concurrent requests), with no page-load URL checks. Source selection excludes weak and stale sources; one fresh strong source keeps the canonical job eligible. Saved/application snapshots remain intact with the existing localized unavailable indication. No matching weights change.

Development backfill progress is exposed through the bounded internal `jobActivity:getCatalogActivitySummary` query. It reports catalog lifecycle, verification attempts, queued work, alternative-source preservation, and remaining recent jobs without returning job records.

Activity provenance is stored in `jobs.activityReason`. Normal feed jobs require a fresh successful source verification (`http_verified`, `structured_jobposting_valid`, or `alternative_source_active`). Development fixtures retain `development_fixture_active` and their sources use `development_fixture`; both markers exclude them from feeds, match materialization, deep reviews, and real-catalog diagnostics in every environment. Provider sightings without successful verification use `provider_recently_seen_unverified` and remain outside the normal feed. Records with no recoverable URL use `unverifiable_source` and remain outside the feed. Provider evidence URLs are retained as separate pending source records, with employer and ATS sources preferred after verification.
