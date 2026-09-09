import type { Doc } from "./_generated/dataModel";

export const DEVELOPMENT_FIXTURE_VERIFICATION_METHOD =
  "development_fixture" as const;

export function isDevelopmentFixtureJob(
  job: Pick<Doc<"jobs">, "activityReason">,
) {
  return job.activityReason === "development_fixture_active";
}

export function isUserFacingJobSource(
  source: Pick<Doc<"jobSources">, "verificationMethod"> | null | undefined,
) {
  return Boolean(
    source &&
    source.verificationMethod !== DEVELOPMENT_FIXTURE_VERIFICATION_METHOD,
  );
}
