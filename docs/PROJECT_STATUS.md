# Project status

Last repository audit: 2026-09-06

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
- A secure, four-step candidate-profile onboarding flow after sign-in, with read-only Google identity, field validation, progress, Back/Continue/Save draft/Finish actions, duplicate-submit protection, and responsive LTR/RTL behavior.
- One indexed candidate profile per Convex Auth user, with server-derived ownership and Google identity fields, bounded server normalization, draft resume state, and created/updated/completed timestamps.
- Searchable bilingual job-title and skill catalogs, with bounded per-user private additions that cannot leak across accounts or become shared automatically.
- Google Places autocomplete for one primary Israeli city or region, with a compact selected-location summary, accessible 5–100 km radius presets (25 km by default), localized results, and optional current-location search bias that does not persist coordinates. Earlier multi-location drafts remain readable, but onboarding presents and replaces only the primary location.
- Multiple work-arrangement selections and up to ten language/proficiency entries, seeded in the UI with ten languages commonly useful in Israel.
- Convex tests covering unauthenticated rejection, cross-user isolation, private catalog ownership, normalization, resumable drafts, and completion enforcement, plus component tests for onboarding validation, routing, and submission behavior.
- Completed onboarding now opens the responsive Worky dashboard. Incomplete profiles still open onboarding, within the existing authentication boundary.
- Profile editing remains available from the completion card, saved-preferences summary, user menu, and mobile Profile navigation. The existing four-step form is prefilled, validates all fields on Save, and uses the existing owner-scoped mutation with completion preserved. Edits stay local until saved; Cancel and browser unload warn only for unsaved field changes.
- Completion is calculated from the eleven saved field groups using existing validation, with the next missing field identified. Form defaults and Google display-name fallbacks do not count as saved profile completion.
- Search filters are initialized from the saved profile but remain temporary. An explicit save action updates only role, location/radius, salary, work arrangement, and employment preferences; query text is not saved. Clear all affects only temporary filters.
- The dashboard uses the current design tokens, English/LTR and Hebrew/RTL localization, horizontally scrolling mobile filter chips, and fixed mobile navigation. It shows a discovery empty/loading/error state or validated stored jobs; unavailable tools remain marked coming soon.
- Completed profiles can start an authenticated manual job-discovery run from the dashboard. The server deterministically creates at most two bounded queries from non-identifying profile criteria and calls the OpenAI Responses API with Web Search and strict Structured Outputs.
- Provider output is treated as untrusted: every accepted posting needs a public HTTP(S) URL present in Web Search evidence, bounded structured fields, and a title and company. Valid jobs are stored centrally, associated with the requesting user through search-run discoveries, and rendered as plain React text with a link to the original source.
- Exact normalized search criteria reuse completed results for 24 hours. New provider searches are limited to one active run per user, have a one-hour per-user cooldown, accept at most five jobs per query and ten per run, disable SDK retries, cap output tokens and tool calls, and store only aggregate token usage.
- Central job records deduplicate first by normalized source URL and then by normalized company/title/location fingerprint. Rediscovery preserves the original discovery timestamp and updates the latest discovery timestamp.

## Incomplete or unknown areas

- A live redirect reached Google on 2026-09-06, but Google returned `disabled_client`. Successful account selection, callback completion, refresh persistence, and live sign-out remain blocked until the configured OAuth client is enabled or replaced.
- No CV upload, ranking or match score, application tracking, resume generation, automatic applications, scraping, Gmail access, scheduling, embeddings, or profile scoring exists.
- Job discovery is manual only. There are no scheduled searches, background queues, semantic query reuse, semantic deduplication, job-activity rechecks, or deep per-user AI reviews.
- The candidate profile persists a Google Place ID and radius, not its display label or coordinates. The first server search therefore includes Israel and the saved work criteria, and uses the Place ID/radius in the exact-cache fingerprint, but cannot express a city name or calculate true distance until normalized server-side location data is added.
- Production hosting, production Convex configuration, release strategy, and monitoring are not documented.

## Current risks

- `@convex-dev/auth` is on a `0.0.x` release and should be treated as a dependency that may introduce breaking changes during upgrades.
- The documented Node.js requirement is not machine-enforced, which can lead to local and CI version drift.
- Convex Auth stores browser session and refresh tokens in `localStorage` by default. This provides reload and browser-restart persistence but makes application XSS prevention a security boundary; the product owner should explicitly accept this persistence model or request a different storage policy.
- Runtime authentication readiness still depends on untracked deployment configuration and cannot be inferred from a successful build or mocked tests.
- Runtime location search depends on Google Cloud billing, Maps JavaScript API, Places API (New), and correct browser/API restrictions for `VITE_GOOGLE_MAPS_API_KEY`.
- Runtime job discovery depends on server-only `OPENAI_API_KEY` and `OPENAI_JOB_SEARCH_MODEL` configuration and on the selected model continuing to support Responses API Web Search plus Structured Outputs.
- Web Search and model output can be incomplete or stale. Source URLs are evidence-backed and activity begins as `unknown`; the product does not yet revalidate whether a posting remains active.

## Next recommended milestone

Add normalized server-side city/country data to the existing Place selection,
then define job freshness and activity revalidation. Scheduling, embeddings,
matching scores, CV ingestion, and automated applications remain separate
milestones with their own cost, privacy, and consent decisions.

## Job discovery verification

Focused automated coverage verifies unauthenticated and incomplete-profile
rejection, exact recent-result reuse, URL deduplication in the central jobs
table, and the mocked OpenAI boundary rejecting postings whose URLs are absent
from Web Search evidence. Automated tests never call the real OpenAI API.

A single live development search requires an authenticated completed profile and
both server variables named in the README. Start the app, choose **Search for new
jobs**, and record only aggregate counts and usage shown by the safe action
summary. Do not record the API key, generated queries, raw provider output, or
private profile data. A live result is not claimed until that check is performed.

## Dashboard verification

Four focused tests cover completed/incomplete profile routing and a prefilled
Hebrew editor, saving edits and returning to the updated dashboard, actual saved
field completion, and the existing backend mutation preserving identity and the
original completion timestamp. Existing tests are retained. No Convex backend
files or schema changed for this milestone.

Desktop and mobile browser visual checks remain manual; browser automation was
excluded from this task. Check the dashboard at a desktop width and around
390 px, including filter scrolling, the bottom navigation, and editing/saving a
profile. Google Places labels and suggestions require the existing configured
browser key. No live visual or Places result is claimed by the mocked tests.

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

On 2026-09-06, steps 1 through the initial Google redirect were checked against
the available development configuration. Google stopped the flow with
`disabled_client`, so steps 5 through 9 could not be completed live. Their local
UI and utility behavior is covered by automated tests, but that is not a
substitute for the live smoke test.
