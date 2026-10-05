# Technical decisions

This log contains decisions that can be verified from committed files. Unresolved choices are listed separately and are not treated as approved.

## Production readiness choices pending approval

- Legal operator identity and address have not been provided. The owner reports that the service is free and there is no registered business at present.
- Retention periods, backup purge windows, data export method, and full account deletion workflow are not decided. Legal drafts describe these limits instead of inventing commitments.
- The contact address is `info@jobmiter.com`; mailbox monitoring and response ownership remain unverified.
- PostHog is opt-in product analytics with a reviewed event allowlist and privacy-masked session replay; Convex remains the authoritative beta metric store. Sentry event content is reduced to error category and event ID. Production network verification remains pending.
- Legal drafts use version `2026-09-23-draft-2` and require Israeli counsel approval before launch.

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

The current-location action uses the browser Geolocation API, then reverse
geocodes the granted coordinates through Google's Geocoding library to select a
normalized city immediately. If reverse geocoding is unavailable, it falls back
to biasing and focusing the autocomplete search near those coordinates.

Onboarding presents one primary Google Place and a separate slider for 5–200 km
in 5 km increments, defaulting to 25 km. A selection also stores bounded
formatted address, city, administrative area, country/code, coordinates, and
radius for server-side search. Older profiles without this normalized contract
must reconfirm location before discovery; the server never silently broadens
their search to the whole country. The professional introduction and minimum
monthly salary are optional; an absent salary applies no matching floor.

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
The Responses API call uses medium-context Web Search, strict Zod-backed
Structured Outputs, an output-token limit, a tool-call limit, and no provider-side
response storage. The SDK retries retryable connection, timeout, rate-limit, and
server failures once with bounded backoff and allows 90 seconds per request;
permanent errors still fail immediately, and the existing scheduler remains the
outer retry boundary. Provider responses contain at most six concise candidates.
A response truncated by the output-token limit is retried once with at most
three candidates and lower-context Web Search. Each run stores bounded local
diagnostics: response status, incomplete/error details, parse status, output
text, and a raw response excerpt. A missing structured parse fails the run
instead of being coerced to an empty job array.

Application code creates one deterministic query for each unique target role,
capped at five. D-024 defines the current query composition and shared identity.
Candidate name, email, profile summary, and other identifying text are excluded.

An exact query fingerprint can be shared across users on the same Israel day
when the current user already has a visible materialized match. A completed
claim with no visible result does not suppress another provider search. Plan
and global enforcement are defined in D-016.

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

Each exact normalized query criterion set is atomically claimed across users.
In-flight and completed same-day claims are shared, including empty results. A claim records its owning run so an older failure cannot clear a
newer claim. Failures release their own claim for retry. Automatic discovery allows one role slot per Israel day, with no same-day scheduler retries. Only one active run per user is allowed and stale reservations recover
after ten minutes.

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
roles selects one role per Israel day in saved order and wraps after the last role. Shared query claims prevent
another user from repeating that provider query on the same day. The kill switch,
global automatic limits, and provider accounting still apply.
Only internal helpers may accept scheduler-selected user IDs. The public manual
action derives identity and requires the server `DEV_TOOLS_ENABLED` flag, which
operators must enable only on development deployments.

### D-019: Application tracking stores a snapshot and an owner-scoped event timeline

Status: Accepted

One `jobApplications` record per user/job represents both saved jobs and the
candidate's lightweight hiring pipeline. Immutable `jobApplicationEvents` rows
record each status change and standalone note with a timestamp; an optional note
on a status event keeps its context attached. Notes are trimmed and bounded to
3,000 characters, timeline reads are bounded to the latest 100 events, and every
operation derives the owner from Convex Auth. Every application has a required
status and update timestamp; every status change or note has a corresponding
event. No compatibility fallback exists for incomplete tracking rows—development
data is cleared when this model changes. Saved-only rows remain eligible in
Suggestions, but later application stages are excluded. The immutable posting
snapshot keeps tracking readable after source expiry. Job cards use one
Save/status picker plus an adjacent standalone comment action; status comments
are collected only after a new status is chosen. The newest timeline events are
embedded in the bounded feed result and rendered inline below Key skills,
avoiding a query per card. These actions record candidate activity and never
submit a résumé.

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

### D-033: Admin diagnosis is server-authorized, evidence-based, and read-only

Status: Accepted (2026-09-24)

Evidence: `convex/admin.ts`, `convex/dailyDiscovery.ts`, `convex/schema.ts`,
`src/app/admin/page.tsx`, and `src/features/admin/admin-dashboard.tsx`.

Store admin membership in a dedicated table keyed by the authenticated Convex
user rather than conflating operational authority with the job-search plan.
Every admin query and mutation rechecks membership at the data boundary. Daily
discovery records one durable per-user decision for the Israel calendar day so
queued, skipped, reused, completed, and failed work remains explainable after
the scheduler has moved on.

The console reads existing run, discovery, source, freshness, match, and profile
evidence instead of maintaining a parallel analytics truth. Bounded views may
report truncation and are operational diagnostics, not billing-grade totals.
The user/job inspector reconstructs the same activity, source, freshness,
profile-fit, history, and materialization gates used by the feed.

“View as user” is read-only and writes an audit event containing both the admin
actor and target user. Do not enable mutation-capable impersonation until every
account-changing function accepts server-derived actor/subject context and
writes an immutable audit record. Hidden client state or a client-supplied user
ID is not sufficient authorization.

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
is stored once per user/job and includes a match percentage, evidence-backed
requirement statuses, a recommended existing resume, truthful tailoring changes,
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
closed jobs and jobs that conflict with minimum required experience, required
location, professional field, salary, language, or work authorization never
receive a visible score. Explicit English/Hebrew ranges use their lower bound;
`X+` and stated minimums use `X`; unknown requirements remain eligible. A score
of 58 or higher is a strong match,
45–57 is a partial match, and a lower score is a possible match. These bands
describe ordering quality and do not hide a job that passed all hard activity,
freshness, experience, location, professional, and history rules. Seniority,
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

### D-029: OAuth completes on the first-party Next.js origin

Status: Accepted (2026-09-15)

Evidence: `src/proxy.ts`, `src/app/api/auth/[...path]/route.ts`,
`src/lib/auth-oauth-proxy.ts`, `src/app/layout.tsx`, and
`src/app/app-providers.tsx`.

Google sign-in is initiated through the Convex Auth Next.js adapter. The
provider-facing Google sign-in and callback paths are narrowly proxied by a
Next.js route handler to the Convex HTTP handler, while the final application
callback is exchanged by the Next.js auth middleware. The proxy keeps the PKCE
verifier secure and HTTP-only, and normalizes its cookie to first-party
`SameSite=Lax` without `Partitioned`. The Google flow is a top-level navigation,
so this avoids Safari CHIPS compatibility failures without weakening PKCE. Each
deployment must set `CUSTOM_AUTH_SITE_URL` to its exact frontend origin and
register `<origin>/api/auth/callback/google` with Google.

### D-030: Job activity history is independent from the current status

Status: Accepted (2026-09-16)

Evidence: `convex/schema.ts`, `convex/jobDiscovery.ts`,
`convex/jobMatching.ts`, and `convex/jobDiscovery.test.ts`.

A user-owned job activity record may exist without a current application
status. Standalone notes create timeline events without implicitly assigning
Saved, while the Saved view contains only records that currently have a
status. Removing a job from Saved clears only that current status and appends a
status-removal event; it does not delete the activity record, notes, earlier
status changes, snapshot, or application timestamps. A status-free record does
not hide an otherwise eligible job from Suggestions, so its retained timeline
can be shown again when the job is visible there.

### D-031: Job-match email follows automatic discovery

Status: Accepted (2026-09-23)

Evidence: `convex/jobDiscoveryActions.ts`, `convex/emailPreferences.ts`,
`convex/jobEmailActions.ts`, and `src/features/profile/email-preferences.tsx`.

The existing automatic discovery path schedules a Resend service notification
only when the current profile has visible matches. A newly completed profile
uses that same path. Frequency defaults to daily and can be changed to weekly or
never. Per-user delivery state and provider idempotency keys suppress duplicate
sends; email preferences remain separate from matching profile revisions.

Email links use the dedicated `PUBLIC_APP_URL`, not the authentication
`SITE_URL`. Local development intentionally permits `SITE_URL` to be
`http://localhost:3000`, but external messages must never inherit that origin.
The mail action validates `PUBLIC_APP_URL` as a pathless public HTTPS origin and
fails before calling Resend when it is local, private, or otherwise unsafe.

### D-032: Legal UX stays nonblocking and concise

Status: Accepted (2026-09-23)

Evidence: `src/features/dashboard/app-routes.tsx`,
`src/features/privacy/cookie-consent-manager.tsx`,
`src/features/privacy/privacy-notice.tsx`, and `convex/resumes.ts`.

Terms, privacy, cookies, accessibility, and contact information remain available
from the global footer. Sign-in presents compact terms and privacy links, while
the application and resume upload do not require a separate acceptance screen.
Optional analytics remains off until the visitor accepts it. The cookie choice
uses one compact banner for the initial decision and later changes from the
footer. Marketing consent is not shown because the product does not send
marketing messages.

### D-033: Admin Jobs preview is read-only projection, not impersonation

Status: Accepted (2026-09-25)

Evidence: `convex/admin.ts`, `convex/jobDiscovery.ts`,
`src/features/admin/admin-jobs-preview.tsx`, and
`src/features/dashboard/job-discovery-panel.tsx`.

An active administrator may open a selected user's Jobs screen through an
admin-only query. That query derives the administrator from the authenticated
session, then reads the selected user's profile, catalog selections, email
preference, plan, matches, applications, timeline, reviews, and discovery state
through the same helpers used by the user's own queries. It never replaces the
authenticated identity and performs no writes.

The preview renders the production Jobs shell and feed components. Suggestions,
In progress, client-side status filters, loading, empty, and error states remain
available, while profile editing, application tracking, review generation,
preference navigation, development tools, and account-menu actions are disabled
or omitted. External job-source links remain usable. Mutation-capable
impersonation remains out of scope.

### D-034: Beta analytics use Convex for truth and PostHog for exploration

Status: Accepted (2026-09-28)

Evidence: `convex/productAnalytics.ts`, `convex/emailDeliveryEvents.ts`,
`convex/admin.ts`, `src/features/privacy/analytics.ts`, and
`src/features/admin/admin-dashboard.tsx`.

Convex owns operational beta metrics: authenticated weekly active users,
last-seen and last-meaningful-action timestamps, a bounded allowlist of semantic
product events, saved-job/application aggregates, and verified Resend delivery
events. The admin console reads those records for reliable user-level support
and product decisions. Collection starts at deployment and does not invent
historical activity.

The beta decision view treats opening a job source, saving a job, changing an
application status, or requesting a deep review as a core value action. It
reports rolling seven-day core users and return rate, active days per core user,
and signup cohorts. Cohort activation means a first core action within seven
days of signup; early retention means another core action during days 8–14.
Active administrator accounts are excluded. A verdict remains `collecting`
until at least 10 signups have a complete activation window and at least 5
activated users have a complete retention window. The initial working signals
are promising at 40% activation and 25% early retention, mixed between that and
the weak boundary, and weak below 20% activation or 10% retention. These are
decision aids for the beta, not statistically universal product-market-fit
claims or a substitute for willingness-to-pay research.

PostHog remains optional and consent-gated. It receives page views, the same
reviewed semantic events, and an opaque Convex user ID for trend and funnel
exploration. Autocapture is disabled. Session replay masks all text, inputs, and
attributes; blocks media, canvases, and iframes; and excludes console logs,
performance data, query strings, and arbitrary properties. Resend open and click
events are displayed as directional signals because privacy scanners and mail
clients make them unsuitable as exact human engagement counts.

### D-035: Attribute OpenAI usage per provider response

Status: Accepted (2026-09-29)

Evidence: `convex/aiUsage.ts`, `convex/aiUsageModel.ts`, `convex/admin.ts`, and
`src/features/admin/admin-dashboard.tsx`.

The three app OpenAI workflows (job discovery, deep review, and CV analysis)
record token usage and web-search calls after each provider response. This
includes a search response discarded before a compact retry. Response IDs
deduplicate records without retaining prompts or CV text. The admin view groups
search responses by run and reads stored pre-ledger search totals separately.
Historical deep reviews and CV analyses have no token data.

USD values are estimates from model prices checked on 2026-09-29 and a web
search charge of $0.01 per call. Cached-token details improve new estimates;
older search totals lack that breakdown. Unknown models have no dollar
estimate. The dashboard does not replace OpenAI billing and does not include
other OpenAI projects, Codex, Convex, or hosting costs. A bounded daily query
marks its totals incomplete if it reaches the read cap.

## Job activity freshness (2026-09-09)

Reuse canonical lifecycle and per-source verification. A deterministic source check is strong positive evidence only when the same job has a future structured `validThrough`, a recent structured/page publication date, or a job-specific application action. HTTP 200 and matching title/company alone produce `unknown`. Strong evidence is active for 3 days, then probably active through day 14. After day 14, server-side display eligibility excludes the job regardless of cached lifecycle; unknown jobs are hidden. The background verifier derives expired after 45 days without discovery or successful active verification. Bare web-search rediscovery is not activity evidence. D-038 adds a bounded fallback only for explicit, grounded AI open evidence when server verification is inconclusive.

HTTP 404/410, expanded English/Hebrew closure text, an expired matching JobPosting `validThrough`, a changed job identifier, and a generic redirect without the expected role are closure evidence. Login/challenge pages and transient errors preserve prior strong status and back off retries without refreshing its evidence time. Query-ID canonical redirects remain eligible only when the returned job has strong activity evidence. Verification remains internal, hourly and incremental (20 sources per action, three concurrent requests), with no page-load URL checks. Source selection excludes weak and stale sources; one fresh strong source keeps the canonical job eligible. Saved/application snapshots remain intact with the existing localized unavailable indication. No matching weights change.

Development backfill progress is exposed through the bounded internal `jobActivity:getCatalogActivitySummary` query. It reports catalog lifecycle, verification attempts, queued work, alternative-source preservation, and remaining recent jobs without returning job records.

Activity provenance is stored in `jobs.activityReason`. Normal feed jobs require fresh server evidence or the bounded AI fallback in D-038. Development fixtures retain `development_fixture_active` and their sources use `development_fixture`; both markers exclude them from feeds, match materialization, deep reviews, and real-catalog diagnostics in every environment. Bare provider sightings without successful verification use `provider_recently_seen_unverified` and remain outside the normal feed. Records with no recoverable URL use `unverifiable_source` and remain outside the feed. Provider evidence URLs are retained as separate pending source records, with employer and ATS sources preferred after verification.

### D-036: Rotate one automatic role search per user per Israel day

Status: Accepted

To reduce provider spend, each eligible user receives at most one automatic role
slot per Israel calendar day. The cursor starts at the first saved role, advances
on each claimed daily slot, and wraps after the last searchable role. Reused,
empty, and failed slots advance too; missed days do not generate catch-up searches.
Role edits apply to the next day's slot; the cursor is reduced modulo the new
role count. Atomic role claims prevent duplicate workers from spending twice.
Completed shared queries are reused even when no visible jobs were produced.
Failures release the shared query claim for another user's own daily slot, but
do not grant the failing user another slot. Existing bounded provider request
retries and development-only manual searches remain separate from daily slots.

### D-037: Hebrew-first SEO and crawlable public rendering

Status: Accepted

The Israeli audience is the primary search audience. Public homepage titles,
descriptions and social previews use Hebrew, with Jobmiter included alongside
ג׳וב מיטר. Homepage WebSite structured data lists legitimate alternate brand
spellings without stuffing titles with every variant. Legal pages retain their
own language and canonical/social metadata; authenticated pages remain noindex.

Translation resources initialize synchronously in Hebrew for server rendering
and hydration. Auth boundaries restore a saved language after their route
hydrates; legal pages synchronize their explicit URL language. Avoid restoring
browser language from a root-provider effect, which can race streamed page
hydration. Language synchronization preserves route-specific document titles.

Google Search Console verification, sitemap submission and production indexing
remain release tasks; no ranking outcome is assumed. The social image renders
with a locally bundled OFL Hebrew font. Its Hebrew-only text requires visual
glyph ordering because the current Satori renderer does not apply Hebrew bidi.

### D-038: Combine AI listing assessment with deterministic verification

Status: Accepted

The existing discovery response includes an `aiAssessment` with open/closed/unknown,
evidence type, exact cited listing URL, and concise evidence text. No separate AI
status call is introduced. Server-open evidence wins over any AI assessment;
server-closed evidence prevents the AI fallback. Inconclusive server checks may
use explicit AI-open evidence for a job-specific application action or a posting
date within 30 days. Broken or unsafe URLs, generic destinations, identity
mismatches, absent evidence, and future/old dates do not qualify. An observed old
server date cannot be overridden by a claimed recent AI date.

AI-supported jobs are `probably_active` with `ai_open_server_unknown` provenance
and a separate three-day evidence timestamp. Server evidence retains its existing
three-day verified / 14-day grace windows. Display, match materialization, admin
preview, source selection, and background lifecycle refresh share this policy.
Server-confirmed sources rank ahead of AI-only sources. Inconclusive rechecks
preserve confirmed closures until a server check confirms reopening, so old AI evidence cannot revive them. A separate
eligible source can still keep the canonical vacancy visible. Passed application
deadlines and normal matching/freshness filters always apply. The README contains
the decision table; the feed labels probable jobs in both supported languages.

### D-039: Deep reviews are visual decision aids with evidence on demand

Status: Accepted

The matcher supplies the checklist (see D-040), and the deep-review model adds
bounded explanations to requirements with explicit
`met`, `gap`, or `unknown` status, importance, concise evidence, and an optional
next step. `gap` means a known shortfall; missing evidence produces `unknown`.
The old separate strengths/gaps format is removed rather than inferred into a
checklist in the client. Summary is bounded to 360 characters, each explanation
to 240, resume edits to four, and interview prompts to five. The existing explicit
review call and provider budget remain; the redesign adds no separate AI call.

Persist the IDs/names of the owned resume versions actually compared, highlighting
the recommended ID rather than matching filenames. Current job facts come from
the feed; AI review snapshots do not determine current availability. The UI uses
semantic success/warning/info/destructive tokens with icons and text, grouped
requirement disclosures, document cards, application route cards, and secondary
explanations on demand. Native disclosures preserve keyboard access. The review
header sticks below the app navigation; both collapse controls return focus to
the original button. Card clipping uses `overflow-clip`, which does not create a
scroll container that would break the sticky header. Motion respects reduced
motion, and the layout is verified in Hebrew RTL and English LTR on mobile.

The old development report cache is disposable and regenerated under the
pre-production data policy. Application snapshots and resume documents are not
cleared. Production rollout requires an explicit deployment decision and clearing
any incompatible cached reports first.

### D-040: Shared skill identities, factual eligibility, and bounded near-match fallback

Status: Accepted

Canonical bilingual skill keys replace fuzzy substring skill equivalence. The
curated alias index resolves onboarding entries; unfamiliar entries stay private
and preserve exact meaning. Existing extraction calls normalize conventional
names. No additional AI, embedding, or external decision API is used for matching.
Semantic resolution of arbitrary unknown synonyms remains a future measured
extension, not an asserted current capability.

Education facts distinguish completed/in-progress credentials and unknown/explicit
no-degree status. Optional profile editing preserves manual corrections through
CV changes. Changed fields alone become manual overrides. Dated role intervals
are overlap-safe and clipped to the present; absent dates yield unknown experience.

The matcher assigns met/gap/unknown to requirements. Confirmed mandatory education,
experience or language conflicts exclude jobs. Degree-or-experience alternatives,
student eligibility, preferred requirements, and specific field ambiguity are
handled conservatively. Known professional license/certification clauses require
explicit mandatory wording; unfamiliar credentials are not guessed. Unconfirmed
mandatory facts cannot produce a strong match. Related but distinct professions
and technologies do not qualify by generic words alone.

Strong matches precede partial matches. Five or more strong matches suppress
partials; fewer than five are topped up only with credible partials to at most
five. Feed, notifications and admin use a shared live indexed selector. There is
an existing 50-strong-result cap and a 500-row scan budget per quality partition;
background reconciliation cleans derived stale matches. Application history stays
independent of the suggestions policy.

Deep reviews use the same server score/status/importance. AI supplies a summary,
localized evidence and advice by check index, never a competing fit score or
status decision. Cached conclusions that differ from current matching are marked
stale without automatically generating a paid review. Before promoting scoring thresholds, evaluate owner-approved
real examples; current thresholds remain heuristics. Production rollout is not
implied by development verification.

### D-041: Authoritative education entries and a shared profile/onboarding editor

Status: Accepted; supersedes D-040's missing-education policy and collapsed editor.

The user-visible model is the education list, with explicit Studying/Completed
status for each entry. No separate completed-degree declaration, optional badge,
or disclosure section appears. An empty list is treated as no education; known
degree-level/field conflicts exclude mandatory-degree jobs. Unknown requirement
wording remains conservative. CV extraction still uses the existing provider call
and shows entries in the same onboarding step as experience and skills. An unclear
CV completion status requires a user choice before confirmation; it is not a third
visible status. The internal degree-status summary is derived from the list.

Education field aliases are resolved from both field and credential text.
מדמח/מדמ״ח/CS/Computer Science share a field identity; generic tech and unrelated
degrees are not equivalent. Explicit type and completion remain independent checks.
No additional AI or embedding call is made. Soft divided rows, standard bordered
inputs/dropdowns, shared radio-choice controls and compact remove buttons follow the language editor's
visual style, with responsive Hebrew/English layouts.

### D-042: One education name and a selected status by default

Status: Accepted; supersedes D-041's required manual completion selection.

The education editor has one name input alongside qualification type and status.
New entries and unspecified CV completion default to Completed. Known CV students
remain Studying. The visible name includes CV study-field information when the
credential alone is insufficient. Editing it clears the previous field metadata,
preventing hidden stale data from influencing matching. Education aliases still
resolve the single name; no additional AI call is made. Backend extraction may
retain uncertain evidence internally, but the review draft always submits a
selected Completed/Studying status.

### D-043: Fresh resume education during unfinished onboarding

Status: Accepted; refines education override preservation in D-042.

An activating resume upload starts a fresh education review until onboarding is
completed. Clear the earlier education override at upload time, so a later edit
made during extraction is still protected. Completed profiles retain confirmed
education across replacement and switching; inactive library uploads retain it
too. The first CV also activates when a manual draft exists without an active CV.
The onboarding form resets its draft only when the active CV/source version
changes, avoiding stale manual values without discarding edits on ordinary saves.
Support may explicitly restore cached education for an unfinished pending review
with a matching profile revision; no additional AI call or automatic backfill is
introduced.

### D-044: Database identities with bounded monthly vocabulary curation

Status: Accepted; supersedes the code-only education alias catalog in D-041.

Runtime matching uses database skill aliases and education/credential concepts.
Bootstrap code initializes those catalogs; repeated seeding preserves learned
aliases. The single qualification name becomes an accessible searchable combobox
with free-text/custom entry. Subject identity does not imply degree level or
completion. Unfamiliar terms are collected from effective profiles, CV facts and
compact job subjects, with one occurrence per user or canonical job. Popularity
only enables consideration; it never certifies equivalence.

A monthly internal cron processes at most 30 terms with at least 3 independent
sources in one AI request. No eligible terms means no paid call. The month is
claimed transactionally before calling the provider; retries are disabled, and a
failed or interrupted run cannot issue another request that month. No embeddings
or runtime AI matching are added. Only vocabulary/counts and bounded generic
catalog labels are sent, never raw CV text or source/user IDs. Runs record token
usage separately in the admin Catalog section.

Safe unambiguous proposals at confidence 0.98+ can be applied automatically;
uncertain suggestions go to authorized admin review. Confidence is a provider
assessment, not a guarantee of semantic correctness. Alias conflicts and
capacity errors roll back the whole proposal. Existing known identities cannot
be merged by an AI suggestion. Approved aliases affect existing private labels
without publishing private catalog items, and trigger ordinary match
reconciliation. Account deletion removes user-linked occurrences and decrements
counts. Mandatory degree level and completion checks remain independent.

### D-045: Editable experience areas with CV evidence kept separate

Status: Accepted.

Experience areas use `catalogItems.kind = experienceDomain` for bilingual public
suggestions and owner-private custom additions. The profile stores effective
labels in `experienceDomains`; before manual edits, the CV-derived domains
prefill the picker and drive matching. An explicit empty list is authoritative.
Manual selections survive replacement CVs and switching the active CV. CV
experience durations remain separate and cannot be inferred from selected
areas. Saving areas triggers ordinary deterministic match reconciliation, with
no new AI request. Monthly vocabulary curation does not yet include this catalog.

### D-046: Informational salary guesses in the existing deep review

Status: Accepted.

The existing deep-review response may include a nullable gross monthly base-pay
estimate in ILS for an Israeli job with unpublished salary. The prompt uses job
requirements and context, not the candidate's desired salary, and permits null
when context or working hours are insufficient. Published pay takes precedence;
inverted estimates are discarded. The UI explicitly labels guesses, shows their
short basis, and keeps unknowns visible. Estimates live on `jobDeepReviews`, not
the employer salary fields. They do not affect matching or filtering. No extra
AI request or salary-specific web search is introduced; existing cached reviews
can gain an estimate on ordinary refresh. A reusable salary table and reliable
estimate-based filtering remain deferred.

Salary bands use a common ₪10,000–₪50,000 visual scale only for monthly ILS
ranges contained within it. Other bounded ranges use a local scale padded by
30% of their width on each side (with a minimum padding for narrow/exact pay).
The scale is visual context, not a filter or market benchmark. Only actual band
values are printed; one-sided salaries remain textual.

### D-047: User-initiated landing video with minimal custom controls

Status: Accepted.

The landing marketing film uses the supplied Cloudflare R2 MP4s, choosing mobile
or desktop at the 768px breakpoint only when the visitor requests playback.
The source remains selected during playback so resizing does not restart the
film. Local responsive WebP posters keep the initial page light; no MP4 source
or autoplay attribute is present before activation. A branded, keyboard-accessible
play cover opens custom play/pause, mute, desktop volume, and fullscreen controls,
with loading, retry, and replay states. Progress is displayed without seeking.
Two compact glass surfaces surround the controls, leaving the middle transparent.
The audio controls retain left-to-right ordering in both page directions.
Controls fade during playback and stay available to keyboard users. Element
fullscreen includes the custom controls; unsupported browsers use a full-window
view with Escape and contained keyboard focus, preserving the selected source.
The supplied films include burned-in Hebrew captions; the invitation and player
labels are localized in English and Hebrew. The site CSP permits the specific
R2 media origin. No video player dependency or backend change is required.

### D-048: Quiet local interface sounds with persistent mute

Status: Accepted.

Use `uisfx` 0.4's minimal pack with master volume 0.35, two concurrent voices,
and an 85ms interaction cooldown. A single client provider delegates trusted
click activations to semantic cues, covering pointer and keyboard input without
per-component plumbing. Range inputs use the brief `snap` cue on trusted value changes, at most once
per 120ms; this includes travel-distance adjustments with pointer, touch, or
keyboard input. No hover, typing, loading loops, or outcome sounds are added. A click never claims that an asynchronous operation succeeded.

Keep video controls silent and suppress effects while audible media is playing.
Public/auth headers and the signed-in user menu expose localized mute controls.
Sound defaults on after a deliberate interaction; the browser-local preference
synchronizes across tabs and survives reloads. Muting stops active effects and
prevents pending unlocks from playing. Storage and audio failures cannot block
normal interactions. Web Audio is created lazily by the package, with locally
synthesized cues and no remote audio requests. The code is MIT and audio is CC0.

### D-049: Two bounded onboarding reminders scheduled from account creation

Status: Accepted.

Enroll new Google signups through Convex Auth's after-user-created callback,
only when no existing account was linked. Persist two indexed reminder records
and scheduled action IDs, due at 24 and 72 hours from the user creation time.
Subsequent sign-ins do not reset the sequence. An explicitly authorized rollout
enrolls existing incomplete accounts in bounded, idempotent pages, excluding
deleting accounts and email opt-outs. Accounts older than 72 hours receive only
the final reminder; those aged 24–72 hours receive one first reminder plus the
original future final date. Overdue sends are staggered two seconds apart to
avoid a provider burst. Every completion path and account deletion cancels pending jobs in
the same mutation; the send claim independently checks current eligibility.

Reuse the existing Resend SDK and delivery/webhook tables. Freeze delivery
identity and language at the first attempt. A ten-minute scheduled watchdog
recovers network failures and interrupted actions with a stable per-reminder
idempotency key, at most five attempts within twelve hours. Permanent failures
stop the watchdog. Cancellation cannot recall a request already handed to the
provider; late acknowledgements during deletion must not recreate email records.

One prominent CTA resumes setup at the authenticated homepage. English/Hebrew
copy comes from locale resources and the user's interface language is synced
server-side, with Hebrew as the signup default. Random 256-bit bearer tokens
authorize setup-reminder opt-out without requiring sign-in; GET only confirms,
POST cancels both remaining reminders. This is separate from job email frequency,
though never-email users are excluded. No promotional offers or repeated follow-ups
beyond the second reminder are included.

`ONBOARDING_REMINDERS_ENABLED=true` activates sends per deployment. Keep it unset
in development verification. Production `famous-badger-815` was deployed and
enabled on 2026-10-05, including the owner's authorized historical enrollment.
Provider acceptance, webhook delivery and actual inbox placement are distinct
verification steps; no actual email is sent during tests.
