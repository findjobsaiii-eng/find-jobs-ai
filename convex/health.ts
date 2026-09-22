import { v } from "convex/values";
import { query } from "./_generated/server";

export const ping = query({
  args: {},
  returns: v.literal("ok"),
  handler: async () => "ok" as const,
});
