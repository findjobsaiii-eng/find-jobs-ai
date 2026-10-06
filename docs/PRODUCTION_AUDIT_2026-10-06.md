# Production audit — 6 October 2026

Production: `famous-badger-815`. Account snapshot: 01:36 Israel time; subsequent
reads and public-posting checks followed during the same audit. Code examined:
`b8c9705`. This was a read-only audit: no deployments, account changes, scheduled
searches, notifications, paid AI calls, or resume reprocessing were triggered.

The delivery pipeline works, but recommendation quality needs significant
improvement. The largest confirmed issue is incomplete job requirements, followed
by preference matching and requirement normalization. Healthy API responses and
high feed coverage do not establish that the recommendations are suitable.

## Evidence and coverage

Read all available rows in the relevant business tables using bounded pagination:
107 accounts, 87 profiles, 85 resume records, 842 jobs, 949 sources, 501 search
runs/usages, 51 shared search identities, 1,559 materialized matches, 1,366
discoveries, 200 daily audits, 75 daily attempts, 218 AI usage records, 13 deep
reviews, 11 tracked applications, 707 product events, and 100 job-email deliveries.
None of those table reads hit their audit cap.

Queried the deployed suggestions feed and canonical search profile for all 75
completed accounts. All 150 reads succeeded. Re-evaluated the captured job
inventory locally using the repository's matching, source, lifecycle and
freshness functions, with each deployed search profile. This performs no AI calls. One non-empty
account also had a locally eligible strong candidate absent from its feed; it
was the same incomplete Palantir record discussed below. Asynchronous reconciliation
or the multi-transaction snapshot may explain that discrepancy; it is not
confirmed as an index defect.
Inspected six distinct career extractions, including four cached-text CVs and two
legacy image-derived documents whose text is missing. Compared several public
job pages with stored requirements, including primary employer/ATS pages.

Also read 72-hour Convex health insights and a bounded 300-log recent window
(296 function completions). The scheduler check covers only its latest 501 rows;
it is explicitly not a complete scheduler history. Table reads were taken over
multiple transactions, so the audit is not a frozen snapshot of concurrent user
activity. CLI duration includes client startup/network time and is not reported
as backend latency. No browser testing was performed.

## What works

| Area                      | Evidence                                                                                                                     | Assessment                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Feed delivery             | 65/75 completed accounts receive suggestions; 63/73 excluding the two active admins                                          | Operationally working                                                            |
| Read reliability          | All 75 feed and 75 search-profile queries succeeded                                                                          | Working in this audit window                                                     |
| Rule consistency          | All 282 displayed user/job pairs agree with the captured job data and implemented matching rules                             | Consistent, not a semantic-quality guarantee                                     |
| Empty feeds               | None of the ten empty feeds had a currently eligible candidate under the same captured rules/inventory                       | No evidence that the index is hiding an otherwise populated feed                 |
| Exact daily cache         | No duplicate non-manual `(Israel day, fingerprint)` run groups from 30 September through 6 October                           | Recent exact-query deduplication is working                                      |
| Central reuse             | Daily audits include 19 explicit reuse outcomes and 57 skips because visible jobs already exist                              | Shared inventory is being reused                                                 |
| Feed deduplication        | No duplicate exact title/company pairs within an individual returned feed                                                    | Good in the checked feeds; distinct vacancies can legitimately share a title     |
| Job discovery             | 29 completed searches on 5 October returned 135 candidates and inserted 84 jobs                                              | Searches do find postings                                                        |
| Resume storage/extraction | 77/85 documents are ready or awaiting review; four cached-text comparisons broadly agree with extracted education/employment | Mostly working, with reliability and legacy-data exceptions                      |
| Deep review               | All 13 stored reviews completed; 11 are from non-admin accounts                                                              | Execution works; this does not certify every recommendation's accuracy           |
| Job email transport       | 99/100 sent job emails have delivery confirmations; 1 bounced, 0 complaints                                                  | Working; delivery says nothing about match relevance                             |
| Product use               | Excluding admins: 32 accounts opened job sources, 10 requested deep review, and 1 changed application status                 | Evidence of exploration; too little downstream data to establish hiring outcomes |

The 107 accounts include two active admins. Other internal/test accounts are not
reliably identified, so these figures are not a clean conversion cohort.

## Fix first: preserve employer requirements before claiming fit

### Palantir is the concrete false-confidence case

The stored Forward Deployed Software Engineer record has no required skills,
no language or education requirements, and a null experience minimum. Its
requirements text says the vacancy does not state a numeric minimum. It is the
only distinct job producing displayed `strong` matches: seven user/job pairs.
Five of those recipients report fewer than four years of experience, including
two reporting zero.

The actual [Palantir Lever posting](https://jobs.lever.co/palantir/c4442730-2926-41ad-8c0e-5e5a6b4d14ae)
lists four or more years of software development experience, Hebrew fluency and
security-clearance eligibility. Those facts are missing from our record and
therefore cannot be enforced by the matcher. The posting itself is real and has
an application path; the defect is our ingestion and confidence classification.

Our best source is a [Foreland listing](https://forelandjobs.com/jobs/j/forward-deployed-software-engineer-palantir-technologies-tel-aviv-isra-0963930a),
classified as an employer source. Foreland is a separate job platform, and its
page exposes the actual Lever application link. The cached Foreland text lacks
the missing requirements; its saved application URL is null. The source
classifier defaults unrecognized hosts to `employer_direct`.

**Fix:** resolve validated links to the original vacancy, retain its full
requirements, and distinguish confirmed-empty requirements from incomplete
extraction. Incomplete records must not become high-confidence matches merely
because their requirement arrays are empty. Classify unknown hosts conservatively;
do not label a job platform as the employer by default.

**Acceptance:** the original Palantir minimum/language/clearance requirements are
represented in job data; 0–3 year candidates do not get a strong match. A fetched
but incompletely parsed posting cannot silently claim complete eligibility.

### UpNEXT requirements are already cached but discarded

The [ERGO NEXT UpNEXT posting](https://job-boards.greenhouse.io/nextinsurance66/jobs/7979090003)
requires an academic background, a minimum GPA of 85, and an academic transcript.
Our job record has an empty education-requirements list and does not assess those
conditions. The cached source text already contains the GPA and transcript
requirements, so this is demonstrably a normalization gap, not just a fetch gap.

**Fix:** construct the normalized requirement set from fetched source evidence,
including academic/credential/numeric conditions. Do not treat a web-search
summary or technology list as a complete description of mandatory criteria.
Re-normalize affected stored jobs and rebuild their matches after the correction.
Do not infer a universal bachelor-degree requirement where the employer merely
says academic background; preserve the employer's actual condition.

## Fix next: intent and qualification reasoning

### Explicit preferences are broadened by CV history

A profile selecting only Mobile Developer receives general/full-stack roles and
a Security Engineer posting. The code includes current/past CV roles in the
wanted-family set and explicitly expands software into commerce and vice versa.
This also permits software recommendations for someone seeking a digital
commerce/operations career change.

**Fix:** desired roles determine the primary search/feed scope. CV evidence
validates capability within that scope. Put adjacent roles behind an explicit
choice or a separate clearly labelled section; do not silently redefine the
user's career preference. Add regression examples for mobile-only preferences,
career changes, and financial analyst versus SOC analyst.

Code: `convex/jobQuality.ts:552–600`.

### Known alternatives and duplicate language evidence become unknown

Across the checked feed pairs, 39 assessments mark a React alternative unknown
although the profile explicitly lists React. Examples include the
[WeDev requirement](https://job-boards.eu.greenhouse.io/wedev/jobs/4871703101)
listing React, Angular or Vue.js, and UpNEXT's React-or-Angular wording. Another
33 pairs mark English communication unknown while the language assessment in
the same job marks the English requirement met.

There are 275 partial pairs out of 282 displayed pairs (97.5%). Some uncertainty
is legitimate, but these examples create avoidable uncertainty and ranking noise.

**Fix:** represent requirements as typed conditions, with OR alternatives and
separate language, skill, credential, experience and preference evidence. Reuse
existing language evidence instead of treating it as an unrelated skill.
Recognize accepted credential wording and relevant evidence stored in education
fields, not only an exact credential string.

Code: `convex/jobRequirements.ts:274–341`.

### Seniority is too weak a ranking signal

A junior full-stack posting is shown to 35 of the 65 accounts with jobs. At least
two profiles reporting four or more years have a junior role ranked first. The
owner's lead/full-stack profile is one concrete example. A seniority mismatch
currently loses at most six score points, which skill overlap can readily exceed.

**Fix:** prioritize requested specialty and appropriate seniority before broad
keyword overlap. Keep genuinely useful junior/adjacent alternatives as labelled
fallbacks rather than presenting them as the primary recommendation. Salary
requirements cannot be declared satisfied when the posting lacks salary data.
Do not solve the partial/strong imbalance by simply lowering thresholds.

## Coverage is the next product bottleneck

Ten completed profiles receive no suggestions. Their roles are concentrated in
teaching/training, organizational psychology, administration, bookkeeping/HR,
content writing, medical administration and quality inspection. Eight of these
ten are in Jerusalem or Beit Shemesh. These accounts completed a search on
5 October with `completed_empty`, rather than never having been processed.

Of 842 job records, only 166 are verified active and 16 probably active; 491 are
unknown, 147 closed and 22 expired. Of the 84 jobs inserted on 5 October, 21 are
now verified active, 3 probably active, 43 unknown, 15 closed and 2 expired.
Twenty-two of the 63 distinct jobs actually displayed have no publication date.
Unknown dates should remain unknown, not be represented as recently published.

22/29 searches on 5 October produced zero accepted matches for the requesting
user, even though they added jobs to the shared inventory. A successful provider
response is not the same as a useful result. The stored `acceptedCount` measures
pipeline eligibility for that run; it is not identical to the eventual displayed
count, and does not include every benefit of reusing the central inventory.

A current [Eon Bookkeeper application page](https://job-boards.eu.greenhouse.io/eonio/jobs/4862997101)
is publicly available, while our source is `unknown` with
`job_identity_not_confirmed`. This warrants revisiting the identity check; it
does not prove that the HTTP body captured during the earlier check was identical
to today's page. Its stored experience minimum is five, while the posting uses
3–5+ years: numeric ranges also need normalization review. This role is in Tel
Aviv and asks for experience, so repairing it alone will not solve entry-level
Jerusalem coverage.

**Improve:** measure verified, suitable coverage per canonical role, career level
and region. Add Hebrew/local-board discovery for non-tech and entry-level demand.
Rotate a bounded set of shared role/region/seniority search facets, preserving
cross-user cache reuse rather than issuing a bespoke paid search per account.
Revisit reachable ATS sources that fail identity checks; preserve strict
closed/expired/bot-challenge handling rather than blindly accepting all unknowns.

## Cache works for exact identities, not all semantic equivalents

Recent exact fingerprints are deduplicated, and current profiles do not split a
single identical normalized role across multiple fingerprints. However, on
5 October both `software engineer` and `software engineer מהנדס תוכנה` ran as
separate provider searches with different fingerprints; each inserted zero jobs.
The current key includes literal role/alias strings rather than an approved
canonical role concept.

**Fix:** canonicalize bilingual/equivalent job-title aliases before constructing
the shared daily identity. Preserve distinct specializations; do not merge all
software roles merely because they are related. Keep atomic daily claims and
explicit bounded retries for failed searches. Historical duplicates exist before
30 September and should not be confused with current exact-cache behavior.

Code: `convex/jobDiscoveryModel.ts:374–425`, `convex/jobDiscovery.ts:792–878`.

## Resume reliability and observability

Seven documents are failed and one was processing for more than two hours with
no diagnostics when inspected. Two recent failures are `CV_SCHEMA_INVALID` after
successful PDF/DOCX text extraction. Their cached text is preserved, which is
better than older AI failures that lost useful extracted text.

Three legacy vision-processed documents are ready/awaiting review but have no
cached text. The current OCR-first code saves transcription before structured
analysis, but those older documents are not automatically repaired. Deep-review
selection excludes documents without text, so it cannot compare them properly.

The inspected plaintext extractions generally preserve employment/education
facts. Some profile values differ from CV extraction, with manual override fields
present; differences were not treated as proof that AI invented those facts.
Year-only or uncertain work dates need cautious treatment. Uploaded-document
status `needs_confirmation` is not itself proof that onboarding is incomplete;
75 profile records have completed onboarding.

**Fix:** make processing durable server work, queued atomically with document
registration, with owner checks at the public entry point and an internal worker.
Currently the browser separately calls `processResume` after registration, so an
interrupted flow can leave a document waiting without a worker. Add timeout/watchdog
recovery and a retry from already cached text. Retain structured failure reasons
in production; the current catch path saves only stages/codes and emits diagnostic
logs only with development tools enabled. Repair legacy textless documents as an
explicit small data job, without re-uploading files or overwriting approved profiles.

Relevant code: `src/features/profile/resume-onboarding.tsx:158`,
`src/features/profile/resume-library.tsx:115`, `convex/resumeActions.ts:595–635`,
`convex/jobReviews.ts:50–55`.

## Operational issues and scale

- The recent bounded log window contains no function errors. It cannot establish
  a global error-free history.
- 72-hour insights show four historical admin list read warnings. One call read
  28,672 documents and approximately 9.4 MB, largely repeated identity catalogs.
  The deployed API now exposes paginated user summaries. Do not count the older
  warnings as proof that the current pagination fix failed.
- Several functions have OCC retry warnings, including match reconciliation,
  search completion and email preparation. No permanent OCC failures were
  reported in the inspected insights.
- Five sampled recent provider failures from 3 October explicitly report no
  remaining OpenAI credits. Later searches on 4–6 October succeeded. Classifying
  these as ordinary rate limits obscures a billing/configuration outage: retries
  alone cannot fix zero credits.
- Recorded AI estimates total about $7.12 for 128 job-search responses, $0.23 for
  76 resume-extraction responses and $0.26 for 14 deep-review responses. These are
  incomplete historical estimates, not reconciled provider billing.
- At the day boundary, 71 feeds report `pending`, including all ten empty feeds,
  despite their previous-day completed attempts. The UI says it is already
  searching, though `pending` is not evidence of a queued/running worker. Distinguish
  completed-empty, waiting for the next schedule, queued and actually running.
  The new lightweight empty-state query looks for stored excluded matches, but
  reconciliation deletes non-displayable matches; all 1,559 captured match rows
  are eligible. Preserve bounded exclusion summaries if those hints are needed.
- Add actual post-match feed counts and confidence/empty-reason measurements.
  Provider completion, eligible candidates, displayed suggestions and strong
  recommendations should be separate metrics.
- Zero non-admin `job_saved` events and only three non-admin tracked applications
  (two applied, one offer) are recorded. That does not mean nobody applies through
  external links; it means tracked outcome data is sparse. Investigate the save/
  tracking flow and instrumentation before claiming strong downstream conversion.
- 10,000-user readiness is not demonstrated. Overview/cohort metrics retain
  1,001/5,001-row scan caps, and user search auto-pages through all accounts.
  Before growth, use indexed server search, bounded lightweight list rows and
  incrementally maintained daily/cohort summaries. Avoid raising scan caps and
  making the same work larger.

Health evidence: [production insights](https://dashboard.convex.dev/d/famous-badger-815?view=insights).

## Recommended order and acceptance checks

1. **Correct source requirements and confidence.** Hydrate primary vacancy text,
   preserve mandatory conditions, and repair/rebuild the affected job matches.
   Start with Palantir and UpNEXT as reproducible regression cases.
2. **Respect intent and normalize requirements.** Desired roles are primary;
   implement OR conditions, language reuse and evidence-aware confidence, then
   review seniority ranking with anonymized real examples.
3. **Improve underserved coverage.** Track verified suitable results for the ten
   empty profiles, particularly entry-level/non-tech Jerusalem demand. Measure
   user-level results, not just returned/inserted posting counts.
4. **Close extraction/recovery gaps.** Durable workers, detailed safe diagnostics,
   retry-from-text and an explicitly approved repair of legacy textless documents.
5. **Normalize semantic cache identities and operational states.** Merge approved
   bilingual equivalents, alert separately on exhausted credits, and stop showing
   active-search copy for idle waiting states.
6. **Prepare admin aggregates/search for growth.** Preserve accurate totals without
   full-table reads. Rehearse with 10,000 synthetic accounts before a scale claim.

Maintain a small reviewed benchmark of real, anonymized CV/profile/posting pairs:
clear fits, explicit preference mismatches, experience shortfalls, licenses/degrees,
language requirements, OR skills, career changes and uncertain evidence. Test both
false positives and false negatives. Keep the feed's core decisions deterministic;
use AI at extraction/normalization and on-demand deep review, rather than paying
for an AI judgment on every user/job pair.
