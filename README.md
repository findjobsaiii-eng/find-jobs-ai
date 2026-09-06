# Find Jobs AI

An AI-powered job-search assistant in its foundation phase. The repository currently contains the application shell, bilingual UI foundation, Google OAuth through Convex Auth, and secure candidate-profile onboarding. Job discovery, application management, AI assistance, scraping, and Gmail integration have not been implemented.

## Stack

- React 19 and TypeScript
- Vite
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

The Convex setup creates the local environment configuration used by `VITE_CONVEX_URL`. Do not commit local environment files.

Current implementation status, known gaps, and the recommended next milestone are tracked in [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md). Durable technical choices and pending decisions are recorded in [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Commands

```sh
npm run dev          # Start Convex and Vite
npm run typecheck    # Check TypeScript
npm run lint         # Run ESLint, including accessibility rules
npm run format       # Format supported files
npm run format:check # Verify formatting without changing files
npm test             # Run the focused Vitest suite once
npm run test:watch   # Run Vitest in watch mode
npm run check        # Run typecheck, lint, and format checks
npm run build        # Typecheck and create a production build
npm run preview      # Preview the production build
npm run catalog:seed # Idempotently seed curated job titles and skills
npm run locations:prepare # Build import data from the tracked locality CSV
npm run locations:import  # Replace locations in the development deployment
```

## Project structure

```text
src/
  app/           Application-wide providers and initialization
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

Theme values are semantic CSS variables in `src/index.css`. Reusable primitives live in `src/components/ui`; prefer extending them over repeating interaction and accessibility behavior. Motion is configured globally to respect the user's reduced-motion setting.

The screenshots supplied during setup are product-direction references, not a specification. The visual system should stay clean, responsive, calm, and content-led as real workflows are designed.

## Authentication

Authentication uses Convex Auth with Google OAuth. The Convex deployment needs
`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `JWT_PRIVATE_KEY`, `JWKS`, and
`SITE_URL`. For local development, set `SITE_URL` to `http://localhost:5173`.
Only the variable names belong in documentation and source control; their values
must remain in the Convex deployment environment.

The Google OAuth client must allow this callback URL:

```text
https://YOUR-DEPLOYMENT.convex.site/api/auth/callback/google
```

Deployment-specific URLs and credential values are intentionally not stored in repository documentation.

The browser receives only the public `VITE_CONVEX_URL`. OAuth credentials are
read by Convex server code and are never passed through a `VITE_` variable. The
client removes the one-time OAuth callback code from the address bar before
exchanging it, presents a recoverable callback-error state, and delegates session
storage and invalidation to Convex Auth.

Exact manual Google OAuth smoke-test steps and the latest external configuration
status are recorded in [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md).

## Convex

Before editing Convex code, read `convex/_generated/ai/guidelines.md`. Managed Convex agent skills are installed under `.agents/skills/`. Keep queries bounded and indexed, validate public inputs and outputs, derive authenticated identity server-side, and keep privileged functions internal.

### Candidate profiles

After Google sign-in, the authenticated boundary loads the current user's candidate profile. Users with no completed profile enter a four-step onboarding flow; completed profiles continue to the current authenticated application screen. Every Continue action saves progress, and Save draft preserves the current step explicitly.

Candidate ownership and Google identity fields are derived exclusively in Convex. The client never sends a user ID, email, Google display name, or profile image. All profile reads and writes reject unauthenticated callers and query the indexed profile belonging to the server-derived auth user.

Editable profile data is normalized and bounded on the server:

| Field                        | Stored limits                                                      |
| ---------------------------- | ------------------------------------------------------------------ |
| Preferred display name       | 2–80 characters to complete                                        |
| Target job titles            | 1–5 validated catalog references                                   |
| Professional summary         | 40–1,200 characters to complete                                    |
| Years of experience          | Whole number from 0–60                                             |
| Skills                       | 1–30 validated catalog references                                  |
| Preferred locations          | 1–10 validated locality, district, or nationwide references        |
| Work arrangements            | One or more of onsite, hybrid, and remote                          |
| Employment types             | One or more of full-time, part-time, and contract                  |
| Minimum monthly gross salary | Whole ILS amount from 1,000–200,000                                |
| Languages                    | 1–10 unique supported languages, each with a proficiency selection |

Drafts may omit or clear fields so onboarding remains resumable. Completion is a separate server-validated transition and records created, updated, and completed timestamps. The profile contains only the stated onboarding and Google identity fields; no CV, generated content, mailbox data, job data, or profile score is stored.

### Onboarding reference data

Job titles and skills use a searchable bilingual catalog. If a value is missing,
an authenticated user can add a normalized custom value that is visible only to
that user. Private custom values are capped, URLs and control characters are
rejected, and exact duplicates are reused. This keeps the MVP useful without
publishing unreviewed input or creating a manual moderation queue.

The normalized UTF-8 locality source is tracked at
`data/reference/israel-localities.csv`. The generated JSON Lines import is
ignored because it is reproducible. To replace the source with a newly downloaded
version and refresh the development deployment:

```sh
npm run locations:prepare -- /absolute/path/to/new-localities.csv
npm run locations:import -- --yes
```

The preparation script accepts UTF-8 or Windows-1255 input, validates the
expected columns, overwrites the tracked normalized CSV, deduplicates localities
by code, derives districts, and generates a content-based source version. Review
the CSV diff before importing. The import replaces only the `locations` table
in the selected Convex development deployment. Curated job titles and skills can
be updated idempotently with `npm run catalog:seed`.
