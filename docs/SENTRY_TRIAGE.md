# Sentry triage — 7 October 2026

Organization `find-job-ai`, project `jobmiter`. Authenticated read-only API
inspection using the project-specific local token. Current local commit at
inspection: `f065c31`. Reviewed unresolved groups and up to three recent detailed
events per non-test group, across environments. Event times below use Asia/Jerusalem (Israel time).
No production mutations, issue resolutions, commits, pushes or deployments.

## Findings and local changes

| Issue                                                                                                                                                                  | Evidence                                                                                                                                                                                                                                   | Action / current limit                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [JOBMITER-8](https://find-job-ai.sentry.io/issues/7775267463/) — Invalid time value                                                                                    | `/admin`, last seen 6 October 00:31; symbolicated stack reaches `dateRange` → `israelMidnight` → `formatToParts`. Clearing the date input passes an empty key into this path; locale-formatted keys can also fail the `YYYY-MM-DD` parser. | Build ISO keys from date parts, validate actual calendar dates and retain the last valid query selection during empty/partial/future edits, allowing a draft edit and restoring invalid input on blur. Guard invalid diagnostic timestamps. Preserve Jerusalem midnight and 23/25-hour DST day ranges. Reproduced and covered by unit/UI regressions. Local fix awaits release.      |
| [JOBMITER-B](https://find-job-ai.sentry.io/issues/7776843948/) — insertBefore NotFoundError                                                                            | Current release `f065c31`, last seen 6 October 18:33. Symbolicated React DOM placement stack, with no application-level cause or browser context.                                                                                          | Explicit Retry now reloads a broken document instead of attempting a segment retry against the same DOM. Add browser/translation diagnostics for a recurrence. Root cause remains unconfirmed: the event does not establish whether external DOM mutation, an extension or an application interaction caused it. No monkey-patching or error suppression.                            |
| [JOBMITER-A](https://find-job-ai.sentry.io/issues/7776071259/) — Failed to fetch                                                                                       | Current release `f065c31`, last seen 6 October 23:54. Symbolicated stack reaches Convex Auth token refresh and its POST to `/api/auth`. The installed provider already retries network failures before propagating this error.             | Retain the failure and add an `auth_refresh_network` category, sanitized request breadcrumbs, browser identification, online state and page visibility. Network/blocking/background behavior cannot be established from the old event. Do not change authentication/session state or silently swallow an exhausted refresh. A failed connection is not fixed merely by labelling it. |
| [JOBMITER-9](https://find-job-ai.sentry.io/issues/7775964549/) — listCurrentUserJobs server error                                                                      | Last seen 6 October 10:08, older frontend release `b8c9705`; three sampled events preserve the function and request identifiers.                                                                                                           | Earlier matching CPU/bounded-page repairs already cover the confirmed timeout path, with production readbacks documented in the production-fixes report. No events in the current release observed during this inspection. Client events do not prove the original backend exception without Convex logs/native integration; do not claim a server stack from the client trace.      |
| [JOBMITER-6](https://find-job-ai.sentry.io/issues/7750175933/) — ChunkLoadError                                                                                        | Last seen 2 October 10:08, earlier releases. Original message/stack were stripped in old events.                                                                                                                                           | When a chunk error reaches an error boundary, explicit Retry performs a full reload to obtain the current document/assets. No automatic reload loop. No evidence of recurrence on the current release; exact historical asset failure is unknown.                                                                                                                                    |
| [JOBMITER-4](https://find-job-ai.sentry.io/issues/7749310985/), [JOBMITER-5](https://find-job-ai.sentry.io/issues/7749393210/), JOBMITER-7 — historical generic errors | Older captures contain a type but no useful original exception/stack. Samples predate the current diagnostic implementation or use older releases.                                                                                         | Cannot reconstruct stripped historical evidence. Latest detailed events demonstrate that the existing message/stack/debug-ID preservation and client source maps work. Observe recurrence with the new bounded context; do not invent a root cause or mark resolved.                                                                                                                 |
| JOBMITER-1 — historical Windows development bundler error                                                                                                              | 16 September development event: a generated Turbopack `require-in-the-middle` module could not be loaded.                                                                                                                                  | Old local build/cache failure, not a confirmed current production bug. Current local production build is validated separately. No speculative dependency or Windows-specific changes.                                                                                                                                                                                                |
| Intentional Sentry test errors                                                                                                                                         | Controlled `/sentry-test` events.                                                                                                                                                                                                          | Excluded from bug fixes. No Sentry issues muted or resolved.                                                                                                                                                                                                                                                                                                                         |

## Diagnostic changes

- Preserve at most 25 fetch/XHR/navigation breadcrumbs with sanitized URL paths,
  HTTP method and status. Never preserve bodies, cookies, authorization headers,
  query strings, console logs or click/form text.
- Retain only the User-Agent request header for browser identification. Add
  online state, page visibility, supported UI language and the browser's
  `translated-ltr`/`translated-rtl` flags. These flags are diagnostic evidence,
  not proof that every DOM error is caused by translation.
- Preserve existing original exception, stack, source-map identities, internal
  user identifier, route, digest and Convex function/request-ID reporting.
- The auth-network category uses the latest failed auth-request breadcrumb when
  production frames are still hashed URLs, before server-side symbolication.
- No ignore-error filter, blanket browser-translation disablement, global fetch
  patch, custom authentication replacement or automatic reload loop.

## Validation

- `npm run check`: passes.
- `npm test`: all 562 tests pass, including cleared/partial/future date edits,
  locale-independent keys, leap dates, Jerusalem DST boundaries, explicit
  document reload versus normal segment retry, and sanitized diagnostics.
- `npm run build -- --webpack`: passes locally. Webpack is used because this
  execution environment previously blocked Turbopack worker-port creation.
- React Doctor: no issues in the changed frontend files.
- No browser tests, following the owner's preference. UI changes have not been
  verified in a deployed release.

## Daily maintenance

Codex heartbeat `daily-jobmiter-sentry-fixes` is active at 09:00 Asia/Jerusalem.
It uses `JOBMITER_SENTRY_AUTH_TOKEN` from the ignored project `.env.local`, reads
all environments, compares event time/release with the previous triage, makes
confirmed local fixes and runs checks. It preserves existing uncommitted work.
It reports meaningful changes or actionable blockers rather than repeatedly
patching old events or changes awaiting release. It cannot certify a production
fix until the owner approves release and new production evidence is available.

## Owner checks after release

1. Open admin Overview, clear/partially edit the date and select a valid past
   date. The last valid selection should remain active during invalid edits,
   with no error screen. Check Searches and Token Usage too.
2. If a stale-chunk or DOM error occurs, press Retry: it should reload the
   document. Ordinary server/query errors should keep the usual segment retry.
3. Verify future Sentry events show browser identification, bounded sanitized
   request/navigation breadcrumbs and online/visibility/translation context.
   Authentication network and DOM errors remain reported for diagnosis.

## Daily check — 7 October, 09:01 Israel time

Read the live unresolved-issue list across all environments and the latest
changed group's detailed event. Local HEAD is now `c8b0cf7`; the earlier local
fixes are committed and the worktree was clean before this documentation update.
No production release was verified during this check.

- [JOBMITER-4](https://find-job-ai.sentry.io/issues/7749310985/) increased from
  48 to 49 events. The new event occurred at 08:17 Israel time, but identifies
  the older release `031ca45d665b04476c98ac6086779fbfaac7ddca`, created on
  5 October. Its exception still contains only `TypeError`, with no original
  message or stack frames. The event does not establish the cause or whether
  it represents an old client session; no speculative code change was made.
- All other unresolved groups have unchanged counts and last-seen timestamps
  relative to the previous inspection. Intentional test groups remain excluded.
- No application code changed, so code tests/builds were not repeated. This
  documentation update passed Prettier and `git diff --check`. No issue status,
  production data, commits, pushes or deployments were changed by this check.
