# JOBMITER launch decisions — owner and Israeli legal counsel

Updated: 2026-09-23. This is a decision list, not a legal compliance certificate. The product is currently free and used to test market demand. The legal pages are drafts and must be reviewed by an Israeli lawyer before launch.

## BLOCKED: OWNER INPUT

- [ ] Identify the legal operator of JOBMITER. The owner stated there is no registered business at present. Decide what personal or entity name, registration number if applicable, and service address must be published. Do not invent an entity or number.
- [x] Contact mailbox supplied: `info@jobmiter.com`. Verify delivery, monitoring, and a response process for support, privacy, accessibility, and security reports.
- [ ] Set specific retention periods and deletion triggers for accounts, resumes and extracted text, profiles, searches, job matches, application notes, consent records, logs, Sentry events, PostHog events, and backups. Decide how retention applies to derived and shared job data.
- [ ] Verify the actual storage and processing countries, transfer mechanism, and current subprocessor terms for Vercel, Convex, Google OAuth/Maps, OpenAI, PostHog, Sentry, and Resend.
- [ ] Decide whether marketing emails will ever be offered. They are not offered in the current product; Resend sends only user-controlled job-match service notifications.
- [ ] Establish a verified process for access, correction, export, and deletion requests sent to the contact mailbox, including identity checks and completion records.
- [ ] Confirm whether database registration or notification is required under Israeli privacy law, whether a DPO must be appointed, and whether any accessibility exemption could apply. Obtain advice rather than assuming an exemption.
- [ ] Name the responsible person for security incidents, set escalation contacts and response timelines, and test the incident process.
- [ ] Review and rehearse `docs/INCIDENT_RESPONSE.md`; it is currently a draft, not evidence of incident response capability.

## Technical release gates still to verify

- [ ] Confirm the production Vercel project uses `jobmiter.com`, the correct production Convex URL and site URL, and stable Google OAuth callback. Do not use a preview deployment URL for production OAuth.
- [ ] Confirm Vercel environment variables and Convex secrets are present in the production scope without printing their values. Browser variables include Convex, Google Maps, PostHog host/token, and Sentry DSN. Convex server secrets include Google OAuth, JWT/JWKS, OpenAI, Resend, and SITE_URL. Sentry source-map upload requires its org, project and auth token in Vercel.
- [ ] Verify `jobmiter.com` in Resend, confirm `info@jobmiter.com` can send, and perform a delivery and unsubscribe-settings smoke test with a disposable account.
- [ ] Run a production browser check of cookie storage, PostHog network traffic before and after consent, and Sentry scrubbing. Check PDF/DOCX upload, signed storage access and failure handling.
- [ ] Enable and verify PostHog's project-level "Discard IP data" setting. The browser SDK's old `ip: false` setting no longer guarantees IP removal; the code requests GeoIP enrichment to be disabled but the connection itself can still expose the IP to the provider.
- [ ] Run a Convex backup export and a restore drill to an isolated preview deployment. Record recovery time, integrity check and backup retention; do not restore to production.
- [ ] Verify the new self-service deletion workflow against a disposable test account and monitor scheduled batch failures. Decide how shared job records, vendor data, logs and backups are deleted within approved retention rules.
- [ ] Run keyboard, screen-reader, 200% zoom, reduced-motion, Hebrew/English and mobile checks; axe and Lighthouse; fix findings. Only then state an accessibility conformance level.
- [ ] Have Israeli counsel approve the terms, privacy and cookie drafts, operator identity, age clause, AI disclosures, liability language, applicable law, cross-border transfers and privacy rights process.

## Current evidence and limits

Code review found Vercel, Convex, Google OAuth, Google Maps, OpenAI, PostHog, Sentry and Resend integrations. Resend sends user-controlled job-match service notifications. The site offers a data-copy request by email and self-service deletion of user-linked Convex data; complete erasure across all providers is not implemented. A current retention policy and backup restore proof do not exist in the repository.
