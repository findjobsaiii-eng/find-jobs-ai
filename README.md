# JOBMITER

JOBMITER is an AI-powered job-search assistant with a bilingual UI, Google OAuth through Convex Auth, CV-first career-profile creation, daily server-side job discovery, deterministic job quality checks, and candidate-first application tracking. The production site is [jobmiter.com](https://jobmiter.com). Resume writing, automatic applications, and Gmail integration have not been implemented.

## Stack

- Next.js 16 App Router, React 19, and TypeScript
- Convex
- Tailwind CSS v4 and shadcn/Base UI primitives
- Motion for transitions and micro-interactions
- i18next and react-i18next for English/Hebrew localization

## Getting started

Requirements: Node.js 22+ and npm.

```sh
npm install
npm run dev
```

The Convex setup creates the local environment configuration used by `NEXT_PUBLIC_CONVEX_URL`. Do not commit local environment files.

## Analytics

PostHog captures anonymous page views only after the visitor accepts optional
analytics in the cookie banner. It captures client-side navigation when
`NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` are set in the
ignored `.env.local` file. Set the same variables in the Next.js hosting
environment for deployment. Restart or rebuild Next.js after changing them.
Automatic interaction capture and session recording are disabled because the app
handles candidate profiles and resumes. Custom events and user identification
should be added only for specific product questions with a reviewed data policy.
Visitors can reject optional analytics or change their choice from the footer.
The PostHog client is loaded lazily after opt-in and uses memory-only persistence.

## Error monitoring

Sentry captures browser and Next.js server errors when `NEXT_PUBLIC_SENTRY_DSN`
is configured. Error events are scrubbed before sending: user, request,
breadcrumbs, arbitrary messages and extras are removed. It does not collect
session replays or performance traces. The
temporary `/sentry-test` page has a button that throws and reports one controlled
error, then displays its event ID for lookup in Sentry. Remove that route after
verifying deployment.

## Launch documents and consent

Draft bilingual terms, privacy, cookie, accessibility and contact pages have
stable `/he/...` and `/en/...` URLs. Their version is `2026-09-22-draft-1`.
Authentication leads to a terms/privacy acceptance gate; Convex records its
version, server timestamp and separate optional marketing preference. CV upload
is blocked on the server until that acceptance is stored. The owner supplied
`info@jobmiter.com` for requests. The drafts require review by an Israeli
lawyer, and the remaining owner decisions are in
[`docs/LAUNCH_OWNER_CHECKLIST.md`](docs/LAUNCH_OWNER_CHECKLIST.md).

Users can delete individual resumes or start account deletion in their profile.
The account job removes user-linked Convex records, uploaded files and auth
records in batches. Shared job records, vendor logs and backups need a separate
approved retention/deletion process; this operation does not erase them.
Signed CV upload URLs are limited to 10 per account per rolling hour. The
backend also checks accepted terms, file size and type and refuses reuse of a
stored file ID.

`/api/health` returns 200 only when the web deployment can query Convex; it
returns 503 when the backend is unavailable or not configured. It does not
check Google OAuth, OpenAI, PostHog or Sentry delivery.

For Vercel, configure `NEXT_PUBLIC_SENTRY_DSN` for each environment where events
should be captured. Set `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` in
Vercel for production source-map uploads. These four variables are sufficient;
no additional Sentry variable is required. The auth token is used only during
the Vercel build and must never use a `NEXT_PUBLIC_` prefix. Local builds skip
source-map upload. Source-map upload uses Vercel's automatically exposed
`VERCEL=1` system variable; enable system environment variables in Vercel if
they were disabled for the project.

Current implementation status, known gaps, and the recommended next milestone are tracked in [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md). Durable technical choices and pending decisions are recorded in [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Commands

```sh
npm run dev          # Start Convex and Next.js together
npm run dev:web      # Start only the Next.js development server
npm run typecheck    # Check TypeScript
npm run lint         # Run ESLint, including accessibility rules
npm run format       # Format supported files
npm run format:check # Verify formatting without changing files
npm test             # Run the focused Vitest suite once
npm run test:watch   # Run Vitest in watch mode
npm run check        # Run typecheck, lint, and format checks
npm run build        # Typecheck and create a production Next.js build
npm start            # Serve the completed production build
npm run catalog:seed # Idempotently seed curated job titles and skills
```

## Project structure

```text
src/
  app/           App Router pages, route groups, layouts, and providers
  components/ui/ Reusable, accessible UI primitives
  features/      Product features, grouped by domain as they are built
  i18n/          i18next configuration and locale resources
  lib/           Small shared utilities
convex/          Schema and server functions
```

Do not create empty architecture for hypothetical features. Add a `src/features/<feature>` folder when that feature begins, and keep its components, hooks, and supporting logic together until something is genuinely shared.

## Localization and direction

English (`en`) and Hebrew (`he`) are first-class languages. User-facing text belongs in `src/i18n/locales/*.json`; components use translation keys. The i18n setup synchronizes the document's `lang` and `dir` attributes and remembers the selected language.

Use logical direction utilities such as `text-start`, `ps-*`, `pe-*`, `ms-*`, and `me-*`. Avoid `left`/`right` positioning unless the direction is intentionally physical. Check every new screen in both languages.

## UI foundation

Theme values are semantic CSS variables in `src/app/globals.css`. Reusable primitives live in `src/components/ui`; prefer extending them over repeating interaction and accessibility behavior. Motion is configured globally to respect the user's reduced-motion setting.

The screenshots supplied during setup are product-direction references, not a specification. The visual system should stay clean, responsive, calm, and content-led as real workflows are designed.

## Authentication

Authentication uses Convex Auth with Google OAuth. The Convex deployment needs
`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `JWT_PRIVATE_KEY`, `JWKS`, and
`SITE_URL`. It also needs `CUSTOM_AUTH_SITE_URL` set to the exact frontend origin
so OAuth is completed through the first-party Next.js auth proxy. For local
development, set both URL values to `http://localhost:3000`.
Only the variable names belong in documentation and source control; their values
must remain in the Convex deployment environment.

The Google OAuth client must allow this callback URL:

```text
https://jobmiter.com/api/auth/callback/google
```

Use the matching frontend origin for each isolated development or preview OAuth
client. Deployment-specific URLs and credential values are intentionally not
stored in repository documentation.

The browser receives only the public `NEXT_PUBLIC_CONVEX_URL`. OAuth credentials are
read by Convex server code and are never passed through a `NEXT_PUBLIC_` variable.
The Next.js auth proxy exchanges the one-time OAuth callback code server-side,
removes it from the address bar, and stores the verifier/session in first-party
`HttpOnly` cookies. The client presents a recoverable callback-error state and
delegates session storage and invalidation to Convex Auth.

The provider-facing `/api/auth/signin/*` and `/api/auth/callback/*` requests are
reverse-proxied to the deployment's Convex HTTP Actions origin. Standard
`*.convex.cloud` URLs are mapped to `*.convex.site`; custom or self-hosted
deployments must also define `NEXT_PUBLIC_CONVEX_SITE_URL` in Next.js.

Exact manual Google OAuth smoke-test steps and the latest external configuration
status are recorded in [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md).

### Google Places location search

Candidate location search uses Google's new Place Autocomplete widget. Put the
public browser key in the ignored `.env.local` file and restart Next.js after any
change:

```text
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-browser-key
```

In the Google Cloud project, enable billing, **Maps JavaScript API**,
**Places API (New)**, and **Geocoding API**. Restrict the key to websites, including
`http://localhost:3000/*` for local development and the exact production origin
before deployment. Also apply API restrictions for those three APIs. A `NEXT_PUBLIC_`
key is intentionally visible to the browser, so HTTP-referrer and API
restrictions are the security boundary; never reuse a server-side secret here.

## Convex

Before editing Convex code, read `convex/_generated/ai/guidelines.md`. Managed Convex agent skills are installed under `.agents/skills/`. Keep queries bounded and indexed, validate public inputs and outputs, derive authenticated identity server-side, and keep privileged functions internal.

### Candidate profiles

After Google sign-in, users without an effective profile see one primary action: upload a PDF or DOCX CV. Convex Storage keeps the original private file; a Node action extracts the actual document text with PDF.js or Mammoth and then asks OpenAI for a server-validated structured career profile. The UI holds the analysis state for at least five seconds before showing a compact roles, strengths, seniority, experience, and location review. “Find jobs for me” accepts that summary and opens the personalized feed. The full four-step form remains available for later manual editing.

Candidate ownership and Google identity fields are derived exclusively in Convex. The client never sends a user ID, email, Google display name, or profile image. All profile reads and writes reject unauthenticated callers and query the indexed profile belonging to the server-derived auth user.

Editable profile data is normalized and bounded on the server:

| Field                        | Stored limits                                                        |
| ---------------------------- | -------------------------------------------------------------------- |
| Preferred display name       | 2–80 characters to complete                                          |
| Target job titles            | 1–5 validated catalog references                                     |
| Professional summary         | Optional, up to 1,200 characters                                     |
| Years of experience          | Whole number from 0–60                                               |
| Skills                       | 1–30 validated catalog references                                    |
| Preferred location           | One Google Place with normalized city/region/country and coordinates |
| Location radius              | 5–200 km in 5 km increments                                          |
| Work arrangements            | One or more of onsite, hybrid, and remote                            |
| Employment types             | One or more of full-time, part-time, and contract                    |
| Minimum monthly gross salary | Optional whole ILS amount from 1,000–200,000                         |
| Languages                    | 1–10 unique supported languages, each with a proficiency selection   |

CV versions are stored in the owner-indexed `resumeDocuments` table. Raw text and the complete structured extraction remain server-only; clients receive only the concise review projection. `candidateProfiles.cvCareerProfile` keeps the normalized matching representation while the ordinary profile fields are the effective values used by discovery. Manual saves record field-level overrides. A replacement CV updates the CV-derived layer and recalculates unmodified effective fields, while intentional changes to roles, skills, location, seniority, work preferences, salary, languages, experience, and summary remain in place. Existing pre-CV completed profiles are treated as manually chosen, so their values are preserved on first import.

### Onboarding options

Job titles and skills use a searchable bilingual catalog. If a value is missing,
an authenticated user can add a normalized custom value that is visible only to
that user. Private custom values are capped, URLs and control characters are
rejected, and exact duplicates are reused. This keeps the MVP useful without
publishing unreviewed input or creating a manual moderation queue.

The onboarding UI searches Google Places for one primary Israeli city or region,
then asks for a search radius. A selected result stores its Place ID, formatted
address, city, administrative area, country/code, coordinates, and radius. These
fields are bounded and validated by Convex. Optional browser geolocation is used
only as a temporary search bias and is never written to Convex. The legacy Place
ID array remains for compatibility; profiles that predate normalized location
storage must reconfirm and save their location before starting another search.
The radius slider supports 5–200 km in 5 km increments and defaults to 25 km.
Curated job titles and skills can be updated idempotently with
`npm run catalog:seed`. Curated job-title rows also store editable bilingual
aliases used by discovery. Private titles added by users deliberately have no
shared aliases.

### Daily job discovery

Paid users with completed profiles receive a daily discovery attempt without
opening the app. Ten deterministic user cohorts run hourly from 08:00 through
17:00 Israel time. A newly completed paid profile is queued immediately if it
has not already received that day's attempt. Sequential workers create one
deterministic query for each unique target role, up to five, and call the OpenAI
Responses API with Web Search from a server action. Free users never enter this
provider path; their feed is assembled only from jobs already stored in the
central database. The browser never receives the API key, selected model,
prompts, or raw provider response.

Each role query combines the curated title with at most four strong discovery
aliases and searches the shared Israeli market. Profile skills and personal
radius stay out of paid discovery; location and professional fit are applied by
the downstream matching pipeline. The normalized role and country form the
daily shared-query identity, so one result can serve Israeli users with
different locations and radii.

The Convex deployment requires these additional server-only variables:

```text
OPENAI_API_KEY
OPENAI_JOB_SEARCH_MODEL
OPENAI_CV_MODEL # optional; falls back to OPENAI_JOB_SEARCH_MODEL
OPENAI_JOB_REVIEW_MODEL # optional; falls back to OPENAI_JOB_SEARCH_MODEL
JOB_SEARCH_ENABLED
JOB_SEARCH_GLOBAL_DAILY_RUN_LIMIT
JOB_SEARCH_GLOBAL_DAILY_QUERY_LIMIT
JOB_SEARCH_MAX_CONCURRENT_RUNS
JOB_SEARCH_OUTPUT_TOKEN_LIMIT
```

Use at least `4000` for `JOB_SEARCH_OUTPUT_TOKEN_LIMIT`; the structured job
batch can contain up to ten candidates and a smaller limit can truncate useful
provider results.

The model must support the Responses API, Web Search, and Structured Outputs.
The initial recommended development value is `gpt-5.6-luna`; keep the model in
deployment configuration so it can be changed without shipping frontend code.
Do not create a browser-prefixed copy of either variable.

### Deep job reviews

Pro and admin users can request a saved, private AI review for any job currently
available to them. The action first reverifies the posting and updates its shared
activity state, then compares the job with the effective profile and up to six
ready resume versions. It stores a match percentage, evidence-based strengths
and gaps, the best existing resume plus truthful tailoring suggestions,
interview preparation topics, and evidence-backed employer/application links.
Free users can read a previously saved review but cannot generate or refresh one.
Only URLs returned by Web Search or the verified current source are persisted.

All limit variables are required and fail closed if missing or invalid. Setting
`JOB_SEARCH_ENABLED` to `false` immediately blocks fresh provider calls without
hiding already eligible jobs. Do not create browser-prefixed copies of these
values.

Automatic searches reserve global capacity atomically before the provider
request. Internal plans are `free`, `pro`, and `admin`. During the beta/pilot,
accounts without an explicit entitlement resolve to `pro`, so all new users
receive paid capabilities without checkout. An explicit development `free`
override still wins and supports testing both experiences.
An automatic query is shared across users only when the current user already
has a visible result from the shared catalog. If the prior run produced no
visible jobs, a fresh provider search is allowed. Empty and skipped searches
retry up to three times that day with a 15-minute delay. Provider response
status, incomplete reason, parse status, and bounded raw/output excerpts are
stored on the search run for diagnosis; an absent structured result is a
failure, never an empty successful result. The automatic path remains protected by
the kill switch and global daily run, query, concurrency, and output-token
limits.

Provider candidates enter a central job catalog. Each record retains the raw
provider JSON and structured fields; each verified source retains bounded raw
page text, verification state, and discovery/update timestamps. Consolidation
checks a provider/domain job ID, canonical and final URLs, normalized source URL,
canonical company/title/location identity, and content before inserting. URL
normalization removes tracking, referral, session, and fragment noise while
preserving unknown parameters that may identify a posting. Company identity
removes conservative legal suffixes, title identity aligns punctuation and
common forms such as `e-commerce`, and GeoNames place IDs align Hebrew and
English locality names. Convex performs the lookup and insert in one transaction,
so concurrent imports contend on the same indexed canonical key. Every
observation is retained in `jobIngestionEvents` for debugging even when it merges
into an existing job.

Each source is rechecked at most every three days by an hourly bounded worker.
HTTP 404/410, explicit English or Hebrew closure text, passed application
deadlines, and redirects to generic career pages close or expire a job when the
evidence is conclusive. HTTP 403/429/5xx, timeouts, and transport failures retain
the prior state and retry with exponential backoff from six hours to seven days.
A recently seen active source can remain `probably_active` for 14 days while it
awaits a successful recheck. Jobs with no recent conclusive evidence become
`unknown`; after 45 days without observation they become `expired`. Only
`verified_active` and `probably_active` canonical jobs enter the normal feed.
Historical application snapshots remain visible with an unavailable label.

Jobs receive a local GeoNames Israel locality centroid when their location has
one unambiguous match. Feed filtering uses Haversine distance against the
candidate's saved coordinates and radius, without an AI call. Unknown,
ambiguous, or foreign locations are excluded rather than broadened. Centroids
are suitable for city-radius filtering but are not exact workplace addresses.
The generated locality data comes from [GeoNames](https://www.geonames.org/)
under CC BY 4.0.

Resolved locations also expose canonical English and Hebrew locality names to
the feed. The original provider location remains stored as evidence, while the
UI can consistently select the canonical label for its current language. The
English label is the first plain-Latin GeoNames alias; the Hebrew label is the
longest unvocalized Hebrew alias. These deterministic labels should be reviewed
if the GeoNames snapshot is regenerated.

Suggestions read a materialized, per-profile match index rather than scanning a
fixed window of the newest central jobs. A profile revision starts a cursor-based
reconciliation over every `verified_active` and `probably_active` catalog row in
bounded transactions. New or reverified jobs use the inverse path and reconcile
that job across completed profiles in bounded pages. Excluded pairs are not
stored. This makes feed reads small and indexed while allowing an older posting
to surface for as long as it remains active. After first deploying the match
index to an existing environment, run
`npx convex run jobMatching:dispatchAllUsers '{}'` once to enqueue the initial
backfill.

### Homepage and development controls

The homepage contains a compact Suggestions / Saved tab bar and scannable
job cards. Each card prioritizes title, company, location, work model, posting or
discovery date, a short summary, up to five key skills, source, and concise
actions. Raw provider and verification diagnostics never appear in the normal
UI.
The fixed profile button sits at the logical start (left in English, right in
Hebrew) and opens profile editing, CV replacement, language switching, and sign-out.
The footer Save/status control opens a colored, icon-based status picker on every
card. Choosing a new status opens a small optional-comment dialog, while the
adjacent comment action records a standalone private note. Tracked cards show
their latest status on the control and offer removal as the final picker option.
The dated event timeline appears inline below Key skills and keeps status changes,
comments attached to those changes, and standalone notes together.
Saved shows compact icon-and-count filters only for statuses that currently have
jobs. The row is omitted when fewer than two statuses are present and otherwise
starts with All before the statuses in pipeline order.
Snapshots remain available after a job expires from suggestions; these actions
record tracking only and never send a CV.
Suggestions show up to 50 of the highest-ranked materialized matches; In
progress currently shows the latest 100.

On development deployments only, set the server variable `DEV_TOOLS_ENABLED=true`
to expose the floating bottom testing panel. It also gates the manual search
action and the free/subscribed test switch server-side. Leave it unset or false
on production. In free mode the button only refreshes the central database feed
and cannot reach the provider. In subscribed mode **Search now** may be repeated
for testing: manual runs bypass automatic daily and global run/query limits, but
still enforce one active run at a time. The panel intentionally shows no quota
or next-search countdown. Development controls invoke the real discovery and CV
flows; they do not seed synthetic jobs, applications, profiles, or résumés.

The development match audit remains a bounded recent-catalog diagnostic sample;
it is not the source of feed completeness. The materialized reconciliation
pipeline described above is the authoritative suggestion path.

The daily sweep runs the matching cohort hourly from 08:00 through 17:00 Israel
time, with at most one automatic attempt per eligible paid profile on an Israel
calendar day. New completed paid profiles are queued immediately. No browser
session is required. Failures are recorded in
`dailyDiscoveryAttempts.lastOutcome`; a failed shared-query claim may be retried
by another eligible user.

## Page URLs and layouts

Next.js App Router owns navigation. `/` is intentionally session-aware: signed-out
visitors see the standalone landing page, while signed-in users see suggested jobs.
`/?tab=in-progress` shows saved jobs. The landing page does not inherit the app
header or content layout.

Authenticated routes live under the `(app)` route group. Profile topics have
stable URLs: `/profile`, `/profile/preferences`, `/profile/languages`, and
`/profile/resumes`. Opening one while signed out keeps that exact URL visible and
shows the sign-in prompt; after Google sign-in, the requested page is revealed.
This client-side presentation gate complements the owner checks in Convex, which
remain the authorization boundary. Unsaved profile edits require confirmation
before topic navigation.
