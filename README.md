# Find Jobs AI

An AI-powered job-search assistant in its foundation phase. The product will eventually help people discover and rank relevant roles, manage applications, compare opportunities with their profile, and improve their CVs. Product functionality has intentionally not been started yet.

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

## Commands

```sh
npm run dev          # Start Convex and Vite
npm run typecheck    # Check TypeScript
npm run lint         # Run ESLint, including accessibility rules
npm run format       # Format supported files
npm run format:check # Verify formatting without changing files
npm run check        # Run typecheck, lint, and format checks
npm run build        # Typecheck and create a production build
npm run preview      # Preview the production build
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

The Google OAuth client must allow this callback URL:

```text
https://YOUR-DEPLOYMENT.convex.site/api/auth/callback/google
```

For this project's current development deployment, `YOUR-DEPLOYMENT` is
`optimistic-quail-311`.

## Convex

Before editing Convex code, read `convex/_generated/ai/guidelines.md`. Managed Convex agent skills are installed under `.agents/skills/`. Keep queries bounded and indexed, validate public inputs and outputs, derive authenticated identity server-side, and keep privileged functions internal.

The schema is intentionally empty until the first product feature establishes real data requirements.
