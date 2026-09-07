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

### D-014: Dashboard editing reuses onboarding and search filters are temporary

Status: Accepted

Evidence: `src/features/dashboard/`, `src/features/profile/profile-gate.tsx`,
and the editing mode in `src/features/profile/onboarding-screen.tsx`.

The existing authenticated profile boundary selects onboarding or the dashboard.
Profile editing is a dedicated in-app screen, using the existing four form steps,
draft conversion, validation, and `candidateProfiles.saveCurrent` mutation. Save
uses `complete: true`; the server retains the original completion timestamp and
derives Google identity. Cancel discards local changes. No router dependency,
second profile model, or backend mutation is introduced.

Dashboard filters are local to the current visit and start from the saved profile.
Only an explicit save-preferences action writes the editable search preferences;
query text remains temporary. Profile completion weights the eleven existing
field groups equally and uses their validation, rather than estimating job-match
quality. Unavailable tools remain visibly pending until implemented.

### D-015: Job discovery uses bounded Responses API Web Search with strict output

Status: Accepted

Evidence: `convex/jobDiscoveryActions.ts`, `convex/openAIJobProvider.ts`,
`convex/jobDiscoveryModel.ts`, `convex/jobDiscovery.ts`, and `convex/schema.ts`.

Manual job discovery runs only in an authenticated Convex server action using
the official OpenAI JavaScript SDK. The model is required server configuration
under `OPENAI_JOB_SEARCH_MODEL`; `gpt-5.6-luna` is the initial cost-conscious
recommendation because current official documentation lists Web Search support.
The Responses API call uses the Web Search tool, strict Zod-backed Structured
Outputs, an output-token limit, a tool-call limit, no response storage, and no
automatic SDK retries.

Application code creates at most two deterministic queries from role, skill,
experience band, work arrangement, employment type, language, and normalized
city/region/country criteria. Candidate name, email, profile summary, and other
identifying text are excluded.

Successful exact criteria fingerprints are shared for 24 hours. A reused run
creates user-owned discovery relations without another provider call. Plan and
global enforcement are defined in D-016.

Every provider record is validated again server-side. A posting must have a
public HTTP(S) source URL that occurs in returned Web Search sources, plus a
non-empty title and company. Missing facts remain null or empty, and salary is
shown only when present. Raw prompts and raw provider responses are not
persisted. Provider candidates do not become visible until the quality lifecycle
in D-017 succeeds.

### D-016: Search entitlement and provider usage are server-enforced

Status: Accepted

Evidence: `convex/jobSearchPolicy.ts`, `convex/jobSearchRuntimeConfig.ts`,
`convex/jobDiscovery.ts`, and the usage tables in `convex/schema.ts`.

All users default to `free`; only trusted server-side entitlement records can
select `pro` or `admin`. No public function accepts or mutates plan, quota, role,
usage, reset time, or overrides. Policies are centralized:

- Free: one initial/fresh search per rolling seven days, one query, five accepted jobs.
- Pro: one fresh search per rolling 24 hours, up to two queries and ten accepted jobs.
- Admin: one fresh search per hour, up to two queries and ten accepted jobs. It is a controlled test role, not unlimited access.

Exact 24-hour cache reuse and a sufficient set of eligible central jobs are
checked before fresh quota. Reuse creates a zero-provider usage entry. A fresh
run reserves the per-user window and global daily run/query/concurrency counters
inside one Convex mutation, using an identity-and-intent idempotency key. Only one
active run per user is allowed and stale reservations recover after ten minutes.
The server reports when reusable inventory is available so the dashboard can
keep that zero-provider path usable even when fresh quota is exhausted or the
fresh-search kill switch is off.

`JOB_SEARCH_ENABLED=false` immediately blocks fresh calls. Required global run,
query, concurrency, and output-token limits fail closed when missing or invalid.
SDK retries remain disabled. A failed run consumes quota only after
`providerRequestStarted` is recorded, because provider work may then be billable;
failures before that point release the reservation and global counts.

### D-017: Job visibility is precision-first and source-owned

Status: Accepted

Evidence: `convex/jobSourceVerification.ts`, `convex/jobQuality.ts`,
`convex/jobDiscovery.ts`, and the `jobs`, `jobSources`, and `jobMatches` tables.

A Web Search result is untrusted. The server pins a validated public DNS address,
uses strict time/body/redirect bounds, rejects private destinations, generic
pages, HTTP 404/410, closure markers, and pages that do not confirm the expected
role and company. HTML is reduced to bounded plain text for verification and is
never rendered or stored. Only `verified_active` canonical jobs with a currently
verified source are displayable; verification expires after seven days.

Sources rank: employer careers page, employer ATS, established job board, then
aggregator. Consolidation uses normalized final URL, source external ID,
normalized source URL, company/title/location fingerprint, and exact content
hash, with requirement and conflicting-external-ID safeguards. Embedding-based
merging is deferred until its extra provider cost and measured quality benefit
justify a separately metered model.

Hard exclusions cover target role, conservative city/region compatibility,
work arrangement, employment type, required experience, required language,
explicit monthly ILS salary conflict, and explicit foreign work authorization.
Survivors receive a deterministic 0–100 score: role 25%, required skills 20%,
preferred skills 10%, experience 10%, location 15%, work arrangement 5%,
employment type 5%, language 5%, education 2%, and bounded normalized-token
similarity 3%. The display threshold is 70. The score is explainable application
logic, not an LLM-invented percentage.

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

### P-008: Job freshness, scheduling, and semantic retrieval

Status: Pending

This slice intentionally uses manual searches, 24-hour exact-query reuse,
seven-day source visibility, and deterministic URL/text/quality logic. Scheduled
searches, periodic revalidation, query/job embeddings, and exact geospatial job
coordinates need separate cost and quality decisions before implementation.
