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

## Daily check — 8 October, 09:04 Israel time

Live read-only inspection across all environments at local HEAD `1b2abed`.
The worktree was clean before this run. Compared issue counts with 7 October
and read detailed events for the three changed groups (up to six each).

- [JOBMITER-A](https://find-job-ai.sentry.io/issues/7776071259/) increased from
  5 to 10 events. Five new auth-refresh network failures include three on
  releases `c8b0cf7`/`1b2abed` with working symbolicated source stacks, browser
  identification, bounded request breadcrumbs and `auth_refresh_network` tags.
  All three contextualized events report a hidden page and online status true.
  Failed POST attempts follow earlier successful requests. This supports a
  background-tab/network investigation, but navigator online status does not
  prove endpoint reachability, and the events do not establish an application
  auth-state bug. Keep SDK retries and error reporting; no auth patch or filter.
- [JOBMITER-B](https://find-job-ai.sentry.io/issues/7776843948/) increased from
  1 to 7 events. All six new events on `1b2abed` were caught by the **profile**
  boundary, with symbolicated React DOM placement stacks. Two at 16:16 on
  7 October report translation active; four at 22:07–22:09 report it inactive.
  Translation therefore cannot explain every recurrence. The source of the
  DOM mutation remains unconfirmed.
- Confirmed recovery gap: `ProfileErrorBoundary` intercepted those exceptions
  before the route boundary and its Retry only remounted the subtree, bypassing
  the existing document-reload recovery. It now retains the caught error and
  passes it to the shared recovery helper: explicit Retry reloads for DOM
  placement/stale-chunk failures; ordinary query failures remount normally. No
  automatic reload, error suppression or claim that the mutation cause is fixed.
- [JOBMITER-4](https://find-job-ai.sentry.io/issues/7749310985/) increased from
  49 to 50 with another stripped TypeError from old release `031ca45`, at
  22:37 on 7 October. Still no message/stack to establish a root cause.
- Other issue counts and last-seen timestamps are unchanged. Intentional test
  groups were excluded. New production events verify the earlier client
  diagnostic changes are active; they do not certify server exception capture
  or this run's local recovery fix.

Validation: `npm run check`, the 10 focused profile-boundary/recovery tests and
`npm run build -- --webpack` pass. React Doctor (cached installed CLI) scanned
the two changed frontend files and found no issues; the latest-package fetch and
remote score API were unavailable due to network/DNS restrictions. Prettier and
`git diff --check` pass. No browser tests, production data/status changes, commits,
pushes or deployments. Local recovery fix awaits an owner-approved release.

## Daily check — 9 October, 09:04 Israel time

Read live unresolved groups across all environments at local HEAD `50cc034`;
the worktree was clean. Compared with 8 October and inspected six recent
auth-refresh events plus both events in the new streaming group.

- [JOBMITER-A](https://find-job-ai.sentry.io/issues/7776071259/) increased from
  10 to 16. All four new events with browser context report a hidden page;
  the latest at 09:04 on 9 October also reports **offline**. The others report
  online, which does not prove endpoint reachability. Symbolicated stacks still
  reach the SDK's auth-refresh POST after retries; no application auth-state
  root cause is established. One event identifies current release `50cc034`.
  Retain reporting and SDK retries; do not replace authentication or suppress
  exhausted requests merely to reduce the count.
- New [JOBMITER-C](https://find-job-ai.sentry.io/issues/7781880015/) contains
  two `The destination stream closed early.` events at 22:57 on 8 October,
  both explicitly in **development**, release `5857fa4`, route `GET /`.
  Frames reach Node stream close and Next's development render runtime, where
  the destination `close` handler cancels rendering with this error. No
  application frame or production occurrence establishes a product defect;
  why the destination closed is unknown. No speculative patch or ignore filter.
- These server events preserve the original message, stack, route context and
  digest through `auto.function.nextjs.on_request_error`. This verifies the
  server capture hook in development, not production end-to-end capture.
- All other group counts/last-seen timestamps are unchanged, including the DOM
  group. Yesterday's profile-retry fix is now committed in `5857fa4`, included
  in local `50cc034`; no duplicate patch. The absence of recurrence does not
  prove the unknown DOM-mutation cause is fixed. Intentional tests excluded.

No confirmed new application root cause and no code changes. Code checks/tests
and build were not repeated for this documentation-only update; Prettier and
`git diff --check` pass. No issue-status or production data changes, commits,
pushes or deployments performed by this run.

## Daily check — 11 October, 03:05 Israel time

Live read-only inspection across all environments at local HEAD `cdcff17`.
Preserved the existing uncommitted 9 October triage entry. Previous temporary
snapshots had been removed, so compared against the durable triage record.

- [JOBMITER-A](https://find-job-ai.sentry.io/issues/7776071259/) increased from
  16 to 21 since 9 October. Reviewed all five new detailed events: same
  symbolicated Convex Auth refresh stack, releases `1b2abed`, `50cc034` and
  `f065c31`. All four with browser context report hidden pages and online true;
  the older diagnostic release has no browser context. No new root-cause
  evidence or confirmed application defect; preserve SDK retries/reporting.
- [JOBMITER-4](https://find-job-ai.sentry.io/issues/7749310985/) increased from
  50 to 51. Latest event at 19:33 on 10 October still identifies old `031ca45`
  and contains no message/stack, so cannot establish a cause.
- No new unresolved groups. Other counts/last-seen timestamps remain unchanged,
  including DOM errors (7), development stream closures (2), admin date errors
  (1) and jobs-query errors (4). No absence-of-recurrence claim of resolution.
  Intentional tests excluded; existing recovery fixes not patched again.

No application code changed; code tests/build were not repeated. Documentation
passed Prettier and `git diff --check`. No production mutations, issue-status
changes, commits, pushes or deployments. Unchanged patterns do not require a
new owner action.

Follow-up at 09:04 Israel time on 11 October: live all-environment unresolved
groups have identical counts and last-seen timestamps to the 03:05 inspection.
No new events to inspect or fixes to repeat. Existing local changes preserved;
only this check record added. Prettier and `git diff --check` pass. No code
checks/build repeated or production actions performed.

## Daily check — 12 October, 09:03 Israel time

Live read-only review across all environments at local HEAD `cdcff17`,
preserving the existing uncommitted triage notes.

- [JOBMITER-A](https://find-job-ai.sentry.io/issues/7776071259/) increased from
  21 to 25. Reviewed all four new events: unchanged symbolicated SDK
  auth-refresh network stack. Three with browser context report hidden pages
  and online true; one old `f065c31` event lacks that context. The latest
  identifies `cdcff17`, confirming the current release is represented in
  production telemetry. No new evidence establishes an application root cause.
- No new unresolved groups. All other counts and last-seen timestamps remain
  unchanged, including DOM errors, admin dates and jobs-query errors.
  Intentional test groups excluded; existing fixes not patched again.

Documentation only; Prettier and `git diff --check` pass. No code tests/build
repeated, production mutations, issue-status changes, commits, pushes or
deployments. No new owner action required for the unchanged error pattern.

## Daily check — 13 October, 08:59 Israel time

Read unresolved issues in all environments. Local commit: `9cdb479`.
Kept the existing production research document unchanged.

[JOBMITER-A](https://find-job-ai.sentry.io/issues/7776071259/) increased from
25 to 28 events. Read all three new events. They have the same Convex Auth
token-refresh error and source stack. Releases: `f065c31`, `cdcff17`, `1b2abed`.
The two events with browser details show hidden pages and online status true.
The older release has no browser details. The cause of the failed network
request is still unknown. No new evidence supports a code change.

All other counts and last-event times are unchanged. No new unresolved issue
groups. Excluded intentional test errors. Did not repeat existing fixes.

Changed only this report. Prettier and `git diff --check` passed. Did not run
code tests or a build because no code changed. Did not change production data
or issue status. Did not commit, push or deploy. No user action is necessary.

## Daily check — 14 October, 08:55 Israel time

Read Sentry issues in all environments. Local commit: `9cdb479`.
Kept the existing research report and previous local notes.

Three new server errors have a confirmed cause:

- [JOBMITER-D](https://find-job-ai.sentry.io/issues/7791398428/) and
  [JOBMITER-E](https://find-job-ai.sentry.io/issues/7791398447/) failed in
  `telemetry:getCurrentUserId`. Both caused the root-layout error screen.
  Event time: 08:23 Israel time.
- [JOBMITER-F](https://find-job-ai.sentry.io/issues/7791411224/) failed during
  auth token refresh. Its server request reached `auth:signIn`.
  Event time: 08:34 Israel time.

Read 1,000 recent production log rows from `famous-badger-815`. Matched all
three Sentry request IDs to backend failures. Convex reports that the free
plan limits were exceeded and the deployment was disabled. The window has
10 failures with that message. Affected functions include authentication,
profile/resume reads, telemetry identity, and admin queries. Code changes
cannot restore a deployment that the platform has disabled. The account
owner must restore service through the plan settings or Convex support.
The last captured quota failure was at 08:34. Later recovery is not verified.

### Local fix

`SentryUserSync` used `useQuery`, which throws a failed query during rendering.
Thus an optional diagnostic query could stop the whole page. It now uses
`useQueries`, which returns query failures as Error values. On failure, clear
the Sentry user ID and report the original error with function/request tags.
Keep normal page content available. Restore the ID after query recovery.
Do not suppress the error or change authentication. This only fixes error
isolation. Other application queries still require a working backend.

Tests prove that page content remains available, the old user ID is cleared,
the original error is reported once, and a recovered ID is attached. Existing
logout/loading/unmount tests still pass.

JOBMITER-A increased from 28 to 32. Read all four new events. They retain
the previous auth-refresh network stack. Two with browser details show hidden
pages and online status true. Those network errors do not prove the same
quota cause. All other issue counts and last-event times are unchanged.
Intentional test events remain excluded.

Validation: npm run check, six focused tests, and the local Webpack production
build passed. React Doctor found no issues in the two changed files. Its
remote score service was unavailable. All 580 repository tests passed.
No browser tests or backend code changes. No production data or
issue-status changes. No commits, pushes or deployments. The local fix
requires a separate approved release. Service restoration requires owner action.

## Incident — 14 October, release `23ec4cb`

[JOBMITER-G](https://find-job-ai.sentry.io/issues/?query=JOBMITER-G) reports
“Too many re-renders” in the root layout on release `23ec4cb`. A sandboxed
read-only production query succeeds, and recent matching functions also succeed.
The earlier Convex plan block is not the cause of this incident.

The previous Sentry identity change passed a new object to `useQueries` on
each render. The installed Convex subscription hook requests an immediate
render when that object changes. This creates a render loop. The authenticated
and unauthenticated query definitions must both retain a stable reference.

Local fix: memoize the query map by authentication state. Keep error-value
handling and original-error reporting. Replace the test's mocked useQueries
with the real Convex hook and a simulated transport, including update callbacks.
The tests now cover real subscription rendering, logout, identity failure and
recovery. Existing tests had missed the defect because they mocked the hook.

The owner must approve commit and push for the Git-triggered frontend release.
No direct deployment or production mutation was performed.

Validation: the real-hook tests fail on the original release with “Too many
re-renders” and pass with the fix. Both tests pass. npm run check and the
local Webpack production build pass. React Doctor found no issues in the
two changed files. No browser tests.
