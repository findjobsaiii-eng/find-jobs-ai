# Production audit fixes — 6 October 2026

Scope: findings in `PRODUCTION_AUDIT_2026-10-06.md`. Changes are uncommitted.
Frontend production rollout: Vercel `dpl_4xWu79Zgdcb86iwTE2X8P6tpauG3`, serving
https://jobmiter.com. Backend: production `famous-badger-815`.

## Fixes and their behavior

| Finding                                                                          | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Evidence                                                                                                                                     |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing Palantir minimum, language and clearance; Foreland treated as employer   | Classify Foreland as an aggregator; follow one validated ATS Apply link; permit bounded 2 MB downloads on public vacancy pages. Retain primary text and normalize every qualification with a source quote.                                                                                                                                                                                                                                                                                                                                                                                                        | Live verifier now reaches Lever and reads four years, Hebrew fluency and clearance eligibility. Production record was repaired.              |
| UpNEXT GPA/transcript/academic requirements discarded                            | Preserve full academic wording and retain source-backed GPA/transcript/clearance conditions even when model grouping omits them. Keep conditions the profile cannot prove unknown.                                                                                                                                                                                                                                                                                                                                                                                                                                | Production UpNEXT has academic background, GPA 85 and transcript conditions. No universal bachelor requirement is invented.                  |
| Empty requirements gave strong confidence                                        | Explicit complete/incomplete requirement state. Strong requires completed primary normalization, validated evidence and satisfied mandatory conditions. Incomplete extraction and undisclosed requested salary remain partial/possible.                                                                                                                                                                                                                                                                                                                                                                           | Regression tests cover missing/truncated text, invalid quotes, invented skill/numeric claims, experience and salary.                         |
| CV history broadened desired roles                                               | Desired roles alone determine professional scope. CV history contributes capability evidence within that scope. Remove software/commerce expansion; keep mobile and security scope explicit.                                                                                                                                                                                                                                                                                                                                                                                                                      | Mobile-only, career-change and specialty regressions pass.                                                                                   |
| React alternatives and English communication marked unknown                      | Recognize exact skill aliases inside source sentences. OR lists accept an alternative; conjunctions require all named skills. Do not flatten mixed AND/OR groups. Longest alias preserves React Native, C++ and other distinct skills. Fully recognized skill-only conditions in the miscellaneous bucket use the same OR/AND evidence; numeric, clearance and mixed non-skill conditions stay unknown. Language communication uses recorded proficiency; combined Hebrew/English conditions check both languages, including their individual required levels. A skill never proves a professional certification. | Regression examples include actual WeDev-style prose, ReactJS + TypeScript, React Native, and mixed alternatives.                            |
| Junior jobs outranked appropriate senior roles                                   | Larger penalties for large seniority gaps; gaps over one level cannot be strong. Experience minima come from explicit source ranges, with 3–5+ interpreted as minimum 3.                                                                                                                                                                                                                                                                                                                                                                                                                                          | Matching-level versus junior ranking and range regressions pass.                                                                             |
| Bilingual daily searches split the cache                                         | Canonicalize approved English/Hebrew job-title labels and aliases before hashing. Atomic daily claims remain. Distinct specialties keep distinct identities.                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Software Engineer / Hebrew / combined bilingual labels share a key; Backend and Frontend differ.                                             |
| Jerusalem/non-tech/entry-level discovery weak                                    | Shared coarse region and career-level facets prioritize the relevant demand. Search prompts include Hebrew titles, local boards and training/no-experience postings. Exact radius, salary and CV are excluded from paid cache identity.                                                                                                                                                                                                                                                                                                                                                                           | Coverage verification and resulting feed counts recorded below. No guarantee that every profile has a suitable vacancy.                      |
| Eon reachable ATS source considered unknown                                      | Exact ATS tenant can establish company identity when the company label is rendered on the client. Preserve explicit identity replacement, closure and challenge rules.                                                                                                                                                                                                                                                                                                                                                                                                                                            | The audited Eon URL now redirects to an ATS removal error, so production marks it closed rather than borrowing another vacancy's Apply link. |
| Browser interruption left resumes processing                                     | Registration atomically queues an internal worker. A ten-minute lease prevents duplicate workers. A five-minute watchdog recovers stalls; three automatic attempts end in an actionable failure.                                                                                                                                                                                                                                                                                                                                                                                                                  | Queue, duplicate claim, owner retry and watchdog tests pass.                                                                                 |
| Schema failures lost useful diagnostics; old image CVs excluded from deep review | Cache text before analysis, retry cached text, increase structured output budget and persist stage/failure/response diagnostics. Text-only repairs never import data into approved profiles. Failed uploads have Retry in onboarding and the library.                                                                                                                                                                                                                                                                                                                                                             | Cached-text failures and three textless documents repaired in production; older failures attempted separately.                               |
| Exhausted OpenAI credits looked like ordinary rate limits                        | Distinguish billing/authentication outages and open a one-hour shared circuit before spending another user's search budget. Existing daily cache claims remain reusable.                                                                                                                                                                                                                                                                                                                                                                                                                                          | Billing classification and no-additional-budget regression pass.                                                                             |
| Midnight pending state falsely implied a search                                  | Separate waiting, queued, running, completed and failed. Only real queued/running work animates. Prior completion remains completion across midnight.                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Backend and bilingual panel regressions pass.                                                                                                |
| Location hints queried deleted match rows                                        | Persist at most twenty current-profile location-only exclusion summaries; remove them when no longer applicable and during account deletion.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Empty-state reads use the bounded summaries rather than discarded matches.                                                                   |
| Admin auto-paged all users and scanned capped history in reactive queries        | Indexed server name/email search, twenty lightweight rows per page, shared cached overview/cohort snapshots. Background actions read indexed bounded pages without the 1,001/5,001 scan caps. Reconciliation reuses identity catalogs per page.                                                                                                                                                                                                                                                                                                                                                                   | 10,000-account integration test proves indexed lookup, bounded pages and uncapped totals. This is not a 10,000-concurrent-user load test.    |
| Search completion confused inventory insertion with usable matches               | Count accepted candidates only when their source, freshness and requester match qualify; persist separate strong/partial counts. Track source normalization as a distinct AI operation.                                                                                                                                                                                                                                                                                                                                                                                                                           | Regressions and production coverage measurements distinguish candidates, inserted jobs and accepted matches.                                 |

## Additional faults found while verifying the fixes

- HTTP transport had been using the canonical deduplication URL, removing `www`
  and trailing slashes that some servers redirect back to. Transport now preserves
  those details and still validates each public redirect. A bounded pass targets
  353 records affected by redirect, page-size or inferred identity failures. The 2 MB hard cap applies to employer
  pages too; source classification cannot impose a smaller transport allowance.
- Translated employer names and client-rendered ATS labels could cause a false
  closure. Matching structured descriptions can establish the employer's own
  bilingual introduction. An unresolved identity mismatch stays unknown;
  explicit vacancy removal/replacement stays closed.
- Company biographies could become experience minima; “Apply Today” could become
  a publication date. Candidate requirements and explicit publication signals
  are now required. Unsupported stored page dates are retracted on reverification.
- Hard-killed searches could retain a cache lease indefinitely. A bounded
  five-minute watchdog recovers runs older than ten minutes, releases reservations
  and cache leases, and records a failure. Normalization has an eight-minute
  cutoff. A failed daily search gets at most one support retry under normal budgets.
- Generic pipeline failures discarded their stack. They now persist the original
  diagnostic message and stack; the failure state takes precedence over an older
  completion so the UI cannot report success for a failed latest attempt.

- Final scheduler readback exposed one-second timeouts on 32-job full-feed
  rebuild pages. Reduce them to eight jobs and chain every page. Skill detection
  now scans a compiled combined lexicon once per sentence rather than scanning
  every alias separately. On 1,804 stored requirement sentences, local matching
  results were unchanged; CPU time fell from 273 ms to 10 ms. A complete production readback found 3,278 successful matching operations and
  zero failures after rollout.

## Validation

- `npm run check`: passes.
- `npm test`: 548 tests pass after the final backend fixes.
- Development deployment `glorious-mallard-885`: succeeds.
- `npm run build -- --webpack`: passes locally. Local Turbopack worker-port
  creation is blocked by the execution environment.
- Vercel production `npm run build` with Turbopack: passes, including successful
  browser/server Sentry source-map uploads.
- React Doctor: no React diagnostics; five warnings about bounded sequential
  backend loops. Transactional database work stays sequential deliberately.
- No browser tests, following the owner's preference. Live authenticated server
  queries and public source requests provide production verification.

## Production repair and remaining limits

Affected jobs/sources/resumes were backed up privately before repair. No CV text
or account identifiers are included in this document. The initial 64-source
pass returned 59 active, three closed, one unknown and one verification failure.
The additional 353-source pass, including a targeted page-size retry, returned
97 verified active, 29 closed, 192 unknown and 35 verification failures. Across
both passes, 416 distinct sources were rechecked. The additional pass recovered
89 sources that had not previously been verified active. Twenty of the 27
page-size retries became verified active; only one still exceeds the 2 MB cap.
The other failures include generic destinations, access challenges and transient
HTTP/timeout errors. None of those cases is promoted blindly to an active vacancy.

Final document readback: 96 resumes (33 ready, 63 awaiting confirmation), every
one with cached text and none failed or processing. Repairs include three
textless documents, two recent schema failures, five older failures and the
previously stalled document. Approved profiles were not overwritten. There were
106 primary-normalized jobs, 47 complete and 59 honestly incomplete. All 120
accounts at readback had indexed admin search text; overview/cohort reads and
user pagination/search succeeded. The current snapshot was generated.

All ten targeted empty-profile searches completed after one bounded retry of
the previously failed run. They returned 51 candidates and inserted 32 jobs
across the pass; none qualified for its requester at completion. Historical
insertion counts are not rewritten as accepted matches after source repairs.
The original error lacked a stack, so its historical root cause is unknown;
it did not recur on the retry. Future generic failures persist the original
stack and error message.

Final feed readback covers all 85 currently completed profiles: every query
succeeded, 77 feeds were populated and eight were empty, with 347 displayed
pairs. In the original 75-profile cohort, 67 feeds were populated versus 65
before repair, eight were empty and 304 pairs were displayed versus 282 before.
All displayed pairs remained partial; none passed full-confidence requirements.
The false Palantir strong matches disappeared and contradictory English
communication assessments dropped to zero. The five Vue-or-React unknown assessments for React holders were also
corrected: final readback finds zero. Eight other unknown React OR conditions
remain for profiles without the required alternative; they are not treated as
contradictions. Counts are multi-transaction readbacks, not a frozen snapshot
of concurrent account activity.

The 6 October cache readback covered 31 runs and 30 non-manual fingerprints:
zero duplicate completed fingerprint groups, one failed-run retry group, no
running or stale runs, and no audit cap reached. Canonical bilingual identity
and budget/circuit behavior are additionally covered in regression tests.

Admin subscriptions now have bounded request-time work. Background metrics still
assemble paginated history rather than maintaining fully incremental counters.
Monitor refresh duration and read cost as event history grows; concurrency,
provider capacity and real hiring outcomes remain separate from the synthetic
10,000-account test. Suitable local vacancies cannot be created by changing a
score threshold. Unknown/blocked/removed sources stay excluded or uncertain.

## Owner browser checks

1. Open admin Users, search for an existing name/email, and load the next page.
   Overview/cohorts should show a snapshot without waiting for every account.
2. Check a profile with React and English: an OR requirement listing React should
   be met when React is an allowed alternative; a combined English/Hebrew
   requirement should reflect both recorded proficiency levels.
3. Check desired-role and seniority changes: mobile-only preferences should not
   silently broaden into full-stack/security; an appropriate senior role should
   outrank a substantially junior role when other evidence is comparable.
4. Upload a resume, leave the page immediately, and return later. Processing
   should complete independently of the tab. A failed extraction should offer
   Retry. Approved profile changes still require review/confirmation.
5. Check empty feeds and latest failures: waiting should not animate a search,
   and a failed latest attempt should not be labelled completed because of an
   older success. Unavailable/uncertain sources must not appear as active jobs.

Final deployment verification: all 3,278 matching operations in the final
rebuild succeeded; none remained pending or failed. The 85-feed readback after
the last deployment confirmed zero known-React OR contradictions and zero
contradictory English assessments. No browser tests, commits or pushes were
performed. Further product work should prioritize dependable Jerusalem/Beit
Shemesh and non-tech vacancy sources and measure requester-qualified yield.
