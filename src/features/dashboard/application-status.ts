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

export type ApplicationFilter =
  "all" | "applied" | "interviewing" | "offer" | "closed";

export const APPLICATION_FILTERS: ApplicationFilter[] = [
  "all",
  "applied",
  "interviewing",
  "offer",
  "closed",
];

export function matchesApplicationFilter(
  status: ApplicationStatus,
  filter: ApplicationFilter,
) {
  if (filter === "all") return true;
  if (filter === "applied") return status === "applied" || status === "saved";
  if (filter === "interviewing") {
    return [
      "recruiter_contact",
      "phone_screen",
      "interview",
      "assignment",
      "final_interview",
    ].includes(status);
  }
  if (filter === "offer") return status === "offer";
  return status === "rejected" || status === "withdrawn";
}
