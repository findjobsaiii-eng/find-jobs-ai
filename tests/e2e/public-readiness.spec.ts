import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("optional analytics waits for consent and stays disabled after rejection", async ({
  page,
}) => {
  const posthogRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("posthog.com"))
      posthogRequests.push(request.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "בחירת עוגיות" }),
  ).toBeVisible();
  expect(posthogRequests).toHaveLength(0);

  await page
    .getByRole("button", { name: "דחיית עוגיות שאינן חיוניות" })
    .click();
  await page.reload();
  await expect(page.getByRole("region", { name: "בחירת עוגיות" })).toHaveCount(
    0,
  );
  expect(posthogRequests).toHaveLength(0);

  await page.getByRole("button", { name: "ניהול העדפות עוגיות" }).click();
  await page.getByRole("checkbox", { name: /ניתוח שימוש אנונימי/ }).check();
  await page.getByRole("button", { name: "שמירת בחירה" }).click();
  await expect.poll(() => posthogRequests.length).toBeGreaterThan(0);
});

for (const [language, privacyTitle, accessibilityTitle] of [
  ["he", "מדיניות פרטיות", "הצהרת נגישות"],
  ["en", "Privacy policy", "Accessibility statement"],
] as const) {
  test(`${language} legal routes render and expose language alternates`, async ({
    page,
  }) => {
    await page.goto(`/${language}/privacy`);
    await expect(
      page.getByRole("heading", { level: 1, name: privacyTitle }),
    ).toBeVisible();
    await expect(page.locator("main")).toHaveAttribute("lang", language);
    await expect(
      page.locator('link[rel="alternate"][hreflang="he"]'),
    ).toHaveAttribute("href", "https://jobmiter.com/he/privacy");
    await expect(
      page.locator('link[rel="alternate"][hreflang="en"]'),
    ).toHaveAttribute("href", "https://jobmiter.com/en/privacy");
    await page.goto(`/${language}/accessibility`);
    await expect(
      page.getByRole("heading", { level: 1, name: accessibilityTitle }),
    ).toBeVisible();
  });
}

test("keyboard skip link reaches main content", async ({ page }) => {
  await page.goto("/he/privacy");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: /דלג לתוכן/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("accessibility scan of public legal page", async ({ page }) => {
  await page.goto("/en/privacy");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
