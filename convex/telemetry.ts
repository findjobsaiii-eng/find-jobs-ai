import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query } from "./_generated/server";

// Only the server-derived opaque ID, never account/profile attributes.
export const getCurrentUserId = query({
  args: {},
  returns: v.union(v.id("users"), v.null()),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    return userId && (await ctx.db.get("users", userId)) ? userId : null;
  },
});
