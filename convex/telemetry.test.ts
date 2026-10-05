/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
const modules = import.meta.glob("./**/*.ts");
it("returns only the authenticated user's ID and clears deleted/anonymous identities", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email: "candidate@example.com",
      name: "Candidate",
    }),
  );
  const user = t.withIdentity({ subject: `${userId}|test-session` });
  expect(await user.query(api.telemetry.getCurrentUserId)).toBe(userId);
  expect(await t.query(api.telemetry.getCurrentUserId)).toBeNull();
  await t.run((ctx) => ctx.db.delete("users", userId));
  expect(await user.query(api.telemetry.getCurrentUserId)).toBeNull();
});
