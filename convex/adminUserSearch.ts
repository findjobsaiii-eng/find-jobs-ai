import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export async function refreshUserSearchText(
  ctx: MutationCtx,
  userId: Id<"users">,
) {
  const [user, profile] = await Promise.all([
    ctx.db.get("users", userId),
    ctx.db
      .query("candidateProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique(),
  ]);
  if (!user) return;
  const searchText = [user.email, user.name, profile?.preferredDisplayName]
    .filter(Boolean)
    .join(" ")
    .normalize("NFKC")
    .slice(0, 500);
  if (user.searchText !== searchText)
    await ctx.db.patch("users", user._id, { searchText });
}

export const rebuildPage = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("users")
      .withIndex("by_creation_time")
      .paginate({ cursor: args.cursor, numItems: 50 });
    for (const user of page.page) await refreshUserSearchText(ctx, user._id);
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.adminUserSearch.rebuildPage, {
        cursor: page.continueCursor,
      });
    return null;
  },
});
