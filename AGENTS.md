# Owner instructions

- Don't be afraid to tell me if I'm wrong or my request is stupid, or if I need to do something before you can do your work.
- Don't be afraid to give suggestions out of the blue, like "Hey, I think we should do X instead of Y" or "I think we should add Z to the project plan." I want you to be proactive and help me make the best decisions for the project. Including suggestions for refactoring, architecture, and dependencies. I want you to be my partner in this project, not just a code generator.
- If I tell you to do something, you can, before you start, answer with "Are you sure? Maybe X is better?..." etc. Don't be afraid to push back.
- Make the app snappy, with smooth transitions and small animations. It's the little things that make an app feel great to use.
- The UI should be minimal. I'm not saying the code should be minimal. Add smooth transitions, thoughtful interactions, loading states, etc. But the visible UI should be clean. Less is more. Prefer making the interface self-explanatory instead of adding lots of explanatory text and labels.
- Don't be afraid to install a package if needed. Think like a professional programmer. If something small is easy and safer to implement ourselves, that's fine. If something large or well-solved already exists, reinventing it from scratch is probably the wrong approach.
- Write important project knowledge in this file, the README, or other appropriate documentation. Documentation matters.
- Every instruction, whether in this file, a prompt, or another project file, should be treated as guidance rather than something to follow blindly. Push back when you believe there is a better approach.
- You may improve or change instructions in this file when appropriate, except for this Owner instructions section. Do not modify this section yourself. If you think something here should change, ask me.
- Do not blindly preserve existing code or architecture just because it already exists. This product is in pre-production. If a cleaner solution requires refactoring, deleting code, changing the schema, or deleting development data, prefer the cleaner solution. We do not need backwards compatibility yet.

# Project direction

This is an AI-powered job-search assistant built with Next.js App Router, React, TypeScript, and Convex. Keep architecture proportional to the feature being built: prefer a clear feature folder over speculative abstractions, and record durable decisions in the README or a focused document under `docs/`.

## Pre-production data policy

- Do not add backward-compatibility fallbacks, legacy readers, transitional schema fields, or automatic preservation/backfill behavior unless the owner explicitly requests it.
- When a cleaner schema conflicts with development data, prefer the clean schema and clear or reseed the affected development data. Tests must exercise only the current data model.

# Frontend conventions

- Keep `src/app/` focused on App Router routes, layouts, metadata, and application-wide providers. Put reusable primitives in `src/components/ui/`, feature code in `src/features/<feature>/`, shared utilities in `src/lib/`, and translations in `src/i18n/locales/`.
- Use route groups to keep public and authenticated layouts separate. Authentication UX may hide client content, but Convex functions remain the authorization boundary.
- All user-facing copy belongs in translation resources. English and Hebrew are first-class. Use semantic HTML, logical CSS/Tailwind utilities (`start`/`end`, `ps`/`pe`, `ms`/`me`), and verify both `ltr` and `rtl` layouts.
- Use semantic design tokens rather than one-off colors. Extend the shared UI primitives when a pattern repeats; do not create a generic abstraction before it has a real second use.
- Use Motion for purposeful transitions and micro-interactions. Respect reduced-motion preferences, avoid motion that delays interaction, and favor transform/opacity animations.
- Accessibility is a completion criterion: keyboard operation, visible focus, correct labels, sufficient contrast, and usable loading/error/empty states.

# Convex conventions

Before changing any file under `convex/`, read `convex/_generated/ai/guidelines.md`. Define schemas in `convex/schema.ts`, validate every public function argument and return value, derive identity server-side, use bounded/indexed queries, and keep privileged helpers internal. Follow the managed Convex skills in `.agents/skills/` when a matching workflow exists.

# Quality bar

- Run `npm run check` for normal changes and `npm run build` before handing off substantial frontend work.
- Test behavior and risk, not implementation trivia. Prioritize user flows, permissions, data boundaries, localization/RTL, and complex state. Do not add tests that merely assert static copy exists.
- Keep dependencies intentional. Prefer established libraries for complex, security-sensitive, or accessibility-heavy behavior; avoid packages for trivial helpers.
- Update documentation when setup, architecture, environment variables, scripts, or important product assumptions change.

# Project control

- Keep `docs/PROJECT_STATUS.md` aligned with what the repository can prove. Separate implemented, incomplete, and unknown work.
- Record durable technical decisions in `docs/DECISIONS.md`. Mark unresolved choices as pending instead of presenting them as settled.
- Use `.github/pull_request_template.md` for every pull request and report the validation commands actually run.
- Never commit credentials or secret values. Local environment files remain ignored; documentation may name required variables but must not contain their values.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
