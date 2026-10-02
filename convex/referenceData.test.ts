/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { upsertSkillCatalogItem } from "./skillIdentity";

const modules = import.meta.glob("./**/*.ts");

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.referenceData.seedCatalog, {});
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { email: "skills@example.com" }),
  );
  const user = t.withIdentity({
    subject: `${userId}|test`,
    issuer: "https://test.example",
    tokenIdentifier: `https://test.example|${userId}`,
  });
  return { t, userId, user };
}

describe("skill dictionary onboarding", () => {
  it("reuses public identities for bilingual aliases instead of creating duplicate skills", async () => {
    const { t, user } = await setup();
    const first = await user.mutation(api.referenceData.addCustomCatalogItem, {
      kind: "skill",
      label: "כושר התבטאות",
      locale: "he",
    });
    const second = await user.mutation(api.referenceData.addCustomCatalogItem, {
      kind: "skill",
      label: "Verbal Communication",
      locale: "en",
    });
    expect(first.id).toBe(second.id);
    expect(first.isCustom).toBe(false);
    const react = await user.mutation(api.referenceData.addCustomCatalogItem, {
      kind: "skill",
      label: "ReactJS",
      locale: "en",
    });
    expect(react.labelEn).toBe("React");
    const found = await user.query(api.referenceData.searchCatalog, {
      kind: "skill",
      search: "כושר התבטאות",
    });
    expect(found[0].id).toBe(first.id);
    await t.mutation(internal.referenceData.seedCatalog, {});
    const aliases = await t.run((ctx) =>
      ctx.db
        .query("catalogSkillAliases")
        .withIndex("by_normalizedTerm", (q) =>
          q.eq("normalizedTerm", "reactjs"),
        )
        .take(2),
    );
    expect(aliases).toHaveLength(1);
  });

  it("accepts unfamiliar skills without an AI call and keeps raw entries private", async () => {
    const { t, user, userId } = await setup();
    const created = await user.mutation(
      api.referenceData.addCustomCatalogItem,
      { kind: "skill", label: "Floral Arrangement", locale: "en" },
    );
    const duplicate = await user.mutation(
      api.referenceData.addCustomCatalogItem,
      { kind: "skill", label: " floral   arrangement ", locale: "en" },
    );
    expect(created.id).toBe(duplicate.id);
    expect(created.isCustom).toBe(true);
    const stored = await t.run((ctx) => ctx.db.get("catalogItems", created.id));
    expect(stored).toMatchObject({
      ownerUserId: userId,
      conceptKey: "term:floral arrangement",
      labelEn: "Floral Arrangement",
      visibility: "private",
    });
    const otherId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "other@example.com" }),
    );
    const other = t.withIdentity({
      subject: `${otherId}|test`,
      issuer: "https://test.example",
      tokenIdentifier: `https://test.example|${otherId}`,
    });
    expect(
      await other.query(api.referenceData.searchCatalog, {
        kind: "skill",
        search: "Floral Arrangement",
      }),
    ).toEqual([]);
    const extractedId = await t.run((ctx) =>
      upsertSkillCatalogItem(ctx, userId, "React.js"),
    );
    const extracted = await t.run((ctx) =>
      ctx.db.get("catalogItems", extractedId!),
    );
    expect(extracted).toMatchObject({
      conceptKey: "skill:react",
      visibility: "public",
    });
  });

  it("rejects invalid custom entries and unauthenticated access", async () => {
    const { t, user } = await setup();
    await expect(
      t.mutation(api.referenceData.addCustomCatalogItem, {
        kind: "skill",
        label: "React",
        locale: "en",
      }),
    ).rejects.toThrow();
    await expect(
      user.mutation(api.referenceData.addCustomCatalogItem, {
        kind: "skill",
        label: "https://example.com",
        locale: "en",
      }),
    ).rejects.toThrow();
  });
});
