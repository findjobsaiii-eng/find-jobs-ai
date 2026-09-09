import { describe, expect, it } from "vitest";
import {
  classifyFreshness,
  evaluateSuggestionFreshness,
  normalizeDiscoveredPostingDate,
  selectOriginalPostingDate,
} from "./jobFreshness";

const NOW = Date.UTC(2026, 8, 9, 12);
const daysAgo = (days: number) =>
  new Date(NOW - days * 24 * 60 * 60 * 1_000).toISOString();

describe("job freshness", () => {
  it.each([
    [14, "very_fresh"],
    [15, "fresh"],
    [30, "fresh"],
    [31, "acceptable"],
    [60, "acceptable"],
    [61, "old"],
    [90, "old"],
    [91, "stale_for_suggestions"],
  ])("classifies %s elapsed days as %s", (days, bucket) => {
    expect(classifyFreshness(daysAgo(days), NOW).bucket).toBe(bucket);
  });

  it("excludes a posting older than 90 days without closing it", () => {
    expect(
      evaluateSuggestionFreshness({
        postedAt: daysAgo(91),
        lifecycleStatus: "verified_active",
        relevanceScore: 95,
        now: NOW,
      }),
    ).toMatchObject({ eligible: false, reason: "stale_posting" });
  });

  it("requires a strong deterministic match for 61–90 day postings", () => {
    expect(
      evaluateSuggestionFreshness({
        postedAt: daysAgo(70),
        lifecycleStatus: "verified_active",
        relevanceScore: 77,
        now: NOW,
      }).eligible,
    ).toBe(false);
    expect(
      evaluateSuggestionFreshness({
        postedAt: daysAgo(70),
        lifecycleStatus: "verified_active",
        relevanceScore: 78,
        now: NOW,
      }).eligible,
    ).toBe(true);
  });

  it("allows an unknown publication date without inventing one", () => {
    expect(
      evaluateSuggestionFreshness({
        postedAt: null,
        lifecycleStatus: "verified_active",
        relevanceScore: 60,
        now: NOW,
      }),
    ).toMatchObject({
      eligible: true,
      bucket: "freshness_unknown",
      ageDays: null,
    });
  });

  it("does not replace an older publication date during rediscovery", () => {
    expect(
      selectOriginalPostingDate(
        { postedAt: daysAgo(70), datePostedProvenance: "jobposting_jsonld" },
        { postedAt: daysAgo(2), datePostedProvenance: "discovery_metadata" },
      ).postedAt,
    ).toBe(daysAgo(70));
  });

  it("normalizes explicit relative discovery metadata once", () => {
    expect(normalizeDiscoveredPostingDate("2 weeks ago", NOW)).toBe(
      daysAgo(14),
    );
    expect(normalizeDiscoveredPostingDate("2 months ago", NOW)).toBe(
      daysAgo(60),
    );
  });
});
