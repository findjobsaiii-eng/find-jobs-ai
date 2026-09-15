export const APPLICATION_STATUSES = [
  "saved",
  "applied",
  "recruiter_contact",
  "phone_screen",
  "interview",
  "assignment",
  "final_interview",
  "offer",
  "rejected",
  "withdrawn",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export type ApplicationFilter = "all" | ApplicationStatus;

export function applicationStatusesInUse(
  statuses: ReadonlyArray<ApplicationStatus | undefined>,
) {
  const inUse = new Set(statuses);
  return APPLICATION_STATUSES.filter((status) => inUse.has(status));
}
