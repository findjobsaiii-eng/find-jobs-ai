/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest, type TestConvex } from "convex-test";
import { expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function asUser(t: TestConvex<typeof schema>, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|test-session`,
    issuer: "https://test.example",
    tokenIdentifier: `https://test.example|${userId}`,
  });
}

it("keeps every admin query closed to ordinary signed-in users", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { email: "user@example.com" }),
  );
  const user = asUser(t, userId);

  expect(await user.query(api.admin.getAccess)).toMatchObject({
    authenticated: true,
    isAdmin: false,
  });
  await expect(
    user.query(api.admin.listSearches, {
      dayKey: "2026-09-24",
      start: 0,
      end: 1,
    }),
  ).rejects.toThrow(/ADMIN_REQUIRED/u);
  await expect(user.query(api.admin.listUsers)).rejects.toThrow(
    /ADMIN_REQUIRED/u,
  );
});

it("bootstraps an admin by exact normalized email and audits user views", async () => {
  const t = convexTest(schema, modules);
  const { adminId, subjectId } = await t.run(async (ctx) => ({
    adminId: await ctx.db.insert("users", {
      email: "admin@example.com",
      name: "Admin",
    }),
    subjectId: await ctx.db.insert("users", {
      email: "candidate@example.com",
      name: "Candidate",
    }),
  }));

  expect(
    await t.mutation(internal.admin.grantAdminByEmail, {
      email: " ADMIN@example.com ",
      grantedBy: "bootstrap test",
    }),
  ).toBe(adminId);

  const admin = asUser(t, adminId);
  expect(await admin.query(api.admin.getAccess)).toMatchObject({
    authenticated: true,
    isAdmin: true,
  });
  await admin.mutation(api.admin.recordUserView, {
    subjectUserId: subjectId,
  });

  await t.run(async (ctx) => {
    const event = await ctx.db.query("adminAuditEvents").unique();
    expect(event).toMatchObject({
      actorAdminUserId: adminId,
      subjectUserId: subjectId,
      action: "user.read_only_view_started",
    });
  });
});
