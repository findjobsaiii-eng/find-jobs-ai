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
- Searchable locality, district, and nationwide options generated from the tracked normalized locality CSV.
- Multiple work-arrangement selections and up to ten language/proficiency entries, seeded in the UI with ten languages commonly useful in Israel.
- Convex tests covering unauthenticated rejection, cross-user isolation, private catalog ownership, normalization, resumable drafts, and completion enforcement, plus component tests for onboarding validation, routing, and submission behavior.

## Incomplete or unknown areas

- A live redirect reached Google on 2026-09-06, but Google returned `disabled_client`. Successful account selection, callback completion, refresh persistence, and live sign-out remain blocked until the configured OAuth client is enabled or replaced.
- No CV upload, job discovery, ranking, application tracking, AI generation, automatic applications, scraping, Gmail access, or profile scoring exists.
- The post-onboarding authenticated screen remains a placeholder; there is no product dashboard or job-domain data model.
- Production hosting, production Convex configuration, release strategy, and monitoring are not documented.

## Current risks

- `@convex-dev/auth` is on a `0.0.x` release and should be treated as a dependency that may introduce breaking changes during upgrades.
- The documented Node.js requirement is not machine-enforced, which can lead to local and CI version drift.
- Convex Auth stores browser session and refresh tokens in `localStorage` by default. This provides reload and browser-restart persistence but makes application XSS prevention a security boundary; the product owner should explicitly accept this persistence model or request a different storage policy.
- Runtime authentication readiness still depends on untracked deployment configuration and cannot be inferred from a successful build or mocked tests.

## Next recommended milestone

Restore a usable development Google OAuth client and manually smoke-test both
new-profile and resumed-profile onboarding in English and Hebrew. After that,
replace the authenticated placeholder with the first focused job-search
workspace while keeping CV ingestion and automated applications out of scope
until their data and consent boundaries are designed.

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

On 2026-09-06, steps 1 through the initial Google redirect were checked against
the available development configuration. Google stopped the flow with
`disabled_client`, so steps 5 through 9 could not be completed live. Their local
UI and utility behavior is covered by automated tests, but that is not a
substitute for the live smoke test.
