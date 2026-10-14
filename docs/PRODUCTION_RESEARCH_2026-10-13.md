# Production discovery research — 13 October 2026

The system delivers opportunities, but it is not yet a dependable source of
newly published, well-confirmed matches. This is an investigation, not a release
or production repair.

## Scope and confidence

Production `famous-badger-815`, inspected before 07:00 Asia/Jerusalem on
13 October. Today's scheduled hourly discovery window had not started; zero
searches today is not evidence of scheduler failure. The last complete day is
12 October. Local code at the completed inspection: `9cdb479`.

Read bounded snapshots of 143 profiles, 1,488 jobs, 1,699 sources, 5,328 matches,
2,504 discovery records, 793 search runs, 185 search identities, 1,086 daily
user audits and the matching dictionaries. No table reached the 10,000-row cap.
These are several transactions, not a frozen database snapshot.

Replayed `loadSearchProfile` and `loadSuggestionMatches` locally against the
snapshots for all 131 completed profiles, using the repository's actual quality,
freshness, source and inventory rules. The local adapter implements the read
operations/index ordering used by these helpers; it does not connect to production
or mutate data. Counts below describe reconstructed **current** feeds, not
historical screen impressions. New materialized records alone do not prove a
new recommendation or that someone opened it.

An attempted CLI admin query with a synthetic identity was rejected by automatic
approval review and was not executed. Used the owner's normally authenticated
admin browser instead. Its selected live feed contained the same five job titles
and employers as the local replay control. This validates one control; it is not
131 live query confirmations.

No deployments, commits, pushes, paid AI calls, manual searches or production
repairs were performed. Browsing the ordinary admin UI can generate its normal
view/analytics records. Private snapshots and analysis scripts remain outside Git.

## What users actually get

- 124/131 completed profiles have current suggestions; seven have empty feeds.
- 595 displayed user/job pairs, representing 112 distinct jobs. Every pair is
  classified as **partial**, with no strong matches. This is preferable to
  claiming certainty, but it does not establish that recommendations are good.
- 590/595 pairs have at least one unconfirmed mandatory requirement. There are
  3,304 unknown skill assessments and 1,189 unknown additional-requirement
  assessments. Salary uncertainty affects 380 pairs. These counts are per pair,
  not distinct requirements or jobs.
- 344/595 displayed pairs use jobs with incomplete normalized requirements.
  Better employer extraction and structured evidence of candidate skills are
  needed; lowering uncertainty thresholds would conceal the problem.
- The seven empty feeds include teaching/training, content writing, quality
  inspection and business/financial roles. Three are Jerusalem teaching/training
  profiles. Improving only English tech discovery misses this audience.

### Last complete day's funnel

| 12 October stage                                              | Count |
| ------------------------------------------------------------- | ----: |
| Completed provider searches                                   |    50 |
| Returned candidates                                           |   272 |
| Accepted matches for the requesting profiles                  |    34 |
| New central inventory records                                 |    93 |
| Newly stored jobs currently present in any reconstructed feed |    10 |
| User/job pairs involving those 10 new jobs                    |    45 |
| Users whose current feeds contain those newly stored jobs     |    41 |

The 93 stored jobs include 23 closed, 25 unknown and one expired vacancy.
Those 49 have no displayable best source. Of the other 44, 21 have no eligible
partial-or-better, fresh match for any current profile under the replayed policy;
13 have a potential eligible profile match but are absent from the reconstructed
feeds. Feed ranking/slot limits, tracking status and materialization need to be
distinguished for that last group; eligibility in an offline evaluation is not
enough to assert an index defect. The one absent pair scoring above a user’s
current feed was correctly hidden because its application status is already
`applied` (CoreStruct Back-End Developer, score 81). This is a positive control
for avoiding suggestions the user has already acted on. Only ten newly stored
jobs reach current suggestions.

Separately, 785 currently retained match records were created on 12 October for
113 users, but just 61 of those records remain in reconstructed suggestions,
covering 46 users. Some refer to older central jobs. Do not use 785 as a count of
new jobs delivered. Deleted/recreated matches can also overstate novelty; there
is no durable historical first-visible ledger proving every addition was new to
that person for the first time.

## Freshly discovered does not mean freshly published

Of the 93 newly stored jobs on 12 October, 41 have no publication date, 49 have
an earlier date and three have a stored publication date of 12 October. None of
those three currently reaches a reconstructed feed. Two dates use ATS provenance;
one uses page-explicit provenance from a broad job-board page, which requires
job-specific confirmation. This is not proof of three first-ever Internet
publications on that day.

Across inventory first discovered since 6 October, 260/652 jobs have unknown
publication dates. Another 133 use `discovery_metadata` rather than a primary
publication-date source. Of the 112 distinct current suggestions, 44 have unknown
dates and only 16 have stored dates within the last 14 days.

The provider prompt prefers jobs from the **last 60 days**, not jobs published
today. Search snippets saying “Posted Today” can be stale or reflect refreshing;
independent search results encountered those ambiguities in this investigation.
Guaranteeing same-day coverage requires direct source monitoring and reliable
posting identity/date history. Some employers expose no reliable original date,
and search-index latency remains outside our control.

## Reliability and coverage limits

| Israel day | Completed searches | Failed searches | New inventory | Requester accepted matches |
| ---------- | -----------------: | --------------: | ------------: | -------------------------: |
| 6 October  |                 49 |               1 |           132 |                         20 |
| 7 October  |                 49 |               0 |           131 |                         31 |
| 8 October  |                 50 |               0 |           123 |                         34 |
| 9 October  |                 50 |               0 |           110 |                         24 |
| 10 October |                 34 |               5 |            63 |                         13 |
| 11 October |                  0 |               8 |             0 |                          0 |
| 12 October |                 50 |               0 |            93 |                         34 |

- **Confirmed outage:** all eight searches on 11 October failed with
  `provider_billing`; 129 daily user audit records report that reason. No new
  inventory or retained new match records that day. Successful searches resumed
  on 12 October. Add billing/quota alerts and source ingestion independent of
  paid model availability; the circuit breaker limits waste but cannot find jobs
  while the only discovery provider is unavailable.
- Read the non-secret production settings: global daily query limit **50**, run
  limit **1,000**. On 12 October, 19 users' audits report the query limit, 61 reuse,
  29 completed-empty, 21 completed and one no-search. Increasing budget alone
  will not fix poor candidate yield; allocate query slots to underserved cohorts
  and stop repeatedly retrieving old listings.
- Each provider query returns at most six candidates, with limited web-search
  tool calls and rotating roles. This is selective retrieval, not exhaustive
  employer coverage.
- No duplicate completed non-manual `(Israel day, fingerprint)` groups since
  6 October. Exact daily cache deduplication is working in this snapshot.

## Confirmed invalid application destination — fix first

A live admin feed shows “Junior Security Posture Researcher (Cortex Cloud)” at
Palo Alto Networks. Its best source is verified active, but its application URL
opens [recruiter advice](https://jobs.paloaltonetworks.com/en/senior-recruiter-palo-alto-networks-UK-tips),
not an application for that vacancy. The employer page is an article dated
14 October 2025.

Five source records across three stored jobs share that blog application URL;
one of those jobs is currently displayed to one user. Different senior/junior
vacancies have been attached to the same junior record after their final URL
became `/en`, indicating an identity/redirect failure as well as a bad link.

The parser considers application words anywhere in anchor labels/attributes and
returns the first matching URL without proving it belongs to the exact vacancy.
The generic-destination check does not recognize a locale-only `/en` landing
page. Fix that path classification, require vacancy identity at the application
destination, and stop merging distinct vacancies through a shared careers-page
redirect. The affected production records then need an explicitly approved
repair/re-verification. This task has not repaired them.

As a positive control, the displayed [Citadel SOC Analyst](https://job-boards.greenhouse.io/citadelcybersecurity/jobs/4979149101)
opens a real employer application page with substantive mandatory requirements.
Thus source delivery works for some jobs; the Palo Alto example is a specific
verified defect, not evidence that every link is bad.

## Independently found missing opportunities

| Active public posting absent from jobs and sources                                                                                                 | Evidence and fit limits                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Mobileye: Outstanding Graduate Algorithm Developer — Vision Localization](https://jobs.eu.lever.co/mobileye/83eaec09-649e-4ea6-b6c8-ace482eb2f59) | Employer ATS page and active application form; Ramat Gan hybrid, degree and Python/C++ requirements. The neighboring graduate ML role **is** already stored, so employer discovery is incomplete rather than entirely absent. |
| [Shortica: Full Stack Engineer](https://www.shortica.com/careers/13-fullstack)                                                                     | Employer application form, remote Israel, 5+ years, Node.js/PostgreSQL/Redis/Kubernetes. Not appropriate for juniors merely because it says full stack.                                                                       |

Neither source establishes original publication today. Manually modeled
requirements in the existing evaluator produce 16 potential partial profiles
for the Mobileye vacancy and 12 for Shortica; neither produces a strong match.
Those are illustrative screening results, not complete extraction or a claim
that those people satisfy every employer requirement, degree distinction or
academic-excellence condition.

The missing URLs are also absent from captured provider diagnostic excerpts.
However, those excerpts are truncated; we cannot reconstruct exactly which
retrieval/ranking choice omitted each listing. The six-result cap, role rotation,
50-query budget and lack of exhaustive employer-board polling are confirmed
coverage constraints, not a proved causal trace for these two omissions.

## Ordered improvements

1. Validate exact application destinations and locale redirects; repair the
   confirmed wrong links and vacancy merges with separate approval.
2. Add direct ATS/employer-board incremental ingestion, stable requisition IDs,
   first-seen history and publication-date provenance. Use the model for
   normalization/ranking rather than as the only retrieval source.
3. Alert on billing/quota failures; retain an independent discovery path and
   make the daily budget fair to empty-feed and regional/non-tech cohorts.
4. Improve requirements extraction and candidate evidence. Do not disguise
   100% partial matches as confidently good recommendations or calibrated
   hiring probabilities.
5. Track distinct first-visible additions per user/search, feed inclusion,
   source-open failures and repeated exposures. Measure new useful delivery,
   not stored-job or re-evaluated-match totals.

Remaining unknowns: exhaustive Internet coverage, true first publication dates
for undated/reposted listings, exact omitted-query causality, subjective fit and
hiring outcomes. These cannot be certified from the present records. There are
practical ways to reduce them, but no honest guarantee of finding every suitable
job on the day it first appears online.
