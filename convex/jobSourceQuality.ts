export type JobSourceTier = "employer" | "ats" | "job_board" | "aggregator";

export type JobSourceFamily =
  | "employer_direct"
  | "ats_direct"
  | "major_job_board"
  | "other_reputable"
  | "aggregator";

const ATS_DOMAINS = [
  "comeet.co",
  "comeet.com",
  "greenhouse.io",
  "lever.co",
  "myworkdayjobs.com",
  "smartrecruiters.com",
  "ashbyhq.com",
  "recruitee.com",
  "workable.com",
  "bamboohr.com",
  "applytojob.com",
  "teamtailor.com",
  "successfactors.com",
  "icims.com",
  "oraclecloud.com",
  "dayforcehcm.com",
] as const;

const MAJOR_JOB_BOARD_DOMAINS = [
  "drushim.co.il",
  "jobmaster.co.il",
  "alljobs.co.il",
  "jobify360.co.il",
  "linkedin.com",
  "indeed.com",
] as const;

const OTHER_REPUTABLE_DOMAINS = [
  "glassdoor.com",
  "mploy.co.il",
  "jobnet.co.il",
  "gotfriends.co.il",
  "ethosia.co.il",
  "nisha.co.il",
  "dialog.co.il",
  "sqlink.com",
  "experis.co.il",
  "manpower.co.il",
  "jobs.lhh.co.il",
] as const;

const AGGREGATOR_DOMAINS = [
  "jobswipe.co",
  "trabajo.org",
  "bebee.com",
  "secrethunter.io",
  "jooble.org",
  "jobhunt.co.il",
] as const;

export const DISCOVERY_SOURCE_FAMILIES = [
  "employer/ATS",
  "Jobify",
  "Drushim",
  "JobMaster",
  "AllJobs",
  "LinkedIn",
  "Indeed Israel",
] as const;

export const DISCOVERY_SOURCE_GUIDANCE =
  "Prefer recent employer or ATS sources; major reputable job boards and recruiting agencies are acceptable.";

function hostMatches(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function matchesAny(hostname: string, domains: readonly string[]) {
  return domains.some((domain) => hostMatches(hostname, domain));
}

export function classifyJobSource(
  hostname: string,
  declared?: "employer" | "ats" | "job_board" | "other",
): {
  sourceTier: JobSourceTier;
  sourceFamily: JobSourceFamily;
  sourceLabel: string;
} {
  const host = hostname.toLocaleLowerCase("en-US").replace(/^www\./u, "");
  if (matchesAny(host, ATS_DOMAINS)) {
    return {
      sourceTier: "ats",
      sourceFamily: "ats_direct",
      sourceLabel: "ATS",
    };
  }
  if (matchesAny(host, MAJOR_JOB_BOARD_DOMAINS)) {
    const label = hostMatches(host, "jobify360.co.il")
      ? "Jobify"
      : hostMatches(host, "drushim.co.il")
        ? "Drushim"
        : hostMatches(host, "jobmaster.co.il")
          ? "JobMaster"
          : hostMatches(host, "alljobs.co.il")
            ? "AllJobs"
            : hostMatches(host, "linkedin.com")
              ? "LinkedIn"
              : "Indeed";
    return {
      sourceTier: "job_board",
      sourceFamily: "major_job_board",
      sourceLabel: label,
    };
  }
  if (matchesAny(host, OTHER_REPUTABLE_DOMAINS)) {
    return {
      sourceTier: "job_board",
      sourceFamily: "other_reputable",
      sourceLabel: host,
    };
  }
  if (matchesAny(host, AGGREGATOR_DOMAINS) || declared === "other") {
    return {
      sourceTier: "aggregator",
      sourceFamily: "aggregator",
      sourceLabel: host,
    };
  }
  if (declared === "ats") {
    return { sourceTier: "ats", sourceFamily: "ats_direct", sourceLabel: host };
  }
  if (declared === "job_board") {
    return {
      sourceTier: "job_board",
      sourceFamily: "other_reputable",
      sourceLabel: host,
    };
  }
  return {
    sourceTier: "employer",
    sourceFamily: "employer_direct",
    sourceLabel: host,
  };
}

export function sourcePriority(tier: JobSourceTier) {
  return { employer: 1, ats: 2, job_board: 3, aggregator: 4 }[tier];
}

export type SourceYieldGroup =
  | "Employer careers"
  | "ATS"
  | "Drushim"
  | "JobMaster"
  | "AllJobs"
  | "Jobify"
  | "LinkedIn"
  | "Indeed"
  | "Recruiting agencies"
  | "Aggregators"
  | "Other secondary sources";

const RECRUITING_AGENCY_DOMAINS = [
  "gotfriends.co.il",
  "ethosia.co.il",
  "nisha.co.il",
  "dialog.co.il",
  "sqlink.com",
  "experis.co.il",
  "manpower.co.il",
  "jobs.lhh.co.il",
] as const;

export function sourceYieldGroup(
  hostname: string,
  declared?: JobSourceTier,
): SourceYieldGroup {
  const source = classifyJobSource(
    hostname,
    declared === "aggregator" ? "other" : declared,
  );
  if (source.sourceFamily === "employer_direct") return "Employer careers";
  if (source.sourceFamily === "ats_direct") return "ATS";
  if (source.sourceFamily === "aggregator") return "Aggregators";
  if (source.sourceLabel === "Drushim") return "Drushim";
  if (source.sourceLabel === "JobMaster") return "JobMaster";
  if (source.sourceLabel === "AllJobs") return "AllJobs";
  if (source.sourceLabel === "Jobify") return "Jobify";
  if (source.sourceLabel === "LinkedIn") return "LinkedIn";
  if (source.sourceLabel === "Indeed") return "Indeed";
  const host = hostname.toLocaleLowerCase("en-US").replace(/^www\./u, "");
  if (RECRUITING_AGENCY_DOMAINS.some((domain) => hostMatches(host, domain))) {
    return "Recruiting agencies";
  }
  return "Other secondary sources";
}
