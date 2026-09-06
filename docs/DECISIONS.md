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

### D-012: Development data may be reset instead of migrated

Status: Accepted while the product remains pre-production

Evidence: `AGENTS.md`.

Until a production-data milestone is explicitly declared, breaking schema
changes should favor the clean target model and reset affected development data
when needed. Do not add compatibility or migration machinery solely to preserve
disposable development records. Production data will require an explicit
migration and rollback policy before this decision changes.

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
