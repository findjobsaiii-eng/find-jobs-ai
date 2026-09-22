/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("email preferences", () => {
  it("defaults to daily and lets only the signed-in user change frequency", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "candidate@example.com" }),
    );
    const signedIn = t.withIdentity({
      subject: `${userId}|test`,
      issuer: "https://test.example",
      tokenIdentifier: `https://test.example|${userId}`,
    });

    await expect(t.query(api.emailPreferences.getMine, {})).rejects.toThrow();
    await expect(
      signedIn.query(api.emailPreferences.getMine, {}),
    ).resolves.toEqual({ frequency: "daily" });
    await signedIn.mutation(api.emailPreferences.updateFrequency, {
      frequency: "never",
    });
    await expect(
      signedIn.query(api.emailPreferences.getMine, {}),
    ).resolves.toEqual({ frequency: "never" });
  });
});
