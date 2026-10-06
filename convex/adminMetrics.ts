import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  computeOverview,
  computeDecisionMetrics,
  type MetricsRows,
} from "./adminMetricsModel";

const tableValidator = v.union(
  v.literal("users"),
  v.literal("jobSearchRuns"),
  v.literal("dailyDiscoveryAudits"),
  v.literal("jobDiscoveries"),
  v.literal("jobs"),
  v.literal("jobMatches"),
  v.literal("userActivity"),
  v.literal("productEvents"),
  v.literal("emailDeliveryEvents"),
  v.literal("adminMemberships"),
);

// Each transaction reads one bounded page; large resumes/provider payloads never leave it.
export const readPage = internalQuery({
  args: {
    table: tableValidator,
    cursor: v.union(v.string(), v.null()),
    start: v.number(),
    end: v.number(),
    dayKey: v.string(),
  },
  returns: v.object({
    json: v.string(),
    cursor: v.string(),
    done: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const opts = { cursor: args.cursor, numItems: 100 };
    const historyStart = args.end - 9 * 7 * 86_400_000;
    const page =
      args.table === "jobSearchRuns"
        ? await ctx.db
            .query("jobSearchRuns")
            .withIndex("by_startedAt", (q) =>
              q.gte("startedAt", args.start).lt("startedAt", args.end),
            )
            .paginate(opts)
        : args.table === "dailyDiscoveryAudits"
          ? await ctx.db
              .query("dailyDiscoveryAudits")
              .withIndex("by_dayKey_and_status", (q) =>
                q.eq("dayKey", args.dayKey),
              )
              .paginate(opts)
          : args.table === "jobDiscoveries"
            ? await ctx.db
                .query("jobDiscoveries")
                .withIndex("by_discoveredAt", (q) =>
                  q
                    .gte("discoveredAt", args.start)
                    .lt("discoveredAt", args.end),
                )
                .paginate(opts)
            : args.table === "jobs"
              ? await ctx.db
                  .query("jobs")
                  .withIndex("by_firstDiscoveredAt", (q) =>
                    q
                      .gte("firstDiscoveredAt", args.start)
                      .lt("firstDiscoveredAt", args.end),
                  )
                  .paginate(opts)
              : args.table === "jobMatches"
                ? await ctx.db
                    .query("jobMatches")
                    .withIndex("by_creation_time", (q) =>
                      q
                        .gte("_creationTime", args.start)
                        .lt("_creationTime", args.end),
                    )
                    .paginate(opts)
                : args.table === "productEvents"
                  ? await ctx.db
                      .query("productEvents")
                      .withIndex("by_occurredAt", (q) =>
                        q
                          .gte("occurredAt", historyStart)
                          .lt("occurredAt", args.end),
                      )
                      .paginate(opts)
                  : args.table === "emailDeliveryEvents"
                    ? await ctx.db
                        .query("emailDeliveryEvents")
                        .withIndex("by_occurredAt", (q) =>
                          q
                            .gte("occurredAt", args.start)
                            .lt("occurredAt", args.end),
                        )
                        .paginate(opts)
                    : await ctx.db
                        .query(args.table)
                        .withIndex("by_creation_time")
                        .paginate(opts);
    const rows = page.page.map((doc) => {
      const fields = [
        "_id",
        "_creationTime",
        "userId",
        "startedAt",
        "status",
        "dayKey",
        "discoveredAt",
        "jobId",
        "firstDiscoveredAt",
        "lastSeenAt",
        "lastMeaningfulActionAt",
        "event",
        "type",
        "occurredAt",
        "active",
      ];
      return Object.fromEntries(
        fields.flatMap((field) =>
          field in doc ? [[field, doc[field as keyof typeof doc]]] : [],
        ),
      );
    });
    return {
      json: JSON.stringify(rows),
      cursor: page.continueCursor,
      done: page.isDone,
    };
  },
});

export const getTrackingStart = internalQuery({
  args: {},
  returns: v.union(v.number(), v.null()),
  handler: async (ctx) =>
    (await ctx.db.query("productEvents").withIndex("by_occurredAt").first())
      ?.occurredAt ?? null,
});

export const store = internalMutation({
  args: {
    dayKey: v.string(),
    start: v.number(),
    end: v.number(),
    overviewJson: v.string(),
    decisionJson: v.string(),
    startedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const previous = await ctx.db
      .query("adminMetricSnapshots")
      .withIndex("by_key", (q) => q.eq("key", args.dayKey))
      .unique();
    if (previous && previous.generatedAt > args.startedAt) return null;
    const values = {
      key: args.dayKey,
      start: args.start,
      end: args.end,
      overviewJson: args.overviewJson,
      decisionJson: args.decisionJson,
      generatedAt: Date.now(),
      refreshingAt: undefined,
    };
    if (previous)
      await ctx.db.patch("adminMetricSnapshots", previous._id, values);
    else await ctx.db.insert("adminMetricSnapshots", values);
    return null;
  },
});

export const refresh = internalAction({
  args: { dayKey: v.string(), start: v.number(), end: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    const tables = [
      "users",
      "jobSearchRuns",
      "dailyDiscoveryAudits",
      "jobDiscoveries",
      "jobs",
      "jobMatches",
      "userActivity",
      "productEvents",
      "emailDeliveryEvents",
      "adminMemberships",
    ] as const;
    const keys = [
      "users",
      "runs",
      "audits",
      "discoveries",
      "jobs",
      "matches",
      "activity",
      "events",
      "emailEvents",
      "adminMemberships",
    ] as const;
    const entries = await Promise.all(
      tables.map(async (table, index) => {
        const rows: unknown[] = [];
        let cursor: string | null = null;
        while (true) {
          const page: { json: string; cursor: string; done: boolean } =
            await ctx.runQuery(internal.adminMetrics.readPage, {
              ...args,
              table,
              cursor,
            });
          rows.push(...(JSON.parse(page.json) as unknown[]));
          if (page.done) break;
          cursor = page.cursor;
        }
        return [keys[index], rows];
      }),
    );
    const rows = Object.fromEntries(entries) as MetricsRows;
    rows.trackingStartedAt = await ctx.runQuery(
      internal.adminMetrics.getTrackingStart,
      {},
    );
    await ctx.runMutation(internal.adminMetrics.store, {
      ...args,
      startedAt,
      overviewJson: JSON.stringify(computeOverview(rows, args)),
      decisionJson: JSON.stringify(
        computeDecisionMetrics(rows, { now: args.end }),
      ),
    });
    return null;
  },
});

export const refreshRecent = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const snapshots = await ctx.db
      .query("adminMetricSnapshots")
      .withIndex("by_generatedAt")
      .order("desc")
      .take(3);
    for (const snapshot of snapshots) {
      if ((snapshot.refreshingAt ?? 0) > Date.now() - 10 * 60_000) continue;
      await ctx.db.patch("adminMetricSnapshots", snapshot._id, {
        refreshingAt: Date.now(),
      });
      await ctx.scheduler.runAfter(0, internal.adminMetrics.refresh, {
        dayKey: snapshot.key,
        start: snapshot.start,
        end: snapshot.end,
      });
    }
    return null;
  },
});
