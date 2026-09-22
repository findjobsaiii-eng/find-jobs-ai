/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("account deletion", () => {
  it("deletes only the caller's account, resume file and consent", async () => {
    const t = convexTest(schema, modules);
    const { userId, otherUserId, storageId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "first@example.com",
      });
      const otherUserId = await ctx.db.insert("users", {
        email: "second@example.com",
      });
      const storageId = await ctx.storage.store(
        new Blob(["private CV"], { type: "application/pdf" }),
      );
      await ctx.db.insert("resumeDocuments", {
        userId,
        storageId,
        fileName: "private.pdf",
        mimeType: "application/pdf",
        size: 10,
        status: "ready",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("legalConsents", {
        userId,
        termsVersion: "2026-09-23-draft-2",
        privacyVersion: "2026-09-23-draft-2",
        acceptedAt: Date.now(),
        marketingOptIn: false,
        marketingUpdatedAt: Date.now(),
      });
      await ctx.db.insert("emailPreferences", {
        userId,
        frequency: "weekly",
        updatedAt: Date.now(),
      });
      const sessionId = await ctx.db.insert("authSessions", {
        userId,
        expirationTime: Date.now() + 100000,
      });
      await ctx.db.insert("authRefreshTokens", {
        sessionId,
        expirationTime: Date.now() + 100000,
      });
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "google",
        providerAccountId: "private-id",
      });
      return { userId, otherUserId, storageId };
    });
    const currentUser = t.withIdentity({
      subject: `${userId}|test`,
      issuer: "https://test.example",
      tokenIdentifier: `https://test.example|${userId}`,
    });

    await expect(
      t.mutation(api.accountData.deleteMine, { confirmation: "DELETE" }),
    ).rejects.toThrow();
    await currentUser.mutation(api.accountData.deleteMine, {
      confirmation: "DELETE",
    });
    vi.useFakeTimers();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();

    await t.run(async (ctx) => {
      expect(await ctx.db.get("users", userId)).toBeNull();
      expect(await ctx.db.get("users", otherUserId)).not.toBeNull();
      expect(await ctx.storage.get(storageId)).toBeNull();
      expect(await ctx.db.query("resumeDocuments").collect()).toHaveLength(0);
      expect(await ctx.db.query("legalConsents").collect()).toHaveLength(0);
      expect(await ctx.db.query("emailPreferences").collect()).toHaveLength(0);
      expect(await ctx.db.query("authSessions").collect()).toHaveLength(0);
      expect(await ctx.db.query("authAccounts").collect()).toHaveLength(0);
      expect(await ctx.db.query("accountDeletionJobs").collect()).toHaveLength(
        0,
      );
    });
  }, 30000);
});
