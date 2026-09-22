# JOBMITER incident response draft

Updated: 2026-09-22. This runbook is untested. The owner must assign an incident lead, a backup operator and a monitored contact channel before launch. Reports can be sent to `info@jobmiter.com`; mailbox monitoring has not been verified.

1. **Detect and record.** Check Sentry events, Convex function errors, Vercel deployment logs, `/api/health`, and user reports. Record the first observed time, affected environment, affected users and the event IDs. Do not copy resume text, access tokens or full profiles into tickets or chat.
2. **Contain.** If account data may be exposed, restrict the affected feature or deployment, revoke exposed credentials in the provider consoles, and block affected API access. Do not delete evidence needed to establish the scope. Classify Convex deployment targets before any production change.
3. **Investigate.** Identify the entry point, accounts and data involved, duration, persistence and whether third-party systems received data. Use the minimum necessary access to logs. Check whether PostHog, Sentry, OpenAI, Convex, Google or Vercel are affected.
4. **Decide notifications.** Consult Israeli privacy counsel about statutory and contractual notification duties, recipients and timing. The owner has not assigned a DPO or incident lead; neither a notification threshold nor a legal deadline is asserted here.
5. **Recover.** Patch and test in a non-production environment; deploy only to the classified target. Restore from a verified backup if needed, recognizing that writes after the snapshot may be lost. A backup restore drill has not yet been completed.
6. **Verify and learn.** Confirm the affected flow, permissions, health endpoint and monitoring. Document root cause, exact changes, customer impact, remaining exposure and follow-up owners. Update the legal and retention documentation if processing changed.

Before launch, rehearse this process with a disposable account, a simulated Sentry alert and an isolated Convex restore. Record the exercise result in `docs/PROJECT_STATUS.md`.
