# Project status

Last repository audit: 2026-09-06

This document reports what is present in the repository. It does not confirm external service configuration unless that configuration is represented and testable from the repository.

## Verified current stack

| Area               | Verified implementation                                     |
| ------------------ | ----------------------------------------------------------- |
| Frontend           | React 19, TypeScript, Vite 8                                |
| Backend            | Convex 1.44                                                 |
| Authentication     | Convex Auth with the Auth.js Google provider                |
| Styling            | Tailwind CSS 4, shadcn conventions, Base UI primitives      |
| Interaction        | Motion with user reduced-motion preferences enabled         |
| Localization       | i18next and react-i18next with English and Hebrew resources |
| Package management | npm with a committed `package-lock.json`                    |
| Static validation  | TypeScript, ESLint, Prettier, and the Vite production build |

The README requires Node.js 22 or newer. The repository does not currently contain a Node version manager file or a `package.json` engine constraint.

## Verified implemented features

- A Vite/React application shell with Convex and Motion providers.
- Google-only OAuth wiring through Convex Auth, including HTTP callback routes and auth tables in the Convex schema.
- Sign-in, session-loading, authenticated placeholder, sign-out, and sign-in error UI states.
- English and Hebrew UI copy, document language/direction synchronization, and persisted language detection.
- A shared button primitive, semantic theme tokens, local font packages, responsive layout, focus styles, and reduced-motion handling.

## Incomplete or unknown areas

- Successful Google OAuth against a configured deployment is not proven by repository-only checks. OAuth credentials and signing material live outside version control.
- No job discovery, ranking, application tracking, AI, scraping, Gmail, or user-profile workflow exists.
- The authenticated screen is a placeholder; there is no product dashboard or domain data model.
- There are no automated test files and no `test` script.
- There is no continuous-integration workflow.
- Production hosting, production Convex configuration, release strategy, and monitoring are not documented.

## Current risks

- Authentication has no automated regression coverage, so provider, callback, and session changes rely on manual verification.
- `@convex-dev/auth` is on a `0.0.x` release and should be treated as a dependency that may introduce breaking changes during upgrades.
- Validation is not enforced by CI; contributors must run it locally.
- The documented Node.js requirement is not machine-enforced, which can lead to local and CI version drift.
- Runtime authentication readiness depends on untracked deployment configuration and cannot be inferred from a successful build.

## Next recommended milestone

Complete an authentication-hardening milestone before adding job-search features:

1. Verify Google sign-in and sign-out end to end against the intended development deployment.
2. Define the minimum authenticated user identity the product will rely on.
3. Add focused automated coverage for authenticated and unauthenticated boundaries.
4. Add a small CI workflow that runs the existing validation commands and the chosen tests.

This is a recommendation, not a recorded product decision. The product owner still needs to confirm the milestone.

## Local development and validation

Install dependencies and start Convex with the Vite development server:

```sh
npm install
npm run dev
```

Run the available checks:

```sh
npm run typecheck
npm run lint
npm run format:check
npm run check
npm run build
```

`npm run check` combines type checking, linting, and formatting verification. `npm run build` repeats type checking and creates the production frontend bundle. There is currently no test command.
